import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from '../config/env';
import type { SynthesizeSpeechResult, TranscribeResult, TranscriptSegment, VoiceConfig } from './types';
import { DATA_DIR } from '../config/paths';

// Testing-only stand-ins for the real OpenAI-backed calls, used only when
// MEDIA_STUB=1 — no OPENAI_API_KEY has been available in any session so far.
// Same reasoning as Week 1's stubParseBrief: deliberately minimal, not a
// realistic TTS/ASR engine, but real enough that downstream FFmpeg assembly
// and caption-burning logic (Task 2+) has genuine audio and plausible
// word-level timing to work with, not empty/fake-shaped data.

const execFileAsync = promisify(execFile);
const MEDIA_TMP_DIR = path.resolve(DATA_DIR, 'media-tmp');

// Roughly matches natural speaking pace (~150 words/minute at ~5 chars/word)
// so the placeholder clip's duration is plausible relative to the input text
// length, not an arbitrary fixed duration regardless of script length.
const CHARS_PER_SECOND = 12.5;
const MIN_DURATION_SECONDS = 1;

async function ensureTmpDir(): Promise<void> {
  await fs.mkdir(MEDIA_TMP_DIR, { recursive: true });
}

export async function stubSynthesizeSpeech(
  text: string,
  _voiceConfig: VoiceConfig,
): Promise<SynthesizeSpeechResult> {
  await ensureTmpDir();
  const durationSeconds = Math.max(MIN_DURATION_SECONDS, Math.round((text.length / CHARS_PER_SECOND) * 10) / 10);
  const audioPath = path.join(MEDIA_TMP_DIR, `${randomUUID()}.mp3`);

  // A quiet, short tone clip — real, playable audio (not a zero-byte or
  // silent file that could mask a broken FFmpeg pipeline downstream).
  await execFileAsync(env.FFMPEG_PATH, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=440:duration=${durationSeconds}`,
    '-af',
    'volume=0.1',
    audioPath,
  ]);

  // Sidecar file carrying the original text. The real transcribe() contract
  // only takes an audioPath (matching OpenAI's real API shape — transcription
  // is audio-in only), so this is how the stub recovers "what was actually
  // said" to fabricate plausible word segments later, without changing
  // transcribe()'s real signature to smuggle text through it.
  await fs.writeFile(`${audioPath}.stub-text.txt`, text, 'utf-8');

  return {
    audioPath,
    characterCount: text.length,
    costUsd: (text.length * 0.00003).toFixed(6), // matches tts-1-hd's real per-character rate
  };
}

export async function stubTranscribe(audioPath: string): Promise<TranscribeResult> {
  const audioDurationSeconds = await probeDurationSeconds(audioPath);

  let sourceText: string;
  try {
    sourceText = await fs.readFile(`${audioPath}.stub-text.txt`, 'utf-8');
  } catch {
    sourceText = 'stub transcription placeholder text no original script was available for';
  }

  const words = sourceText.split(/\s+/).filter(Boolean);
  const segments = words.length > 0 ? spaceWordsOverDuration(words, audioDurationSeconds) : [];

  return {
    segments,
    audioDurationSeconds,
    costUsd: (audioDurationSeconds * (0.006 / 60)).toFixed(6), // matches whisper-1's real per-second rate
  };
}

function spaceWordsOverDuration(words: string[], durationSeconds: number): TranscriptSegment[] {
  const totalMs = durationSeconds * 1000;
  const perWordMs = totalMs / words.length;
  return words.map((word, i) => ({
    text: word,
    startMs: Math.round(i * perWordMs),
    endMs: Math.round((i + 1) * perWordMs),
  }));
}

async function probeDurationSeconds(audioPath: string): Promise<number> {
  const { stdout } = await execFileAsync(env.FFPROBE_PATH, [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    audioPath,
  ]);
  return parseFloat(stdout.trim());
}
