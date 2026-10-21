import { z } from 'zod';
import { callLLM, describeJsonError, extractJsonObjectText, LLMCutOffError, type LLMMessage, type LLMResponse } from '../../llm';
import { getStageErrorContext, NonTransientStageError, TransientStageError } from '../../run-pipeline/retry-with-backoff';
import { llmCallsContext, llmUsageContext } from '../../run-pipeline/stage-failure';
import { EvidenceRefSchema, renderEvidenceBlock, validateEvidenceArguments, type EvidencePacket } from '../../content-evidence/packet';
import {
  LongScriptReplySchema,
  ScriptChapterSchema,
  buildLengthRepairMessage,
  buildLongSystemPrompt,
  buildLongTargetLine,
  buildStructureRepairMessage,
  countWords,
  isLengthInRange,
  lengthError,
  LONG_LENGTH_HARD_TOLERANCE,
  LONG_MAX_LENGTH_REPAIRS,
  joinChapterTexts,
  validateChapters,
  type ScriptChapter,
} from './long-form';
import { chapterBoundsForBrief } from '../../long-form/brief-chapter-plan';
import type { ChapterBounds } from '../../long-form/chapter-bounds';

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
// Sprint 4 Task 9 (R2): a long-form script also carries its chapters; `scriptText` stays the
// concatenation of their texts. The model-facing schema above is untouched (a Short's
// structured-output request must stay exactly as it is); this wider schema is what a STORED
// script_generation output is parsed with, so chapters survive the round trip.
export type { ScriptChapter };
export const ScriptGenerationStoredSchema = ScriptGenerationOutputSchema.extend({
  chapters: z.array(ScriptChapterSchema).optional(),
  // True when the word count stayed outside +-20% of the target after the one repair attempt.
  lengthOutOfRange: z.boolean().optional(),
  evidenceRef: EvidenceRefSchema.optional(),
});
export type ScriptGenerationOutput = z.infer<typeof ScriptGenerationStoredSchema>;

export type ScriptGenerationResult = {
  output: ScriptGenerationOutput;
  // The call that produced `output` (the retry's, when there was one).
  llm: LLMResponse;
  // Every model call this generation made, in order — the stage books each one.
  calls: LLMResponse[];
};

const SYSTEM_PROMPT = `You write scripts for short-form vertical video (YouTube Shorts).
Given a topic, a list of constraints, and an optional style guide, respond with ONLY a JSON
object of the shape:
{"scriptText": string, "captions": string, "hashtags": string[]}

"scriptText" is the full spoken narration, written to be read aloud — natural sentences, no
scene-direction brackets or stage directions mixed into the narration itself.
"captions" is the on-screen caption text, timed roughly to match the narration (plain text,
not an SRT file — a captioning tool handles timing separately).
"hashtags" is a short list (3-8) of relevant hashtags, without the '#' character.

The target length is given in the user message; the narration must never exceed 60 seconds.
Respect every listed constraint (length limits, tone, things to avoid, a specific angle).
Never use the straight double-quote character (") inside "scriptText", "captions" or a hashtag, other than as
the JSON string delimiters. To quote a word or phrase, write it with curly quotes (“ ”) instead, or with
single quotes. Apostrophes in words like "weren't" are fine.

Respond with raw JSON only — no markdown code fences, no commentary.`;

// Sprint 4 Task 2 (R4): the fact policy is stated in the system prompt.
// 'brief-plus-common' (the platform default) keeps today's wording, where the
// model may draw on general knowledge; 'brief-only' makes the brief's own
// facts authoritative.
const BRIEF_ONLY_RULE = `

Facts and figures stated in the brief are authoritative: keep every one of them, with the numbers
exactly as given, and do not introduce claims beyond common, verifiably-safe general knowledge.`;

export type FactPolicy = 'brief-only' | 'brief-plus-common';
const PACKET_BRIEF_ONLY_RULE = `\n\nFor the supplied evidence packet, add no factual detail beyond its permitted text. A citation-only URL has not been fetched and supplies no factual text.`;

export function buildSystemPrompt(factPolicy: FactPolicy = 'brief-plus-common', packetMode = false): string {
  if (packetMode) return SYSTEM_PROMPT + (factPolicy === 'brief-only' ? PACKET_BRIEF_ONLY_RULE : '\n\nUse the evidence packet policy. Citation-only URLs supply no factual text and do not verify general knowledge.');
  return factPolicy === 'brief-only' ? SYSTEM_PROMPT + BRIEF_ONLY_RULE : SYSTEM_PROMPT;
}

export type GenerateScriptParams = {
  topic: string;
  constraints: string[];
  styleGuide?: string | null;
  // The resolved target narration length (Sprint 4 Task 2 R6): run override,
  // else profile, else the platform default of 45.
  targetSeconds?: number;
  // Pre-Sprint-4 name for the same value (a per-run 30/45/60 option); kept as an alias so
  // existing callers and tests keep working. targetSeconds wins when both are given.
  targetDurationSec?: number;
  fixNotes?: string;
  // Sprint 4 Task 2 (R4/R7).
  briefText?: string;
  factPolicy?: FactPolicy;
  bannedOpeners?: string[];
  bannedEndings?: string[];
  // Sprint 4 Task 6: the chosen format's structural hint.
  scriptStructure?: string | null;
  // Sprint 4 Task 9 (R2): 'long' selects the chaptered long-form prompt and reply. Absent = a Short.
  videoKind?: 'short' | 'long';
  // The founder's explicit source URLs/citations (long-form only: with the brief, the only facts allowed).
  sources?: string[];
  evidence?: EvidencePacket;
  // Sprint 5 Task 8 (R7): the narrating voice's measured pace; the word count is planned from it. Long-form only.
  wordsPerMinute?: number;
};

export function buildUserMessage(params: GenerateScriptParams): string {
  const packet = params.evidence && validateEvidenceArguments(params.evidence, params);
  if (params.videoKind === 'long' && packet && packet.factPolicy !== 'brief-only') {
    throw new NonTransientStageError('Long-form evidence must use the effective brief-only policy');
  }
  const lines = [`Topic: ${params.topic}`];
  const isLong = params.videoKind === 'long';
  // R4: the raw brief as explicit extra context alongside topic/constraints,
  // not a replacement for them, so facts in it survive into the script.
  if (packet) {
    lines.push(renderEvidenceBlock(packet));
  } else if (params.briefText) {
    lines.push(`Original brief (authoritative source for any facts or figures it states):\n${params.briefText}`);
  }
  if (params.constraints.length > 0) {
    lines.push(`Constraints: ${params.constraints.join('; ')}`);
  }
  if (params.styleGuide) {
    lines.push(`Style guide: ${params.styleGuide}`);
  }
  // R7: only when non-empty, so a channel without these lists is unchanged.
  if (params.bannedOpeners && params.bannedOpeners.length > 0) {
    lines.push(`Do not open with any of: ${params.bannedOpeners.join('; ')}`);
  }
  if (params.bannedEndings && params.bannedEndings.length > 0) {
    lines.push(`Do not end with any of: ${params.bannedEndings.join('; ')}`);
  }
  if (params.scriptStructure) {
    lines.push(`Format structure: ${params.scriptStructure}`);
  }
  // Sprint 3 Task 9 (R4), now fed by the resolved target (Sprint 4 Task 2 R6).
  //
  // A live check found a bare "approximately N seconds" instruction doesn't
  // reliably move the model (three real 45s-targeted runs landed at 55-80s
  // narrated-estimate, no closer to 45 than an unset control) — LLMs follow
  // a concrete word count far more reliably than an abstract duration, so
  // this also states the equivalent word count, at the same ~150 words/
  // minute rate media/stub.ts's own duration estimate already assumes.
  const targetSeconds = params.targetSeconds ?? params.targetDurationSec;
  if (!packet && isLong && params.sources && params.sources.length > 0) {
    lines.push(`Sources (with the brief, the only material you may take facts from):\n${params.sources.map((s) => `- ${s}`).join('\n')}`);
  }
  if (isLong && targetSeconds) {
    lines.push(buildLongTargetLine(targetSeconds, params.wordsPerMinute));
  } else if (targetSeconds) {
    const approxWords = Math.round((targetSeconds / 60) * 150);
    lines.push(
      `Target length: write this script to run approximately ${targetSeconds} seconds when narrated aloud (never more than 60) — aim for around ${approxWords} words of narration (natural speaking pace, ~150 words/minute).`,
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
const FEEDBACK_ERROR_CHARS = 500;
const FEEDBACK_REPLY_CHARS = 8000;

// `retryMessage` is a ready-made retry instruction for a problem the generic wording cannot name
// (the long-form chapter count: what came back and what is allowed).
type ReplyFailure = { what: string; cause: unknown; parseError: string; retryMessage?: string };

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

// Bugs Task 11 (R2/R5) — the error lists every model call this generation
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
    `Script Generation ${failure.what}: ${failure.parseError} (stopReason=${llm.stopReason}, replyLength=${llm.text.length}).${retried}`,
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
  const errorContext = getStageErrorContext(error) ?? {};
  // Calls the failing callLLM already completed (a cut-off first attempt) come after the ones made earlier here.
  const ownCalls = Array.isArray(errorContext.calls) ? errorContext.calls : [];
  const context = { ...errorContext, calls: [...(llmCallsContext(calls).calls as unknown[]), ...ownCalls] };
  if (error instanceof TransientStageError) return new TransientStageError(error.message, error.cause, context);
  if (error instanceof NonTransientStageError) return new NonTransientStageError(error.message, error.cause, context);
  return error;
}

// A 400 or 422 from a call that sent an outputSchema is the provider refusing the
// structured-output request (invalid request / unprocessable schema). Any other
// status (401, 429, 5xx, ...) is a different problem and must not fall back.
export const STRUCTURED_OUTPUT_FALLBACK_STATUSES: readonly number[] = [400, 422];

type ParsedReply ={ ok: true; output: ScriptGenerationOutput } | { ok: false; failure: ReplyFailure };

function parseScriptReply(llm: LLMResponse): ParsedReply {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(extractJsonObjectText(llm.text));
  } catch (error) {
    const parseError = describeJsonError(error);
    return { ok: false, failure: { what: 'did not return valid JSON', cause: error, parseError } };
  }
  const result = ScriptGenerationOutputSchema.safeParse(parsedJson);
  if (!result.success) {
    return { ok: false, failure: { what: 'output failed schema validation', cause: result.error, parseError: result.error.message } };
  }
  return { ok: true, output: result.data };
}

// Bugs Task 11 (R5) — the fallback retry says what was wrong, instead of
// re-rolling blind (same reasoning as fixNotes above).
function buildRetryRequest(
  userMessage: string,
  failure: ReplyFailure,
  llm: LLMResponse,
): { messages: LLMMessage[] } {
  if (failure.retryMessage) {
    return {
      messages: [
        { role: 'user', content: userMessage },
        { role: 'assistant', content: llm.text.slice(0, FEEDBACK_REPLY_CHARS) },
        { role: 'user', content: failure.retryMessage },
      ],
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
  };
}

// Bugs Task 11 (R3) — schema-constrained output is the primary path: the
// provider's decoder then escapes quotes and newlines, which is what broke
// run 248fae8a (straight quotes copied from the brief into scriptText). If
// the provider rejects the structured-output request itself (a 4xx on the
// request, which bills nothing and which no offline test can rule out), fall
// back once to the plain-text path (R5: repair, then one retry) and say so
// in the log. Shared by the Short and the long-form generators.
function createCaller(system: string, outputSchema: z.ZodType, calls: LLMResponse[]) {
  let structured = true;
  const call = async (messages: LLMMessage[]): Promise<LLMResponse> => {
    try {
      const llm = await callLLM({
        purpose: 'script-generation',
        system,
        messages,
        ...(structured ? { outputSchema } : {}),
      });
      calls.push(llm);
      return llm;
    } catch (error) {
      const status = getStageErrorContext(error)?.statusCode;
      if (structured && calls.length === 0 && typeof status === 'number' && STRUCTURED_OUTPUT_FALLBACK_STATUSES.includes(status)) {
        console.error(
          `[script-generation] provider returned ${status} for the structured-output request, falling back to plain text: ${error instanceof Error ? error.message : String(error)}`,
        );
        structured = false;
        return call(messages);
      }
      // A reply cut off twice is still two billed calls, and a swallowed length repair must not lose them.
      const failed = withCompletedCalls(error, calls);
      if (error instanceof LLMCutOffError) calls.push(error.response);
      throw failed;
    }
  };
  return call;
}

type ParsedLongReply = { ok: true; output: ScriptGenerationOutput } | { ok: false; failure: ReplyFailure };

function parseLongScriptReply(llm: LLMResponse, bounds: ChapterBounds): ParsedLongReply {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(extractJsonObjectText(llm.text));
  } catch (error) {
    return { ok: false, failure: { what: 'did not return valid JSON', cause: error, parseError: describeJsonError(error) } };
  }
  const result = LongScriptReplySchema.safeParse(parsedJson);
  if (!result.success) {
    return { ok: false, failure: { what: 'output failed schema validation', cause: result.error, parseError: result.error.message } };
  }
  const structureProblem = validateChapters(result.data.chapters, bounds, 'The reply');
  if (structureProblem) {
    const toTheModel = validateChapters(result.data.chapters, bounds, 'Your previous reply') ?? structureProblem;
    return {
      ok: false,
      failure: {
        what: 'output failed schema validation',
        cause: new Error(structureProblem),
        parseError: structureProblem,
        retryMessage: buildStructureRepairMessage(toTheModel, bounds),
      },
    };
  }
  const chapters: ScriptChapter[] = result.data.chapters.map((c) => ({ title: c.title.trim(), text: c.text.trim() }));
  // scriptText is the concatenation of the chapter texts; the SRT is built from the script
  // itself later, so the model is not asked for caption text.
  return { ok: true, output: { scriptText: joinChapterTexts(chapters), captions: '', hashtags: result.data.hashtags, chapters } };
}

// Sprint 4 Task 9 (R2): the long-form generator. Same safety net as a Short (structured output,
// one repair retry for an unusable reply), plus up to two length repairs: a script outside +-10% of
// the target words is sent back; if it is still outside +-20% after that, the run continues and the
// output says so (`lengthOutOfRange`) for the reviewer. Length alone never fails a run.
async function generateLongScript(params: GenerateScriptParams): Promise<ScriptGenerationResult> {
  const calls: LLMResponse[] = [];
  const targetSeconds = params.targetSeconds ?? params.targetDurationSec ?? 600;
  const userMessage = buildUserMessage(params);
  // A brief that lists its chapter titles sets the chapter count; otherwise the format's default applies.
  const bounds = chapterBoundsForBrief(params.briefText, targetSeconds);
  const call = createCaller(buildLongSystemPrompt(Boolean(params.evidence), bounds), LongScriptReplySchema, calls);

  const first = await call([{ role: 'user', content: userMessage }]);
  let current: { llm: LLMResponse; output: ScriptGenerationOutput };
  const firstParsed = parseLongScriptReply(first, bounds);
  if (firstParsed.ok) {
    current = { llm: first, output: firstParsed.output };
  } else {
    logReplyFailure(firstParsed.failure, first, 'long first call, retrying once');
    const retryRequest = buildRetryRequest(userMessage, firstParsed.failure, first);
    const second = await call(retryRequest.messages);
    const secondParsed = parseLongScriptReply(second, bounds);
    if (!secondParsed.ok) {
      logReplyFailure(secondParsed.failure, second, 'long retry call, giving up');
      throw buildReplyError(secondParsed.failure, second, calls, { failure: firstParsed.failure, llm: first });
    }
    current = { llm: second, output: secondParsed.output };
  }

  let words = countWords(current.output.scriptText);
  // Up to two length repairs until the script is within +-10% of the target. A repair is kept only
  // when it is valid AND closer to the target than what we have, so a repair never makes things worse.
  const pace = params.wordsPerMinute;
  for (let repairs = 0; repairs < LONG_MAX_LENGTH_REPAIRS && !isLengthInRange(words, targetSeconds, undefined, pace); repairs += 1) {
    console.warn(`[script-generation] long script is ${words} words, outside +-10% of the target for ${targetSeconds}s; length repair ${repairs + 1}/${LONG_MAX_LENGTH_REPAIRS}`);
    const repairMessages: LLMMessage[] = [
      { role: 'user', content: userMessage },
      { role: 'assistant', content: current.llm.text.slice(0, FEEDBACK_REPLY_CHARS * 3) },
      { role: 'user', content: buildLengthRepairMessage(words, targetSeconds, pace) },
    ];
    try {
      const repair = await call(repairMessages);
      const repaired = parseLongScriptReply(repair, bounds);
      if (repaired.ok) {
        const repairedWords = countWords(repaired.output.scriptText);
        if (lengthError(repairedWords, targetSeconds, pace) < lengthError(words, targetSeconds, pace)) {
          current = { llm: repair, output: repaired.output };
          words = repairedWords;
        }
      }
    } catch (error) {
      // The script we have is usable and already paid for; a failed repair must not lose it.
      console.error(`[script-generation] length repair call failed, keeping the current script: ${error instanceof Error ? error.message : String(error)}`);
      break;
    }
  }
  // Only a script that is still outside +-20% is flagged for the reviewer; it still continues.
  const lengthOutOfRange = !isLengthInRange(words, targetSeconds, LONG_LENGTH_HARD_TOLERANCE, pace);
  return { output: { ...current.output, ...(lengthOutOfRange && { lengthOutOfRange: true }) }, llm: current.llm, calls };
}

export async function generateScript(params: GenerateScriptParams): Promise<ScriptGenerationResult> {
  if (params.evidence) validateEvidenceArguments(params.evidence, params);
  if (params.videoKind === 'long') return generateLongScript(params);
  const calls: LLMResponse[] = [];
  const userMessage = buildUserMessage(params);
  const call = createCaller(buildSystemPrompt(params.evidence?.factPolicy ?? params.factPolicy, Boolean(params.evidence)), ScriptGenerationOutputSchema, calls);

  const first = await call([{ role: 'user', content: userMessage }]);
  const firstParsed = parseScriptReply(first);
  if (firstParsed.ok) return { output: firstParsed.output, llm: first, calls };

  // Bugs Task 11 (R5) — one more call inside the same attempt. A second failure
  // is the existing non-transient error, so it never loops.
  logReplyFailure(firstParsed.failure, first, 'first call, retrying once');
  const retryRequest = buildRetryRequest(userMessage, firstParsed.failure, first);
  const second = await call(retryRequest.messages);
  const secondParsed = parseScriptReply(second);
  if (secondParsed.ok) return { output: secondParsed.output, llm: second, calls };

  logReplyFailure(secondParsed.failure, second, 'retry call, giving up');
  throw buildReplyError(secondParsed.failure, second, calls, { failure: firstParsed.failure, llm: first });
}
