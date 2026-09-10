import { z } from 'zod';
import { callLLM, extractJsonText, type LLMResponse } from '../../llm';
import { NonTransientStageError } from '../../run-pipeline/retry-with-backoff';

// Video Generation's production-planning step — Week 4 Task 1, implementing
// docs/decisions/VIDEO_GENERATION_LOOP_AND_VISUAL_STRATEGY.md Section 2. This
// is the "actual decision to make" the decision doc identifies as missing:
// attempt 1 decides on its own; a regen attempt (attempt 2+) gets the prior
// video_review/Gate 2 fixNotes and must concretely respond to them, instead
// of re-running an identical deterministic pipeline. Kept in its own file
// (not folded into index.ts) since it's a real LLM call with its own prompt
// and schema — index.ts stays the deterministic assembly half.

export const CAPTION_STYLES = ['word-flash', 'phrase-grouped', 'sentence-grouped'] as const;
export type CaptionStyle = (typeof CAPTION_STYLES)[number];

export const ProductionPlanSchema = z.object({
  stockFootageQuery: z.string().min(1),
  captionStyle: z.enum(CAPTION_STYLES),
  pacingNotes: z.string().min(1),
  rationale: z.string().min(1),
});
export type ProductionPlan = z.infer<typeof ProductionPlanSchema>;

// Per the decision doc's Section 5 ("Exact caption style Path A should
// default to — something other than one-word-flash, to stop tripping review
// on presentation artifacts — left for implementation"): the prompt actively
// steers attempt 1 away from word-flash as a *default*, while still allowing
// it as a deliberate choice. word-flash's known failure mode (a
// midpoint-sampled review frame landing mid-word) is named explicitly so a
// regen attempt that got fixNotes about exactly this can connect the dots.
const SYSTEM_PROMPT = `You are the production planner for a short vertical video (a YouTube Short),
deciding concrete choices before the deterministic TTS + stock-footage assembly pipeline runs: what
stock footage to search for, what caption style to burn in, and pacing notes for the assembler.

Caption styles available:
- "word-flash": one word per caption cue. Punchy, but has a known failure mode — a single frame
  sampled from the video (e.g. by an automated visual reviewer) can land mid-word and show only a
  partial word, which reads as broken/low-quality even though the video itself is fine.
- "phrase-grouped": several words per caption cue. More readable, avoids the partial-word problem.
- "sentence-grouped": a full clause/sentence per caption cue. Most readable, least "flashy".

Default to "phrase-grouped" or "sentence-grouped" unless there's a specific reason word-flash suits
this particular script better — word-flash should be a deliberate choice, not the default, given its
known review-failure mode.

If you are given feedback about why a previous attempt failed review, your plan MUST concretely change
whatever the feedback implicates. Do not repeat the same caption style or search terms if they were the
stated cause of the failure.

Respond with ONLY a JSON object:
{"stockFootageQuery": string, "captionStyle": "word-flash" | "phrase-grouped" | "sentence-grouped", "pacingNotes": string, "rationale": string}
"stockFootageQuery" is a short (2-6 word) stock-footage search phrase matching the script's topic/mood.
"pacingNotes" is a brief instruction for the assembler (e.g. caption timing/readability adjustments).
"rationale" briefly explains your choices, and — on a regen attempt — how they address the feedback.
Respond with raw JSON only — no markdown code fences, no commentary.`;

export async function planVideoProduction(params: {
  scriptText: string;
  topic: string;
  fixNotes?: string;
}): Promise<{ plan: ProductionPlan; llm: LLMResponse }> {
  const attemptContext = params.fixNotes
    ? `This is a REGENERATION attempt. The previous attempt failed review for this reason:\n${params.fixNotes}\nYour plan must concretely change whatever caused that failure.`
    : `This is the first attempt for this run — no prior feedback exists yet. Decide independently.`;

  const llm = await callLLM({
    purpose: 'video-production-planning',
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Topic: ${params.topic}\nScript: ${params.scriptText}\n\n${attemptContext}` }],
    maxTokens: 512,
  });

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(extractJsonText(llm.text));
  } catch (error) {
    throw new NonTransientStageError(
      `Video production planning did not return valid JSON: ${llm.text.slice(0, 200)}`,
      error,
    );
  }

  const result = ProductionPlanSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new NonTransientStageError(`Production plan failed schema validation: ${result.error.message}`);
  }

  return { plan: result.data, llm };
}
