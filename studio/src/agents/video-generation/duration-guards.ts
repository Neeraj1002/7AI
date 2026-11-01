import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from '../../config/env';
import { FINAL_LENGTH_TOLERANCE_SECONDS, VOICE_LENGTH_TOLERANCE_SECONDS } from './quality-spec';

const execFileAsync = promisify(execFile);

// A render whose length disagrees with its own voiceover must fail with a plain reason, never pass quietly. Two
// measurements of the same voice, and the finished file against the voice, are compared; each check returns the reason
// to fail the stage with, or null.

export async function probeMediaSeconds(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync(env.FFPROBE_PATH, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath]);
  const seconds = parseFloat(stdout.trim());
  if (!Number.isFinite(seconds)) throw new Error(`ffprobe could not read the duration of ${filePath}`);
  return seconds;
}

export function voiceLengthMismatch(voiceFileSeconds: number, transcriptionSeconds: number): string | null {
  const gap = Math.abs(voiceFileSeconds - transcriptionSeconds);
  if (gap <= VOICE_LENGTH_TOLERANCE_SECONDS) return null;
  return `The voiceover file is ${voiceFileSeconds.toFixed(1)}s but the transcription heard ${transcriptionSeconds.toFixed(1)}s (they differ by ${gap.toFixed(1)}s), so the picture would be built to the wrong length. Nothing was rendered.`;
}

export function finalLengthMismatch(finalSeconds: number, voiceSeconds: number, tailSeconds: number): string | null {
  const expected = voiceSeconds + tailSeconds;
  const gap = Math.abs(finalSeconds - expected);
  if (gap <= FINAL_LENGTH_TOLERANCE_SECONDS) return null;
  return `The finished video is ${finalSeconds.toFixed(1)}s but the voiceover is ${voiceSeconds.toFixed(1)}s (expected about ${expected.toFixed(1)}s with the end tail): the video is ${finalSeconds < expected ? 'cut off before the voiceover ends' : 'longer than the voiceover'}.`;
}

// The built stock picture must cover the voiceover (the shot list only holds the last frame for the end tail).
export function pictureLengthMismatch(pictureSeconds: number, voiceSeconds: number): string | null {
  if (pictureSeconds >= voiceSeconds - FINAL_LENGTH_TOLERANCE_SECONDS) return null;
  return `The stock picture is ${pictureSeconds.toFixed(1)}s but the voiceover is ${voiceSeconds.toFixed(1)}s: footage was lost while the shot list was assembled.`;
}
