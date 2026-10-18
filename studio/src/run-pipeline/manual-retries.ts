import { updatePipelineRun } from '../models/repositories/pipeline-run.repository';
import type { PipelineRun, PipelineStage, StageName } from '../types';

// Bugs Task 12 (R2) - the one place the number lives.
export const MAX_MANUAL_RETRIES_PER_STAGE = 3;

// Counted per stage, per run, in creationOptions.manualRetries (no schema change). Only a manual
// Retry or a Gate 2 Revise that really starts a new attempt is recorded (see runs.ts); automatic
// backoff, video-review regeneration and the R1 fallback never call recordManualRetry.
export function manualRetriesUsed(run: Pick<PipelineRun, 'creationOptions'>, stage: StageName): number {
  return run.creationOptions?.manualRetries?.[stage] ?? 0;
}

export function isManualRetryCapReached(run: Pick<PipelineRun, 'creationOptions'>, stage: StageName): boolean {
  return manualRetriesUsed(run, stage) >= MAX_MANUAL_RETRIES_PER_STAGE;
}

// This must inspect the failed attempt itself, not a run-wide flag: a new
// processing failure replaces the marker and is subject to the normal cap.
export function isEligibleRecovery(stage: Pick<PipelineStage, 'status' | 'output'> | null): boolean {
  if (stage?.status !== 'failed') return false;
  const kind = (stage.output as { recovery?: { kind?: unknown } } | null)?.recovery?.kind;
  return kind === 'spend_limit' || kind === 'provider_capacity' || kind === 'rate_limit_exhausted' || kind === 'provider_auth';
}

export const MANUAL_RETRY_CAP_MESSAGE = `Retry limit reached for this step (${MAX_MANUAL_RETRIES_PER_STAGE}). Edit the brief and run again, or cancel.`;

export async function recordManualRetry(run: PipelineRun, stage: StageName): Promise<PipelineRun> {
  return updatePipelineRun(run.id, {
    creationOptionsMerge: {
      manualRetries: { ...(run.creationOptions?.manualRetries ?? {}), [stage]: manualRetriesUsed(run, stage) + 1 },
    },
  });
}

// Which stage a manual Retry restarts. A run parked at a gate (or at the review that fed one) restarts
// the stage that actually failed, never the gate itself (R5b).
export function retryTargetStage(run: Pick<PipelineRun, 'currentStage' | 'lastError'>): StageName | null {
  const stage = run.currentStage;
  if (!stage) return null;
  if (stage === 'gate2') return 'video_generation';
  if (stage === 'gate1') return 'script_generation';
  if (stage === 'video_review' && (run.lastError ?? '').includes('regen cap')) return 'video_generation';
  return stage;
}

// Shared by run detail and Retry mutation, so the app cannot hide an allowed recovery.
export function isRetryBlockedByCap(run: PipelineRun, target: StageName, failed: PipelineStage | null, legacyRecovery = false): boolean {
  return isManualRetryCapReached(run, target) && !(run.status === 'needs_attention' && (isEligibleRecovery(failed) || Boolean(run.creationOptions?.preflightBlock))) && !legacyRecovery;
}
