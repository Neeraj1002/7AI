import { findByChannel } from '../models/repositories/agent-credential.repository';
import { findChannelById } from '../models/repositories/channel.repository';
import { updatePipelineRun } from '../models/repositories/pipeline-run.repository';
import { sumUsageCostForRun } from '../models/repositories/usage-event.repository';
import { env } from '../config/env';
import { loadResolvedConfig } from './resolved-config';
import {
  defaultPreflightDeps,
  describePreflightIssues,
  runPreflight,
  STAGE_PROVIDERS,
  type PreflightDeps,
  type PreflightStage,
} from './preflight';
import type { PipelineRun } from '../types';

// Sprint 5 Task 8 (R2): the database-facing half of preflight. Runs the checks for `stage` and
// either returns null (go ahead; a block left by an earlier try is cleared) or parks the run in
// Needs attention with the plain message and returns it. No stage row is written: nothing ran, so
// the attempt count and the regeneration allowance stay exactly as they were.
export async function preflightGate(
  run: PipelineRun,
  stage: PreflightStage,
  deps: PreflightDeps = { ...defaultPreflightDeps, spentUsd: () => sumUsageCostForRun(run.id) },
  disabled: boolean = env.PREFLIGHT_DISABLED === '1',
): Promise<PipelineRun | null> {
  if (disabled) return null;
  const channel = await findChannelById(run.channelId);
  if (!channel) return null; // the stage reports a missing channel itself
  const config = await loadResolvedConfig(run, channel);
  const credential = stage === 'intake' || stage === 'publishing' ? await findByChannel(channel.id) : null;
  const issues = await runPreflight(
    {
      stage,
      voice: config.audioDefaultVoice,
      videoKind: config.videoKind,
      targetSeconds: config.targetSeconds,
      secondsPerStill: config.visualSecondsPerStill,
      audioLayer: config.audioDefaultMoodTag,
      maxCostUsd: run.creationOptions?.maxCostUsd,
      publishes: true,
      youtube: { connected: stage === 'video_generation' ? true : Boolean(credential), needsReconnect: Boolean(channel.brandAssets.youtubeAuthError) },
      providers: STAGE_PROVIDERS[stage],
    },
    deps,
  );
  if (issues.length === 0) {
    if (run.creationOptions?.preflightBlock) {
      await updatePipelineRun(run.id, { creationOptionsMerge: { preflightBlock: null } });
    }
    return null;
  }
  const message = describePreflightIssues(issues);
  console.warn(`[preflight] run ${run.id} stage ${stage} blocked: ${message}`);
  return updatePipelineRun(run.id, {
    status: 'needs_attention',
    currentStage: stage,
    lastError: message,
    creationOptionsMerge: { preflightBlock: { stage, at: new Date().toISOString(), issues } },
  });
}
