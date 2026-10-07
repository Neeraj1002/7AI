import { z } from 'zod';
import { callLLM, extractJsonText, type LLMResponse } from '../../llm';
import { NonTransientStageError } from '../../run-pipeline/retry-with-backoff';
import { llmUsageContext } from '../../run-pipeline/stage-failure';

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
  llm: LLMResponse;
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

// Bugs Task 11 (R1) — run 248fae8a failed with only the first 200 characters
// of the reply kept and the JSON.parse position error (on `cause`) never
// logged, so the break could not be located. The error now carries the
// stopReason (a truncated reply is `length`), the parser's own message
// (which names the position), the reply length, and the full reply for the
// failed stage row (stage-failure.ts caps what is stored); the head and tail
// of the reply also go to the log.
function buildReplyError(what: string, llm: LLMResponse, cause: unknown): NonTransientStageError {
  const parseError = cause instanceof Error ? cause.message : String(cause);
  const replyLength = llm.text.length;
  console.error(
    `[script-generation] unusable reply (${what}): stopReason=${llm.stopReason} replyLength=${replyLength} parseError=${parseError}
` +
      `  head: ${llm.text.slice(0, REPLY_LOG_EDGE_CHARS)}
  tail: ${llm.text.slice(-REPLY_LOG_EDGE_CHARS)}`,
  );
  return new NonTransientStageError(
    `Script Generation ${what}: ${parseError} (stopReason=${llm.stopReason}, replyLength=${replyLength}). Reply starts: ${llm.text.slice(0, REPLY_ERROR_PREVIEW_CHARS)}`,
    cause,
    {
      ...llmUsageContext(llm),
      replyLength,
      parseError,
      rawReply: llm.text,
    },
  );
}

export async function generateScript(params: {
  topic: string;
  constraints: string[];
  styleGuide?: string | null;
  targetDurationSec?: 30 | 45 | 60;
  fixNotes?: string;
}): Promise<ScriptGenerationResult> {
  const llm = await callLLM({
    purpose: 'script-generation',
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserMessage(params) }],
    maxTokens: 2048,
  });

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(extractJsonText(llm.text));
  } catch (error) {
    throw buildReplyError('did not return valid JSON', llm, error);
  }

  const result = ScriptGenerationOutputSchema.safeParse(parsedJson);
  if (!result.success) {
    throw buildReplyError('output failed schema validation', llm, result.error);
  }

  return { output: result.data, llm };
}
