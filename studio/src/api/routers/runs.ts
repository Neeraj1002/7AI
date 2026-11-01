import { isLegacyPlannerRecoveryCandidate, legacyPlannerRecoveryCheckpoint, latestPlanningFixNotes } from '../../run-pipeline/legacy-planner-recovery';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure } from '../trpc';
import type { Context } from '../trpc';
import { findPipelineRunById, listRuns, listRunsPage, updatePipelineRun, claimPlannerContractRecovery, CANCELLED_BY_USER } from '../../models/repositories/pipeline-run.repository';
import { createRun } from '../../run-pipeline/state-machine';
import {
  listStagesForRun,
  patchStageOutput,
  findLatestAttempt,
  findLatestCompletedAttempt,
} from '../../models/repositories/pipeline-stage.repository';
import { isR2Configured, getPresignedDownloadUrl, getObjectText } from '../../storage/r2-client';
import { listReviewLogsForRun } from '../../models/repositories/review-log.repository';
import { findChannelById } from '../../models/repositories/channel.repository';
import { findByChannel } from '../../models/repositories/agent-credential.repository';
import { startPipelineInBackground, continuePipelineInBackground } from '../../run-pipeline/pipeline-runner';
import { requestCancellation, isCancellationRequested, isActivelyDriven } from '../../run-pipeline/cancellation-registry';
import { canResolveGate } from '../../run-pipeline/gate-ownership';
import { persistAngleChoice, AngleChoiceError, storyTestsEnabled } from '../../run-pipeline/story-tests-stage';
import { buildStoryTestsView } from '../../story-tests/view';
import { buildLearningRecord } from '../../story-tests/learning';
import {
  checkBudget,
  describeBudgetRefusal,
  getRemainingWeeklyUsd,
  NoBudgetConfiguredError,
} from '../../run-pipeline/budget-gate';
import { hasPendingApproval, resolvePendingApproval } from '../../notifications';
import { classifyEndError, type EndReason } from '../../run-pipeline/end-reason';
import { recordPostHocTag } from '../../run-pipeline/post-hoc-tag';
import {
  MAX_MANUAL_RETRIES_PER_STAGE,
  MANUAL_RETRY_CAP_MESSAGE,
  isManualRetryCapReached,
  isRetryBlockedByCap,
  isEligibleRecovery,
  isRetryAllowancePause,
  RETRY_ALLOWANCE_UNLIMITED_USD,
  manualRetriesUsed,
  recordManualRetry,
  retryTargetStage,
} from '../../run-pipeline/manual-retries';
import { TTS_VOICE_KEYS, assertSupportedVoice } from '../../media';
import { VISUAL_SOURCES, AUDIO_LAYERS } from '../../agents/video-generation/plan';
import { PrivacyStatusSchema, type PrivacyStatus } from '../../agents/publishing';
import { readPublishingReceipt } from '../../models/repositories/publishing-recovery.repository';
import fs from 'node:fs';
import path from 'node:path';
import { FORMAT_KEYS, findFormat, type VideoKind } from '../../formats/manifest';
import { isValidDuration, durationErrorMessage, resolveRequestedVideoKind } from '../../formats/video-kind';
import { resolveChannelConfig } from '../../channel-profile';
import { findActiveProfileForChannel } from '../../models/repositories/channel-profile-version.repository';
import { loadResolvedConfig } from '../../run-pipeline/resolved-config';
import { buildResolvedOptions } from '../../run-pipeline/resolved-options';
import { sumUsageCostForRun, sumPackagingCostForRun, listUsageCostByStage } from '../../models/repositories/usage-event.repository';
import { buildCostBreakdown, buildVideoAttempts, summarizeStages } from '../../run-pipeline/attempt-outcome';
import { deriveDisplayChapters, deriveScriptVersions } from '../../run-pipeline/script-versions';
import { forecastLength, resolveVoicePace } from '../../run-pipeline/length-forecast';
import { LONG_WORDS_PER_MINUTE } from '../../agents/script-generation/long-form';
import type { ChannelProfileData } from '../../channel-profile';
import { readStillsProgress } from '../../run-pipeline/stills-progress';
import { estimateRunCost } from '../../run-pipeline/cost-estimate';
import { readPackaging } from '../../run-pipeline/packaging-stage';
import { buildPackagingView } from '../../packaging/view';
import { resolveChoice } from '../../packaging/choice';
import { buildPackagingRecord } from '../../packaging/record';
import { checkPackageTitle as checkPackageTitleFor, packagingState, thumbnailResult } from '../../packaging/gate2-contract';
import { buildShortView, OPENING_FRAME_FILE } from '../../packaging/view';
import { thumbnailsDir } from '../../packaging/build';
import { readChapterTimings } from '../../long-form/artifacts';
import { isAuthConfigured, signThumbnailLinkToken } from '../../auth';
import { chapterBoundsForBrief, checkBriefChapterPlan, parseBriefChapterPlan } from '../../long-form/brief-chapter-plan';
import { chapterBounds, chapterBoundsView, scriptTargetWords, type ChapterBoundsView } from '../../long-form/chapter-bounds';
import { formatChapterSheet, parseChapterSheet } from '../../agents/script-generation/long-form';
import { env } from '../../config/env';
import { PIPELINE_RUN_STATUSES, STAGE_NAMES } from '../../types';
import type { Channel, CreationOptions, PipelineRun, PipelineStage, ReviewLog, StageName } from '../../types';
import { effectivePrivacy, planSettingsChange, SettingsRejected, SETTINGS_ALLOWED_STATUSES } from '../../run-pipeline/run-settings';
import { settingsPreflightIssues } from '../../run-pipeline/preflight-gate';
import type { PreflightStage } from '../../run-pipeline/preflight';
import { findUserById } from '../../models/repositories/user.repository';
import { withQualityRows, withQualitySpec } from '../../agents/video-intelligence/quality-metrics';
import { qualityProfileFor, SHORT_PROFILE, type QualityMetrics, type QualityProfile } from '../../agents/video-generation/quality-spec';
import { deriveLongFormRunFields, LINK_TTL_SECONDS } from '../../long-form/run-fields';

// Sprint 3 Task 11 (R2/B13) — the one place that normalizes gate1/gate2's
// three different raw stage-output field names (`reason`/`privacyStatus`/
// `notes`, confirmed by direct read of state-machine.ts) into one consistent
// shape, rather than the app having to know which outcome carries which raw
// field. `gate` distinguishes gate1 vs gate2 since both can produce the same
// `outcome` values (e.g. 'reject'/'approve'). Deliberately reads from
// `stages` (already fetched by `getRunDetail` below) instead of a second DB
// round-trip.
type LastGateDecision = {
  gate: 1 | 2;
  outcome: 'approve' | 'edit' | 'reject' | 'revise';
  privacyStatus?: string;
  reason?: string;
  notes?: string;
  decidedAt: Date;
};

function completedGateStages(stages: PipelineStage[]) {
  return stages.filter(
    (s): s is PipelineStage & { stageName: 'gate1' | 'gate2' } =>
      (s.stageName === 'gate1' || s.stageName === 'gate2') && s.status === 'completed' && s.output !== null,
  );
}

function normalizeGateStage(stage: PipelineStage & { stageName: 'gate1' | 'gate2' }): LastGateDecision | null {
  const output = stage.output as { outcome?: string; reason?: string; privacyStatus?: string; notes?: string };
  if (!output.outcome) return null;
  return {
    gate: stage.stageName === 'gate1' ? 1 : 2,
    outcome: output.outcome as LastGateDecision['outcome'],
    ...(output.privacyStatus !== undefined && { privacyStatus: output.privacyStatus }),
    ...(output.reason !== undefined && { reason: output.reason }),
    ...(output.notes !== undefined && { notes: output.notes }),
    decidedAt: stage.completedAt ?? stage.updatedAt,
  };
}

function deriveLastGateDecision(stages: PipelineStage[]): LastGateDecision | null {
  // `stages` is ordered oldest-first (listStagesForRun's own orderBy) — the
  // latest completed gate1/gate2 row, whichever gate it belongs to, is
  // whichever one of these matches comes last in that order (gate2 always
  // sorts after the gate1 that necessarily preceded it on the same run).
  const gateStages = completedGateStages(stages);
  const latest = gateStages[gateStages.length - 1];
  return latest ? normalizeGateStage(latest) : null;
}

// Sprint 4 Task 12 (R2): every decided gate attempt, oldest first, same normalising as
// lastGateDecision. A gate the channel turned off still leaves a completed gate row, written with
// a `system` review log of verdict 'auto-approve' on that stage (state-machine.ts), which is how
// `decidedBy: 'auto'` is told apart from a person's decision. Absent when no gate was decided.
export type GateDecisionEntry = LastGateDecision & { decidedBy: 'user' | 'auto' };

export function deriveGateDecisions(
  stages: PipelineStage[],
  reviewLogs: Pick<ReviewLog, 'stageId' | 'agent' | 'verdict'>[],
): GateDecisionEntry[] | undefined {
  const autoStageIds = new Set(
    reviewLogs.filter((l) => l.agent === 'system' && l.verdict === 'auto-approve' && l.stageId).map((l) => l.stageId),
  );
  const entries: GateDecisionEntry[] = [];
  for (const stage of completedGateStages(stages)) {
    const decision = normalizeGateStage(stage);
    if (decision) entries.push({ ...decision, decidedBy: autoStageIds.has(stage.id) ? 'auto' : 'user' });
  }
  return entries.length > 0 ? entries : undefined;
}

// Sprint 3 Task 11 (R2/B13) — string-matching on `lastError`, not a
// structured column: a real, known fragility (a future change to any of
// these exact strings silently breaks this), stated plainly per the task's
// own instruction rather than hidden. The exact strings matched are each
// written by exactly one place: `state-machine.ts`'s gate1/gate2 reject
// paths ("Rejected at Gate 1"/"Rejected at Gate 2: <reason>"),
// `pipeline-runner.ts`'s `failRunIfChannelArchived` ("Channel deleted"), and
// `runs.cancel` (R3/B11 below) — both cancel's own gate-paused and `'running'`
// paths use this identical string, confirmed by direct read/coordinated in
// this same PR.
function deriveEndReason(run: PipelineRun): EndReason | null {
  if (run.status !== 'failed') return null;
  return classifyEndError(run.lastError);
}

// Bugs Task 10 (R1) — true while a cancel request is recorded in this process
// and the run has not ended yet (memory only; false after a restart, which is
// correct: the request was lost and the user can cancel again).
function deriveCancelRequested(run: PipelineRun): boolean {
  return isCancellationRequested(run.id) && run.status !== 'completed' && run.status !== 'failed';
}

// Bugs Task 10 (R1) — newest sign of life for a run. Neither updatedAt column
// is maintained on writes (both are @default(now()) only, never @updatedAt), so
// progress is read from the timestamps that really are written: every stage
// attempt's createdAt/startedAt/completedAt, plus the run's own startedAt.
// A single long stage therefore looks quiet from its start until it finishes;
// that is what CANCEL_STALE_AFTER_MS bounds (see cancellation-registry.ts).
function lastProgressAt(run: PipelineRun, stages: PipelineStage[]): Date {
  const stamps = [run.createdAt, run.startedAt, run.updatedAt];
  for (const s of stages) stamps.push(s.createdAt, s.startedAt, s.completedAt, s.updatedAt);
  return stamps.reduce<Date>((newest, d) => (d && d > newest ? d : newest), run.createdAt);
}

// Bugs Task 3 (R1) — this run's own tenant check, same FORBIDDEN shape as
// `create`'s (Sprint 3 Hardening) and assertGateOwnership's own convention
// below. `list`/`get` were both missed by that hardening pass — this closes
// the second of the two.
function intakeRepeatTopic(
  stages: Pick<PipelineStage, 'stageName' | 'status' | 'attemptNumber' | 'output'>[],
): { runId: string; topic: string; createdAt: string } | null {
  const intake = stages
    .filter((s) => s.stageName === 'intake' && s.status === 'completed' && s.output)
    .sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
  const value = (intake?.output as { repeatTopic?: { runId: string; topic: string; createdAt: string } } | null | undefined)
    ?.repeatTopic;
  return value ?? null;
}

// The latest completed video_review attempt's qualityMetrics, with `rows` filled in from the
// stored metrics for runs measured before per-row flags existed. null when none were measured.
export function deriveQualityMetrics(
  stages: Pick<PipelineStage, 'stageName' | 'status' | 'attemptNumber' | 'input' | 'output'>[],
  profile?: QualityProfile,
  targetSeconds?: number,
): QualityMetrics | null {
  const review = stages
    .filter((s) => s.stageName === 'video_review' && s.status === 'completed')
    .sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
  const metrics = (review?.output as { qualityMetrics?: QualityMetrics } | null | undefined)?.qualityMetrics;
  if (!review || !metrics) return null;
  const source = (review.input as { visualSource?: string } | null | undefined)?.visualSource;
  const withRows = withQualityRows(metrics, source === 'ai-stills' || source === 'stock-footage' ? source : undefined, profile);
  // Sprint 4 Task 12 (R6): the numbers the checks used, and the Length row of a long video.
  return withQualitySpec(withRows, profile ?? SHORT_PROFILE, targetSeconds);
}

// Sprint 4 Task 2: the latest completed script_review attempt's concerns and
// violations plus the run's explicit sources. null before any review exists.
export function deriveScriptReview(
  run: Pick<PipelineRun, 'creationOptions'>,
  stages: Pick<PipelineStage, 'stageName' | 'status' | 'attemptNumber' | 'output'>[],
) {
  const latest = stages
    .filter((s) => s.stageName === 'script_review' && s.status === 'completed' && s.output)
    .sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
  if (!latest) return null;
  const out = latest.output as { factualConcerns?: string[]; styleGuideViolations?: string[] };
  return {
    factualConcerns: out.factualConcerns ?? [],
    styleGuideViolations: out.styleGuideViolations ?? [],
    sources: run.creationOptions?.sources ?? [],
    // Sprint 4 Task 5 (B16): the non-blocking repeat-topic warning, stored on the
    // intake stage output (not only in the Gate 1 message). null when none.
    repeatTopic: intakeRepeatTopic(stages),
  };
}

// Sprint 4 Task 9 (PR A): the long-form fields the app reads from runs.get. They are typed now and
// stay absent until the work that produces them lands (PR B / Task 10): previewUrl and the
// subtitles fields are never faked.
export type LongFormRunFields = {
  // `text` from the script; `startSec` once the video is rendered (Task 10).
  chapters?: { title: string; text?: string; startSec?: number }[];
  // Gate 1 edit sheet for a long script: each chapter as "## Title" then its text. Saving an edit
  // parses the "##" lines back into chapters.
  scriptEditText?: string;
  previewUrl?: string;
  videoUrl?: string;
  subtitlesUrl?: string;
  subtitlesUploaded?: boolean;
  subtitlesMessage?: string;
  // Why this long video will publish without a chapter list (also shown at Gate 2). Sprint 5 Task 8 (R11.4):
  // declared here because deriveLongFormRunFields already returns it and the type hid it.
  chapterWarning?: string;
};

// The chapters of the latest completed script_generation attempt; absent for a Short or
// before a long script exists.
export function deriveChapters(
  stages: Pick<PipelineStage, 'stageName' | 'status' | 'attemptNumber' | 'output'>[],
): { title: string; text: string }[] | undefined {
  const latest = stages
    .filter((s) => s.stageName === 'script_generation' && s.status === 'completed' && s.output)
    .sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
  const chapters = (latest?.output as { chapters?: unknown } | null | undefined)?.chapters;
  if (!Array.isArray(chapters) || chapters.length === 0) return undefined;
  const valid = chapters.filter(
    (c): c is { title: string; text: string } =>
      typeof c === 'object' && c !== null && typeof (c as { title?: unknown }).title === 'string' && typeof (c as { text?: unknown }).text === 'string',
  );
  return valid.length > 0 ? valid.map((c) => ({ title: c.title, text: c.text })) : undefined;
}

export function deriveFlaggedStills(
  stages: Pick<PipelineStage, 'stageName' | 'status' | 'attemptNumber' | 'output'>[],
): Array<{ sceneIndex: number; sceneId: string; issues: Array<{ kind: string; detail: string }> }> {
  const latest = stages
    .filter((s) => s.stageName === 'video_generation' && s.status === 'completed' && s.output)
    .sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
  const flagged = (latest?.output as { flaggedStills?: unknown } | null | undefined)?.flaggedStills;
  return Array.isArray(flagged) ? (flagged as Array<{ sceneIndex: number; sceneId: string; issues: Array<{ kind: string; detail: string }> }>) : [];
}

function badRequest(message: string): never {
  throw new TRPCError({ code: 'BAD_REQUEST', message });
}

// Sprint 4 Task 9 (R1/R1b/R7): everything runs.create and runs.estimateCost both decide about the
// video type and length, in one place so the two cannot disagree.
async function resolveVideoRequest(
  channel: Channel,
  input: { videoKind?: VideoKind; targetDurationSec?: number; formatKey?: string },
): Promise<{
  videoKind: VideoKind;
  targetSeconds: number;
  secondsPerStill: number | null;
  offeredFormatKeys: string[];
  profile: ChannelProfileData | null;
}> {
  const { videoKind, conflict } = resolveRequestedVideoKind(input);
  if (conflict) {
    badRequest(`That format is a ${findFormat(input.formatKey)?.videoKind} format, but the video type is ${videoKind}`);
  }
  if (input.targetDurationSec !== undefined && !isValidDuration(videoKind, input.targetDurationSec)) {
    badRequest(durationErrorMessage(videoKind));
  }
  const profile = (await findActiveProfileForChannel(channel.id))?.data ?? null;
  const config = resolveChannelConfig({
    profile,
    legacyStyleGuide: channel.styleGuide,
    legacyDefaultVoice: channel.defaultVoice,
    runOverrideTargetSeconds: input.targetDurationSec,
    runOverrideVideoKind: videoKind,
    formatKey: input.formatKey,
  });
  return {
    videoKind,
    targetSeconds: config.targetSeconds,
    secondsPerStill: config.visualSecondsPerStill,
    offeredFormatKeys: config.offeredFormatKeys,
    profile,
  };
}

// R9: the chapter rules for a long run, from the same call the prompt, the reply check and the edit sheet use.
// Read-only and computed on every read; a brief that cannot be read gives the length-based default, never an error.
export function deriveChapterBounds(
  run: { briefText?: string | null },
  resolved: { videoKind: 'short' | 'long'; targetSeconds: number },
  wordsPerMinute: number,
): ChapterBoundsView | null {
  if (resolved.videoKind !== 'long') return null;
  const seconds = resolved.targetSeconds;
  try {
    const plan = parseBriefChapterPlan(run.briefText);
    return chapterBoundsView(chapterBoundsForBrief(run.briefText, seconds), seconds, scriptTargetWords(seconds, wordsPerMinute, plan.statedWords));
  } catch {
    return chapterBoundsView(chapterBounds({ targetSeconds: seconds }), seconds, scriptTargetWords(seconds, wordsPerMinute, null));
  }
}

async function getRunDetail(id: string, ctx: Context) {
  const run = await findPipelineRunById(id);
  if (!run) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `PipelineRun ${id} not found` });
  }
  if (run.tenantId !== ctx.tenantId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `You are not allowed to view run ${id}`,
    });
  }
  const [channel, stages, reviewLogs, spentUsd, costByStage] = await Promise.all([
    findChannelById(run.channelId),
    listStagesForRun(id),
    listReviewLogsForRun(id),
    sumUsageCostForRun(id),
    listUsageCostByStage(id),
  ]);
  // Sprint 5 Task 8 (R5, R8.7): what each stage row and each video attempt really ended as, and what each
  // cost, from the rows and ledger that already exist.
  const stageSummaries = summarizeStages(stages, costByStage);
  const videoAttempts = buildVideoAttempts(stageSummaries);
  // Sprint 3 Task 11 (R2/B13) — computed at read time, not stored (no schema
  // change): both derive purely from data `getRunDetail` already fetched.
  // Sprint 3 Task 12 (R6, optional) — plain existence checks, not a
  // presigned-URL mint (that stays `runs.getVideoUrl`'s own explicit call,
  // since minting one on every `runs.get` poll would be wasteful).
  // Sprint 4 Task 9 (R1): the run's own snapshotted profile, so the chip "Video · 10 min" reads
  // the same values the pipeline does.
  const resolved = await loadResolvedConfig(run, channel ?? { styleGuide: null, defaultVoice: null });
  // Sprint 5 Task 8 (R11.1): the Script tab shows the approved (possibly edited) script once there is one.
  const scriptVersions = deriveScriptVersions(stages);
  const scriptChapters = deriveDisplayChapters(stages);
  const longForm: LongFormRunFields = { chapters: scriptChapters };
  if (scriptChapters === undefined) delete longForm.chapters;
  else longForm.scriptEditText = formatChapterSheet(scriptChapters);
  // Sprint 4 Task 10 (R3.2): preview/video/subtitle links, subtitle upload result and chapter starts,
  // for a long run only. Links are signed for 24 hours, like runs.getVideoUrl; a Short gets none.
  if (resolved.videoKind === 'long') {
    Object.assign(
      longForm,
      await deriveLongFormRunFields({
        runId: id,
        stages,
        scriptChapters,
        sign: isR2Configured() ? (key) => getPresignedDownloadUrl({ key, expiresInSeconds: LINK_TTL_SECONDS }) : undefined,
      }),
    );
  }
  const gateDecisions = deriveGateDecisions(stages, reviewLogs);
  const forecastText = (scriptVersions.approved ?? scriptVersions.draft)?.text;
  const pace = resolved.videoKind === 'long'
    ? await resolveVoicePace(run.tenantId, resolved.audioDefaultVoice)
    : { wordsPerMinute: LONG_WORDS_PER_MINUTE, source: 'default' as const };
  const retryTarget = retryTargetStage(run);
  const failedRetryStage = stages.filter(s => s.stageName === retryTarget).sort((a, b) => b.attemptNumber - a.attemptNumber)[0] ?? null;
  const approvedGate = stages.filter(s => s.stageName === 'gate1').sort((a, b) => b.attemptNumber - a.attemptNumber)[0] ?? null;
  const legacyRecovery = Boolean(legacyPlannerRecoveryCheckpoint(run, failedRetryStage, approvedGate, resolved, latestPlanningFixNotes(reviewLogs)));

  // Sprint 6 Task 1 R11 (contract B4): the thumbnail's result, once published. Composed from the publishing output and the receipt's
  // follow-up state; a failed thumbnail never changes the upload's own result.
  const receiptForThumbnail = await readPublishingReceipt(id).catch(() => null);
  const thumbnail = thumbnailResult({
    output: [...stages].reverse().find((st) => st.stageName === 'publishing')?.output as Parameters<typeof thumbnailResult>[0]['output'],
    followup: receiptForThumbnail?.followups.thumbnail,
    fileUrlFor: (packageId) =>
      isAuthConfigured()
        ? `/runs/${id}/thumbnail/${packageId}/full?t=${signThumbnailLinkToken({ runId: id, tenantId: run.tenantId, packageId, size: 'full' })}`
        : `/runs/${id}/thumbnail/${packageId}/full`,
  });

  // Sprint 6 Task 3 (contract C3): the angle step's record, from the latest completed intake attempt. null for an old run
  // and for a run made with the feature off.
  const latestIntake = stages.filter((s) => s.stageName === 'intake' && s.status === 'completed').sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
  const latestScriptReview = stages.filter((s) => s.stageName === 'script_review' && s.status === 'completed').sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
  const storyTests = buildStoryTestsView({
    intakeOutput: latestIntake?.output, runStatus: run.status, runStage: run.currentStage, switchOn: storyTestsEnabled(),
    scriptReviewOutput: latestScriptReview?.output, currentScriptText: forecastText ?? null,
  });

  return {
    thumbnail,
    storyTests,
    run,
    channel,
    stages,
    reviewLogs,
    videoKind: resolved.videoKind,
    // Long-form only; null for a Short. Declared here, so it is part of the runs.get output type.
    chapterBounds: deriveChapterBounds(run, resolved, pace.wordsPerMinute),
    targetSeconds: resolved.targetSeconds,
    ...longForm,
    lastGateDecision: deriveLastGateDecision(stages),
    // Sprint 5 Task 8 (R11.1): the writer's draft and the approved script apart, and which one the video used.
    scripts: scriptVersions,
    // Sprint 5 Task 8 (R7): where the narration will land, from the approved text (else the draft) at the
    // voice's measured pace. Long-form only.
    ...(resolved.videoKind === 'long' && forecastText !== undefined && {
      expectedLength: forecastLength({ text: forecastText, targetSeconds: resolved.targetSeconds, wordsPerMinute: pace.wordsPerMinute, paceSource: pace.source }),
    }),
    // Sprint 4 Task 12 (R2): every decided gate, oldest first; absent when none was decided.
    ...(gateDecisions && { gateDecisions }),
    // Sprint 4 Task 12 (R3): everything this run has spent (all stages and attempts), USD to 4 decimals,
    // and the run's spend limit when it has one.
    spentUsd: Math.round(spentUsd * 10000) / 10000,
    ...(run.creationOptions?.maxCostUsd !== undefined && { maxCostUsd: run.creationOptions.maxCostUsd }),
    // Sprint 5 Task 8 (R13): every settings change saved with runs.updateSettings, oldest first.
    settingsChanges: run.creationOptions?.settingsChanges ?? [],
    // Sprint 5 Task 8 (R6): pictures that still showed a logo, readable text, an invented figure or a scene against
    // its narration after their one regeneration, from the latest video attempt. Empty when none.
    flaggedStills: deriveFlaggedStills(stages),
    // Sprint 5 Task 8: one outcome and one cost per stage row (stageId matches stages[].id), and per video
    // attempt with its stages inside. cost.spentUsd = attemptsUsd + otherStagesUsd + unattributedUsd.
    stageSummaries,
    videoAttempts,
    cost: buildCostBreakdown({
      summaries: stageSummaries,
      attempts: videoAttempts,
      costByStage,
      estimateUsd: run.creationOptions?.estimateUsd,
      limitUsd: run.creationOptions?.maxCostUsd,
      retryAllowanceUsd: run.creationOptions?.retryAllowanceUsd,
    }),
    // Set while the run is parked by a pre-spend check (preflight); null otherwise.
    preflightBlock: run.creationOptions?.preflightBlock ?? null,
    // Sprint 4 Task 12 (R1): the settings the run used and where each came from; absent on older runs.
    ...(run.creationOptions?.resolvedOptions && { resolvedOptions: run.creationOptions.resolvedOptions }),
    // Sprint 4 Task 2: what the Gate 1 screen shows beyond the score, in one
    // stable place (derived from stage output and creationOptions, not stored).
    scriptReview: deriveScriptReview(run, stages),
    // Gate 2 quality checks of the latest completed video_review, with per-row warn flags
    // (qualityMetrics.rows.<row>.warn). null when the run has no measured metrics.
    qualityMetrics: deriveQualityMetrics(
      stages,
      resolved.videoKind === 'long' ? qualityProfileFor('long', resolved.visualSecondsPerStill) : undefined,
      resolved.targetSeconds,
    ),
    endReason: deriveEndReason(run),
    cancelRequested: deriveCancelRequested(run),
    // Bugs Task 12 (R1) - the app adds a Details line ("Switched to AI stills after stock footage failed review").
    videoFallbackUsed: run.creationOptions?.videoFallbackUsed === true,
    // Bugs Task 12 (R2) - the app disables Retry / Revise (with the reason under them) at the cap.
    manualRetry: {
      max: MAX_MANUAL_RETRIES_PER_STAGE,
      retryStage: retryTargetStage(run),
      retryUsed: run.currentStage ? manualRetriesUsed(run, retryTargetStage(run) ?? run.currentStage) : 0,
      retryCapReached: (() => {
        const stage = retryTargetStage(run);
        return stage ? isRetryBlockedByCap(run, stage, failedRetryStage, legacyRecovery) : false;
      })(),
      reviseCapReached: isManualRetryCapReached(run, 'video_generation'),
      message: MANUAL_RETRY_CAP_MESSAGE,
    },
    hasR2Draft: stages.some(
      (s) => s.stageName === 'video_generation' && Boolean((s.output as { r2DraftKey?: string } | null)?.r2DraftKey),
    ),
    hasR2Bundle: stages.some(
      (s) => s.stageName === 'video_generation' && Boolean((s.output as { r2ManifestKey?: string } | null)?.r2ManifestKey),
    ),
    hasR2Final: stages.some(
      (s) => s.stageName === 'publishing' && Boolean((s.output as { r2FinalKey?: string } | null)?.r2FinalKey),
    ),
  };
}

// Sprint 3 Task 2 (K1) — the gate-ownership check gate1/gate2 both run
// before ever calling resolvePendingApproval. Looks up the run/channel
// itself rather than trusting a client-supplied channelId, so there's no
// way to spoof ownership by lying about which channel a gate belongs to.
// The actual allow/deny decision is canResolveGate (run-pipeline/gate-ownership.ts),
// kept pure and separate so it can be unit tested directly.
async function assertGateOwnership(runId: string, ctx: Context): Promise<Channel> {
  const run = await findPipelineRunById(runId);
  if (!run) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `PipelineRun ${runId} not found` });
  }
  const channel = await findChannelById(run.channelId);
  if (!channel) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `Channel for run ${runId} not found` });
  }

  if (!canResolveGate(ctx, channel)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `You are not allowed to resolve gates for run ${runId}`,
    });
  }
  return channel;
}

// Bugs Task 8 (R1) + Sprint 3 Task 8 (R3) — the two checks every real path to
// starting a run must apply: an archived channel is retired for good, and an
// unlinked channel would spend the whole pipeline's LLM/TTS/footage budget
// only to fail at the very last stage. Extracted so Sprint 3 Task 11
// (R4/B12)'s `rerun` applies the exact same checks `create` already does,
// against the same channel, rather than a second copy that could drift.
async function assertChannelCanRun(channel: Channel): Promise<void> {
  if (!channel.isActive) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `Channel ${channel.id} is archived` });
  }
  if (!(await findByChannel(channel.id))) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: `Channel "${channel.name}" isn't connected to YouTube yet — connect it before starting a run`,
    });
  }
}

// The spend-limit rule of runs.retry, shared with runs.updateSettings so there is one way to change it (Sprint 5
// Task 8, R13): long videos only, and not above the per-video ceiling.
function validateMaxCostUsd(run: PipelineRun, value: number): number {
  if (run.creationOptions?.videoKind !== 'long') {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'A spend limit can only be set for a long video' });
  }
  if (value > env.LONGFORM_MAX_RUN_USD_LIMIT) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `The spend limit cannot be more than $${env.LONGFORM_MAX_RUN_USD_LIMIT.toFixed(2)} per video` });
  }
  return value;
}

type RetryPlan = {
  target: StageName;
  regenCapped: boolean;
  newMaxCostUsd: number | undefined;
  liftedAllowance: number | undefined;
  countsManual: boolean;
  legacyRecovery: boolean;
};

// Everything runs.retry checks before it changes anything (no writes). Shared by runs.retry and runs.updateSettings
// with retry: true, so a Retry after a settings change obeys exactly the same rules.
async function prepareRetry(run: PipelineRun, channel: Channel, maxCostUsd: number | undefined): Promise<RetryPlan> {
  if (!run.currentStage) {
    throw new TRPCError({ code: 'CONFLICT', message: `Run ${run.id} has no stage to retry` });
  }
  // Bugs Task 9 (R4) - a regen-cap escalation parks at currentStage 'video_review'; Retry means "make one more
  // video": step back to video_generation. Bugs Task 12 (R5b) - Retry restarts the stage that actually failed and
  // never re-runs a gate.
  const target = retryTargetStage(run);
  if (!target) {
    throw new TRPCError({ code: 'CONFLICT', message: `Run ${run.id} has no stage to retry` });
  }
  if (target === 'publishing') {
    const receipt = await readPublishingReceipt(run.id);
    if (receipt?.phase === 'ambiguous' || (receipt?.ownerToken && receipt.leaseUntil
        && Date.parse(receipt.leaseUntil) > Date.now())
        || (receipt?.uploadStarted && !receipt.youtubeVideoId && !receipt.sessionCiphertext)) {
      throw new TRPCError({ code: 'CONFLICT',
        message: 'Publishing is active or its YouTube outcome is unresolved. Refresh and review before retrying.' });
    }
  }
  // Bugs Task 12 (R2) - counted per stage; the 4th manual Retry is refused with the reason.
  const failedTarget = await findLatestAttempt(run.id, target);
  // A run stopped by preflight never spent anything and made no attempt, so its Retry is free.
  const eligibleRecovery = isEligibleRecovery(failedTarget) || Boolean(run.creationOptions?.preflightBlock);
  let legacyRecovery = false;
  if (isLegacyPlannerRecoveryCandidate(run, failedTarget)) {
    const [gate, config, logs] = await Promise.all([findLatestAttempt(run.id, 'gate1'), loadResolvedConfig(run, channel), listReviewLogsForRun(run.id)]);
    legacyRecovery = Boolean(legacyPlannerRecoveryCheckpoint(run, failedTarget, gate, config, latestPlanningFixNotes(logs)));
  }
  if (isRetryBlockedByCap(run, target, failedTarget, legacyRecovery)) {
    throw new TRPCError({ code: 'CONFLICT', message: MANUAL_RETRY_CAP_MESSAGE });
  }
  // Bugs Closure R1 - a Retry the budget gate would refuse at once only creates another skipped attempt; say why.
  if (target === 'script_generation' || target === 'video_generation') {
    const budget = await checkBudget(run.tenantId, channel.id, channel.platform);
    if (!budget.ok) {
      throw new TRPCError({ code: 'CONFLICT', message: describeBudgetRefusal(budget) });
    }
  }
  // Sprint 4 Task 9 (R7.3): a run stopped at its spend limit can be retried with a higher one.
  const newMaxCostUsd = maxCostUsd !== undefined ? validateMaxCostUsd(run, maxCostUsd) : undefined;
  // Sprint 5 Task 8 (D1): a Retry after the automatic-retry allowance pause is the person agreeing to spend on, so
  // the allowance moves up to the run's spend limit (the new one when they raised it).
  const liftedAllowance = isRetryAllowancePause(run.lastError)
    ? newMaxCostUsd ?? run.creationOptions?.maxCostUsd ?? RETRY_ALLOWANCE_UNLIMITED_USD
    : undefined;
  return {
    target,
    regenCapped: target !== run.currentStage,
    newMaxCostUsd,
    liftedAllowance,
    countsManual: !eligibleRecovery && !isRetryAllowancePause(run.lastError),
    legacyRecovery,
  };
}

// The single write of a Retry. `extraMerge` carries settings changed in the same call, so they land with it.
async function commitRetry(run: PipelineRun, plan: RetryPlan, extraMerge: Partial<CreationOptions> = {}): Promise<PipelineRun> {
  if (plan.countsManual) await recordManualRetry(run, plan.target);
  const merge: Partial<CreationOptions> = {
    ...extraMerge,
    ...(plan.newMaxCostUsd !== undefined && { maxCostUsd: plan.newMaxCostUsd }),
    ...(plan.liftedAllowance !== undefined && { retryAllowanceUsd: plan.liftedAllowance }),
  };
  const updated = await updatePipelineRun(run.id, {
    status: 'running',
    lastError: null,
    ...(plan.regenCapped && { currentStage: plan.target }),
    ...(Object.keys(merge).length > 0 && { creationOptionsMerge: merge }),
  });
  continuePipelineInBackground(run.id);
  return updated;
}

export const runsRouter = router({
  // POST /runs — BUSINESS_LOGIC.md Section 2. Creates the row, then drives it
  // in the background (pipeline-runner.ts) rather than leaving it sitting at
  // 'pending' forever — nothing else in this codebase currently starts a
  // 'pending' run on its own (resume-on-startup.ts only ever resumes
  // 'running' ones).
  create: publicProcedure
    .input(
      z.object({
        channelId: z.string().uuid(),
        briefText: z.string().min(1),
        // Sprint 2 Task 1 (D2) — an explicit, structured choice, validated
        // against media/registry.ts's known TTS_VOICES keys right here at
        // the API edge (Failure Modes: reject bad structured input at the
        // edge, not deep in the pipeline). Never passed through
        // parse-brief.ts's LLM call — that's the whole point of this field
        // existing separately from briefText.
        voice: z.enum(TTS_VOICE_KEYS).optional(),
        // Sprint 2 Task 2 (E2) — same edge-validation posture as voice:
        // rejected here (a structured tRPC input error) if it doesn't match
        // a real visualSource, never passed through as free text for
        // parse-brief.ts or the planning LLM to interpret loosely.
        visualSource: z.enum(VISUAL_SOURCES).optional(),
        // Sprint 2 Task 3 (F1) — same edge-validation posture as
        // voice/visualSource: rejected here if it doesn't match a real mood
        // tag (or "none"), never passed through as free text.
        audioLayer: z.enum(AUDIO_LAYERS).optional(),
        // Sprint 3 Task 9 (R4) — same edge-validation posture as
        // voice/visualSource/audioLayer above.
        // Sprint 4 Task 9 (R1): a Short is 30/45/60; a long video is whole minutes from 120 to 900.
        // The exact rule depends on videoKind, so it is checked in the mutation, not here.
        targetDurationSec: z.number().int().optional(),
        // Sprint 4 Task 9 (R1): default 'short'. Inferred from formatKey when only that is sent.
        videoKind: z.enum(['short', 'long']).optional(),
        // Sprint 4 Task 2 (R5): explicit sources only, folded into creationOptions.
        sources: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
        // Sprint 4 Task 6: validated against the format manifest at the edge.
        formatKey: z.enum(FORMAT_KEYS).optional(),
        // Sprint 4 Task 9 (R7): per-video spend limit in USD for a long video; default is the
        // suggested value from runs.estimateCost. Stored now, enforced during the run in PR B.
        maxCostUsd: z.number().positive().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const channel = await findChannelById(input.channelId);
      if (!channel) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Channel ${input.channelId} not found` });
      }
      // Sprint 3 Hardening — closes KNOWN_ISSUES_AND_BLOCKERS.md §3's real,
      // live-demonstrated gap: nothing previously stopped a signed-in
      // session from creating a run against a *different* tenant's channel
      // if it knew that channel's id. Mirrors assertGateOwnership's own
      // FORBIDDEN shape/message convention (below) rather than inventing a
      // second authorization-error style for the same class of check —
      // creation-time ownership, not resolution-time (Task 2/K1, already
      // closed).
      if (channel.tenantId !== ctx.tenantId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: `You are not allowed to create a run against channel ${input.channelId}`,
        });
      }
      await assertChannelCanRun(channel);

      // Sprint 4 Task 9 (R1/R1b/R5.3/R7): video type, length, offered formats, spend limit.
      const request = await resolveVideoRequest(channel, input);
      const isLong = request.videoKind === 'long';
      if (input.formatKey && request.offeredFormatKeys.length > 0 && !request.offeredFormatKeys.includes(input.formatKey)) {
        badRequest('That format is not offered by this channel');
      }
      if (isLong && input.visualSource === 'stock-footage') {
        badRequest('Long videos use AI stills only; stock footage is not available for them');
      }
      if (!isLong && input.maxCostUsd !== undefined) {
        badRequest('A spend limit can only be set for a long video');
      }
      // Bugs (chapter bounds): the brief's chapter titles, word budgets and fact allocations must agree and
      // fit the video's length. Free, so it comes before the cost estimate and before anything is spent.
      let intakeWarnings: string[] = [];
      if (isLong) {
        const chapterPlan = checkBriefChapterPlan(input.briefText, request.targetSeconds);
        if (!chapterPlan.ok) badRequest(chapterPlan.message);
        intakeWarnings = chapterPlan.warnings;
        for (const warning of intakeWarnings) console.warn(`[runs.create] ${warning}`);
      }
      let maxCostUsd: number | undefined;
      let storedEstimate: { estimateUsd: number; retryAllowanceUsd?: number } | undefined;
      if (isLong) {
        const estimate = estimateRunCost({
          videoKind: 'long',
          targetSeconds: request.targetSeconds,
          secondsPerStill: request.secondsPerStill,
        });
        maxCostUsd = input.maxCostUsd ?? estimate.suggestedMaxUsd;
        storedEstimate = { estimateUsd: estimate.estimateUsd, retryAllowanceUsd: estimate.retryAllowanceUsd };
        if (maxCostUsd > env.LONGFORM_MAX_RUN_USD_LIMIT) {
          badRequest(`The spend limit cannot be more than $${env.LONGFORM_MAX_RUN_USD_LIMIT.toFixed(2)} per video`);
        }
        if (maxCostUsd < estimate.estimateUsd) {
          badRequest(
            `Spend limit $${maxCostUsd.toFixed(2)} is below the estimated $${estimate.estimateUsd.toFixed(2)} for this video`,
          );
        }
        // R7.2: one attempt must fit in what this channel may still spend this week.
        let remaining: number;
        try {
          remaining = await getRemainingWeeklyUsd(channel.tenantId, channel.id, channel.platform);
        } catch (err) {
          if (err instanceof NoBudgetConfiguredError) badRequest('No weekly budget is configured for this account');
          throw err;
        }
        if (estimate.estimateUsd > remaining) {
          badRequest(`Estimated $${estimate.estimateUsd.toFixed(2)} for this video, $${remaining.toFixed(2)} left this week for this channel`);
        }
      } else {
        // Bugs Acceptance run 1 (R4): a Short has no spend limit, but its estimate is kept so the cost card can show
        // it next to the final cost. Display only: nothing reads it to decide a retry or a block.
        storedEstimate = { estimateUsd: estimateRunCost({ videoKind: 'short', targetSeconds: request.targetSeconds, secondsPerStill: request.secondsPerStill }).estimateUsd };
      }

      // Sprint 4 Task 12 (R1): the settings this run will use and where each came from, written once
      // with the picks. Built from what the user picked, before any default is filled in.
      const resolvedOptions = buildResolvedOptions({
        picks: { ...input, videoKind: request.videoKind },
        profile: request.profile,
        legacyStyleGuide: channel.styleGuide,
        legacyDefaultVoice: channel.defaultVoice,
      });
      // The voice this run will actually use, from any level (a stale channel default included), is
      // checked now so the user hears about it before the run exists, not at the Video step.
      try { assertSupportedVoice(resolvedOptions.voice.key); } catch (e) { badRequest((e as Error).message); }
      const creationOptions = {
        ...(input.voice && { voice: input.voice }),
        ...(input.visualSource && { visualSource: input.visualSource }),
        ...(input.audioLayer && { audioLayer: input.audioLayer }),
        // A long run stores the resolved length (default 600), so every stage reads one value.
        ...((isLong || input.targetDurationSec) && { targetDurationSec: isLong ? request.targetSeconds : input.targetDurationSec }),
        ...(isLong && { videoKind: 'long' as const }),
        ...(maxCostUsd !== undefined && { maxCostUsd }),
        // Sprint 5 Task 8 (R8.1): what one clean attempt should cost, and the automatic-retry allowance (D1).
        ...(storedEstimate && storedEstimate),
        ...(input.sources?.length && { sources: input.sources }),
        ...(input.formatKey && { formatKey: input.formatKey }),
        ...(intakeWarnings.length > 0 && { intakeWarnings }),
        resolvedOptions,
      };
      // Sprint 3 Task 1 (J3) — the real signed-in session's tenant, never
      // MVP_TENANT_ID. Now guaranteed to match channel.tenantId by the
      // check above (Sprint 3 Hardening).
      const run = await createRun({
        tenantId: ctx.tenantId,
        channelId: input.channelId,
        briefText: input.briefText,
        creationOptions,
      });
      startPipelineInBackground(run.id);
      return run;
    }),

  // Sprint 4 Task 9 (R7): the brief screen's cost preview. Same channel ownership check as create;
  // read-only (writes nothing). suggestedMaxUsd is what runs.create uses when maxCostUsd is omitted.
  estimateCost: publicProcedure
    .input(
      z.object({
        channelId: z.string().uuid(),
        videoKind: z.enum(['short', 'long']),
        targetDurationSec: z.number().int().optional(),
        options: z.object({ secondsPerStill: z.number().min(1).max(10).optional() }).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const channel = await findChannelById(input.channelId);
      if (!channel) badRequest(`Channel ${input.channelId} not found`);
      if (channel.tenantId !== ctx.tenantId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: `You are not allowed to estimate a run for channel ${input.channelId}` });
      }
      const request = await resolveVideoRequest(channel, input);
      const estimate = estimateRunCost({
        videoKind: request.videoKind,
        targetSeconds: request.targetSeconds,
        secondsPerStill: input.options?.secondsPerStill ?? request.secondsPerStill,
      });
      let remainingWeeklyUsd: number;
      try {
        remainingWeeklyUsd = await getRemainingWeeklyUsd(channel.tenantId, channel.id, channel.platform);
      } catch (err) {
        if (err instanceof NoBudgetConfiguredError) badRequest('No weekly budget is configured for this account');
        throw err;
      }
      return {
        estimateUsd: estimate.estimateUsd,
        worstCaseUsd: estimate.worstCaseUsd,
        suggestedMaxUsd: estimate.suggestedMaxUsd,
        // Sprint 5 Task 8 (R8.1): the range a person should expect, retries included (D1: up to 2 x the estimate).
        retryAllowanceUsd: estimate.retryAllowanceUsd,
        rangeUsd: estimate.rangeUsd,
        remainingWeeklyUsd,
      };
    }),

  // Sprint 5 Task 8 (R7): where a script will land, judged against the run's target. Used by the Gate 1 edit
  // screen on the text being edited, so the warning follows the approved text and not only the writer's draft.
  expectedLength: publicProcedure
    .input(z.object({ runId: z.string().uuid(), scriptText: z.string().min(1).max(100_000) }))
    .query(async ({ input, ctx }) => {
      const run = await findPipelineRunById(input.runId);
      if (!run) throw new TRPCError({ code: 'NOT_FOUND', message: `PipelineRun ${input.runId} not found` });
      if (run.tenantId !== ctx.tenantId) throw new TRPCError({ code: 'FORBIDDEN', message: `You are not allowed to view run ${input.runId}` });
      const channel = await findChannelById(run.channelId);
      const resolved = await loadResolvedConfig(run, channel ?? { styleGuide: null, defaultVoice: null });
      const pace = await resolveVoicePace(run.tenantId, resolved.audioDefaultVoice);
      return forecastLength({ text: input.scriptText, targetSeconds: resolved.targetSeconds, wordsPerMinute: pace.wordsPerMinute, paceSource: pace.source });
    }),

  // GET /runs — Queue screen (Task 2): filterable by status/stage.
  // Bugs Task 3 (R1) — tenant-scoped: ctx.tenantId always threaded through,
  // same as `create`'s own tenant check. Previously queried every tenant's
  // runs unconditionally.
  list: publicProcedure
    .input(
      z.object({
        statuses: z.array(z.enum(PIPELINE_RUN_STATUSES)).optional(),
        stage: z.enum(STAGE_NAMES).optional(),
        channelId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const runs = await listRuns({ ...input, tenantId: ctx.tenantId });
      return runs.map((run) => ({ ...run, cancelRequested: deriveCancelRequested(run), endReason: deriveEndReason(run) }));
    }),

  // Sprint 5 Task 8 (R12): the same filters as list, in pages. list returns every run of the tenant, so a
  // screen that shows fewer than it should is cutting the list itself, not the server. Newest first by
  // createdAt; pass back nextCursor for the next page; total counts the whole filtered set.
  // statuses: ['failed'] returns every run whose final state is Failed, with or without channelId; endReason
  // on each row ('failed' | 'rejected' | 'cancelled' | 'channel_deleted') tells the app which kind of end it was.
  listPage: publicProcedure
    .input(
      z.object({
        statuses: z.array(z.enum(PIPELINE_RUN_STATUSES)).optional(),
        stage: z.enum(STAGE_NAMES).optional(),
        channelId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(200).optional(), // the repository clamps to the same 200
        cursor: z.string().uuid().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const page = await listRunsPage({ ...input, tenantId: ctx.tenantId });
      return {
        ...page,
        items: page.items.map((run) => ({ ...run, cancelRequested: deriveCancelRequested(run), endReason: deriveEndReason(run) })),
      };
    }),

  // GET /runs/:id — full detail: run + channel + full stage history +
  // review logs (script, video, gate decisions all live here).
  get: publicProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input, ctx }) => {
    return getRunDetail(input.id, ctx);
  }),

  // Sprint 3 Task 11 (R5, optional) — a lighter poll target than refetching
  // all of `runs.get` (full stage history + review logs) every few seconds
  // while a run is actively progressing. `attemptNo` reflects the current
  // stage's own latest attempt specifically (not just "the most recently
  // touched stage row overall", which could be a different, already-finished
  // stage if the current one hasn't started its first attempt yet). No
  // `pct` — this pipeline has no meaningful notion of percent-through-a-stage
  // today (a stage is either not started, running, or done), so it's left
  // genuinely absent rather than a fabricated number.
  progress: publicProcedure.input(z.object({ runId: z.string().uuid() })).query(async ({ input, ctx }) => {
    const run = await findPipelineRunById(input.runId);
    if (!run) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `PipelineRun ${input.runId} not found` });
    }
    if (run.tenantId !== ctx.tenantId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: `You are not allowed to view run ${input.runId}` });
    }
    const currentStageAttempt = run.currentStage ? await findLatestAttempt(input.runId, run.currentStage) : null;
    // Sprint 4 Task 12 (R4): while the stills of a video are being made, how many are finished and
    // how many are planned. Absent for every other stage, and before the first count is stored.
    const stills =
      run.currentStage === 'video_generation' && currentStageAttempt?.status === 'running'
        ? readStillsProgress(currentStageAttempt.output)
        : undefined;
    return { stage: run.currentStage, attemptNo: currentStageAttempt?.attemptNumber ?? null, ...stills };
  }),

  // Sprint 3 Task 12 (R5) — mints a fresh 24h presigned R2 URL on demand, so
  // another Claude session with no device/SSH access to the VPS can fetch a
  // generated video directly (a curl/fetch, no app, no session needed — see
  // reports/task12.md for the exact invocation shape). Same tenant-scoping
  // pattern `get`/`progress` already use, not `assertGateOwnership` (this is
  // a plain read, not a gate resolution). Never persists the minted URL —
  // fresh every call, so a stale, leaked link simply expires.
  getVideoUrl: publicProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        // Only meaningful for variant:'draft' — a specific attempt's own
        // upload, not "the latest." Ignored for variant:'final' (there's
        // only ever one).
        attemptNumber: z.number().int().positive().optional(),
        variant: z.enum(['draft', 'final']).optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const run = await findPipelineRunById(input.runId);
      if (!run) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `PipelineRun ${input.runId} not found` });
      }
      if (run.tenantId !== ctx.tenantId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: `You are not allowed to view run ${input.runId}` });
      }
      if (!isR2Configured()) {
        return { available: false as const };
      }

      let variant = input.variant;
      let key: string | undefined;

      if (variant === 'final' || !variant) {
        const publishingStage = await findLatestCompletedAttempt(input.runId, 'publishing');
        const r2FinalKey = (publishingStage?.output as { r2FinalKey?: string } | undefined)?.r2FinalKey;
        if (r2FinalKey) {
          variant = 'final';
          key = r2FinalKey;
        } else if (variant === 'final') {
          // Explicitly asked for 'final' and there isn't one — don't
          // silently fall back to a draft the caller didn't ask for.
          return { available: false as const };
        }
      }

      if (!key) {
        // Either variant:'draft' was explicit, or omitted-variant found no
        // final and is falling back to the latest (or a specific) draft.
        variant = 'draft';
        const stages = await listStagesForRun(input.runId);
        const draftStage = input.attemptNumber
          ? stages.find((s) => s.stageName === 'video_generation' && s.attemptNumber === input.attemptNumber)
          : [...stages].reverse().find((s) => s.stageName === 'video_generation' && s.status === 'completed');
        key = (draftStage?.output as { r2DraftKey?: string } | undefined)?.r2DraftKey;
      }

      if (!key) {
        return { available: false as const };
      }

      const expiresInSeconds = 24 * 60 * 60;
      const url = await getPresignedDownloadUrl({ key, expiresInSeconds });
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
      return { available: true as const, variant, url, expiresAt };
    }),

  // Sprint 3 Task 13 (R4) — presigned URLs for every file in an attempt's
  // debug bundle (see storage/attempt-bundle.ts). Same tenant scoping as
  // getVideoUrl. Defaults to the latest video_generation attempt that has a
  // manifest; "no manifest" (never uploaded, or upload interrupted) is
  // { available: false }, not an error.
  getAttemptBundle: publicProcedure
    .input(z.object({ runId: z.string().uuid(), attemptNumber: z.number().int().positive().optional() }))
    .query(async ({ input, ctx }) => {
      const run = await findPipelineRunById(input.runId);
      if (!run) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `PipelineRun ${input.runId} not found` });
      }
      if (run.tenantId !== ctx.tenantId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: `You are not allowed to view run ${input.runId}` });
      }
      if (!isR2Configured()) {
        return { available: false as const };
      }

      const stages = await listStagesForRun(input.runId);
      type BundleOutput = { r2ManifestKey?: string; r2BundlePrefix?: string };
      const withManifest = stages.filter(
        (s) => s.stageName === 'video_generation' && Boolean((s.output as BundleOutput | null)?.r2ManifestKey),
      );
      const stage = input.attemptNumber
        ? withManifest.find((s) => s.attemptNumber === input.attemptNumber)
        : withManifest[withManifest.length - 1];
      const manifestKey = (stage?.output as BundleOutput | undefined)?.r2ManifestKey;
      if (!stage || !manifestKey) {
        return { available: false as const };
      }

      const manifest = JSON.parse(await getObjectText(manifestKey)) as {
        files: Array<{ name: string; key: string; contentType: string; bytes: number }>;
      };
      const expiresInSeconds = 24 * 60 * 60;
      const files = await Promise.all(
        manifest.files.map(async (f) => ({
          name: f.name,
          contentType: f.contentType,
          bytes: f.bytes,
          url: await getPresignedDownloadUrl({ key: f.key, expiresInSeconds }),
        })),
      );
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
      return { available: true as const, attemptNumber: stage.attemptNumber, manifest, files, expiresAt };
    }),

  // POST /runs/:id/gate1 — resolves a pending Gate 1 through the same
  // resolution primitive every NotificationChannel shares
  // (resolvePendingApproval), converting the structured action into the exact
  // raw reply-string grammar agents/gate1/index.ts's parseGateReply already
  // parses (approve / "reject <reason>" / free text = edit) — no duplicate
  // parsing logic here.
  gate1: publicProcedure
    .input(
      z.discriminatedUnion('action', [
        z.object({ runId: z.string().uuid(), action: z.literal('approve') }),
        z.object({ runId: z.string().uuid(), action: z.literal('reject'), reason: z.string().min(1) }),
        z.object({ runId: z.string().uuid(), action: z.literal('edit'), editedScriptText: z.string().min(1) }),
      ]),
    )
    .mutation(async ({ input, ctx }) => {
      await assertGateOwnership(input.runId, ctx);

      // Sprint 4 Task 9 (R2.5): a long script is edited as "## Title" chapter sections; refuse an edit
      // that does not parse into a valid chapter list (chapter-bounds.ts) before it reaches the pipeline.
      if (input.action === 'edit') {
        const editedRun = await findPipelineRunById(input.runId);
        if (editedRun?.creationOptions?.videoKind === 'long') {
          const parsed = parseChapterSheet(input.editedScriptText, editedRun.creationOptions.targetDurationSec);
          if (!parsed.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: parsed.message });
        }
      }

      const replyText =
        input.action === 'approve'
          ? 'approve'
          : input.action === 'reject'
            ? `reject ${input.reason}`
            : input.editedScriptText;

      const { resolved } = resolvePendingApproval(input.runId, { reply: replyText, userId: ctx.userId });
      if (!resolved) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Gate 1 for run ${input.runId} is not currently pending (already resolved, or not open yet)`,
        });
      }
      return { resolved: true };
    }),

  // POST /runs/:id/choose-angle — Sprint 6 Task 3 (contract C4). Records the founder's choice of angle (null = write from the
  // brief) on the intake stage, then moves the run from 'paused_angle' to the script step. Same ownership check as gate1.
  chooseAngle: publicProcedure
    .input(z.object({ runId: z.string().uuid(), angleId: z.string().min(1).nullable() }))
    .mutation(async ({ input, ctx }) => {
      await assertGateOwnership(input.runId, ctx);
      try {
        await persistAngleChoice(input.runId, input.angleId);
      } catch (error) {
        if (error instanceof AngleChoiceError) throw new TRPCError({ code: error.code, message: error.message });
        throw error;
      }
      continuePipelineInBackground(input.runId);
      return { resolved: true as const };
    }),

  // POST /runs/:id/gate2 — same pattern as gate1, against
  // agents/gate2/index.ts's parseGate2Reply grammar (approve / "reject
  // <reason>" / free text = revision notes).
  gate2: publicProcedure
    .input(
      z.discriminatedUnion('action', [
        z.object({
          runId: z.string().uuid(),
          action: z.literal('approve'),
          // Sprint 3 Task 8 (R1) — optional per-approval visibility choice;
          // omitted means the channel's own defaultPrivacyStatus applies.
          privacyStatus: PrivacyStatusSchema.optional(),
        }),
        z.object({ runId: z.string().uuid(), action: z.literal('reject'), reason: z.string().min(1) }),
        z.object({ runId: z.string().uuid(), action: z.literal('revise'), notes: z.string().min(1) }),
      ]),
    )
    .mutation(async ({ input, ctx }) => {
      const channel = await assertGateOwnership(input.runId, ctx);
      // Sprint 5 Task 8 (R13): a visibility chosen earlier with runs.updateSettings is the default here.
      const overrideRun = input.action === 'approve' ? await findPipelineRunById(input.runId) : null;

      // Sprint 3 Task 8 (R1) — always send an explicit `approve <privacy>`
      // (matches parseGate2Reply's APPROVE_WITH_PRIVACY exactly): the explicit
      // choice wins, else the channel's own default — never a bare 'approve'.
      const replyText =
        input.action === 'approve'
          ? `approve ${input.privacyStatus ?? overrideRun?.creationOptions?.privacyStatus ?? channel.defaultPrivacyStatus}`
          : input.action === 'reject'
            ? `reject ${input.reason}`
            : input.notes;

      // Bugs Task 12 (R2/R5a) - a Revise starts a new video attempt: it is counted by the manual cap
      // (not the automatic regeneration cap) and refused up front, with the reason, at that cap or
      // when the budget gate would refuse the render. A refused Revise creates no attempt and does
      // not count.
      let reviseRun: PipelineRun | null = null;
      if (input.action === 'revise') {
        reviseRun = await findPipelineRunById(input.runId);
        if (reviseRun && isManualRetryCapReached(reviseRun, 'video_generation')) {
          throw new TRPCError({ code: 'CONFLICT', message: MANUAL_RETRY_CAP_MESSAGE });
        }
        const budget = await checkBudget(channel.tenantId, channel.id, channel.platform);
        if (!budget.ok) {
          throw new TRPCError({ code: 'CONFLICT', message: describeBudgetRefusal(budget) });
        }
      }

      const { resolved } = resolvePendingApproval(input.runId, { reply: replyText, userId: ctx.userId });
      if (!resolved) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Gate 2 for run ${input.runId} is not currently pending (already resolved, or not open yet)`,
        });
      }
      if (reviseRun) await recordManualRetry(reviseRun, 'video_generation');
      return { resolved: true };
    }),

  // Sprint 6 Task 1 (R5): the curiosity packages made for this run's Gate 2, in the shape the app shows, and the
  // founder's choice once made. Same tenant scoping as `get`. `pending` is true while Gate 2 is open and the
  // packages are still being made (or the run has no packaging, as for a Short).
  packaging: publicProcedure.input(z.object({ runId: z.string().uuid() })).query(async ({ input, ctx }) => {
    const run = await findPipelineRunById(input.runId);
    if (!run) throw new TRPCError({ code: 'NOT_FOUND', message: `PipelineRun ${input.runId} not found` });
    if (run.tenantId !== ctx.tenantId) throw new TRPCError({ code: 'FORBIDDEN', message: `You are not allowed to view run ${input.runId}` });
    const stages = await listStagesForRun(input.runId);
    const gateRows = stages.filter((st) => st.stageName === 'gate2');
    const withPackaging = [...gateRows].reverse().find((st) => readPackaging(st.output));
    const packaging = withPackaging ? readPackaging(withPackaging.output) : null;
    const video = [...stages].reverse().find((st) => st.stageName === 'video_generation' && st.status === 'completed');
    const videoOut = video?.output as { durationSeconds?: number } | null | undefined;
    const videoSeconds = typeof videoOut?.durationSeconds === 'number' ? videoOut.durationSeconds : null;
    const channel = await findChannelById(run.channelId);
    const resolved = await loadResolvedConfig(run, channel ?? { styleGuide: null, defaultVoice: null });
    const isLong = resolved.videoKind === 'long';
    const packagingCostUsd = await sumPackagingCostForRun(input.runId);
    // A one-hour link per picture, so the app and the system browser can fetch it without a header.
    const linkFor = isAuthConfigured()
      ? (packageId: string, size: string) =>
          `/runs/${input.runId}/thumbnail/${packageId}/${size}?t=${signThumbnailLinkToken({ runId: input.runId, tenantId: run.tenantId, packageId, size })}`
      : undefined;
    // R7: a Short's package is its opening (hook line and first frame), kept on the run; it has nothing to choose.
    const opening = run.creationOptions?.opening;
    if (!isLong && opening) {
      return {
        making: false,
        pending: false,
        view: buildShortView({ runId: input.runId, opening, frameExists: fs.existsSync(path.join(thumbnailsDir(input.runId), OPENING_FRAME_FILE)), videoSeconds, packagingCostUsd, linkFor }),
      };
    }
    // `making`: the packages are made before the Gate 2 approval is registered, while the run already reads paused_gate2.
    const state = packagingState({ runStatus: run.status, isLong, packaging, approvalOpen: hasPendingApproval(input.runId) });
    return {
      making: state.making,
      pending: state.pending,
      view: packaging && packaging.status !== 'building'
        ? buildPackagingView({ runId: input.runId, packaging, chapterTimings: readChapterTimings(video?.output), videoSeconds, packagingCostUsd, ...(linkFor && { linkFor }) })
        : null,
    };
  }),

  // Sprint 6 Task 1 R11 (contract B3): the live check of a title for one package, as the founder types. It is `checkTitle` and nothing
  // else (the function `choosePackage` refuses with), so the two cannot disagree; the app adds no rule. Tenant-checked like `packaging`.
  checkPackageTitle: publicProcedure
    .input(z.object({ runId: z.string().uuid(), packageId: z.string().min(1).max(40), title: z.string().max(400) }))
    .query(async ({ input, ctx }) => {
      const run = await findPipelineRunById(input.runId);
      if (!run) throw new TRPCError({ code: 'NOT_FOUND', message: `PipelineRun ${input.runId} not found` });
      if (run.tenantId !== ctx.tenantId) throw new TRPCError({ code: 'FORBIDDEN', message: `You are not allowed to view run ${input.runId}` });
      const stages = await listStagesForRun(input.runId);
      const packaging = [...stages].reverse().filter((st) => st.stageName === 'gate2').map((st) => readPackaging(st.output)).find((p) => p && p.status === 'ready') ?? null;
      if (!packaging) throw new TRPCError({ code: 'CONFLICT', message: 'The thumbnail options are not ready yet.' });
      const gate1 = [...stages].reverse().find((st) => st.stageName === 'gate1' && st.status === 'completed');
      const scriptText = (gate1?.output as { sanctionedScriptText?: string } | null)?.sanctionedScriptText ?? '';
      const result = checkPackageTitleFor({ title: input.title, packaging, packageId: input.packageId, scriptText, briefText: run.briefText });
      if ('error' in result) throw new TRPCError({ code: 'BAD_REQUEST', message: `That option is not one of this video's options.` });
      return result;
    }),

  // Sprint 6 Task 1 (R8): what was offered, chosen and rejected for this run, read back from what is stored (the Gate 2 packaging
  // of a long video, the opening of a Short). Same tenant scoping as `get`.
  packagingRecord: publicProcedure.input(z.object({ runId: z.string().uuid() })).query(async ({ input, ctx }) => {
    const run = await findPipelineRunById(input.runId);
    if (!run) throw new TRPCError({ code: 'NOT_FOUND', message: `PipelineRun ${input.runId} not found` });
    if (run.tenantId !== ctx.tenantId) throw new TRPCError({ code: 'FORBIDDEN', message: `You are not allowed to view run ${input.runId}` });
    const stages = await listStagesForRun(input.runId);
    const gate = [...stages].reverse().find((st) => st.stageName === 'gate2' && readPackaging(st.output));
    return buildPackagingRecord({
      packaging: gate ? readPackaging(gate.output) : null,
      opening: (run.creationOptions?.opening as Parameters<typeof buildPackagingRecord>[0]['opening']) ?? null,
    });
  }),

  // Sprint 6 Task 3 (Part C, R7): the learning record Compare can group by: pipeline-version tags, the angle step, the script
  // check, shapes from code and per-call usage, read back from what is stored. Same tenant scoping as `packagingRecord`.
  // An old run has no tags and reads as untagged (tags: null), never as off.
  learningRecord: publicProcedure.input(z.object({ runId: z.string().uuid() })).query(async ({ input, ctx }) => {
    const run = await findPipelineRunById(input.runId);
    if (!run) throw new TRPCError({ code: 'NOT_FOUND', message: `PipelineRun ${input.runId} not found` });
    if (run.tenantId !== ctx.tenantId) throw new TRPCError({ code: 'FORBIDDEN', message: `You are not allowed to view run ${input.runId}` });
    const stages = await listStagesForRun(input.runId);
    const latest = (name: string) => stages.filter((st) => st.stageName === name && st.status === 'completed').sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
    const gate = [...stages].reverse().find((st) => st.stageName === 'gate2' && readPackaging(st.output));
    return buildLearningRecord({
      run,
      intakeOutput: latest('intake')?.output,
      scriptReviewOutput: latest('script_review')?.output,
      packaging: buildPackagingRecord({
        packaging: gate ? readPackaging(gate.output) : null,
        opening: (run.creationOptions?.opening as Parameters<typeof buildPackagingRecord>[0]['opening']) ?? null,
      }),
    });
  }),

  // Sprint 6 Task 1 (R5): the founder's pick at Gate 2: a package (optionally with an edited title) or YouTube's
  // suggested thumbnail. Written to the open Gate 2 row BEFORE `gate2` approve, so the choice survives a reload and
  // a restart and publishing reads the same record. An edited title is checked like any title and refused when the
  // script does not support it. Same ownership check as the gate itself.
  choosePackage: publicProcedure
    .input(z.object({ runId: z.string().uuid(), packageId: z.string().min(1).max(40), editedTitle: z.string().max(200).optional() }))
    .mutation(async ({ input, ctx }) => {
      await assertGateOwnership(input.runId, ctx);
      const run = await findPipelineRunById(input.runId);
      if (!run || run.status !== 'paused_gate2') {
        throw new TRPCError({ code: 'CONFLICT', message: 'A thumbnail can only be chosen while the video is waiting at Gate 2.' });
      }
      const stages = await listStagesForRun(input.runId);
      const gate = [...stages].reverse().find((st) => st.stageName === 'gate2' && st.status === 'running');
      const packaging = gate ? readPackaging(gate.output) : null;
      if (!gate || !packaging) {
        throw new TRPCError({ code: 'CONFLICT', message: 'The thumbnail options are not ready yet.' });
      }
      const gate1 = [...stages].reverse().find((st) => st.stageName === 'gate1' && st.status === 'completed');
      const scriptText = (gate1?.output as { sanctionedScriptText?: string } | null)?.sanctionedScriptText ?? '';
      const result = resolveChoice({
        packaging,
        packageId: input.packageId,
        editedTitle: input.editedTitle,
        scriptText,
        briefText: run.briefText,
        userId: ctx.userId,
      });
      if (!result.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: result.message });
      await patchStageOutput(gate.id, { packaging: { ...packaging, choice: result.choice } });
      return { choice: { packageId: result.choice.packageId, title: result.choice.title, titleEdited: result.choice.titleEdited } };
    }),

  // Bugs Task 7 (R3) — a needs_attention run had no way out from the app
  // (three separate tester reports: "no way to resolve it", "how do you
  // cancel", "stuck at a run which does nothing"). retry re-enters the
  // runner at the run's currentStage (the stage that escalated) — each
  // runXStage starts a fresh attempt, and the budget gate/circuit breakers
  // still apply exactly as on a first attempt. Same ownership check as the
  // gates: moving a run forward or killing it is at least as sensitive.
  retry: publicProcedure
    .input(z.object({ runId: z.string().uuid(), maxCostUsd: z.number().positive().optional() }))
    .mutation(async ({ input, ctx }) => {
    const channel = await assertGateOwnership(input.runId, ctx);
    // Same rule as create — the runner would only re-fail it as 'Channel deleted'.
    if (!channel.isActive) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: `Channel ${channel.id} is archived — cancel this run instead` });
    }
    const run = await findPipelineRunById(input.runId);
    if (!run || run.status !== 'needs_attention') {
      throw new TRPCError({
        code: 'CONFLICT',
        message: `Run ${input.runId} can only be retried from Needs attention (it is '${run?.status}')`,
      });
    }
    const plan = await prepareRetry(run, channel, input.maxCostUsd);
    // Only a Retry that really starts a new attempt counts (a refusal threw above).
    if (plan.legacyRecovery) {
      const claimed = await claimPlannerContractRecovery(run, plan.newMaxCostUsd);
      if (!claimed) throw new TRPCError({ code: 'CONFLICT', message: 'Planner recovery was already started or the run changed. Refresh this run.' });
      continuePipelineInBackground(run.id);
      return claimed;
    }
    return commitRetry(run, plan);
  }),

  // Sprint 5 Task 8 (R13): change a waiting run's settings (voice, music, pictures, YouTube visibility, max spend),
  // optionally retrying in the same call. Allowed while the run is in Needs attention or at a gate, with the same
  // owner and tenant rules as retry. The server decides per stage: a change that would invalidate finished work is
  // refused with a one-line reason. Everything is validated first (the same messages as run creation, then the
  // preflight for the options as they would be) and written once, so a refused call changes nothing. Max spend goes
  // through retry's own validation (validateMaxCostUsd). Each saved change is recorded in settingsChanges.
  updateSettings: publicProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        voice: z.enum(TTS_VOICE_KEYS).optional(),
        audioLayer: z.enum(AUDIO_LAYERS).optional(),
        visualSource: z.enum(VISUAL_SOURCES).optional(),
        privacyStatus: PrivacyStatusSchema.optional(),
        maxCostUsd: z.number().positive().optional(),
        retry: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const channel = await assertGateOwnership(input.runId, ctx);
      if (!channel.isActive) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Channel ${channel.id} is archived — cancel this run instead` });
      }
      const run = await findPipelineRunById(input.runId);
      if (!run || !(SETTINGS_ALLOWED_STATUSES as readonly string[]).includes(run.status)) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Settings can only be changed while a run is waiting for you (it is '${run?.status}')`,
        });
      }
      if (input.retry && run.status !== 'needs_attention') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Retry only applies to a run in Needs attention' });
      }
      // The same checks run creation makes, with the same messages.
      if (input.voice !== undefined) {
        try { assertSupportedVoice(input.voice); } catch (e) { badRequest((e as Error).message); }
      }
      if (input.maxCostUsd !== undefined) validateMaxCostUsd(run, input.maxCostUsd);

      const [config, stages, user, receipt] = await Promise.all([
        loadResolvedConfig(run, channel),
        listStagesForRun(run.id),
        // The name on the history line is a nicety: a failed lookup must not stop a settings change (userId is kept).
        ctx.userId ? findUserById(ctx.userId).catch(() => null) : Promise.resolve(null),
        readPublishingReceipt(run.id),
      ]);
      const retryTarget = run.status === 'needs_attention' ? retryTargetStage(run) : null;
      const gate2Choice = stages
        .filter((st) => st.stageName === 'gate2' && st.status === 'completed')
        .sort((a, b) => b.attemptNumber - a.attemptNumber)[0]?.output as { privacyStatus?: PrivacyStatus } | null | undefined;
      let plan;
      try {
        plan = planSettingsChange(input, {
          run,
          retryTarget,
          current: {
            voice: config.audioDefaultVoice,
            audioLayer: config.audioDefaultMoodTag,
            visualSource: config.visualDefaultSource,
            privacyStatus: effectivePrivacy(run.creationOptions, gate2Choice, channel.defaultPrivacyStatus),
            maxCostUsd: run.creationOptions?.maxCostUsd,
          },
          isLong: config.videoKind === 'long',
          gate2Enabled: channel.approvalGateConfig.gate2Enabled !== false,
          alreadyUploaded: Boolean(receipt?.youtubeVideoId),
          by: { userId: ctx.userId ?? null, name: user ? user.name?.trim() || user.email : null },
          now: new Date(),
        });
      } catch (error) {
        if (error instanceof SettingsRejected) badRequest(error.message);
        throw error;
      }
      if (plan.changes.length === 0 && !input.retry) {
        badRequest('Nothing to change: these settings are already in use.');
      }

      const retryPlan = input.retry ? await prepareRetry(run, channel, input.maxCostUsd) : null;
      if (retryPlan?.legacyRecovery) {
        badRequest('This run needs its planner recovery started with Retry on its own; save the settings first, then Retry.');
      }
      // Preflight for the options as they would be, for each stage the change or the retry touches.
      const checks = new Set<PreflightStage>();
      const m = plan.merge;
      if (m.voice !== undefined || m.audioLayer !== undefined || m.visualSource !== undefined || m.maxCostUsd !== undefined) checks.add('video_generation');
      if (m.privacyStatus !== undefined) checks.add('publishing');
      if (retryPlan) {
        checks.add(retryPlan.target === 'publishing' ? 'publishing' : retryPlan.target === 'video_generation' || retryPlan.target === 'video_review' ? 'video_generation' : 'intake');
      }
      const issues = await settingsPreflightIssues(run, [...checks], { ...(run.creationOptions ?? {}), ...plan.merge });
      if (issues.length > 0) badRequest(issues.map((i) => i.message).join(' '));

      // All checks passed: one write.
      const updated = retryPlan
        ? await commitRetry(run, retryPlan, plan.merge)
        : await updatePipelineRun(run.id, { creationOptionsMerge: plan.merge });
      return { run: updated, changes: plan.changes };
    }),

  // Sprint 3 Task 11 (R4/B12) — a dead-end run (rejected/cancelled/failed —
  // any ended run, not status-restricted the way `retry` is) can be re-run:
  // a brand new PipelineRun with the exact same channel/briefText/
  // creationOptions as the source, driven through the exact same
  // create-then-drive path `create`'s own mutation uses. Same ownership
  // check as retry/cancel; the source run's own channel gets the identical
  // `assertChannelCanRun` checks `create` applies to a client-supplied one —
  // reused, not re-implemented, so an archived/disconnected channel is
  // rejected with the exact same messages either mutation would give.
  rerun: publicProcedure.input(z.object({ runId: z.string().uuid() })).mutation(async ({ input, ctx }) => {
    const channel = await assertGateOwnership(input.runId, ctx);
    const sourceRun = await findPipelineRunById(input.runId);
    if (!sourceRun) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `PipelineRun ${input.runId} not found` });
    }
    await assertChannelCanRun(channel);
    // Bugs Task 12 - a new run starts at zero: drop the run-owned bookkeeping, keep the user's picks.
    const picks = sourceRun.creationOptions
      ? (({ manualRetries: _m, plannerContractRecoveryUsed: _p, videoFallbackUsed: _v, opening: _o, resolvedOptions: _r, intakeWarnings: _w, preflightBlock: _pb, settingsChanges: _sc, estimateUsd: _e, retryAllowanceUsd: _ra, ...kept }) => kept)(sourceRun.creationOptions)
      : undefined;
    // Sprint 4 Task 12 (R1): recomputed against the channel's current profile. A long run stores its
    // resolved length, so the length counts as a pick only if the source said it was one.
    const sourceLength = sourceRun.creationOptions?.resolvedOptions?.targetSeconds;
    const lengthWasPicked = sourceLength ? sourceLength.from === 'run' : picks?.videoKind !== 'long';
    const profile = (await findActiveProfileForChannel(channel.id))?.data ?? null;
    const resolvedOptions = buildResolvedOptions({
      picks: { ...picks, targetDurationSec: lengthWasPicked ? picks?.targetDurationSec : undefined },
      profile,
      legacyStyleGuide: channel.styleGuide,
      legacyDefaultVoice: channel.defaultVoice,
    });
    // Bugs (chapter bounds): the same brief check `create` applies, against the length this run will use.
    let intakeWarnings: string[] = [];
    if (picks?.videoKind === 'long') {
      const chapterPlan = checkBriefChapterPlan(sourceRun.briefText, resolvedOptions.targetSeconds.value);
      if (!chapterPlan.ok) badRequest(chapterPlan.message);
      intakeWarnings = chapterPlan.warnings;
    }
    const run = await createRun({
      tenantId: ctx.tenantId,
      channelId: sourceRun.channelId,
      briefText: sourceRun.briefText,
      creationOptions: { ...picks, ...(intakeWarnings.length > 0 && { intakeWarnings }), resolvedOptions },
    });
    startPipelineInBackground(run.id);
    return run;
  }),

  // Cancel = the existing terminal 'failed' status with an explicit reason
  // (no new status value → no schema/enum change). A run paused at a gate is
  // cancelled through that gate's own reject path so the blocked
  // runGate1Stage/runGate2Stage call records it and returns.
  // Sprint 3 Task 11 (R3/B11) — a genuinely 'running' run is now cancellable
  // too, via the cancellation-registry: recorded and returned immediately,
  // not blocked on pipeline-runner.ts's loop actually noticing (it checks
  // once per iteration — see cancellation-registry.ts's own comment on why
  // an in-memory, restart-losable registry is an accepted tradeoff here).
  cancel: publicProcedure.input(z.object({ runId: z.string().uuid() })).mutation(async ({ input, ctx }) => {
    await assertGateOwnership(input.runId, ctx);
    const run = await findPipelineRunById(input.runId);
    if (!run) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `PipelineRun ${input.runId} not found` });
    }
    // Bugs Task 10 (R1) — already ended: idempotent, never an error. Only a run
    // that really ended as a cancel is reported as cancelled, so the app
    // never shows a false "Run cancelled" for a completed/otherwise failed run.
    if (run.status === 'completed' || run.status === 'failed') {
      return { cancelled: deriveEndReason(run) === 'cancelled', immediate: false, alreadyEnded: true };
    }
    // Bugs Task 13: once approved, a run at publishing (the upload) or analytics (the stats snapshot right
    // after it) has a video that is live or about to be; ending it as "Cancelled" would misreport it.
    if (run.status === 'running' && (run.currentStage === 'publishing' || run.currentStage === 'analytics')) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'This run is publishing - the video is already on its way to YouTube, so it can no longer be cancelled.',
      });
    }
    if (run.status === 'paused_gate1' || run.status === 'paused_gate2') {
      if (resolvePendingApproval(run.id, { reply: `reject ${CANCELLED_BY_USER}`, userId: ctx.userId }).resolved) {
        return { cancelled: true, immediate: true, alreadyEnded: false };
      }
      // Gate not registered in this process (e.g. mid-restart) — fall through
      // to the direct write; the stale gate attempt is harmless once failed.
    } else if (run.status === 'running' || run.status === 'pending') {
      requestCancellation(run.id);
      // A loop that is genuinely driving the run reads the registry at its
      // next step. If none is (stalled, died, hung past the stale threshold,
      // server restarted), nobody will — end the run now. The registry entry
      // stays so a stalled loop that wakes later stops at its next check.
      const stages = await listStagesForRun(run.id);
      if (isActivelyDriven(run.id, lastProgressAt(run, stages))) {
        return { cancelled: true, immediate: false, alreadyEnded: false };
      }
    } else if (run.status !== 'needs_attention' && run.status !== 'paused_angle') {
      throw new TRPCError({
        code: 'CONFLICT',
        message: `Run ${input.runId} can't be cancelled while '${run.status}'`,
      });
    }
    await updatePipelineRun(run.id, { status: 'failed', lastError: CANCELLED_BY_USER });
    return { cancelled: true, immediate: true, alreadyEnded: false };
  }),

  // POST /runs/:id/tag-post-hoc — Sprint 3 Task 7 (O4). Replaces the old
  // bot-only `tag <runId> <word> [notes]` text command (Sprint 2 Task 6)
  // with a real in-app equivalent — same ownership check as gate1/gate2
  // (attaching a post-hoc quality tag to a run is at least as sensitive as
  // resolving one of its gates), same underlying write
  // (run-pipeline/post-hoc-tag.ts's recordPostHocTag — a ReviewLog row with
  // agent: 'founder-post-hoc' — reused directly, not re-implemented). `tag`
  // is normalized the exact same way the old text-command parser did
  // (lowercased, truncated to 50 chars) so a tag submitted through the app
  // produces the identical DB row shape the old text-command path produced.
  tagPostHoc: publicProcedure
    .input(z.object({ runId: z.string().uuid(), tag: z.string().min(1), notes: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      await assertGateOwnership(input.runId, ctx);

      const result = await recordPostHocTag({
        runId: input.runId,
        tag: input.tag.toLowerCase().slice(0, 50),
        notes: (input.notes ?? '').trim(),
      });
      if (!result.ok) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: result.error });
      }
      return result.reviewLog;
    }),
});
