import { z } from 'zod';
import { callLLM, describeJsonError, extractJsonText, type LLMResponse } from '../../llm';
import { NonTransientStageError } from '../../run-pipeline/retry-with-backoff';
import { llmUsageContext } from '../../run-pipeline/stage-failure';
import { MOOD_TAGS } from '../../audio-bed';
import { AUDIO_LAYERS, ProductionPlanSchema, type AudioLayer, type ProductionPlan } from './plan';
import { countWords, type ScriptChapter } from '../script-generation/long-form';

// Sprint 4 Task 9 (R5.2/R5.3): the production plan for a long-form video. Long-form uses AI stills
// only, so there is no visual-source or caption-style decision to make. The planner is called once
// per chapter (so each reply stays small and a failure costs one chapter, not the plan), is told how
// many stills that chapter gets, and must tie every still to the opening words of the narration it
// illustrates. The still total comes from the target length, never from a fixed cap of 20.

export const LONG_STILL_MIN = 12;
export const LONG_STILL_MAX = 200;
export const LONG_DEFAULT_SECONDS_PER_STILL = 5;

export function longStillCount(targetSeconds: number, secondsPerStill: number | null | undefined): number {
  const per = secondsPerStill && secondsPerStill > 0 ? secondsPerStill : LONG_DEFAULT_SECONDS_PER_STILL;
  return Math.min(LONG_STILL_MAX, Math.max(LONG_STILL_MIN, Math.ceil(targetSeconds / per)));
}

// Splits the total across chapters in proportion to their words (narration time), at least 2 each,
// and exactly `total` overall (largest remainders get the leftover).
export function allocateStillsToChapters(chapters: ScriptChapter[], total: number): number[] {
  const words = chapters.map((c) => Math.max(1, countWords(c.text)));
  const sum = words.reduce((a, b) => a + b, 0);
  const floor = Math.min(2, Math.floor(total / chapters.length));
  const base = words.map((w) => Math.max(floor, Math.floor((w / sum) * total)));
  let diff = total - base.reduce((a, b) => a + b, 0);
  const order = words.map((w, i) => ({ i, rem: (w / sum) * total - Math.floor((w / sum) * total) })).sort((a, b) => b.rem - a.rem);
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
  scenes: z.array(z.object({ words: z.string().min(1), prompt: z.string().min(1) })).min(1),
  audioLayer: z.string().optional(),
});

function buildSystemPrompt(params: { visualStyle?: string | null; scriptGuide?: string | null; audioLayerOverride?: AudioLayer }): string {
  const audio =
    params.audioLayerOverride === undefined
      ? `Also include "audioLayer": exactly one of ${MOOD_TAGS.join(', ')}, or "none": the music mood that best fits the whole video's tone.`
      : `Do not include "audioLayer".`;
  return `You are the image planner for a long-form YouTube video (landscape 16:9). One chapter of the narration is given at a time.
Plan the AI-generated still images for that chapter: a new image roughly every few seconds, each animated with a slow zoom or pan.

Respond with ONLY a JSON object: {"scenes": [{"words": string, "prompt": string}]${params.audioLayerOverride === undefined ? ', "audioLayer": string' : ''}}
- "scenes" has EXACTLY the number of scenes requested, in narration order, spread across the whole chapter.
- "words" is the first 4 to 8 words of the narration that scene illustrates, copied EXACTLY from the chapter text, so the image appears when those words are spoken. The first scene must start at the first words of the chapter.
- "prompt" is one image-generation prompt: one concrete, visually distinct scene matching that passage, composed for a wide landscape frame.
- ${audio}

Rules for prompts: depict scenes, objects, places, settings and silhouettes that evoke people rather than a close-up photoreal likeness of a real person's face. Never ask for text, captions, logos or watermarks inside an image. When a scene shows a person, say who they are in the prompt (gender, rough age, era, setting) and keep the era consistent across scenes. The image provider's safety system rejects some scenes, so avoid depicting children or minors, medical exams, bodily injury, violence or anything graphic.
${params.visualStyle ? `Visual style for every image: ${params.visualStyle}\n` : ''}${params.scriptGuide ? `Channel style guide (for tone): ${params.scriptGuide}\n` : ''}Respond with raw JSON only, no markdown code fences, no commentary.`;
}

async function planChapter(params: {
  system: string;
  topic: string;
  chapter: ScriptChapter;
  index: number;
  chapterCount: number;
  titles: string[];
  count: number;
  fixNotes?: string;
  calls: LLMResponse[];
  onCall?: (llm: LLMResponse) => Promise<void>;
}): Promise<z.infer<typeof ChapterScenesReplySchema>> {
  const user = [
    `Topic: ${params.topic}`,
    `Chapters in order: ${params.titles.map((t, i) => `${i + 1}. ${t}`).join('; ')}`,
    `This is chapter ${params.index + 1} of ${params.chapterCount}: "${params.chapter.title}"`,
    `Number of scenes to plan for this chapter: ${params.count}`,
    `Chapter narration:\n${params.chapter.text}`,
    params.fixNotes ? `The previous video attempt failed review for this reason; change whatever caused it:\n${params.fixNotes}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  let lastError = '';
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const llm = await callLLM({
      purpose: 'video-production-planning',
      system: params.system,
      messages: [{ role: 'user', content: attempt === 1 ? user : `${user}\n\nYour previous reply was unusable (${lastError}). Reply again with ONLY the corrected JSON object.` }],
      maxTokens: 4096,
    });
    params.calls.push(llm);
    // Booked the moment the call returns, so a later chapter failing never loses this call's spend.
    await params.onCall?.(llm);
    try {
      const parsed = ChapterScenesReplySchema.safeParse(JSON.parse(extractJsonText(llm.text)));
      if (!parsed.success) throw new Error(parsed.error.message.slice(0, 200));
      const n = parsed.data.scenes.length;
      if (n < Math.max(1, Math.ceil(params.count * 0.6))) throw new Error(`only ${n} scenes, ${params.count} were requested`);
      return { ...parsed.data, scenes: parsed.data.scenes.slice(0, Math.ceil(params.count * 1.4)) };
    } catch (error) {
      lastError = error instanceof SyntaxError ? describeJsonError(error) : error instanceof Error ? error.message : String(error);
      if (attempt === 2) {
        throw new NonTransientStageError(
          `Video production planning for chapter ${params.index + 1} ("${params.chapter.title}") was unusable twice: ${lastError}`,
          undefined,
          llmUsageContext(llm),
        );
      }
    }
  }
  throw new Error('unreachable');
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
}): Promise<{ plan: ProductionPlan; calls: LLMResponse[] }> {
  const calls: LLMResponse[] = [];
  const total = longStillCount(params.targetSeconds, params.secondsPerStill);
  const counts = allocateStillsToChapters(params.chapters, total);
  const system = buildSystemPrompt({ visualStyle: params.visualStyle, scriptGuide: params.scriptGuide, audioLayerOverride: params.audioLayerOverride });
  const titles = params.chapters.map((c) => c.title);

  const scenes: Array<{ chapterIndex: number; words: string; prompt: string }> = [];
  let audioLayer: AudioLayer | undefined = params.audioLayerOverride;
  for (let i = 0; i < params.chapters.length; i += 1) {
    const reply = await planChapter({
      system,
      topic: params.topic,
      chapter: params.chapters[i],
      index: i,
      chapterCount: params.chapters.length,
      titles,
      count: counts[i],
      fixNotes: params.fixNotes,
      calls,
      onCall: params.onCall,
    });
    for (const s of reply.scenes) scenes.push({ chapterIndex: i, words: s.words.trim(), prompt: s.prompt.trim() });
    if (!audioLayer && reply.audioLayer && (AUDIO_LAYERS as readonly string[]).includes(reply.audioLayer)) {
      audioLayer = reply.audioLayer as AudioLayer;
    }
  }

  const plan = ProductionPlanSchema.parse({
    visualSource: 'ai-stills',
    stockFootageQuery: params.topic.slice(0, 80) || 'documentary',
    stillScenePrompts: scenes.map((s) => s.prompt),
    longScenes: scenes,
    // Long-form captions are an uploaded SRT, never burned in; the field is kept for the shared schema.
    captionStyle: 'sentence-grouped',
    audioLayer: audioLayer ?? 'calm',
    pacingNotes: `Long-form: ${scenes.length} stills over ${params.chapters.length} chapters, about one every ${Math.round(params.targetSeconds / scenes.length)} seconds.`,
    rationale: `Planned chapter by chapter (${counts.join(', ')} stills per chapter, ${total} requested).`,
  });
  return { plan, calls };
}
