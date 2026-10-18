import { describe, it, expect } from 'vitest';
import { projectPlannerDiagnostics, CALL_METADATA_KEYS, PLANNER_CONTENT_MAX_BYTES, type PlannerSource } from './planner-diagnostics';

// Synthetic/partial fixtures exercise projection boundaries, not lost production replies.
const runId = '11111111-1111-4111-8111-111111111111';
const stageId = '22222222-2222-4222-8222-222222222222';
const hash = 'a'.repeat(64), at = '2026-10-14T16:58:06.247Z';
function source(patch: Partial<PlannerSource> = {}): PlannerSource {
  return { runId, attemptNumber: 5, profileVersionId: null, creationOptions: null, stageId, status: 'failed', startedAt: at, completedAt: at, updatedAt: at, output: null, error: null,
    deployed: { commit: '5b04a7a', bootedAt: at }, recovery: { legacyCandidate: false, legacyEligible: false, legacyUsed: null, recoverableFailure: null, provenance: 'existing read-only rules' }, calls: [], ...patch };
}
const metadata = { contractVersion: 3, chapterIndex: 1, sceneOffset: 0, sceneCount: 12, requestKind: 'correction', requestHash: hash, maxTokens: 8192, reusedSceneCount: 27, finishReason: 'stop', validationOutcome: 'schema_violation', validationError: 'private provider error: SECRET reply', recoveryStrategy: 'split' };
function call(extra = {}) { return { stageId, createdAt: at, provider: 'anthropic', model: 'claude-sonnet-5', inputTokens: 100, outputTokens: 200, costUsd: 0.0382, metadata, ...extra }; }

describe('bounded planner diagnostic projection (synthetic/partial fixtures)', () => {
  it('keeps legacy unknowns null and explicitly distinguishes absent persistence', () => {
    const d = projectPlannerDiagnostics(source());
    expect(d.run).toEqual({ videoKind: null, targetSeconds: null, profileVersionId: null, manualVideoRetries: null, maxCostUsd: null });
    expect(d.checkpoint).toMatchObject({ availability: 'not_persisted', inputHash: null, contractVersion: null, acceptedSceneCount: null, completePlanPresent: null, sceneIds: [] });
    expect(d.recovery.legacyUsed).toBeNull();
    expect(d.missing).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'checkpoint' }), expect.objectContaining({ field: 'calls' }), expect.objectContaining({ field: 'attempt.deployedCommit' })]));
  });
  it('maps final #89 metadata explicitly without losing token counters', () => {
    const d = projectPlannerDiagnostics(source({ calls: [call()] }));
    expect(Object.keys(d.calls[0].metadata)).toEqual([...CALL_METADATA_KEYS]);
    expect(d.calls[0]).toMatchObject({ stageId, at, inputTokens: 100, outputTokens: 200, costUsd: 0.0382, metadata: { requestHash: hash, reusedSceneCount: 27, recoveryStrategy: 'split', validationError: 'validation failed (private details omitted)' } });
    expect(d.truncated).toBe(false);
  });
  it('preserves first/final counts and persisted truncation while leaving missing first lengths unknown', () => {
    const d = projectPlannerDiagnostics(source({ error: 'Video production planning for chapter 2 ("private title") was unusable twice', output: { firstParseError: 'received 14 scenes, exactly 12 were requested', parseError: 'received 13 scenes, exactly 12 were requested', stopReason: 'stop', firstStopReason: 'stop', attempts: 2, replyLength: 8962, rawReplyTruncated: true } }));
    expect(d.failure).toMatchObject({ classification: null, chapterIndex: 1, firstReceivedSceneCount: 14, finalReceivedSceneCount: 13, finalRequestedSceneCount: 12, replyLength: 8962, rawReplyTruncated: true, firstReplyLength: null, firstRawReplyTruncated: null });
    expect(JSON.stringify(d)).not.toContain('private title');
  });
  it.each(['spend_limit', 'provider_capacity', 'rate_limit_exhausted'])('keeps recovery class %s distinct from count/cap failures', kind => {
    expect(projectPlannerDiagnostics(source({ output: { recovery: { kind, providerResponseBody: 'SECRET' } } })).failure.classification).toBe(kind);
  });
  it('classifies historical count and output caps without forwarding private error strings', () => {
    expect(projectPlannerDiagnostics(source({ error: 'received 13 scenes, exactly 12 were requested SECRET' })).failure.classification).toBe('count_mismatch');
    expect(projectPlannerDiagnostics(source({ error: 'chapter title SECRET cut off at the output cap' })).failure.classification).toBe('output_token_exhaustion');
  });
  it('reads only checkpoint keys and present-plan marker, never scene values', () => {
    const d = projectPlannerDiagnostics(source({ output: { longPlanningCheckpoint: { inputHash: hash, scenes: { '1:1': { prompt: 'SECRET', words: 'SECRET' }, '0:2': { prompt: 'SECRET' } } }, recoveryPlan: { inputHash: hash, plan: { longScenes: ['SECRET'] } }, stillsProgress: { done: 21, total: 96 } } }));
    expect(d.checkpoint).toMatchObject({ inputHash: hash, contractVersion: null, acceptedSceneCount: 2, sceneIds: ['0:2', '1:1'], completePlanPresent: true, completePlanInputHash: hash });
    expect(d.retained).toMatchObject({ stillsDone: 21, stillsTotal: 96, bundleManifestRecorded: null });
    expect(JSON.stringify(d)).not.toContain('SECRET');
  });
  it('caps database sentinel rows and scene IDs; unknown count stays null', () => {
    const d = projectPlannerDiagnostics(source({ calls: Array.from({ length: 101 }, () => call()), output: { longPlanningCheckpoint: { inputHash: hash, contractVersion: 3, scenes: Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`0:${i}`, { words: 'SECRET', prompt: 'SECRET' }])) } } }));
    expect(d.calls).toHaveLength(100); expect(d.checkpoint.sceneIds).toHaveLength(200);
    expect(d.checkpoint.acceptedSceneCount).toBeNull(); expect(d.truncated).toBe(true);
    expect(d.missing.some(m => m.field === 'calls')).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(d))).toBeLessThanOrEqual(PLANNER_CONTENT_MAX_BYTES);
  });
  it('bounds even malformed scene keys and omits arbitrary key text', () => {
    const d = projectPlannerDiagnostics(source({ output: { longPlanningCheckpoint: { inputHash: hash, scenes: Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`SECRET${i}`, {}])) } } }));
    expect(d.checkpoint.sceneIds).toEqual([]); expect(d.checkpoint.acceptedSceneCount).toBeNull(); expect(d.truncated).toBe(true); expect(JSON.stringify(d)).not.toContain('SECRET');
  });
  it('drops raw replies, nested session/provider payloads and invalid scalars on every allowlisted surface', () => {
    const d = projectPlannerDiagnostics(source({ creationOptions: { videoKind: 'long', targetDurationSec: 480, manualRetries: { video_generation: 3 }, maxCostUsd: 1.5, rawReply: 'SECRET', sources: ['SECRET'] },
      output: { rawReply: 'SECRET', firstRawReply: 'SECRET', rawReplyTail: 'SECRET', firstRawReplyTail: 'SECRET', parseError: 'SECRET', stopReason: 'SECRET', replyLength: Infinity, recovery: { providerResponseBody: 'SECRET', encryptedSession: 'SECRET' }, longPlanningCheckpoint: { inputHash: 'SECRET', scenes: { '0:0': { prompt: 'SECRET' } } } },
      calls: [call({ metadata: { ...metadata, secret: 'SECRET', sessionUri: 'SECRET', nested: { ownerToken: 'SECRET' }, validationError: 'SECRET' } })] }));
    const text = JSON.stringify(d); expect(text).not.toContain('SECRET');
    for (const key of ['rawReply', 'firstRawReply', 'rawReplyTail', 'firstRawReplyTail', 'providerResponseBody', 'encryptedSession', 'ownerToken', 'sessionUri', 'prompt', 'words', 'sources']) expect(text).not.toContain(`"${key}":`);
    expect(d.run).toMatchObject({ targetSeconds: 480, manualVideoRetries: 3, maxCostUsd: 1.5 });
    expect(d.failure.replyLength).toBeNull();
  });
});
