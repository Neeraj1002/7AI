import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { synthesizeSpeech, transcribe, type TranscriptSegment } from '../../media';
import { resolveMediaPurpose } from '../../media/registry';
import { searchStockFootage } from '../../stock-footage';
import { env } from '../../config/env';
import type { BrandAssets } from '../../types';
import { ProductionPlanSchema, type CaptionStyle, type ProductionPlan } from './plan';

// Video Generation agent — AGENT_FLEET_DESIGN.md Section 4.6. Deliberately
// the simplified approach (Section 14 of the roadmap): TTS voiceover + burned
// captions + real stock footage (Week 4 Task 1, Path A of
// docs/decisions/VIDEO_GENERATION_LOOP_AND_VISUAL_STRATEGY.md) + optional
// brand overlay, assembled with FFmpeg scripted directly — no generative AI
// video, no rendering SaaS, per Task 8's toolchain choice. The production
// plan (caption style, footage search terms) comes from plan.ts's LLM call,
// made by the caller (state-machine.ts) — this file is the deterministic
// assembly half only.

const execFileAsync = promisify(execFile);

export const VideoGenerationOutputSchema = z.object({
  videoPath: z.string().min(1),
  durationSeconds: z.number(),
  aspectRatio: z.string(),
  plan: ProductionPlanSchema.optional(),
});
export type VideoGenerationOutput = z.infer<typeof VideoGenerationOutputSchema>;

// One aggregated UsageEvent per invocation for the TTS+transcription+footage
// half (FFmpeg/Pexels cost $0) — docs/execution/week3/SCHEMA.md's "one row
// per agent invocation, not three" design. The production-planning LLM call
// is metered separately by the caller (its own agent='video-production-planning'
// row), since it's a distinct purpose or may be skipped entirely (test
// overrides) — see state-machine.ts's runVideoGenerationStage.
export type VideoGenerationUsage = {
  provider: string;
  model: string;
  characterCount: number;
  audioDurationSeconds: number;
  costUsd: string;
  metadata: {
    captionStyle: CaptionStyle;
    stockFootageProvider: string;
    stockFootageQuery: string;
    stockFootageSourceId: string;
    stockFootageCostUsd: string;
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

function formatSrtTimestamp(ms: number): string {
  const clamped = Math.max(0, ms);
  const h = Math.floor(clamped / 3_600_000);
  const m = Math.floor((clamped % 3_600_000) / 60_000);
  const s = Math.floor((clamped % 60_000) / 1000);
  const msRemainder = Math.floor(clamped % 1000);
  const pad = (n: number, len = 2) => n.toString().padStart(len, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(msRemainder, 3)}`;
}

function buildSrt(segments: TranscriptSegment[]): string {
  return segments
    .map(
      (seg, i) =>
        `${i + 1}\n${formatSrtTimestamp(seg.startMs)} --> ${formatSrtTimestamp(seg.endMs)}\n${seg.text}\n`,
    )
    .join('\n');
}

// Groups consecutive word-level segments into N-word caption cues.
function groupWordsByCount(segments: TranscriptSegment[], wordsPerGroup: number): TranscriptSegment[] {
  const groups: TranscriptSegment[] = [];
  for (let i = 0; i < segments.length; i += wordsPerGroup) {
    const slice = segments.slice(i, i + wordsPerGroup);
    if (slice.length === 0) continue;
    groups.push({
      text: slice.map((s) => s.text).join(' '),
      startMs: slice[0].startMs,
      endMs: slice[slice.length - 1].endMs,
    });
  }
  return groups;
}

// Groups words into a cue per sentence (ending on ./!/?), falling back to
// maxWordsPerGroup for long or unpunctuated runs so a cue never grows
// unbounded.
function groupWordsBySentence(segments: TranscriptSegment[], maxWordsPerGroup: number): TranscriptSegment[] {
  const groups: TranscriptSegment[] = [];
  let current: TranscriptSegment[] = [];
  for (const seg of segments) {
    current.push(seg);
    const endsSentence = /[.!?]$/.test(seg.text.trim());
    if (endsSentence || current.length >= maxWordsPerGroup) {
      groups.push({
        text: current.map((s) => s.text).join(' '),
        startMs: current[0].startMs,
        endMs: current[current.length - 1].endMs,
      });
      current = [];
    }
  }
  if (current.length > 0) {
    groups.push({
      text: current.map((s) => s.text).join(' '),
      startMs: current[0].startMs,
      endMs: current[current.length - 1].endMs,
    });
  }
  return groups;
}

// Caption grouping per the production plan's captionStyle (plan.ts) — this
// is the concrete mechanism Video Generation now has for a regen attempt to
// actually produce a different result, per
// docs/decisions/VIDEO_GENERATION_LOOP_AND_VISUAL_STRATEGY.md Section 2.
function buildCaptionSegments(segments: TranscriptSegment[], style: CaptionStyle): TranscriptSegment[] {
  switch (style) {
    case 'word-flash':
      return segments;
    case 'phrase-grouped':
      return groupWordsByCount(segments, 4);
    case 'sentence-grouped':
      return groupWordsBySentence(segments, 8);
    default: {
      const exhaustive: never = style;
      throw new Error(`Unknown caption style '${exhaustive as string}'`);
    }
  }
}

// Smaller cues (word-flash) read fine at a large size; multi-word cues need a
// smaller font to fit the 1080px-wide frame without wrapping awkwardly.
function captionFontSize(style: CaptionStyle): number {
  switch (style) {
    case 'word-flash':
      return 64;
    case 'phrase-grouped':
      return 48;
    case 'sentence-grouped':
      return 40;
    default: {
      const exhaustive: never = style;
      throw new Error(`Unknown caption style '${exhaustive as string}'`);
    }
  }
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
  plan: ProductionPlan;
}): Promise<VideoGenerationResult> {
  // The production plan (plan.ts, called by state-machine.ts before this
  // function) is what makes a regen attempt actually different now — the
  // caption style and stock-footage search terms both come from it, per
  // docs/decisions/VIDEO_GENERATION_LOOP_AND_VISUAL_STRATEGY.md Section 2.
  const tts = await synthesizeSpeech(params.scriptText, {});
  const asr = await transcribe(tts.audioPath);
  const clip = await searchStockFootage({ query: params.plan.stockFootageQuery, orientation: 'portrait' });

  const outputDir = path.resolve(process.cwd(), 'data', 'videos', params.pipelineRunId);
  await fs.mkdir(outputDir, { recursive: true });

  const srtFilename = `${params.attemptNumber}.srt`;
  const videoFilename = `${params.attemptNumber}.mp4`;
  const captionSegments = buildCaptionSegments(asr.segments, params.plan.captionStyle);
  await fs.writeFile(path.join(outputDir, srtFilename), buildSrt(captionSegments), 'utf-8');

  const watermarkPath = params.brandAssets.watermarkUrl;
  const hasLocalWatermark = Boolean(watermarkPath && fsSync.existsSync(watermarkPath));
  const fontSize = captionFontSize(params.plan.captionStyle);

  // Stock footage scaled/cropped to fill the 9:16 frame exactly (a Pexels
  // clip's native size rarely matches 1080x1920), looped if shorter than the
  // voiceover — `-shortest` still cuts the output to the audio's real
  // length, so looping never over-extends the video. Run from `outputDir` as
  // cwd so the caption file can be referenced by its plain filename,
  // avoiding FFmpeg's notoriously fiddly colon/backslash escaping for the
  // `subtitles` filter's path argument on Windows.
  const captionedFilter = `[0:v]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=increase,crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT},subtitles=${srtFilename}:force_style='Fontsize=${fontSize},PrimaryColour=&H00FFFFFF,Alignment=2,MarginV=200'`;
  const filterComplex = hasLocalWatermark
    ? `${captionedFilter}[captioned];[captioned][2:v]overlay=W-w-40:40[outv]`
    : `${captionedFilter}[outv]`;

  const ffmpegArgs = [
    '-y',
    '-stream_loop',
    '-1',
    '-i',
    clip.clipPath,
    '-i',
    tts.audioPath,
    ...(hasLocalWatermark ? ['-i', watermarkPath as string] : []),
    '-filter_complex',
    filterComplex,
    '-map',
    '[outv]',
    '-map',
    '1:a',
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
  const costUsd = (Number(tts.costUsd) + Number(asr.costUsd) + Number(clip.costUsd)).toFixed(6);

  return {
    output: {
      videoPath,
      durationSeconds,
      aspectRatio: '9:16',
      plan: params.plan,
    },
    usage: {
      provider: 'openai',
      model: `${ttsEntry.model}+${transcriptionEntry.model}`,
      characterCount: tts.characterCount,
      audioDurationSeconds: asr.audioDurationSeconds,
      costUsd,
      metadata: {
        captionStyle: params.plan.captionStyle,
        stockFootageProvider: 'pexels',
        stockFootageQuery: params.plan.stockFootageQuery,
        stockFootageSourceId: clip.sourceId,
        stockFootageCostUsd: clip.costUsd,
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
