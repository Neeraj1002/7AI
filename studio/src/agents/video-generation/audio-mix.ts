import { QUALITY_SPEC } from './quality-spec';

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

export function buildAudioFilterGraph(params: {
  voiceInputIndex: number;
  bedInputIndex?: number;
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
    return `[${params.voiceInputIndex}:a]${finalStage}[${out}]`;
  }
  return [
    `[${params.voiceInputIndex}:a]asplit=2[voice][key]`,
    `[${params.bedInputIndex}:a]volume=${bed.preGainDb}dB[bedq]`,
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
