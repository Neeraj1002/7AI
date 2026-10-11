import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { searchStockFootage } from '../../stock-footage';
import { env } from '../../config/env';
import { QUALITY_SPEC } from './quality-spec';

// Sprint 4 Task 8 (R5) — the stock-footage path as a shot list: one clip per
// story beat, trimmed to its window, normalised to 1080x1920@30 and
// concatenated. Replaces "Pexels' first result for one query, looped under
// the whole voiceover" (zero cuts, Columbus clip looped 3x). No clip ever
// loops; a stock failure propagates as a real stage failure — it is never a
// silent switch to ai-stills (that would make containsSyntheticMedia wrong).

const execFileAsync = promisify(execFile);
const { width: W, height: H, fps: FPS } = QUALITY_SPEC.video;
// The final mux uses -shortest against the voiceover; the picture only needs to
// be at least as long as the audio, so pad a hair past it.
const TAIL_PAD_SECONDS = 0.25;

export type ShotSegmentPlan = {
  // How much of the clip to use (seconds, from its start).
  useSeconds: number;
  // Seconds of last-frame hold to append — only ever non-zero on the final
  // segment, when the footage still falls short of the voiceover.
  holdSeconds: number;
};

// Pure, unit-tested. `positionSeconds` is how much picture is already built.
// A middle clip shorter than its window just contributes what it has — the
// deficit rolls into the following beats (their window END is the target, not
// their length). Only the last clip is ever extended (frame hold), instead of
// looping anything.
export function planShotSegment(params: {
  positionSeconds: number;
  windowEndSeconds: number;
  clipSeconds: number;
  isLast: boolean;
  totalSeconds: number;
}): ShotSegmentPlan {
  const target = params.isLast
    ? params.totalSeconds + TAIL_PAD_SECONDS - params.positionSeconds
    : Math.max(0.1, params.windowEndSeconds - params.positionSeconds);
  const useSeconds = Math.max(0.1, Math.min(params.clipSeconds, target));
  const holdSeconds = params.isLast ? Math.max(0, target - useSeconds) : 0;
  return { useSeconds, holdSeconds };
}

async function probeSeconds(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync(env.FFPROBE_PATH, [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  return parseFloat(stdout.trim());
}

// Bugs Closure R6 — Task 8 skips clips already used *within* one attempt; a Gate 2 revise is a new
// attempt, so the clips earlier attempts of the run used are excluded too (otherwise the same
// Pexels first result comes back and the revision looks identical).
export function excludedSourceIds(previousAttemptIds: string[] | undefined, thisAttemptIds: string[]): string[] {
  return [...new Set([...(previousAttemptIds ?? []), ...thisAttemptIds])];
}

export type StockShotListResult = {
  sourceIds: string[];
  queries: string[];
  clipCount: number;
};

export async function buildStockShotList(params: {
  queries: string[];
  windows: Array<{ startMs: number; endMs: number }>;
  totalDurationMs: number;
  outputPath: string;
  // Clips earlier attempts of this run used (omit for a first attempt).
  previouslyUsedSourceIds?: string[];
}): Promise<StockShotListResult> {
  const { queries, windows } = params;
  const usedIds: string[] = [];
  const segmentPaths: string[] = [];
  const concatListPath = `${params.outputPath}.concat-list.txt`;
  const totalSeconds = params.totalDurationMs / 1000;
  let position = 0;

  try {
    for (let i = 0; i < queries.length; i += 1) {
      const windowSeconds = Math.max(1, (windows[i].endMs - windows[i].startMs) / 1000);
      const clip = await searchStockFootage({
        query: queries[i],
        orientation: 'portrait',
        // Ask Pexels for clips long enough to cover this beat, so no clip needs
        // freezing to fill its window.
        minDurationSeconds: windowSeconds,
        excludeSourceIds: excludedSourceIds(params.previouslyUsedSourceIds, usedIds),
      });
      usedIds.push(clip.sourceId);

      const realClipSeconds = await probeSeconds(clip.clipPath);
      const seg = planShotSegment({
        positionSeconds: position,
        windowEndSeconds: windows[i].endMs / 1000,
        clipSeconds: Number.isFinite(realClipSeconds) ? realClipSeconds : clip.durationSeconds,
        isLast: i === queries.length - 1,
        totalSeconds,
      });

      const segmentPath = `${params.outputPath}.shot-${i}.mp4`;
      segmentPaths.push(segmentPath);
      const filters = [
        `scale=${W}:${H}:force_original_aspect_ratio=increase`,
        `crop=${W}:${H}`,
        `fps=${FPS}`,
        'setsar=1',
        ...(seg.holdSeconds > 0 ? [`tpad=stop_mode=clone:stop_duration=${seg.holdSeconds.toFixed(3)}`] : []),
      ].join(',');
      await execFileAsync(env.FFMPEG_PATH, [
        '-y',
        '-i',
        clip.clipPath,
        '-t',
        (seg.useSeconds + seg.holdSeconds).toFixed(3),
        '-vf',
        filters,
        '-an',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '18',
        '-pix_fmt',
        QUALITY_SPEC.video.pixFmt,
        segmentPath,
      ]);
      position += seg.useSeconds + seg.holdSeconds;
    }

    const list = segmentPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
    await fs.writeFile(concatListPath, list, 'utf-8');
    await execFileAsync(env.FFMPEG_PATH, ['-y', '-f', 'concat', '-safe', '0', '-i', concatListPath, '-c', 'copy', params.outputPath]);
    return { sourceIds: usedIds, queries, clipCount: usedIds.length };
  } finally {
    await Promise.all([...segmentPaths, concatListPath].map((p) => fs.unlink(p).catch(() => undefined)));
  }
}
