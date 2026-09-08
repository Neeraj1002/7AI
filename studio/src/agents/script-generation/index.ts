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
}): string {
  const lines = [`Topic: ${params.topic}`];
  if (params.constraints.length > 0) {
    lines.push(`Constraints: ${params.constraints.join('; ')}`);
  }
  if (params.styleGuide) {
    lines.push(`Style guide: ${params.styleGuide}`);
  }
  return lines.join('\n');
}

export async function generateScript(params: {
  topic: string;
  constraints: string[];
  styleGuide?: string | null;
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
