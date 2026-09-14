import { z } from 'zod';
import { callLLM, extractJsonText, type LLMResponse } from '../../llm';
import { NonTransientStageError } from '../../run-pipeline/retry-with-backoff';

// Script Review agent — AGENT_FLEET_DESIGN.md Section 4.5. A lightweight
// rubric score + notes over Script Generation's output, including the
// video-generation-fit check (4.5's updated responsibilities) — no
// auto-revision loop, a low score still reaches Gate 1 for the human to
// judge. Cheap/fast model tier (registry.ts's 'script-review' purpose) per
// Section 8.1's classification/scoring row.

export const ScriptReviewOutputSchema = z.object({
  score: z.number().min(0).max(10),
  notes: z.string().min(1),
  videoGenFit: z.object({
    fitsLengthLimit: z.boolean(),
    pacingRealistic: z.boolean(),
    visualsProducible: z.boolean(),
    flags: z.array(z.string()),
  }),
  // Week 5 Task 4 (C3, KNOWN_ISSUES_AND_BLOCKERS.md) — a plausibility check,
  // NOT a verified fact-check: studio/src/llm/client.ts has no tool use/web
  // search wired in anywhere, so the model can only flag claims that seem
  // wrong, outdated, or unverifiable based on its own training, never
  // actually look anything up. Empty array if nothing seems off. This turns
  // an unreviewed gap into at least a flagged one the founder sees at Gate 1
  // alongside the rest of the review — a real, search-grounded fact-check
  // (a distinct purpose once studio/src/llm/ supports tool use) is deferred,
  // not built here.
  factualConcerns: z.array(z.string()),
});
export type ScriptReviewOutput = z.infer<typeof ScriptReviewOutputSchema>;

export type ScriptReviewResult = {
  output: ScriptReviewOutput;
  llm: LLMResponse;
};

const SYSTEM_PROMPT = `You review a short-form vertical video script (YouTube Shorts, 30-60 seconds)
before it goes to production. Respond with ONLY a JSON object of the shape:
{"score": number, "notes": string, "videoGenFit": {"fitsLengthLimit": boolean, "pacingRealistic": boolean, "visualsProducible": boolean, "flags": string[]}, "factualConcerns": string[]}

"score" is 0-10, scoring quality, engagement, clarity, and brand alignment together.
"notes" explains the score — what works, what doesn't, in a few sentences.

"videoGenFit" checks whether the script is actually producible by a simple video-generation
toolchain (TTS voiceover + auto-captions + template/stock visuals — no generative AI video):
- "fitsLengthLimit": would the narration, read aloud at a natural pace, fit a 60-second Short?
- "pacingRealistic": are scene/beat changes implied by the script realistic for that toolchain
  (not too many rapid cuts or complex staged shots)?
- "visualsProducible": are any described visuals things stock footage or simple templates can
  actually represent (not something requiring custom generated video)?
- "flags": specific problems found for any of the above, empty array if none.

"factualConcerns" is a plausibility check, not a verified fact-check — you have no ability to look
anything up. List any specific factual claims in the script that seem incorrect, outdated, or
unverifiable based on what you already know (e.g. a wrong number, an outdated statistic, a claim
about a specific study or event you're not confident is accurate) — an empty array if nothing
stands out. Be specific (quote or closely paraphrase the claim), not vague ("some facts may be
wrong"). Don't flag stylistic simplification or rounding that's normal for short-form content.

A low score or failed fit checks are still a valid review outcome, not an error — always
respond with a complete, well-formed review. Respond with raw JSON only — no markdown code
fences, no commentary.`;

function buildUserMessage(params: {
  scriptText: string;
  captions: string;
  nicheDescription: string;
  styleGuide?: string | null;
}): string {
  const lines = [
    `Script:\n${params.scriptText}`,
    `Captions:\n${params.captions}`,
    `Channel niche: ${params.nicheDescription}`,
  ];
  if (params.styleGuide) {
    lines.push(`Style guide: ${params.styleGuide}`);
  }
  return lines.join('\n\n');
}

export async function reviewScript(params: {
  scriptText: string;
  captions: string;
  nicheDescription: string;
  styleGuide?: string | null;
}): Promise<ScriptReviewResult> {
  const llm = await callLLM({
    purpose: 'script-review',
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserMessage(params) }],
    maxTokens: 1024,
  });

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(extractJsonText(llm.text));
  } catch (error) {
    throw new NonTransientStageError(
      `Script Review did not return valid JSON: ${llm.text.slice(0, 200)}`,
      error,
    );
  }

  const result = ScriptReviewOutputSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new NonTransientStageError(
      `Script Review output failed schema validation: ${result.error.message}`,
    );
  }

  return { output: result.data, llm };
}
