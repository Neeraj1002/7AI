import { prisma } from '../prisma-client';
import { getSystemInfo } from '../../api/system-info';
import { PLANNER_CALL_LIMIT, PLANNER_SCENE_LIMIT, asRecord, finiteNumber, projectPlannerDiagnostics, type PlannerDiagnostics } from '../../api/planner-diagnostics';
import { isLegacyPlannerRecoveryCandidate, legacyPlannerRecoveryCheckpoint } from '../../run-pipeline/legacy-planner-recovery';
import { isEligibleRecovery } from '../../run-pipeline/manual-retries';
import { loadResolvedConfig } from '../../run-pipeline/resolved-config';
import type { PipelineRun, PipelineStage } from '../../types';

// Called ONLY after the existing content-access audit. One selected attempt, bounded
// usage rows, no mutation/SQL interface, no provider calls or eligibility consumption.
export async function readPlannerDiagnostics(runId: string, attemptNumber?: number): Promise<PlannerDiagnostics | null> {
  const [row, stage, system] = await Promise.all([
    prisma.pipelineRun.findUnique({ where: { id: runId } }),
    prisma.pipelineStage.findFirst({ where: { pipelineRunId: runId, stageName: 'video_generation', ...(attemptNumber === undefined ? {} : { attemptNumber }) }, orderBy: { attemptNumber: 'desc' } }),
    getSystemInfo(),
  ]);
  if (!row || !stage) return null;
  const run = row as unknown as PipelineRun;
  const selected = stage as unknown as PipelineStage;
  const options = asRecord(row.creationOptions), output = asRecord(stage.output);
  const used = typeof options.plannerContractRecoveryUsed === 'boolean' ? options.plannerContractRecoveryUsed : null;
  const candidate = isLegacyPlannerRecoveryCandidate(run, selected);
  const recovery: PlannerDiagnostics['recovery'] = {
    legacyUsed: used, legacyCandidate: candidate, legacyEligible: candidate ? null : false,
    recoverableFailure: Object.hasOwn(output, 'recovery') ? isEligibleRecovery(selected) : null,
    provenance: 'existing release rules evaluated read-only against current run state and selected attempt; not permission to Retry',
  };
  if (candidate) {
    // Reuse #89/#90's exact eligibility validator and stored chapter property order.
    // Fail closed if inputs exceed the diagnostic evaluation bound or are unavailable.
    let sceneCount = 0;
    for (const key in asRecord(asRecord(output.longPlanningCheckpoint).scenes)) { if (!Object.hasOwn(asRecord(asRecord(output.longPlanningCheckpoint).scenes), key)) continue; sceneCount++; if (sceneCount > PLANNER_SCENE_LIMIT) break; }
    if (sceneCount <= PLANNER_SCENE_LIMIT) {
      try {
        const [latest, gate, note, config] = await Promise.all([
          prisma.pipelineStage.findFirst({ where: { pipelineRunId: runId, stageName: 'video_generation' }, orderBy: { attemptNumber: 'desc' }, select: { id: true } }),
          prisma.pipelineStage.findFirst({ where: { pipelineRunId: runId, stageName: 'gate1' }, orderBy: { attemptNumber: 'desc' } }),
          prisma.reviewLog.findFirst({ where: { pipelineRunId: runId, OR: [{ agent: 'video-intelligence-own-draft', verdict: 'fail' }, { agent: 'human', verdict: 'revise' }] }, orderBy: [{ timestamp: 'desc' }, { id: 'desc' }], select: { rationale: true } }),
          loadResolvedConfig(run),
        ]);
        recovery.legacyEligible = latest?.id === stage.id
          ? Boolean(legacyPlannerRecoveryCheckpoint(run, selected, gate as unknown as PipelineStage | null, config, note?.rationale)) : false;
      } catch {
        // No provider/server error text is exposed. Diagnostics still show persisted evidence.
        recovery.legacyEligible = null;
      }
    }
  }
  const usage = await prisma.usageEvent.findMany({
    where: { pipelineRunId: runId, stageId: stage.id, agent: 'video-production-planning' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: PLANNER_CALL_LIMIT + 1,
    select: { stageId: true, createdAt: true, provider: true, model: true, inputTokens: true, outputTokens: true, costUsd: true, metadata: true },
  });
  return projectPlannerDiagnostics({
    runId, attemptNumber: stage.attemptNumber, profileVersionId: row.profileVersionId, creationOptions: row.creationOptions,
    stageId: stage.id, status: stage.status, startedAt: stage.startedAt?.toISOString() ?? null,
    completedAt: stage.completedAt?.toISOString() ?? null, updatedAt: stage.updatedAt.toISOString(),
    output: stage.output, error: stage.error, deployed: { commit: system.commit, bootedAt: system.bootedAt }, recovery,
    calls: usage.map(u => ({ ...u, createdAt: u.createdAt.toISOString(), costUsd: finiteNumber(Number(u.costUsd)) })),
  });
}
