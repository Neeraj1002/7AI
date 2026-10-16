import { describe, it, expect, vi, beforeEach } from 'vitest';
const m = vi.hoisted(() => ({ run: vi.fn(), stage: vi.fn(), usage: vi.fn(), review: vi.fn(), system: vi.fn(), candidate: vi.fn(), validator: vi.fn(), config: vi.fn(), stages: vi.fn(), gates: vi.fn() }));
vi.mock('../prisma-client', () => ({ prisma: { pipelineRun: { findUnique: m.run }, pipelineStage: { findFirst: m.stage, findMany: m.stages }, usageEvent: { findMany: m.usage }, reviewLog: { findFirst: m.review, findMany: m.gates } } }));
vi.mock('../../api/system-info', () => ({ getSystemInfo: m.system }));
vi.mock('../../run-pipeline/legacy-planner-recovery', () => ({ isLegacyPlannerRecoveryCandidate: m.candidate, legacyPlannerRecoveryCheckpoint: m.validator }));
vi.mock('../../run-pipeline/resolved-config', () => ({ loadResolvedConfig: m.config }));
import { readPlannerDiagnostics } from './admin-planner-diagnostics.repository';
import { getRunStructureForAdmin } from './admin-runs.repository';
const runId = '11111111-1111-4111-8111-111111111111', stageId = '22222222-2222-4222-8222-222222222222', profileId = '33333333-3333-4333-8333-333333333333';
const now = new Date('2026-10-14T16:58:06.247Z');
const stage = { id: stageId, pipelineRunId: runId, stageName: 'video_generation', status: 'failed', attemptNumber: 5, output: { recovery: { kind: 'spend_limit', providerResponseBody: 'SECRET' } }, error: null, startedAt: now, completedAt: now, updatedAt: now };
beforeEach(() => {
  vi.resetAllMocks(); m.run.mockResolvedValue({ id: runId, profileVersionId: profileId, creationOptions: { videoKind: 'long', manualRetries: { video_generation: 3 }, maxCostUsd: 1.5 }, channel: { styleGuide: null, defaultVoice: null } });
  m.stage.mockResolvedValue(stage); m.system.mockResolvedValue({ commit: '5b04a7a', bootedAt: now.toISOString() }); m.candidate.mockReturnValue(false); m.usage.mockResolvedValue([]);
});
describe('one-attempt bounded Admin diagnostic repository', () => {
  it('bounds planner usage query before serialization and correlates by run AND stage id', async () => {
    const d = await readPlannerDiagnostics(runId, 5);
    expect(m.stage).toHaveBeenCalledWith(expect.objectContaining({ where: { pipelineRunId: runId, stageName: 'video_generation', attemptNumber: 5 }, orderBy: { attemptNumber: 'desc' } }));
    expect(m.usage).toHaveBeenCalledWith({ where: { pipelineRunId: runId, stageId, agent: 'video-production-planning' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 101, select: { stageId: true, createdAt: true, provider: true, model: true, inputTokens: true, outputTokens: true, costUsd: true, metadata: true } });
    expect(d?.failure.classification).toBe('spend_limit'); expect(d?.recovery.recoverableFailure).toBe(true); expect(JSON.stringify(d)).not.toContain('SECRET');
    expect(m.validator).not.toHaveBeenCalled();
  });
  it('finds latest video attempt and returns null without usage access when absent', async () => {
    m.stage.mockResolvedValue(null); expect(await readPlannerDiagnostics(runId)).toBeNull();
    expect(m.stage.mock.calls[0][0].where).toEqual({ pipelineRunId: runId, stageName: 'video_generation' }); expect(m.usage).not.toHaveBeenCalled();
  });
  it('calls the existing #89/#90 validator read-only with original approved chapter ordering', async () => {
    const selected = { ...stage, output: { longPlanningCheckpoint: { scenes: { '0:0': { words: 'SECRET', prompt: 'SECRET' } } } } };
    const chapters = [{ text: 'SECRET', title: 'SECRET' }];
    const gate = { status: 'completed', output: { chapters } };
    m.stage.mockResolvedValueOnce(selected).mockResolvedValueOnce({ id: stageId }).mockResolvedValueOnce(gate);
    m.candidate.mockReturnValue(true); m.review.mockResolvedValue({ rationale: 'PRIVATE NOTES' }); m.config.mockResolvedValue({ videoKind: 'long' }); m.validator.mockReturnValue({ scenes: {} });
    const d = await readPlannerDiagnostics(runId, 5);
    expect(m.validator.mock.calls[0][2]).toBe(gate); expect(Object.keys(m.validator.mock.calls[0][2].output.chapters[0])).toEqual(['text', 'title']);
    expect(m.validator.mock.calls[0][4]).toBe('PRIVATE NOTES'); expect(d?.recovery.legacyEligible).toBe(true); expect(JSON.stringify(d)).not.toContain('PRIVATE NOTES');
    expect(m.review.mock.calls[0][0]).toMatchObject({ where: { pipelineRunId: runId }, select: { rationale: true } });
  });
  it('does not advertise old named attempts as currently eligible', async () => {
    m.candidate.mockReturnValue(true); m.stage.mockResolvedValueOnce(stage).mockResolvedValueOnce({ id: profileId }).mockResolvedValueOnce(null); m.config.mockResolvedValue({}); m.review.mockResolvedValue(null);
    expect((await readPlannerDiagnostics(runId, 5))?.recovery.legacyEligible).toBe(false); expect(m.validator).not.toHaveBeenCalled();
  });
  it('leaves eligibility unknown when prerequisites fail, without echoing errors', async () => {
    m.candidate.mockReturnValue(true); m.config.mockRejectedValue(new Error('SECRET session URI'));
    const d = await readPlannerDiagnostics(runId, 5); expect(d?.recovery.legacyEligible).toBeNull(); expect(JSON.stringify(d)).not.toContain('SECRET');
  });
  it('skips full eligibility evaluation for an over-bound checkpoint', async () => {
    m.candidate.mockReturnValue(true); m.stage.mockResolvedValue({ ...stage, output: { longPlanningCheckpoint: { scenes: Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`0:${i}`, {}])) } } });
    expect((await readPlannerDiagnostics(runId))?.recovery.legacyEligible).toBeNull(); expect(m.validator).not.toHaveBeenCalled(); expect(m.config).not.toHaveBeenCalled();
  });
});
describe('Admin structure profile projection', () => {
  it.each([profileId, null])('uses selected stored profileVersionId %s without exposing profile content', async id => {
    m.run.mockResolvedValue({ id: runId, profileVersionId: id, createdAt: now, updatedAt: now, creationOptions: null, lastError: null, channel: { name: 'private channel' }, tenant: { name: 'private tenant' } });
    m.stages.mockResolvedValue([]); m.gates.mockResolvedValue([]);
    const d = await getRunStructureForAdmin(runId); expect(d?.run.profileVersionId).toBe(id); expect(m.run.mock.calls[0][0].select.profileVersionId).toBe(true);
    expect(d?.run).not.toHaveProperty('profile');
  });
});
