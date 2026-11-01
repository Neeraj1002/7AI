import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from '../config/env';

const execFileAsync = promisify(execFile);

// The first line of `ffmpeg -version` ("ffmpeg version 8.0.1-3ubuntu2 Copyright ..."), so a render problem can be tied to
// the exact build that made it (a filter that works on one ffmpeg release can cut a picture on another).
export function ffmpegVersionLine(versionOutput: string): string {
  const first = versionOutput.split('\n')[0]?.trim();
  return first ? first.replace(/\s+Copyright.*$/, '') : 'unknown';
}

let cached: Promise<string> | undefined;

export function ffmpegVersion(): Promise<string> {
  cached ??= execFileAsync(env.FFMPEG_PATH, ['-version']).then(
    (r) => ffmpegVersionLine(r.stdout),
    () => 'unknown (ffmpeg could not be run)',
  );
  return cached;
}

export async function logFfmpegVersion(context: string): Promise<void> {
  console.log(`[ffmpeg] ${context}: ${await ffmpegVersion()} (${env.FFMPEG_PATH})`);
}
