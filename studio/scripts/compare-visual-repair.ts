// Offline synthetic continuity trial. No application boot, database or provider call.
// Run with local FFMPEG_PATH/FFPROBE_PATH set to installed binaries.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DATA_DIR } from '../src/config/paths';
import { env } from '../src/config/env';
import { buildEvidencePacket, factualBaseline } from '../src/content-evidence/packet';
import { allocateFrames, joinAndMux, renderChapterSegments } from '../src/agents/video-generation/long-render';
import { renderProfileFor } from '../src/agents/video-generation/render-profile';
import { qualityProfileFor } from '../src/agents/video-generation/quality-spec';
import { measureQualityMetrics } from '../src/agents/video-intelligence/quality-metrics';
import { createPreviewCopy } from '../src/long-form/preview';
import type { ProductionPlan } from '../src/agents/video-generation/plan';
import { prepareVisualRepair, saveRepairReceipt, sha256Bytes, type RepairReceipt, type SceneMapping } from '../src/run-pipeline/visual-repair';
import { executeVisualRepair } from '../src/run-pipeline/visual-repair-render';

const exec = promisify(execFile);
const root = path.join(DATA_DIR, 'task5-comparison-final2');
const runId = 'synthetic-continuity';
const outputDir = path.join(root, runId);
const assetsDir = path.join(root, 'approved-local-assets');
const profile = renderProfileFor('long');
const ffmpeg = async (args: string[]) => exec(env.FFMPEG_PATH, ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
const hashFile = async (file: string) => sha256Bytes(await fs.readFile(file));

async function main() {
  await fs.mkdir(path.join(outputDir, 'work', 'segments'), { recursive: true });
  await fs.mkdir(assetsDir, { recursive: true });
  const images = ['red-baseline.png', 'blue-defect.png', 'red-repair.png'].map(name => path.join(assetsDir, name));
  for (const [i, color] of ['red', 'blue', 'red'].entries()) {
    await ffmpeg(['-f', 'lavfi', '-i', `color=c=${color}:size=1536x1024:rate=1`,
      ...(i === 2 ? ['-vf', 'drawbox=x=530:y=260:w=470:h=440:color=white:t=fill'] : []),
      '-frames:v', '1', '-update', '1', images[i]]);
  }
  const audioPath = path.join(outputDir, 'work', 'mixed-1.m4a');
  await ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=4', '-c:a', 'aac', '-b:a', '192k', audioPath]);
  await fs.copyFile(audioPath, path.join(outputDir, 'work', 'narration-1.mp3'));
  await fs.writeFile(path.join(outputDir, '1.srt'), '1\n00:00:00,000 --> 00:00:04,000\nA recurring red subject crosses two beats.\n');
  await fs.writeFile(path.join(outputDir, '1.transcript.json'), JSON.stringify({ segments: [], audioDurationSeconds: 4 }));
  await fs.writeFile(path.join(outputDir, '1.ffmpeg-args.json'), JSON.stringify({ kind: 'synthetic-comparison' }));
  const plan: ProductionPlan = { visualSource: 'ai-stills', stockFootageQuery: 'red recurring subject',
    stillScenePrompts: ['red subject, first beat', 'blue subject, continuity defect'],
    longScenes: [{ chapterIndex: 0, words: 'recurring red', prompt: 'red subject, first beat' },
      { chapterIndex: 1, words: 'subject returns', prompt: 'blue subject, continuity defect' }],
    sceneMeanings: { version: 1, scenes: [
      { sceneId: '0:0', narrationSpan: { chapterIndex: 0, startWord: 0, endWordExclusive: 2 }, purpose: 'illustration' },
      { sceneId: '1:0', narrationSpan: { chapterIndex: 1, startWord: 0, endWordExclusive: 2 }, purpose: 'illustration' },
    ] }, captionStyle: 'sentence-grouped', audioLayer: 'none', pacingNotes: 'two fixed beats', rationale: 'synthetic continuity trial' };
  const frames = allocateFrames([2, 4], profile.fps);
  const imageHashes = await Promise.all(images.map(hashFile));
  const mapping: SceneMapping = { version: 1, fps: profile.fps,
    scenes: [0, 1].map(i => ({ sceneId: `${i}:0`, chapterIndex: i,
      imagePath: images[i], imageSha256: imageHashes[i],
      promptSha256: sha256Bytes(plan.longScenes![i].prompt), styledPromptSha256: sha256Bytes(plan.longScenes![i].prompt),
      sourceSceneId: `${i}:0`, substituted: false, frameStart: i ? frames[0] : 0,
      frameEndExclusive: i ? frames[0] + frames[1] : frames[0],
      startSec: i * 2, endSec: (i + 1) * 2, anchor: plan.longScenes![i].words })) };
  await fs.writeFile(path.join(outputDir, '1.scene-mapping.json'), JSON.stringify(mapping, null, 2));
  const beforeSegments = await renderChapterSegments({ chapters: [0, 1].map(i => ({ chapterIndex: i,
    scenes: [{ sceneIndex: i, imagePath: images[i], imageSha256: imageHashes[i], frames: frames[i] }] })),
    workDir: path.join(outputDir, 'work', 'segments'), profile });
  const baselinePath = path.join(outputDir, '1.mp4');
  const baselineMux = await joinAndMux({ chapterPaths: beforeSegments, audioPath,
    workDir: path.join(outputDir, 'work'), outputPath: baselinePath });
  const fact = factualBaseline(buildEvidencePacket({ briefText: 'A recurring red subject appears in both beats.',
    factPolicy: 'brief-only' }), 'A recurring red subject appears in both beats.');
  const baselineOutput = { videoPath: baselinePath, durationSeconds: 4, aspectRatio: '16:9',
    plan, videoKind: 'long' as const, width: profile.width, height: profile.height, fps: profile.fps,
    frameCount: baselineMux.frameCount, chapterTimings: [{ title: 'one', startSec: 0, endSec: 2 },
      { title: 'two', startSec: 2, endSec: 4 }], subtitlesPath: path.join(outputDir, '1.srt') };
  const repairInput = { runId, baselineAttempt: 1, repairAttempt: 2,
    previousInput: { factualBaseline: fact, resolvedVoice: 'synthetic-fixed-audio' },
    currentInput: { factualBaseline: fact, resolvedVoice: 'synthetic-fixed-audio' },
    previousOutput: baselineOutput,
    defect: { sceneId: '1:0', timestampSeconds: 3, kind: 'continuity' as const,
      reason: 'second beat changes the recurring red subject to blue', requiredVisualConstraints: ['retain red color'] },
    rootDir: root };
  const validUnchangedChapter = await fs.readFile(beforeSegments[0]);
  let corruptChapterRejected = false;
  try {
    await fs.writeFile(beforeSegments[0], 'nonempty but undecodable chapter');
    await prepareVisualRepair(repairInput);
  } catch (error) {
    corruptChapterRejected = error instanceof Error && /cached chapter cannot be decoded/.test(error.message);
  } finally {
    await fs.writeFile(beforeSegments[0], validUnchangedChapter);
  }
  if (!corruptChapterRejected) throw new Error('corrupt unchanged chapter cache was accepted');
  const prepared = await prepareVisualRepair(repairInput);
  // Simulate a process stopping after durable intent, before replacement.
  await saveRepairReceipt(prepared.receiptPath, prepared.receipt);
  let replacementCalls = 0;
  const repaired = await executeVisualRepair({ prepared, baselineOutput, sceneStyle: {}, allowedAssetRoot: root,
    replacement: async () => { replacementCalls++; return { path: images[2], provider: 'approved-local',
      model: 'none', costUsd: 0, cached: true }; } });
  const firstVariantSha = await hashFile(repaired.output.videoPath);
  // Simulate stopping after the replacement and chapter render, before the
  // final receipt. Recovery must neither call the replacement source again
  // nor change the finished video bytes.
  const saved = JSON.parse(await fs.readFile(prepared.receiptPath, 'utf8')) as RepairReceipt;
  await saveRepairReceipt(prepared.receiptPath, { ...saved, status: 'replacement-ready', videoSha256: undefined });
  let restartReplacementCalls = 0;
  await executeVisualRepair({ prepared, baselineOutput, sceneStyle: {}, allowedAssetRoot: root,
    replacement: async () => { restartReplacementCalls++; throw new Error('replacement must be reused'); } });
  if (await hashFile(repaired.output.videoPath) !== firstVariantSha) throw new Error('restart changed the rendered video');
  const afterSegments = await fs.readdir(path.join(outputDir, 'work', 'segments'));
  const metrics = await Promise.all([baselinePath, repaired.output.videoPath].map(videoPath => measureQualityMetrics({
    videoPath, captionsEnabled: false, visualSource: 'ai-stills',
    profile: { ...qualityProfileFor('long'), minDurationSec: null },
  })));
  const previews = await Promise.all([baselinePath, repaired.output.videoPath].map(createPreviewCopy));
  const summary = { fixture: 'synthetic colors; mechanics only, no production creative claim',
    baselinePath, variantPath: repaired.output.videoPath, receiptPath: prepared.receiptPath,
    selectedSceneId: prepared.receipt.sceneId, unchangedChapter: beforeSegments[0],
    unchangedChapterSha256: await hashFile(beforeSegments[0]),
    changedChapter: afterSegments.filter(name => name.startsWith('chapter-1-')),
    baselineSha256: await hashFile(baselinePath), variantSha256: await hashFile(repaired.output.videoPath),
    baselinePreview: previews[0], variantPreview: previews[1],
    baselinePreviewSha256: await hashFile(previews[0]), variantPreviewSha256: await hashFile(previews[1]),
    audioSha256: await hashFile(audioPath), subtitlesSha256: await hashFile(path.join(outputDir, '1.srt')),
    baselineFrames: baselineMux.frameCount, variantFrames: repaired.output.frameCount,
    replacementCalls, restartReplacementCalls, corruptChapterRejected,
    paidCalls: 0, incrementalCostUsd: '0.000000',
    metrics: metrics.map(m => ({ width: m.width, height: m.height, fps: m.fps,
      videoCodec: m.videoCodec, pixFmt: m.pixFmt, hasAudio: m.hasAudio, shotCount: m.shotCount })),
  };
  const summaryPath = path.join(root, 'comparison-summary.json');
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
  process.stdout.write(`${summaryPath}\n`);
}
main().catch(error => { process.stderr.write(`${error instanceof Error ? error.stack : error}\n`); process.exitCode = 1; });
