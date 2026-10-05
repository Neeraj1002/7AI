import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from '../../config/env';
import { QUALITY_SPEC, type QualityMetrics } from '../video-generation/quality-spec';

// Sprint 4 Task 8 (R7) — deterministic quality measurement. Zero LLM cost.
// Everything is measured against the same QUALITY_SPEC the renderer (R1-R6)
// builds toward. Only HARD failures block (see hardFailureReason); everything
// else is recorded and shown to the human approver at Gate 2. A deterministic
// renderer issue won't fix itself on a regen, so blocking on soft metrics would
// just burn the regen budget.

const execFileAsync = promisify(execFile);
// ffmpeg writes filter stats to stderr and its null muxer produces no file.
const MAX_BUFFER = 64 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Pure parsers / evaluators (unit-tested)
// ---------------------------------------------------------------------------

export function parseEbur128Summary(stderr: string): { integratedLufs: number | null; truePeakDb: number | null } {
  const idx = stderr.lastIndexOf('Summary:');
  const tail = idx >= 0 ? stderr.slice(idx) : stderr;
  const i = /\bI:\s+(-?\d+(?:\.\d+)?|-inf)\s+LUFS/.exec(tail);
  const p = /\bPeak:\s+(-?\d+(?:\.\d+)?|-inf)\s+dBFS/.exec(tail);
  const num = (m: RegExpExecArray | null): number | null => {
    if (!m) return null;
    return m[1] === '-inf' ? -120 : parseFloat(m[1]);
  };
  return { integratedLufs: num(i), truePeakDb: num(p) };
}

export function parseSceneCutTimes(stderr: string): number[] {
  const times: number[] = [];
  for (const m of stderr.matchAll(/pts_time:(\d+(?:\.\d+)?)/g)) times.push(parseFloat(m[1]));
  return times;
}

export function summarizeShots(cutTimes: number[], durationSeconds: number): { longestShotSeconds: number; shotCount: number } {
  const bounds = [0, ...cutTimes.filter((t) => t > 0 && t < durationSeconds), durationSeconds].sort((a, b) => a - b);
  let longest = 0;
  for (let i = 1; i < bounds.length; i += 1) longest = Math.max(longest, bounds[i] - bounds[i - 1]);
  return { longestShotSeconds: Number(longest.toFixed(2)), shotCount: bounds.length - 1 };
}

export function parseFrameRate(rate: string | undefined): number | null {
  if (!rate) return null;
  const [n, d] = rate.split('/').map(Number);
  if (!Number.isFinite(n) || !d) return Number.isFinite(n) ? n : null;
  return n / d;
}

// The only things that BLOCK a video (deterministic fail, no LLM call): ones
// that would ship a visibly/audibly broken file.
export function hardFailureReason(m: QualityMetrics): string | null {
  if (!m.hasAudio) return 'Video has no audio track';
  const { width, height, fps } = QUALITY_SPEC.video;
  if (m.width !== width || m.height !== height) {
    return `Wrong resolution ${m.width}x${m.height} (expected ${width}x${height})`;
  }
  if (m.fps === null || Math.abs(m.fps - fps) > 0.1) {
    return `Wrong frame rate ${m.fps === null ? 'unknown' : m.fps.toFixed(2)} fps (expected ${fps} fps constant)`;
  }
  const { targetLufs, hardToleranceLufs } = QUALITY_SPEC.loudness;
  if (m.integratedLufs === null || Math.abs(m.integratedLufs - targetLufs) > hardToleranceLufs) {
    return `Loudness ${m.integratedLufs === null ? 'unmeasurable' : `${m.integratedLufs.toFixed(1)} LUFS`} is outside the ${targetLufs} ±${hardToleranceLufs} LUFS band`;
  }
  return null;
}

// Spec rows that missed but never block — recorded and shown at Gate 2.
export function collectSoftWarnings(m: Omit<QualityMetrics, 'softWarnings'>, visualSource: 'ai-stills' | 'stock-footage' | undefined): string[] {
  const w: string[] = [];
  const { targetLufs, toleranceLufs, maxTruePeakDb } = QUALITY_SPEC.loudness;
  if (m.integratedLufs !== null && Math.abs(m.integratedLufs - targetLufs) > toleranceLufs) {
    w.push(`Loudness ${m.integratedLufs.toFixed(1)} LUFS is outside ${targetLufs} ±${toleranceLufs}`);
  }
  if (m.truePeakDb !== null && m.truePeakDb > maxTruePeakDb) {
    w.push(`True peak ${m.truePeakDb.toFixed(1)} dBTP is above ${maxTruePeakDb}`);
  }
  if (m.videoCodec !== null && m.videoCodec !== QUALITY_SPEC.video.codec) w.push(`Video codec is ${m.videoCodec}, expected ${QUALITY_SPEC.video.codec}`);
  if (m.videoProfile !== null && m.videoProfile !== QUALITY_SPEC.video.profile) w.push(`H.264 profile is ${m.videoProfile}, expected ${QUALITY_SPEC.video.profile}`);
  if (m.pixFmt !== null && m.pixFmt !== QUALITY_SPEC.video.pixFmt) w.push(`Pixel format is ${m.pixFmt}, expected ${QUALITY_SPEC.video.pixFmt}`);
  if (m.audioSampleRate !== null && m.audioSampleRate !== QUALITY_SPEC.audio.sampleRate) w.push(`Audio sample rate is ${m.audioSampleRate} Hz, expected ${QUALITY_SPEC.audio.sampleRate}`);
  if (m.audioBitrateKbps !== null && m.audioBitrateKbps < QUALITY_SPEC.audio.minBitrateKbps) w.push(`Audio bitrate ${m.audioBitrateKbps} kbps is below ${QUALITY_SPEC.audio.minBitrateKbps}`);
  if (visualSource === 'ai-stills' && m.longestShotSeconds !== null && m.longestShotSeconds > QUALITY_SPEC.shot.maxSeconds) {
    w.push(`Longest single shot is ${m.longestShotSeconds.toFixed(1)}s (spec: ≤ ${QUALITY_SPEC.shot.maxSeconds}s)`);
  }
  if (visualSource === 'stock-footage' && m.shotCount !== null && m.shotCount < QUALITY_SPEC.stock.minBeats) {
    w.push(`Only ${m.shotCount} distinct shot(s) detected in a stock-footage video (spec: a cut per beat)`);
  }
  if (m.captionsExpected && m.captionsDetected === false) w.push('Captions are enabled but none were detected in the frame');
  return w;
}

// Compact, human-readable block for the Gate 2 message.
export function formatQualityMetrics(m: QualityMetrics): string {
  const f = (n: number | null, digits: number, unit: string) => (n === null ? 'n/a' : `${n.toFixed(digits)}${unit}`);
  const captions = !m.captionsExpected ? 'off' : m.captionsDetected === null ? 'unchecked' : m.captionsDetected ? 'detected' : 'NOT detected';
  const lines = [
    `Quality: ${f(m.integratedLufs, 1, ' LUFS')} / ${f(m.truePeakDb, 1, ' dBTP')} · ${m.width}x${m.height}@${f(m.fps, 0, 'fps')} ${m.videoCodec ?? '?'} ${m.videoProfile ?? ''} · longest shot ${f(m.longestShotSeconds, 1, 's')} (${m.shotCount ?? '?'} shots) · captions ${captions}`,
  ];
  if (m.softWarnings.length > 0) lines.push(`Quality notes: ${m.softWarnings.join('; ')}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Measurement (ffprobe / ffmpeg)
// ---------------------------------------------------------------------------

type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  profile?: string;
  pix_fmt?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  sample_rate?: string;
  bit_rate?: string;
};

async function probeStreams(videoPath: string): Promise<{ video?: ProbeStream; audio?: ProbeStream; durationSeconds: number }> {
  const { stdout } = await execFileAsync(
    env.FFPROBE_PATH,
    ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,profile,pix_fmt,width,height,r_frame_rate,avg_frame_rate,sample_rate,bit_rate:format=duration', '-of', 'json', videoPath],
    { maxBuffer: MAX_BUFFER },
  );
  const parsed = JSON.parse(stdout) as { streams?: ProbeStream[]; format?: { duration?: string } };
  const streams = parsed.streams ?? [];
  return {
    video: streams.find((s) => s.codec_type === 'video'),
    audio: streams.find((s) => s.codec_type === 'audio'),
    durationSeconds: parseFloat(parsed.format?.duration ?? '0'),
  };
}

async function measureLoudness(videoPath: string) {
  try {
    const { stderr } = await execFileAsync(env.FFMPEG_PATH, ['-hide_banner', '-nostats', '-i', videoPath, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-'], { maxBuffer: MAX_BUFFER });
    return parseEbur128Summary(stderr);
  } catch {
    return { integratedLufs: null, truePeakDb: null };
  }
}

async function measureShots(videoPath: string, durationSeconds: number) {
  try {
    const { stderr } = await execFileAsync(
      env.FFMPEG_PATH,
      ['-hide_banner', '-nostats', '-i', videoPath, '-an', '-vf', `select='gt(scene,${QUALITY_SPEC.shot.sceneThreshold})',showinfo`, '-f', 'null', '-'],
      { maxBuffer: MAX_BUFFER },
    );
    return summarizeShots(parseSceneCutTimes(stderr), durationSeconds);
  } catch {
    return { longestShotSeconds: null, shotCount: null };
  }
}

// Burned-in caption presence. The render writes `<attempt>.ass` beside
// `<attempt>.mp4` only when captions are on; sample the frame at up to three
// cue midpoints and look for the caption signature in the centre band: solid
// white glyph pixels AND black outline pixels. Returns null when it can't be
// evaluated (no cue file next to the video).
async function detectCaptions(videoPath: string): Promise<boolean | null> {
  const assPath = videoPath.replace(/\.mp4$/i, '.ass');
  let ass: string;
  try {
    ass = await fs.readFile(assPath, 'utf-8');
  } catch {
    return null;
  }
  const times: number[] = [];
  for (const m of ass.matchAll(/^Dialogue: \d+,(\d+):(\d+):(\d+)\.(\d+),(\d+):(\d+):(\d+)\.(\d+),/gm)) {
    const s = +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 100;
    const e = +m[5] * 3600 + +m[6] * 60 + +m[7] + +m[8] / 100;
    times.push((s + e) / 2);
  }
  if (times.length === 0) return false;
  const picks = [0.25, 0.5, 0.75].map((q) => times[Math.min(times.length - 1, Math.floor(times.length * q))]);
  const { height, width } = QUALITY_SPEC.video;
  const top = Math.round(height * QUALITY_SPEC.captions.bandTopFraction);
  const bandH = Math.round(height * (QUALITY_SPEC.captions.bandBottomFraction - QUALITY_SPEC.captions.bandTopFraction));
  let hits = 0;
  for (const t of picks) {
    try {
      const { stdout } = (await execFileAsync(
        env.FFMPEG_PATH,
        ['-v', 'error', '-ss', t.toFixed(2), '-i', videoPath, '-frames:v', '1', '-vf', `crop=${width}:${bandH}:0:${top},format=gray`, '-f', 'rawvideo', '-'],
        { maxBuffer: MAX_BUFFER, encoding: 'buffer' },
      )) as unknown as { stdout: Buffer };
      let white = 0;
      let black = 0;
      for (const px of stdout) {
        if (px >= 235) white += 1;
        else if (px <= 20) black += 1;
      }
      const total = stdout.length || 1;
      if (white / total >= 0.003 && black / total >= 0.003) hits += 1;
    } catch {
      /* a frame that can't be sampled just doesn't count as a hit */
    }
  }
  return hits >= 1;
}

export async function measureQualityMetrics(params: {
  videoPath: string;
  captionsEnabled: boolean;
  visualSource?: 'ai-stills' | 'stock-footage';
}): Promise<QualityMetrics> {
  const probe = await probeStreams(params.videoPath);
  const [loudness, shots, captionsDetected] = await Promise.all([
    probe.audio ? measureLoudness(params.videoPath) : Promise.resolve({ integratedLufs: null, truePeakDb: null }),
    measureShots(params.videoPath, probe.durationSeconds),
    params.captionsEnabled ? detectCaptions(params.videoPath) : Promise.resolve(null),
  ]);
  const v = probe.video;
  const a = probe.audio;
  const base: Omit<QualityMetrics, 'softWarnings'> = {
    integratedLufs: loudness.integratedLufs,
    truePeakDb: loudness.truePeakDb,
    width: v?.width ?? 0,
    height: v?.height ?? 0,
    fps: parseFrameRate(v?.avg_frame_rate ?? v?.r_frame_rate),
    videoCodec: v?.codec_name ?? null,
    videoProfile: v?.profile ?? null,
    pixFmt: v?.pix_fmt ?? null,
    audioCodec: a?.codec_name ?? null,
    audioSampleRate: a?.sample_rate ? Number(a.sample_rate) : null,
    audioBitrateKbps: a?.bit_rate ? Math.round(Number(a.bit_rate) / 1000) : null,
    hasAudio: Boolean(a),
    longestShotSeconds: shots.longestShotSeconds,
    shotCount: shots.shotCount,
    captionsExpected: params.captionsEnabled,
    captionsDetected,
  };
  return { ...base, softWarnings: collectSoftWarnings(base, params.visualSource) };
}
