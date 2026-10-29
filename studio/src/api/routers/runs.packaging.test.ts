import { describe, it, expect, vi, beforeEach } from 'vitest';

// Sprint 6 Task 1 (R5): runs.packaging and runs.choosePackage. Same mock layout as runs.update-settings.test.ts.
const mocks = vi.hoisted(() => ({
  findLatestAttempt: vi.fn(),
  listStagesForRun: vi.fn(),
  patchStageOutput: vi.fn(),
  findPipelineRunById: vi.fn(),
  findChannelById: vi.fn(),
  resolvePendingApproval: vi.fn(),
  hasPendingApproval: vi.fn(),
  packagingCost: vi.fn(),
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
vi.mock('../../notifications', async (orig) => ({ ...(await orig<object>()), resolvePendingApproval: mocks.resolvePendingApproval, hasPendingApproval: mocks.hasPendingApproval }));
vi.mock('../../models/repositories/usage-event.repository', async (orig) => ({ ...(await orig<object>()), sumPackagingCostForRun: mocks.packagingCost }));
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
        lettering: { words: 'SOLD FOR SCRAP?', subline: null, sublineDropped: false, typeface: 'stakes', fontFamily: 'Anton', zone: 'top', requestedZone: 'top', zonesByCalm: ['top', 'bottom', 'left', 'right'], textBox: { x0: 0.05, y0: 0.06, x1: 0.9, y1: 0.35 }, lines: 1, mainPxFull: 150, mainPxFeed: 42, mainPxSidebar: 20, readableAtSidebar: true },
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
const run = (over: Record<string, unknown> = {}) => ({ id: RUN_ID, tenantId: 't1', channelId: 'c1', status: 'paused_gate2', briefText: '', creationOptions: { videoKind: 'long' }, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findPipelineRunById.mockResolvedValue(run());
  mocks.findChannelById.mockResolvedValue({ id: 'c1', tenantId: 't1', ownerUserId: 'u1', isActive: true });
  mocks.listStagesForRun.mockResolvedValue(gateStages(packaging()));
  mocks.patchStageOutput.mockResolvedValue({});
  mocks.hasPendingApproval.mockReturnValue(true);
  mocks.packagingCost.mockResolvedValue(0.1371);
});

describe('runs.packaging', () => {
  it('returns the view the app shows: question, answer place with the current time, urls, no file paths or prompts', async () => {
    const out = await runsRouter.createCaller(owner).packaging({ runId: RUN_ID });
    expect(out.pending).toBe(false);
    const view = out.view!;
    expect(view.packages).toHaveLength(1);
    expect(view.packages[0]).toMatchObject({ title: makeConcept().title, question: makeConcept().question, answeredAt: 'Chapter 3, Why Almost Destroyed, about 0:41' });
    expect(view.packages[0].imageUrls?.full.startsWith(`/runs/${RUN_ID}/thumbnail/c1/full`)).toBe(true);
    expect(view.videoSeconds).toBe(120);
    const json = JSON.stringify(view);
    expect(json).not.toContain('SECRET PROMPT');
    expect(json).not.toContain('c1-full.jpg');
  });

  it('is making while the packages are made before the approval is open, and pending when the approval is open with none', async () => {
    mocks.listStagesForRun.mockResolvedValue(gateStages(null));
    mocks.hasPendingApproval.mockReturnValue(false);
    expect(await runsRouter.createCaller(owner).packaging({ runId: RUN_ID })).toEqual({ making: true, pending: false, view: null });
    mocks.hasPendingApproval.mockReturnValue(true);
    expect(await runsRouter.createCaller(owner).packaging({ runId: RUN_ID })).toEqual({ making: false, pending: true, view: null });
  });

  it('a checkpoint of packaging still being made reads as making, with no view', async () => {
    mocks.listStagesForRun.mockResolvedValue(gateStages(packaging({ status: 'building' })));
    mocks.hasPendingApproval.mockReturnValue(false);
    expect(await runsRouter.createCaller(owner).packaging({ runId: RUN_ID })).toEqual({ making: true, pending: false, view: null });
  });

  it('adds the contract fields: the cost from the usage rows, the round, the parts of the answer place, no Short fields on a long video', async () => {
    const out = await runsRouter.createCaller(owner).packaging({ runId: RUN_ID });
    expect(out.making).toBe(false);
    expect(out.view).toMatchObject({ packagingCostUsd: 0.1371, round: 1, kind: 'long', titleLimit: 70 });
    expect(out.view?.packages[0]).toMatchObject({ round: 1, hookLine: null, firstFrameUrl: null, answeredAtParts: { chapter: 3, chapterTitle: 'Why Almost Destroyed', startSec: 41 } });
  });

  it("a Short's package is its opening: the hook line, no 16:9 picture, nothing to choose", async () => {
    mocks.listStagesForRun.mockResolvedValue([]);
    mocks.findPipelineRunById.mockResolvedValue(run({ creationOptions: { opening: { hookLine: 'Why was it nearly torn down?', firstStillPrompt: 'scene', question: 'q', device: 'stake', answerQuote: 'a', reasons: [], note: null, textCostUsd: 0.01, builtAt: 'x', scriptHash: 'h', brief: null } } }));
    const out = await runsRouter.createCaller(owner).packaging({ runId: RUN_ID });
    expect(out.view?.kind).toBe('short');
    expect(out.view?.packages[0]).toMatchObject({ id: 'opening', hookLine: 'Why was it nearly torn down?', imageUrls: null });
    expect(out.making).toBe(false);
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

describe('runs.packagingRecord (R8)', () => {
  it('reads back, for a published run, the chosen package with its device and recipe, the rejected ones and the drops', async () => {
    const p = packaging({ choice: { packageId: 'c1', title: 'Chosen title', titleEdited: true, chosenAt: 'x', chosenByUserId: 'u1' }, dropped: [{ id: 'c3', title: 'Dropped', device: 'how', stage: 'payoff', reasons: ['r'], rules: ['scene_not_in_script'], round: 1 }] });
    mocks.listStagesForRun.mockResolvedValue(gateStages(p, 'completed'));
    mocks.findPipelineRunById.mockResolvedValue(run({ status: 'completed' }));
    const rec = await runsRouter.createCaller(owner).packagingRecord({ runId: RUN_ID });
    expect(rec.kind).toBe('long_packages');
    expect(rec.chosen).toMatchObject({ id: 'c1', device: 'stake', title: 'Chosen title', typeface: 'Anton' });
    expect(rec.offered.map((o) => o.outcome)).toEqual(['chosen', 'dropped']);
    expect(rec.chosen?.recipe.imageModel).toBe('m');
  });

  it("reads a Short's opening, says none for a run with neither, and refuses another tenant", async () => {
    mocks.listStagesForRun.mockResolvedValue([]);
    mocks.findPipelineRunById.mockResolvedValue(run({ creationOptions: { opening: { hookLine: 'Why?', firstStillPrompt: null, question: 'q', device: 'how', note: null, reasons: [], brief: null } } }));
    expect((await runsRouter.createCaller(owner).packagingRecord({ runId: RUN_ID })).kind).toBe('short_opening');
    mocks.findPipelineRunById.mockResolvedValue(run());
    expect((await runsRouter.createCaller(owner).packagingRecord({ runId: RUN_ID })).kind).toBe('none');
    await expect(runsRouter.createCaller(stranger).packagingRecord({ runId: RUN_ID })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('runs.checkPackageTitle (contract B3)', () => {
  const check = (ctx: never, title: string, packageId = 'c1') => runsRouter.createCaller(ctx).checkPackageTitle({ runId: RUN_ID, packageId, title });
  it('says ok for a supported title and names the problem for a figure, a length and an empty title, with the server limit', async () => {
    expect(await check(owner, 'How do 18,038 iron pieces survive 20 years?')).toMatchObject({ ok: true, problems: [], titleLimit: 70 });
    const figure = await check(owner, 'Why did 99 engineers nearly lose it?');
    expect(figure.ok).toBe(false);
    expect(figure.problems[0]).toMatchObject({ kind: 'unsupported_figure', text: expect.stringContaining('99') });
    expect((await check(owner, 'x'.repeat(80))).problems.map((p) => p.kind)).toContain('too_long');
    expect((await check(owner, '  ')).problems.map((p) => p.kind)).toContain('empty');
  });
  it('agrees with choosePackage: whatever the check refuses, the save refuses', async () => {
    for (const title of ['Why did 99 engineers nearly lose it?', 'x'.repeat(80), '   ']) {
      expect((await check(owner, title)).ok).toBe(false);
      await expect(runsRouter.createCaller(owner).choosePackage({ runId: RUN_ID, packageId: 'c1', editedTitle: title })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    }
  });
  it('refuses another tenant, an unknown package and packaging that is not ready', async () => {
    await expect(check(stranger, 'A title')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(check(owner, 'A title', 'zzz')).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    mocks.listStagesForRun.mockResolvedValue(gateStages(null));
    await expect(check(owner, 'A title')).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
