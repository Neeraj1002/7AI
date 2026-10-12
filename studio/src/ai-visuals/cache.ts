import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from '../config/paths';

// Sprint 4 Task 9 (R5.4): a per-run disk cache of generated stills, keyed by a hash of
// (model, size, quality, final prompt text). A retry or a restart reads it and generates only
// the missing stills, so paid work is never paid for twice. Never shared across runs, and
// removed when the run reaches a terminal state.

const CACHE_ROOT = path.resolve(DATA_DIR, 'ai-visuals-cache');

export function stillsCacheDir(runId: string): string {
  return path.join(CACHE_ROOT, runId);
}

export function stillCacheKey(params: { model: string; size: string; quality: string; prompt: string }): string {
  return crypto
    .createHash('sha256')
    .update([params.model, params.size, params.quality, params.prompt].join('\u0000'))
    .digest('hex');
}

export function stillCachePath(cacheDir: string, key: string): string {
  return path.join(cacheDir, `${key}.png`);
}

export async function cachedStillExists(filePath: string): Promise<boolean> {
  try {
    return (await fs.stat(filePath)).size > 0;
  } catch {
    return false;
  }
}

// Best-effort: a leftover folder is harmless disk, never a reason to fail a run.
export async function removeStillsCache(runId: string): Promise<void> {
  try {
    await fs.rm(stillsCacheDir(runId), { recursive: true, force: true });
  } catch (error) {
    console.error(`[ai-visuals] could not remove the stills cache for run ${runId}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Everything a long-form run keeps only to be resumable: the stills cache above plus its narration
// chunks, chapter segments and mixed audio. The finished videos in data/videos/<runId> stay.
export async function removeRunWorkFiles(runId: string): Promise<void> {
  await removeStillsCache(runId);
  try {
    await fs.rm(path.join(DATA_DIR, 'videos', runId, 'work'), { recursive: true, force: true });
  } catch (error) {
    console.error(`[ai-visuals] could not remove the work files for run ${runId}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
