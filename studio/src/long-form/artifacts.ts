import path from 'node:path';
import fs from 'node:fs/promises';
import type { ChapterTiming } from './chapters';

// Sprint 4 Task 10: readers for what Task 9 PR B stores on the video_generation stage output.
// Tolerant on purpose: a Short, or a long run rendered before these fields existed, yields
// undefined rather than throwing.

export function readChapterTimings(output: unknown): ChapterTiming[] | undefined {
  const raw = (output as { chapterTimings?: unknown } | null | undefined)?.chapterTimings;
  if (!Array.isArray(raw)) return undefined;
  const out: ChapterTiming[] = [];
  for (const c of raw) {
    const t = c as Partial<ChapterTiming> | null;
    if (!t || typeof t.title !== 'string' || typeof t.startSec !== 'number' || typeof t.endSec !== 'number') return undefined;
    out.push({ title: t.title, startSec: t.startSec, endSec: t.endSec });
  }
  return out.length > 0 ? out : undefined;
}

// Local path of captions.srt: the explicit field, else the file beside the video.
export async function findSrtPath(output: unknown, videoPath: string): Promise<string | undefined> {
  const explicit = (output as { captionsSrtPath?: unknown } | null | undefined)?.captionsSrtPath;
  const candidates = [
    typeof explicit === 'string' ? explicit : undefined,
    videoPath.replace(/\.mp4$/i, '.srt'),
    path.join(path.dirname(videoPath), 'captions.srt'),
  ].filter((p): p is string => Boolean(p));
  for (const p of candidates) {
    try {
      await fs.access(p);
      return p;
    } catch {
      /* try next */
    }
  }
  return undefined;
}
