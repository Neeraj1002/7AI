import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from '../../config/env';

const execFileAsync = promisify(execFile);

// A finished Short whose audio track has holes must fail with a plain reason, never reach Gate 2. Normal speech pauses are
// encoded as audio packets, so they leave no hole in the packet timestamps: only missing audio does.

// The longest silence-free gap allowed between two consecutive audio packet timestamps.
export const AUDIO_MAX_GAP_SECONDS = 0.5;
// Fewer packets than this share of what the audio's length needs means audio is missing.
export const AUDIO_MIN_PACKET_FRACTION = 0.98;
// An AAC packet holds 1024 samples.
const AAC_SAMPLES_PER_PACKET = 1024;

export type AudioTimeline = {
  // Presentation time of every audio packet, in seconds.
  packetTimes: number[];
  durationSeconds: number;
  sampleRate: number;
};

export async function probeAudioTimeline(filePath: string): Promise<AudioTimeline> {
  const { stdout } = await execFileAsync(
    env.FFPROBE_PATH,
    ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate,duration:packet=pts_time', '-of', 'json', filePath],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  const parsed = JSON.parse(stdout) as { streams?: Array<{ sample_rate?: string; duration?: string }>; packets?: Array<{ pts_time?: string }> };
  const stream = parsed.streams?.[0];
  return {
    packetTimes: (parsed.packets ?? []).map((p) => Number(p.pts_time)).filter((t) => Number.isFinite(t)).sort((a, b) => a - b),
    durationSeconds: Number(stream?.duration),
    sampleRate: Number(stream?.sample_rate),
  };
}

export function audioTimelineProblem(timeline: AudioTimeline): string | null {
  const { packetTimes, durationSeconds, sampleRate } = timeline;
  if (packetTimes.length === 0) return 'The finished video has no audio packets, so the voiceover is missing from the file.';

  let largestGap = 0;
  let gapAt = 0;
  for (let i = 1; i < packetTimes.length; i += 1) {
    const gap = packetTimes[i] - packetTimes[i - 1];
    if (gap > largestGap) {
      largestGap = gap;
      gapAt = packetTimes[i - 1];
    }
  }
  if (largestGap > AUDIO_MAX_GAP_SECONDS) {
    return `The finished video's audio has a hole of ${largestGap.toFixed(1)}s at ${gapAt.toFixed(1)}s: part of the voiceover is missing from the file.`;
  }

  if (Number.isFinite(durationSeconds) && Number.isFinite(sampleRate) && sampleRate > 0) {
    const needed = (durationSeconds * sampleRate) / AAC_SAMPLES_PER_PACKET;
    if (packetTimes.length < needed * AUDIO_MIN_PACKET_FRACTION) {
      return `The finished video's audio has ${packetTimes.length} packets but its ${durationSeconds.toFixed(1)}s needs about ${Math.round(needed)}: part of the voiceover is missing from the file.`;
    }
  }
  return null;
}
