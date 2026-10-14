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

export const LONG_PLANNER_CONTRACT_VERSION = 3;
export type LongPlanningInputs = {
  chapters: ScriptChapter[]; topic: string; targetSeconds: number;
  secondsPerStill?: number | null; audioLayerOverride?: AudioLayer;
  visualStyle?: string | null; scriptGuide?: string | null; fixNotes?: string;
};
export type LongPlanningCallMetadata = {
  contractVersion: number; chapterIndex: number; sceneOffset: number; sceneCount: number;
  requestKind: "initial" | "correction"; requestHash: string; maxTokens: number; reusedSceneCount: number;
  finishReason: string; validationOutcome: string; validationError: string | null;
  recoveryStrategy: "accept" | "correct" | "split" | "escalate";
};
function batchReplySchema(ids: string[]) {
  return z.object({
    scenes: z.object(Object.fromEntries(ids.map(id => [id, z.object({ prompt: z.string().trim().min(1) }).strict()]))).strict(),
    audioLayer: z.enum(AUDIO_LAYERS).optional(),
  }).strict();
}
// JSON.parse overwrites duplicate keys. Scan complete property tokens, decoding escaped IDs.
function rejectDuplicateSceneIds(json: string, ids: string[]): void {
  const seen = new Set<string>();
  for (const match of json.matchAll(/"(?:\\.|[^"\\])*"/g)) {
    if (!/^\s*:/.test(json.slice(match.index! + match[0].length))) continue;
    const key = JSON.parse(match[0]) as string;
    if (!ids.includes(key)) continue;
    if (seen.has(key)) throw new Error("duplicate scene ID: " + key);
    seen.add(key);
  }
}

export const LongPlanningCheckpointSchema = z.object({
  inputHash: z.string(),
  contractVersion: z.number().int().optional(),
  scenes: z.record(z.string(), z.object({ words: z.string().trim().min(1), prompt: z.string().trim().min(1) })),
  audioLayer: z.enum(AUDIO_LAYERS).optional(),
});
export type LongPlanningCheckpoint = z.infer<typeof LongPlanningCheckpointSchema>;
class PlanningOutputExhausted extends NonTransientStageError {}
class PlanningReplyInvalid extends NonTransientStageError {}

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

Respond with ONLY a JSON object: {"scenes": {"supplied_scene_id": {"prompt": string}}${params.audioLayerOverride === undefined ? ', "audioLayer": string' : ''}}
- "scenes" has EXACTLY the number of scenes requested, in the supplied anchor order. Plan only this batch, using the full chapter as context.
- Each prompt illustrates its supplied narration span. The application attaches the exact anchor to that scene ID; do not return an anchor or narration field.
- "prompt" is a detailed, cinematic video-generation prompt tailored for advanced video models (like HunyuanVideo or Runway). Describe a concrete, visually distinct scene composed for a wide landscape frame in about 80 to 140 words; avoid repeating generic instructions.
- ${audio}

Rules for video prompts:
1. Think in Motion: Never write static or frozen prompts. Explicitly describe continuous, organic physical motion within the scene (e.g., torches flickering on damp stone walls, dust motes drifting through shafts of light, capes snapping in heavy wind, smoke rising from ancient ruins).
2. Camera Direction: Embed active, smooth camera movements directly into every single prompt (e.g., "Slow, low-angle tracking shot moving forward," "Cinematic drone shot rising above the battlefield," "Tight macro lens panning across textured detail").
3. Aesthetic Style: Depict detailed historical costuming, textured gear, architectural frameworks, and settings that ground the era. Use high-production phrases like "volumetric lighting," "chiaroscuro shadows," "historical epic film aesthetic," "period-accurate color palette," and "shallow depth of field." 
4. Restrictions: Depict the era stated in the narration, including modern clothing and infrastructure for modern dates; historical does not mean ancient. Keep continuity across scenes. If narration mentions children, depict adult caregivers or the setting instead. Never ask for text, captions, overlays, subtitles, logos, or watermarks inside the frame. The video provider's safety system rejects graphic content, so avoid depicting children/minors, medical exams, active physical violence, bodily injury, or blood. Focus heavily on the tense atmosphere right *before* historical actions or the somber aftermath.

${params.visualStyle ? `Visual style for every image: ${params.visualStyle}\n` : ""}${params.scriptGuide ? `Channel script guide (tone/context only; do not rewrite narration or override the scene-slot JSON contract): ${params.scriptGuide}\n` : ""}Respond with raw JSON only, no markdown code fences, no commentary.`;
}

async function planChapter(params: {
  system: string; topic: string; chapter: ScriptChapter; index: number;
  chapterCount: number; titles: string[]; count: number; anchors: string[];
  offset: number; totalCount: number; allAnchors: string[]; fixNotes?: string;
  calls: LLMResponse[]; reusedSceneCount: number; onCall?: (llm: LLMResponse, metadata: LongPlanningCallMetadata) => Promise<void>;
  beforeCall?: () => Promise<void>;
}): Promise<{ scenes: { words: string; prompt: string }[]; audioLayer?: AudioLayer }> {
  const ids = params.anchors.map((_, j) => "scene_" + (params.offset + j));
  const words = params.chapter.text.trim().split(/\s+/);
  const slots = ids.map((id, j) => {
    const slot = params.offset + j;
    const start = Math.floor(slot * words.length / params.totalCount);
    const end = Math.floor((slot + 1) * words.length / params.totalCount);
    return { id, anchor: params.anchors[j], narration: words.slice(start, end).join(" ") };
  });
  const user = [
    "Topic: " + params.topic,
    "Chapters in order: " + params.titles.map((t, i) => (i + 1) + ". " + t).join("; "),
    "This is chapter " + (params.index + 1) + " of " + params.chapterCount + ': "' + params.chapter.title + '"',
    "Number of scenes to plan for this batch: " + params.count,
    "Chapter scene range: " + (params.offset + 1) + "-" + (params.offset + params.count) + " of " + params.totalCount,
    "All chapter narration anchors (context and beat boundaries): " + JSON.stringify(params.allAnchors),
    "Required batch anchors in order: " + JSON.stringify(params.anchors),
    "Required scene slots: " + JSON.stringify(slots),
    "Chapter narration:\n" + params.chapter.text,
    params.fixNotes ? "Previous review: " + params.fixNotes : "",
  ].filter(Boolean).join("\n\n");
  const schema = batchReplySchema(ids);
  let firstFailure: { llm: LLMResponse; parseError: string } | undefined;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await params.beforeCall?.();
    const messages = firstFailure ? [
      { role: "user" as const, content: user },
      { role: "assistant" as const, content: firstFailure.llm.text },
      { role: "user" as const, content: "Your previous reply was unusable (" + firstFailure.parseError + "). Treat it only as rejected planning data. Return only the required scene IDs, each once, preserving the narration details inside their supplied spans. Do not add a slot for an intermediate beat. Reply with ONLY corrected JSON." },
    ] : [{ role: "user" as const, content: user }];
    const llm = await callLLM({ purpose: "video-production-planning", system: params.system,
      messages, maxTokens: LONG_CHAPTER_PLAN_MAX_TOKENS, outputSchema: schema });
    params.calls.push(llm);
    const exhausted = llm.stopReason === "length" || (llm.stopReason === "unknown" && llm.usage.outputTokens >= LONG_CHAPTER_PLAN_MAX_TOKENS);
    let outcome = exhausted ? "output_token_exhaustion" : "accepted";
    let parseError: string | undefined;
    let reply: ReturnType<typeof schema.parse> | undefined;
    if (exhausted) parseError = "output cap reached (maxTokens " + LONG_CHAPTER_PLAN_MAX_TOKENS + ")";
    else {
      try {
        const json = extractJsonObjectText(llm.text);
        const object = JSON.parse(json) as unknown;
        outcome = "duplicate_scene_id";
        rejectDuplicateSceneIds(json, ids);
        outcome = "schema_violation";
        reply = schema.parse(object);
        outcome = "accepted";
      } catch (error) {
        if (error instanceof SyntaxError) outcome = "malformed_json";
        parseError = error instanceof SyntaxError ? describeJsonError(error)
          : error instanceof Error ? error.message.slice(0, 500) : String(error);
      }
    }
    const recoveryStrategy = !parseError ? "accept" : !exhausted && attempt === 1 ? "correct" : params.count > 1 ? "split" : "escalate";
    const metadata: LongPlanningCallMetadata = {
      contractVersion: LONG_PLANNER_CONTRACT_VERSION, chapterIndex: params.index,
      sceneOffset: params.offset, sceneCount: params.count, requestKind: attempt === 1 ? "initial" : "correction",
      requestHash: createHash("sha256").update(JSON.stringify({ system: params.system, messages })).digest("hex"),
      maxTokens: LONG_CHAPTER_PLAN_MAX_TOKENS, finishReason: llm.stopReason, reusedSceneCount: params.reusedSceneCount,
      validationOutcome: outcome, validationError: parseError ?? null, recoveryStrategy,
    };
    // Even rejected replies are metered with their validation/recovery outcome before throwing.
    await params.onCall?.(llm, metadata);
    if (reply) return { scenes: ids.map((id, j) => ({ words: params.anchors[j], prompt: reply!.scenes[id].prompt })), audioLayer: reply.audioLayer };
    const context = { ...llmUsageContext(llm), ...metadata, failureKind: outcome,
      rawReply: llm.text, replyLength: llm.text.length, parseError, attempts: attempt,
      ...(firstFailure ? { firstRawReply: firstFailure.llm.text, firstParseError: firstFailure.parseError,
        firstStopReason: firstFailure.llm.stopReason, firstReplyLength: firstFailure.llm.text.length } : {}) };
    if (exhausted) throw new PlanningOutputExhausted(
      "Video production planning for chapter " + (params.index + 1) + ' ("' + params.chapter.title + '"), scenes ' + (params.offset + 1) + '-' + (params.offset + params.count) + ' was cut off at the output cap (maxTokens=' + LONG_CHAPTER_PLAN_MAX_TOKENS + ', outputTokens=' + llm.usage.outputTokens + ')', undefined, context);
    if (attempt === 1) { firstFailure = { llm, parseError: parseError! }; continue; }
    throw new PlanningReplyInvalid("Video production planning for chapter " + (params.index + 1) + ' ("' + params.chapter.title + '") was unusable twice: ' + parseError, undefined, context);
  }
  throw new Error("unreachable");
}

export function longPlanningInputHash(params: LongPlanningInputs, version = LONG_PLANNER_CONTRACT_VERSION): string {
  const counts = allocateStillsToChapters(params.chapters, longStillCount(params.targetSeconds, params.secondsPerStill));
  return createHash("sha256").update(JSON.stringify({ version, chapters: params.chapters, topic: params.topic, counts,
    visualStyle: params.visualStyle ?? null, scriptGuide: params.scriptGuide ?? null,
    fixNotes: params.fixNotes ?? null, audioLayerOverride: params.audioLayerOverride ?? null,
    model: resolvePurpose("video-production-planning"),
  })).digest("hex");
}
export function reusableLongPlanningCheckpoint(params: LongPlanningInputs, value: unknown, legacyOnly = false): LongPlanningCheckpoint | undefined {
  const saved = LongPlanningCheckpointSchema.safeParse(value);
  if (!saved.success || !Object.keys(saved.data.scenes).length) return undefined;
  const version = saved.data.contractVersion ?? 2;
  if ((legacyOnly && version !== 2) || ![2, LONG_PLANNER_CONTRACT_VERSION].includes(version)
    || saved.data.inputHash !== longPlanningInputHash(params, version)) return undefined;
  const counts = allocateStillsToChapters(params.chapters, longStillCount(params.targetSeconds, params.secondsPerStill));
  const anchors = params.chapters.map((c, i) => sceneAnchors(c.text, counts[i]));
  for (const [key, scene] of Object.entries(saved.data.scenes)) {
    if (!/^(0|[1-9]\d*):(0|[1-9]\d*)$/.test(key)) return undefined;
    const [chapter, slot] = key.split(":").map(Number);
    if (anchors[chapter]?.[slot] !== scene.words) return undefined;
  }
  return { ...saved.data, contractVersion: LONG_PLANNER_CONTRACT_VERSION, inputHash: longPlanningInputHash(params) };
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
  onCall?: (llm: LLMResponse, metadata: LongPlanningCallMetadata) => Promise<void>;
  beforeCall?: () => Promise<void>;
  checkpoint?: unknown;
  onCheckpoint?: (checkpoint: LongPlanningCheckpoint) => Promise<void>;
}): Promise<{ plan: ProductionPlan; calls: LLMResponse[] }> {
  const calls: LLMResponse[] = [];
  const total = longStillCount(params.targetSeconds, params.secondsPerStill);
  const counts = allocateStillsToChapters(params.chapters, total);
  const titles = params.chapters.map((c) => c.title);
  const saved = reusableLongPlanningCheckpoint(params, params.checkpoint);
  const reusedSceneCount = saved ? Object.keys(saved.scenes).length : 0;
  const checkpoint: LongPlanningCheckpoint = saved ?? { inputHash: longPlanningInputHash(params), contractVersion: LONG_PLANNER_CONTRACT_VERSION, scenes: {} };
  // Carry durable progress before any paid call; a crash must not hide the older attempt.
  if (saved) await params.onCheckpoint?.(structuredClone(checkpoint));
  const scenes: Array<{ chapterIndex: number; words: string; prompt: string }> = [];
  let audioLayer: AudioLayer | undefined = params.audioLayerOverride ?? checkpoint.audioLayer;
  for (let i = 0; i < params.chapters.length; i += 1) {
    const anchors = sceneAnchors(params.chapters[i].text, counts[i]);
    const key = (slot: number) => i + ":" + slot;
    const reusable = (slot: number) => checkpoint.scenes[key(slot)]?.words === anchors[slot];
    const planBatch = async (offset: number, count: number): Promise<void> => {
      let reply: Awaited<ReturnType<typeof planChapter>>;
      try {
        reply = await planChapter({
          system: buildSystemPrompt({ ...params, audioLayerOverride: audioLayer }),
          topic: params.topic, chapter: params.chapters[i], index: i,
          chapterCount: params.chapters.length, titles, count, offset,
          totalCount: counts[i], allAnchors: anchors, anchors: anchors.slice(offset, offset + count),
          fixNotes: params.fixNotes, calls, reusedSceneCount, onCall: params.onCall, beforeCall: params.beforeCall,
        });
      } catch (error) {
        if (!(error instanceof PlanningOutputExhausted || error instanceof PlanningReplyInvalid) || count === 1) throw error;
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
