// Sprint 4 Task 8 — the single, shared definition of "render quality floor".
// R1–R6 build toward these numbers; R7's deterministic gate (Video
// Intelligence) measures against the same constants, so the renderer and the
// gate can never drift apart. Mirrors the "Quality spec" table in
// docs/execution/sprint4/tasks/task8.md.

export const QUALITY_SPEC = {
  video: {
    width: 1080,
    height: 1920,
    fps: 30,
    codec: 'h264',
    profile: 'High',
    pixFmt: 'yuv420p',
    crf: 20,
    preset: 'medium',
  },
  audio: {
    codec: 'aac',
    sampleRate: 48000,
    bitrateKbps: 192,
    // Quality-spec floor for the measured output bitrate (recorded, not blocking).
    minBitrateKbps: 160,
  },
  loudness: {
    targetLufs: -14,
    // Spec target band (recorded and shown, not blocking).
    toleranceLufs: 1,
    // R7 hard-block band: outside -14 ±3 LUFS the video is shipped broken.
    hardToleranceLufs: 3,
    // Quality-spec ceiling for the measured true peak (dBTP).
    maxTruePeakDb: -1.0,
    // loudnorm's own TP target leaves headroom under the ceiling above.
    normalizeTruePeakDb: -1.5,
    normalizeLra: 11,
  },
  bed: {
    // Bed is levelled to sit this far under the measured voice BEFORE ducking, so
    // the balance holds for any bed track (the synthetic beds are very quiet;
    // real licensed tracks are not). Sidechain ducking then removes more.
    targetBelowVoiceDb: 15,
    // Clamp on the computed gain so a bad measurement can't blow the bed up.
    minGainDb: -40,
    maxGainDb: 12,
    sidechainThreshold: 0.02,
    sidechainRatio: 8,
    sidechainAttackMs: 20,
    sidechainReleaseMs: 300,
    // Quality spec: bed >= 12 dB below the voice while speech is present.
    minDuckDb: 12,
  },
  shot: {
    // Spec: max time on one visual (ai-stills). Recorded, not blocking.
    maxSeconds: 4.0,
    sceneThreshold: 0.3,
  },
  captions: {
    playResX: 1080,
    playResY: 1920,
    safeMarginX: 90,
    // Centre band of the frame, as fractions of height from the top.
    bandTopFraction: 0.45,
    bandBottomFraction: 0.7,
  },
  pacing: {
    wordsPerSecond: 2.7,
    secondsPerStill: 2.5,
    minStills: 6,
    maxStills: 20,
  },
  stock: {
    minBeats: 3,
    maxBeats: 8,
  },
} as const;

export type QualityMetrics = {
  integratedLufs: number | null;
  truePeakDb: number | null;
  width: number;
  height: number;
  // Declared constant rate (ffprobe r_frame_rate) — what the hard gate checks.
  fps: number | null;
  // Average rate (frames / duration): differs slightly from fps after concat
  // rounding; only a large gap indicates variable frame rate.
  avgFps: number | null;
  videoCodec: string | null;
  videoProfile: string | null;
  pixFmt: string | null;
  audioCodec: string | null;
  audioSampleRate: number | null;
  audioBitrateKbps: number | null;
  hasAudio: boolean;
  longestShotSeconds: number | null;
  shotCount: number | null;
  captionsExpected: boolean;
  captionsDetected: boolean | null;
  // Spec rows that missed but are recorded-only (never block).
  softWarnings: string[];
};
