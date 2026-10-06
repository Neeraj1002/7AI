import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env';
import { NonTransientStageError, TransientStageError } from '../run-pipeline/retry-with-backoff';
import type { SearchClipParams, StockClip } from './types';
import { DATA_DIR } from '../config/paths';

// The only file allowed to touch the Pexels API — see
// docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md's boundary
// pattern, replicated here per Week 4 Task 1 (same as studio/src/media/
// did for OpenAI). Pexels has no official SDK; this uses plain `fetch`
// against its documented REST API. Everything this module returns is this
// project's own shape (types.ts); everything it catches is translated to the
// existing TransientStageError/NonTransientStageError taxonomy before it
// leaves this file.

const STOCK_FOOTAGE_TMP_DIR = path.resolve(DATA_DIR, 'stock-footage-tmp');
const PEXELS_SEARCH_URL = 'https://api.pexels.com/videos/search';

async function ensureTmpDir(): Promise<void> {
  await fs.mkdir(STOCK_FOOTAGE_TMP_DIR, { recursive: true });
}

type PexelsVideoFile = {
  id: number;
  quality: string;
  file_type: string;
  width: number | null;
  height: number | null;
  link: string;
};

type PexelsVideo = {
  id: number;
  duration: number;
  url: string;
  video_files: PexelsVideoFile[];
};

type PexelsSearchResponse = {
  videos: PexelsVideo[];
};

// Prefers a portrait (height > width) mp4 closest to 1080px wide — the
// assembly step scales/crops to exactly 1080x1920 regardless, but starting
// from a portrait source avoids cropping away most of a landscape frame.
function pickBestFile(files: PexelsVideoFile[]): PexelsVideoFile | undefined {
  const mp4s = files.filter((f) => f.file_type === 'video/mp4' && f.width && f.height);
  const portrait = mp4s.filter((f) => (f.height as number) > (f.width as number));
  const pool = portrait.length > 0 ? portrait : mp4s;
  return [...pool].sort((a, b) => Math.abs((a.width ?? 0) - 1080) - Math.abs((b.width ?? 0) - 1080))[0];
}

function mapHttpError(status: number, statusText: string, context: Record<string, unknown>): Error {
  if (status === 429 || status >= 500) {
    return new TransientStageError(`Pexels API call failed (retryable): ${status} ${statusText}`, undefined, context);
  }
  return new NonTransientStageError(`Pexels API call failed: ${status} ${statusText}`, undefined, context);
}

export async function searchAndDownloadClipViaProvider(params: SearchClipParams): Promise<StockClip> {
  await ensureTmpDir();
  const context = { provider: 'pexels' };
  try {
    const url = new URL(PEXELS_SEARCH_URL);
    url.searchParams.set('query', params.query);
    url.searchParams.set('orientation', params.orientation ?? 'portrait');
    url.searchParams.set('per_page', params.excludeSourceIds?.length ? '15' : '5');
    if (params.minDurationSeconds) {
      url.searchParams.set('min_duration', String(Math.ceil(params.minDurationSeconds)));
    }

    const searchResponse = await fetch(url, { headers: { Authorization: env.PEXELS_API_KEY } });
    if (!searchResponse.ok) {
      throw mapHttpError(searchResponse.status, searchResponse.statusText, context);
    }
    const data = (await searchResponse.json()) as PexelsSearchResponse;
    const excluded = new Set(params.excludeSourceIds ?? []);
    // First result not already used by an earlier attempt; if every result was used, fall back to the first.
    const video = data.videos.find((v) => !excluded.has(String(v.id))) ?? data.videos[0];
    if (!video) {
      throw new NonTransientStageError(`Pexels search returned no results for query '${params.query}'`, undefined, context);
    }
    const file = pickBestFile(video.video_files);
    if (!file) {
      throw new NonTransientStageError(`Pexels video ${video.id} has no usable mp4 file`, undefined, context);
    }

    const fileResponse = await fetch(file.link);
    if (!fileResponse.ok) {
      throw mapHttpError(fileResponse.status, fileResponse.statusText, context);
    }
    const arrayBuffer = await fileResponse.arrayBuffer();
    const clipPath = path.join(STOCK_FOOTAGE_TMP_DIR, `${randomUUID()}.mp4`);
    await fs.writeFile(clipPath, Buffer.from(arrayBuffer));

    return {
      clipPath,
      durationSeconds: video.duration,
      sourceId: String(video.id),
      sourceUrl: video.url,
      costUsd: '0.000000',
    };
  } catch (error) {
    if (error instanceof TransientStageError || error instanceof NonTransientStageError) throw error;
    throw new NonTransientStageError('Pexels API call failed with an unrecognized error', error, context);
  }
}
