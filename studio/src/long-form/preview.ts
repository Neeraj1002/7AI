import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from '../config/env';

const execFileAsync = promisify(execFile);

// Sprint 4 Task 10 (R3.1): the small copy Gate 2 plays on a phone. YouTube still gets the full file.
export const PREVIEW_SPEC = {
  width: 1280,
  height: 720,
  fps: 30,
  videoKbps: 1500,
  audioKbps: 96,
  preset: 'veryfast',
} as const;

export function previewPathFor(videoPath: string): string {
  return videoPath.replace(/\.mp4$/i, '') + '.preview.mp4';
}

export function buildPreviewArgs(inputPath: string, outputPath: string): string[] {
  const s = PREVIEW_SPEC;
  return [
    '-y',
    '-i', inputPath,
    '-vf', `scale=${s.width}:${s.height}`,
    '-r', String(s.fps),
    '-c:v', 'libx264',
    '-preset', s.preset,
    '-b:v', `${s.videoKbps}k`,
    '-maxrate', `${s.videoKbps}k`,
    '-bufsize', `${s.videoKbps * 2}k`,
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', `${s.audioKbps}k`,
    '-movflags', '+faststart',
    outputPath,
  ];
}

export async function createPreviewCopy(videoPath: string): Promise<string> {
  const out = previewPathFor(videoPath);
  await execFileAsync(env.FFMPEG_PATH, buildPreviewArgs(videoPath, out), { maxBuffer: 64 * 1024 * 1024 });
  return out;
}
