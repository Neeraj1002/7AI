import { z } from 'zod';
import { callLLM, extractJsonText, type LLMResponse } from '../../llm';
import { NonTransientStageError } from '../../run-pipeline/retry-with-backoff';

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
Respond with raw JSON only — no markdown code fences, no commentary.`;

// Sprint 4 Task 2 (R4): the fact policy is stated in the system prompt.
// 'brief-plus-common' (the platform default) keeps today's wording, where the
// model may draw on general knowledge; 'brief-only' makes the brief's own
// facts authoritative.
const BRIEF_ONLY_RULE = `

Facts and figures stated in the brief are authoritative: keep every one of them, with the numbers
exactly as given, and do not introduce claims beyond common, verifiably-safe general knowledge.`;

export type FactPolicy = 'brief-only' | 'brief-plus-common';

export function buildSystemPrompt(factPolicy: FactPolicy = 'brief-plus-common'): string {
  return factPolicy === 'brief-only' ? SYSTEM_PROMPT + BRIEF_ONLY_RULE : SYSTEM_PROMPT;
}

export type GenerateScriptParams = {
  topic: string;
  constraints: string[];
  styleGuide?: string | null;
  // The resolved target narration length (Sprint 4 Task 2 R6): run override,
  // else profile, else the platform default of 45.
  targetSeconds?: number;
  fixNotes?: string;
  // Sprint 4 Task 2 (R4/R7).
  briefText?: string;
  factPolicy?: FactPolicy;
  bannedOpeners?: string[];
  bannedEndings?: string[];
  // Sprint 4 Task 6: the chosen format's structural hint.
  scriptStructure?: string | null;
};

export function buildUserMessage(params: GenerateScriptParams): string {
  const lines = [`Topic: ${params.topic}`];
  // R4: the raw brief as explicit extra context alongside topic/constraints,
  // not a replacement for them, so facts in it survive into the script.
  if (params.briefText) {
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
  if (params.targetSeconds) {
    const approxWords = Math.round((params.targetSeconds / 60) * 150);
    lines.push(
      `Target length: write this script to run approximately ${params.targetSeconds} seconds when narrated aloud (never more than 60) — aim for around ${approxWords} words of narration (natural speaking pace, ~150 words/minute).`,
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

export async function generateScript(params: GenerateScriptParams): Promise<ScriptGenerationResult> {
  const llm = await callLLM({
    purpose: 'script-generation',
    system: buildSystemPrompt(params.factPolicy),
    messages: [{ role: 'user', content: buildUserMessage(params) }],
    maxTokens: 2048,
  });

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(extractJsonText(llm.text));
  } catch (error) {
    throw new NonTransientStageError(
      `Script Generation did not return valid JSON: ${llm.text.slice(0, 200)}`,
      error,
    );
  }

  const result = ScriptGenerationOutputSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new NonTransientStageError(
      `Script Generation output failed schema validation: ${result.error.message}`,
    );
  }

  return { output: result.data, llm };
}
