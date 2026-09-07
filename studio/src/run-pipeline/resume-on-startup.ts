import { listRunsByStatus } from '../models/repositories/pipeline-run.repository';
import { findLatestStageForRun } from '../models/repositories/pipeline-stage.repository';
import { runIntakeStage } from './state-machine';

// Idempotent resume — BUSINESS_LOGIC.md Section 1. On process start, for every
// PipelineRun with status = 'running', look at its latest PipelineStage:
//   - status = 'completed' -> resume at the next stage (unreachable this week —
//     no processor exists yet for anything after intake).
//   - status = 'running'   -> the process died mid-stage; re-run that same stage
//     from its persisted input rather than assuming partial work happened.
export async function resumeOnStartup(): Promise<void> {
  const runningRuns = await listRunsByStatus('running');
  if (runningRuns.length === 0) {
    console.log('[resume] no running PipelineRuns found on startup');
    return;
  }

  for (const run of runningRuns) {
    const latestStage = await findLatestStageForRun(run.id);

    if (!latestStage) {
      // Shouldn't happen given persist-before-advance, but recover rather than
      // leave the run stuck forever.
      console.log(`[resume] run ${run.id}: status=running but no stage rows exist — starting intake`);
      await runIntakeStage(run.id);
      continue;
    }

    if (latestStage.status === 'running') {
      console.log(
        `[resume] run ${run.id}: stage '${latestStage.stageName}' (attempt ${latestStage.attemptNumber}) was mid-flight when the process stopped — re-running it from its persisted input`,
      );
      if (latestStage.stageName === 'intake') {
        await runIntakeStage(run.id);
      } else {
        console.log(
          `[resume] run ${run.id}: no processor wired up for stage '${latestStage.stageName}' yet (Week 1 skeleton) — leaving as-is`,
        );
      }
      continue;
    }

    if (latestStage.status === 'completed') {
      console.log(
        `[resume] run ${run.id}: latest stage '${latestStage.stageName}' already completed — currentStage='${run.currentStage}' has no processor wired up yet this week`,
      );
      continue;
    }

    console.log(
      `[resume] run ${run.id}: latest stage '${latestStage.stageName}' is '${latestStage.status}' — no automatic resume action defined for this state`,
    );
  }
}
