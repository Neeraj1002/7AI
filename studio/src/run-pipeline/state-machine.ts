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
  recordStageProgress,
} from '../models/repositories/pipeline-stage.repository';
import { findChannelById } from '../models/repositories/channel.repository';
import { insertUsageEvent } from '../models/repositories/usage-event.repository';
import { insertReviewLog, listReviewLogsForRun } from '../models/repositories/review-log.repository';
import { parseBrief, stubParseBrief } from './parse-brief';
import { withRetryAndCircuitBreaker, getStageErrorContext } from './retry-with-backoff';
import { isBudgetAvailable } from './budget-gate';
import { generateScript, ScriptGenerationOutputSchema, type ScriptGenerationOutput } from '../agents/script-generation';
import { reviewScript, type ScriptReviewOutput } from '../agents/script-review';
import { requestGate1Decision } from '../agents/gate1';
import { generateVideo, type VideoGenerationOutput } from '../agents/video-generation';
import { planVideoProduction, AUDIO_LAYERS, type AudioLayer, type ProductionPlan, type VisualSource } from '../agents/video-generation/plan';
import { reviewVideo, MAX_VIDEO_REGEN_ATTEMPTS } from '../agents/video-intelligence';
import { requestGate2Decision } from '../agents/gate2';
import {
  generatePublishingMetadata,
  uploadVideo,
  extractCoverFrame,
  setThumbnail,
  DEFAULT_PRIVACY_STATUS,
  type PublishingMetadata,
  type UploadResult,
  type PrivacyStatus,
} from '../agents/publishing';
import { recordSnapshot } from '../agents/performance-analytics';
import { resolveVoice } from '../media';
import { env } from '../config/env';
import { STAGE_NAMES } from '../types';
import type { CreatePipelineRunInput, IntakeParsed, PipelineRun, StageName } from '../types';

// PipelineRun/PipelineStage state machine — BUSINESS_LOGIC.md Section 1.
// Week 1 only wires up the `intake` stage; every other stage name exists in the
// enum so the state machine doesn't need a schema change when the next agent
// comes online.

export async function createRun(input: CreatePipelineRunInput): Promise<PipelineRun> {
  return createPipelineRun(input);
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
async function failStageAndEscalate(stageId: string, runId: string, error: unknown): Promise<PipelineRun> {
  const message = error instanceof Error ? error.message : String(error);
  return prisma.$transaction(async (tx) => {
    await failStage(stageId, message, tx);
    return await updatePipelineRun(runId, { status: 'needs_attention', lastError: message }, tx);
  });
}

// Runs (or re-runs, on resume) the intake stage for a run. Safe to call again on
// the same run: it always reads `run.briefText` fresh and starts a new stage
// attempt, so a crash-and-retry never assumes partial work happened
// (BUSINESS_LOGIC.md's "idempotent resume" rule).
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
      const context = getStageErrorContext(error);
      await insertUsageEvent({
        tenantId: run.tenantId,
        channelId: run.channelId,
        pipelineRunId: runId,
        stageId: stage.id,
        agent: 'intake',
        provider: (context?.provider as string | undefined) ?? 'unknown',
        model: (context?.model as string | undefined) ?? 'unknown',
        inputTokens: 0,
        outputTokens: 0,
        costUsd: '0.000000',
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
    return await prisma.$transaction(async (tx) => {
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
  const stageInput = {
    topic: run.intakeParsed.topic,
    constraints: run.intakeParsed.constraints,
    styleGuide: channel.styleGuide,
  };

  // Cost gate (BUSINESS_LOGIC.md Section 2) — checked before a real stage
  // attempt exists at all. A refused call is recorded as `skipped`, never
  // silently dropped and never a `failed` attempt (nothing actually ran).
  const budgetOk = await isBudgetAvailable(run.tenantId, channel.id, channel.platform);
  if (!budgetOk) {
    await createSkippedStageAttempt({
      pipelineRunId: runId,
      stageName: 'script_generation',
      attemptNumber,
      input: stageInput,
      reason: 'the pooled budget ceiling or this channel\'s own effective ceiling would be exceeded',
    });
    return await updatePipelineRun(runId, {
      status: 'needs_attention',
      lastError: 'Script Generation refused: the pooled budget ceiling or this channel\'s own effective ceiling would be exceeded',
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
    try {
      const { output, llm } = await generateScript({
        topic: stageInput.topic,
        constraints: stageInput.constraints,
        styleGuide: stageInput.styleGuide,
      });
      await insertUsageEvent({
        tenantId: run.tenantId,
        channelId: run.channelId,
        pipelineRunId: runId,
        stageId: stage.id,
        agent: 'script-generation',
        provider: llm.provider,
        model: llm.model,
        inputTokens: llm.usage.inputTokens,
        outputTokens: llm.usage.outputTokens,
        costUsd: llm.costUsd,
      });
      return output;
    } catch (error) {
      const context = getStageErrorContext(error);
      await insertUsageEvent({
        tenantId: run.tenantId,
        channelId: run.channelId,
        pipelineRunId: runId,
        stageId: stage.id,
        agent: 'script-generation',
        provider: (context?.provider as string | undefined) ?? 'unknown',
        model: (context?.model as string | undefined) ?? 'unknown',
        inputTokens: 0,
        outputTokens: 0,
        costUsd: '0.000000',
      });
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

// Runs (or re-runs, on resume) the script_review stage — Week 2 Task 5.
// Deliberately lightweight: a rubric score + notes, no auto-revision loop —
// a low score is a review outcome, not a stage failure, so only a genuine
// technical failure (LLM error, malformed output) routes to needs_attention.
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
  const scriptOutput: ScriptGenerationOutput = ScriptGenerationOutputSchema.parse(scriptGenStage.output);

  await updatePipelineRun(runId, {
    status: 'running',
    currentStage: 'script_review',
  });

  const previousAttempt = await findLatestAttempt(runId, 'script_review');
  const attemptNumber = previousAttempt ? previousAttempt.attemptNumber + 1 : 1;
  const stageInput = {
    scriptText: scriptOutput.scriptText,
    captions: scriptOutput.captions,
    nicheDescription: channel.nicheDescription,
    styleGuide: channel.styleGuide,
  };

  const stage = await createStageAttempt({
    pipelineRunId: runId,
    stageName: 'script_review',
    attemptNumber,
    input: stageInput,
  });

  // Same per-attempt metering pattern as Script Generation — every real LLM
  // call, including retries, writes its own UsageEvent row.
  const attemptOnce = async (): Promise<ScriptReviewOutput> => {
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
      return output;
    } catch (error) {
      const context = getStageErrorContext(error);
      await insertUsageEvent({
        tenantId: run.tenantId,
        channelId: run.channelId,
        pipelineRunId: runId,
        stageId: stage.id,
        agent: 'script-review',
        provider: (context?.provider as string | undefined) ?? 'unknown',
        model: (context?.model as string | undefined) ?? 'unknown',
        inputTokens: 0,
        outputTokens: 0,
        costUsd: '0.000000',
      });
      throw error;
    }
  };

  try {
    const output = await withRetryAndCircuitBreaker(attemptOnce);

    // The stage always completes once a well-formed review comes back — no
    // score threshold gates this. Stage completion, the ReviewLog entry, and
    // the run's advance to paused_gate1 all commit as one transaction (B1
    // fix) — a crash between them used to risk a completed stage with no
    // ReviewLog row, which gate1 depends on to find the review score/notes.
    return await prisma.$transaction(async (tx) => {
      await completeStage(stage.id, output, tx);

      const flagsNote =
        output.videoGenFit.flags.length > 0
          ? ` Video-gen-fit flags: ${output.videoGenFit.flags.join('; ')}.`
          : '';
      // C3 (Week 5 Task 4): surfaced in the same ReviewLog rationale gate1
      // reads from, so a plausibility concern actually reaches the founder
      // at Gate 1, not just the raw stage output.
      const factualConcernsNote =
        output.factualConcerns.length > 0
          ? ` Factual concerns (plausibility check, not verified): ${output.factualConcerns.join('; ')}.`
          : '';
      // G3 (Sprint 2 Task 4): same reasoning — the hook score/notes reach
      // the founder at Gate 1 in the same rationale text, not just the raw
      // stage output only a direct DB query would surface.
      const hookNote = ` Hook (first 1-2s) score: ${output.hookScore}/10 — ${output.hookNotes}`;
      await insertReviewLog(
        {
          tenantId: run.tenantId,
          channelId: run.channelId,
          pipelineRunId: runId,
          stageId: stage.id,
          agent: 'script-review',
          verdict: String(output.score),
          rationale: `${output.notes}${flagsNote}${factualConcernsNote}${hookNote}`,
        },
        tx,
      );

      return await updatePipelineRun(
        runId,
        {
          status: 'paused_gate1',
          currentStage: nextStageAfter('script_review'),
        },
        tx,
      );
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

  const scriptGenStage = await findLatestAttempt(runId, 'script_generation');
  if (!scriptGenStage || scriptGenStage.status !== 'completed' || !scriptGenStage.output) {
    throw new Error(`PipelineRun ${runId} has no completed script_generation output — cannot open Gate 1`);
  }
  const scriptOutput: ScriptGenerationOutput = ScriptGenerationOutputSchema.parse(scriptGenStage.output);

  const reviewLogs = await listReviewLogsForRun(runId);
  const latestReview = [...reviewLogs].reverse().find((log) => log.agent === 'script-review');
  if (!latestReview) {
    throw new Error(`PipelineRun ${runId} has no script-review ReviewLog — cannot open Gate 1`);
  }

  const previousAttempt = await findLatestAttempt(runId, 'gate1');

  // Restart-safety (Week 5 Task 3, KNOWN_ISSUES_AND_BLOCKERS.md): a
  // 'running' gate1 attempt already exists when this run was paused_gate1
  // and the process restarted (resume-on-startup.ts re-invokes this
  // function). Reuse that same attempt — re-sending the Telegram prompt and
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

  // Blocks here until a reply arrives (or, per Task 6's founder-availability
  // note, a simulated one is fed in for testing) — this is the "pause" that
  // PipelineRun.status = 'paused_gate1' represents.
  const outcome = await requestGate1Decision({
    runId,
    channel,
    channelName: channel.name,
    briefText: run.briefText,
    scriptText: scriptOutput.scriptText,
    reviewScore: latestReview.verdict,
    reviewNotes: latestReview.rationale,
    restarted: isRestartReopen,
  });

  if (outcome.type === 'reject') {
    return await prisma.$transaction(async (tx) => {
      await insertReviewLog(
        {
          tenantId: run.tenantId,
          channelId: run.channelId,
          pipelineRunId: runId,
          stageId: stage.id,
          agent: 'human',
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
  const sanctionedScriptText = outcome.type === 'edit' ? outcome.editedScriptText : scriptOutput.scriptText;

  return await prisma.$transaction(async (tx) => {
    await insertReviewLog(
      {
        tenantId: run.tenantId,
        channelId: run.channelId,
        pipelineRunId: runId,
        stageId: stage.id,
        agent: 'human',
        verdict: outcome.type,
        rationale: outcome.type === 'edit' ? 'Founder submitted an edited script' : 'Approved as-is',
        editedOutput: outcome.type === 'edit' ? { scriptText: outcome.editedScriptText } : undefined,
      },
      tx,
    );

    await completeStage(stage.id, { outcome: outcome.type, sanctionedScriptText }, tx);

    return await updatePipelineRun(
      runId,
      {
        status: 'running',
        currentStage: nextStageAfter('gate1'),
      },
      tx,
    );
  });
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
  const resolvedVoice = resolveVoice({
    overrideVoice: run.creationOptions?.voice,
    channelDefaultVoice: channel.defaultVoice,
  });

  await updatePipelineRun(runId, {
    status: 'running',
    currentStage: 'video_generation',
  });

  const previousAttempt = await findLatestAttempt(runId, 'video_generation');
  const attemptNumber = previousAttempt ? previousAttempt.attemptNumber + 1 : 1;
  const stageInput = {
    scriptText: sanctionedScriptText,
    brandAssets: channel.brandAssets,
    fixNotes: fixNotes ?? null,
    resolvedVoice,
  };

  // Cost gate (BUSINESS_LOGIC.md Section 1) — same soft-ceiling pattern as
  // Script Generation, now also covering the pipeline's most expensive stage.
  const budgetOk = await isBudgetAvailable(run.tenantId, channel.id, channel.platform);
  if (!budgetOk) {
    await createSkippedStageAttempt({
      pipelineRunId: runId,
      stageName: 'video_generation',
      attemptNumber,
      input: stageInput,
      reason: 'the pooled budget ceiling or this channel\'s own effective ceiling would be exceeded',
    });
    return await updatePipelineRun(runId, {
      status: 'needs_attention',
      lastError: 'Video Generation refused: the pooled budget ceiling or this channel\'s own effective ceiling would be exceeded',
    });
  }

  const stage = await createStageAttempt({
    pipelineRunId: runId,
    stageName: 'video_generation',
    attemptNumber,
    input: stageInput,
  });

  // Production-planning call (Week 4 Task 1) — metered as its own agent
  // ('video-production-planning'), distinct from the aggregated
  // TTS+transcription+footage row below, since it's a separate purpose that
  // may not even run (forcedPlan test override).
  const attemptPlanOnce = async (): Promise<ProductionPlan> => {
    if (testOverrides?.forcedPlan) {
      return testOverrides.forcedPlan;
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
        visualSourceOverride:
          run.creationOptions?.visualSource === 'stock-footage' || run.creationOptions?.visualSource === 'ai-stills'
            ? run.creationOptions.visualSource
            : undefined,
        // Sprint 2 Task 3 (F1) — same narrowing posture as visualSource
        // above: creationOptions.audioLayer is a plain string (validated at
        // the API edge before it gets here), narrowed against the real
        // AUDIO_LAYERS list rather than cast, so an unrecognized value is
        // "no override," not trusted blindly.
        audioLayerOverride: resolveAudioLayerOverride(run.creationOptions?.audioLayer),
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
      const context = getStageErrorContext(error);
      await insertUsageEvent({
        tenantId: run.tenantId,
        channelId: run.channelId,
        pipelineRunId: runId,
        stageId: stage.id,
        agent: 'video-production-planning',
        provider: (context?.provider as string | undefined) ?? 'unknown',
        model: (context?.model as string | undefined) ?? 'unknown',
        inputTokens: 0,
        outputTokens: 0,
        costUsd: '0.000000',
      });
      throw error;
    }
  };

  // Same per-attempt metering pattern as Script Generation/Review — every
  // real attempt, including retries, writes its own (aggregated) UsageEvent
  // row.
  const attemptVideoOnce = async (plan: ProductionPlan): Promise<VideoGenerationOutput> => {
    try {
      const { output, usage } = await generateVideo({
        pipelineRunId: runId,
        attemptNumber,
        scriptText: sanctionedScriptText,
        brandAssets: channel.brandAssets,
        plan,
        voice: resolvedVoice,
      });
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
      return output;
    } catch (error) {
      const context = getStageErrorContext(error);
      await insertUsageEvent({
        tenantId: run.tenantId,
        channelId: run.channelId,
        pipelineRunId: runId,
        stageId: stage.id,
        agent: 'video-generation',
        provider: (context?.provider as string | undefined) ?? 'unknown',
        model: (context?.model as string | undefined) ?? 'unknown',
        costUsd: '0.000000',
      });
      throw error;
    }
  };

  try {
    const plan = await withRetryAndCircuitBreaker(attemptPlanOnce);
    const output = await withRetryAndCircuitBreaker(() => attemptVideoOnce(plan));

    return await prisma.$transaction(async (tx) => {
      await completeStage(stage.id, { ...output, plan }, tx);
      return await updatePipelineRun(runId, { currentStage: 'video_review' }, tx);
    });
  } catch (error) {
    return await failStageAndEscalate(stage.id, runId, error);
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

  try {
    const outcome = await reviewVideo({
      videoPath: videoOutput.videoPath,
      topic: run.intakeParsed.topic,
      scriptText: sanctionedScriptText,
      visualSource,
    });

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

    // Regen-cap decision computed once, up front, so every branch inside the
    // transaction below applies the exact same patch it would have applied
    // outside one — the transaction only changes atomicity, not the logic.
    const runPatch: Parameters<typeof updatePipelineRun>[1] =
      outcome.verdict === 'pass'
        ? { status: 'paused_gate2', currentStage: nextStageAfter('video_review') }
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

      await completeStage(stage.id, { verdict: outcome.verdict, rationale: outcome.rationale }, tx);

      return await updatePipelineRun(runId, runPatch, tx);
    });
  } catch (error) {
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
  const reviewOutput = videoReviewStage.output as { verdict?: string; rationale?: string };
  if (!reviewOutput.verdict || !reviewOutput.rationale) {
    throw new Error(`PipelineRun ${runId}'s video_review output is missing verdict/rationale`);
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

  // Blocks here until a reply arrives (or, per Task 6/Week 2's
  // founder-availability convention, a simulated one for testing).
  const outcome = await requestGate2Decision({
    runId,
    channel,
    channelName: channel.name,
    videoPath,
    verdict: reviewOutput.verdict,
    rationale: reviewOutput.rationale,
    restarted: isRestartReopen,
  });

  if (outcome.type === 'reject') {
    return await prisma.$transaction(async (tx) => {
      await insertReviewLog(
        {
          tenantId: run.tenantId,
          channelId: run.channelId,
          pipelineRunId: runId,
          stageId: stage.id,
          agent: 'human',
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

  // Revise — a founder-requested regen respects the same attempt cap as
  // Task 3's automatic regen loop; it doesn't bypass it.
  const revisePatch: Parameters<typeof updatePipelineRun>[1] =
    videoGenStage.attemptNumber <= MAX_VIDEO_REGEN_ATTEMPTS
      ? { status: 'running', currentStage: 'video_generation' }
      : {
          status: 'needs_attention',
          lastError: `Gate 2 regen cap (${MAX_VIDEO_REGEN_ATTEMPTS}) reached: ${outcome.notes}`,
        };

  return await prisma.$transaction(async (tx) => {
    await insertReviewLog(
      {
        tenantId: run.tenantId,
        channelId: run.channelId,
        pipelineRunId: runId,
        stageId: stage.id,
        agent: 'human',
        verdict: 'revise',
        rationale: outcome.notes,
      },
      tx,
    );
    await completeStage(stage.id, { outcome: 'revise', notes: outcome.notes }, tx);
    return await updatePipelineRun(runId, revisePatch, tx);
  });
}

// Runs (or re-runs, on resume) the publishing stage — Week 4 Task 2. By the
// time this runs, PipelineRun.status is already `running`/currentStage =
// `publishing` (Gate 2's approve outcome sets it). Two sub-steps: metadata
// generation (its own UsageEvent row, agent='metadata-generation', safe to
// redo on any resume) and the YouTube upload itself — the pipeline's first
// stage with a real, non-repeatable external side effect. See
// docs/execution/week4/BUSINESS_LOGIC.md Sections 1-2.
export async function runPublishingStage(runId: string): Promise<PipelineRun> {
  const run = await findPipelineRunById(runId);
  if (!run) {
    throw new Error(`PipelineRun ${runId} not found`);
  }

  const channel = await findChannelById(run.channelId);
  if (!channel) {
    throw new Error(`Channel ${run.channelId} not found`);
  }

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
  const durationSeconds = videoGenOutput.durationSeconds;
  // Sprint 2 Task 2 (E4) — the real YouTube disclosure-policy flag, derived
  // directly from the plan actually used to render this video, never a
  // separately-set flag that could disagree with it. Falls back to `false`
  // for a pre-Sprint-2 stage row (every such video really was stock
  // footage, since 'ai-stills' didn't exist yet).
  const containsSyntheticMedia = videoGenOutput.plan?.visualSource === 'ai-stills';

  const gate1Stage = await findLatestAttempt(runId, 'gate1');
  const sanctionedScriptText = (gate1Stage?.output as { sanctionedScriptText?: string } | undefined)
    ?.sanctionedScriptText;
  if (!sanctionedScriptText) {
    throw new Error(`PipelineRun ${runId} has no sanctioned script text from gate1`);
  }

  const scriptGenStage = await findLatestAttempt(runId, 'script_generation');
  if (!scriptGenStage || scriptGenStage.status !== 'completed' || !scriptGenStage.output) {
    throw new Error(`PipelineRun ${runId} has no completed script_generation output — cannot run publishing`);
  }
  const hashtags = (scriptGenStage.output as { hashtags?: string[] }).hashtags ?? [];

  await updatePipelineRun(runId, {
    status: 'running',
    currentStage: 'publishing',
  });

  // Resume-safety: if a prior invocation of this exact attempt already
  // checkpointed a successful upload (recordStageProgress, below) before the
  // process stopped, reuse it rather than uploading a second time — unlike
  // every earlier stage, redoing this one has a real, user-visible duplicate
  // side effect (a second YouTube upload), not just wasted spend.
  const existingAttempt = await findLatestAttempt(runId, 'publishing');
  const existingOutput = existingAttempt?.output as { youtubeVideoId?: string } | null;
  if (existingAttempt && existingAttempt.status === 'running' && existingOutput?.youtubeVideoId) {
    console.log(
      `[publishing] run ${runId}: attempt ${existingAttempt.attemptNumber} already recorded a successful upload before the process stopped — completing the stage without uploading again`,
    );
    return await prisma.$transaction(async (tx) => {
      await completeStage(existingAttempt.id, existingAttempt.output as Record<string, unknown>, tx);
      return await updatePipelineRun(runId, { currentStage: 'analytics' }, tx);
    });
  }

  const attemptNumber = existingAttempt ? existingAttempt.attemptNumber + 1 : 1;
  const stageInput = { videoPath, scriptText: sanctionedScriptText, hashtags };
  const stage = await createStageAttempt({
    pipelineRunId: runId,
    stageName: 'publishing',
    attemptNumber,
    input: stageInput,
  });

  const attemptMetadataOnce = async (): Promise<PublishingMetadata> => {
    try {
      const { metadata, llm } = await generatePublishingMetadata({ scriptText: sanctionedScriptText, hashtags });
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
      const context = getStageErrorContext(error);
      await insertUsageEvent({
        tenantId: run.tenantId,
        channelId: run.channelId,
        pipelineRunId: runId,
        stageId: stage.id,
        agent: 'metadata-generation',
        provider: (context?.provider as string | undefined) ?? 'unknown',
        model: (context?.model as string | undefined) ?? 'unknown',
        inputTokens: 0,
        outputTokens: 0,
        costUsd: '0.000000',
      });
      throw error;
    }
  };

  try {
    const metadata = await withRetryAndCircuitBreaker(attemptMetadataOnce);

    const attemptUploadOnce = async (): Promise<UploadResult> =>
      uploadVideo({ videoPath, metadata, privacyStatus, containsSyntheticMedia });
    const uploadResult = await withRetryAndCircuitBreaker(attemptUploadOnce);

    // Sprint 2 Task 5 (H1) — best-effort, isolated follow-up: the video is
    // already live by this point, so a failure here (bad frame extraction, a
    // real thumbnails.set error) must never fail the publishing stage or
    // imply the upload itself failed. Same isolation posture Sprint 2 Task
    // 4's G2 established for retention-curve capture. Requires a real
    // durationSeconds from video_generation's output — falls back to
    // `coverFrameSet: false` for a pre-Sprint-2-Task-5 stage row (or if it's
    // ever missing) rather than crashing the whole stage over metadata.
    let coverFrameSet = false;
    if (typeof durationSeconds === 'number') {
      try {
        const framePath = await extractCoverFrame({
          videoPath,
          durationSeconds,
          coverFrameTimestampRatio: metadata.coverFrameTimestampRatio,
        });
        await setThumbnail({ youtubeVideoId: uploadResult.youtubeVideoId, imagePath: framePath });
        coverFrameSet = true;
      } catch (error) {
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

    // Durable checkpoint — see recordStageProgress's own comment. Written
    // before completeStage so a crash in the gap between "upload succeeded"
    // and "stage marked complete" is recoverable without re-uploading.
    const fullOutput = {
      youtubeVideoId: uploadResult.youtubeVideoId,
      privacyStatus: uploadResult.privacyStatus,
      containsSyntheticMedia: uploadResult.containsSyntheticMedia,
      coverFrameSet,
      metadata,
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

    return await prisma.$transaction(async (tx) => {
      await completeStage(stage.id, fullOutput, tx);
      return await updatePipelineRun(runId, { currentStage: 'analytics' }, tx);
    });
  } catch (error) {
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
