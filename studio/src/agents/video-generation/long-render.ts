import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from '../../config/env';
import { NonTransientStageError } from '../../run-pipeline/retry-with-backoff';
import { alignSceneStarts, type SceneAlignment } from './scene-alignment';
import type { SceneMeaning } from './plan';
import { renderProfileFor, type RenderProfile } from './render-profile';
import { QUALITY_SPEC } from './quality-spec';
import {
  buildAudioFilterGraph,
  computeBedGainDb,
  measureIntegratedLufs,
  parseLoudnormJson,
  type MeasuredLoudness,
} from './audio-mix';
import type { AudioBedTrack } from '../../audio-bed';
import type { ChapterTiming } from './long-narration';
import type { TranscriptSegment } from '../../media';

const execFileAsync = promisify(execFile);
const FFMPEG_BUFFER = 32 * 1024 * 1024;

// Sprint 4 Task 9 (R6): the long-form (16:9) render. The pure parts (scene timeline, frame
// allocation, Ken Burns moves) are exported for unit tests; the ffmpeg parts follow.

// ---------------------------------------------------------------------------------------------
// Scene timeline
// ---------------------------------------------------------------------------------------------

export type LongScene = { chapterIndex: number; words: string; prompt: string };
export type TimedScene = SceneAlignment & { endSec: number };

// Match each scene against its approved chapter, with provenance for review and QA.
export function locateSceneStarts(params: {
  scenes: LongScene[];
  chapterTimings: ChapterTiming[];
  words: TranscriptSegment[];
  chapters?: Array<{ text: string }>;
  meanings?: SceneMeaning[];
}): number[] {
  return alignSceneStarts(params).map(scene => scene.startSec);
}

// Each chapter's video covers its narration plus the silence after it, so chapter segments tile
// [0, totalSec] exactly; the last scene runs to totalSec (which includes the end tail).
export function buildSceneTimeline(params: {
  scenes: LongScene[];
  chapterTimings: ChapterTiming[];
  words: TranscriptSegment[];
  totalSec: number;
  chapters?: Array<{ text: string }>;
  meanings?: SceneMeaning[];
}): TimedScene[] {
  const out: TimedScene[] = alignSceneStarts(params).map(scene => ({ ...scene, endSec: 0 }));
  if (out.length === 0) throw new NonTransientStageError('The production plan has no scenes to render');
  out[0].startSec = 0;
  for (let i = 0; i < out.length; i += 1) {
    if (!Number.isFinite(out[i].startSec)) throw new NonTransientStageError(`Scene ${i + 1} could not be placed on the narration timeline`);
    out[i].endSec = i + 1 < out.length ? out[i + 1].startSec : params.totalSec;
  }
  return out;
}

// Integer frames per scene from cumulative rounding, so the video has exactly round(total x fps)
// frames however many scenes there are (per-scene rounding drifts by up to half a frame each).
export function allocateFrames(sceneEndSecs: number[], fps: number): number[] {
  let prev = 0;
  return sceneEndSecs.map((end) => {
    const target = Math.round(end * fps);
    const frames = Math.max(1, target - prev);
    prev += frames;
    return frames;
  });
}

// ---------------------------------------------------------------------------------------------
// Ken Burns
// ---------------------------------------------------------------------------------------------

export type KenBurnsMove = 'push-in' | 'pan-right' | 'pan-left';

// Alternates a push-in and a lateral pan (the pan direction flips each time), so the same move
// never runs twice in a row.
export function moveForScene(sceneIndex: number): KenBurnsMove {
  if (sceneIndex % 2 === 0) return 'push-in';
  return Math.floor(sceneIndex / 2) % 2 === 0 ? 'pan-right' : 'pan-left';
}

// One multiplication, as the Sprint 2 regression requires: zoompan's `d` is the number of frames
// it emits per input frame and the encode is cut with -frames:v, never also looped with -t.
export function kenBurnsFilter(params: { move: KenBurnsMove; frames: number; profile: RenderProfile }): string {
  const { move, frames, profile } = params;
  const w = profile.width;
  const h = profile.height;
  // 2x the output: real headroom for the zoom without softening.
  const pre = `scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,crop=${w * 2}:${h * 2}`;
  const centreY = `y='ih/2-(ih/zoom/2)'`;
  const common = `d=${frames}:s=${w}x${h}:fps=${profile.fps}`;
  let zoompan: string;
  if (move === 'push-in') {
    zoompan = `zoompan=z='1+0.2*on/${frames}':x='iw/2-(iw/zoom/2)':${centreY}:${common}`;
  } else if (move === 'pan-right') {
    zoompan = `zoompan=z='1.2':x='(iw-iw/zoom)*on/${frames}':${centreY}:${common}`;
  } else {
    zoompan = `zoompan=z='1.2':x='(iw-iw/zoom)*(1-on/${frames})':${centreY}:${common}`;
  }
  return `${pre},${zoompan},format=${QUALITY_SPEC.video.pixFmt}`;
}

export function videoEncodeArgs(profile: RenderProfile): string[] {
  return [
    '-c:v', 'libx264',
    '-preset', QUALITY_SPEC.video.preset,
    '-crf', String(QUALITY_SPEC.video.crf),
    '-profile:v', 'high',
    '-pix_fmt', QUALITY_SPEC.video.pixFmt,
    ...(profile.maxrateKbps ? ['-maxrate', `${profile.maxrateKbps}k`, '-bufsize', `${profile.bufsizeKbps}k`] : []),
    '-r', String(profile.fps),
    '-g', String(profile.fps * 2),
  ];
}

// ---------------------------------------------------------------------------------------------
// ffmpeg steps
// ---------------------------------------------------------------------------------------------

async function ffmpeg(args: string[], cwd?: string): Promise<void> {
  await execFileAsync(env.FFMPEG_PATH, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { cwd, maxBuffer: FFMPEG_BUFFER });
}

function concatList(paths: string[]): string {
  return paths.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n');
}

async function concatCopy(paths: string[], outputPath: string): Promise<void> {
  const listPath = `${outputPath}.list.txt`;
  await fs.writeFile(listPath, concatList(paths), 'utf-8');
  try {
    await ffmpeg(['-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outputPath]);
  } finally {
    await fs.unlink(listPath).catch(() => undefined);
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).size > 0;
  } catch {
    return false;
  }
}

export type ChapterSegmentPlan = {
  chapterIndex: number;
  scenes: Array<{ sceneIndex: number; imagePath: string; imageSha256?: string; frames: number }>;
};

export function chapterSegmentSignature(chapter: ChapterSegmentPlan, profile: RenderProfile): string {
  return crypto
    .createHash('sha1')
    .update(JSON.stringify(chapter.scenes.map((s) => [s.sceneIndex, s.imagePath, s.imageSha256, s.frames])) + JSON.stringify(profile))
    .digest('hex')
    .slice(0, 12);
}

export function chapterSegmentPath(chapter: ChapterSegmentPlan, workDir: string, profile: RenderProfile): string {
  return path.join(workDir, `chapter-${chapter.chapterIndex}-${chapterSegmentSignature(chapter, profile)}.mp4`);
}

// One silent video file per chapter. A finished chapter file is kept (with a hash of what built it
// in its name), so a crash or a retry resumes at the first chapter that is not on disk.
export async function renderChapterSegments(params: {
  chapters: ChapterSegmentPlan[];
  workDir: string;
  profile: RenderProfile;
  onChapterDone?: (chapterIndex: number, resumed: boolean) => void;
}): Promise<string[]> {
  await fs.mkdir(params.workDir, { recursive: true });
  const out: string[] = [];
  for (const chapter of params.chapters) {
    const chapterPath = chapterSegmentPath(chapter, params.workDir, params.profile);
    const signature = chapterSegmentSignature(chapter, params.profile);
    if (await exists(chapterPath)) {
      params.onChapterDone?.(chapter.chapterIndex, true);
      out.push(chapterPath);
      continue;
    }
    const scenePaths: string[] = [];
    for (const scene of chapter.scenes) {
      const scenePath = path.join(params.workDir, `scene-${scene.sceneIndex}-${signature}.mp4`);
      await ffmpeg([
        '-loop', '1', '-i', scene.imagePath,
        '-vf', kenBurnsFilter({ move: moveForScene(scene.sceneIndex), frames: scene.frames, profile: params.profile }),
        '-frames:v', String(scene.frames),
        '-an',
        ...videoEncodeArgs(params.profile),
        scenePath,
      ]);
      scenePaths.push(scenePath);
    }
    // Written under a temp name, then renamed, so a crash never leaves a half-written chapter that
    // looks finished.
    const partial = `${chapterPath}.partial.mp4`;
    await concatCopy(scenePaths, partial);
    await fs.rename(partial, chapterPath);
    await Promise.all(scenePaths.map((p) => fs.unlink(p).catch(() => undefined)));
    params.onChapterDone?.(chapter.chapterIndex, false);
    out.push(chapterPath);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Audio: music bed chain and the mix
// ---------------------------------------------------------------------------------------------

export const BED_CROSSFADE_SECONDS = 3;

export async function probeSeconds(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync(env.FFPROBE_PATH, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath]);
  return parseFloat(stdout.trim());
}

// The ordered list of track files to chain so the bed covers `durationSec`: every track of the mood
// once, in manifest order, then the LAST track again for as long as more is needed (each join is a
// 3-second crossfade, so each join costs 3 seconds of length).
export function planBedChain(trackLengths: number[], durationSec: number, crossfade = BED_CROSSFADE_SECONDS): number[] {
  if (trackLengths.length === 0) throw new NonTransientStageError('No music tracks to chain');
  const chain: number[] = [];
  let covered = 0;
  const add = (i: number) => {
    covered += trackLengths[i] - (chain.length > 0 ? crossfade : 0);
    chain.push(i);
  };
  trackLengths.forEach((_, i) => {
    if (covered < durationSec) add(i);
  });
  const last = trackLengths.length - 1;
  while (covered < durationSec) {
    if (trackLengths[last] <= crossfade) throw new NonTransientStageError('The last music track is too short to loop with a crossfade');
    add(last);
  }
  return chain;
}

async function buildBedAudio(tracks: AudioBedTrack[], durationSec: number, outputPath: string): Promise<{ chain: string[] }> {
  const lengths = await Promise.all(tracks.map((t) => probeSeconds(t.filePath)));
  const order = planBedChain(lengths, durationSec);
  const files = order.map((i) => tracks[i].filePath);
  if (files.length === 1) {
    await ffmpeg(['-i', files[0], '-t', durationSec.toFixed(3), '-ar', '48000', '-ac', '2', '-c:a', 'flac', outputPath]);
    return { chain: files };
  }
  const prep = files.map((_, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=stereo[b${i}]`);
  const joins: string[] = [];
  let label = 'b0';
  for (let i = 1; i < files.length; i += 1) {
    const out = i === files.length - 1 ? 'bedall' : `x${i}`;
    joins.push(`[${label}][b${i}]acrossfade=d=${BED_CROSSFADE_SECONDS}:c1=tri:c2=tri[${out}]`);
    label = out;
  }
  await ffmpeg([
    ...files.flatMap((f) => ['-i', f]),
    '-filter_complex', [...prep, ...joins].join(';'),
    '-map', '[bedall]', '-t', durationSec.toFixed(3), '-c:a', 'flac', outputPath,
  ]);
  return { chain: files };
}

export type MixedAudio = { audioPath: string; durationSeconds: number; bedChain: string[]; bedGainDb?: number; measured?: MeasuredLoudness };

// The full mixed, loudness-normalised audio, built BEFORE the picture: the narration plus the end
// tail, with the chained music bed ducked under it, loudnorm to -14 LUFS (two passes), AAC 192k/48 kHz.
export async function mixLongAudio(params: {
  voicePath: string;
  voiceDurationSeconds: number;
  tailSeconds: number;
  bedTracks?: AudioBedTrack[];
  workDir: string;
  outputPath: string;
}): Promise<MixedAudio> {
  let bedPath: string | undefined;
  let bedChain: string[] = [];
  let bedGainDb: number | undefined;
  const totalSec = params.voiceDurationSeconds + params.tailSeconds;
  if (params.bedTracks && params.bedTracks.length > 0) {
    bedPath = path.join(params.workDir, 'bed.flac');
    bedChain = (await buildBedAudio(params.bedTracks, totalSec + 1, bedPath)).chain;
    bedGainDb = computeBedGainDb(await measureIntegratedLufs(params.voicePath), await measureIntegratedLufs(bedPath));
  }
  const graphBase = {
    voiceInputIndex: 0,
    bedInputIndex: bedPath ? 1 : undefined,
    bedGainDb,
    tailSeconds: params.tailSeconds,
    voiceDurationSeconds: params.voiceDurationSeconds,
  };
  const inputs = ['-i', params.voicePath, ...(bedPath ? ['-i', bedPath] : [])];

  let measured: MeasuredLoudness | undefined;
  try {
    const { stderr } = await execFileAsync(
      env.FFMPEG_PATH,
      ['-hide_banner', ...inputs, '-filter_complex', buildAudioFilterGraph({ ...graphBase, measureOnly: true }), '-map', '[outa]', '-f', 'null', '-'],
      { maxBuffer: FFMPEG_BUFFER },
    );
    measured = parseLoudnormJson(stderr);
  } catch (error) {
    console.error(`[long-render] loudnorm measuring pass failed, falling back to single-pass: ${error instanceof Error ? error.message : String(error)}`);
  }
  await ffmpeg([
    ...inputs,
    '-filter_complex', buildAudioFilterGraph({ ...graphBase, measured }),
    '-map', '[outa]',
    '-c:a', QUALITY_SPEC.audio.codec, '-b:a', `${QUALITY_SPEC.audio.bitrateKbps}k`, '-ar', String(QUALITY_SPEC.audio.sampleRate),
    params.outputPath,
  ]);
  return { audioPath: params.outputPath, durationSeconds: await probeSeconds(params.outputPath), bedChain, bedGainDb, measured };
}

// ---------------------------------------------------------------------------------------------
// Join + mux
// ---------------------------------------------------------------------------------------------

export async function joinAndMux(params: {
  chapterPaths: string[];
  audioPath: string;
  workDir: string;
  outputPath: string;
}): Promise<{ frameCount: number | null }> {
  const silentPath = path.join(params.workDir, 'video-silent.mp4');
  await concatCopy(params.chapterPaths, silentPath);
  await ffmpeg([
    '-i', silentPath, '-i', params.audioPath,
    '-map', '0:v', '-map', '1:a', '-c', 'copy',
    '-movflags', '+faststart',
    params.outputPath,
  ]);
  const { stdout } = await execFileAsync(env.FFPROBE_PATH, [
    '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=nb_frames', '-of', 'default=noprint_wrappers=1:nokey=1', params.outputPath,
  ]);
  const frames = parseInt(stdout.trim(), 10);
  await fs.unlink(silentPath).catch(() => undefined);
  return { frameCount: Number.isFinite(frames) ? frames : null };
}

export const LONG_PROFILE = renderProfileFor('long');
