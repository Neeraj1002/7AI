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

const RUN_ID = 'citation-publishing-fixture';
const SCRIPT = 'The ship was found abandoned.';
const SOURCES = 'Sources: https://source.example/history/abandoned-ship-the-mary-celeste-174488104/, '
  + 'https://source.example/news/chemists-think-they-know-what-happened-on-board-the-mary-celeste/4023228.';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  mocks.run.mockResolvedValue({ id: RUN_ID, tenantId: 't1', channelId: 'c1', status: 'running', briefText: SCRIPT });
  mocks.update.mockImplementation(async (_id, patch) => ({ id: RUN_ID, ...patch }));
  mocks.channel.mockResolvedValue({ id: 'c1', isActive: true });
  mocks.latest.mockImplementation(async (_id, stage) => {
    if (stage === 'gate2') return { id: 'gate2', status: 'completed', output: { outcome: 'approve', privacyStatus: 'private' } };
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

describe.each(['short', 'long'])('publishing citation checks (%s)', videoKind => {
  beforeEach(() => { mocks.config.mockResolvedValue({ videoKind, selfDeclaredMadeForKids: false }); });

  it('allows citation article IDs through the claim check to the guarded upload boundary', async () => {
    const out = await runPublishingStage(RUN_ID);
    expect(mocks.metadata).toHaveBeenCalledTimes(1);
    expect(mocks.claim).toHaveBeenCalledTimes(1);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.upload.mock.calls[0][0]).toMatchObject({ privacyStatus: 'private' });
    expect(mocks.upload.mock.calls[0][0].metadata.description).toContain('174488104');
    expect(out.lastError).toBe('FIXTURE_UPLOAD_BOUNDARY');
  });

  it('still holds an unsupported prose number before any claim or upload after one correction', async () => {
    const generated = await mocks.metadata();
    mocks.metadata.mockResolvedValue({ ...generated, metadata: {
      ...generated.metadata, description: 'There were 99 people.\n' + SOURCES,
    } });
    mocks.metadata.mockClear();
    const out = await runPublishingStage(RUN_ID);
    expect(mocks.metadata).toHaveBeenCalledTimes(2);
    expect(out.lastError).toContain('Publishing held back before upload');
    expect(out.lastError).toContain('unmatched number "99"');
    expect(out.lastError).not.toContain('unmatched number "174488104"');
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
