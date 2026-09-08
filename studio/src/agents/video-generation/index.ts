import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { synthesizeSpeech, transcribe, type TranscriptSegment } from '../../media';
import { resolveMediaPurpose } from '../../media/registry';
import { env } from '../../config/env';
import type { BrandAssets } from '../../types';

// Video Generation agent — AGENT_FLEET_DESIGN.md Section 4.6. Deliberately
// the simplified approach (Section 14 of the roadmap): TTS voiceover + burned
// word-level captions + a template/solid background + optional brand overlay,
// assembled with FFmpeg scripted directly — no generative AI video, no
// rendering SaaS, per Task 8's toolchain choice.

const execFileAsync = promisify(execFile);

export const VideoGenerationOutputSchema = z.object({
  videoPath: z.string().min(1),
  durationSeconds: z.number(),
  aspectRatio: z.string(),
});
export type VideoGenerationOutput = z.infer<typeof VideoGenerationOutputSchema>;

// One aggregated UsageEvent per invocation (TTS + transcription costs summed,
// FFmpeg cost $0) — docs/execution/week3/SCHEMA.md's "one row per agent
// invocation, not three" design. provider/model on the aggregated row are a
// composite ("tts-1-hd+whisper-1") since two different (provider, model)
// pairs contributed; the full breakdown lives in `metadata`.
export type VideoGenerationUsage = {
  provider: string;
  model: string;
  characterCount: number;
  audioDurationSeconds: number;
  costUsd: string;
  metadata: {
    ttsProvider: string;
    ttsModel: string;
    ttsCharacterCount: number;
    ttsCostUsd: string;
    transcriptionProvider: string;
    transcriptionModel: string;
    transcriptionAudioDurationSeconds: number;
    transcriptionCostUsd: string;
    ffmpegCostUsd: 0;
  };
};

export type VideoGenerationResult = {
  output: VideoGenerationOutput;
  usage: VideoGenerationUsage;
};

const VIDEO_WIDTH = 1080;
const VIDEO_HEIGHT = 1920;
const BACKGROUND_COLOR = '0x1a1a2e';

function formatSrtTimestamp(ms: number): string {
  const clamped = Math.max(0, ms);
  const h = Math.floor(clamped / 3_600_000);
  const m = Math.floor((clamped % 3_600_000) / 60_000);
  const s = Math.floor((clamped % 60_000) / 1000);
  const msRemainder = Math.floor(clamped % 1000);
  const pad = (n: number, len = 2) => n.toString().padStart(len, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(msRemainder, 3)}`;
}

// One SRT cue per word — a "flashing word" caption style, which is both the
// simplest possible burn-in and a natural fit for word-level timestamps
// (Task 8's explicit requirement for "captions land on the right word").
function buildWordLevelSrt(segments: TranscriptSegment[]): string {
  return segments
    .map(
      (seg, i) =>
        `${i + 1}\n${formatSrtTimestamp(seg.startMs)} --> ${formatSrtTimestamp(seg.endMs)}\n${seg.text}\n`,
    )
    .join('\n');
}

async function probeDurationSeconds(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync(env.FFPROBE_PATH, [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  return parseFloat(stdout.trim());
}

export async function generateVideo(params: {
  pipelineRunId: string;
  attemptNumber: number;
  scriptText: string;
  brandAssets: BrandAssets;
  fixNotes?: string;
}): Promise<VideoGenerationResult> {
  // `fixNotes` (from a failed Video Intelligence pass or a founder's Gate 2
  // revision notes) is recorded on the stage input for traceability. Video
  // Generation doesn't rewrite the sanctioned script itself — Script
  // Generation/Gate 1 already own that — so at MVP scale a regen attempt's
  // real value is "try the same script again" (a fresh TTS take can render
  // differently), not automated interpretation of free-text notes.
  const tts = await synthesizeSpeech(params.scriptText, {});
  const asr = await transcribe(tts.audioPath);

  const outputDir = path.resolve(process.cwd(), 'data', 'videos', params.pipelineRunId);
  await fs.mkdir(outputDir, { recursive: true });

  const srtFilename = `${params.attemptNumber}.srt`;
  const videoFilename = `${params.attemptNumber}.mp4`;
  await fs.writeFile(path.join(outputDir, srtFilename), buildWordLevelSrt(asr.segments), 'utf-8');

  const watermarkPath = params.brandAssets.watermarkUrl;
  const hasLocalWatermark = Boolean(watermarkPath && fsSync.existsSync(watermarkPath));

  // Background + audio, burned captions, optional watermark overlay — run
  // from `outputDir` as cwd so the caption file can be referenced by its
  // plain filename, avoiding FFmpeg's notoriously fiddly colon/backslash
  // escaping for the `subtitles` filter's path argument on Windows.
  const filterGraph = hasLocalWatermark
    ? `[0:v]subtitles=${srtFilename}:force_style='Fontsize=64,PrimaryColour=&H00FFFFFF,Alignment=2,MarginV=200'[captioned];[captioned][2:v]overlay=W-w-40:40[outv]`
    : `subtitles=${srtFilename}:force_style='Fontsize=64,PrimaryColour=&H00FFFFFF,Alignment=2,MarginV=200'`;

  const ffmpegArgs = [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `color=c=${BACKGROUND_COLOR}:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:d=${asr.audioDurationSeconds}`,
    '-i',
    tts.audioPath,
    ...(hasLocalWatermark ? ['-i', watermarkPath as string] : []),
    ...(hasLocalWatermark ? ['-filter_complex', filterGraph, '-map', '[outv]', '-map', '1:a'] : ['-vf', filterGraph]),
    '-c:v',
    'libx264',
    '-c:a',
    'aac',
    '-shortest',
    videoFilename,
  ];

  await execFileAsync(env.FFMPEG_PATH, ffmpegArgs, { cwd: outputDir });

  const videoPath = path.join(outputDir, videoFilename);
  const durationSeconds = await probeDurationSeconds(videoPath);

  const ttsEntry = resolveMediaPurpose('tts');
  const transcriptionEntry = resolveMediaPurpose('transcription');
  const costUsd = (Number(tts.costUsd) + Number(asr.costUsd)).toFixed(6);

  return {
    output: {
      videoPath,
      durationSeconds,
      aspectRatio: '9:16',
    },
    usage: {
      provider: 'openai',
      model: `${ttsEntry.model}+${transcriptionEntry.model}`,
      characterCount: tts.characterCount,
      audioDurationSeconds: asr.audioDurationSeconds,
      costUsd,
      metadata: {
        ttsProvider: ttsEntry.provider,
        ttsModel: ttsEntry.model,
        ttsCharacterCount: tts.characterCount,
        ttsCostUsd: tts.costUsd,
        transcriptionProvider: transcriptionEntry.provider,
        transcriptionModel: transcriptionEntry.model,
        transcriptionAudioDurationSeconds: asr.audioDurationSeconds,
        transcriptionCostUsd: asr.costUsd,
        ffmpegCostUsd: 0,
      },
    },
  };
}
