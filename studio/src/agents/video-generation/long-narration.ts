import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { synthesizeSpeech, transcribe, resolveMediaPurpose, type TranscriptSegment } from '../../media';
import { env } from '../../config/env';
import { NonTransientStageError, TransientStageError } from '../../run-pipeline/retry-with-backoff';
import type { ScriptChapter } from '../script-generation/long-form';

const execFileAsync = promisify(execFile);

// Sprint 4 Task 9 (R3): narration for a long-form video, one TTS request per chapter (a chapter
// over the provider's 4,096-character limit is split at sentence boundaries), joined with short
// silences, with Whisper run per chunk so its 25 MB upload limit is never an issue. Every chunk
// is cached on disk by a hash of (voice, model, text), so a retry or a restart after a crash
// never pays for a finished chunk twice.

export const TTS_CHUNK_MAX_CHARS = 4_000;
export const CHAPTER_GAP_SECONDS = 0.25;
export const CHUNK_GAP_SECONDS = 0.08;
// The transcription endpoint rejects uploads over 25 MB.
export const WHISPER_MAX_BYTES = 25 * 1024 * 1024;
const CHUNK_MAX_ATTEMPTS = 3;
const CHUNK_RETRY_BASE_MS = 2_000;

// Splits at sentence ends, packing whole sentences into chunks under maxChars. A single sentence
// longer than maxChars is split at the last space before the limit (then, failing that, hard).
export function splitIntoChunks(text: string, maxChars = TTS_CHUNK_MAX_CHARS): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed ? [trimmed] : [];
  const sentences = trimmed.match(/[^.!?…]+(?:[.!?…]+["'”’)\]]*|$)\s*/g) ?? [trimmed];
  const chunks: string[] = [];
  let current = '';
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };
  for (const raw of sentences) {
    let sentence = raw;
    while (sentence.length > maxChars) {
      const cut = sentence.lastIndexOf(' ', maxChars);
      const at = cut > 0 ? cut : maxChars;
      if (current.length + at > maxChars) push();
      current += sentence.slice(0, at);
      push();
      sentence = sentence.slice(at);
    }
    if (current.length + sentence.length > maxChars) push();
    current += sentence;
  }
  push();
  return chunks;
}

export type NarrationChunk = {
  chapterIndex: number;
  chunkIndex: number;
  text: string;
  audioPath: string;
  characterCount: number;
  startSec: number;
  endSec: number;
};

export type ChapterTiming = { title: string; startSec: number; endSec: number };

export type NarrationPaid = {
  chapterIndex: number;
  chunkIndex: number;
  ttsCharacters: number;
  ttsCostUsd: number;
  transcriptionSeconds: number;
  transcriptionCostUsd: number;
};

export type LongNarration = {
  audioPath: string;
  durationSeconds: number;
  chapterTimings: ChapterTiming[];
  chunks: NarrationChunk[];
  // Whisper words for the whole narration, each chunk's times offset to its place on the timeline.
  words: TranscriptSegment[];
  ttsCharacters: number;
  ttsCostUsd: number;
  transcriptionSeconds: number;
  transcriptionCostUsd: number;
  cachedChunks: number;
};

export async function probeAudioDurationSeconds(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync(env.FFPROBE_PATH, [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  const seconds = parseFloat(stdout.trim());
  if (!Number.isFinite(seconds)) throw new NonTransientStageError(`ffprobe could not read the duration of ${filePath}`);
  return seconds;
}

type CachedChunk = { characterCount: number; ttsCostUsd: number; words: TranscriptSegment[]; transcriptionSeconds: number; transcriptionCostUsd: number };

function chunkKey(voice: string | undefined, ttsModel: string, text: string): string {
  return crypto.createHash('sha256').update([voice ?? '', ttsModel, text].join('\u0000')).digest('hex').slice(0, 32);
}

async function withChunkRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (!(error instanceof TransientStageError) || attempt >= CHUNK_MAX_ATTEMPTS) throw error;
      const waitMs = CHUNK_RETRY_BASE_MS * 2 ** (attempt - 1);
      console.warn(`[long-narration] ${label} failed (${error.message}); retrying this chunk only in ${waitMs}ms (attempt ${attempt}/${CHUNK_MAX_ATTEMPTS})`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

async function silenceFile(dir: string, seconds: number): Promise<string> {
  const file = path.join(dir, `silence-${Math.round(seconds * 1000)}ms.mp3`);
  try {
    await fs.access(file);
  } catch {
    await execFileAsync(env.FFMPEG_PATH, [
      '-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', seconds.toFixed(3), '-c:a', 'libmp3lame', '-b:a', '64k', file,
    ]);
  }
  return file;
}

// Joins the pieces in order into one mp3 at a common format (so a stub or a differently-encoded
// chunk cannot desync the concat).
async function joinAudio(inputs: string[], outputPath: string): Promise<void> {
  const labels = inputs.map((_, i) => `[${i}:a]aresample=24000,aformat=sample_fmts=fltp:channel_layouts=mono[a${i}]`);
  const filter = `${labels.join(';')};${inputs.map((_, i) => `[a${i}]`).join('')}concat=n=${inputs.length}:v=0:a=1[out]`;
  await execFileAsync(env.FFMPEG_PATH, [
    '-y', ...inputs.flatMap((p) => ['-i', p]), '-filter_complex', filter, '-map', '[out]', '-c:a', 'libmp3lame', '-b:a', '128k', outputPath,
  ], { maxBuffer: 16 * 1024 * 1024 });
}

export async function narrateChapters(params: {
  chapters: ScriptChapter[];
  voice?: string;
  // A folder under the run's own video folder; chunk audio and word timings are cached here.
  workDir: string;
  outputPath: string;
  // Called as soon as each chunk's TTS and Whisper calls are paid for (never for a cache hit).
  onPaid?: (paid: NarrationPaid) => Promise<void> | void;
}): Promise<LongNarration> {
  await fs.mkdir(params.workDir, { recursive: true });
  const ttsModel = resolveMediaPurpose('tts').model;
  const chunks: NarrationChunk[] = [];
  const words: TranscriptSegment[] = [];
  const pieces: string[] = [];
  const chapterTimings: ChapterTiming[] = [];
  const totals = { ttsCharacters: 0, ttsCostUsd: 0, transcriptionSeconds: 0, transcriptionCostUsd: 0, cachedChunks: 0 };
  let cursor = 0;

  for (let ci = 0; ci < params.chapters.length; ci += 1) {
    const chapter = params.chapters[ci];
    if (ci > 0) {
      pieces.push(await silenceFile(params.workDir, CHAPTER_GAP_SECONDS));
      cursor += CHAPTER_GAP_SECONDS;
    }
    const chapterStart = cursor;
    const texts = splitIntoChunks(chapter.text);
    if (texts.length === 0) throw new NonTransientStageError(`Chapter ${ci + 1} ("${chapter.title}") has no text to narrate`);

    for (let ki = 0; ki < texts.length; ki += 1) {
      const text = texts[ki];
      if (ki > 0) {
        pieces.push(await silenceFile(params.workDir, CHUNK_GAP_SECONDS));
        cursor += CHUNK_GAP_SECONDS;
      }
      const key = chunkKey(params.voice, ttsModel, text);
      const audioPath = path.join(params.workDir, `${key}.mp3`);
      const metaPath = path.join(params.workDir, `${key}.json`);
      let meta: CachedChunk | undefined;
      try {
        meta = JSON.parse(await fs.readFile(metaPath, 'utf-8')) as CachedChunk;
        await fs.access(audioPath);
        totals.cachedChunks += 1;
      } catch {
        meta = undefined;
      }
      if (!meta) {
        const label = `chapter ${ci + 1} chunk ${ki + 1}`;
        // The TTS call is paid for as soon as it returns: the audio and its cost are kept and booked
        // right away, so a failure in the Whisper call below cannot make a retry pay for it again.
        const ttsMetaPath = path.join(params.workDir, `${key}.tts.json`);
        let ttsMeta: { characterCount: number; ttsCostUsd: number } | undefined;
        try {
          ttsMeta = JSON.parse(await fs.readFile(ttsMetaPath, 'utf-8')) as { characterCount: number; ttsCostUsd: number };
          await fs.access(audioPath);
        } catch {
          ttsMeta = undefined;
        }
        if (!ttsMeta) {
          const tts = await withChunkRetry(`${label} TTS`, () => synthesizeSpeech(text, { voice: params.voice }));
          await fs.copyFile(tts.audioPath, audioPath);
          // MEDIA_STUB keeps the spoken text beside its audio; carry it along so the stub transcription still works.
          await fs.copyFile(`${tts.audioPath}.stub-text.txt`, `${audioPath}.stub-text.txt`).catch(() => undefined);
          ttsMeta = { characterCount: tts.characterCount, ttsCostUsd: Number(tts.costUsd) };
          await fs.writeFile(ttsMetaPath, JSON.stringify(ttsMeta), 'utf-8');
          totals.ttsCharacters += ttsMeta.characterCount;
          totals.ttsCostUsd += ttsMeta.ttsCostUsd;
          await params.onPaid?.({ chapterIndex: ci, chunkIndex: ki, ttsCharacters: ttsMeta.characterCount, ttsCostUsd: ttsMeta.ttsCostUsd, transcriptionSeconds: 0, transcriptionCostUsd: 0 });
        }
        const size = (await fs.stat(audioPath)).size;
        if (size > WHISPER_MAX_BYTES) {
          throw new NonTransientStageError(
            `Narration for chapter ${ci + 1} ("${chapter.title}") chunk ${ki + 1} is ${(size / 1024 / 1024).toFixed(1)} MB, over the 25 MB transcription limit. Shorten the chapter.`,
          );
        }
        const asr = await withChunkRetry(`${label} transcription`, () => transcribe(audioPath));
        meta = {
          characterCount: ttsMeta.characterCount,
          ttsCostUsd: ttsMeta.ttsCostUsd,
          words: asr.segments,
          transcriptionSeconds: asr.audioDurationSeconds,
          transcriptionCostUsd: Number(asr.costUsd),
        };
        await fs.writeFile(metaPath, JSON.stringify(meta), 'utf-8');
        totals.transcriptionSeconds += meta.transcriptionSeconds;
        totals.transcriptionCostUsd += meta.transcriptionCostUsd;
        await params.onPaid?.({
          chapterIndex: ci,
          chunkIndex: ki,
          ttsCharacters: 0,
          ttsCostUsd: 0,
          transcriptionSeconds: meta.transcriptionSeconds,
          transcriptionCostUsd: meta.transcriptionCostUsd,
        });
      }

      const duration = await probeAudioDurationSeconds(audioPath);
      const offsetMs = Math.round(cursor * 1000);
      for (const w of meta.words) words.push({ text: w.text, startMs: w.startMs + offsetMs, endMs: w.endMs + offsetMs });
      pieces.push(audioPath);
      chunks.push({ chapterIndex: ci, chunkIndex: ki, text, audioPath, characterCount: meta.characterCount, startSec: cursor, endSec: cursor + duration });
      cursor += duration;
    }
    chapterTimings.push({ title: chapter.title, startSec: chapterStart, endSec: cursor });
  }

  await joinAudio(pieces, params.outputPath);
  const durationSeconds = await probeAudioDurationSeconds(params.outputPath);
  return { audioPath: params.outputPath, durationSeconds, chapterTimings, chunks, words, ...totals };
}
