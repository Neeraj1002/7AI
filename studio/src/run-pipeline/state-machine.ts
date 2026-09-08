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
import { reviewVideo, MAX_VIDEO_REGEN_ATTEMPTS } from '../agents/video-intelligence';
import { env } from '../config/env';
import { STAGE_NAMES } from '../types';
import type { CreatePipelineRunInput, PipelineRun, StageName } from '../types';

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

  try {
    const output = await withRetryAndCircuitBreaker(() => intakeProcessor(run.briefText));

    // Persist-before-advance: the stage's completion and the run's advance are
    // written together, never inferred from in-memory state alone — this is what
    // makes resumability possible after a restart.
    await completeStage(stage.id, output);
    return await updatePipelineRun(runId, {
      intakeParsed: output,
      // Advances to the next stage in sequence even though no processor exists
      // for it yet this week — a Week 1 test run stops here deliberately.
      currentStage: nextStageAfter('intake'),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failStage(stage.id, message);
    // A bad/unparseable brief, or an exhausted circuit breaker, is a
    // human-fixable input problem — needs_attention, not failed.
    return await updatePipelineRun(runId, { status: 'needs_attention', lastError: message });
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
  const budgetOk = await isBudgetAvailable(run.tenantId, channel.platform);
  if (!budgetOk) {
    await createSkippedStageAttempt({
      pipelineRunId: runId,
      stageName: 'script_generation',
      attemptNumber,
      input: stageInput,
      reason: 'AgentQuota.budgetCeilingUsd would be exceeded',
    });
    return await updatePipelineRun(runId, {
      status: 'needs_attention',
      lastError: 'Script Generation refused: AgentQuota.budgetCeilingUsd would be exceeded',
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

    await completeStage(stage.id, output);
    return await updatePipelineRun(runId, {
      // Advances to script_review even though Task 5 is what actually
      // processes it — same "stops here deliberately" pattern as Week 1.
      currentStage: 'script_review',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failStage(stage.id, message);
    return await updatePipelineRun(runId, { status: 'needs_attention', lastError: message });
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
    // score threshold gates this. Persist-before-advance, same as every
    // other stage.
    await completeStage(stage.id, output);

    const flagsNote =
      output.videoGenFit.flags.length > 0
        ? ` Video-gen-fit flags: ${output.videoGenFit.flags.join('; ')}.`
        : '';
    await insertReviewLog({
      tenantId: run.tenantId,
      channelId: run.channelId,
      pipelineRunId: runId,
      stageId: stage.id,
      agent: 'script-review',
      verdict: String(output.score),
      rationale: `${output.notes}${flagsNote}`,
    });

    return await updatePipelineRun(runId, {
      status: 'paused_gate1',
      currentStage: nextStageAfter('script_review'),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failStage(stage.id, message);
    return await updatePipelineRun(runId, { status: 'needs_attention', lastError: message });
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
  const attemptNumber = previousAttempt ? previousAttempt.attemptNumber + 1 : 1;
  const stage = await createStageAttempt({
    pipelineRunId: runId,
    stageName: 'gate1',
    attemptNumber,
    input: { scriptText: scriptOutput.scriptText, reviewScore: latestReview.verdict },
  });

  // Blocks here until a reply arrives (or, per Task 6's founder-availability
  // note, a simulated one is fed in for testing) — this is the "pause" that
  // PipelineRun.status = 'paused_gate1' represents.
  const outcome = await requestGate1Decision({
    runId,
    channelName: channel.name,
    briefText: run.briefText,
    scriptText: scriptOutput.scriptText,
    reviewScore: latestReview.verdict,
    reviewNotes: latestReview.rationale,
  });

  if (outcome.type === 'reject') {
    await insertReviewLog({
      tenantId: run.tenantId,
      channelId: run.channelId,
      pipelineRunId: runId,
      stageId: stage.id,
      agent: 'human',
      verdict: 'reject',
      rationale: outcome.reason,
    });
    await completeStage(stage.id, { outcome: 'reject', reason: outcome.reason });
    return await updatePipelineRun(runId, {
      status: 'failed',
      lastError: `Rejected at Gate 1: ${outcome.reason}`,
    });
  }

  // On edit, the edited text — not the original AI output — becomes the
  // sanctioned input for whatever reads gate1's stage output next. The
  // original stays in script_generation's own stage row, never overwritten.
  const sanctionedScriptText = outcome.type === 'edit' ? outcome.editedScriptText : scriptOutput.scriptText;

  await insertReviewLog({
    tenantId: run.tenantId,
    channelId: run.channelId,
    pipelineRunId: runId,
    stageId: stage.id,
    agent: 'human',
    verdict: outcome.type,
    rationale: outcome.type === 'edit' ? 'Founder submitted an edited script' : 'Approved as-is',
    editedOutput: outcome.type === 'edit' ? { scriptText: outcome.editedScriptText } : undefined,
  });

  await completeStage(stage.id, { outcome: outcome.type, sanctionedScriptText });

  return await updatePipelineRun(runId, {
    status: 'running',
    currentStage: nextStageAfter('gate1'),
  });
}

// Runs (or re-runs, on resume/regen) the video_generation stage — Week 3 Task
// 2. Same budget-gate + per-attempt-metering pattern as Script Generation
// (Week 2 Task 4), now also gating the pipeline's most expensive stage. See
// docs/execution/week3/BUSINESS_LOGIC.md Section 2.
export async function runVideoGenerationStage(runId: string): Promise<PipelineRun> {
  const run = await findPipelineRunById(runId);
  if (!run) {
    throw new Error(`PipelineRun ${runId} not found`);
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
  // notes (Task 3) or a founder's Gate 2 revision notes (Task 4) — absent on
  // a fresh run, since neither of those exists yet the first time through.
  const reviewLogs = await listReviewLogsForRun(runId);
  const latestVideoReviewFail = [...reviewLogs]
    .reverse()
    .find((log) => (log.agent === 'video-intelligence-own-draft' || log.agent === 'human') && log.verdict === 'fail');
  const fixNotes = latestVideoReviewFail?.rationale;

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
  };

  // Cost gate (BUSINESS_LOGIC.md Section 1) — same soft-ceiling pattern as
  // Script Generation, now also covering the pipeline's most expensive stage.
  const budgetOk = await isBudgetAvailable(run.tenantId, channel.platform);
  if (!budgetOk) {
    await createSkippedStageAttempt({
      pipelineRunId: runId,
      stageName: 'video_generation',
      attemptNumber,
      input: stageInput,
      reason: 'AgentQuota.budgetCeilingUsd would be exceeded',
    });
    return await updatePipelineRun(runId, {
      status: 'needs_attention',
      lastError: 'Video Generation refused: AgentQuota.budgetCeilingUsd would be exceeded',
    });
  }

  const stage = await createStageAttempt({
    pipelineRunId: runId,
    stageName: 'video_generation',
    attemptNumber,
    input: stageInput,
  });

  // Same per-attempt metering pattern as Script Generation/Review — every
  // real attempt, including retries, writes its own (aggregated) UsageEvent
  // row.
  const attemptOnce = async (): Promise<VideoGenerationOutput> => {
    try {
      const { output, usage } = await generateVideo({
        pipelineRunId: runId,
        attemptNumber,
        scriptText: sanctionedScriptText,
        brandAssets: channel.brandAssets,
        fixNotes: fixNotes ?? undefined,
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
    const output = await withRetryAndCircuitBreaker(attemptOnce);

    await completeStage(stage.id, output);
    return await updatePipelineRun(runId, {
      currentStage: 'video_review',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failStage(stage.id, message);
    return await updatePipelineRun(runId, { status: 'needs_attention', lastError: message });
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
  const videoOutput = videoGenStage.output as { videoPath?: string };
  if (!videoOutput.videoPath) {
    throw new Error(`PipelineRun ${runId}'s video_generation output has no videoPath`);
  }

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
  const stageInput = { videoPath: videoOutput.videoPath, topic: run.intakeParsed.topic };
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

    await insertReviewLog({
      tenantId: run.tenantId,
      channelId: run.channelId,
      pipelineRunId: runId,
      stageId: stage.id,
      agent: 'video-intelligence-own-draft',
      verdict: outcome.verdict,
      rationale: outcome.rationale,
    });

    await completeStage(stage.id, { verdict: outcome.verdict, rationale: outcome.rationale });

    if (outcome.verdict === 'pass') {
      return await updatePipelineRun(runId, {
        status: 'paused_gate2',
        currentStage: nextStageAfter('video_review'),
      });
    }

    // Fail — regen if the just-reviewed video_generation attempt hasn't used
    // up the regen budget yet, otherwise the circuit breaker trips.
    if (videoGenStage.attemptNumber <= MAX_VIDEO_REGEN_ATTEMPTS) {
      return await updatePipelineRun(runId, {
        status: 'running',
        currentStage: 'video_generation',
      });
    }

    return await updatePipelineRun(runId, {
      status: 'needs_attention',
      lastError: `Video Intelligence regen cap (${MAX_VIDEO_REGEN_ATTEMPTS}) reached: ${outcome.rationale}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failStage(stage.id, message);
    return await updatePipelineRun(runId, { status: 'needs_attention', lastError: message });
  }
}
