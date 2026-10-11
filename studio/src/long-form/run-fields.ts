import type { ChapterTiming } from './chapters';
import { readChapterTimings } from './artifacts';

// Sprint 4 Task 10 (R3.2): the long-form fields runs.get returns. Pure apart from the injected
// `sign` (R2 presign), so it is testable without R2. For a Short none of this is called.

type Stage = { stageName: string; status: string; attemptNumber: number; output: unknown };

export const LINK_TTL_SECONDS = 24 * 60 * 60; // same as runs.getVideoUrl

function latestCompleted(stages: Stage[], name: string): Stage | undefined {
  return stages
    .filter((s) => s.stageName === name && s.status === 'completed' && s.output)
    .sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
}

// chapters from the script ({title, text}) joined with the rendered timings ({startSec}).
// Task 9's runs.get shape had {title, text}; the app also needs startSec, so the result carries
// both (a superset of each shape).
export function mergeChapters(
  scriptChapters: { title: string; text: string }[] | undefined,
  timings: ChapterTiming[] | undefined,
): { title: string; text?: string; startSec?: number }[] | undefined {
  if (timings && timings.length > 0) {
    return timings.map((t, i) => ({
      title: t.title,
      startSec: t.startSec,
      ...(scriptChapters?.[i] && { text: scriptChapters[i].text }),
    }));
  }
  return scriptChapters;
}

export type LongFormUrls = {
  previewUrl?: string;
  videoUrl?: string;
  subtitlesUrl?: string;
  subtitlesUploaded?: boolean;
  subtitlesMessage?: string;
  chapters?: { title: string; text?: string; startSec?: number }[];
};

export async function deriveLongFormRunFields(params: {
  runId: string;
  stages: Stage[];
  scriptChapters: { title: string; text: string }[] | undefined;
  // Signs an R2 key; undefined when R2 is not configured (then the local routes are used).
  sign?: (key: string) => Promise<string>;
}): Promise<LongFormUrls> {
  const { runId, stages, sign } = params;
  const out: LongFormUrls = {};
  const videoGen = latestCompleted(stages, 'video_generation');
  const review = latestCompleted(stages, 'video_review')?.output as
    | { previewPath?: string; srtPath?: string; r2PreviewKey?: string; r2SrtKey?: string }
    | undefined;
  const publishing = latestCompleted(stages, 'publishing')?.output as
    | { r2FinalKey?: string; subtitlesUploaded?: boolean; subtitlesMessage?: string }
    | undefined;
  const draft = (videoGen?.output as { r2DraftKey?: string } | undefined)?.r2DraftKey;

  const link = async (r2Key: string | undefined, localPath: string | undefined, route: string) => {
    if (sign && r2Key) return sign(r2Key);
    return localPath ? `/runs/${runId}/${route}` : undefined;
  };

  const previewUrl = await link(review?.r2PreviewKey, review?.previewPath, 'preview');
  if (previewUrl) out.previewUrl = previewUrl;
  const subtitlesUrl = await link(review?.r2SrtKey, review?.srtPath, 'subtitles');
  if (subtitlesUrl) out.subtitlesUrl = subtitlesUrl;
  const videoKey = publishing?.r2FinalKey ?? draft;
  const videoUrl = await link(videoKey, (videoGen?.output as { videoPath?: string } | undefined)?.videoPath, 'video');
  if (videoUrl) out.videoUrl = videoUrl;

  if (publishing && typeof publishing.subtitlesUploaded === 'boolean') {
    out.subtitlesUploaded = publishing.subtitlesUploaded;
    if (!publishing.subtitlesUploaded && publishing.subtitlesMessage) out.subtitlesMessage = publishing.subtitlesMessage;
  }

  const chapters = mergeChapters(params.scriptChapters, readChapterTimings(videoGen?.output));
  if (chapters) out.chapters = chapters;
  return out;
}
