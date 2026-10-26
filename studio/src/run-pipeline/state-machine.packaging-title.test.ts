import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  run: vi.fn(), update: vi.fn(), channel: vi.fn(), latest: vi.fn(), script: vi.fn(),
  create: vi.fn(), progress: vi.fn(), fail: vi.fn(), usage: vi.fn(), metadata: vi.fn(),
  claim: vi.fn(), receipt: vi.fn(), upload: vi.fn(), config: vi.fn(), identity: vi.fn(),
}));
vi.mock('../models/prisma-client', () => ({ prisma: {
  $transaction: async (fn: (tx: object) => unknown) => fn({}),
  pipelineStage: { findMany: async () => [] },
} }));
vi.mock('../models/repositories/pipeline-run.repository', async orig => ({
  ...await orig<object>(), findPipelineRunById: mocks.run, updatePipelineRun: mocks.update,
}));
vi.mock('../models/repositories/channel.repository', async orig => ({
  ...await orig<object>(), findChannelById: mocks.channel,
}));
vi.mock('../models/repositories/pipeline-stage.repository', async orig => ({
  ...await orig<object>(), findLatestAttempt: mocks.latest, findLatestCompletedAttempt: mocks.script,
  createStageAttempt: mocks.create, recordStageProgress: mocks.progress, failStage: mocks.fail,
}));
vi.mock('../models/repositories/usage-event.repository', async orig => ({
  ...await orig<object>(), insertUsageEvent: mocks.usage,
}));
vi.mock('../models/repositories/review-log.repository', async orig => ({
  ...await orig<object>(), findGate1ApproverForRun: async () => null,
}));
vi.mock('../models/repositories/publishing-recovery.repository', async orig => ({
  ...await orig<object>(), claimPublishing: mocks.claim, readPublishingReceipt: mocks.receipt,
}));
vi.mock('../agents/publishing', async orig => ({
  ...await orig<object>(), generatePublishingMetadata: mocks.metadata, uploadVideoWithSession: mocks.upload,
}));
vi.mock('./resolved-config', () => ({ loadResolvedConfig: mocks.config }));
vi.mock('./publishing-recovery', async orig => ({
  ...await orig<object>(), approvedFileIdentity: mocks.identity,
}));

import { runPublishingStage } from './state-machine';
import { NonTransientStageError } from './retry-with-backoff';
import { PACKAGING_OUTPUT_VERSION } from '../packaging/build';

let choice: { packageId: string; title: string | null } | undefined;
const PACKAGING = () => ({
  version: PACKAGING_OUTPUT_VERSION, status: 'ready', reason: null, scriptHash: 'h', brief: null, faceMode: 'none', typeface: 'stakes', titleLimit: 70,
  concepts: [], dropped: [], textCostUsd: 0, imageCostUsd: 0,
  packages: [{ id: 'c1', title: CHOSEN_TITLE, files: { full: 'c1-full.jpg', feed: 'c1-feed.jpg', sidebar: 'c1-sidebar.jpg' } }],
  ...(choice && { choice: { ...choice, titleEdited: false, chosenAt: 'x', chosenByUserId: null } }),
});

const RUN_ID = 'citation-publishing-fixture';
const SCRIPT = 'The ship was found abandoned.';
const CHOSEN_TITLE = 'Why was the ship found abandoned?';
const SOURCES = 'Sources: https://source.example/history/abandoned-ship-the-mary-celeste-174488104/, '
  + 'https://source.example/news/chemists-think-they-know-what-happened-on-board-the-mary-celeste/4023228.';

beforeEach(() => {
  vi.clearAllMocks();
  choice = undefined;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  mocks.run.mockResolvedValue({ id: RUN_ID, tenantId: 't1', channelId: 'c1', status: 'running', briefText: SCRIPT });
  mocks.update.mockImplementation(async (_id, patch) => ({ id: RUN_ID, ...patch }));
  mocks.channel.mockResolvedValue({ id: 'c1', isActive: true });
  mocks.latest.mockImplementation(async (_id, stage) => {
    if (stage === 'gate2') return { id: 'gate2', status: 'completed', output: { outcome: 'approve', privacyStatus: 'private', packaging: PACKAGING() } };
    if (stage === 'gate1') return { status: 'completed', output: { sanctionedScriptText: SCRIPT } };
    if (stage === 'video_generation') return { status: 'completed', output: {
      videoPath: 'fixture.mp4', plan: { visualSource: 'ai-stills' },
      chapterTimings: [{ title: 'Discovery', startSec: 0, endSec: 40 },
        { title: 'Investigation', startSec: 40, endSec: 80 }, { title: 'Questions', startSec: 80, endSec: 120 }],
    } };
    return null;
  });
  mocks.script.mockResolvedValue({ status: 'completed', output: { hashtags: [] } });
  mocks.create.mockResolvedValue({ id: 'publishing-stage' });
  mocks.receipt.mockResolvedValue(null);
  mocks.identity.mockResolvedValue({ fileSha256: 'a'.repeat(64), fileSize: 100 });
  mocks.claim.mockResolvedValue({ kind: 'acquired', token: 'fixture-token', receipt: {} });
  // Stop at the mocked upload boundary: no bytes, session, external effects or completed publish.
  mocks.upload.mockRejectedValue(new NonTransientStageError('FIXTURE_UPLOAD_BOUNDARY'));
  mocks.metadata.mockResolvedValue({ metadata: {
    title: 'An abandoned ship', description: SCRIPT + '\n' + SOURCES, tags: ['maritime'], coverFrameTimestampRatio: 0.5,
  }, llm: { provider: 'mock', model: 'mock', usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0 } });
});


describe('publishing uses the title chosen at Gate 2 (Sprint 6 Task 1, R5)', () => {
  beforeEach(() => { mocks.config.mockResolvedValue({ videoKind: 'long', selfDeclaredMadeForKids: false }); });

  it('publishes the chosen package title, not the one the model wrote', async () => {
    choice = { packageId: 'c1', title: CHOSEN_TITLE };
    await runPublishingStage(RUN_ID);
    expect(mocks.upload.mock.calls[0][0].metadata.title).toBe(CHOSEN_TITLE);
  });

  it('publishes an edited title the founder typed', async () => {
    choice = { packageId: 'c1', title: 'A ship found abandoned at sea' };
    await runPublishingStage(RUN_ID);
    expect(mocks.upload.mock.calls[0][0].metadata.title).toBe('A ship found abandoned at sea');
  });

  it("keeps the model's title when YouTube's suggested thumbnail was chosen", async () => {
    choice = { packageId: 'youtube-suggested', title: null };
    await runPublishingStage(RUN_ID);
    expect(mocks.upload.mock.calls[0][0].metadata.title).toBe('An abandoned ship');
  });
});
