import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { synthesizeSpeech, transcribe, type TranscriptSegment } from '../../media';
import { resolveMediaPurpose } from '../../media/registry';
import { searchStockFootage } from '../../stock-footage';
import { generateStills } from '../../ai-visuals';
import { pickAudioBedTrack } from '../../audio-bed';
import { env } from '../../config/env';
import { NonTransientStageError } from '../../run-pipeline/retry-with-backoff';
import type { BrandAssets } from '../../types';
import { ProductionPlanSchema, type AudioLayer, type CaptionStyle, type ProductionPlan } from './plan';
import { DATA_DIR } from '../../config/paths';
import { QUALITY_SPEC } from './quality-spec';

// Video Generation agent — AGENT_FLEET_DESIGN.md Section 4.6. TTS voiceover +
// burned captions + a real visual source, assembled with FFmpeg scripted
// directly — no rendering SaaS, per Task 8's toolchain choice. Two visual
// sources as of Sprint 2 Task 2 (E2): real stock footage (Week 4 Task 1,
// Path A of docs/decisions/VIDEO_GENERATION_LOOP_AND_VISUAL_STRATEGY.md,
// still the default) and AI-generated stills animated Ken-Burns-style (Path
// B, studio/src/ai-visuals/) — full generative AI video is deliberately not
// a third option, see KNOWN_ISSUES_AND_BLOCKERS.md §6. The production plan
// (visual source, caption style, footage/scene prompts) comes from plan.ts's
// LLM call, made by the caller (state-machine.ts) — this file is the
// deterministic assembly half only.

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
    captionsEnabled: boolean;
    captionStyle: CaptionStyle;
    // Sprint 2 Task 2 (E2) — always present; which of the two groups below
    // is populated depends on it.
    visualSource: 'stock-footage' | 'ai-stills';
    // 'stock-footage' only.
    stockFootageProvider?: string;
    stockFootageQuery?: string;
    stockFootageSourceId?: string;
    stockFootageCostUsd?: string;
    // 'ai-stills' only.
    aiVisualsProvider?: string;
    aiVisualsModel?: string;
    aiVisualsStillCount?: number;
    aiVisualsCostUsd?: string;
    // Sprint 2 Task 3 (F1) — always present ('none' is a real, valid value,
    // not an absent field). No real cost: the audio-bed library is local
    // and free, unlike every other per-run media cost here.
    audioLayer: AudioLayer;
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

const VIDEO_WIDTH = QUALITY_SPEC.video.width;
const VIDEO_HEIGHT = QUALITY_SPEC.video.height;
const VIDEO_FPS = QUALITY_SPEC.video.fps;
// Sprint 2 Task 3 (F1) — deliberately low relative to the voiceover's
// implicit weight of 1, so the bed stays a background layer, never
// competing with narration intelligibility.
const AUDIO_BED_MIX_WEIGHT = 0.18;

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

// Sprint 2 Task 2 (E1/E2) — distributes N stills across the caption cues
// already computed from the TTS transcript, so a still transition lands
// exactly on a caption-cue boundary rather than mid-cue. Pure and
// input-only (no DB, no I/O), exported for direct unit testing.
//
// If there are more stills than cues, the excess stills are simply unused
// (one cue can't meaningfully be split across multiple stills without
// timing data finer than word-level ASR gives us) — a still-count decision
// this far off from the script's real cue count is an LLM-planning quality
// issue, not something this function should paper over by inventing
// sub-cue timing. If there are no cues at all (e.g. captionsEnabled path
// never applies, or ASR returned nothing), falls back to equal-duration
// time slices over the full audio.
export function distributeStillWindows(params: {
  captionCues: TranscriptSegment[];
  stillCount: number;
  totalDurationMs: number;
}): Array<{ startMs: number; endMs: number }> {
  const stillCount = Math.max(1, params.stillCount);

  if (params.captionCues.length === 0) {
    const sliceMs = params.totalDurationMs / stillCount;
    return Array.from({ length: stillCount }, (_, i) => ({
      startMs: Math.round(i * sliceMs),
      endMs: Math.round((i + 1) * sliceMs),
    }));
  }

  const effectiveCount = Math.min(stillCount, params.captionCues.length);
  const windows: Array<{ startMs: number; endMs: number }> = [];
  for (let i = 0; i < effectiveCount; i += 1) {
    const startIdx = Math.floor((i * params.captionCues.length) / effectiveCount);
    const endIdx = Math.max(startIdx, Math.floor(((i + 1) * params.captionCues.length) / effectiveCount) - 1);
    windows.push({ startMs: params.captionCues[startIdx].startMs, endMs: params.captionCues[endIdx].endMs });
  }

  // The first/last window always spans the full real audio duration,
  // regardless of ASR's first/last word timestamps — so the assembled
  // stills video always covers exactly [0, totalDurationMs], never leaving
  // a silent gap for -shortest to expose.
  windows[0].startMs = 0;
  windows[windows.length - 1].endMs = Math.max(windows[windows.length - 1].endMs, params.totalDurationMs);
  return windows;
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

const KEN_BURNS_FPS = 30;
const KEN_BURNS_MAX_ZOOM = 1.3;
const KEN_BURNS_ZOOM_STEP = 0.0015;
// 2x the 1080x1920 target — real headroom for the max 1.3x zoom without
// zoompan visibly softening, while staying a fixed, modest size regardless
// of the source still's own resolution.
const KEN_BURNS_PRESCALE_WIDTH = VIDEO_WIDTH * 2;
const KEN_BURNS_PRESCALE_HEIGHT = VIDEO_HEIGHT * 2;

function escapeConcatListPath(p: string): string {
  // ffmpeg's concat-demuxer list format: single-quoted paths, an embedded
  // single quote escaped as '\''.
  return p.replace(/'/g, "'\\''");
}

// Sprint 2 Task 2 (E1) — assembles N stills into ONE silent base video: each
// still becomes its own independently-encoded Ken Burns (zoompan) segment,
// then all segments are joined via ffmpeg's concat DEMUXER (a fast stream
// copy, not a re-encode). Output feeds into the exact same downstream
// scale/crop/subtitles/watermark/audio-mux pipeline a stock-footage clip
// already goes through — everything past "a clip is ready" stays shared,
// not duplicated per visual-source branch.
//
// Deliberately NOT one giant `-filter_complex` with N looped inputs feeding
// a single zoompan+concat filter graph — an earlier version of this
// function did exactly that and it was a real, live-verified bug: combining
// `-loop 1 -t <duration>` (which already emits <duration>*fps duplicate
// input frames) with zoompan's own `d=<duration*fps>` (which expands EACH
// incoming frame into `d` more output frames) multiplies frame count
// instead of adding it — a 3-second segment silently became tens of
// thousands of frames, taking hours and producing a many-hundred-MB file
// for what should be a ~50-second video. The per-segment approach avoids
// this entirely: each segment's own `-t` bounds its encoded OUTPUT length
// directly (not the zoompan input), so there is exactly one multiplication,
// not two.
async function buildKenBurnsVideo(params: {
  stills: Array<{ imagePath: string; durationSeconds: number }>;
  outputPath: string;
}): Promise<void> {
  const prescaledPaths: string[] = [];
  const segmentPaths: string[] = [];
  const concatListPath = `${params.outputPath}.concat-list.txt`;

  try {
    for (let i = 0; i < params.stills.length; i += 1) {
      const still = params.stills[i];

      // Pre-scale to a fixed, modest size ONCE — real headroom for the zoom
      // without zoompan visibly softening, while staying cheap regardless
      // of the source still's own resolution.
      const prescaledPath = `${params.outputPath}.prescaled-${i}.png`;
      await execFileAsync(env.FFMPEG_PATH, [
        '-y',
        '-i',
        still.imagePath,
        '-vf',
        `scale=${KEN_BURNS_PRESCALE_WIDTH}:${KEN_BURNS_PRESCALE_HEIGHT}:force_original_aspect_ratio=increase,crop=${KEN_BURNS_PRESCALE_WIDTH}:${KEN_BURNS_PRESCALE_HEIGHT}`,
        prescaledPath,
      ]);
      prescaledPaths.push(prescaledPath);

      // A single looping input (no `-t` on the input itself — that's what
      // caused the double-multiplication above), zoompan's own `d=` picks
      // exactly this many frames out of it, and the encode's own `-t`
      // trims the OUTPUT to this still's real on-screen duration.
      const segmentPath = `${params.outputPath}.segment-${i}.mp4`;
      const frames = Math.max(1, Math.round(still.durationSeconds * KEN_BURNS_FPS));
      await execFileAsync(env.FFMPEG_PATH, [
        '-y',
        '-loop',
        '1',
        '-i',
        prescaledPath,
        '-vf',
        `zoompan=z='min(zoom+${KEN_BURNS_ZOOM_STEP},${KEN_BURNS_MAX_ZOOM})':d=${frames}:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:fps=${KEN_BURNS_FPS}`,
        '-t',
        still.durationSeconds.toFixed(3),
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-pix_fmt',
        'yuv420p',
        segmentPath,
      ]);
      segmentPaths.push(segmentPath);
    }

    const concatList = segmentPaths.map((p) => `file '${escapeConcatListPath(p)}'`).join('\n');
    await fs.writeFile(concatListPath, concatList, 'utf-8');
    await execFileAsync(env.FFMPEG_PATH, [
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatListPath,
      '-c',
      'copy',
      params.outputPath,
    ]);
  } finally {
    // Intermediate artifacts, not needed once the concatenated video exists
    // (or the attempt failed) — cleaned up either way, not left to
    // accumulate in data/videos/ across attempts/regens.
    await Promise.all(
      [...prescaledPaths, ...segmentPaths, concatListPath].map((p) => fs.unlink(p).catch(() => undefined)),
    );
  }
}

export async function generateVideo(params: {
  pipelineRunId: string;
  attemptNumber: number;
  scriptText: string;
  brandAssets: BrandAssets;
  plan: ProductionPlan;
  // Sprint 2 Task 1 (D2) — already resolved by the caller (state-machine.ts's
  // three-step creation-option resolution order) into a concrete voice key;
  // this function never applies its own default, it just threads through
  // whatever it's given.
  voice?: string;
}): Promise<VideoGenerationResult> {
  // The production plan (plan.ts, called by state-machine.ts before this
  // function) is what makes a regen attempt actually different now — the
  // caption style, visual source, and footage/scene prompts all come from
  // it, per docs/decisions/VIDEO_GENERATION_LOOP_AND_VISUAL_STRATEGY.md
  // Section 2 and Sprint 2 Task 2 (E2).
  const tts = await synthesizeSpeech(params.scriptText, { voice: params.voice });
  const asr = await transcribe(tts.audioPath);

  const outputDir = path.resolve(DATA_DIR, 'videos', params.pipelineRunId);
  await fs.mkdir(outputDir, { recursive: true });

  const srtFilename = `${params.attemptNumber}.srt`;
  const videoFilename = `${params.attemptNumber}.mp4`;

  // Computed unconditionally — 'ai-stills' needs these cue boundaries to
  // sync still transitions to, regardless of whether captions end up
  // burned in. Only the SRT write / subtitles filter stage below are
  // actually gated on captionsEnabled.
  const captionSegments = buildCaptionSegments(asr.segments, params.plan.captionStyle);

  // B5 fix (KNOWN_ISSUES_AND_BLOCKERS.md §2/§3): captions are optional per
  // channel, default on (BrandAssets.captionsEnabled defaults to true if
  // unset — see channel.types.ts). When off, no SRT is written and no
  // `subtitles` stage is added to the filter graph at all — not just an
  // empty/invisible caption track.
  const captionsEnabled = params.brandAssets.captionsEnabled !== false;
  if (captionsEnabled) {
    await fs.writeFile(path.join(outputDir, srtFilename), buildSrt(captionSegments), 'utf-8');
  }

  // Sprint 2 Task 2 (E2) — the one branch point. Both paths converge on a
  // single `visualPath`: everything from here down (scale/crop, subtitles,
  // watermark overlay, audio mux) is identical regardless of which one ran.
  let visualPath: string;
  let stockFootageMeta: { provider: string; query: string; sourceId: string; costUsd: string } | undefined;
  let aiVisualsMeta: { provider: string; model: string; stillCount: number; costUsd: string } | undefined;

  if (params.plan.visualSource === 'ai-stills') {
    const scenePrompts = params.plan.stillScenePrompts ?? [];
    if (scenePrompts.length === 0) {
      // plan.ts's own schema refinement should make this unreachable in
      // practice, but this function takes `plan` as a plain parameter (e.g.
      // scripts/dry-run.ts's forcedPlan test override), so it's defended
      // here too rather than trusting every caller re-validates.
      throw new NonTransientStageError("ProductionPlan.visualSource is 'ai-stills' but stillScenePrompts is empty");
    }
    const stills = await generateStills({ scenePrompts });
    const windows = distributeStillWindows({
      captionCues: captionSegments,
      stillCount: stills.imagePaths.length,
      totalDurationMs: asr.audioDurationSeconds * 1000,
    });
    const stillsVideoPath = path.join(outputDir, `${params.attemptNumber}-stills.mp4`);
    await buildKenBurnsVideo({
      stills: stills.imagePaths.map((imagePath, i) => ({
        imagePath,
        durationSeconds: Math.max(0.1, (windows[i].endMs - windows[i].startMs) / 1000),
      })),
      outputPath: stillsVideoPath,
    });
    visualPath = stillsVideoPath;
    aiVisualsMeta = { provider: stills.provider, model: stills.model, stillCount: stills.imagePaths.length, costUsd: stills.costUsd };
  } else {
    const clip = await searchStockFootage({ query: params.plan.stockFootageQuery, orientation: 'portrait' });
    visualPath = clip.clipPath;
    stockFootageMeta = { provider: 'pexels', query: params.plan.stockFootageQuery, sourceId: clip.sourceId, costUsd: clip.costUsd };
  }

  const watermarkPath = params.brandAssets.watermarkUrl;
  const hasLocalWatermark = Boolean(watermarkPath && fsSync.existsSync(watermarkPath));

  // Sprint 2 Task 3 (F1) — the picked track's own license is confirmed at
  // pick time (audio-bed/client.ts refuses a track missing license
  // metadata before any FFmpeg work starts), not re-checked here.
  const audioBedTrack = params.plan.audioLayer !== 'none' ? pickAudioBedTrack(params.plan.audioLayer) : undefined;

  // Scaled/cropped to fill the 9:16 frame exactly (a Pexels clip's native
  // size rarely matches 1080x1920; an ai-stills render is already exactly
  // 1080x1920 from buildKenBurnsVideo, so this is a no-op crop in that
  // case), looped if shorter than the voiceover — `-shortest` still cuts the
  // output to the audio's real length, so looping never over-extends the
  // video (and is harmless on an ai-stills input that's already exactly the
  // right length). Run from `outputDir` as cwd so the caption file can be
  // referenced by its plain filename, avoiding FFmpeg's notoriously fiddly
  // colon/backslash escaping for the `subtitles` filter's path argument on
  // Windows.
  const scaleCropFilter = `[0:v]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=increase,crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT},fps=${VIDEO_FPS}`;
  const baseFilter = captionsEnabled
    ? `${scaleCropFilter},subtitles=${srtFilename}:force_style='Fontsize=${captionFontSize(params.plan.captionStyle)},PrimaryColour=&H00FFFFFF,Alignment=2,MarginV=200'`
    : scaleCropFilter;
  const videoFilterChain = hasLocalWatermark
    ? `${baseFilter}[framed];[framed][2:v]overlay=W-w-40:40[outv]`
    : `${baseFilter}[outv]`;

  // The bed input's index depends on whether the (also optional) watermark
  // input came before it — visual=0, tts=1, [watermark=2], bed=next.
  const audioBedInputIndex = hasLocalWatermark ? 3 : 2;
  // An explicit low weight on the bed (not equal-weighted) so narration
  // stays intelligible — `duration=first` caps the mix at the TTS track's
  // real length (listed first) regardless of how long the (looped) bed
  // input runs.
  const audioFilterChain = audioBedTrack
    ? `;[1:a][${audioBedInputIndex}:a]amix=inputs=2:duration=first:weights='1 ${AUDIO_BED_MIX_WEIGHT}'[outa]`
    : '';
  const filterComplex = `${videoFilterChain}${audioFilterChain}`;

  const ffmpegArgs = [
    '-y',
    '-stream_loop',
    '-1',
    '-i',
    visualPath,
    '-i',
    tts.audioPath,
    ...(hasLocalWatermark ? ['-i', watermarkPath as string] : []),
    ...(audioBedTrack ? ['-stream_loop', '-1', '-i', audioBedTrack.filePath] : []),
    '-filter_complex',
    filterComplex,
    '-map',
    '[outv]',
    '-map',
    audioBedTrack ? '[outa]' : '1:a',
    '-c:v',
    'libx264',
    '-preset',
    QUALITY_SPEC.video.preset,
    '-crf',
    String(QUALITY_SPEC.video.crf),
    '-profile:v',
    'high',
    '-pix_fmt',
    QUALITY_SPEC.video.pixFmt,
    '-movflags',
    '+faststart',
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
  const visualCostUsd = stockFootageMeta ? Number(stockFootageMeta.costUsd) : Number(aiVisualsMeta?.costUsd ?? '0');
  const costUsd = (Number(tts.costUsd) + Number(asr.costUsd) + visualCostUsd).toFixed(6);

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
        captionsEnabled,
        captionStyle: params.plan.captionStyle,
        visualSource: params.plan.visualSource,
        ...(stockFootageMeta && {
          stockFootageProvider: stockFootageMeta.provider,
          stockFootageQuery: stockFootageMeta.query,
          stockFootageSourceId: stockFootageMeta.sourceId,
          stockFootageCostUsd: stockFootageMeta.costUsd,
        }),
        ...(aiVisualsMeta && {
          aiVisualsProvider: aiVisualsMeta.provider,
          aiVisualsModel: aiVisualsMeta.model,
          aiVisualsStillCount: aiVisualsMeta.stillCount,
          aiVisualsCostUsd: aiVisualsMeta.costUsd,
        }),
        audioLayer: params.plan.audioLayer,
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
