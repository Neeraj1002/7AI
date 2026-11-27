import type { ResolvedDirection } from '../../channel-profile/resolve';
import { z } from 'zod';
import { callLLM, describeJsonError, extractJsonText, type LLMResponse, type RetryGuard } from '../../llm';
import { NonTransientStageError } from '../../run-pipeline/retry-with-backoff';
import { llmUsageContext } from '../../run-pipeline/stage-failure';
import { MOOD_TAGS } from '../../audio-bed';
import { QUALITY_SPEC } from './quality-spec';
import { buildShortPlannerSystemPrompt as buildSystemPrompt } from '../../prompts/system-prompts';
export { buildShortPlannerSystemPrompt as buildSystemPrompt } from '../../prompts/system-prompts';

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

export const SCENE_PURPOSES = ['context', 'illustration', 'explanation', 'emphasis', 'transition', 'reconstruction', 'unspecified'] as const;
export type ScenePurpose = (typeof SCENE_PURPOSES)[number];
export const SceneMeaningSchema = z.object({
  sceneId: z.string().regex(/^(0|[1-9]\d*):(0|[1-9]\d*)$/),
  narrationSpan: z.object({ chapterIndex: z.number().int().min(0), startWord: z.number().int().min(0), endWordExclusive: z.number().int().min(0) }),
  purpose: z.enum(SCENE_PURPOSES),
});
export type SceneMeaning = z.infer<typeof SceneMeaningSchema>;

export const ProductionPlanSchema = z
  .object({
    visualSource: z.enum(VISUAL_SOURCES),
    // Used only when visualSource === 'stock-footage' — still always asked
    // for (even on an 'ai-stills' plan) so the LLM's output shape doesn't
    // change based on which branch it picked, simpler than a discriminated
    // union for a field that's simply ignored on the other branch.
    stockFootageQuery: z.string().min(1),
    // Sprint 4 Task 8 (R5) — a shot list: one query per story beat (3-8), so the
    // stock path shows several distinct clips instead of one looped clip.
    // Optional so old stage outputs and the regen path stay valid; when absent,
    // the single stockFootageQuery above is the fallback.
    stockFootageQueries: z
      .array(z.string().min(1))
      .min(QUALITY_SPEC.stock.minBeats)
      .max(QUALITY_SPEC.stock.maxBeats)
      .optional(),
    // Used only when visualSource === 'ai-stills' — one image-generation
    // scene prompt per still, in on-screen order. Required by the
    // refinement below exactly when visualSource is 'ai-stills'.
    stillScenePrompts: z.array(z.string().min(1)).optional(),
    // Sprint 4 Task 9 (R5.3): long-form only. One entry per still: the chapter it belongs to (0-based),
    // the opening words of the narration it illustrates (so image timing follows the voice), and its
    // prompt. stillScenePrompts holds the same prompts, flattened, so readers of the old field still work.
    longScenes: z
      .array(z.object({ chapterIndex: z.number().int().min(0), words: z.string().min(1), prompt: z.string().min(1) }))
      .optional(),
    // Optional for valid legacy plans; the application owns IDs/spans and only the model may
    // choose a purpose from the small enum. Never use this array to allocate scene slots.
    sceneMeanings: z.object({ version: z.literal(1), scenes: z.array(SceneMeaningSchema) }).optional(),
    captionStyle: z.enum(CAPTION_STYLES),
    audioLayer: z.enum(AUDIO_LAYERS),
    pacingNotes: z.string().min(1),
    rationale: z.string().min(1),
  })
  .refine(
    (plan) => plan.visualSource !== 'ai-stills' || (plan.stillScenePrompts?.length ?? 0) > 0,
    { message: 'stillScenePrompts must be a non-empty array when visualSource is "ai-stills"', path: ['stillScenePrompts'] },
  )
  .superRefine((plan, ctx) => {
    if (!plan.sceneMeanings) return;
    const scenes = plan.longScenes ?? [];
    if (plan.sceneMeanings.scenes.length !== scenes.length || plan.stillScenePrompts?.length !== scenes.length) {
      ctx.addIssue({ code: 'custom', path: ['sceneMeanings'], message: 'Scene meaning, long scene and flattened prompt counts must agree' });
      return;
    }
    const slots = new Map<number, number>();
    let previousChapter = -1;
    let previousEnd = 0;
    scenes.forEach((scene, i) => {
      const meaning = plan.sceneMeanings!.scenes[i];
      const slot = slots.get(scene.chapterIndex) ?? 0;
      if (scene.chapterIndex < previousChapter
        || meaning.sceneId !== `${scene.chapterIndex}:${slot}`
        || meaning.narrationSpan.chapterIndex !== scene.chapterIndex
        || meaning.narrationSpan.endWordExclusive < meaning.narrationSpan.startWord
        || (scene.chapterIndex === previousChapter && meaning.narrationSpan.startWord !== previousEnd)
        || (scene.chapterIndex !== previousChapter && meaning.narrationSpan.startWord !== 0)
        || plan.stillScenePrompts![i] !== scene.prompt) {
        ctx.addIssue({ code: 'custom', path: ['sceneMeanings', 'scenes', i], message: 'Scene ID, ordered span and prompt must match the existing scene slot' });
      }
      slots.set(scene.chapterIndex, slot + 1);
      previousChapter = scene.chapterIndex;
      previousEnd = meaning.narrationSpan.endWordExclusive;
    });
  });
export type ProductionPlan = z.infer<typeof ProductionPlanSchema>;

// Sprint 4 Task 8 (R6) — platform-default still count, estimated from the
// sanctioned script's word count (TTS hasn't run yet at planning time):
// ~2.7 words/s narration, one still per ~2.5s, clamped to 6-20. Replaces the
// old fixed "3-6" (one still every ~5-6s, slow for Shorts). A channel profile's
// own secondsPerStill (Sprint 4 Task 3, R10) overrides this default.
export function estimateStillCount(scriptText: string): number {
  const words = scriptText.split(/\s+/).filter((w) => w.length > 0).length;
  const seconds = words / QUALITY_SPEC.pacing.wordsPerSecond;
  const raw = Math.ceil(seconds / QUALITY_SPEC.pacing.secondsPerStill);
  return Math.min(QUALITY_SPEC.pacing.maxStills, Math.max(QUALITY_SPEC.pacing.minStills, raw));
}

// Sprint 4 Task 3 (R10): a profile's secondsPerStill overrides the Task 8 default.
// Computed from the resolved target length (TTS has not run yet at planning
// time); bounded 3-20 whatever the profile asks for. undefined when unset, so
// the planner keeps estimateStillCount's default.
export const PROFILE_STILL_COUNT_MIN = 3;
export const PROFILE_STILL_COUNT_MAX = 20;
export function computeDesiredStillCount(
  targetSeconds: number,
  secondsPerStill: number | null | undefined,
): number | undefined {
  if (!secondsPerStill || secondsPerStill <= 0) return undefined;
  return Math.min(
    PROFILE_STILL_COUNT_MAX,
    Math.max(PROFILE_STILL_COUNT_MIN, Math.ceil(targetSeconds / secondsPerStill)),
  );
}

// The shot list is best-effort planning data, not worth failing the whole stage
// over: too long is truncated to the cap; too short (or empty/not an array) is
// dropped so the single stockFootageQuery fallback is used instead.
export function normalizeShotList(parsed: unknown): unknown {
  if (typeof parsed !== 'object' || parsed === null || !('stockFootageQueries' in parsed)) return parsed;
  const { stockFootageQueries, ...rest } = parsed as Record<string, unknown>;
  const list = Array.isArray(stockFootageQueries)
    ? stockFootageQueries.filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
    : [];
  return list.length >= QUALITY_SPEC.stock.minBeats
    ? { ...rest, stockFootageQueries: list.slice(0, QUALITY_SPEC.stock.maxBeats) }
    : rest;
}

// Per the decision doc's Section 5 ("Exact caption style Path A should
// default to — something other than one-word-flash, to stop tripping review
// on presentation artifacts — left for implementation"): the prompt actively
// steers attempt 1 away from word-flash as a *default*, while still allowing
// it as a deliberate choice. word-flash's known failure mode (a
// midpoint-sampled review frame landing mid-word) is named explicitly so a
// regen attempt that got fixNotes about exactly this can connect the dots.
export async function planVideoProduction(params: {
  direction?: ResolvedDirection;
  scriptText: string;
  topic: string;
  fixNotes?: string;
  // Sprint 2 Task 2 (E2) — an explicit per-run choice (resolved by the
  // caller from PipelineRun.creationOptions.visualSource) that the LLM is
  // instructed to honor. Enforced again, deterministically, after the LLM
  // responds (see below) — this feeds a real YouTube disclosure-policy
  // flag downstream (E4: the flag is Yes when any picture is AI-generated,
  // hot-fix #138), so it can't be left to prompt-following alone.
  visualSourceOverride?: VisualSource;
  // Sprint 2 Task 3 (F1) — same resolution-order pattern: an explicit
  // per-run choice always wins, else the planning LLM decides.
  audioLayerOverride?: AudioLayer;
  // Sprint 4 Task 3 (R10): replaces estimateStillCount when set.
  desiredStillCount?: number;
  // LLM Registry task (R5): the stage's budget check, asked before every extra provider call.
  retryGuard?: RetryGuard;
}): Promise<{ plan: ProductionPlan; llm: LLMResponse }> {
  const attemptContext = params.fixNotes
    ? `This is a REGENERATION attempt. The previous attempt failed review for this reason:\n${params.fixNotes}\nYour plan must concretely change whatever caused that failure.`
    : `This is the first attempt for this run — no prior feedback exists yet. Decide independently.`;

  const llm = await callLLM({
    purpose: 'video-production-planning',
    system: buildSystemPrompt(
      params.visualSourceOverride,
      params.audioLayerOverride,
      params.desiredStillCount ?? estimateStillCount(params.scriptText),
      params.direction,
    ),
    messages: [{ role: 'user', content: `Topic: ${params.topic}\nScript: ${params.scriptText}\n\n${attemptContext}` }],
    retryGuard: params.retryGuard,
  });

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(extractJsonText(llm.text));
  } catch (error) {
    throw new NonTransientStageError(
      `Video production planning did not return valid JSON (${describeJsonError(error)})`,
      error,
      llmUsageContext(llm),
    );
  }

  const result = ProductionPlanSchema.safeParse(normalizeShotList(parsedJson));
  if (!result.success) {
    throw new NonTransientStageError(`Production plan failed schema validation: ${result.error.message}`, undefined, llmUsageContext(llm));
  }

  let plan = result.data;

  // Deterministic enforcement of an explicit visualSource override — the
  // prompt above asks the LLM to honor it, but visualSource drives a real
  // YouTube disclosure-policy flag downstream (E4; Yes when any picture is
  // AI-generated, hot-fix #138), so correctness can't
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
        undefined,
        llmUsageContext(llm),
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
