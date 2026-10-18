import path from 'node:path';
import fs from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { decryptRefreshToken } from '../models/credential-crypto';
import { approvedFileIdentity, metadataFingerprint } from './publishing-recovery';
import { claimPublishing, mutatePublishingReceipt, observePublishingSuccess,
  markFollowup, readPublishingReceipt, completePublishingReceipt, renewPublishing, savePublishingSession, parkPublishingAmbiguous } from '../models/repositories/publishing-recovery.repository';
import { planCheckpointHash, reusableLongPlan } from './long-plan-checkpoint';
import { prisma } from '../models/prisma-client';
import {
  createPipelineRun,
  findPipelineRunById,
  updatePipelineRun,
} from '../models/repositories/pipeline-run.repository';
import {
  completeStage,
  createSkippedStageAttempt,
  createStageAttempt,
  failStage,
  findLatestAttempt,
  findLatestCompletedAttempt,
  patchStageOutput,
  recordStageProgress,
} from '../models/repositories/pipeline-stage.repository';
import { findChannelById } from '../models/repositories/channel.repository';
import { isR2Configured, uploadToR2 } from '../storage/r2-client';
import { uploadAttemptBundle } from '../storage/attempt-bundle';
import { insertUsageEvent, listStockSourceIdsUsedByRun } from '../models/repositories/usage-event.repository';
import { insertReviewLog, listReviewLogsForRun, updateReviewLogRationale } from '../models/repositories/review-log.repository';
import { isCancellationRequested } from './cancellation-registry';
import { emptyVideoSpend, failedRenderUsage } from '../agents/video-generation/spend';
import { parseBrief, stubParseBrief } from './parse-brief';
import { withRetryAndCircuitBreaker, getStageErrorContext, CircuitBreakerTrippedError, NonTransientStageError } from './retry-with-backoff';
import { resolveMediaPurpose } from '../media';
import { preflightGate } from './preflight-gate';
import { checkBudget, describeBudgetRefusal } from './budget-gate';
import { isInvalidGrant, noteYoutubeAuthFailure, YOUTUBE_RECONNECT_MESSAGE } from '../manage-channels/youtube-auth-health';
import { failedCallMetadata, failureOutputFromError, failureUsageEvents, failureUsageFields, type FailureUsageFields } from './stage-failure';
import { generateScript, ScriptGenerationStoredSchema, type ScriptGenerationOutput } from '../agents/script-generation';
import { evidenceRef, factualBaseline, type EvidenceRef } from '../content-evidence/packet';
import { generationEvidenceSnapshot, reviewEvidenceSnapshot } from '../content-evidence/stage-snapshot';
import { joinChapterTexts, parseChapterSheet } from '../agents/script-generation/long-form';
import {
  reviewScript,
  SCRIPT_REVIEW_AUTO_REJECT_THRESHOLD,
  MAX_SCRIPT_REVIEW_AUTO_RETRY_ATTEMPTS,
  type ScriptReviewOutput,
} from '../agents/script-review';
import { requestGate1Decision } from '../agents/gate1';
import { loadResolvedConfig } from './resolved-config';
import { findLikelyRepeatTopic } from './repeat-topic';
import { listRecentRunTopicsForChannel } from '../models/repositories/pipeline-run.repository';
import { findGate1ApproverForRun } from '../models/repositories/review-log.repository';
import { generateLongVideo } from '../agents/video-generation/long-form';
import { planLongVideoProduction, reusableLongPlanningCheckpoint, type LongPlanningCheckpoint } from '../agents/video-generation/plan-long';
import { assertWithinRunLimit } from './run-budget';
import { describeRetryAllowancePause } from './manual-retries';
import { resolveVoicePace } from './length-forecast';
import { sumUsageCostForRun } from '../models/repositories/usage-event.repository';
import type { ScriptChapter } from '../agents/script-generation/long-form';
import { createStillsProgressReporter } from './stills-progress';
import { generateVideo, type VideoArtifacts, type VideoGenerationOutput, type VideoGenerationUsage } from '../agents/video-generation';
import { planVideoProduction, computeDesiredStillCount, AUDIO_LAYERS, type AudioLayer, type ProductionPlan, type VisualSource } from '../agents/video-generation/plan';
import { reviewVideo, MAX_VIDEO_REGEN_ATTEMPTS } from '../agents/video-intelligence';
import { TIMING_FAILURE_CODES } from '../agents/video-intelligence/quality-metrics';
import { measureQualityMetrics } from '../agents/video-intelligence/quality-metrics';
import { CAPTION_FONT_FAMILY, CAPTION_FONT_FILE } from '../agents/video-generation/captions-ass';
import { requestGate2Decision } from '../agents/gate2';
import { qualityProfileFor, type QualityMetrics } from '../agents/video-generation/quality-spec';
import { briefAllowsBrandMarks } from '../agents/video-generation/scene-prompts';
import { readChapterTimings, findSrtPath } from '../long-form/artifacts';
import { LONG_FORM_DEFAULT_CATEGORY_ID, languageDisplayName } from '../long-form/youtube-meta';
import { AUDIO_BED_MANIFEST } from '../audio-bed';
import { buildChapterList } from '../long-form/chapters';
import { assembleLongFormMetadata } from '../long-form/metadata';
import { creditLinesForBeds, bedsUsed } from '../long-form/credits';
import { prepareLongFormGate2Artifacts } from '../long-form/gate2-artifacts';
import {
  generatePublishingMetadata,
  uploadVideoWithSession,
  uploadCaptions,
  subtitlesFailureMessage,
  CAPTIONS_INSERT_QUOTA_UNITS,
  extractCoverFrame,
  setThumbnail,
  DEFAULT_PRIVACY_STATUS,
  type PublishingMetadata,
  type UploadResult,
  type PrivacyStatus,
} from '../agents/publishing';
import { recordSnapshot } from '../agents/performance-analytics';
import { env } from '../config/env';
import { DATA_DIR } from '../config/paths';
import { SceneMappingSchema, RepairReceiptSchema, prepareVisualRepair, inspectImage,
  type PreparedRepair, type VisualDefect } from './visual-repair';
import { executeVisualRepair } from './visual-repair-render';
import { generateStills } from '../ai-visuals';
import { stillsCacheDir } from '../ai-visuals/cache';
import { STILL_SIZE_LANDSCAPE } from '../ai-visuals/sizes';
import { STAGE_NAMES } from '../types';
import type { CreatePipelineRunInput, IntakeParsed, PipelineRun, StageName } from '../types';

// PipelineRun/PipelineStage state machine — BUSINESS_LOGIC.md Section 1.
// Week 1 only wires up the `intake` stage; every other stage name exists in the
// enum so the state machine doesn't need a schema change when the next agent
// comes online.

export async function createRun(input: CreatePipelineRunInput): Promise<PipelineRun> {
  // Sprint 4 Task 1: snapshot the channel active profile version onto the run;
  // it is never re-read from the channel later in the run life.
  const channel = await findChannelById(input.channelId);
  return createPipelineRun(input, channel?.activeProfileVersionId ?? null);
}

function nextStageAfter(stage: StageName): StageName | null {
  const idx = STAGE_NAMES.indexOf(stage);
  return idx >= 0 && idx + 1 < STAGE_NAMES.length ? STAGE_NAMES[idx + 1] : null;
}

// B1 fix (KNOWN_ISSUES_AND_BLOCKERS.md §2, "completeStage/currentStage write
// race"): a stage's completion and the PipelineRun's advance to the next
// stage (or, on the error path below, to `needs_attention`) were two
// separate awaited writes — a crash between them could leave `currentStage`
// one step behind what `pipeline_stages` actually shows. Every call site
// below now wraps both writes (and, where one sits between them, a
// `ReviewLog` insert that's part of the same "this stage's outcome is now
// durable" unit) in a single Prisma interactive transaction, so they commit
// or roll back together.
//
// Every function's error path does the exact same thing (fail the stage,
// escalate the run to `needs_attention`), so it's pulled into one shared,
// transactional helper rather than repeated nine times.
// Bugs Task 7 (R1) — a CircuitBreakerTrippedError's own message is only the
// generic "failed after N retries"; the real cause (ffmpeg, TTS, footage
// API...) lives on its lastError. Append it so stage.errorMessage and
// run.lastError actually say what broke.
function describeStageError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof CircuitBreakerTrippedError && error.lastError !== undefined) {
    const cause = error.lastError instanceof Error ? error.lastError.message : String(error.lastError);
    return `${message}: ${cause}`;
  }
  return message;
}

async function failStageAndEscalate(stageId: string, runId: string, error: unknown, preservedOutput?: Record<string, unknown>): Promise<PipelineRun> {
  let message = describeStageError(error);
  // Bugs Task 12 (R13) - an expired YouTube token says so in plain words (technical text kept after it)
  // and flags the channel "Reconnect needed".
  if (isInvalidGrant(error)) {
    const failedRun = await findPipelineRunById(runId).catch(() => null);
    if (failedRun) await noteYoutubeAuthFailure(failedRun.channelId, error);
    message = `${YOUTUBE_RECONNECT_MESSAGE} (${message})`;
  }
  console.error(`[pipeline] run ${runId}: stage ${stageId} failed — ${message}`);
  return prisma.$transaction(async (tx) => {
    const diagnostics = failureOutputFromError(error);
    await failStage(stageId, message, tx, preservedOutput ? { ...preservedOutput, ...diagnostics } : diagnostics);
    return await updatePipelineRun(runId, { status: 'needs_attention', lastError: message }, tx);
  });
}

// Runs (or re-runs, on resume) the intake stage for a run. Safe to call again on
// the same run: it always reads `run.briefText` fresh and starts a new stage
// attempt, so a crash-and-retry never assumes partial work happened
// (BUSINESS_LOGIC.md's "idempotent resume" rule).
// Sprint 4 Task 5 (R20, B16): compares the new topic with the channel's recent runs
// and, on a likely repeat, stores it on the intake stage's own output as
// `repeatTopic` (additive Json, no migration). Gate 1's message and runs.get both
// read it from there, so the warning survives a restart and is no longer only a
// line in one notification. It must never fail the run: any error is logged and
// treated as "no warning".
async function recordRepeatTopicWarning(
  runId: string,
  channelId: string,
  intakeStageId: string,
  topic: string,
): Promise<void> {
  try {
    const recent = await listRecentRunTopicsForChannel(channelId, 20, runId);
    const match = findLikelyRepeatTopic(topic, recent);
    if (match) {
      await patchStageOutput(intakeStageId, {
        repeatTopic: { runId: match.runId, topic: match.topic, createdAt: match.createdAt.toISOString() },
      });
    }
  } catch (error) {
    console.error(`[intake] run ${runId}: repeat-topic check failed (non-blocking): ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function runIntakeStage(runId: string): Promise<PipelineRun> {
  const run = await findPipelineRunById(runId);
  if (!run) {
    throw new Error(`PipelineRun ${runId} not found`);
  }

  await updatePipelineRun(runId, {
    status: 'running',
    currentStage: 'intake',
    startedAt: run.startedAt ?? new Date(),
  });
  // Sprint 5 Task 8 (R2): settings and accounts are checked while nothing has been spent.
  const preflightBlocked = await preflightGate(run, 'intake');
  if (preflightBlocked) return preflightBlocked;

  const previousAttempt = await findLatestAttempt(runId, 'intake');
  const attemptNumber = previousAttempt ? previousAttempt.attemptNumber + 1 : 1;
  const stage = await createStageAttempt({
    pipelineRunId: runId,
    stageName: 'intake',
    attemptNumber,
    input: { briefText: run.briefText },
  });

  const intakeProcessor = env.INTAKE_STAGE_STUB === '1' ? stubParseBrief : parseBrief;

  // Every real LLM call this makes — including each retry, not just the
  // final outcome — writes its own UsageEvent row, success or failure (same
  // per-attempt metering pattern as every other stage). Week 5 Task 5 fix:
  // Intake previously never metered its spend at all, unlike every other
  // stage since Week 1 — undercounting real spend against every budget check.
  const attemptOnce = async (): Promise<IntakeParsed> => {
    try {
      const { output, llm } = await intakeProcessor(run.briefText);
      await insertUsageEvent({
        tenantId: run.tenantId,
        channelId: run.channelId,
        pipelineRunId: runId,
        stageId: stage.id,
        agent: 'intake',
        provider: llm.provider,
        model: llm.model,
        inputTokens: llm.usage.inputTokens,
        outputTokens: llm.usage.outputTokens,
        costUsd: llm.costUsd,
      });
      return output;
    } catch (error) {
      await insertUsageEvent({
        tenantId: run.tenantId,
        channelId: run.channelId,
        pipelineRunId: runId,
        stageId: stage.id,
        agent: 'intake',
        ...failureUsageFields(error),
      });
      throw error;
    }
  };

  try {
    const output = await withRetryAndCircuitBreaker(attemptOnce);

    // Persist-before-advance: the stage's completion and the run's advance are
    // written together, in one transaction — this is what makes resumability
    // possible after a restart, without a window where currentStage lags what
    // pipeline_stages actually shows (B1 fix).
    const advanced = await prisma.$transaction(async (tx) => {
      await completeStage(stage.id, output, tx);
      return await updatePipelineRun(
        runId,
        {
          intakeParsed: output,
          // Advances to the next stage in sequence even though no processor exists
          // for it yet this week — a Week 1 test run stops here deliberately.
          currentStage: nextStageAfter('intake'),
        },
        tx,
      );
    });
    // Sprint 4 Task 5 (R20/B16): best-effort, after the stage is already durable.
    await recordRepeatTopicWarning(runId, run.channelId, stage.id, output.topic);
    return advanced;
  } catch (error) {
    // A bad/unparseable brief, or an exhausted circuit breaker, is a
    // human-fixable input problem — needs_attention, not failed.
    return await failStageAndEscalate(stage.id, runId, error);
  }
}

// Runs (or re-runs, on resume) the script_generation stage — Week 2 Task 4,
// the first real agent (as opposed to Orchestrator-owned Intake) and the
// first real money spent in the system. See
// docs/execution/week2/BUSINESS_LOGIC.md Section 2 for the exact transition
// and cost-gate rules.
export async function runScriptGenerationStage(runId: string): Promise<PipelineRun> {
  const run = await findPipelineRunById(runId);
  if (!run) {
    throw new Error(`PipelineRun ${runId} not found`);
  }
  if (!run.intakeParsed) {
    throw new Error(`PipelineRun ${runId} has no intakeParsed output — run intake before script_generation`);
  }

  const channel = await findChannelById(run.channelId);
  if (!channel) {
    throw new Error(`Channel ${run.channelId} not found`);
  }

  await updatePipelineRun(runId, {
    status: 'running',
    currentStage: 'script_generation',
  });

  const previousAttempt = await findLatestAttempt(runId, 'script_generation');
  const attemptNumber = previousAttempt ? previousAttempt.attemptNumber + 1 : 1;

  // Bugs Task 6 (R1) — same live-lookup shape as runVideoGenerationStage's
  // own fixNotes resolution (not persisted via creationOptions): on a retry
  // (attemptNumber > 1), find the most recent auto-reject ReviewLog Bugs
  // Task 3/R3 already writes and forward its rationale. undefined on a
  // genuine first attempt — no review exists yet to have rejected anything.
  let fixNotes: string | undefined;
  if (attemptNumber > 1) {
    const reviewLogs = await listReviewLogsForRun(runId);
    const latestAutoReject = [...reviewLogs]
      .reverse()
      .find((log) => log.agent === 'script-review' && log.verdict === 'auto-reject');
    fixNotes = latestAutoReject?.rationale;
  }

  // Sprint 4 Task 2: guide, length, fact policy and banned lists come from the
  // resolved config of the profile this run was created against.
  const config = await loadResolvedConfig(run, channel);
  const evidenceSelection = generationEvidenceSnapshot({ previousInput: previousAttempt?.input,
    previousOutput: previousAttempt?.output, briefText: run.briefText, factPolicy: config.factPolicy,
    sources: run.creationOptions?.sources, videoKind: config.videoKind });
  const stageInput = {
    topic: run.intakeParsed.topic,
    constraints: run.intakeParsed.constraints,
    styleGuide: config.scriptGuide,
    // Run override (Sprint 3 Task 9), else profile, else the platform default 45.
    targetSeconds: config.targetSeconds,
    fixNotes: fixNotes ?? null,
    ...(evidenceSelection.briefText !== undefined && { briefText: evidenceSelection.briefText }),
    ...(evidenceSelection.factPolicy !== undefined && { factPolicy: evidenceSelection.factPolicy }),
    ...(evidenceSelection.sources !== undefined && { sources: evidenceSelection.sources }),
    ...(evidenceSelection.evidence && { evidence: evidenceSelection.evidence }),
    evidenceProvenance: evidenceSelection.provenance,
    bannedOpeners: config.bannedOpeners,
    bannedEndings: config.bannedEndings,
    scriptStructure: config.formatScriptStructure,
    // Sprint 4 Task 9 (R2): only a long run adds these, so a Short's stage input is unchanged.
    ...(config.videoKind === 'long' && { videoKind: 'long' as const }),
  };

  // Cost gate (BUSINESS_LOGIC.md Section 2) — checked before a real stage
  // attempt exists at all. A refused call is recorded as `skipped`, never
  // silently dropped and never a `failed` attempt (nothing actually ran).
  const budget = await checkBudget(run.tenantId, channel.id, channel.platform);
  if (!budget.ok) {
    const budgetText = describeBudgetRefusal(budget);
    await createSkippedStageAttempt({
      pipelineRunId: runId,
      stageName: 'script_generation',
      attemptNumber,
      input: stageInput,
      reason: budgetText,
    });
    // Bugs Task 6 (R2) — a budget refusal on a genuine first attempt is
    // unchanged (needs_attention: no partial progress or review history
    // exists yet to hand a human). A refusal mid-retry (attemptNumber > 1)
    // is arguably the same kind of normal, expected outcome as hitting the
    // auto-retry cap (Bugs Task 3/R3) — not a bug — so it's routed the same
    // way: paused_gate1 with the last available draft/score, flagged with a
    // note appended to the run's most recent review rationale (no fresh
    // review ran this attempt to attach the note to directly, unlike the
    // cap-reached case).
    // Bugs Task 10 (R1) — attemptNumber > 1 alone isn't proof a draft exists:
    // a manual Retry after a first-attempt refusal is attempt 2 with only
    // skipped rows behind it, and routing that to Gate 1 left a run that
    // could never open its gate (41bdf456 errored on every boot). Only hand
    // Gate 1 a run that actually has a completed draft and a review.
    const lastDraft = attemptNumber > 1 ? await findLatestCompletedAttempt(runId, 'script_generation') : null;
    const reviewLogs = lastDraft ? await listReviewLogsForRun(runId) : [];
    const latestReview = [...reviewLogs].reverse().find((log) => log.agent === 'script-review');
    if (lastDraft && latestReview) {
      await updateReviewLogRationale(
        latestReview.id,
        `${latestReview.rationale} [Budget ceiling reached during auto-retry — sent to Gate 1 with the last available draft despite low score.]`,
      );
      return await updatePipelineRun(runId, {
        status: 'paused_gate1',
        currentStage: nextStageAfter('script_review'),
      });
    }
    return await updatePipelineRun(runId, {
      status: 'needs_attention',
      lastError: `Script Generation refused: ${budgetText}`,
    });
  }

  const stage = await createStageAttempt({
    pipelineRunId: runId,
    stageName: 'script_generation',
    attemptNumber,
    input: stageInput,
  });

  // Every real LLM call this makes — including each retry, not just the final
  // outcome — writes its own UsageEvent row, success or failure (Design
  // Principle 7). Wrapping the metering *inside* the retried function (rather
  // than once around the whole withRetryAndCircuitBreaker call) is what makes
  // that true instead of undercounting retried spend.
  const attemptOnce = async (): Promise<ScriptGenerationOutput> => {
    // Bugs Task 11 (R2/R3) — one UsageEvent per model call, success or failure:
    // a generation that retried inside this attempt made two real calls, and a
    // reply rejected after its call completed still cost what the call cost.
    const bookCalls = async (spent: FailureUsageFields[]): Promise<void> => {
      for (const call of spent) {
        await insertUsageEvent({
          tenantId: run.tenantId,
          channelId: run.channelId,
          pipelineRunId: runId,
          stageId: stage.id,
          agent: 'script-generation',
          ...call,
        });
      }
    };
    try {
      const { output, calls } = await generateScript({
        topic: stageInput.topic,
        constraints: stageInput.constraints,
        styleGuide: stageInput.styleGuide,
        targetSeconds: stageInput.targetSeconds,
        fixNotes: fixNotes ?? undefined,
        briefText: stageInput.briefText,
        factPolicy: stageInput.factPolicy,
        bannedOpeners: stageInput.bannedOpeners,
        bannedEndings: stageInput.bannedEndings,
        scriptStructure: stageInput.scriptStructure,
        ...(stageInput.evidence && { evidence: stageInput.evidence }),
        ...(stageInput.sources !== undefined && { sources: stageInput.sources }),
        ...(config.videoKind === 'long' && { videoKind: 'long' as const, wordsPerMinute: (await resolveVoicePace(run.tenantId, config.audioDefaultVoice)).wordsPerMinute }),
      });
      await bookCalls(
        calls.map((llm) => ({
          provider: llm.provider,
          model: llm.model,
          inputTokens: llm.usage.inputTokens,
          outputTokens: llm.usage.outputTokens,
          costUsd: llm.costUsd,
        })),
      );
      return stageInput.evidence ? { ...output, evidenceRef: evidenceRef(stageInput.evidence) } : output;
    } catch (error) {
      await bookCalls(failureUsageEvents(error));
      throw error;
    }
  };

  try {
    const output = await withRetryAndCircuitBreaker(attemptOnce);

    return await prisma.$transaction(async (tx) => {
      await completeStage(stage.id, output, tx);
      return await updatePipelineRun(
        runId,
        {
          // Advances to script_review even though Task 5 is what actually
          // processes it — same "stops here deliberately" pattern as Week 1.
          currentStage: 'script_review',
        },
        tx,
      );
    });
  } catch (error) {
    return await failStageAndEscalate(stage.id, runId, error);
  }
}

// Runs (or re-runs, on resume, or on a Bugs Task 3 auto-retry loop-back) the
// script_review stage — Week 2 Task 5, score-gated by Bugs Task 3 (R3). A
// genuine technical failure (LLM error, malformed output) still routes to
// needs_attention; a low *score* is a review outcome, not a stage failure,
// but it now loops back into a fresh script_generation attempt instead of
// reaching Gate 1 — see the runPatch computation below.
// See docs/execution/week2/BUSINESS_LOGIC.md Section 3.
export async function runScriptReviewStage(runId: string): Promise<PipelineRun> {
  const run = await findPipelineRunById(runId);
  if (!run) {
    throw new Error(`PipelineRun ${runId} not found`);
  }

  const channel = await findChannelById(run.channelId);
  if (!channel) {
    throw new Error(`Channel ${run.channelId} not found`);
  }

  const scriptGenStage = await findLatestAttempt(runId, 'script_generation');
  if (!scriptGenStage || scriptGenStage.status !== 'completed' || !scriptGenStage.output) {
    throw new Error(
      `PipelineRun ${runId} has no completed script_generation output — run script_generation before script_review`,
    );
  }
  const scriptOutput: ScriptGenerationOutput = ScriptGenerationStoredSchema.parse(scriptGenStage.output);
  const reviewEvidence = reviewEvidenceSnapshot(scriptGenStage.input, scriptGenStage.output);

  await updatePipelineRun(runId, {
    status: 'running',
    currentStage: 'script_review',
  });

  const previousAttempt = await findLatestAttempt(runId, 'script_review');
  const attemptNumber = previousAttempt ? previousAttempt.attemptNumber + 1 : 1;
  const config = await loadResolvedConfig(run, channel);
  const stageInput = {
    scriptText: scriptOutput.scriptText,
    captions: scriptOutput.captions,
    nicheDescription: channel.nicheDescription,
    styleGuide: config.scriptGuide,
    ...(reviewEvidence.briefText !== undefined && { briefText: reviewEvidence.briefText }),
    ...(reviewEvidence.evidence && { evidence: reviewEvidence.evidence }),
    evidenceProvenance: reviewEvidence.provenance,
    targetSeconds: config.targetSeconds,
    bannedOpeners: config.bannedOpeners,
    bannedEndings: config.bannedEndings,
    // Sprint 4 Task 10 (R1): the long-form rubric inputs; a Short's stage input is unchanged.
    ...(config.videoKind === 'long' && {
      videoKind: 'long' as const,
      chapterTitles: (scriptOutput.chapters ?? []).map((c) => c.title),
      ...((scriptOutput as { lengthOutOfRange?: boolean }).lengthOutOfRange && { lengthOutOfRange: true }),
    }),
  };

  const stage = await createStageAttempt({
    pipelineRunId: runId,
    stageName: 'script_review',
    attemptNumber,
    input: stageInput,
  });

  // Same per-attempt metering pattern as Script Generation — every real LLM
  // call, including retries, writes its own UsageEvent row.
  const attemptOnce = async (): Promise<ScriptReviewOutput & { evidenceRef?: EvidenceRef }> => {
    try {
      const { output, llm } = await reviewScript(stageInput);
      await insertUsageEvent({
        tenantId: run.tenantId,
        channelId: run.channelId,
        pipelineRunId: runId,
        stageId: stage.id,
        agent: 'script-review',
        provider: llm.provider,
        model: llm.model,
        inputTokens: llm.usage.inputTokens,
        outputTokens: llm.usage.outputTokens,
        costUsd: llm.costUsd,
      });
      return stageInput.evidence ? { ...output, evidenceRef: evidenceRef(stageInput.evidence) } : output;
    } catch (error) {
      await insertUsageEvent({
        tenantId: run.tenantId,
        channelId: run.channelId,
        pipelineRunId: runId,
        stageId: stage.id,
        agent: 'script-review',
        ...failureUsageFields(error),
      });
      throw error;
    }
  };

  try {
    const output = await withRetryAndCircuitBreaker(attemptOnce);

    // Bugs Task 3 (R3) — same attemptNumber-based cap idiom
    // runVideoReviewStage's own regen-cap decision already uses (below):
    // computed once, up front, so every branch inside the transaction
    // applies the exact same patch it would have applied outside one. Unlike
    // the video-review cap (which escalates to needs_attention), exceeding
    // this cap still reaches a human at Gate 1 — a genuinely hard brief
    // shouldn't fail silently, per the founder's own instruction for this
    // fix.
    const belowThreshold = output.score < SCRIPT_REVIEW_AUTO_REJECT_THRESHOLD;
    const autoRejectAndRetry = belowThreshold && attemptNumber <= MAX_SCRIPT_REVIEW_AUTO_RETRY_ATTEMPTS;
    const autoRetryCapReached = belowThreshold && !autoRejectAndRetry;

    // Sprint 3 Task 9 (R2) — only the passing-score outcome is affected by
    // the toggle; the below-threshold retry loop and the cap-reached-to-Gate-1
    // fallback (autoRetryCapReached, above) are deliberately untouched — a
    // channel that disabled Gate 1 still gets a human look at a script that
    // never managed to clear the review bar.
    const gate1AutoApprove = !belowThreshold && channel.approvalGateConfig.gate1Enabled === false;
    // Created here (not inside the completing transaction below), mirroring
    // every other stage's own createStageAttempt-then-complete split — only
    // the completion + ReviewLog + run-advance need to commit atomically.
    // Shaped exactly like runGate1Stage's own approve-outcome gate1 row, so
    // runVideoReviewStage/runPublishingStage's later reads of it can't tell
    // an auto-approve apart from a human one.
    const gate1AutoApproveStage = gate1AutoApprove
      ? await createStageAttempt({
          pipelineRunId: runId,
          stageName: 'gate1',
          attemptNumber: ((await findLatestAttempt(runId, 'gate1'))?.attemptNumber ?? 0) + 1,
          input: { scriptText: scriptOutput.scriptText, reviewScore: String(output.score) },
        })
      : null;

    const runPatch: Parameters<typeof updatePipelineRun>[1] = autoRejectAndRetry
      ? { status: 'running', currentStage: 'script_generation' }
      : gate1AutoApproveStage
        ? { status: 'running', currentStage: nextStageAfter('gate1') }
        : { status: 'paused_gate1', currentStage: nextStageAfter('script_review') };

    // The stage always completes once a well-formed review comes back,
    // regardless of score — a low score is a review outcome, not a stage
    // failure. Stage completion, the ReviewLog entry/entries, and the run's
    // next transition all commit as one transaction (B1 fix) — a crash
    // between them used to risk a completed stage with no ReviewLog row,
    // which gate1 depends on to find the review score/notes.
    return await prisma.$transaction(async (tx) => {
      await completeStage(stage.id, output, tx);

      const flagsNote =
        output.videoGenFit.flags.length > 0
          ? ` Video-gen-fit flags: ${output.videoGenFit.flags.join('; ')}.`
          : '';
      // Sprint 4 Task 2: factualConcerns and styleGuideViolations are no longer
      // folded into this rationale. Gate 1 renders them as their own labelled
      // blocks from the stage output, and runs.get returns them as
      // `scriptReview`; keeping them here too would show each twice.
      // G3 (Sprint 2 Task 4): same reasoning — the hook score/notes reach
      // the founder at Gate 1 in the same rationale text, not just the raw
      // stage output only a direct DB query would surface.
      const hookNote = ` Hook (first 1-2s) score: ${output.hookScore}/10 — ${output.hookNotes}`;
      // R3: when the auto-retry cap is reached, this is the ReviewLog whose
      // rationale runGate1Stage reads as reviewNotes — flag it here so the
      // founder sees why a low-scoring script still reached Gate 1.
      const autoRetryCapNote = autoRetryCapReached
        ? ` [Auto-retry limit reached (${MAX_SCRIPT_REVIEW_AUTO_RETRY_ATTEMPTS}) — sent to Gate 1 despite low score.]`
        : '';
      await insertReviewLog(
        {
          tenantId: run.tenantId,
          channelId: run.channelId,
          pipelineRunId: runId,
          stageId: stage.id,
          agent: 'script-review',
          verdict: String(output.score),
          rationale: `${output.notes}${flagsNote}${hookNote}${autoRetryCapNote}`,
        },
        tx,
      );

      // R3: a separate, clearly-labeled row recording the auto-reject
      // decision itself — kept distinct from the score-verdict row above so
      // "what was the review" and "what did the system do about it" are two
      // separately readable facts in the run's history, not conflated.
      if (autoRejectAndRetry) {
        await insertReviewLog(
          {
            tenantId: run.tenantId,
            channelId: run.channelId,
            pipelineRunId: runId,
            stageId: stage.id,
            agent: 'script-review',
            verdict: 'auto-reject',
            rationale: output.notes,
          },
          tx,
        );
      }

      // Sprint 3 Task 9 (R2) — completes the synthetic gate1 row created
      // above with the exact same output shape runGate1Stage's own approve
      // path writes, and a separate agent:'system' ReviewLog row (distinct
      // from the script-review score row above, same "what was the review"
      // vs "what did the system do about it" split R3 already established)
      // so the run's history plainly shows Gate 1 was skipped, not silently
      // absent.
      if (gate1AutoApproveStage) {
        await completeStage(
          gate1AutoApproveStage.id,
          {
            outcome: 'approve',
            sanctionedScriptText: scriptOutput.scriptText,
            ...(scriptOutput.chapters && { chapters: scriptOutput.chapters }),
          },
          tx,
        );
        await insertReviewLog(
          {
            tenantId: run.tenantId,
            channelId: run.channelId,
            pipelineRunId: runId,
            stageId: gate1AutoApproveStage.id,
            agent: 'system',
            verdict: 'auto-approve',
            rationale: `Gate 1 disabled for this channel — auto-approved a passing script-review score of ${output.score}.`,
          },
          tx,
        );
      }

      return await updatePipelineRun(runId, runPatch, tx);
    });
  } catch (error) {
    return await failStageAndEscalate(stage.id, runId, error);
  }
}

// Runs (or re-runs, on resume) the gate1 stage — Week 2 Task 6. By the time
// this is called, `PipelineRun.status` is already `paused_gate1` (Task 5's
// completion sets it); this function sends the gate message, blocks on
// `requestGate1Decision`, and dispatches one of the three reply outcomes.
// See docs/execution/week2/BUSINESS_LOGIC.md Section 4.
export async function runGate1Stage(runId: string): Promise<PipelineRun> {
  const run = await findPipelineRunById(runId);
  if (!run) {
    throw new Error(`PipelineRun ${runId} not found`);
  }

  const channel = await findChannelById(run.channelId);
  if (!channel) {
    throw new Error(`Channel ${run.channelId} not found`);
  }

  const config = await loadResolvedConfig(run, channel);
  const scriptGenStage = await findLatestCompletedAttempt(runId, 'script_generation');
  if (!scriptGenStage || scriptGenStage.status !== 'completed' || !scriptGenStage.output) {
    throw new Error(`PipelineRun ${runId} has no completed script_generation output — cannot open Gate 1`);
  }
  const scriptOutput: ScriptGenerationOutput = ScriptGenerationStoredSchema.parse(scriptGenStage.output);

  const reviewLogs = await listReviewLogsForRun(runId);
  const latestReview = [...reviewLogs].reverse().find((log) => log.agent === 'script-review');
  if (!latestReview) {
    throw new Error(`PipelineRun ${runId} has no script-review ReviewLog — cannot open Gate 1`);
  }

  const previousAttempt = await findLatestAttempt(runId, 'gate1');

  // Restart-safety (Week 5 Task 3, KNOWN_ISSUES_AND_BLOCKERS.md): a
  // 'running' gate1 attempt already exists when this run was paused_gate1
  // and the process restarted (resume-on-startup.ts re-invokes this
  // function). Reuse that same attempt — re-sending the gate prompt and
  // re-registering the pending reply — rather than creating a second one;
  // the DB record of "gate1 is open" doesn't need to change, only the
  // in-memory pending-reply state does.
  const isRestartReopen = previousAttempt !== null && previousAttempt.status === 'running';
  const stage =
    previousAttempt && previousAttempt.status === 'running'
      ? previousAttempt
      : await createStageAttempt({
          pipelineRunId: runId,
          stageName: 'gate1',
          attemptNumber: previousAttempt ? previousAttempt.attemptNumber + 1 : 1,
          input: { scriptText: scriptOutput.scriptText, reviewScore: latestReview.verdict },
        });

  if (isRestartReopen) {
    console.log(
      `[gate1] run ${runId}: re-opening an already-pending gate1 attempt ${stage.attemptNumber} after a restart — re-sending the prompt`,
    );
  }

  // Bugs Task 12 (R5c) - same invariant as Gate 2: never 'running' at a gate.
  if (run.status !== 'paused_gate1' || run.currentStage !== 'gate1') {
    await updatePipelineRun(runId, { status: 'paused_gate1', currentStage: 'gate1' });
  }

  // Blocks here until a reply arrives (or, per Task 6's founder-availability
  // note, a simulated one is fed in for testing) — this is the "pause" that
  // PipelineRun.status = 'paused_gate1' represents.
  // Sprint 4 Task 2 (R8): concerns/violations from the latest completed review,
  // sources from the run's explicit creationOptions.
  const reviewStage = await findLatestCompletedAttempt(runId, 'script_review');
  const reviewOut = (reviewStage?.output ?? {}) as { factualConcerns?: string[]; styleGuideViolations?: string[] };
  const intakeStage = await findLatestCompletedAttempt(runId, 'intake');
  const repeatTopic = (intakeStage?.output as { repeatTopic?: { topic: string; createdAt: string } } | null | undefined)?.repeatTopic ?? null;
  const outcome = await requestGate1Decision({
    runId,
    channel,
    channelName: channel.name,
    briefText: run.briefText,
    scriptText: scriptOutput.scriptText,
    reviewScore: latestReview.verdict,
    reviewNotes: latestReview.rationale,
    restarted: isRestartReopen,
    factualConcerns: reviewOut.factualConcerns,
    styleGuideViolations: reviewOut.styleGuideViolations,
    sources: run.creationOptions?.sources,
    repeatTopic,
  });

  const recordGate1Outcome = async (): Promise<PipelineRun> => {
    if (outcome.type === 'reject') {
      return await prisma.$transaction(async (tx) => {
        await insertReviewLog(
          {
            tenantId: run.tenantId,
            channelId: run.channelId,
            pipelineRunId: runId,
            stageId: stage.id,
            agent: 'human',
            approvedByUserId: outcome.approvedByUserId,
            verdict: 'reject',
            rationale: outcome.reason,
          },
          tx,
        );
        await completeStage(stage.id, { outcome: 'reject', reason: outcome.reason }, tx);
        return await updatePipelineRun(
          runId,
          {
            status: 'failed',
            lastError: `Rejected at Gate 1: ${outcome.reason}`,
          },
          tx,
        );
      });
    }

    // On edit, the edited text — not the original AI output — becomes the
    // sanctioned input for whatever reads gate1's stage output next. The
    // original stays in script_generation's own stage row, never overwritten.
    // Sprint 4 Task 9 (R2.5): on a long run the edit sheet is "## Title" + text per chapter; it is parsed
    // back into chapters (runs.gate1 already refused fewer than 3), and the sanctioned text is their
    // concatenation, as for a script that was never edited.
    let sanctionedChapters = scriptOutput.chapters;
    let sanctionedScriptText = outcome.type === 'edit' ? outcome.editedScriptText : scriptOutput.scriptText;
    if (outcome.type === 'edit' && config.videoKind === 'long') {
      const parsed = parseChapterSheet(outcome.editedScriptText);
      if (!parsed.ok) throw new NonTransientStageError(parsed.message);
      sanctionedChapters = parsed.chapters;
      sanctionedScriptText = joinChapterTexts(parsed.chapters);
    }

    return await prisma.$transaction(async (tx) => {
      await insertReviewLog(
        {
          tenantId: run.tenantId,
          channelId: run.channelId,
          pipelineRunId: runId,
          stageId: stage.id,
          agent: 'human',
          approvedByUserId: outcome.approvedByUserId,
          verdict: outcome.type,
          rationale: outcome.type === 'edit' ? 'Founder submitted an edited script' : 'Approved as-is',
          editedOutput: outcome.type === 'edit' ? { scriptText: outcome.editedScriptText } : undefined,
        },
        tx,
      );

      await completeStage(
        stage.id,
        { outcome: outcome.type, sanctionedScriptText, ...(sanctionedChapters && { chapters: sanctionedChapters }) },
        tx,
      );

      return await updatePipelineRun(
        runId,
        {
          status: 'running',
          currentStage: nextStageAfter('gate1'),
        },
        tx,
      );
    });
  };

  // Bugs Task 9 (R2) — the pending reply is consumed the moment it arrives, so if
  // recording it failed (seen live: Prisma P2028, transaction expired) the run sat
  // at paused_gate1 with no live gate — Approve/Reject did nothing until a
  // restart. Re-open the same attempt instead (the running stage row is reused),
  // so the founder can simply answer again.
  try {
    return await recordGate1Outcome();
  } catch (error) {
    console.error(`[gate1] run ${runId}: recording the Gate 1 decision failed — re-opening the gate:`, error);
    return runGate1Stage(runId);
  }
}

// Runs (or re-runs, on resume/regen) the video_generation stage — Week 3 Task
// 2, extended by Week 4 Task 1 with a production-planning step ahead of
// assembly (docs/decisions/VIDEO_GENERATION_LOOP_AND_VISUAL_STRATEGY.md).
// Same budget-gate + per-attempt-metering pattern as Script Generation (Week
// 2 Task 4), now also gating the pipeline's most expensive stage. See
// docs/execution/week3/BUSINESS_LOGIC.md Section 2.
//
// `testOverrides.forcedPlan` exists solely for scripts/dry-run.ts's
// regression-test command (Week 4 Task 1's acceptance criterion: reproduce
// Week 3 Task 3's real flashing-caption failure). It skips the real planning
// LLM call — and writes no UsageEvent row for it — to deterministically
// reproduce a known-bad plan shape on attempt 1; every other caller
// (resume-on-startup.ts, every other dry-run command) never passes it, so a
// real run always makes a real planning call, including on regen.

// Sprint 2 Task 3 (F1) — narrows creationOptions.audioLayer (stored as a
// plain string) against the real AUDIO_LAYERS list, same reasoning as
// visualSource's own narrowing below: an unrecognized value is "no
// override," never trusted via a blind cast.
function resolveAudioLayerOverride(value: string | undefined): AudioLayer | undefined {
  return (AUDIO_LAYERS as readonly string[]).includes(value ?? '') ? (value as AudioLayer) : undefined;
}
export async function runVideoGenerationStage(
  runId: string,
  testOverrides?: { forcedPlan?: ProductionPlan },
): Promise<PipelineRun> {
  const run = await findPipelineRunById(runId);
  if (!run) {
    throw new Error(`PipelineRun ${runId} not found`);
  }
  if (!run.intakeParsed) {
    throw new Error(`PipelineRun ${runId} has no intakeParsed output — cannot plan video production`);
  }

  const channel = await findChannelById(run.channelId);
  if (!channel) {
    throw new Error(`Channel ${run.channelId} not found`);
  }

  const gate1Stage = await findLatestAttempt(runId, 'gate1');
  if (!gate1Stage || gate1Stage.status !== 'completed' || !gate1Stage.output) {
    throw new Error(`PipelineRun ${runId} has no completed gate1 output — cannot run video_generation`);
  }
  const sanctionedScriptText = (gate1Stage.output as { sanctionedScriptText?: string }).sanctionedScriptText;
  if (!sanctionedScriptText) {
    throw new Error(`PipelineRun ${runId}'s gate1 output has no sanctionedScriptText`);
  }

  // On a regen attempt, forward the most recent video_review fail's fix
  // notes (Task 3, verdict='fail') or a founder's Gate 2 revision notes
  // (Task 4, verdict='revise') — absent on a fresh run, since neither of
  // those exists yet the first time through.
  const reviewLogs = await listReviewLogsForRun(runId);
  const latestFixNotesLog = [...reviewLogs]
    .reverse()
    .find(
      (log) =>
        (log.agent === 'video-intelligence-own-draft' && log.verdict === 'fail') ||
        (log.agent === 'human' && log.verdict === 'revise'),
    );
  const fixNotes = latestFixNotesLog?.rationale;

  // Sprint 2 Task 1 (D2) — the three-step creation-option resolution order:
  // an explicit per-run override always wins, else the channel's own
  // default, else media/registry.ts's unchanged hardcoded fallback.
  // Resolved to a concrete value here (never left as an unresolved override
  // or null) so generateVideo/synthesizeSpeech always receive something
  // real, regardless of which of the three cases applied.
  // Sprint 4 Task 3: the resolved config adds the profile level between the run
  // override and the channel default; a profile-less channel resolves exactly as
  // resolveVoice did before.
  const config = await loadResolvedConfig(run, channel);
  const resolvedVoice = config.audioDefaultVoice;
  // Sprint 4 Task 9: a long run narrates, plans and renders chapter by chapter, with its per-video spend
  // limit checked between paid calls. A Short takes none of these branches.
  const isLong = config.videoKind === 'long';
  const maxCostUsd = run.creationOptions?.maxCostUsd;
  // Awaited between paid calls. It also honours a Cancel: the runner only looks for one between
  // stages, and a long video's stage runs for tens of minutes, so without this a cancelled run would
  // keep paying for stills until the stage ended.
  const runLimitGuard = isLong
    ? async (nextCallUsd?: number) => {
        if (isCancellationRequested(runId)) throw new NonTransientStageError('Cancelled by user');
        if (maxCostUsd) await assertWithinRunLimit(runId, maxCostUsd, undefined, nextCallUsd ?? 0);
      }
    : undefined;
  const sanctionedChapters = isLong ? (gate1Stage.output as { chapters?: ScriptChapter[] }).chapters : undefined;
  if (isLong && (!sanctionedChapters || sanctionedChapters.length === 0)) {
    throw new Error(`PipelineRun ${runId} gate1 output has no chapters, cannot render a long-form video`);
  }

  await updatePipelineRun(runId, {
    status: 'running',
    currentStage: 'video_generation',
  });
  // Sprint 5 Task 8 (R2): voice, accounts, music and spend are checked before the stage row or any
  // paid call; a failure parks the run with a plain message and leaves the attempt count alone.
  const preflightBlocked = await preflightGate(run, 'video_generation');
  if (preflightBlocked) return preflightBlocked;

  const previousAttempt = await findLatestAttempt(runId, 'video_generation');
  const attemptNumber = previousAttempt ? previousAttempt.attemptNumber + 1 : 1;
  const generationForBaseline = await findLatestCompletedAttempt(runId, 'script_generation');
  const baselineEvidence = generationForBaseline
    ? reviewEvidenceSnapshot(generationForBaseline.input, generationForBaseline.output).evidence : undefined;
  const stageInput = {
    scriptText: sanctionedScriptText,
    ...(baselineEvidence && { factualBaseline: factualBaseline(baselineEvidence, sanctionedScriptText) }),
    brandAssets: channel.brandAssets,
    fixNotes: fixNotes ?? null,
    resolvedVoice,
    ...(isLong && { videoKind: 'long' as const }),
  };

  // A located failure can select one visual-only revision. Eligibility is
  // checked before stage creation or a provider call. Missing/stale assets
  // leave the existing bounded full-generation path in place.
  let repairPrepared: PreparedRepair | undefined;
  let repairBaselineOutput: VideoGenerationOutput | undefined;
  let repairUnavailable: string | undefined;
  if (isLong && previousAttempt && attemptNumber <= MAX_VIDEO_REGEN_ATTEMPTS + 1) {
    const previousReview = await findLatestAttempt(runId, 'video_review');
    const reviewOutput = previousReview?.status === 'completed' ? previousReview.output as
      { verdict?: string; visualDefects?: VisualDefect[] } | null : null;
    if (reviewOutput?.verdict === 'fail' && reviewOutput.visualDefects?.length === 1) {
      try {
        const completedBaseline = previousAttempt.status === 'completed'
          ? previousAttempt : await findLatestCompletedAttempt(runId, 'video_generation');
        if (!completedBaseline) throw new NonTransientStageError('No completed baseline for visual repair');
        if ((previousReview?.input as { videoPath?: string } | null)?.videoPath !==
            (completedBaseline.output as VideoGenerationOutput | null)?.videoPath) {
          throw new NonTransientStageError('Visual defect review does not belong to the completed baseline video');
        }
        repairPrepared = await prepareVisualRepair({ runId, baselineAttempt: completedBaseline.attemptNumber,
          repairAttempt: attemptNumber, previousInput: completedBaseline.input as typeof stageInput,
          currentInput: stageInput, previousOutput: completedBaseline.output as VideoGenerationOutput,
          defect: reviewOutput.visualDefects[0],
          sceneStyle: { stylePrompt: config.visualStylePrompt, negativePrompt: config.visualNegativePrompt,
            safetyNegatives: env.AI_VISUALS_SAFETY_NEGATIVES_ENABLED === '1', allowBrandMarks: briefAllowsBrandMarks(run.briefText) } });
        repairBaselineOutput = completedBaseline.output as VideoGenerationOutput;
        if (previousAttempt.status !== 'completed') {
          const oldOutput = previousAttempt.output as { visualRepairReceipt?: unknown } | null;
          const carried = RepairReceiptSchema.safeParse(oldOutput?.visualRepairReceipt);
          if (carried.success && carried.data.baselineAttempt === completedBaseline.attemptNumber &&
              carried.data.sceneId === repairPrepared.receipt.sceneId &&
              isDeepStrictEqual(carried.data.baseline, repairPrepared.receipt.baseline) &&
              carried.data.replacement) {
            repairPrepared.receipt = { ...repairPrepared.receipt, status: 'replacement-ready',
              replacement: carried.data.replacement };
          }
        }
      } catch (error) {
        repairUnavailable = error instanceof Error ? error.message : String(error);
      }
    }
  }
  // Sprint 5 Task 8 (R3): a shot-length (timing) failure from Video Review needs no new plan and no new
  // pictures. The plan that produced the video is kept and only the scene timing is redone, so every
  // picture comes from the run's cache. Only for the review of the video this attempt follows.
  let timingRepair: { baselineAttempt: number; reasonCode: string; plan: ProductionPlan } | undefined;
  if (isLong && previousAttempt && !repairPrepared) {
    const previousReview = await findLatestAttempt(runId, 'video_review');
    const reviewOut = previousReview?.status === 'completed' ? previousReview.output as { verdict?: string; reasonCode?: string } | null : null;
    if (reviewOut?.verdict === 'fail' && reviewOut.reasonCode && (TIMING_FAILURE_CODES as readonly string[]).includes(reviewOut.reasonCode)) {
      const baseline = previousAttempt.status === 'completed' ? previousAttempt : await findLatestCompletedAttempt(runId, 'video_generation');
      const baselineOut = baseline?.output as VideoGenerationOutput | null | undefined;
      if (baseline && baselineOut?.plan?.longScenes?.length &&
          (previousReview?.input as { videoPath?: string } | null)?.videoPath === baselineOut.videoPath) {
        timingRepair = { baselineAttempt: baseline.attemptNumber, reasonCode: reviewOut.reasonCode, plan: baselineOut.plan as ProductionPlan };
      }
    }
  }
  const effectiveStageInput = { ...stageInput,
    ...(timingRepair && { timingRepair: { baselineAttempt: timingRepair.baselineAttempt, reasonCode: timingRepair.reasonCode } }),
    ...(repairPrepared && { visualRepairIntent: repairPrepared.receipt }),
    ...(repairUnavailable && { visualRepairUnavailable: repairUnavailable }) };

  // Cost gate (BUSINESS_LOGIC.md Section 1) — same soft-ceiling pattern as
  // Script Generation, now also covering the pipeline's most expensive stage.
  const budget = await checkBudget(run.tenantId, channel.id, channel.platform);
  if (!budget.ok) {
    const budgetText = describeBudgetRefusal(budget);
    await createSkippedStageAttempt({
      pipelineRunId: runId,
      stageName: 'video_generation',
      attemptNumber,
      input: effectiveStageInput,
      reason: budgetText,
    });
    return await updatePipelineRun(runId, {
      status: 'needs_attention',
      lastError: `Video Generation refused: ${budgetText}`,
    });
  }

  const carriedCheckpoint = isLong ? reusableLongPlanningCheckpoint({
    chapters: sanctionedChapters as ScriptChapter[], topic: run.intakeParsed.topic,
    targetSeconds: config.targetSeconds, secondsPerStill: config.visualSecondsPerStill,
    audioLayerOverride: resolveAudioLayerOverride(config.audioDefaultMoodTag ?? undefined),
    visualStyle: config.visualStylePrompt, scriptGuide: config.scriptGuide, fixNotes: fixNotes ?? undefined,
  }, (previousAttempt?.output as { longPlanningCheckpoint?: unknown } | null)?.longPlanningCheckpoint) : undefined;
  const stage = await createStageAttempt({
    pipelineRunId: runId,
    stageName: 'video_generation',
    attemptNumber,
    input: effectiveStageInput,
    ...(carriedCheckpoint ? { output: { longPlanningCheckpoint: carriedCheckpoint } } : {}),
  });

  // A plan is paid work. Keep it only for an eligible same-run recovery and
  // bind it to every input that can affect planning; a revision/config/script
  // change necessarily produces a different fingerprint and replans.
  const planInputHash = planCheckpointHash({
    runId, stageInput: effectiveStageInput, chapters: sanctionedChapters ?? null,
    topic: run.intakeParsed.topic, config,
    safetyNegatives: env.AI_VISUALS_SAFETY_NEGATIVES_ENABLED,
  });
  const checkpointedPlan = isLong ? reusableLongPlan(previousAttempt, planInputHash) : undefined;

  // Production-planning call (Week 4 Task 1) — metered as its own agent
  // ('video-production-planning'), distinct from the aggregated
  // TTS+transcription+footage row below, since it's a separate purpose that
  // may not even run (forcedPlan test override).
  // Keep completed batches across stage retries and same-input manual recovery.
  let planningCheckpoint: unknown = carriedCheckpoint;
  const attemptPlanOnce = async (): Promise<ProductionPlan> => {
    if (repairPrepared) return repairBaselineOutput!.plan as ProductionPlan;
    if (timingRepair) return timingRepair.plan;
    if (testOverrides?.forcedPlan) {
      return testOverrides.forcedPlan;
    }
    if (isLong) {
      // Bounded scene batches; every planner call is guarded and booked as it returns.
      await runLimitGuard?.();
      const { plan } = await planLongVideoProduction({
        beforeCall: runLimitGuard,
        checkpoint: planningCheckpoint,
        onCheckpoint: async (checkpoint: LongPlanningCheckpoint) => {
          await patchStageOutput(stage.id, { longPlanningCheckpoint: checkpoint });
          planningCheckpoint = checkpoint;
        },
        chapters: sanctionedChapters as ScriptChapter[],
        topic: run.intakeParsed!.topic,
        targetSeconds: config.targetSeconds,
        secondsPerStill: config.visualSecondsPerStill,
        audioLayerOverride: resolveAudioLayerOverride(config.audioDefaultMoodTag ?? undefined),
        visualStyle: config.visualStylePrompt,
        scriptGuide: config.scriptGuide,
        fixNotes: fixNotes ?? undefined,
        onCall: async (llm, metadata) => {
          await insertUsageEvent({
            tenantId: run.tenantId,
            channelId: run.channelId,
            pipelineRunId: runId,
            stageId: stage.id,
            agent: 'video-production-planning',
            metadata,
            provider: llm.provider,
            model: llm.model,
            inputTokens: llm.usage.inputTokens,
            outputTokens: llm.usage.outputTokens,
            costUsd: llm.costUsd,
          });
        },
      });
      return plan;
    }
    try {
      const { plan, llm } = await planVideoProduction({
        scriptText: sanctionedScriptText,
        topic: run.intakeParsed!.topic,
        fixNotes: fixNotes ?? undefined,
        // Sprint 2 Task 2 (E2) — an explicit per-run choice always wins; with
        // no override, the planning LLM decides (defaulting to
        // 'stock-footage'). Unlike voice, there's no channel-level default
        // for visualSource (no schema field for one — Task 2's Schema
        // Impact is explicitly "no new tables or columns"). Narrowed here,
        // not cast — creationOptions.visualSource is stored as a plain
        // string (validated at the API edge, runs.ts, before it ever gets
        // here), but this drives a real disclosure-policy flag downstream,
        // so an unrecognized value is treated as "no override" rather than
        // trusted blindly.
        // Sprint 4 Task 3: run override, else the profile's visual.defaultSource.
        visualSourceOverride:
          config.visualDefaultSource === 'stock-footage' || config.visualDefaultSource === 'ai-stills'
            ? config.visualDefaultSource
            : undefined,
        // Sprint 2 Task 3 (F1) — same narrowing posture as visualSource
        // above: creationOptions.audioLayer is a plain string (validated at
        // the API edge before it gets here), narrowed against the real
        // AUDIO_LAYERS list rather than cast, so an unrecognized value is
        // "no override," not trusted blindly.
        audioLayerOverride: resolveAudioLayerOverride(config.audioDefaultMoodTag ?? undefined),
        // Sprint 4 Task 3 (R10): only when the profile sets secondsPerStill.
        desiredStillCount: computeDesiredStillCount(config.targetSeconds, config.visualSecondsPerStill),
      });
      await insertUsageEvent({
        tenantId: run.tenantId,
        channelId: run.channelId,
        pipelineRunId: runId,
        stageId: stage.id,
        agent: 'video-production-planning',
        provider: llm.provider,
        model: llm.model,
        inputTokens: llm.usage.inputTokens,
        outputTokens: llm.usage.outputTokens,
        costUsd: llm.costUsd,
      });
      return plan;
    } catch (error) {
      await insertUsageEvent({
        tenantId: run.tenantId,
        channelId: run.channelId,
        pipelineRunId: runId,
        stageId: stage.id,
        agent: 'video-production-planning',
        ...failureUsageFields(error),
      });
      throw error;
    }
  };

  // Same per-attempt metering pattern as Script Generation/Review — every
  // real attempt, including retries, writes its own (aggregated) UsageEvent
  // row.
  // Task 13 (R3) — the artifacts of the attempt that actually succeeded (a
  // retried attempt overwrites an earlier one's), for the post-transaction
  // bundle upload below.
  let lastArtifacts: VideoArtifacts | undefined;
  let lastUsage: VideoGenerationUsage | undefined;
  const attemptVideoOnce = async (plan: ProductionPlan): Promise<VideoGenerationOutput> => {
    // Bugs Closure 2 (P5): a fresh tally per attempt (each retry pays again),
    // read by the failure path below.
    const spend = emptyVideoSpend({
      media: env.MEDIA_STUB === '1',
      stockFootage: env.STOCK_FOOTAGE_STUB === '1',
      aiVisuals: env.AI_VISUALS_STUB === '1',
    });
    // Sprint 4 Task 12 (R4): the stills counter runs.progress reads, kept on this stage's output.
    const stillsProgress = createStillsProgressReporter((p) => patchStageOutput(stage.id, { stillsProgress: p }));
    try {
      const sceneStyle = {
        stylePrompt: config.visualStylePrompt,
        negativePrompt: config.visualNegativePrompt,
        safetyNegatives: env.AI_VISUALS_SAFETY_NEGATIVES_ENABLED === '1',
        // Sprint 5 Task 8 (R6): the no-marks rule is on unless the brief itself asks for logos or text.
        allowBrandMarks: briefAllowsBrandMarks(run.briefText),
      };
      const bookPaidCall = (fields: {
        model: string;
        costUsd: number;
        characterCount?: number;
        audioDurationSeconds?: number;
        metadata: Record<string, unknown>;
      }) =>
        insertUsageEvent({
          tenantId: run.tenantId,
          channelId: run.channelId,
          pipelineRunId: runId,
          stageId: stage.id,
          agent: 'video-generation',
          provider: 'openai',
          model: fields.model,
          characterCount: fields.characterCount,
          audioDurationSeconds: fields.audioDurationSeconds?.toFixed(2),
          costUsd: fields.costUsd.toFixed(6),
          metadata: { ...fields.metadata, stubFlags: spend.stubFlags },
        });
      const { output, usage, artifacts } = repairPrepared
        ? await executeVisualRepair({ prepared: repairPrepared,
            baselineOutput: repairBaselineOutput!, sceneStyle,
            guard: async () => {
              await runLimitGuard?.();
              const liveRun = await findPipelineRunById(runId);
              const liveChannel = await findChannelById(channel.id);
              if (liveRun?.status !== 'running' || liveChannel?.isActive === false) {
                throw new NonTransientStageError('Visual repair stopped: run cancelled or channel archived');
              }
              const allowance = await checkBudget(run.tenantId, channel.id, channel.platform);
              if (!allowance.ok) throw new NonTransientStageError(`Visual repair stopped: ${describeBudgetRefusal(allowance)}`);
            },
            onReceipt: async receipt => { await patchStageOutput(stage.id, { visualRepairReceipt: receipt }); },
            replacement: async (styledPrompt, sceneIndex) => {
              const stills = await generateStills({ scenePrompts: [styledPrompt], size: STILL_SIZE_LANDSCAPE,
                cacheDir: stillsCacheDir(runId),
                validateCachedStill: async file => inspectImage(file, { width: 1536, height: 1024 }).then(() => true).catch(() => false),
                onStillGenerated: async info => {
                  await bookPaidCall({ model: info.model, costUsd: info.costUsd,
                    metadata: { part: 'visual-repair-still', sceneIndex } });
                  await runLimitGuard?.();
                } });
              if (stills.skippedPromptCount || stills.imagePaths.length !== 1) {
                throw new NonTransientStageError('Visual repair still was refused; defect remains unresolved');
              }
              return { path: stills.imagePaths[0], provider: stills.provider, model: stills.model,
                costUsd: Number(stills.costUsd), cached: stills.cachedCount === 1 };
            } })
        : isLong
        ? await generateLongVideo({
            pipelineRunId: runId,
            attemptNumber,
            chapters: sanctionedChapters as ScriptChapter[],
            plan,
            voice: resolvedVoice,
            sceneStyle,
            spend,
            guard: runLimitGuard,
            maxShotSeconds: qualityProfileFor('long', config.visualSecondsPerStill).maxShotSeconds,
            // Sprint 5 Task 8 (R6): every picture is looked at before the render; each vision call is booked.
            stillCheck: {
              topic: run.intakeParsed!.topic,
              onCall: async (llm, info) => {
                await insertUsageEvent({
                  tenantId: run.tenantId,
                  channelId: run.channelId,
                  pipelineRunId: runId,
                  stageId: stage.id,
                  agent: 'still-check',
                  provider: llm.provider,
                  model: llm.model,
                  inputTokens: llm.usage.inputTokens,
                  outputTokens: llm.usage.outputTokens,
                  costUsd: llm.costUsd,
                  metadata: { part: 'still-check', batchSize: info.batchSize },
                });
              },
            },
            weeklyGate: async () => {
              const refusal = await checkBudget(run.tenantId, channel.id, channel.platform);
              if (!refusal.ok) throw new NonTransientStageError(`Video Generation stopped: ${describeBudgetRefusal(refusal)}`);
            },
            onStillsProgress: stillsProgress.report,
            // Narration and stills are booked one call at a time, as they are paid for.
            onNarrationPaid: async (paid) => {
              await bookPaidCall({
                model: paid.transcriptionCostUsd > 0 ? 'whisper-1' : resolveMediaPurpose('tts', resolvedVoice).model,
                costUsd: paid.ttsCostUsd + paid.transcriptionCostUsd,
                characterCount: paid.ttsCharacters || undefined,
                audioDurationSeconds: paid.transcriptionSeconds || undefined,
                metadata: { part: paid.transcriptionCostUsd > 0 ? 'transcription' : 'tts', chapterIndex: paid.chapterIndex, chunkIndex: paid.chunkIndex },
              });
            },
            onStillPaid: async (info) => {
              await bookPaidCall({ model: info.model, costUsd: info.costUsd, metadata: { part: 'still', sceneIndex: info.index } });
            },
          })
        : await generateVideo({
            pipelineRunId: runId,
            attemptNumber,
            scriptText: sanctionedScriptText,
            brandAssets: channel.brandAssets,
            plan,
            voice: resolvedVoice,
            sceneStyle,
            excludeStockSourceIds: await listStockSourceIdsUsedByRun(runId),
            spend,
            onStillsProgress: stillsProgress.report,
          });
      await stillsProgress.flush();
      await insertUsageEvent({
        tenantId: run.tenantId,
        channelId: run.channelId,
        pipelineRunId: runId,
        stageId: stage.id,
        agent: 'video-generation',
        provider: usage.provider,
        model: usage.model,
        characterCount: usage.characterCount,
        audioDurationSeconds: usage.audioDurationSeconds.toFixed(2),
        costUsd: usage.costUsd,
        metadata: usage.metadata,
      });
      lastArtifacts = artifacts;
      lastUsage = usage;
      return output;
    } catch (error) {
      await stillsProgress.flush();
      const context = getStageErrorContext(error);
      // Real spend (TTS, transcription, stills) when the render got that far;
      // otherwise the previous provider/model-or-unknown row at $0.
      const realUsage = failedRenderUsage(spend, error);
      await insertUsageEvent({
        tenantId: run.tenantId,
        channelId: run.channelId,
        pipelineRunId: runId,
        stageId: stage.id,
        agent: 'video-generation',
        // Sprint 5 Task 8 (R8.3): a failure before any billable call still belongs to the speech and
        // transcription provider this stage uses, never to 'unknown'. Long-form books each paid call as it
        // happens, so this summary row legitimately carries no cost; the metadata says why.
        ...(realUsage ?? {
          provider: (context?.provider as string | undefined) ?? 'openai',
          model: (context?.model as string | undefined) ?? `${resolveMediaPurpose('tts', resolvedVoice).model}+${resolveMediaPurpose('transcription').model}`,
          costUsd: '0.000000',
          metadata: failedCallMetadata(error, { stubFlags: spend.stubFlags, costsBookedSeparately: spend.bookedSeparately === true }),
        }),
      });
      throw error;
    }
  };

  try {
    const plan = repairPrepared ? repairBaselineOutput!.plan as ProductionPlan : timingRepair ? timingRepair.plan : checkpointedPlan
      ? checkpointedPlan
      : await withRetryAndCircuitBreaker(attemptPlanOnce);
    if (isLong) {
      await patchStageOutput(stage.id, { recoveryPlan: { inputHash: planInputHash, plan } });
    }
    const output = await withRetryAndCircuitBreaker(() => attemptVideoOnce(plan));
    const finalRepairReceipt = repairPrepared
      ? RepairReceiptSchema.parse(JSON.parse(await fs.readFile(repairPrepared.receiptPath, 'utf8'))) : undefined;

    const completedRun = await prisma.$transaction(async (tx) => {
      await completeStage(stage.id, { ...output, plan: output.plan ?? plan, ...(finalRepairReceipt && { visualRepairReceipt: finalRepairReceipt }) }, tx);
      return await updatePipelineRun(runId, { currentStage: 'video_review' }, tx);
    });

    // Sprint 3 Task 12 (R2) — best-effort, after the transaction above has
    // already committed: the stage is genuinely completed and the run has
    // already advanced to video_review, exactly the isolation shape
    // runPublishingStage's own cover-frame/thumbnail-set step establishes
    // (never inside the transaction that actually matters for pipeline
    // progress — a real network call here must never slow or block it).
    // `drafts/` — every completed attempt, not just the one that eventually
    // gets approved, per the founder's own two-tier design (see task12.md).
    if (isR2Configured()) {
      const r2Key = `videos/${env.NODE_ENV}/drafts/${run.tenantId}/${runId}/${attemptNumber}.mp4`;
      try {
        await uploadToR2({ key: r2Key, filePath: output.videoPath, contentType: 'video/mp4' });
        await patchStageOutput(stage.id, { r2DraftKey: r2Key, r2DraftUploadedAt: new Date().toISOString() });
        // Sprint 4 Task 9 (R4): the SRT is stored next to the video, under the same prefix.
        if (output.subtitlesPath) {
          const srtKey = `videos/${env.NODE_ENV}/drafts/${run.tenantId}/${runId}/${attemptNumber}.srt`;
          await uploadToR2({ key: srtKey, filePath: output.subtitlesPath, contentType: 'application/x-subrip' });
          await patchStageOutput(stage.id, { r2SubtitlesKey: srtKey });
        }
      } catch (error) {
        console.error(
          `[video_generation] run ${runId} attempt ${attemptNumber}: R2 draft upload failed (non-blocking, video_generation itself already succeeded) — ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      // Sprint 3 Task 13 (R3) — additive debug bundle under a sibling prefix;
      // the .mp4 key above is unchanged so r2DraftKey/getVideoUrl keep working.
      if (lastArtifacts && lastUsage) {
        try {
          const prefix = `videos/${env.NODE_ENV}/drafts/${run.tenantId}/${runId}/${attemptNumber}/`;
          const meta = lastUsage.metadata;
          // Sprint 4 Task 8 — same instrument the Video Intelligence gate uses; best-effort.
          const qualityMetrics = await measureQualityMetrics({
            videoPath: output.videoPath,
            captionsEnabled: meta.captionsEnabled,
            visualSource: meta.visualSource,
            videoKind: isLong ? 'long' : undefined,
          }).catch(() => null);
          const bundle = await uploadAttemptBundle({
            prefix,
            // A long video has ~120 stills; the bundle keeps the first few as a sample.
            artifacts: isLong ? { ...lastArtifacts, stillImagePaths: lastArtifacts.stillImagePaths?.slice(0, 6) } : lastArtifacts,
            scriptText: sanctionedScriptText,
            scratchDir: path.dirname(output.videoPath),
            longForm: config.videoKind === 'long',
            context: {
              runId,
              attemptNumber,
              channelId: run.channelId,
              ttsModel: meta.ttsModel,
              voice: resolvedVoice ?? null,
              transcriptionModel: meta.transcriptionModel,
              visualSource: meta.visualSource,
              captionStyle: meta.captionStyle,
              audioLayer: meta.audioLayer,
              captionFont: meta.captionsEnabled ? { family: CAPTION_FONT_FAMILY, file: CAPTION_FONT_FILE } : null,
              qualityMetrics,
            },
          });
          await patchStageOutput(stage.id, {
            r2BundlePrefix: prefix,
            r2ManifestKey: bundle.manifestKey,
            r2BundleUploadedAt: new Date().toISOString(),
          });
        } catch (error) {
          console.error(
            `[video_generation] run ${runId} attempt ${attemptNumber}: R2 bundle upload failed (non-blocking) — ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }

    return completedRun;
  } catch (error) {
    return await failStageAndEscalate(stage.id, runId, error,
      isLong && planningCheckpoint ? { longPlanningCheckpoint: planningCheckpoint } : undefined);
  }
}

// Runs (or re-runs) the video_review stage — Week 3 Task 3. Deterministic
// checks (zero LLM cost) gate the multimodal pass; a deterministic-only fail
// writes no UsageEvent row at all, since no LLM call happened. The regen
// circuit breaker (BUSINESS_LOGIC.md Section 1) counts the just-reviewed
// video_generation attempt's own attemptNumber — no new counter field needed,
// per this task's own instruction.
export async function runVideoReviewStage(runId: string): Promise<PipelineRun> {
  const run = await findPipelineRunById(runId);
  if (!run) {
    throw new Error(`PipelineRun ${runId} not found`);
  }
  if (!run.intakeParsed) {
    throw new Error(`PipelineRun ${runId} has no intakeParsed output`);
  }

  // Sprint 3 Task 9 (R2) — needed for the gate2Enabled toggle and, when
  // disabled, the channel's own defaultPrivacyStatus to auto-approve at.
  const channel = await findChannelById(run.channelId);
  if (!channel) {
    throw new Error(`Channel ${run.channelId} not found`);
  }

  const videoGenStage = await findLatestAttempt(runId, 'video_generation');
  if (!videoGenStage || videoGenStage.status !== 'completed' || !videoGenStage.output) {
    throw new Error(`PipelineRun ${runId} has no completed video_generation output — cannot run video_review`);
  }
  const videoOutput = videoGenStage.output as { videoPath?: string; plan?: { visualSource?: string } };
  if (!videoOutput.videoPath) {
    throw new Error(`PipelineRun ${runId}'s video_generation output has no videoPath`);
  }
  // Sprint 2 Task 2 (E3) — which review rubric variant to apply. Falls back
  // to 'stock-footage' for a pre-Sprint-2 stage row that predates this
  // field, matching the behavior every such run already had.
  const visualSource: VisualSource = videoOutput.plan?.visualSource === 'ai-stills' ? 'ai-stills' : 'stock-footage';

  const gate1Stage = await findLatestAttempt(runId, 'gate1');
  const sanctionedScriptText = (gate1Stage?.output as { sanctionedScriptText?: string } | undefined)
    ?.sanctionedScriptText;
  if (!sanctionedScriptText) {
    throw new Error(`PipelineRun ${runId} has no sanctioned script text from gate1`);
  }

  await updatePipelineRun(runId, {
    status: 'running',
    currentStage: 'video_review',
  });

  const previousAttempt = await findLatestAttempt(runId, 'video_review');
  const attemptNumber = previousAttempt ? previousAttempt.attemptNumber + 1 : 1;
  const stageInput = { videoPath: videoOutput.videoPath, topic: run.intakeParsed.topic, visualSource };
  const stage = await createStageAttempt({
    pipelineRunId: runId,
    stageName: 'video_review',
    attemptNumber,
    input: stageInput,
  });

  // Sprint 4 Task 10 (R2): long-form uses its own quality profile and chapter-based frame sampling.
  const reviewConfig = await loadResolvedConfig(run, channel);
  const isLongForm = reviewConfig.videoKind === 'long';
  const chapterTimings = isLongForm ? readChapterTimings(videoGenStage.output) : undefined;
  const sceneMap = isLongForm && visualSource === 'ai-stills'
    ? await fs.readFile(path.join(DATA_DIR, 'videos', runId, `${videoGenStage.attemptNumber}.scene-mapping.json`), 'utf8')
        .then(text => SceneMappingSchema.parse(JSON.parse(text)).scenes.map(s => ({ sceneId: s.sceneId,
          startSec: s.startSec, endSec: s.endSec }))).catch(() => undefined)
    : undefined;
  const longFormReview = isLongForm
    ? {
        videoKind: 'long' as const,
        secondsPerStill: reviewConfig.visualSecondsPerStill,
        // A long AI-stills pacing miss becomes precise fixNotes for the
        // existing bounded regeneration path; Shorts and stock footage stay unchanged.
        enforceLongShotPacing: visualSource === 'ai-stills',
        chapterTimings,
        narrationSeconds: chapterTimings?.[chapterTimings.length - 1]?.endSec,
      }
    : undefined;

  try {
    const outcome = await reviewVideo({
      videoPath: videoOutput.videoPath,
      topic: run.intakeParsed.topic,
      scriptText: sanctionedScriptText,
      visualSource,
      // Sprint 4 Task 8 (R7) — same default-on rule generateVideo applies.
      captionsEnabled: isLongForm ? false : channel.brandAssets.captionsEnabled !== false,
      safetyChecks: env.AI_VISUALS_SAFETY_NEGATIVES_ENABLED === '1',
      ...(isLongForm && longFormReview),
      ...(sceneMap && { sceneMap }),
    });

    // Sprint 4 Task 10 (R3): the Gate 2 preview copy and the subtitle file are made before the run
    // can reach Gate 2. A failure here is a stage failure with the normal retry (the catch below).
    const longFormArtifacts =
      isLongForm && outcome.verdict === 'pass'
        ? await prepareLongFormGate2Artifacts({
            runId,
            tenantId: run.tenantId,
            attemptNumber: videoGenStage.attemptNumber,
            videoPath: videoOutput.videoPath,
            videoGenOutput: videoGenStage.output,
          })
        : undefined;

    // A UsageEvent row only when the multimodal pass actually ran — a
    // deterministic-only fail has no LLM cost to meter.
    if (outcome.multimodalRan && outcome.llm) {
      await insertUsageEvent({
        tenantId: run.tenantId,
        channelId: run.channelId,
        pipelineRunId: runId,
        stageId: stage.id,
        agent: 'video-intelligence-own-draft',
        provider: outcome.llm.provider,
        model: outcome.llm.model,
        inputTokens: outcome.llm.usage.inputTokens,
        outputTokens: outcome.llm.usage.outputTokens,
        costUsd: outcome.llm.costUsd,
      });
    }

    // Sprint 3 Task 9 (R2) — only the passing verdict is affected; the regen
    // loop and the regen-cap-to-needs_attention fallback below are
    // unaffected by the toggle.
    const gate2AutoApprove = outcome.verdict === 'pass' && channel.approvalGateConfig.gate2Enabled === false;
    // Same create-before-the-completing-transaction split as every other
    // stage's own createStageAttempt call, and the same reasoning as R2's
    // gate1 auto-approve above: shaped exactly like runGate2Stage's own
    // approve-outcome gate2 row (output.outcome/privacyStatus) so
    // runPublishingStage's later read of it can't tell an auto-approve apart
    // from a human one. channels.update's own invariant check (BAD_REQUEST
    // unless defaultPrivacyStatus is 'private') is what guarantees this is
    // never a privacy regression.
    const gate2AutoApproveStage = gate2AutoApprove
      ? await createStageAttempt({
          pipelineRunId: runId,
          stageName: 'gate2',
          attemptNumber: ((await findLatestAttempt(runId, 'gate2'))?.attemptNumber ?? 0) + 1,
          input: { videoPath: videoOutput.videoPath, verdict: outcome.verdict, rationale: outcome.rationale },
        })
      : null;

    // Regen-cap decision computed once, up front, so every branch inside the
    // transaction below applies the exact same patch it would have applied
    // outside one — the transaction only changes atomicity, not the logic.
    // Bugs Task 12 (R1) - a stock-footage run that reached the regeneration cap and was still rejected
    // gets ONE extra attempt with AI stills. Once per run (persisted marker, so a restart, a resume or a
    // manual Retry can't trigger a second), only if the budget gate would allow the render, and it does
    // not count against the cap. Otherwise the run parks exactly as before.
    const atRegenCap = outcome.verdict !== 'pass' && videoGenStage.attemptNumber > MAX_VIDEO_REGEN_ATTEMPTS;
    const stockFallback =
      atRegenCap &&
      visualSource === 'stock-footage' &&
      !run.creationOptions?.videoFallbackUsed &&
      (await checkBudget(run.tenantId, channel.id, channel.platform)).ok;
    if (stockFallback) {
      console.log(
        `[video-fallback] run ${runId}: stock footage failed review after ${videoGenStage.attemptNumber} attempts - one AI-stills attempt`,
      );
    }

    // Sprint 5 Task 8 (D1): a failed review would normally start the next attempt by itself. When the run has
    // already spent its retry allowance, it waits for a person instead of spending more.
    const retryAllowance = run.creationOptions?.retryAllowanceUsd;
    const spentSoFar = retryAllowance !== undefined && outcome.verdict !== 'pass' && !atRegenCap ? await sumUsageCostForRun(runId) : 0;
    const overAllowance = retryAllowance !== undefined && outcome.verdict !== 'pass' && !atRegenCap && spentSoFar >= retryAllowance;

    const runPatch: Parameters<typeof updatePipelineRun>[1] = overAllowance
      ? { status: 'needs_attention', lastError: describeRetryAllowancePause(spentSoFar, retryAllowance!, outcome.rationale) }
      : stockFallback
      ? {
          status: 'running',
          currentStage: 'video_generation',
          creationOptionsMerge: { visualSource: 'ai-stills', videoFallbackUsed: true },
        }
      : outcome.verdict === 'pass'
        ? gate2AutoApproveStage
          ? { status: 'running', currentStage: nextStageAfter('gate2') }
          : { status: 'paused_gate2', currentStage: nextStageAfter('video_review') }
        : videoGenStage.attemptNumber <= MAX_VIDEO_REGEN_ATTEMPTS
          ? { status: 'running', currentStage: 'video_generation' }
          : {
              status: 'needs_attention',
              lastError: `Video Intelligence regen cap (${MAX_VIDEO_REGEN_ATTEMPTS}) reached: ${outcome.rationale}`,
            };

    return await prisma.$transaction(async (tx) => {
      await insertReviewLog(
        {
          tenantId: run.tenantId,
          channelId: run.channelId,
          pipelineRunId: runId,
          stageId: stage.id,
          agent: 'video-intelligence-own-draft',
          verdict: outcome.verdict,
          rationale: outcome.rationale,
        },
        tx,
      );

      // Sprint 4 Task 8 (R7) — qualityMetrics is optional on the stage output, so
      // pre-existing video_review rows without it stay valid.
      await completeStage(
        stage.id,
        {
          verdict: outcome.verdict,
          rationale: outcome.rationale,
          ...(outcome.reasonCode && { reasonCode: outcome.reasonCode }),
          ...(outcome.qualityMetrics && { qualityMetrics: outcome.qualityMetrics }),
          ...(outcome.visualDefects?.length && { visualDefects: outcome.visualDefects }),
          ...(longFormArtifacts && longFormArtifacts),
          // Named field: why this long video will publish without a chapter list (also shown at Gate 2).
          ...(isLongForm && (() => { const l = buildChapterList(chapterTimings); return l.ok ? {} : { chapterWarning: l.warning }; })()),
        },
        tx,
      );

      // Sprint 3 Task 9 (R2) — completes the synthetic gate2 row created
      // above with the exact same output shape runGate2Stage's own approve
      // path writes (outcome/privacyStatus), plus a separate agent:'system'
      // ReviewLog row so the run's history plainly shows Gate 2 was skipped,
      // not silently absent.
      if (stockFallback) {
        await insertReviewLog(
          {
            tenantId: run.tenantId,
            channelId: run.channelId,
            pipelineRunId: runId,
            stageId: stage.id,
            agent: 'system',
            verdict: 'video-fallback',
            rationale: 'Switched to AI stills after stock footage failed review',
          },
          tx,
        );
      }

      if (gate2AutoApproveStage) {
        const privacyStatus = channel.defaultPrivacyStatus;
        await completeStage(gate2AutoApproveStage.id, { outcome: 'approve', privacyStatus }, tx);
        await insertReviewLog(
          {
            tenantId: run.tenantId,
            channelId: run.channelId,
            pipelineRunId: runId,
            stageId: gate2AutoApproveStage.id,
            agent: 'system',
            verdict: 'auto-approve',
            rationale: `Gate 2 disabled for this channel — auto-approved a passing video review at the channel's default privacy (${privacyStatus}).`,
          },
          tx,
        );
      }

      return await updatePipelineRun(runId, runPatch, tx);
    });
  } catch (error) {
    // Bugs Task 11 (R2) — a multimodal pass whose reply was rejected after the
    // call completed still cost real money; the success path above is the only
    // place this stage wrote a UsageEvent, so that spend was never booked.
    const spent = failureUsageFields(error);
    if (spent.provider !== 'unknown') {
      await insertUsageEvent({
        tenantId: run.tenantId,
        channelId: run.channelId,
        pipelineRunId: runId,
        stageId: stage.id,
        agent: 'video-intelligence-own-draft',
        ...spent,
        metadata: failedCallMetadata(error),
      });
    }
    return await failStageAndEscalate(stage.id, runId, error);
  }
}

// Runs (or re-runs) the gate2 stage — Week 3 Task 4. By the time this runs,
// PipelineRun.status is already `paused_gate2` (Task 3's pass verdict sets
// it). Reuses Gate 1's notification interface and threading (same threadKey
// = the run id) — no new transport code. See
// docs/execution/week3/BUSINESS_LOGIC.md Section 4.
export async function runGate2Stage(runId: string): Promise<PipelineRun> {
  const run = await findPipelineRunById(runId);
  if (!run) {
    throw new Error(`PipelineRun ${runId} not found`);
  }

  const channel = await findChannelById(run.channelId);
  if (!channel) {
    throw new Error(`Channel ${run.channelId} not found`);
  }

  const videoGenStage = await findLatestAttempt(runId, 'video_generation');
  if (!videoGenStage || videoGenStage.status !== 'completed' || !videoGenStage.output) {
    throw new Error(`PipelineRun ${runId} has no completed video_generation output — cannot open Gate 2`);
  }
  const videoPath = (videoGenStage.output as { videoPath?: string }).videoPath;
  if (!videoPath) {
    throw new Error(`PipelineRun ${runId}'s video_generation output has no videoPath`);
  }

  const videoReviewStage = await findLatestAttempt(runId, 'video_review');
  if (!videoReviewStage || videoReviewStage.status !== 'completed' || !videoReviewStage.output) {
    throw new Error(`PipelineRun ${runId} has no completed video_review output — cannot open Gate 2`);
  }
  const reviewOutput = videoReviewStage.output as {
    verdict?: string;
    rationale?: string;
    qualityMetrics?: QualityMetrics;
  };
  if (!reviewOutput.verdict || !reviewOutput.rationale) {
    throw new Error(`PipelineRun ${runId}'s video_review output is missing verdict/rationale`);
  }
  if ((videoGenStage.output as { visualRepairReceipt?: unknown }).visualRepairReceipt &&
      ((videoReviewStage.input as { videoPath?: string } | null)?.videoPath !== videoPath || reviewOutput.verdict !== 'pass')) {
    throw new NonTransientStageError('Repaired video must pass a fresh review before Gate 2');
  }

  // Sprint 4 Task 10 (R4.1): a long run whose chapters do not meet YouTube's rules is published
  // without the chapter list; the approver is told here, before approving.
  const gate2Warnings: string[] = [];
  if ((await loadResolvedConfig(run, channel)).videoKind === 'long') {
    const list = buildChapterList(readChapterTimings(videoGenStage.output));
    if (!list.ok) gate2Warnings.push(list.warning);
  }

  const previousAttempt = await findLatestAttempt(runId, 'gate2');

  // Restart-safety (Week 5 Task 3) — same reasoning as gate1's own comment.
  const isRestartReopen = previousAttempt !== null && previousAttempt.status === 'running';
  const stage =
    previousAttempt && previousAttempt.status === 'running'
      ? previousAttempt
      : await createStageAttempt({
          pipelineRunId: runId,
          stageName: 'gate2',
          attemptNumber: previousAttempt ? previousAttempt.attemptNumber + 1 : 1,
          input: { videoPath, verdict: reviewOutput.verdict, rationale: reviewOutput.rationale },
        });

  if (isRestartReopen) {
    console.log(
      `[gate2] run ${runId}: re-opening an already-pending gate2 attempt ${stage.attemptNumber} after a restart — re-sending the prompt`,
    );
  }

  // Bugs Task 12 (R5c) - invariant: a run is never 'running' at a gate. Whoever got us here (the
  // pipeline moving forward, a resume, a stray Retry) the run is parked at the gate, so the app shows
  // Approve/Reject/Revise for the pending approval registered just below.
  if (run.status !== 'paused_gate2' || run.currentStage !== 'gate2') {
    await updatePipelineRun(runId, { status: 'paused_gate2', currentStage: 'gate2' });
  }

  // Blocks here until a reply arrives (or, per Task 6/Week 2's
  // founder-availability convention, a simulated one for testing).
  const outcome = await requestGate2Decision({
    runId,
    channel,
    channelName: channel.name,
    verdict: reviewOutput.verdict,
    rationale: reviewOutput.rationale,
    qualityMetrics: reviewOutput.qualityMetrics,
    restarted: isRestartReopen,
    ...(gate2Warnings.length > 0 && { warnings: gate2Warnings }),
  });

  const recordGate2Outcome = async (): Promise<PipelineRun> => {
    if (outcome.type === 'reject') {
      return await prisma.$transaction(async (tx) => {
        await insertReviewLog(
          {
            tenantId: run.tenantId,
            channelId: run.channelId,
            pipelineRunId: runId,
            stageId: stage.id,
            agent: 'human',
            approvedByUserId: outcome.approvedByUserId,
            verdict: 'reject',
            rationale: outcome.reason,
          },
          tx,
        );
        await completeStage(stage.id, { outcome: 'reject', reason: outcome.reason }, tx);
        return await updatePipelineRun(
          runId,
          {
            status: 'failed',
            lastError: `Rejected at Gate 2: ${outcome.reason}`,
          },
          tx,
        );
      });
    }

    if (outcome.type === 'approve') {
      // Week 5 Task 5 (D2) — the privacy status the founder actually chose,
      // resolved by parseGate2Reply itself (defaults to DEFAULT_PRIVACY_STATUS
      // on a bare "approve"). Recorded into both the stage output (so
      // runPublishingStage can read it) and, when it's anything other than the
      // default, the ReviewLog's editedOutput — same "audit trail shows not
      // just approve/reject but what was approved" pattern as Gate 1's
      // edited-script logging.
      const privacyStatus = outcome.privacyStatus ?? DEFAULT_PRIVACY_STATUS;
      return await prisma.$transaction(async (tx) => {
        await insertReviewLog(
          {
            tenantId: run.tenantId,
            channelId: run.channelId,
            pipelineRunId: runId,
            stageId: stage.id,
            agent: 'human',
            approvedByUserId: outcome.approvedByUserId,
            verdict: 'approve',
            rationale: 'Approved as-is',
            editedOutput: privacyStatus !== DEFAULT_PRIVACY_STATUS ? { privacyStatus } : undefined,
          },
          tx,
        );
        await completeStage(stage.id, { outcome: 'approve', privacyStatus }, tx);
        return await updatePipelineRun(
          runId,
          {
            status: 'running',
            currentStage: nextStageAfter('gate2'),
          },
          tx,
        );
      });
    }

    // Revise - Bugs Task 12 (R5a): a human Revise is a different request from Task 3's automatic regen
    // loop and is no longer refused by that cap (it ended at "Video retry limit reached" with no way
    // forward). Its own limit is the manual cap (R2), enforced up front in runs.gate2 before the
    // reply is accepted, so by here the new attempt is always allowed.
    const revisePatch: Parameters<typeof updatePipelineRun>[1] = { status: 'running', currentStage: 'video_generation' };

    return await prisma.$transaction(async (tx) => {
      await insertReviewLog(
        {
          tenantId: run.tenantId,
          channelId: run.channelId,
          pipelineRunId: runId,
          stageId: stage.id,
          agent: 'human',
          approvedByUserId: outcome.approvedByUserId,
          verdict: 'revise',
          rationale: outcome.notes,
        },
        tx,
      );
      await completeStage(stage.id, { outcome: 'revise', notes: outcome.notes }, tx);
      return await updatePipelineRun(runId, revisePatch, tx);
    });
  };

  // Bugs Task 9 (R2) — the pending reply is consumed the moment it arrives, so if
  // recording it failed (seen live: Prisma P2028, transaction expired) the run sat
  // at paused_gate2 with no live gate — Approve/Reject did nothing until a
  // restart. Re-open the same attempt instead (the running stage row is reused),
  // so the founder can simply answer again.
  try {
    return await recordGate2Outcome();
  } catch (error) {
    console.error(`[gate2] run ${runId}: recording the Gate 2 decision failed — re-opening the gate:`, error);
    return runGate2Stage(runId);
  }
}

// Runs (or re-runs, on resume) the publishing stage — Week 4 Task 2. By the
// time this runs, PipelineRun.status is already `running`/currentStage =
// `publishing` (Gate 2's approve outcome sets it). Two sub-steps: metadata
// generation (its own UsageEvent row, agent='metadata-generation', safe to
// redo on any resume) and the YouTube upload itself — the pipeline's first
// stage with a real, non-repeatable external side effect. See
// docs/execution/week4/BUSINESS_LOGIC.md Sections 1-2.
// Bugs Task 12 (R1) - read from the plan of the LATEST completed video_generation attempt, so the
// stock -> ai-stills fallback attempt is disclosed as synthetic with no separate flag to keep in sync.
export function deriveContainsSyntheticMedia(videoGenOutput: { plan?: { visualSource?: string } }): boolean {
  return videoGenOutput.plan?.visualSource === 'ai-stills';
}

export async function runPublishingStage(runId: string): Promise<PipelineRun> {
  const run = await findPipelineRunById(runId);
  if (!run) {
    throw new Error(`PipelineRun ${runId} not found`);
  }

  const channel = await findChannelById(run.channelId);
  if (!channel) {
    throw new Error(`Channel ${run.channelId} not found`);
  }
  // Sprint 3 Task 8 (R3) — the "never uploads" choke point: every real path
  // to an upload (the resume-driven one today, any live-driven one later)
  // passes through this function, so this one check is what makes an
  // archived channel unable to publish, independent of whichever driver
  // reaches it. Residual: an archive landing after this check but before
  // uploadVideo completes is not closed here (see reports/task8.md).
  if (!channel.isActive) {
    throw new Error(`Channel ${channel.id} is archived — refusing to publish PipelineRun ${runId}`);
  }

  // Bugs Task 10 (R1) — a cancel is final: never reach the upload for a run
  // that was cancelled (or is no longer running) while this stage's caller
  // was between steps. Returns the run untouched; the driver loop then ends.
  if (run.status !== 'running' || isCancellationRequested(runId)) {
    return run;
  }
  // Sprint 5 Task 8 (R2): an expired YouTube connection is found now, not after the upload starts.
  const preflightBlocked = await preflightGate(run, 'publishing');
  if (preflightBlocked) return preflightBlocked;

  const gate2Stage = await findLatestAttempt(runId, 'gate2');
  if (!gate2Stage || gate2Stage.status !== 'completed' || !gate2Stage.output) {
    throw new Error(`PipelineRun ${runId} has no completed gate2 output — cannot run publishing`);
  }
  const gate2Output = gate2Stage.output as { outcome?: string; privacyStatus?: PrivacyStatus };
  if (gate2Output.outcome !== 'approve') {
    throw new Error(
      `PipelineRun ${runId}'s gate2 outcome is '${gate2Output.outcome}', not 'approve' — cannot run publishing`,
    );
  }
  // Falls back to DEFAULT_PRIVACY_STATUS for a gate2 stage row written before
  // Week 5 Task 5 (D2) added this field — an old completed run being
  // re-inspected, not a live resume path (publishing only ever reads the
  // gate2 attempt that led to it).
  const privacyStatus = gate2Output.privacyStatus ?? DEFAULT_PRIVACY_STATUS;

  const videoGenStage = await findLatestAttempt(runId, 'video_generation');
  if (!videoGenStage || videoGenStage.status !== 'completed' || !videoGenStage.output) {
    throw new Error(`PipelineRun ${runId} has no completed video_generation output — cannot run publishing`);
  }
  const videoGenOutput = videoGenStage.output as {
    videoPath?: string;
    durationSeconds?: number;
    plan?: { visualSource?: string };
  };
  const videoPath = videoGenOutput.videoPath;
  if (!videoPath) {
    throw new Error(`PipelineRun ${runId}'s video_generation output has no videoPath`);
  }
  if ((videoGenOutput as { visualRepairReceipt?: unknown }).visualRepairReceipt) {
    const reviewed = await findLatestAttempt(runId, 'video_review');
    if ((gate2Stage.input as { videoPath?: string } | null)?.videoPath !== videoPath ||
        (reviewed?.input as { videoPath?: string } | null)?.videoPath !== videoPath ||
        (reviewed?.output as { verdict?: string } | null)?.verdict !== 'pass') {
      throw new NonTransientStageError('Repaired video has no matching fresh review and Gate 2 approval');
    }
  }
  const durationSeconds = videoGenOutput.durationSeconds;
  // Sprint 2 Task 2 (E4) — the real YouTube disclosure-policy flag, derived
  // directly from the plan actually used to render this video, never a
  // separately-set flag that could disagree with it. Falls back to `false`
  // for a pre-Sprint-2 stage row (every such video really was stock
  // footage, since 'ai-stills' didn't exist yet).
  const containsSyntheticMedia = deriveContainsSyntheticMedia(videoGenOutput);

  const gate1Stage = await findLatestAttempt(runId, 'gate1');
  const sanctionedScriptText = (gate1Stage?.output as { sanctionedScriptText?: string } | undefined)
    ?.sanctionedScriptText;
  if (!sanctionedScriptText) {
    throw new Error(`PipelineRun ${runId} has no sanctioned script text from gate1`);
  }

  const scriptGenStage = await findLatestCompletedAttempt(runId, 'script_generation');
  if (!scriptGenStage || scriptGenStage.status !== 'completed' || !scriptGenStage.output) {
    throw new Error(`PipelineRun ${runId} has no completed script_generation output — cannot run publishing`);
  }
  const hashtags = (scriptGenStage.output as { hashtags?: string[] }).hashtags ?? [];

  await updatePipelineRun(runId, {
    status: 'running',
    currentStage: 'publishing',
  });

  // Reconcile legacy evidence under the run-row claim across every attempt status.
  const existingAttempt = await findLatestAttempt(runId, 'publishing');
  const priorReceipt = await readPublishingReceipt(runId);
  const legacyStages = await prisma.pipelineStage.findMany({
    where: { pipelineRunId: runId, stageName: 'publishing' }, select: { output: true },
  });
  const legacyKnownOutput = legacyStages.map(s => s.output as {
    youtubeVideoId?: string; metadata?: PublishingMetadata; chapterListIncluded?: boolean,
  } | null).find(o => o?.youtubeVideoId && o.metadata);
  const legacyMetadata = legacyKnownOutput?.metadata;

  const attemptNumber = existingAttempt ? existingAttempt.attemptNumber + 1 : 1;
  // Sprint 4 Task 5: packaging from the run's own snapshotted profile.
  const config = await loadResolvedConfig(run, channel);
  const isLongForm = config.videoKind === 'long';
  const chapterTimings = isLongForm ? readChapterTimings(videoGenStage.output) : undefined;
  // {editor}: the real Gate 1 approver (Task 4), or null (ops path / lookup failure)
  // which packaging.ts turns into "the team". A failed lookup must not block a publish.
  let editorName: string | null = null;
  try {
    const approver = await findGate1ApproverForRun(runId);
    editorName = approver ? (approver.name?.trim() || approver.email) : null;
  } catch (error) {
    console.error(`[publishing] run ${runId}: approver lookup failed, using the fallback credit: ${error instanceof Error ? error.message : String(error)}`);
  }
  const stageInput = { videoPath, scriptText: sanctionedScriptText, hashtags };
  const stage = await createStageAttempt({
    pipelineRunId: runId,
    stageName: 'publishing',
    attemptNumber,
    input: stageInput,
  });

  const attemptMetadataOnce = async (): Promise<PublishingMetadata> => {
    try {
      const { metadata, llm } = await generatePublishingMetadata({
        scriptText: sanctionedScriptText,
        hashtags,
        titleGuidance: config.titleGuidance,
        descriptionTemplate: config.descriptionTemplate,
        hashtagsBase: config.hashtagsBase,
        editorCredit: config.editorCredit,
        editorName,
        sources: run.creationOptions?.sources,
        ...(isLongForm && { videoKind: 'long' as const }),
      });
      await insertUsageEvent({
        tenantId: run.tenantId,
        channelId: run.channelId,
        pipelineRunId: runId,
        stageId: stage.id,
        agent: 'metadata-generation',
        provider: llm.provider,
        model: llm.model,
        inputTokens: llm.usage.inputTokens,
        outputTokens: llm.usage.outputTokens,
        costUsd: llm.costUsd,
      });
      return metadata;
    } catch (error) {
      await insertUsageEvent({
        tenantId: run.tenantId,
        channelId: run.channelId,
        pipelineRunId: runId,
        stageId: stage.id,
        agent: 'metadata-generation',
        ...failureUsageFields(error),
      });
      throw error;
    }
  };

  const uploadAbort = new AbortController();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let claimToken: string | undefined;
  try {
    // A failure in metadata generation predates any provider session.
    await recordStageProgress(stage.id, { uploadNotStarted: true });
    const persistedMetadata = priorReceipt?.metadata ?? legacyMetadata;
    const generatedMetadata = persistedMetadata ?? await withRetryAndCircuitBreaker(attemptMetadataOnce);

    // Sprint 4 Task 10 (R4): long-form description = the generated text, a chapter list (only when
    // YouTube's three rules hold), then a credit line for every music bed that requires one. Never a
    // #shorts tag anywhere. A Short's metadata is used exactly as generated.
    let metadata = generatedMetadata;
    let chapterListIncluded = persistedMetadata
      ? (priorReceipt?.chapterListIncluded ?? legacyKnownOutput?.chapterListIncluded ?? false) : false;
    if (isLongForm && !persistedMetadata) {
      // Task 9 declares `bedCredits` on the output (not filled today); use it when present.
      const recordedCredits = (videoGenOutput as { bedCredits?: string[] }).bedCredits;
      const assembled = assembleLongFormMetadata({
        generated: generatedMetadata,
        chapterTimings,
        creditLines: recordedCredits?.length ? recordedCredits : creditLinesForBeds(bedsUsed(videoGenOutput, AUDIO_BED_MANIFEST)),
      });
      metadata = assembled.metadata;
      chapterListIncluded = assembled.chapterListIncluded;
      if (assembled.chapterWarning) console.warn(`[publishing] run ${runId}: ${assembled.chapterWarning}`);
    }

    // Long-form defaults to Education (27) when the channel profile sets no category.
    const categoryId = config.categoryId ?? (isLongForm ? LONG_FORM_DEFAULT_CATEGORY_ID : undefined);
    const uploadParams = {
      channelId: channel.id, videoPath, metadata, privacyStatus, containsSyntheticMedia,
      selfDeclaredMadeForKids: config.selfDeclaredMadeForKids,
      ...(categoryId && { categoryId }),
      ...(config.defaultLanguage && { defaultLanguage: config.defaultLanguage }),
    };
    const fileIdentity = await approvedFileIdentity(videoPath);
    const identity = { channelId: channel.id, ...fileIdentity, gate2Id: gate2Stage.id,
      metadataHash: metadataFingerprint(uploadParams), metadata, chapterListIncluded };
    const claim = await claimPublishing(runId, identity, stage.id);
    if (claim.kind !== 'acquired') {
      const reason = claim.kind === 'busy' ? 'A publishing worker is still active'
        : claim.kind === 'mismatch' ? 'The approved file or publishing metadata changed'
          : 'An earlier YouTube upload outcome is unresolved';
      throw new NonTransientStageError(reason + '; review the publishing receipt before retrying.');
    }
    const token = claim.token;
    claimToken = token;
    heartbeat = setInterval(() => {
      void renewPublishing(runId, token).catch(() => uploadAbort.abort());
    }, 60_000);
    let uploadResult: UploadResult;
    if (claim.receipt.youtubeVideoId) {
      uploadResult = { youtubeVideoId: claim.receipt.youtubeVideoId, privacyStatus,
        containsSyntheticMedia, selfDeclaredMadeForKids: config.selfDeclaredMadeForKids };
    } else {
      const sessionUri = claim.receipt.sessionCiphertext
        ? decryptRefreshToken(claim.receipt.sessionCiphertext) : undefined;
      uploadResult = await uploadVideoWithSession(uploadParams, fileIdentity.fileSize, sessionUri, {
        persistSession: async uri => {
          try { await savePublishingSession(runId, token, uri); }
          catch { throw new NonTransientStageError('YouTube session could not be saved; no video bytes were sent.'); }
        },
        beforeBytes: async () => {
          if (uploadAbort.signal.aborted) throw new NonTransientStageError('Publishing ownership was lost.');
          const currentFile = await approvedFileIdentity(videoPath);
          if (currentFile.fileSha256 !== identity.fileSha256 || currentFile.fileSize !== identity.fileSize)
            throw new NonTransientStageError('Approved rendered file changed before upload bytes were sent.');
          const [currentRun, currentChannel] = await Promise.all([
            findPipelineRunById(runId), findChannelById(channel.id),
          ]);
          if (!currentChannel?.isActive || !currentRun
              || !['running', 'needs_attention'].includes(currentRun.status)
              || isCancellationRequested(runId))
            throw new NonTransientStageError('Run or channel became ineligible before upload bytes were sent.');
          await mutatePublishingReceipt(runId, token, () => ({ phase: 'uploading', uploadStarted: true }));
        },
        confirmedOffset: async offset => { await mutatePublishingReceipt(runId, token,
          () => ({ confirmedOffset: offset })); },
        signal: uploadAbort.signal,
      });
      // The ID write is the first action after provider success. Failure stops follow-ups.
      try { await observePublishingSuccess(runId, identity, uploadResult.youtubeVideoId); }
      catch {
        throw new NonTransientStageError('YouTube returned a video ID but its durable receipt could not be confirmed; review before retrying.');
      }
    }
    await recordStageProgress(stage.id, {
      youtubeVideoId: uploadResult.youtubeVideoId, privacyStatus: uploadResult.privacyStatus,
      containsSyntheticMedia: uploadResult.containsSyntheticMedia,
      selfDeclaredMadeForKids: uploadResult.selfDeclaredMadeForKids, metadata,
    });
    const receipt = await readPublishingReceipt(runId);
    if (!receipt?.youtubeVideoId) throw new Error('Publishing ID receipt was not durable');

    // Sprint 3 Task 12 (R3) — best-effort, same isolation posture as the
    // cover-frame step directly below: the real YouTube upload has already
    // succeeded, so a failure here must never fail the stage or imply the
    // upload itself failed. `final/` — the one video that actually shipped,
    // per the founder's own two-tier design — is deliberately anchored to
    // *this* real upload succeeding, not to the Gate 2 approval decision
    // that led here (an approval can still be followed by a real publish
    // failure). One object per run, no attempt number: if `publishing`
    // itself retries across multiple stage attempts, a later attempt
    // re-uploads identical bytes to the same key — harmless and idempotent.
    let r2FinalKey: string | undefined;
    let r2FinalUploadedAt: string | undefined;
    if (isR2Configured()) {
      const key = `videos/${env.NODE_ENV}/final/${run.tenantId}/${runId}.mp4`;
      try {
        if (receipt.followups.finalArtifact !== 'succeeded') {
          await markFollowup(runId, token, 'finalArtifact', 'started');
          await uploadToR2({ key, filePath: videoPath, contentType: 'video/mp4' });
          await markFollowup(runId, token, 'finalArtifact', 'succeeded');
        }
        r2FinalKey = key;
        r2FinalUploadedAt = new Date().toISOString();
      } catch (error) {
        await markFollowup(runId, token, 'finalArtifact', 'failed');
        console.error(
          `[publishing] run ${runId}: R2 final upload failed (non-blocking, video already uploaded to YouTube successfully) — ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    // Sprint 2 Task 5 (H1) — best-effort, isolated follow-up: the video is
    // already live by this point, so a failure here (bad frame extraction, a
    // real thumbnails.set error) must never fail the publishing stage or
    // imply the upload itself failed. Same isolation posture Sprint 2 Task
    // 4's G2 established for retention-curve capture. Requires a real
    // durationSeconds from video_generation's output — falls back to
    // `coverFrameSet: false` for a pre-Sprint-2-Task-5 stage row (or if it's
    // ever missing) rather than crashing the whole stage over metadata.
    let coverFrameSet = receipt.followups.thumbnail === 'succeeded';
    if (typeof durationSeconds === 'number' && !coverFrameSet
        && receipt.followups.thumbnail !== 'started' && receipt.followups.thumbnail !== 'uncertain') {
      try {
        await markFollowup(runId, token, 'thumbnail', 'started');
        const framePath = await extractCoverFrame({
          videoPath,
          durationSeconds,
          coverFrameTimestampRatio: metadata.coverFrameTimestampRatio,
        });
        await setThumbnail({ channelId: channel.id, youtubeVideoId: uploadResult.youtubeVideoId, imagePath: framePath });
        coverFrameSet = true;
        await markFollowup(runId, token, 'thumbnail', 'succeeded');
      } catch (error) {
        await markFollowup(runId, token, 'thumbnail', 'uncertain');
        console.error(
          `[publishing] run ${runId}: custom cover-frame set failed (non-blocking, video already uploaded successfully) — ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    } else {
      console.warn(
        `[publishing] run ${runId}: video_generation output has no durationSeconds — skipping custom cover-frame step`,
      );
    }

    // Sprint 4 Task 10 (R4.4): subtitles, long-form only, after the video upload succeeded. A failure
    // is recorded, never retried, and never fails the publish. The technical error stays in the log and
    // the stage output; the plain message is what the app shows.
    let longFormOutput: Record<string, unknown> = {};
    if (isLongForm) {
      const srtPath = await findSrtPath(videoGenOutput, videoPath);
      const language = config.defaultLanguage ?? 'en';
      const trackName = languageDisplayName(language);
      try {
        if (receipt.followups.captions !== 'pending' && receipt.followups.captions !== 'succeeded')
          throw new Error('Previous subtitle attempt is unresolved or failed; upload manually');
        if (!srtPath && receipt.followups.captions === 'pending') throw new Error('captions.srt was not found next to the video');
        if (receipt.followups.captions === 'pending') {
          await markFollowup(runId, token, 'captions', 'started');
          await uploadCaptions({ channelId: channel.id, youtubeVideoId: uploadResult.youtubeVideoId, srtPath: srtPath!, language, name: trackName });
          await markFollowup(runId, token, 'captions', 'succeeded');
        }
        longFormOutput = { subtitlesUploaded: true, subtitlesLanguage: language, subtitlesQuotaUnits: CAPTIONS_INSERT_QUOTA_UNITS, chapterListIncluded };
      } catch (error) {
        if (receipt.followups.captions === 'pending')
          await markFollowup(runId, token, 'captions', srtPath ? 'uncertain' : 'failed');
        const technical = error instanceof Error ? error.message : String(error);
        console.error(`[publishing] run ${runId}: subtitle upload failed (non-blocking, video already uploaded successfully): ${technical}`);
        longFormOutput = {
          subtitlesUploaded: false,
          subtitlesMessage: subtitlesFailureMessage(error),
          subtitlesError: technical,
          chapterListIncluded,
        };
      }
    }

    // Durable checkpoint — see recordStageProgress's own comment. Written
    // before completeStage so a crash in the gap between "upload succeeded"
    // and "stage marked complete" is recoverable without re-uploading.
    const fullOutput = {
      ...longFormOutput,
      youtubeVideoId: uploadResult.youtubeVideoId,
      privacyStatus: uploadResult.privacyStatus,
      containsSyntheticMedia: uploadResult.containsSyntheticMedia,
      selfDeclaredMadeForKids: uploadResult.selfDeclaredMadeForKids,
      coverFrameSet,
      metadata,
      // Sprint 3 Task 12 (R3) — included directly in this same fullOutput
      // object (not a separate post-hoc patchStageOutput call the way R2's
      // drafts upload needs one) since this checkpoint write hasn't
      // happened yet at the point the R2 upload above runs — there's
      // nothing to patch onto yet. Absent entirely when R2 wasn't
      // configured or the upload failed, same "no field is a valid,
      // already-handled state" posture R2 established.
      ...(r2FinalKey && r2FinalUploadedAt && { r2FinalKey, r2FinalUploadedAt }),
    };
    await recordStageProgress(stage.id, fullOutput);

    // Test-only: see PUBLISHING_TEST_KILL_DELAY_MS's own comment in env.ts.
    // Zero (a no-op) in every real run.
    if (env.PUBLISHING_TEST_KILL_DELAY_MS > 0) {
      console.log(
        `[publishing] TEST MODE: sleeping ${env.PUBLISHING_TEST_KILL_DELAY_MS}ms after checkpointing youtubeVideoId=${uploadResult.youtubeVideoId}, before completing the stage — kill the process now to test resume-safety`,
      );
      await new Promise((resolve) => setTimeout(resolve, env.PUBLISHING_TEST_KILL_DELAY_MS));
    }

    const completed = await prisma.$transaction(async (tx) => {
      await completePublishingReceipt(runId, token, tx);
      await completeStage(stage.id, fullOutput, tx);
      return await updatePipelineRun(runId, { currentStage: 'analytics' }, tx);
    });
    if (heartbeat) clearInterval(heartbeat);
    return completed;
  } catch (error) {
    if (heartbeat) clearInterval(heartbeat);
    if (claimToken) {
      const receipt = await readPublishingReceipt(runId);
      if (receipt?.uploadStarted && !receipt.youtubeVideoId)
        await parkPublishingAmbiguous(runId, claimToken);
    }
    return await failStageAndEscalate(stage.id, runId, error);
  }
}

// Runs (or re-runs) the analytics stage — Week 4 Task 3. The initial
// post-publish snapshot; this is what advances PipelineRun.status to
// `completed` for the first time in the project (`completed` is terminal —
// see docs/execution/week4/BUSINESS_LOGIC.md Section 1). Ongoing polling
// afterward (runPeriodicPoll, studio/src/agents/performance-analytics/) is
// NOT part of this state machine — it runs independently, on a schedule,
// against every `completed` run, per Section 8.3.
export async function runAnalyticsStage(runId: string): Promise<PipelineRun> {
  const run = await findPipelineRunById(runId);
  if (!run) {
    throw new Error(`PipelineRun ${runId} not found`);
  }

  const publishingStage = await findLatestAttempt(runId, 'publishing');
  if (!publishingStage || publishingStage.status !== 'completed' || !publishingStage.output) {
    throw new Error(`PipelineRun ${runId} has no completed publishing output — cannot run analytics`);
  }
  const youtubeVideoId = (publishingStage.output as { youtubeVideoId?: string }).youtubeVideoId;
  if (!youtubeVideoId) {
    throw new Error(`PipelineRun ${runId}'s publishing output has no youtubeVideoId`);
  }

  await updatePipelineRun(runId, {
    status: 'running',
    currentStage: 'analytics',
  });

  const previousAttempt = await findLatestAttempt(runId, 'analytics');
  const attemptNumber = previousAttempt ? previousAttempt.attemptNumber + 1 : 1;
  const stageInput = { youtubeVideoId };
  const stage = await createStageAttempt({
    pipelineRunId: runId,
    stageName: 'analytics',
    attemptNumber,
    input: stageInput,
  });

  try {
    // No UsageEvent row — the YouTube Data API's videos.list call isn't
    // LLM/media-shaped (no token/character/duration cost to meter), same
    // reasoning as Pexels' $0 stock-footage search.
    const snapshot = await recordSnapshot({
      tenantId: run.tenantId,
      channelId: run.channelId,
      pipelineRunId: runId,
      youtubeVideoId,
      videoKind: run.creationOptions?.videoKind === 'long' ? 'long' : 'short',
    });

    return await prisma.$transaction(async (tx) => {
      await completeStage(
        stage.id,
        {
          snapshotId: snapshot.id,
          views: snapshot.views,
          likes: snapshot.likes,
          comments: snapshot.comments,
        },
        tx,
      );

      return await updatePipelineRun(
        runId,
        {
          status: 'completed',
          currentStage: nextStageAfter('analytics'),
          completedAt: new Date(),
        },
        tx,
      );
    });
  } catch (error) {
    return await failStageAndEscalate(stage.id, runId, error);
  }
}
