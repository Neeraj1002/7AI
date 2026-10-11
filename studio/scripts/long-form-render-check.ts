// Sprint 4 Task 9: operator tool. Renders a long-form video from fixed chapters through the real
// ffmpeg pipeline (generateLongVideo) and prints the measurements the task asks for: duration vs
// narration, resolution, fps, frame count, LUFS, SRT parse-back. Run it with the stubs on
// (MEDIA_STUB=1 AI_VISUALS_STUB=1) to check the render without spending anything:
//   MEDIA_STUB=1 AI_VISUALS_STUB=1 npx tsx scripts/long-form-render-check.ts [chapters=4] [wordsPerChapter=80]
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import { generateLongVideo } from '../src/agents/video-generation/long-form';
import { measureQualityMetrics } from '../src/agents/video-intelligence/quality-metrics';
import { parseSrt } from '../src/agents/video-generation/subtitles-srt';
import { joinChapterTexts } from '../src/agents/script-generation/long-form';
import { env } from '../src/config/env';
import { removeRunWorkFiles } from '../src/ai-visuals/cache';

const execFileAsync = promisify(execFile);

async function main(): Promise<void> {
  const chapterCount = Number(process.argv[2] ?? 4);
  const words = Number(process.argv[3] ?? 80);
  const sentence = 'The old bridge was built in 1412 and it still carries every load that crosses it today.';
  const chapters = Array.from({ length: chapterCount }, (_, i) => ({
    title: `Chapter ${i + 1}`,
    text: Array.from({ length: Math.ceil(words / 17) }, () => sentence).join(' '),
  }));
  const runId = `check-${Date.now()}`;
  const scenes = chapters.flatMap((c, ci) =>
    Array.from({ length: 4 }, (_, k) => ({ chapterIndex: ci, words: k === 0 ? c.text.split(' ').slice(0, 5).join(' ') : 'The old bridge was built', prompt: `Scene ${ci} ${k} stone bridge view` })),
  );
  const started = Date.now();
  const result = await generateLongVideo({
    pipelineRunId: runId,
    attemptNumber: 1,
    chapters,
    plan: {
      visualSource: 'ai-stills',
      stockFootageQuery: 'bridge',
      stillScenePrompts: scenes.map((s) => s.prompt),
      longScenes: scenes,
      captionStyle: 'sentence-grouped',
      audioLayer: 'calm',
      pacingNotes: 'check',
      rationale: 'check',
    },
  });
  const out = result.output;
  const metrics = await measureQualityMetrics({ videoPath: out.videoPath, captionsEnabled: false, visualSource: 'ai-stills', videoKind: 'long' });
  const srt = parseSrt(await fs.readFile(out.subtitlesPath as string, 'utf-8'));
  const { stdout } = await execFileAsync(env.FFPROBE_PATH, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', result.artifacts.ttsAudioPath]);
  const narration = parseFloat(stdout.trim());
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  console.log(JSON.stringify({
    seconds: (Date.now() - started) / 1000,
    video: { duration: out.durationSeconds, width: metrics.width, height: metrics.height, fps: metrics.fps, frames: out.frameCount, expectedFrames: Math.round(out.durationSeconds * 30) },
    narrationSeconds: narration,
    durationVsNarrationPct: ((out.durationSeconds - narration) / narration) * 100,
    lufs: metrics.integratedLufs,
    truePeak: metrics.truePeakDb,
    srtCues: srt.cues.length,
    srtTextMatches: norm(srt.cues.map((c) => c.text).join(' ')) === norm(joinChapterTexts(chapters)),
    chapterTimings: out.chapterTimings,
  }, null, 2));
  await removeRunWorkFiles(runId);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
