import path from 'node:path';
import { formatTimestamp, type ChapterTiming } from '../long-form/chapters';
import { thumbnailsDir, type PackageRecord, type PackagingOutput } from './build';
import { THUMB_SIZES, YOUTUBE_SUGGESTED, type CuriosityDevice, type ThumbSize } from './constants';

// What the app is allowed to see of a run's packaging: no file paths, no image prompts, no model text beyond what
// the founder reads. Pictures are fetched from GET /runs/:id/thumbnail/:packageId/:size (tenant-checked).

export type PackageView = {
  id: string;
  device: CuriosityDevice;
  supportingDevice: CuriosityDevice | null;
  title: string;
  // "viewers will ask: ..."
  question: string;
  // "answered at: ..."
  answeredAt: string;
  lettering: { words: string; subline: string | null; typeface: string };
  readableAtSidebar: boolean;
  coldReader: { curiosity: number; wouldClick: 'yes' | 'maybe' | 'no'; guessedAbout: string } | null;
  imageUrls: Record<ThumbSize, string>;
};

export type PackagingView = {
  status: PackagingOutput['status'];
  // Why there are no packages, in plain words (a weak gap, a refusal, a failure).
  reason: string | null;
  brief: { question: string; whatPeopleBelieve: string; whatTheRecordSays: string; promise: string } | null;
  packages: PackageView[];
  dropped: Array<{ title: string; device: CuriosityDevice; stage: string; reasons: string[] }>;
  choice: { packageId: string; title: string | null; titleEdited: boolean } | null;
  titleLimit: number;
  videoSeconds: number | null;
};

// The time label is read from the video that is current now, so a Revise that moves a chapter is reflected.
function answeredLabel(p: PackageRecord, timings: ChapterTiming[] | undefined): string {
  const n = p.answeredAt.chapter;
  if (!n) return 'In the script';
  const timing = p.answeredAt.chapterTitle ? timings?.find((t) => t.title === p.answeredAt.chapterTitle) : undefined;
  const at = timing ? `, about ${formatTimestamp(Math.round(timing.startSec))}` : '';
  return `Chapter ${n}${p.answeredAt.chapterTitle ? `, ${p.answeredAt.chapterTitle}` : ''}${at}`;
}

export function buildPackagingView(params: {
  runId: string;
  packaging: PackagingOutput;
  chapterTimings?: ChapterTiming[];
  videoSeconds?: number | null;
  // Mints the address of one picture; the router passes a signed, one-hour link. Without one the plain
  // path is used and the caller must send its own Authorization header.
  linkFor?: (packageId: string, size: ThumbSize) => string;
}): PackagingView {
  const { runId, packaging } = params;
  return {
    status: packaging.status,
    reason: packaging.reason,
    brief: packaging.brief
      ? { question: packaging.brief.question, whatPeopleBelieve: packaging.brief.whatPeopleBelieve, whatTheRecordSays: packaging.brief.whatTheRecordSays, promise: packaging.brief.promise }
      : null,
    packages: packaging.packages.map((p) => ({
      id: p.id,
      device: p.device,
      supportingDevice: p.supportingDevice,
      title: p.title,
      question: p.question,
      answeredAt: answeredLabel(p, params.chapterTimings),
      lettering: { words: p.lettering.words, subline: p.lettering.subline, typeface: p.recipe.typefaceFamily },
      readableAtSidebar: p.lettering.readableAtSidebar,
      coldReader: p.coldReader,
      imageUrls: Object.fromEntries(THUMB_SIZES.map((s) => [s, params.linkFor ? params.linkFor(p.id, s) : `/runs/${runId}/thumbnail/${p.id}/${s}`])) as Record<ThumbSize, string>,
    })),
    dropped: packaging.dropped.map((d) => ({ title: d.title, device: d.device, stage: d.stage, reasons: d.reasons })),
    choice: packaging.choice ? { packageId: packaging.choice.packageId, title: packaging.choice.title, titleEdited: packaging.choice.titleEdited } : null,
    titleLimit: packaging.titleLimit,
    videoSeconds: params.videoSeconds ?? null,
  };
}

// The file for one package and size, or null when the id or size is not one this run made. The name comes from the
// stored record, never from the request.
export function thumbnailFileFor(runId: string, packaging: PackagingOutput | null, packageId: string, size: string): { dir: string; name: string } | null {
  if (!packaging || !(THUMB_SIZES as readonly string[]).includes(size)) return null;
  const record = packaging.packages.find((p) => p.id === packageId);
  if (!record) return null;
  return { dir: thumbnailsDir(runId), name: path.basename(record.files[size as ThumbSize]) };
}

// The package the founder chose, if it is a custom one. YouTube's suggested thumbnail (or no choice) is null.
export function chosenPackage(packaging: PackagingOutput | null): PackageRecord | null {
  const choice = packaging?.choice;
  if (!packaging || !choice || choice.packageId === YOUTUBE_SUGGESTED) return null;
  return packaging.packages.find((p) => p.id === choice.packageId) ?? null;
}
