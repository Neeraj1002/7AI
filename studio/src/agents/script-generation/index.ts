import { z } from 'zod';
import { callLLM, extractJsonText, type LLMMessage, type LLMResponse } from '../../llm';
import { getStageErrorContext, NonTransientStageError, TransientStageError } from '../../run-pipeline/retry-with-backoff';
import { llmCallsContext, llmUsageContext } from '../../run-pipeline/stage-failure';

// Script Generation agent — AGENT_FLEET_DESIGN.md Section 4.4. The first real
// agent in the critical path: turns Intake's parsed brief into a script.
// Premium model tier (registry.ts's 'script-generation' purpose) — per
// Section 8.1, "the one place quality directly drives views, don't
// cost-optimize this step." No priors/retrieval this week — nothing to
// retrieve yet (MVP status).

export const ScriptGenerationOutputSchema = z.object({
  scriptText: z.string().min(1),
  captions: z.string(),
  hashtags: z.array(z.string()),
});
export type ScriptGenerationOutput = z.infer<typeof ScriptGenerationOutputSchema>;

export type ScriptGenerationResult = {
  output: ScriptGenerationOutput;
  // The call that produced `output` (the retry's, when there was one).
  llm: LLMResponse;
  // Every model call this generation made, in order — the stage books each one.
  calls: LLMResponse[];
};

const SYSTEM_PROMPT = `You write scripts for short-form vertical video (YouTube Shorts, 30-60 seconds).
Given a topic, a list of constraints, and an optional style guide, respond with ONLY a JSON
object of the shape:
{"scriptText": string, "captions": string, "hashtags": string[]}

"scriptText" is the full spoken narration, written to be read aloud — natural sentences, no
scene-direction brackets or stage directions mixed into the narration itself.
"captions" is the on-screen caption text, timed roughly to match the narration (plain text,
not an SRT file — a captioning tool handles timing separately).
"hashtags" is a short list (3-8) of relevant hashtags, without the '#' character.

Respect every listed constraint (length limits, tone, things to avoid, a specific angle).
Respond with raw JSON only — no markdown code fences, no commentary.`;

function buildUserMessage(params: {
  topic: string;
  constraints: string[];
  styleGuide?: string | null;
  targetDurationSec?: 30 | 45 | 60;
  fixNotes?: string;
}): string {
  const lines = [`Topic: ${params.topic}`];
  if (params.constraints.length > 0) {
    lines.push(`Constraints: ${params.constraints.join('; ')}`);
  }
  if (params.styleGuide) {
    lines.push(`Style guide: ${params.styleGuide}`);
  }
  // Sprint 3 Task 9 (R4) — additive: stated alongside the system prompt's
  // existing "30-60 seconds" Shorts-format framing, not a replacement for
  // it. Omitted entirely (not just absent from the message) when unset, so
  // an unset run's behavior is provably identical to before this field
  // existed.
  //
  // A live check found a bare "approximately N seconds" instruction doesn't
  // reliably move the model (three real 45s-targeted runs landed at 55-80s
  // narrated-estimate, no closer to 45 than an unset control) — LLMs follow
  // a concrete word count far more reliably than an abstract duration, so
  // this also states the equivalent word count, at the same ~150 words/
  // minute rate media/stub.ts's own duration estimate already assumes.
  if (params.targetDurationSec) {
    const approxWords = Math.round((params.targetDurationSec / 60) * 150);
    lines.push(
      `Target length: write this script to run approximately ${params.targetDurationSec} seconds when narrated aloud — aim for around ${approxWords} words of narration (natural speaking pace, ~150 words/minute).`,
    );
  }
  // Bugs Task 6 (R1) — mirrors video-generation/plan.ts's own fixNotes
  // injection: a retry that doesn't tell the model what was actually wrong
  // is a blind re-roll, not a targeted fix. Absent on a genuine first
  // attempt (no prior review exists yet).
  if (params.fixNotes) {
    lines.push(
      `A prior attempt scored below the required bar for these reasons: ${params.fixNotes}\nAddress these specific issues directly in this attempt — do not simply regenerate a similar script and hope for a different result.`,
    );
  }
  return lines.join('\n');
}

const REPLY_LOG_EDGE_CHARS = 300;
const REPLY_ERROR_PREVIEW_CHARS = 200;
const FEEDBACK_ERROR_CHARS = 500;
const FEEDBACK_REPLY_CHARS = 8000;

export const SCRIPT_MAX_TOKENS = 2048;
// Bugs Task 11 (R3) — the one retry after a reply cut off at the output cap
// (`stopReason: length`) gets double the room.
export const SCRIPT_RETRY_MAX_TOKENS_ON_LENGTH = 4096;

type ReplyFailure = { what: string; cause: unknown; parseError: string };

// Bugs Task 11 (R1) — run 248fae8a failed with only the first 200 characters
// of the reply kept and the JSON.parse position error (on `cause`) never
// logged, so the break could not be located. The error now carries the
// stopReason (a truncated reply is `length`), the parser's own message
// (which names the position), the reply length, and the full reply for the
// failed stage row (stage-failure.ts caps what is stored); the head and tail
// of the reply also go to the log.
function logReplyFailure(failure: ReplyFailure, llm: LLMResponse, label: string): void {
  console.error(
    `[script-generation] unusable reply (${label}, ${failure.what}): stopReason=${llm.stopReason} replyLength=${llm.text.length} parseError=${failure.parseError}\n` +
      `  head: ${llm.text.slice(0, REPLY_LOG_EDGE_CHARS)}\n  tail: ${llm.text.slice(-REPLY_LOG_EDGE_CHARS)}`,
  );
}

// Bugs Task 11 (R2/R3) — the error lists every model call this generation
// made, so the stage's catch path can book each one (the retry's spend
// included) instead of guessing 'unknown'/0/$0.
function buildReplyError(
  failure: ReplyFailure,
  llm: LLMResponse,
  calls: LLMResponse[],
  firstFailure?: { failure: ReplyFailure; llm: LLMResponse },
): NonTransientStageError {
  const retried = firstFailure ? ` Retried once after: ${firstFailure.failure.parseError}.` : '';
  return new NonTransientStageError(
    `Script Generation ${failure.what}: ${failure.parseError} (stopReason=${llm.stopReason}, replyLength=${llm.text.length}).${retried} Reply starts: ${llm.text.slice(0, REPLY_ERROR_PREVIEW_CHARS)}`,
    failure.cause,
    {
      ...llmUsageContext(llm),
      ...llmCallsContext(calls),
      replyLength: llm.text.length,
      parseError: failure.parseError,
      rawReply: llm.text,
      attempts: calls.length,
      ...(firstFailure
        ? {
            firstParseError: firstFailure.failure.parseError,
            firstStopReason: firstFailure.llm.stopReason,
            firstRawReply: firstFailure.llm.text,
          }
        : {}),
    },
  );
}

// A provider error on the retry call must not lose the first call's spend:
// re-wrap it with the calls already completed.
function withCompletedCalls(error: unknown, calls: LLMResponse[]): unknown {
  if (calls.length === 0) return error;
  const context = { ...(getStageErrorContext(error) ?? {}), ...llmCallsContext(calls) };
  if (error instanceof TransientStageError) return new TransientStageError(error.message, error.cause, context);
  if (error instanceof NonTransientStageError) return new NonTransientStageError(error.message, error.cause, context);
  return error;
}

type ParsedReply = { ok: true; output: ScriptGenerationOutput } | { ok: false; failure: ReplyFailure };

function parseScriptReply(llm: LLMResponse): ParsedReply {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(extractJsonText(llm.text));
  } catch (error) {
    const parseError = error instanceof Error ? error.message : String(error);
    return { ok: false, failure: { what: 'did not return valid JSON', cause: error, parseError } };
  }
  const result = ScriptGenerationOutputSchema.safeParse(parsedJson);
  if (!result.success) {
    return { ok: false, failure: { what: 'output failed schema validation', cause: result.error, parseError: result.error.message } };
  }
  return { ok: true, output: result.data };
}

// Bugs Task 11 (R3) — the retry says what was wrong, instead of re-rolling
// blind (same reasoning as fixNotes above). A reply cut off at the output cap
// is not fed back (it would only spend input tokens on half a script): the
// original request is repeated with a note and a larger cap.
function buildRetryRequest(
  userMessage: string,
  failure: ReplyFailure,
  llm: LLMResponse,
): { messages: LLMMessage[]; maxTokens: number } {
  if (llm.stopReason === 'length') {
    return {
      messages: [
        {
          role: 'user',
          content: `${userMessage}\n\nA previous attempt ran out of output space and was cut off before the JSON object was complete. Keep scriptText and captions tight so the whole JSON object fits.`,
        },
      ],
      maxTokens: SCRIPT_RETRY_MAX_TOKENS_ON_LENGTH,
    };
  }
  const detail = failure.parseError.slice(0, FEEDBACK_ERROR_CHARS);
  const problem =
    failure.what === 'did not return valid JSON'
      ? `could not be parsed as JSON (${detail})`
      : `did not match the required shape (${detail})`;
  return {
    messages: [
      { role: 'user', content: userMessage },
      { role: 'assistant', content: llm.text.slice(0, FEEDBACK_REPLY_CHARS) },
      {
        role: 'user',
        content: `Your previous reply ${problem}. Reply again with ONLY the corrected JSON object. Escape every double quote inside a string value as \\" and write line breaks inside a string as \\n. No code fences, no commentary.`,
      },
    ],
    maxTokens: SCRIPT_MAX_TOKENS,
  };
}

export async function generateScript(params: {
  topic: string;
  constraints: string[];
  styleGuide?: string | null;
  targetDurationSec?: 30 | 45 | 60;
  fixNotes?: string;
}): Promise<ScriptGenerationResult> {
  const calls: LLMResponse[] = [];
  const userMessage = buildUserMessage(params);
  const call = async (messages: LLMMessage[], maxTokens: number): Promise<LLMResponse> => {
    try {
      const llm = await callLLM({ purpose: 'script-generation', system: SYSTEM_PROMPT, messages, maxTokens });
      calls.push(llm);
      return llm;
    } catch (error) {
      throw withCompletedCalls(error, calls);
    }
  };

  const first = await call([{ role: 'user', content: userMessage }], SCRIPT_MAX_TOKENS);
  const firstParsed = parseScriptReply(first);
  if (firstParsed.ok) return { output: firstParsed.output, llm: first, calls };

  // Bugs Task 11 (R3) — one more call inside the same attempt. A second failure
  // is the existing non-transient error, so it never loops.
  logReplyFailure(firstParsed.failure, first, 'first call, retrying once');
  const retryRequest = buildRetryRequest(userMessage, firstParsed.failure, first);
  const second = await call(retryRequest.messages, retryRequest.maxTokens);
  const secondParsed = parseScriptReply(second);
  if (secondParsed.ok) return { output: secondParsed.output, llm: second, calls };

  logReplyFailure(secondParsed.failure, second, 'retry call, giving up');
  throw buildReplyError(secondParsed.failure, second, calls, { failure: firstParsed.failure, llm: first });
}
