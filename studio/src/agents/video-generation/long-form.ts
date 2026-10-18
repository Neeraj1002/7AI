import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveMediaPurpose } from '../../media';
import { generateStills } from '../../ai-visuals';
import { STILL_SIZE_LANDSCAPE } from '../../ai-visuals/sizes';
import { stillsCacheDir } from '../../ai-visuals/cache';
import { resolveAiVisualsPurpose, resolveImagePricing } from '../../ai-visuals/registry';
import { pickAudioBedTracks } from '../../audio-bed';
import { env } from '../../config/env';
import { DATA_DIR } from '../../config/paths';
import { NonTransientStageError, getStageErrorContext } from '../../run-pipeline/retry-with-backoff';
import { END_TAIL_SECONDS } from './quality-spec';
import { buildStyledScenePrompts, type SceneStyle } from './scene-prompts';
import { LONG_WORDS_PER_MINUTE, countWords, joinChapterTexts, measuredWordsPerMinute, type ScriptChapter } from '../script-generation/long-form';
import { narrateChapters, type NarrationPaid } from './long-narration';
import { buildSrtFromScript } from './subtitles-srt';
import { renderProfileFor } from './render-profile';
import {
  allocateFrames,
  buildSceneTimeline,
  joinAndMux,
  mixLongAudio,
  probeSeconds,
  renderChapterSegments,
  type ChapterSegmentPlan,
} from './long-render';
import type { ProductionPlan } from './plan';
import { bindSceneAssets, createSceneMapping, validateScenePlan } from './scene-mapping';
import type { VideoSpend } from './spend';
import { addScenesToChapters, rebalanceShotLengths } from './shot-balance';
import type { VideoGenerationResult } from './index';

// Sprint 4 Task 9 (R3-R6): the long-form (16:9, chaptered) counterpart of generateVideo. Order of
// work: narration (per chapter), the mixed and loudness-normalised audio, the SRT, the stills (cached
// on disk, paid for one by one), then the picture one chapter at a time, joined and muxed with the
// finished audio. Every paid call is reported through a callback the moment it completes, and
// `guard` is awaited after each one and before each expensive step, so a spend limit stops the run
// between two calls, never in the middle of an unbooked one.

export type LongVideoParams = {
  pipelineRunId: string;
  attemptNumber: number;
  chapters: ScriptChapter[];
  plan: ProductionPlan;
  voice?: string;
  sceneStyle?: SceneStyle;
  spend?: VideoSpend;
  onNarrationPaid?: (paid: NarrationPaid) => Promise<void>;
  onStillPaid?: (info: { index: number; costUsd: number; model: string }) => Promise<void>;
  // Throws to stop the run (a spend limit); awaited before narration, before the stills, before the
  // render and after every paid call.
  guard?: (nextCallUsd?: number) => Promise<void>;
  // The channel's weekly budget gate, awaited before the image stage and before the render (as a
  // Short's is before its render). Throws to stop the run.
  weeklyGate?: () => Promise<void>;
  // Sprint 4 Task 12 (R4): stills finished so far (cache hits included), for runs.progress.
  onStillsProgress?: (progress: { done: number; total: number }) => void;
  // Sprint 5 Task 8 (R3): the longest a single picture may stay on screen. When set, the plan is checked
  // against the narration timing before any picture is paid for.
  maxShotSeconds?: number;
};

export async function generateLongVideo(params: LongVideoParams): Promise<VideoGenerationResult> {
  const profile = renderProfileFor('long');
  const plan = params.plan;
  const scenes = plan.longScenes;
  if (plan.visualSource !== 'ai-stills' || !scenes || scenes.length === 0) {
    throw new NonTransientStageError('A long-form video needs an AI-stills plan with chapter scenes (plan.longScenes)');
  }
  validateScenePlan(plan, params.chapters);
  for (let ci = 0; ci < params.chapters.length; ci += 1) {
    if (!scenes.some((s) => s.chapterIndex === ci)) {
      throw new NonTransientStageError(`Chapter ${ci + 1} ("${params.chapters[ci].title}") has no scenes in the production plan`);
    }
  }
  const scriptText = joinChapterTexts(params.chapters);
  const spend = params.spend;
  if (spend) spend.bookedSeparately = true;
  const guard = async (nextCallUsd?: number) => {
    await params.guard?.(nextCallUsd);
  };

  const outputDir = path.resolve(DATA_DIR, 'videos', params.pipelineRunId);
  const workDir = path.join(outputDir, 'work');
  await fs.mkdir(workDir, { recursive: true });
  const videoPath = path.join(outputDir, `${params.attemptNumber}.mp4`);

  // 1. Narration, chunk by chunk, each booked as it is paid for.
  await guard();
  const narration = await narrateChapters({
    chapters: params.chapters,
    voice: params.voice,
    workDir: path.join(workDir, 'narration'),
    outputPath: path.join(workDir, `narration-${params.attemptNumber}.mp3`),
    onPaid: async (paid) => {
      if (spend) {
        spend.ttsProvider = resolveMediaPurpose('tts', params.voice).provider;
        spend.ttsModel = resolveMediaPurpose('tts', params.voice).model;
        spend.ttsCharacters += paid.ttsCharacters;
        spend.ttsCostUsd += paid.ttsCostUsd;
        spend.transcriptionModel = resolveMediaPurpose('transcription').model;
        spend.transcriptionSeconds += paid.transcriptionSeconds;
        spend.transcriptionCostUsd += paid.transcriptionCostUsd;
      }
      await params.onNarrationPaid?.(paid);
      await guard();
    },
  });

  const scriptWordCount = countWords(scriptText);
  const pace = measuredWordsPerMinute(scriptWordCount, narration.durationSeconds);
  console.log(
    `[video_generation] run ${params.pipelineRunId} attempt ${params.attemptNumber}: narration pace ${pace} words per minute (${scriptWordCount} words in ${narration.durationSeconds.toFixed(1)} s; script planned at ${LONG_WORDS_PER_MINUTE})`,
  );

  // 2. The mixed audio, before any picture work. A music license that cannot be confirmed fails here,
  //    before the stills are paid for.
  const bedTracks = plan.audioLayer !== 'none' ? pickAudioBedTracks(plan.audioLayer) : undefined;
  const mixed = await mixLongAudio({
    voicePath: narration.audioPath,
    voiceDurationSeconds: narration.durationSeconds,
    tailSeconds: END_TAIL_SECONDS,
    bedTracks,
    workDir,
    outputPath: path.join(workDir, `mixed-${params.attemptNumber}.m4a`),
  });

  // 3. Subtitles from the exact script text. Fails the run loudly if they cannot be built.
  const { srt } = buildSrtFromScript(scriptText, narration.words);
  const srtPath = path.join(outputDir, `${params.attemptNumber}.srt`);
  await fs.writeFile(srtPath, srt, 'utf-8');

  // 3b. The scene timeline is known now (plan + narration timing), before any picture is paid for.
  //     A scene over the shot-length limit is fixed here: first by moving scene starts (free), and only
  //     if a chapter has too few scenes by adding scenes, which are the only new pictures needed.
  const totalSec = mixed.durationSeconds;
  const timelineFor = (p: ProductionPlan) => buildSceneTimeline({ scenes: p.longScenes!, chapterTimings: narration.chapterTimings, words: narration.words,
    chapters: params.chapters, meanings: p.sceneMeanings?.scenes, totalSec });
  let activePlan: ProductionPlan = plan;
  let timeline = timelineFor(activePlan);
  let shotPlan: { longestBefore: number; longestAfter: number; adjustedChapters: number[]; addedScenes: number } | undefined;
  if (params.maxShotSeconds) {
    const longestBefore = Math.max(...timeline.map((t) => t.endSec - t.startSec));
    let balance = rebalanceShotLengths(timeline, params.maxShotSeconds);
    let addedScenes = 0;
    if (balance.splits.length > 0) {
      activePlan = addScenesToChapters(activePlan, params.chapters, balance.splits);
      validateScenePlan(activePlan, params.chapters);
      addedScenes = activePlan.longScenes!.length - scenes.length;
      timeline = timelineFor(activePlan);
      balance = rebalanceShotLengths(timeline, params.maxShotSeconds);
    }
    timeline = balance.timeline;
    shotPlan = { longestBefore: Number(longestBefore.toFixed(2)), longestAfter: Number(balance.longestShotSec.toFixed(2)), adjustedChapters: balance.adjustedChapters, addedScenes };
    if (balance.adjustedChapters.length > 0 || addedScenes > 0) {
      console.log(`[video_generation] run ${params.pipelineRunId} attempt ${params.attemptNumber}: shot-length check before pictures: longest ${shotPlan.longestBefore}s -> ${shotPlan.longestAfter}s (limit ${params.maxShotSeconds}s), ${balance.adjustedChapters.length} chapter(s) retimed, ${addedScenes} scene(s) added`);
    }
  }
  const finalScenes = activePlan.longScenes!;

  // 4. Stills: landscape, cached on disk by prompt hash, each booked as it is generated.
  const stillPriceUsd = resolveImagePricing(resolveAiVisualsPurpose('still-generation').model).perImageUsd;
  await guard(stillPriceUsd);
  await params.weeklyGate?.();
  const styled = buildStyledScenePrompts(finalScenes.map((s) => s.prompt), params.sceneStyle ?? {});
  let stills: Awaited<ReturnType<typeof generateStills>>;
  try {
    stills = await generateStills({
      scenePrompts: styled,
      size: STILL_SIZE_LANDSCAPE,
      cacheDir: stillsCacheDir(params.pipelineRunId),
      onProgress: params.onStillsProgress,
      onStillGenerated: async (info) => {
        if (spend) {
          spend.stillsModel = info.model;
          spend.stillsCount += 1;
          spend.stillsCostUsd += info.costUsd;
        }
        await params.onStillPaid?.(info);
        // The next picture is about to be paid for: stop here if it would pass the limit.
        await guard(stillPriceUsd);
      },
    });
  } catch (error) {
    // A stop between two stills keeps every finished one in the cache; nothing to unwind here.
    const ctx = getStageErrorContext(error);
    if (spend && ctx && typeof ctx.model === 'string') spend.stillsModel = ctx.model;
    throw error;
  }

  // Bind actual image bytes to each slot, recording any moderation substitution.
  const assets = await bindSceneAssets({ sceneCount: finalScenes.length, imagePaths: stills.imagePaths, promptIndexes: stills.promptIndexes });

  // 5. The picture: one silent segment per chapter, resumable, then joined with the finished audio.
  await guard();
  await params.weeklyGate?.();
  const frames = allocateFrames(timeline.map((t) => t.endSec), profile.fps);
  const sceneMapping = createSceneMapping({ plan: activePlan, timeline, frames, assets, styledPrompts: styled, fps: profile.fps });
  const sceneMappingPath = path.join(outputDir, `${params.attemptNumber}.scene-mapping.json`);
  await fs.writeFile(sceneMappingPath, JSON.stringify(sceneMapping, null, 2), 'utf-8');
  for (const scene of sceneMapping.scenes) if (scene.warning) console.warn(`[video_generation] ${scene.warning}`);
  const chapterPlans: ChapterSegmentPlan[] = params.chapters.map((_, ci) => ({
    chapterIndex: ci,
    scenes: timeline
      .filter((t) => t.chapterIndex === ci)
      .map((t) => ({ sceneIndex: t.sceneIndex, imagePath: assets[t.sceneIndex].imagePath,
        imageSha256: assets[t.sceneIndex].imageSha256, frames: frames[t.sceneIndex] })),
  }));
  const renderStartedAt = Date.now();
  const chapterPaths = await renderChapterSegments({
    chapters: chapterPlans,
    workDir: path.join(workDir, 'segments'),
    profile,
    onChapterDone: (ci, resumed) =>
      console.log(`[video_generation] run ${params.pipelineRunId}: chapter ${ci + 1}/${params.chapters.length} ${resumed ? 'already rendered (resumed)' : 'rendered'}`),
  });
  const { frameCount } = await joinAndMux({ chapterPaths, audioPath: mixed.audioPath, workDir, outputPath: videoPath });
  const durationSeconds = await probeSeconds(videoPath);
  console.log(
    `[video_generation] run ${params.pipelineRunId} attempt ${params.attemptNumber}: long-form render ${timeline.length} stills, ${durationSeconds.toFixed(1)}s of video in ${((Date.now() - renderStartedAt) / 1000).toFixed(0)}s`,
  );

  const ttsEntry = resolveMediaPurpose('tts', params.voice);
  const transcriptionEntry = resolveMediaPurpose('transcription');
  const stillsPaidUsd = Number(stills.costUsd);
  return {
    output: {
      videoPath,
      durationSeconds,
      aspectRatio: '16:9',
      plan: activePlan,
      videoKind: 'long',
      width: profile.width,
      height: profile.height,
      fps: profile.fps,
      frameCount,
      chapterTimings: narration.chapterTimings,
      subtitlesPath: srtPath,
      scriptWordCount,
      narrationSeconds: Number(narration.durationSeconds.toFixed(2)),
      measuredWordsPerMinute: pace,
    },
    usage: {
      provider: 'openai',
      model: `${ttsEntry.model}+${transcriptionEntry.model}`,
      characterCount: narration.ttsCharacters,
      audioDurationSeconds: narration.transcriptionSeconds,
      // Every paid call was booked as it happened; this summary row carries no cost of its own.
      costUsd: '0.000000',
      metadata: {
        videoKind: 'long',
        costsBookedSeparately: true,
        captionsEnabled: false,
        captionStyle: plan.captionStyle,
        visualSource: 'ai-stills',
        ...(shotPlan && { shotPlan }),
        aiVisualsProvider: stills.provider,
        aiVisualsModel: stills.model,
        aiVisualsStillCount: stills.imagePaths.length,
        ...((stills.skippedPromptCount ?? 0) > 0 && { aiVisualsSkippedStills: stills.skippedPromptCount }),
        aiVisualsCostUsd: stillsPaidUsd.toFixed(6),
        audioLayer: plan.audioLayer,
        ttsProvider: ttsEntry.provider,
        ttsModel: ttsEntry.model,
        ttsCharacterCount: narration.ttsCharacters,
        ttsCostUsd: narration.ttsCostUsd.toFixed(6),
        measuredWordsPerMinute: pace,
        narrationCostUsd: (narration.ttsCostUsd + narration.transcriptionCostUsd).toFixed(6),
        transcriptionProvider: transcriptionEntry.provider,
        transcriptionModel: transcriptionEntry.model,
        transcriptionAudioDurationSeconds: narration.transcriptionSeconds,
        transcriptionCostUsd: narration.transcriptionCostUsd.toFixed(6),
        ffmpegCostUsd: 0,
      },
    },
    artifacts: {
      ttsAudioPath: narration.audioPath,
      transcriptJsonPath: await writeTranscript(outputDir, params.attemptNumber, narration.words, narration.durationSeconds),
      planJsonPath: await writePlan(outputDir, params.attemptNumber, plan),
      sceneMappingPath,
      stillImagePaths: stills.imagePaths,
      ...(bedTracks && { audioBedPath: bedTracks[0].filePath }),
      ffmpegArgsJsonPath: await writeRenderNotes(outputDir, params.attemptNumber, { frames, chapterPaths, bedChain: mixed.bedChain, bedGainDb: mixed.bedGainDb }),
      srtPath,
      mixedAudioPath: mixed.audioPath,
      stubFlags: {
        media: env.MEDIA_STUB === '1',
        stockFootage: env.STOCK_FOOTAGE_STUB === '1',
        aiVisuals: env.AI_VISUALS_STUB === '1',
      },
    },
  };
}

async function writeTranscript(dir: string, attempt: number, words: unknown, audioDurationSeconds: number): Promise<string> {
  const p = path.join(dir, `${attempt}.transcript.json`);
  await fs.writeFile(p, JSON.stringify({ audioDurationSeconds, segments: words }, null, 2), 'utf-8');
  return p;
}

async function writePlan(dir: string, attempt: number, plan: ProductionPlan): Promise<string> {
  const p = path.join(dir, `${attempt}.plan.json`);
  await fs.writeFile(p, JSON.stringify(plan, null, 2), 'utf-8');
  return p;
}

// The long render is many small ffmpeg calls, so this notes the decisions instead of one command line.
async function writeRenderNotes(dir: string, attempt: number, notes: Record<string, unknown>): Promise<string> {
  const p = path.join(dir, `${attempt}.ffmpeg-args.json`);
  await fs.writeFile(p, JSON.stringify({ kind: 'long-form', ...notes }, null, 2), 'utf-8');
  return p;
}
