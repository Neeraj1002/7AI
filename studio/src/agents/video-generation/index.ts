import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { synthesizeSpeech, transcribe, resolveMediaPurpose, type TranscriptSegment } from '../../media';
import { buildStockShotList } from './stock-shotlist';
import { generateStills } from '../../ai-visuals';
import { buildStyledScenePrompts, type SceneStyle } from './scene-prompts';
import { pickAudioBedTrack } from '../../audio-bed';
import { env } from '../../config/env';
import { NonTransientStageError, getStageErrorContext } from '../../run-pipeline/retry-with-backoff';
import type { VideoSpend } from './spend';
import type { BrandAssets } from '../../types';
import { ProductionPlanSchema, type AudioLayer, type CaptionStyle, type ProductionPlan } from './plan';
import { DATA_DIR } from '../../config/paths';
import { QUALITY_SPEC, END_TAIL_SECONDS } from './quality-spec';
import { probeMediaSeconds, voiceLengthMismatch, finalLengthMismatch } from './duration-guards';
import { audioTimelineProblem, probeAudioTimeline } from './audio-guards';
import { alignScriptToWhisper, assertCaptionFontPresent, buildAss, groupCaptionCues, FONTS_DIR, type TimedWord } from './captions-ass';
import { HOOK_SECONDS } from '../../packaging/constants';
import { applyFrameZero } from '../../packaging/opening';
import {
  buildAudioFilterGraph,
  computeBedGainDb,
  measureIntegratedLufs,
  parseLoudnormJson,
  type MeasuredLoudness,
} from './audio-mix';

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
  // Sprint 4 Task 9: set only by a long-form render (long-form.ts). A Short's output is unchanged.
  videoKind: z.enum(['short', 'long']).optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  fps: z.number().optional(),
  frameCount: z.number().nullable().optional(),
  chapterTimings: z.array(z.object({ title: z.string(), startSec: z.number(), endSec: z.number() })).optional(),
  subtitlesPath: z.string().optional(),
  // Long-form: the narration pace actually measured, to keep the script-length target calibrated.
  scriptWordCount: z.number().optional(),
  narrationSeconds: z.number().optional(),
  measuredWordsPerMinute: z.number().optional(),
  bedCredits: z.array(z.string()).optional(),
  // Sprint 5 Task 8 (R6): pictures that still showed a logo, readable text, an invented figure or a scene
  // against its narration after their one regeneration. Shown at Video Review and Gate 2.
  flaggedStills: z.array(z.object({
    sceneIndex: z.number().int(),
    sceneId: z.string(),
    issues: z.array(z.object({ kind: z.string(), detail: z.string() })),
  })).optional(),
  stillCheck: z.object({
    checked: z.number().int(),
    unchecked: z.number().int(),
    flaggedFirstPass: z.number().int(),
    regenerated: z.number().int(),
    stillFlagged: z.number().int(),
  }).optional(),
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
    // Sprint 4 Task 8 (R5) — the shot list: one entry per beat, in order.
    stockFootageQueries?: string[];
    stockFootageSourceIds?: string[];
    stockFootageClipCount?: number;
    stockFootageCostUsd?: string;
    // 'ai-stills' only.
    aiVisualsProvider?: string;
    aiVisualsModel?: string;
    aiVisualsStillCount?: number;
    // Sprint 4 Task 8 (R6) — scene prompts the provider's safety system refused.
    aiVisualsSkippedStills?: number;
    aiVisualsCostUsd?: string;
    // Sprint 4 Task 9: long-form only. Narration and stills are booked per call as they are paid
    // for, so this aggregated row carries $0 and these figures are for information only.
    videoKind?: 'short' | 'long';
    costsBookedSeparately?: boolean;
    narrationCostUsd?: string;
    measuredWordsPerMinute?: number;
    // Sprint 5 Task 8 (R3): the shot-length check made on the plan before any picture.
    shotPlan?: { longestBefore: number; longestAfter: number; adjustedChapters: number[]; addedScenes: number };
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

// Sprint 3 Task 13 (R2) — every intermediate generateVideo used to drop. Not
// part of the persisted VideoGenerationOutputSchema; returned alongside
// output/usage so the orchestrator can upload a per-attempt debug bundle.
export type VideoArtifacts = {
  ttsAudioPath: string;
  transcriptJsonPath: string;
  // Sprint 4 Task 8 (R2): the burned-in caption file is now .ass (was .srt).
  captionsPath?: string;
  planJsonPath: string;
  sceneMappingPath?: string;
  // Sprint 4 Task 8 (R5): the assembled stock shot list (individual clips are tmp).
  stockVideoPath?: string;
  stillImagePaths?: string[];
  stillsVideoPath?: string;
  audioBedPath?: string;
  ffmpegArgsJsonPath: string;
  stubFlags: { media: boolean; stockFootage: boolean; aiVisuals: boolean };
  // Sprint 4 Task 9: long-form extras for the debug bundle.
  srtPath?: string;
  bedAudioPath?: string;
  mixedAudioPath?: string;
};

export type VideoGenerationResult = {
  output: VideoGenerationOutput;
  usage: VideoGenerationUsage;
  artifacts: VideoArtifacts;
};

const VIDEO_WIDTH = QUALITY_SPEC.video.width;
const VIDEO_HEIGHT = QUALITY_SPEC.video.height;
const VIDEO_FPS = QUALITY_SPEC.video.fps;

// Caption cues per the production plan's captionStyle (plan.ts) — the concrete
// mechanism a regen attempt has to produce a different result, per
// docs/decisions/VIDEO_GENERATION_LOOP_AND_VISUAL_STRATEGY.md Section 2.
// Grouping lives in captions-ass.ts (Sprint 4 Task 8, R2), shared by the ASS
// writer and the still-window distribution below.
function buildCaptionSegments(segments: TranscriptSegment[], style: CaptionStyle): TranscriptSegment[] {
  return groupCaptionCues(segments, style).map(({ text, startMs, endMs }) => ({ text, startMs, endMs }));
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

  const cues = params.captionCues;
  const effectiveCount = Math.min(stillCount, cues.length);

  // Sprint 4 Task 8 (R6) — boundaries are chosen by TIME, not by an equal
  // number of cues per still: a still ends at the cue end nearest to its ideal
  // equal-time slice. Equal cue counts let a slow stretch of speech hold one
  // still well past the ~2.5s pacing target (measured: 4.3s shots). Every
  // window still contains at least one whole cue, and cuts still land on cue
  // boundaries. With uniform cues this reduces to the old even split.
  const lastCueIdxOfWindow: number[] = [];
  for (let i = 0; i < effectiveCount - 1; i += 1) {
    const target = ((i + 1) * params.totalDurationMs) / effectiveCount;
    const lo = i === 0 ? 0 : lastCueIdxOfWindow[i - 1] + 1;
    const hi = cues.length - (effectiveCount - i);
    let best = lo;
    for (let idx = lo; idx <= hi; idx += 1) {
      if (Math.abs(cues[idx].endMs - target) < Math.abs(cues[best].endMs - target)) best = idx;
    }
    lastCueIdxOfWindow.push(best);
  }
  lastCueIdxOfWindow.push(cues.length - 1);

  const windows: Array<{ startMs: number; endMs: number }> = [];
  for (let i = 0; i < effectiveCount; i += 1) {
    const startIdx = i === 0 ? 0 : lastCueIdxOfWindow[i - 1] + 1;
    windows.push({ startMs: cues[startIdx].startMs, endMs: cues[lastCueIdxOfWindow[i]].endMs });
  }

  // Contiguous windows: each still stays up until the next one's first cue
  // begins. Spanning only [first cue start, last cue end] dropped every pause
  // between windows from the timeline, leaving the stills video shorter than
  // the audio (measured: 36.2s vs 39.9s with word-flash) — and the final mux
  // then looped the video back to its first still for the remaining seconds.
  for (let i = 0; i < windows.length - 1; i += 1) {
    windows[i].endMs = windows[i + 1].startMs;
  }

  // The first/last window always spans the full real audio duration,
  // regardless of ASR's first/last word timestamps — so the assembled
  // stills video always covers exactly [0, totalDurationMs], never leaving
  // a silent gap for -shortest to expose.
  windows[0].startMs = 0;
  windows[windows.length - 1].endMs = Math.max(windows[windows.length - 1].endMs, params.totalDurationMs);
  return windows;
}

// Sprint 4 Task 8 (R1) — loudnorm pass 1: runs the same ducking/mix graph on
// audio alone (no video decode, a second or two) and returns the measured
// integrated loudness/true peak/LRA for pass 2's linear normalisation.
async function measureMixLoudness(params: {
  voicePath: string;
  bedPath?: string;
  bedGainDb?: number;
  tailSeconds?: number;
  voiceDurationSeconds?: number;
}): Promise<MeasuredLoudness | undefined> {
  const graph = buildAudioFilterGraph({
    voiceInputIndex: 0,
    bedInputIndex: params.bedPath ? 1 : undefined,
    bedGainDb: params.bedGainDb,
    measureOnly: true,
    tailSeconds: params.tailSeconds,
    voiceDurationSeconds: params.voiceDurationSeconds,
  });
  try {
    const { stderr } = await execFileAsync(env.FFMPEG_PATH, [
      '-hide_banner',
      '-i',
      params.voicePath,
      ...(params.bedPath ? ['-stream_loop', '-1', '-i', params.bedPath] : []),
      '-filter_complex',
      graph,
      '-map',
      '[outa]',
      '-f',
      'null',
      '-',
    ]);
    return parseLoudnormJson(stderr);
  } catch (error) {
    console.error(`[video_generation] loudnorm measuring pass failed, falling back to single-pass: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
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
  // Sprint 4 Task 3: resolved visual style for ai-stills scene prompts.
  sceneStyle?: SceneStyle;
  // Bugs Closure R6 — stock clip ids this run's earlier attempts used (see stock-shotlist.ts).
  excludeStockSourceIds?: string[];
  // Bugs Closure 2 (P5) - filled in as each paid call completes, so the caller can
  // book the real cost of a render that fails part-way (see spend.ts).
  spend?: VideoSpend;
  // Sprint 4 Task 12 (R4): stills finished so far, for runs.progress.
  onStillsProgress?: (progress: { done: number; total: number }) => void;
  // Sprint 6 Task 1 R7: the opening built from the curiosity brief. `hookLine` is drawn on the first frame; `firstStillPrompt`
  // replaces the first scene prompt (frame zero) of an ai-stills video. Either may be absent.
  opening?: { hookLine?: string | null; firstStillPrompt?: string | null };
}): Promise<VideoGenerationResult> {
  // The production plan (plan.ts, called by state-machine.ts before this
  // function) is what makes a regen attempt actually different now — the
  // caption style, visual source, and footage/scene prompts all come from
  // it, per docs/decisions/VIDEO_GENERATION_LOOP_AND_VISUAL_STRATEGY.md
  // Section 2 and Sprint 2 Task 2 (E2).
  const tts = await synthesizeSpeech(params.scriptText, { voice: params.voice });
  if (params.spend) {
    const entry = resolveMediaPurpose('tts', params.voice);
    params.spend.ttsProvider = entry.provider;
    params.spend.ttsModel = entry.model;
    params.spend.ttsCharacters = tts.characterCount;
    params.spend.ttsCostUsd = Number(tts.costUsd);
  }
  const asr = await transcribe(tts.audioPath);
  if (params.spend) {
    params.spend.transcriptionModel = resolveMediaPurpose('transcription').model;
    params.spend.transcriptionSeconds = asr.audioDurationSeconds;
    params.spend.transcriptionCostUsd = Number(asr.costUsd);
  }
  // The picture is built to the transcription's length, so the voice file's own length must agree with it before anything is rendered.
  const voiceSeconds = await probeMediaSeconds(tts.audioPath);
  const voiceMismatch = voiceLengthMismatch(voiceSeconds, asr.audioDurationSeconds);
  if (voiceMismatch) throw new NonTransientStageError(voiceMismatch);
  // Bugs Closure 2 (P8): the short hold after the last spoken word.
  const tailSeconds = END_TAIL_SECONDS;

  const outputDir = path.resolve(DATA_DIR, 'videos', params.pipelineRunId);
  await fs.mkdir(outputDir, { recursive: true });

  const assFilename = `${params.attemptNumber}.ass`;
  const videoFilename = `${params.attemptNumber}.mp4`;

  // B5 fix (KNOWN_ISSUES_AND_BLOCKERS.md §2/§3): captions are optional per
  // channel, default on (BrandAssets.captionsEnabled defaults to true if
  // unset — see channel.types.ts). When off, no caption file is written and
  // no `ass` stage is added to the filter graph at all — not just an
  // empty/invisible caption track — and cue boundaries come from Whisper's own
  // words exactly as before Sprint 4 Task 8.
  const captionsEnabled = params.brandAssets.captionsEnabled !== false;

  // Sprint 4 Task 8 (R2) — with captions on, the text is the sanctioned
  // script's own words (punctuation, casing, proper nouns intact) timed by
  // Whisper's word timestamps; Whisper's own spelling is never shown.
  // Computed unconditionally in shape — 'ai-stills' needs these cue
  // boundaries to sync still transitions to, regardless of whether captions
  // end up burned in.
  const timedWords: TimedWord[] = captionsEnabled ? alignScriptToWhisper(params.scriptText, asr.segments) : asr.segments;
  const captionSegments = buildCaptionSegments(timedWords, params.plan.captionStyle);
  const hookLine = params.opening?.hookLine?.trim() || null;
  // One .ass file carries the captions and, when there is one, the hook line; a hook with captions off still gets its own file.
  const hasAss = captionsEnabled || Boolean(hookLine);
  if (hasAss) {
    assertCaptionFontPresent();
    const { ass } = buildAss({
      words: captionsEnabled ? timedWords : [],
      style: params.plan.captionStyle,
      holdLastCueMs: Math.round(tailSeconds * 1000),
      ...(hookLine && { hook: { text: hookLine, seconds: HOOK_SECONDS } }),
    });
    await fs.writeFile(path.join(outputDir, assFilename), ass, 'utf-8');
  }

  const transcriptJsonPath = path.join(outputDir, `${params.attemptNumber}.transcript.json`);
  await fs.writeFile(
    transcriptJsonPath,
    JSON.stringify({ audioDurationSeconds: asr.audioDurationSeconds, segments: asr.segments }, null, 2),
    'utf-8',
  );
  const planJsonPath = path.join(outputDir, `${params.attemptNumber}.plan.json`);
  await fs.writeFile(planJsonPath, JSON.stringify(params.plan, null, 2), 'utf-8');

  // Sprint 2 Task 2 (E2) — the one branch point. Both paths converge on a
  // single `visualPath`: everything from here down (scale/crop, subtitles,
  // watermark overlay, audio mux) is identical regardless of which one ran.
  let visualPath: string;
  let stockFootageMeta:
    | { provider: string; query: string; sourceId: string; costUsd: string; queries: string[]; sourceIds: string[] }
    | undefined;
  let aiVisualsMeta: { provider: string; model: string; stillCount: number; costUsd: string; skipped: number } | undefined;
  let stockVideoPathArtifact: string | undefined;
  let stillImagePaths: string[] | undefined;
  let stillsVideoPathArtifact: string | undefined;

  if (params.plan.visualSource === 'ai-stills') {
    // R7: frame zero is the brief's one thing to look at, when the script names it; every other still is the planner's.
    const planned = params.plan.stillScenePrompts ?? [];
    const scenePrompts = applyFrameZero(planned, params.opening?.firstStillPrompt);
    if (scenePrompts.length === 0) {
      // plan.ts's own schema refinement should make this unreachable in
      // practice, but this function takes `plan` as a plain parameter (e.g.
      // scripts/dry-run.ts's forcedPlan test override), so it's defended
      // here too rather than trusting every caller re-validates.
      throw new NonTransientStageError("ProductionPlan.visualSource is 'ai-stills' but stillScenePrompts is empty");
    }
    let stills: Awaited<ReturnType<typeof generateStills>>;
    try {
      // Sprint 4 Task 3 (R9/R11): style, negative and safety text ride on each scene prompt.
      stills = await generateStills({
        scenePrompts: buildStyledScenePrompts(scenePrompts, params.sceneStyle ?? {}),
        onProgress: params.onStillsProgress,
      });
    } catch (error) {
      // Stills generated before the failure were billed (ai-visuals/client.ts reports them).
      const ctx = getStageErrorContext(error);
      if (params.spend && ctx) {
        if (typeof ctx.model === 'string') params.spend.stillsModel = ctx.model;
        params.spend.stillsCount += Number(ctx.partialStillCount ?? 0);
        params.spend.stillsCostUsd += Number(ctx.partialCostUsd ?? 0);
      }
      throw error;
    }
    if (params.spend) {
      params.spend.stillsModel = stills.model;
      params.spend.stillsCount = stills.imagePaths.length;
      params.spend.stillsCostUsd = Number(stills.costUsd);
    }
    // Sprint 4 Task 8 (R6) — with the faster default pacing there can be more
    // stills than caption cues (e.g. sentence-grouped on a short script).
    // distributeStillWindows would silently drop the excess stills — paid-for
    // images never shown — so fall back to word-level boundaries then.
    const windows = distributeStillWindows({
      captionCues: captionSegments.length >= stills.imagePaths.length ? captionSegments : timedWords,
      stillCount: stills.imagePaths.length,
      totalDurationMs: asr.audioDurationSeconds * 1000,
    });
    const stillsVideoPath = path.join(outputDir, `${params.attemptNumber}-stills.mp4`);
    // Sprint 4 Task 8 (R6) — the still count fed into buildKenBurnsVideo now
    // scales with script length; log wall time and intermediate size so a
    // superlinear blow-up (Sprint 2 Task 2's zoompan bug) is visible at a glance.
    const kenBurnsStartedAt = Date.now();
    await buildKenBurnsVideo({
      stills: stills.imagePaths.map((imagePath, i) => ({
        imagePath,
        durationSeconds: Math.max(0.1, (windows[i].endMs - windows[i].startMs) / 1000),
      })),
      outputPath: stillsVideoPath,
    });
    const stillsVideoBytes = (await fs.stat(stillsVideoPath)).size;
    console.log(
      `[video_generation] run ${params.pipelineRunId} attempt ${params.attemptNumber}: ken-burns ${stills.imagePaths.length} stills in ${((Date.now() - kenBurnsStartedAt) / 1000).toFixed(1)}s, intermediate ${(stillsVideoBytes / 1e6).toFixed(1)}MB`,
    );
    visualPath = stillsVideoPath;
    stillsVideoPathArtifact = stillsVideoPath;
    stillImagePaths = stills.imagePaths;
    aiVisualsMeta = { provider: stills.provider, model: stills.model, stillCount: stills.imagePaths.length, costUsd: stills.costUsd, skipped: stills.skippedPromptCount ?? 0 };
  } else {
    // Sprint 4 Task 8 (R5) — a shot list, one clip per story beat. Old stage
    // outputs / the regen path without stockFootageQueries fall back to the
    // single query (one clip, held on its last frame if short — never looped).
    const queries = params.plan.stockFootageQueries?.length ? params.plan.stockFootageQueries : [params.plan.stockFootageQuery];
    const windows = distributeStillWindows({
      captionCues: captionSegments.length >= queries.length ? captionSegments : timedWords,
      stillCount: queries.length,
      totalDurationMs: asr.audioDurationSeconds * 1000,
    });
    const stockVideoPath = path.join(outputDir, `${params.attemptNumber}-stock.mp4`);
    const shots = await buildStockShotList({
      queries,
      windows,
      totalDurationMs: asr.audioDurationSeconds * 1000,
      outputPath: stockVideoPath,
      previouslyUsedSourceIds: params.excludeStockSourceIds,
    });
    visualPath = stockVideoPath;
    stockVideoPathArtifact = stockVideoPath;
    stockFootageMeta = {
      provider: 'pexels',
      query: shots.queries.join(' | '),
      sourceId: shots.sourceIds.join(','),
      costUsd: '0.000000',
      queries: shots.queries,
      sourceIds: shots.sourceIds,
    };
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
  // colon/backslash escaping for the `ass` filter's path argument on
  // Windows.
  // No setpts after fps: the stock shot list is already built at a constant frame rate, `-r`/`-fps_mode cfr` below pin the output, and
  // on the production ffmpeg (8.0.1) any setpts here cut a 36 s picture to 13 s.
  const scaleCropFilter = `[0:v]scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=increase,crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT},fps=${VIDEO_FPS}` +
    // P8: hold the last frame through the tail (generous pad; -shortest trims it to the audio).
    (tailSeconds > 0 ? `,tpad=stop_mode=clone:stop_duration=${(tailSeconds + 0.5).toFixed(2)}` : '');
  // fontsdir relative to the ffmpeg cwd (outputDir): no drive-letter colon to
  // escape in the filtergraph, identical on Windows and the Linux VPS.
  const fontsDirArg = path.relative(outputDir, FONTS_DIR).split(path.sep).join('/');
  const baseFilter = hasAss
    ? `${scaleCropFilter},ass=${assFilename}:fontsdir=${fontsDirArg}`
    : scaleCropFilter;
  const videoFilterChain = hasLocalWatermark
    ? `${baseFilter}[framed];[framed][2:v]overlay=W-w-40:40[outv]`
    : `${baseFilter}[outv]`;

  // The bed input's index depends on whether the (also optional) watermark
  // input came before it — visual=0, tts=1, [watermark=2], bed=next.
  const audioBedInputIndex = hasLocalWatermark ? 3 : 2;
  // Sprint 4 Task 8 (R1) — always an audio chain now: sidechain-ducked bed
  // (when there is one) + loudnorm to -14 LUFS on every render. Two-pass: a
  // fast audio-only measuring run first, then loudnorm applies the measured
  // values linearly (linear mode hits the target without dynamic gain riding). Falls back to single-pass if the measurement can't be parsed.
  // The bed is levelled against the measured voice (not a fixed constant), so it
  // sits the same distance under narration whatever track is picked.
  const bedGainDb = audioBedTrack
    ? computeBedGainDb(
        await measureIntegratedLufs(tts.audioPath),
        await measureIntegratedLufs(audioBedTrack.filePath, { cache: true }),
      )
    : undefined;
  const measured = await measureMixLoudness({
    voicePath: tts.audioPath,
    bedPath: audioBedTrack?.filePath,
    bedGainDb,
    tailSeconds,
    voiceDurationSeconds: asr.audioDurationSeconds,
  });
  const audioFilterChain = buildAudioFilterGraph({
    voiceInputIndex: 1,
    bedInputIndex: audioBedTrack ? audioBedInputIndex : undefined,
    bedGainDb,
    measured,
    tailSeconds,
    voiceDurationSeconds: asr.audioDurationSeconds,
  });

  const ffmpegArgs = [
    '-y',
    // ai-stills keeps the (harmless, sub-frame) loop it always had; the stock
    // shot list is built to cover the voiceover and must never loop.
    // (With a tail the last frame is held by tpad instead: looping would flash the first still.)
    ...(params.plan.visualSource === 'ai-stills' && tailSeconds <= 0 ? ['-stream_loop', '-1'] : []),
    '-i',
    visualPath,
    '-i',
    tts.audioPath,
    ...(hasLocalWatermark ? ['-i', watermarkPath as string] : []),
    ...(audioBedTrack ? ['-stream_loop', '-1', '-i', audioBedTrack.filePath] : []),
    // Two graphs, not one: on the production ffmpeg (8.0.1) a single graph holding both chains dropped about 3 s chunks of
    // audio whenever the picture was a real stock file (the AI-stills picture was unaffected). The filters are unchanged.
    '-filter_complex',
    videoFilterChain,
    '-filter_complex',
    audioFilterChain,
    '-map',
    '[outv]',
    '-map',
    '[outa]',
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
    '-r',
    String(VIDEO_FPS),
    '-fps_mode',
    'cfr',
    '-video_track_timescale',
    String(QUALITY_SPEC.video.trackTimescale),
    '-movflags',
    '+faststart',
    '-c:a',
    QUALITY_SPEC.audio.codec,
    '-b:a',
    `${QUALITY_SPEC.audio.bitrateKbps}k`,
    '-ar',
    String(QUALITY_SPEC.audio.sampleRate),
    '-shortest',
    videoFilename,
  ];

  // Written before the FFmpeg call so it exists for debugging even if FFmpeg throws.
  const ffmpegArgsJsonPath = path.join(outputDir, `${params.attemptNumber}.ffmpeg-args.json`);
  await fs.writeFile(
    ffmpegArgsJsonPath,
    JSON.stringify({ ffmpegPath: env.FFMPEG_PATH, cwd: outputDir, args: ffmpegArgs, filterGraphs: { video: videoFilterChain, audio: audioFilterChain } }, null, 2),
    'utf-8',
  );

  await execFileAsync(env.FFMPEG_PATH, ffmpegArgs, { cwd: outputDir });

  const videoPath = path.join(outputDir, videoFilename);
  const durationSeconds = await probeDurationSeconds(videoPath);
  const finalMismatch = finalLengthMismatch(durationSeconds, voiceSeconds, tailSeconds);
  if (finalMismatch) throw new NonTransientStageError(finalMismatch);
  // The audio must be all there: packet timestamps with no hole, and the packet count the audio's length needs.
  const audioProblem = audioTimelineProblem(await probeAudioTimeline(videoPath));
  if (audioProblem) throw new NonTransientStageError(audioProblem);

  const ttsEntry = resolveMediaPurpose('tts', params.voice);
  const transcriptionEntry = resolveMediaPurpose('transcription');
  const visualCostUsd = stockFootageMeta ? Number(stockFootageMeta.costUsd) : Number(aiVisualsMeta?.costUsd ?? '0');
  const costUsd = (Number(tts.costUsd) + Number(asr.costUsd) + visualCostUsd).toFixed(6);

  return {
    output: {
      videoPath,
      durationSeconds,
      // The voice's own length, so Video Review can reject a Short that is shorter than it.
      narrationSeconds: Number(voiceSeconds.toFixed(2)),
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
          stockFootageQueries: stockFootageMeta.queries,
          stockFootageSourceIds: stockFootageMeta.sourceIds,
          stockFootageClipCount: stockFootageMeta.sourceIds.length,
          stockFootageCostUsd: stockFootageMeta.costUsd,
        }),
        ...(aiVisualsMeta && {
          aiVisualsProvider: aiVisualsMeta.provider,
          aiVisualsModel: aiVisualsMeta.model,
          aiVisualsStillCount: aiVisualsMeta.stillCount,
          ...(aiVisualsMeta.skipped > 0 && { aiVisualsSkippedStills: aiVisualsMeta.skipped }),
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
    artifacts: {
      ttsAudioPath: tts.audioPath,
      transcriptJsonPath,
      ...(hasAss && { captionsPath: path.join(outputDir, assFilename) }),
      planJsonPath,
      ...(stockVideoPathArtifact && { stockVideoPath: stockVideoPathArtifact }),
      ...(stillImagePaths && { stillImagePaths }),
      ...(stillsVideoPathArtifact && { stillsVideoPath: stillsVideoPathArtifact }),
      ...(audioBedTrack && { audioBedPath: audioBedTrack.filePath }),
      ffmpegArgsJsonPath,
      stubFlags: {
        media: env.MEDIA_STUB === '1',
        stockFootage: env.STOCK_FOOTAGE_STUB === '1',
        aiVisuals: env.AI_VISUALS_STUB === '1',
      },
    },
  };
}
