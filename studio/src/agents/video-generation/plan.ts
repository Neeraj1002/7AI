import { z } from 'zod';
import { callLLM, extractJsonText, type LLMResponse } from '../../llm';
import { NonTransientStageError } from '../../run-pipeline/retry-with-backoff';
import { MOOD_TAGS } from '../../audio-bed';

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

// Sprint 2 Task 2 (E2) — a genuinely different content-generation path, not
// a parameter (MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md Section 2):
// 'stock-footage' is today's only option (real Pexels footage);
// 'ai-stills' is AI-generated stills animated Ken-Burns-style
// (studio/src/ai-visuals/). Full generative AI video is deliberately NOT a
// third option here — see KNOWN_ISSUES_AND_BLOCKERS.md §6.
export const VISUAL_SOURCES = ['stock-footage', 'ai-stills'] as const;
export type VisualSource = (typeof VISUAL_SOURCES)[number];

// Sprint 2 Task 3 (F1) — right alongside visualSource, same production-plan
// object, same reasoning: a real content choice, not inferred from prose.
// 'none' is a first-class, fully valid choice (a quiet fact-explainer Short
// may genuinely want no bed) — never treated as an incomplete plan.
export const AUDIO_LAYERS = [...MOOD_TAGS, 'none'] as const;
export type AudioLayer = (typeof AUDIO_LAYERS)[number];

export const ProductionPlanSchema = z
  .object({
    visualSource: z.enum(VISUAL_SOURCES),
    // Used only when visualSource === 'stock-footage' — still always asked
    // for (even on an 'ai-stills' plan) so the LLM's output shape doesn't
    // change based on which branch it picked, simpler than a discriminated
    // union for a field that's simply ignored on the other branch.
    stockFootageQuery: z.string().min(1),
    // Used only when visualSource === 'ai-stills' — one image-generation
    // scene prompt per still, in on-screen order. Required by the
    // refinement below exactly when visualSource is 'ai-stills'.
    stillScenePrompts: z.array(z.string().min(1)).optional(),
    captionStyle: z.enum(CAPTION_STYLES),
    audioLayer: z.enum(AUDIO_LAYERS),
    pacingNotes: z.string().min(1),
    rationale: z.string().min(1),
  })
  .refine(
    (plan) => plan.visualSource !== 'ai-stills' || (plan.stillScenePrompts?.length ?? 0) > 0,
    { message: 'stillScenePrompts must be a non-empty array when visualSource is "ai-stills"', path: ['stillScenePrompts'] },
  );
export type ProductionPlan = z.infer<typeof ProductionPlanSchema>;

// Per the decision doc's Section 5 ("Exact caption style Path A should
// default to — something other than one-word-flash, to stop tripping review
// on presentation artifacts — left for implementation"): the prompt actively
// steers attempt 1 away from word-flash as a *default*, while still allowing
// it as a deliberate choice. word-flash's known failure mode (a
// midpoint-sampled review frame landing mid-word) is named explicitly so a
// regen attempt that got fixNotes about exactly this can connect the dots.
function buildSystemPrompt(visualSourceOverride?: VisualSource, audioLayerOverride?: AudioLayer): string {
  const visualSourceInstruction =
    visualSourceOverride === undefined
      ? `"visualSource" — the founder/user did NOT request a specific visual style for this run. Default to
"stock-footage" — it's the proven path. Only choose "ai-stills" yourself if there's a specific, strong
reason stock footage genuinely can't work for this topic; this should be rare, not a coin flip.`
      : `"visualSource" is FIXED to "${visualSourceOverride}" for this run — the founder/user explicitly
chose this. You MUST set "visualSource" to exactly "${visualSourceOverride}" in your output; this is not
your decision to make on this run.`;

  const audioLayerInstruction =
    audioLayerOverride === undefined
      ? `"audioLayer" — the founder/user did NOT request a specific mood bed for this run. Pick whichever
mood tag genuinely fits the script's tone, or "none" if a quiet, narration-only Short genuinely suits this
topic better (e.g. a dense fact-explainer where a bed would compete with information density) — "none" is
a fully valid, equally-good choice, not a fallback for indecision.`
      : `"audioLayer" is FIXED to "${audioLayerOverride}" for this run — the founder/user explicitly chose
this. You MUST set "audioLayer" to exactly "${audioLayerOverride}" in your output; this is not your
decision to make on this run.`;

  return `You are the production planner for a short vertical video (a YouTube Short),
deciding concrete choices before the deterministic assembly pipeline runs: which visual source to
use, what stock footage to search for (or what still-image scenes to generate), what caption style
to burn in, whether a music/sound bed plays under the narration, and pacing notes for the assembler.

Visual sources available:
- "stock-footage": real, licensed Pexels stock footage searched by a text query. Today's proven,
  default path.
- "ai-stills": a handful of AI-generated still images, each animated with a slow Ken Burns-style
  zoom/pan, shown in sequence. A real content-generation path, not a fallback — used deliberately,
  not because stock footage search came up empty.

${visualSourceInstruction}

Audio-bed mood tags available: ${MOOD_TAGS.join(', ')}, or "none" for no bed at all.

${audioLayerInstruction}

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
{"visualSource": "stock-footage" | "ai-stills", "stockFootageQuery": string, "stillScenePrompts": string[], "captionStyle": "word-flash" | "phrase-grouped" | "sentence-grouped", "audioLayer": string, "pacingNotes": string, "rationale": string}
"stockFootageQuery" is a short (2-6 word) stock-footage search phrase matching the script's topic/mood —
always include this, even when visualSource is "ai-stills" (it's simply unused in that case).
"stillScenePrompts" is a list of 3-6 image-generation prompts, one per still, in the order they should
appear on screen, each describing one concrete visual scene matching a portion of the script — REQUIRED
(non-empty) when visualSource is "ai-stills"; omit or leave empty when visualSource is "stock-footage".
"audioLayer" is exactly one of the mood tags listed above, or "none".
"pacingNotes" is a brief instruction for the assembler (e.g. caption timing/readability adjustments).
"rationale" briefly explains your choices, and — on a regen attempt — how they address the feedback.
Respond with raw JSON only — no markdown code fences, no commentary.`;
}

export async function planVideoProduction(params: {
  scriptText: string;
  topic: string;
  fixNotes?: string;
  // Sprint 2 Task 2 (E2) — an explicit per-run choice (resolved by the
  // caller from PipelineRun.creationOptions.visualSource) that the LLM is
  // instructed to honor. Enforced again, deterministically, after the LLM
  // responds (see below) — this drives a real YouTube disclosure-policy
  // flag downstream (E4), so it can't be left to prompt-following alone.
  visualSourceOverride?: VisualSource;
  // Sprint 2 Task 3 (F1) — same resolution-order pattern: an explicit
  // per-run choice always wins, else the planning LLM decides.
  audioLayerOverride?: AudioLayer;
}): Promise<{ plan: ProductionPlan; llm: LLMResponse }> {
  const attemptContext = params.fixNotes
    ? `This is a REGENERATION attempt. The previous attempt failed review for this reason:\n${params.fixNotes}\nYour plan must concretely change whatever caused that failure.`
    : `This is the first attempt for this run — no prior feedback exists yet. Decide independently.`;

  const llm = await callLLM({
    purpose: 'video-production-planning',
    system: buildSystemPrompt(params.visualSourceOverride, params.audioLayerOverride),
    messages: [{ role: 'user', content: `Topic: ${params.topic}\nScript: ${params.scriptText}\n\n${attemptContext}` }],
    maxTokens: 768,
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

  let plan = result.data;

  // Deterministic enforcement of an explicit visualSource override — the
  // prompt above asks the LLM to honor it, but visualSource drives a real
  // YouTube disclosure-policy flag downstream (E4), so correctness can't
  // rest on prompt-following alone. If the LLM ignored the instruction,
  // force it back to the requested value rather than silently trusting the
  // model.
  if (params.visualSourceOverride && plan.visualSource !== params.visualSourceOverride) {
    if (params.visualSourceOverride === 'ai-stills' && (plan.stillScenePrompts?.length ?? 0) === 0) {
      // Can't safely force 'ai-stills' without scene prompts to generate
      // from — a genuine planning failure, not something to paper over with
      // fabricated prompts this function has no real basis for.
      throw new NonTransientStageError(
        `Video production planning ignored the requested visualSource override ('ai-stills') and provided no stillScenePrompts to recover with`,
      );
    }
    plan = { ...plan, visualSource: params.visualSourceOverride };
  }

  // Same deterministic enforcement for audioLayer (Sprint 2 Task 3, F1) — a
  // lighter case than visualSource (no compliance flag rides on it, and
  // every value including 'none' is always immediately usable with no
  // extra data needed), but still enforced rather than left to
  // prompt-following, for the same "an explicit choice always wins"
  // guarantee the rest of this resolution order promises.
  if (params.audioLayerOverride && plan.audioLayer !== params.audioLayerOverride) {
    plan = { ...plan, audioLayer: params.audioLayerOverride };
  }

  return { plan, llm };
}
