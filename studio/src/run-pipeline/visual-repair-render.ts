import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env';
import { DATA_DIR } from '../config/paths';
import { renderProfileFor } from '../agents/video-generation/render-profile';
import { buildStyledScenePrompts, type SceneStyle } from '../agents/video-generation/scene-prompts';
import { joinAndMux, probeSeconds, renderChapterSegments, type ChapterSegmentPlan } from '../agents/video-generation/long-render';
import type { ProductionPlan } from '../agents/video-generation/plan';
import type { VideoGenerationResult } from '../agents/video-generation';
import { NonTransientStageError } from './retry-with-backoff';
import { assertActualUnder, inspectImage, recoverRepairReceipt, saveRepairReceipt, sha256Bytes,
  type PreparedRepair, type RepairReceipt } from './visual-repair';

type Replacement = { path: string; provider: string; model: string; costUsd: number; cached: boolean };
export type ExecuteRepairParams = {
  prepared: PreparedRepair;
  baselineOutput: VideoGenerationResult['output'];
  sceneStyle: SceneStyle;
  replacement: (styledPrompt: string, sceneIndex: number) => Promise<Replacement>;
  guard?: () => Promise<void>;
  onReceipt?: (receipt: RepairReceipt) => Promise<void>;
  inspect?: typeof inspectImage;
  allowedAssetRoot?: string;
};

export async function executeVisualRepair(params: ExecuteRepairParams): Promise<VideoGenerationResult> {
  const { prepared } = params;
  const { receiptPath, outputDir, mapping } = prepared;
  const inspect = params.inspect ?? inspectImage;
  const baseline = prepared.receipt.baseline;
  const assetRoot = params.allowedAssetRoot ?? DATA_DIR;
  const verifyFile = async (file: string, expected: string, label: string) => {
    const resolved = await assertActualUnder(assetRoot, file);
    if (sha256Bytes(await fs.readFile(resolved)) !== expected) {
      throw new NonTransientStageError(`Visual repair baseline ${label} changed after eligibility check`);
    }
  };
  await verifyFile(params.baselineOutput.videoPath, baseline.videoSha256, 'video');
  await verifyFile(path.join(outputDir, `${prepared.receipt.baselineAttempt}.scene-mapping.json`),
    baseline.mappingSha256, 'scene mapping');
  await verifyFile(prepared.audioPath, baseline.audioSha256, 'mixed audio');
  await verifyFile(prepared.subtitlesPath, baseline.subtitlesSha256, 'subtitles');
  await verifyFile(prepared.transcriptPath, baseline.transcriptSha256, 'transcript');
  for (const scene of mapping.scenes) {
    const image = await assertActualUnder(assetRoot, scene.imagePath);
    if (await inspect(image, { width: 1536, height: 1024 }) !== scene.imageSha256) {
      throw new NonTransientStageError(`Visual repair baseline image changed after eligibility check: ${scene.sceneId}`);
    }
  }
  const sceneIndex = mapping.scenes.findIndex(s => s.sceneId === prepared.receipt.sceneId);
  if (sceneIndex < 0) throw new NonTransientStageError('Repair scene disappeared from baseline mapping');
  const baselineScene = mapping.scenes[sceneIndex];
  const oldPlan = params.baselineOutput.plan;
  if (!oldPlan?.longScenes) throw new NonTransientStageError('Repair baseline plan is absent');
  const oldScenes = oldPlan.longScenes;
  const newScenes = oldScenes.map((s, i) => i === sceneIndex
      ? { ...s, prompt: `${s.prompt}\nContinuity repair for this scene only: ${prepared.receipt.defect.requiredVisualConstraints.join('; ')}. ${prepared.receipt.defect.reason}` }
      : s);
  const plan: ProductionPlan = { ...oldPlan, longScenes: newScenes,
    stillScenePrompts: newScenes.map(s => s.prompt) };
  const styledPrompt = buildStyledScenePrompts([plan.longScenes![sceneIndex].prompt], params.sceneStyle)[0];
  let receipt = await recoverRepairReceipt(receiptPath, prepared.receipt);
  if (receipt.status === 'intent') {
    await params.guard?.();
    await saveRepairReceipt(receiptPath, receipt);
    await params.onReceipt?.(receipt);
    const made = await params.replacement(styledPrompt, sceneIndex);
    const replacementPath = await assertActualUnder(params.allowedAssetRoot ?? DATA_DIR, made.path);
    const replacementSha = await inspect(replacementPath, { width: 1536, height: 1024 });
    if (replacementSha === baselineScene.imageSha256) throw new NonTransientStageError('Repair replacement is identical to the rejected baseline scene');
    receipt = { ...receipt, status: 'replacement-ready',
      replacement: { path: replacementPath, sha256: replacementSha, provider: made.provider,
        costUsd: made.cached ? 0 : made.costUsd } };
    await saveRepairReceipt(receiptPath, receipt);
    await params.onReceipt?.(receipt);
  }
  const replacement = receipt.replacement;
  if (!replacement) throw new NonTransientStageError('Repair receipt has no replacement asset');
  const replacementPath = await assertActualUnder(params.allowedAssetRoot ?? DATA_DIR, replacement.path);
  if (await inspect(replacementPath, { width: 1536, height: 1024 }) !== replacement.sha256) {
    throw new NonTransientStageError('Repair replacement was changed or corrupted after checkpoint');
  }
  await params.guard?.();
  // Task 3's chapter signature includes content SHA-256, so only the selected
  // chapter is rebuilt; existing unaffected chapter segments retain identity.
  const profile = renderProfileFor('long');
  const repairedMapping = { ...mapping, scenes: mapping.scenes.map((scene, i) => i === sceneIndex
    ? { ...scene, imagePath: replacementPath, imageSha256: replacement.sha256,
      sourceSceneId: scene.sceneId, substituted: false,
      promptSha256: sha256Bytes(plan.longScenes![i].prompt), styledPromptSha256: sha256Bytes(styledPrompt) }
    : scene) };
  const chapters = [...new Set(mapping.scenes.map(s => s.chapterIndex))].map(chapterIndex => ({
    chapterIndex,
    scenes: repairedMapping.scenes.flatMap((scene, i) => scene.chapterIndex === chapterIndex
      ? [{ sceneIndex: i, imagePath: scene.imagePath, imageSha256: scene.imageSha256,
        frames: scene.frameEndExclusive - scene.frameStart }]
      : []),
  })) satisfies ChapterSegmentPlan[];
  const chapterPaths = await renderChapterSegments({ chapters,
    workDir: path.join(outputDir, 'work', 'segments'), profile });
  const videoPath = path.join(outputDir, `${receipt.repairAttempt}.mp4`);
  const { frameCount } = await joinAndMux({ chapterPaths, audioPath: prepared.audioPath,
    workDir: path.join(outputDir, 'work'), outputPath: videoPath });
  if (frameCount !== mapping.scenes[mapping.scenes.length - 1].frameEndExclusive) {
    throw new NonTransientStageError('Repair changed total frame count');
  }
  const durationSeconds = await probeSeconds(videoPath);
  const mappingPath = path.join(outputDir, `${receipt.repairAttempt}.scene-mapping.json`);
  const planPath = path.join(outputDir, `${receipt.repairAttempt}.plan.json`);
  await fs.writeFile(mappingPath, JSON.stringify(repairedMapping, null, 2));
  await fs.writeFile(planPath, JSON.stringify(plan, null, 2));
  receipt = { ...receipt, status: 'rendered', videoSha256: sha256Bytes(await fs.readFile(videoPath)) };
  await saveRepairReceipt(receiptPath, receipt);
  await params.onReceipt?.(receipt);
  const subtitlesPath = prepared.subtitlesPath;
  return {
    output: { ...params.baselineOutput, videoPath, durationSeconds, frameCount, plan, subtitlesPath },
    usage: { provider: 'reuse', model: 'visual-repair', characterCount: 0, audioDurationSeconds: 0,
      costUsd: '0.000000', metadata: { captionsEnabled: false, captionStyle: plan.captionStyle,
        visualSource: 'ai-stills', aiVisualsProvider: replacement.provider,
        aiVisualsModel: 'visual-repair', aiVisualsStillCount: 1,
        aiVisualsCostUsd: replacement.costUsd.toFixed(6), videoKind: 'long', costsBookedSeparately: true,
        audioLayer: plan.audioLayer, ttsProvider: 'reuse', ttsModel: 'reuse',
        ttsCharacterCount: 0, ttsCostUsd: '0.000000', transcriptionProvider: 'reuse',
        transcriptionModel: 'reuse', transcriptionAudioDurationSeconds: 0,
        transcriptionCostUsd: '0.000000', ffmpegCostUsd: 0 } },
    artifacts: { ttsAudioPath: path.join(outputDir, 'work', `narration-${receipt.baselineAttempt}.mp3`),
      transcriptJsonPath: prepared.transcriptPath, planJsonPath: planPath,
      sceneMappingPath: mappingPath, stillImagePaths: repairedMapping.scenes.map(s => s.imagePath),
      ffmpegArgsJsonPath: path.join(outputDir, `${receipt.baselineAttempt}.ffmpeg-args.json`),
      srtPath: subtitlesPath, mixedAudioPath: prepared.audioPath,
      stubFlags: { media: env.MEDIA_STUB === '1', stockFootage: env.STOCK_FOOTAGE_STUB === '1',
        aiVisuals: env.AI_VISUALS_STUB === '1' } },
  };
}
