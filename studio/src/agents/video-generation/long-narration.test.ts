import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

vi.hoisted(() => {
  process.env.MEDIA_STUB = '1';
});

import { narrateChapters, CHAPTER_GAP_SECONDS, CHUNK_GAP_SECONDS, splitIntoChunks } from './long-narration';

// Real ffmpeg, stubbed TTS/Whisper (MEDIA_STUB): checks the chunking, the gaps, the timings and the
// per-chunk cache without spending anything.
const sentence = 'The old bridge was built in 1412 and it still carries every load that crosses it today. ';
const chapters = [
  { title: 'Short one', text: sentence.repeat(3).trim() },
  { title: 'Very long', text: sentence.repeat(55).trim() }, // ~4,900 characters: two chunks
  { title: 'Last', text: sentence.repeat(2).trim() },
];

describe('narrateChapters (Sprint 4 Task 9, R3)', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'narration-'));
  });
  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('chunks the long chapter, joins with the gaps, and times each chapter', async () => {
    expect(splitIntoChunks(chapters[1].text).length).toBe(2);
    const paid: Array<{ ttsCharacters: number; transcriptionSeconds: number }> = [];
    const n = await narrateChapters({
      chapters,
      workDir: path.join(dir, 'work'),
      outputPath: path.join(dir, 'a.mp3'),
      onPaid: (p) => {
        paid.push(p);
      },
    });

    expect(n.chunks).toHaveLength(4);
    expect(n.chapterTimings).toHaveLength(3);
    // Gaps: 250 ms between chapters, 80 ms between the chunks of one chapter.
    expect(n.chapterTimings[1].startSec - n.chapterTimings[0].endSec).toBeCloseTo(CHAPTER_GAP_SECONDS, 2);
    expect(n.chunks[2].startSec - n.chunks[1].endSec).toBeCloseTo(CHUNK_GAP_SECONDS, 2);
    expect(n.chapterTimings[2].endSec).toBeLessThanOrEqual(n.durationSeconds + 0.1);
    expect(n.chapterTimings[2].endSec).toBeGreaterThan(n.durationSeconds - 0.3);
    // Word times are offset onto the full timeline and stay ordered.
    for (let i = 1; i < n.words.length; i += 1) expect(n.words[i].startMs).toBeGreaterThanOrEqual(n.words[i - 1].startMs);
    expect(n.words.at(-1)!.endMs / 1000).toBeLessThanOrEqual(n.durationSeconds + 0.2);
    // Spend is reported per request: a TTS call and a Whisper call for each chunk.
    expect(paid.filter((p) => p.ttsCharacters > 0)).toHaveLength(4);
    expect(paid.filter((p) => p.transcriptionSeconds > 0)).toHaveLength(4);
    expect(n.ttsCharacters).toBe(chapters.reduce((s, c) => s + splitIntoChunks(c.text).join('').length, 0));
  }, 120_000);

  it('a second call (retry or restart) pays for nothing: every chunk comes from the cache', async () => {
    const paid = vi.fn();
    const n = await narrateChapters({
      chapters,
      workDir: path.join(dir, 'work'),
      outputPath: path.join(dir, 'b.mp3'),
      onPaid: paid,
    });
    expect(paid).not.toHaveBeenCalled();
    expect(n.cachedChunks).toBe(4);
    expect(n.ttsCostUsd).toBe(0);
    expect(n.words.length).toBeGreaterThan(100);
  }, 120_000);
});
