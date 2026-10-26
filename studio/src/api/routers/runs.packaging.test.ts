import { describe, it, expect, vi, beforeEach } from 'vitest';

// Sprint 6 Task 1 (R5): runs.packaging and runs.choosePackage. Same mock layout as runs.update-settings.test.ts.
const mocks = vi.hoisted(() => ({
  findLatestAttempt: vi.fn(),
  listStagesForRun: vi.fn(),
  patchStageOutput: vi.fn(),
  findPipelineRunById: vi.fn(),
  findChannelById: vi.fn(),
  resolvePendingApproval: vi.fn(),
}));

vi.mock('../../models/repositories/review-log.repository', async (orig) => ({ ...(await orig<object>()), listReviewLogsForRun: async () => [] }));
vi.mock('../../models/repositories/pipeline-run.repository', () => ({
  findPipelineRunById: mocks.findPipelineRunById,
  updatePipelineRun: vi.fn(),
  claimPlannerContractRecovery: vi.fn(),
  listRuns: vi.fn(),
  CANCELLED_BY_USER: 'Cancelled by user',
}));
vi.mock('../../models/repositories/channel.repository', () => ({ findChannelById: mocks.findChannelById }));
vi.mock('../../run-pipeline/pipeline-runner', () => ({ startPipelineInBackground: vi.fn(), continuePipelineInBackground: vi.fn() }));
vi.mock('../../notifications', async (orig) => ({ ...(await orig<object>()), resolvePendingApproval: mocks.resolvePendingApproval }));
vi.mock('../../models/repositories/pipeline-stage.repository', async (orig) => ({
  ...(await orig<object>()),
  findLatestAttempt: mocks.findLatestAttempt,
  listStagesForRun: mocks.listStagesForRun,
  patchStageOutput: mocks.patchStageOutput,
}));

import { runsRouter } from './runs';
import { PACKAGING_OUTPUT_VERSION, type PackagingOutput } from '../../packaging/build';
import { EIFFEL_SCRIPT, makeBrief, makeConcept } from '../../packaging/testkit';

const RUN_ID = '11111111-1111-4111-8111-111111111111';
const owner = { tenantId: 't1', userId: 'u1', role: 'owner' } as never;
const stranger = { tenantId: 't2', userId: 'u9', role: 'owner' } as never;
const member = { tenantId: 't1', userId: 'u2', role: 'member' } as never;

function packaging(over: Partial<PackagingOutput> = {}): PackagingOutput {
  const concept = makeConcept();
  return {
    version: PACKAGING_OUTPUT_VERSION,
    status: 'ready',
    reason: null,
    scriptHash: 'h',
    brief: makeBrief(),
    faceMode: 'none',
    typeface: 'stakes',
    titleLimit: 70,
    concepts: [concept],
    dropped: [],
    textCostUsd: 0.05,
    imageCostUsd: 0.02,
    packages: [
      {
        id: 'c1', device: 'stake', supportingDevice: 'scale', title: concept.title, question: concept.question,
        answeredAt: { chapter: 3, chapterTitle: 'Why Almost Destroyed', startSec: 40, label: 'x', quote: 'q' },
        recipe: { concept: concept.thumbnail, faceMode: 'none', typeface: 'stakes', typefaceFamily: 'Anton', prompt: 'SECRET PROMPT', imageModel: 'm' },
        lettering: { words: 'SOLD FOR SCRAP?', subline: null, sublineDropped: false, typeface: 'stakes', fontFamily: 'Anton', zone: 'top', lines: 1, mainPxFull: 150, mainPxFeed: 42, mainPxSidebar: 20, readableAtSidebar: true },
        files: { full: 'c1-full.jpg', feed: 'c1-feed.jpg', sidebar: 'c1-sidebar.jpg' },
        coldReader: { curiosity: 4, wouldClick: 'yes', guessedAbout: 'a tower' },
        imageCostUsd: 0.0065,
      },
    ],
    ...over,
  };
}

const stage = (over: Record<string, unknown>) => ({ id: 's', pipelineRunId: RUN_ID, attemptNumber: 1, status: 'completed', input: null, output: null, ...over });
const gateStages = (p: PackagingOutput | null, gateStatus = 'running') => [
  stage({ id: 'g1', stageName: 'gate1', output: { sanctionedScriptText: EIFFEL_SCRIPT } }),
  stage({ id: 'vg', stageName: 'video_generation', output: { durationSeconds: 120, chapterTimings: [{ title: 'Why Almost Destroyed', startSec: 41.2, endSec: 70 }] } }),
  stage({ id: 'g2', stageName: 'gate2', status: gateStatus, output: p ? { packaging: p } : null }),
];
const run = (over: Record<string, unknown> = {}) => ({ id: RUN_ID, tenantId: 't1', channelId: 'c1', status: 'paused_gate2', briefText: '', ...over });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findPipelineRunById.mockResolvedValue(run());
  mocks.findChannelById.mockResolvedValue({ id: 'c1', tenantId: 't1', ownerUserId: 'u1', isActive: true });
  mocks.listStagesForRun.mockResolvedValue(gateStages(packaging()));
  mocks.patchStageOutput.mockResolvedValue({});
});

describe('runs.packaging', () => {
  it('returns the view the app shows: question, answer place with the current time, urls, no file paths or prompts', async () => {
    const out = await runsRouter.createCaller(owner).packaging({ runId: RUN_ID });
    expect(out.pending).toBe(false);
    const view = out.view!;
    expect(view.packages).toHaveLength(1);
    expect(view.packages[0]).toMatchObject({ title: makeConcept().title, question: makeConcept().question, answeredAt: 'Chapter 3, Why Almost Destroyed, about 0:41' });
    expect(view.packages[0].imageUrls.full.startsWith(`/runs/${RUN_ID}/thumbnail/c1/full`)).toBe(true);
    expect(view.videoSeconds).toBe(120);
    const json = JSON.stringify(view);
    expect(json).not.toContain('SECRET PROMPT');
    expect(json).not.toContain('c1-full.jpg');
  });

  it('is pending while Gate 2 is open and packaging is not there yet', async () => {
    mocks.listStagesForRun.mockResolvedValue(gateStages(null));
    const out = await runsRouter.createCaller(owner).packaging({ runId: RUN_ID });
    expect(out).toEqual({ pending: true, view: null });
  });

  it('refuses another tenant', async () => {
    await expect(runsRouter.createCaller(stranger).packaging({ runId: RUN_ID })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('runs.choosePackage', () => {
  const choose = (ctx: never, input: { packageId: string; editedTitle?: string }) => runsRouter.createCaller(ctx).choosePackage({ runId: RUN_ID, ...input });

  it('saves the choice on the open Gate 2 row before anything is approved', async () => {
    const out = await choose(owner, { packageId: 'c1' });
    expect(out.choice).toEqual({ packageId: 'c1', title: makeConcept().title, titleEdited: false });
    expect(mocks.patchStageOutput).toHaveBeenCalledOnce();
    const [id, patch] = mocks.patchStageOutput.mock.calls[0];
    expect(id).toBe('g2');
    expect(patch.packaging.choice).toMatchObject({ packageId: 'c1', chosenByUserId: 'u1' });
    expect(mocks.resolvePendingApproval).not.toHaveBeenCalled();
  });

  it("keeps YouTube's suggested thumbnail as a choice", async () => {
    const out = await choose(owner, { packageId: 'youtube-suggested' });
    expect(out.choice.packageId).toBe('youtube-suggested');
  });

  it('accepts an edited title the script supports and refuses one with an unsupported figure', async () => {
    const ok = await choose(owner, { packageId: 'c1', editedTitle: 'Why was the tower nearly torn down?' });
    expect(ok.choice.titleEdited).toBe(true);
    await expect(choose(owner, { packageId: 'c1', editedTitle: 'Why did 99 engineers nearly lose the tower?' })).rejects.toMatchObject({ code: 'BAD_REQUEST', message: expect.stringContaining('99') });
    expect(mocks.patchStageOutput).toHaveBeenCalledOnce();
  });

  it('refuses an unknown package, a run that is not at Gate 2 and packaging that is not ready', async () => {
    await expect(choose(owner, { packageId: 'zzz' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    mocks.findPipelineRunById.mockResolvedValue(run({ status: 'running' }));
    await expect(choose(owner, { packageId: 'c1' })).rejects.toMatchObject({ code: 'CONFLICT' });
    mocks.findPipelineRunById.mockResolvedValue(run());
    mocks.listStagesForRun.mockResolvedValue(gateStages(null));
    await expect(choose(owner, { packageId: 'c1' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('holds tenant and channel ownership: another tenant and a non-owner member are refused', async () => {
    await expect(choose(stranger, { packageId: 'c1' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(choose(member, { packageId: 'c1' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.patchStageOutput).not.toHaveBeenCalled();
  });
});
