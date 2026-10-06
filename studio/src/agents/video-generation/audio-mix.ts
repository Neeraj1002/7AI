import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from '../../config/env';
import { QUALITY_SPEC } from './quality-spec';
import { parseEbur128Summary } from '../video-intelligence/quality-metrics';

const execFileAsync = promisify(execFile);

// Sprint 4 Task 8 (R1) — audio mastering graph, built as a pure function so
// the exact filter string is unit-testable. Always produces a chain (even with
// no bed): the voiceover alone used to ship at ~-25 LUFS because nothing in
// the old graph ever normalised loudness.
//
// With a bed: the voice is split; one copy is the sidechain KEY that ducks the
// (pre-attenuated) bed via sidechaincompress, the other copy is mixed with the
// ducked bed. amix runs with normalize=0 so it never rescales either input
// (the default would halve both and undo the ducking balance).
// Final stage, always: loudnorm to the YouTube loudness target.

export type MeasuredLoudness = {
  inputI: number;
  inputTp: number;
  inputLra: number;
  inputThresh: number;
  targetOffset: number;
};

function loudnormFilter(measured?: MeasuredLoudness): string {
  const { targetLufs, normalizeTruePeakDb, normalizeLra } = QUALITY_SPEC.loudness;
  const base = `loudnorm=I=${targetLufs}:TP=${normalizeTruePeakDb}:LRA=${normalizeLra}`;
  if (!measured) return base;
  return (
    `${base}:measured_I=${measured.inputI}:measured_TP=${measured.inputTp}` +
    `:measured_LRA=${measured.inputLra}:measured_thresh=${measured.inputThresh}` +
    `:offset=${measured.targetOffset}:linear=true`
  );
}

// TTS is mono; output is always stereo (the bed's stereo image is kept, and
// stereo AAC at 192k actually reaches the >=160 kbps spec where mono VBR doesn't).
const STEREO = 'aformat=channel_layouts=stereo';

export function buildAudioFilterGraph(params: {
  voiceInputIndex: number;
  bedInputIndex?: number;
  // Gain applied to the bed before ducking (see computeBedGainDb).
  bedGainDb?: number;
  measured?: MeasuredLoudness;
  // Pass 1 stops before the final loudnorm so the measurement sees the mix.
  measureOnly?: boolean;
  outLabel?: string;
}): string {
  const out = params.outLabel ?? 'outa';
  const { bed } = QUALITY_SPEC;
  const finalStage = params.measureOnly
    ? `loudnorm=I=${QUALITY_SPEC.loudness.targetLufs}:TP=${QUALITY_SPEC.loudness.normalizeTruePeakDb}:LRA=${QUALITY_SPEC.loudness.normalizeLra}:print_format=json`
    : `${loudnormFilter(params.measured)},aresample=${QUALITY_SPEC.audio.sampleRate}`;

  if (params.bedInputIndex === undefined) {
    return `[${params.voiceInputIndex}:a]${STEREO},${finalStage}[${out}]`;
  }
  return [
    `[${params.voiceInputIndex}:a]${STEREO},asplit=2[voice][key]`,
    `[${params.bedInputIndex}:a]${STEREO},volume=${(params.bedGainDb ?? 0).toFixed(1)}dB[bedq]`,
    `[bedq][key]sidechaincompress=threshold=${bed.sidechainThreshold}:ratio=${bed.sidechainRatio}:attack=${bed.sidechainAttackMs}:release=${bed.sidechainReleaseMs}[ducked]`,
    `[voice][ducked]amix=inputs=2:duration=first:normalize=0[mix]`,
    `[mix]${finalStage}[${out}]`,
  ].join(';');
}

// ffmpeg prints loudnorm's measurement JSON block at the end of stderr.
export function parseLoudnormJson(stderr: string): MeasuredLoudness | undefined {
  const start = stderr.lastIndexOf('{');
  const end = stderr.lastIndexOf('}');
  if (start === -1 || end < start) return undefined;
  try {
    const raw = JSON.parse(stderr.slice(start, end + 1)) as Record<string, string>;
    const num = (key: string): number => {
      const v = Number(raw[key]);
      if (!Number.isFinite(v)) throw new Error(`bad ${key}`);
      return v;
    };
    return {
      inputI: num('input_i'),
      inputTp: num('input_tp'),
      inputLra: num('input_lra'),
      inputThresh: num('input_thresh'),
      targetOffset: num('target_offset'),
    };
  } catch {
    return undefined;
  }
}

// Gain that puts the bed targetBelowVoiceDb under the voice, from each one's
// measured integrated loudness. Null measurements (unmeasurable audio) fall
// back to no change rather than guessing.
export function computeBedGainDb(voiceLufs: number | null, bedLufs: number | null): number {
  if (voiceLufs === null || bedLufs === null) return 0;
  const { targetBelowVoiceDb, minGainDb, maxGainDb } = QUALITY_SPEC.bed;
  const gain = voiceLufs - targetBelowVoiceDb - bedLufs;
  return Math.min(maxGainDb, Math.max(minGainDb, Number(gain.toFixed(1))));
}

const bedLufsCache = new Map<string, number | null>();

// Integrated loudness (ebur128) of an audio file's first 60 s; bed results are
// cached per path (a handful of small local files, measured once per process).
async function runLoudnessScan(filePath: string): Promise<number | null> {
  try {
    const { stderr } = await execFileAsync(
      env.FFMPEG_PATH,
      ['-hide_banner', '-nostats', '-t', '60', '-i', filePath, '-af', 'ebur128', '-f', 'null', '-'],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    return parseEbur128Summary(stderr).integratedLufs;
  } catch {
    return null;
  }
}

export async function measureIntegratedLufs(filePath: string, options: { cache?: boolean } = {}): Promise<number | null> {
  if (options.cache && bedLufsCache.has(filePath)) return bedLufsCache.get(filePath) ?? null;
  const lufs = await runLoudnessScan(filePath);
  if (options.cache) bedLufsCache.set(filePath, lufs);
  return lufs;
}
