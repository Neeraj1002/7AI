import { AUDIO_LAYERS, type AudioLayer } from '../agents/video-generation/plan';
import { reusableLongPlanningCheckpoint, type LongPlanningCheckpoint } from '../agents/video-generation/plan-long';
import type { ResolvedChannelConfig } from '../channel-profile';
import type { PipelineRun, PipelineStage, ReviewLog } from '../types';
import { isManualRetryCapReached } from './manual-retries';
import { z } from 'zod';

// A single release-specific remediation, not a general content-error retry exemption.
export function isLegacyPlannerRecoveryCandidate(run: PipelineRun, stage: PipelineStage | null): boolean {
  const output = stage?.output as { longPlanningCheckpoint?: { contractVersion?: unknown } } | null;
  return run.status === 'needs_attention' && run.currentStage === 'video_generation'
    && !run.creationOptions?.plannerContractRecoveryUsed && isManualRetryCapReached(run, 'video_generation')
    && stage?.status === 'failed' && Boolean(output?.longPlanningCheckpoint) && output?.longPlanningCheckpoint?.contractVersion === undefined
    && /^Video production planning for chapter \d+ .*was unusable twice: (received \d+ scenes, exactly \d+ were requested|scene anchors must match)/.test(stage.error ?? '');
}
export function latestPlanningFixNotes(logs: ReviewLog[]): string | undefined {
  return [...logs].reverse().find(log =>
    (log.agent === 'video-intelligence-own-draft' && log.verdict === 'fail')
      || (log.agent === 'human' && log.verdict === 'revise'))?.rationale;
}
export function legacyPlannerRecoveryCheckpoint(run: PipelineRun, stage: PipelineStage | null,
  gate: PipelineStage | null, config: ResolvedChannelConfig, fixNotes?: string): LongPlanningCheckpoint | undefined {
  if (!isLegacyPlannerRecoveryCandidate(run, stage) || config.videoKind !== 'long' || gate?.status !== 'completed') return undefined;
  const approved = z.object({ sanctionedScriptText: z.string(), chapters: z.array(z.object({ title: z.string(), text: z.string() })).min(1) }).safeParse(gate.output);
  const input = stage!.input as { scriptText?: unknown; fixNotes?: unknown } | null;
  if (!approved.success || input?.scriptText !== approved.data.sanctionedScriptText || (input.fixNotes ?? null) !== (fixNotes ?? null)) return undefined;
  const mood = config.audioDefaultMoodTag;
  // Validate the persisted chapters above, but hash their original JSON property order.
  // Zod rebuilds each object as title/text; legacy hashes used the JSONB text/title order.
  const storedChapters = (gate.output as { chapters: typeof approved.data.chapters }).chapters;
  return reusableLongPlanningCheckpoint({ chapters: storedChapters, topic: run.intakeParsed?.topic ?? '',
    targetSeconds: config.targetSeconds, secondsPerStill: config.visualSecondsPerStill,
    visualStyle: config.visualStylePrompt, scriptGuide: config.scriptGuide, fixNotes,
    audioLayerOverride: (AUDIO_LAYERS as readonly string[]).includes(mood ?? '') ? mood as AudioLayer : undefined,
  }, (stage!.output as { longPlanningCheckpoint?: unknown }).longPlanningCheckpoint, true);
}
