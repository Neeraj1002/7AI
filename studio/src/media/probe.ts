import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from '../config/env';

const execFileAsync = promisify(execFile);

// Seconds of audio in a file, from ffprobe. Used to book duration-priced TTS models.
export async function probeAudioSeconds(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync(env.FFPROBE_PATH, [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath,
  ]);
  const seconds = parseFloat(stdout.trim());
  if (!Number.isFinite(seconds)) throw new Error(`ffprobe could not read the duration of ${filePath}`);
  return seconds;
}
