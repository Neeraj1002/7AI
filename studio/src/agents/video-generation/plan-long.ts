import { z } from "zod";
import { createHash } from "node:crypto";
import { MOOD_TAGS } from "../../audio-bed";
import {
  callLLM,
  describeJsonError,
  extractJsonObjectText,
  type LLMResponse,
  resolvePurpose,
} from "../../llm";
import { NonTransientStageError } from "../../run-pipeline/retry-with-backoff";
import { llmUsageContext } from "../../run-pipeline/stage-failure";
import { countWords, type ScriptChapter } from "../script-generation/long-form";
import {
  AUDIO_LAYERS,
  ProductionPlanSchema,
  type AudioLayer,
  type ProductionPlan,
} from "./plan";

// Sprint 4 Task 9 (R5.2/R5.3): the production plan for a long-form video. Long-form uses AI stills
// only, so there is no visual-source or caption-style decision to make. The planner uses bounded
// batches with full chapter context, checkpoints completed scenes, and is told how
// many stills that chapter gets, and must tie every still to the opening words of the narration it
// illustrates. The still total comes from the target length, never from a fixed cap of 20.

export const LONG_STILL_MIN = 12;
export const LONG_STILL_MAX = 200;
export const LONG_DEFAULT_SECONDS_PER_STILL = 5;
// Sonnet 5 supports 128K output tokens, but small replies bound recovery cost.
// Keep the existing per-call budget; split further if a batch exhausts it.
export const LONG_CHAPTER_PLAN_MAX_TOKENS = 8192;
export const LONG_SCENES_PER_BATCH = 12;

export function longStillCount(
  targetSeconds: number,
  secondsPerStill: number | null | undefined,
): number {
  const per =
    secondsPerStill && secondsPerStill > 0
      ? secondsPerStill
      : LONG_DEFAULT_SECONDS_PER_STILL;
  return Math.min(
    LONG_STILL_MAX,
    Math.max(LONG_STILL_MIN, Math.ceil(targetSeconds / per)),
  );
}

// Splits the total across chapters in proportion to their words (narration time), at least 2 each,
// and exactly `total` overall (largest remainders get the leftover).
export function allocateStillsToChapters(
  chapters: ScriptChapter[],
  total: number,
): number[] {
  const words = chapters.map((c) => Math.max(1, countWords(c.text)));
  const sum = words.reduce((a, b) => a + b, 0);
  const floor = Math.min(2, Math.floor(total / chapters.length));
  const base = words.map((w) => Math.max(floor, Math.floor((w / sum) * total)));
  let diff = total - base.reduce((a, b) => a + b, 0);
  const order = words
    .map((w, i) => ({
      i,
      rem: (w / sum) * total - Math.floor((w / sum) * total),
    }))
    .sort((a, b) => b.rem - a.rem);
  for (let k = 0; diff !== 0; k = (k + 1) % order.length) {
    const i = order[k].i;
    if (diff > 0) {
      base[i] += 1;
      diff -= 1;
    } else if (base[i] > floor) {
      base[i] -= 1;
      diff += 1;
    }
    if (k > 10_000) break;
  }
  return base;
}

const ChapterScenesReplySchema = z.object({
  scenes: z
    .array(z.object({ words: z.string().min(1), prompt: z.string().trim().min(1) }))
    .min(1),
  audioLayer: z.enum(AUDIO_LAYERS).optional(),
});

export const LongPlanningCheckpointSchema = z.object({
  inputHash: z.string(),
  scenes: z.record(z.string(), z.object({ words: z.string().trim().min(1), prompt: z.string().trim().min(1) })),
  audioLayer: z.enum(AUDIO_LAYERS).optional(),
});
export type LongPlanningCheckpoint = z.infer<typeof LongPlanningCheckpointSchema>;
class PlanningOutputExhausted extends NonTransientStageError {}

// Fixed narration anchors span the full chapter and make recovery deterministic.
function sceneAnchors(text: string, count: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) throw new NonTransientStageError("Cannot plan empty chapter narration");
  return Array.from({ length: count }, (_, i) => {
    const start = Math.floor(i * words.length / count);
    return words.slice(start, start + 6).join(" ");
  });
}

function buildSystemPrompt(params: {
  visualStyle?: string | null;
  scriptGuide?: string | null;
  audioLayerOverride?: AudioLayer;
}): string {
  const audio =
    params.audioLayerOverride === undefined
      ? `Also include "audioLayer": exactly one of ${MOOD_TAGS.join(", ")}, or "none": the music mood that best fits the whole video's tone.`
      : `Do not include "audioLayer".`;

  return `You are the cinematic video director and production planner for a long-form YouTube history video (landscape 16:9). One chapter of the narration is given at a time.
Plan a sequence of moving AI-generated video clips for that chapter: a new dynamic clip roughly every few seconds to keep pacing high.

Respond with ONLY a JSON object: {"scenes": [{"words": string, "prompt": string}]${params.audioLayerOverride === undefined ? ', "audioLayer": string' : ''}}
- "scenes" has EXACTLY the number of scenes requested, in the supplied anchor order. Plan only this batch, using the full chapter as context.
- "words" must copy the corresponding supplied narration anchor EXACTLY. Each prompt illustrates the narration from that anchor until the next anchor (or chapter end).
- "prompt" is a detailed, cinematic video-generation prompt tailored for advanced video models (like HunyuanVideo or Runway). Describe a concrete, visually distinct scene composed for a wide landscape frame in about 80 to 140 words; avoid repeating generic instructions.
- ${audio}

Rules for video prompts:
1. Think in Motion: Never write static or frozen prompts. Explicitly describe continuous, organic physical motion within the scene (e.g., torches flickering on damp stone walls, dust motes drifting through shafts of light, capes snapping in heavy wind, smoke rising from ancient ruins).
2. Camera Direction: Embed active, smooth camera movements directly into every single prompt (e.g., "Slow, low-angle tracking shot moving forward," "Cinematic drone shot rising above the battlefield," "Tight macro lens panning across textured detail").
3. Aesthetic Style: Depict detailed historical costuming, textured gear, architectural frameworks, and settings that ground the era. Use high-production phrases like "volumetric lighting," "chiaroscuro shadows," "historical epic film aesthetic," "period-accurate color palette," and "shallow depth of field." 
4. Restrictions: Keep the era strictly consistent across scenes. Never ask for text, captions, overlays, subtitles, logos, or watermarks inside the frame. The video provider's safety system rejects graphic content, so avoid depicting children/minors, medical exams, active physical violence, bodily injury, or blood. Focus heavily on the tense atmosphere right *before* historical actions or the somber aftermath.

${params.visualStyle ? `Visual style for every image: ${params.visualStyle}\n` : ""}${params.scriptGuide ? `Channel style guide (for tone): ${params.scriptGuide}\n` : ""}Respond with raw JSON only, no markdown code fences, no commentary.`;
}

async function planChapter(params: {
  system: string;
  topic: string;
  chapter: ScriptChapter;
  index: number;
  chapterCount: number;
  titles: string[];
  count: number;
  anchors: string[];
  offset: number;
  totalCount: number;
  allAnchors: string[];
  fixNotes?: string;
  calls: LLMResponse[];
  onCall?: (llm: LLMResponse) => Promise<void>;
  beforeCall?: () => Promise<void>;
}): Promise<z.infer<typeof ChapterScenesReplySchema>> {
  const user = [
    `Topic: ${params.topic}`,
    `Chapters in order: ${params.titles.map((t, i) => `${i + 1}. ${t}`).join("; ")}`,
    `This is chapter ${params.index + 1} of ${params.chapterCount}: "${params.chapter.title}"`,
    `Number of scenes to plan for this batch: ${params.count}`,
    `Chapter scene range: ${params.offset + 1}-${params.offset + params.count} of ${params.totalCount}`,
    `All chapter narration anchors (context and beat boundaries): ${JSON.stringify(params.allAnchors)}`,
    `Required batch anchors in order: ${JSON.stringify(params.anchors)}`,
    `Chapter narration:\n${params.chapter.text}`,
    params.fixNotes
      ? `The previous video attempt failed review for this reason; change whatever caused it:\n${params.fixNotes}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  let lastError = "";
  let firstFailure: { llm: LLMResponse; parseError: string } | undefined;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await params.beforeCall?.();
    const llm = await callLLM({
      purpose: "video-production-planning",
      system: params.system,
      messages: [
        {
          role: "user",
          content:
            attempt === 1
              ? user
              : `${user}\n\nYour previous reply was unusable (${lastError}). Reply again with ONLY the corrected JSON object.`,
        },
      ],
      maxTokens: LONG_CHAPTER_PLAN_MAX_TOKENS,
      // Schema-constrained output keeps quotation marks and control characters in
      // scene prompts JSON-escaped by the provider. The parser below remains as
      // a fallback for an unusable response so the existing retry can recover.
      outputSchema: ChapterScenesReplySchema,
    });
    params.calls.push(llm);
    // Booked the moment the call returns, so a later chapter failing never loses this call's spend.
    await params.onCall?.(llm);
    if (llm.stopReason === "length" || llm.usage.outputTokens >= LONG_CHAPTER_PLAN_MAX_TOKENS) {
      const parseError = `output cap reached (maxTokens ${LONG_CHAPTER_PLAN_MAX_TOKENS})`;
      throw new PlanningOutputExhausted(
        `Video production planning for chapter ${params.index + 1} ("${params.chapter.title}"), scenes ${params.offset + 1}-${params.offset + params.count}, was cut off at the output cap (maxTokens=${LONG_CHAPTER_PLAN_MAX_TOKENS}, outputTokens=${llm.usage.outputTokens}).`,
        undefined,
        {
          ...llmUsageContext(llm),
          rawReply: llm.text,
          replyLength: llm.text.length,
          parseError,
          attempts: attempt,
          failureKind: "output_token_exhaustion",
          sceneOffset: params.offset,
          sceneCount: params.count,
        },
      );
    }
    try {
      const parsed = ChapterScenesReplySchema.safeParse(
        JSON.parse(extractJsonObjectText(llm.text)),
      );
      if (!parsed.success) throw new Error(parsed.error.message.slice(0, 200));
      const n = parsed.data.scenes.length;
      if (n !== params.count)
        throw new Error(`received ${n} scenes, exactly ${params.count} were requested`);
      if (parsed.data.scenes.some((scene, i) => scene.words !== params.anchors[i]))
        throw new Error("scene anchors must match the supplied anchors in order");
      return parsed.data;
    } catch (error) {
      lastError =
        error instanceof SyntaxError
          ? describeJsonError(error)
          : error instanceof Error
            ? error.message
            : String(error);
      if (attempt === 1) {
        firstFailure = { llm, parseError: lastError };
        continue;
      }
      if (attempt === 2) {
        throw new NonTransientStageError(
          `Video production planning for chapter ${params.index + 1} ("${params.chapter.title}") was unusable twice: ${lastError}`,
          undefined,
          {
            ...llmUsageContext(llm),
            rawReply: llm.text,
            replyLength: llm.text.length,
            parseError: lastError,
            attempts: attempt,
            ...(firstFailure
              ? {
                  firstRawReply: firstFailure.llm.text,
                  firstParseError: firstFailure.parseError,
                  firstStopReason: firstFailure.llm.stopReason,
                }
              : {}),
          },
        );
      }
    }
  }
  throw new Error("unreachable");
}

export async function planLongVideoProduction(params: {
  chapters: ScriptChapter[];
  topic: string;
  targetSeconds: number;
  secondsPerStill?: number | null;
  audioLayerOverride?: AudioLayer;
  visualStyle?: string | null;
  scriptGuide?: string | null;
  fixNotes?: string;
  onCall?: (llm: LLMResponse) => Promise<void>;
  beforeCall?: () => Promise<void>;
  checkpoint?: unknown;
  onCheckpoint?: (checkpoint: LongPlanningCheckpoint) => Promise<void>;
}): Promise<{ plan: ProductionPlan; calls: LLMResponse[] }> {
  const calls: LLMResponse[] = [];
  const total = longStillCount(params.targetSeconds, params.secondsPerStill);
  const counts = allocateStillsToChapters(params.chapters, total);
  const titles = params.chapters.map((c) => c.title);
  const inputHash = createHash("sha256").update(JSON.stringify({
    version: 2, chapters: params.chapters, topic: params.topic, counts,
    visualStyle: params.visualStyle ?? null, scriptGuide: params.scriptGuide ?? null,
    fixNotes: params.fixNotes ?? null, audioLayerOverride: params.audioLayerOverride ?? null,
    model: resolvePurpose("video-production-planning"),
  })).digest("hex");
  const saved = LongPlanningCheckpointSchema.safeParse(params.checkpoint);
  const checkpoint: LongPlanningCheckpoint = saved.success && saved.data.inputHash === inputHash
    ? saved.data : { inputHash, scenes: {} };
  const scenes: Array<{ chapterIndex: number; words: string; prompt: string }> = [];
  let audioLayer: AudioLayer | undefined = params.audioLayerOverride ?? checkpoint.audioLayer;
  for (let i = 0; i < params.chapters.length; i += 1) {
    const anchors = sceneAnchors(params.chapters[i].text, counts[i]);
    const key = (slot: number) => i + ":" + slot;
    const reusable = (slot: number) => checkpoint.scenes[key(slot)]?.words === anchors[slot];
    const planBatch = async (offset: number, count: number): Promise<void> => {
      let reply: z.infer<typeof ChapterScenesReplySchema>;
      try {
        reply = await planChapter({
          system: buildSystemPrompt({ ...params, audioLayerOverride: audioLayer }),
          topic: params.topic, chapter: params.chapters[i], index: i,
          chapterCount: params.chapters.length, titles, count, offset,
          totalCount: counts[i], allAnchors: anchors, anchors: anchors.slice(offset, offset + count),
          fixNotes: params.fixNotes, calls, onCall: params.onCall, beforeCall: params.beforeCall,
        });
      } catch (error) {
        if (!(error instanceof PlanningOutputExhausted) || count === 1) throw error;
        // Never repeat an identical oversized request. Each child is smaller.
        const left = Math.floor(count / 2);
        await planBatch(offset, left);
        await planBatch(offset + left, count - left);
        return;
      }
      reply.scenes.forEach((scene, j) => {
        checkpoint.scenes[key(offset + j)] = { words: scene.words.trim(), prompt: scene.prompt.trim() };
      });
      audioLayer ??= reply.audioLayer;
      checkpoint.audioLayer = audioLayer;
      await params.onCheckpoint?.(structuredClone(checkpoint));
    };
    for (let offset = 0; offset < counts[i];) {
      if (reusable(offset)) { offset += 1; continue; }
      let count = 1;
      while (count < LONG_SCENES_PER_BATCH && offset + count < counts[i] && !reusable(offset + count)) count += 1;
      await planBatch(offset, count);
      offset += count;
    }
    for (let slot = 0; slot < counts[i]; slot += 1)
      scenes.push({ chapterIndex: i, ...checkpoint.scenes[key(slot)] });
  }

  const plan = ProductionPlanSchema.parse({
    visualSource: "ai-stills",
    stockFootageQuery: params.topic.slice(0, 80) || "documentary",
    stillScenePrompts: scenes.map((s) => s.prompt),
    longScenes: scenes,
    // Long-form captions are an uploaded SRT, never burned in; the field is kept for the shared schema.
    captionStyle: "sentence-grouped",
    audioLayer: audioLayer ?? "calm",
    pacingNotes: `Long-form: ${scenes.length} stills over ${params.chapters.length} chapters, about one every ${Math.round(params.targetSeconds / scenes.length)} seconds.`,
    rationale: `Planned chapter by chapter (${counts.join(", ")} stills per chapter, ${total} requested).`,
  });
  return { plan, calls };
}
