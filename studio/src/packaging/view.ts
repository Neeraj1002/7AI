import path from 'node:path';
import { formatTimestamp, type ChapterTiming } from '../long-form/chapters';
import { thumbnailsDir, type PackageRecord, type PackagingOutput } from './build';
import { packagingRound } from './gate2-contract';
import type { ShortOpening } from './opening';
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
  // PR B: what a stranger who saw only the picture and the title said, the head to head, and anything the founder
  // should know. Advisory: none of it picks a package.
  stranger: { about: string; expectsToSee: string; wantsToKnow: string; wouldClick: 'yes' | 'maybe' | 'no'; wouldDisappoint: string } | null;
  headToHead: { wins: number; losses: number; ties: number } | null;
  // Where in the script the answer sits, copied from the script (the payoff check found it).
  answerQuote: string | null;
  warnings: string[];
  // R10: 2 when this option came from the second round.
  round: 1 | 2;
  // The contract (B1): the chip may use either this or the string above.
  answeredAtParts: { chapter: number | null; chapterTitle: string | null; startSec: number | null };
  // A Short has a hook line and a first frame and no 16:9 picture; a long video's package is the other way round.
  hookLine: string | null;
  firstFrameUrl: string | null;
  imageUrls: Record<ThumbSize, string> | null;
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
  // R10: whether a second round was made (finished), not made for lack of budget (skipped), or not needed.
  // R7 advisory: the question is not opened in the first ten seconds of narration.
  openingNote: string | null;
  secondRound: { state: 'not_needed' | 'started' | 'finished' | 'skipped'; reason: string | null };
  // The contract (B1): 2 after the one automatic extra round.
  round: 1 | 2;
  // Text and pictures so far, both rounds, from the usage rows; filled in by the router.
  packagingCostUsd: number;
  // A Short has its opening and no options to choose from; its title is written at publish.
  kind: 'long' | 'short';
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
  packagingCostUsd?: number;
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
      stranger: p.checks
        ? { about: p.checks.critic.about, expectsToSee: p.checks.critic.expectsToSee, wantsToKnow: p.checks.critic.wantsToKnow, wouldClick: p.checks.critic.wouldClick, wouldDisappoint: p.checks.critic.wouldDisappoint }
        : null,
      headToHead: p.checks ? { wins: p.checks.headToHead.wins, losses: p.checks.headToHead.losses, ties: p.checks.headToHead.ties } : null,
      answerQuote: p.checks?.payoff.questionAnswered ? p.checks.payoff.answerQuote : null,
      warnings: p.warnings ?? [],
      round: p.round ?? 1,
      answeredAtParts: { chapter: p.answeredAt.chapter, chapterTitle: p.answeredAt.chapterTitle, startSec: timingStart(p, params.chapterTimings) },
      hookLine: null,
      firstFrameUrl: null,
      imageUrls: Object.fromEntries(THUMB_SIZES.map((s) => [s, params.linkFor ? params.linkFor(p.id, s) : `/runs/${runId}/thumbnail/${p.id}/${s}`])) as Record<ThumbSize, string>,
    })),
    dropped: packaging.dropped.map((d) => ({ title: d.title, device: d.device, stage: d.stage, reasons: d.reasons })),
    choice: packaging.choice ? { packageId: packaging.choice.packageId, title: packaging.choice.title, titleEdited: packaging.choice.titleEdited } : null,
    titleLimit: packaging.titleLimit,
    videoSeconds: params.videoSeconds ?? null,
    openingNote: packaging.openingNote ?? null,
    secondRound: { state: packaging.roundTwo?.state ?? 'not_needed', reason: packaging.roundTwo?.reason ?? null },
    round: packagingRound(packaging),
    packagingCostUsd: params.packagingCostUsd ?? Math.round((packaging.textCostUsd + packaging.imageCostUsd) * 10000) / 10000,
    kind: 'long',
  };
}

function timingStart(p: PackageRecord, timings: ChapterTiming[] | undefined): number | null {
  const t = p.answeredAt.chapterTitle ? timings?.find((x) => x.title === p.answeredAt.chapterTitle) : undefined;
  return t ? Math.round(t.startSec) : p.answeredAt.startSec;
}

export const OPENING_PACKAGE_ID = 'opening';
export const OPENING_FRAME_FILE = 'opening-frame.jpg';

// A Short's package (R7): the hook line and the first frame, from `creationOptions.opening`. It cannot be chosen (the video is already
// the product) and has no title yet: the title is written when the Short is published.
export function buildShortView(params: {
  runId: string;
  opening: Pick<ShortOpening, 'hookLine' | 'firstStillPrompt' | 'question' | 'device' | 'note' | 'reasons' | 'textCostUsd' | 'answerQuote'>;
  frameExists: boolean;
  videoSeconds?: number | null;
  packagingCostUsd?: number;
  linkFor?: (packageId: string, size: string) => string;
}): PackagingView {
  const { opening } = params;
  const hasOpening = Boolean(opening.hookLine || opening.firstStillPrompt);
  return {
    status: hasOpening ? 'ready' : 'none_passed',
    reason: hasOpening ? null : opening.reasons.join(' ') || 'This Short has no hook line or first picture from the brief.',
    brief: { question: opening.question, whatPeopleBelieve: '', whatTheRecordSays: '', promise: '' },
    packages: hasOpening
      ? [{
          id: OPENING_PACKAGE_ID, device: opening.device as CuriosityDevice, supportingDevice: null, title: '', question: opening.question,
          answeredAt: 'In the script', lettering: { words: '', subline: null, typeface: '' }, readableAtSidebar: true, coldReader: null, stranger: null, headToHead: null,
          answerQuote: opening.answerQuote || null, warnings: opening.reasons, round: 1,
          answeredAtParts: { chapter: null, chapterTitle: null, startSec: null },
          hookLine: opening.hookLine,
          firstFrameUrl: params.frameExists ? (params.linkFor ? params.linkFor(OPENING_PACKAGE_ID, 'frame') : `/runs/${params.runId}/thumbnail/${OPENING_PACKAGE_ID}/frame`) : null,
          imageUrls: null,
        }]
      : [],
    dropped: [],
    choice: null,
    titleLimit: 0,
    videoSeconds: params.videoSeconds ?? null,
    openingNote: opening.note,
    secondRound: { state: 'not_needed', reason: null },
    round: 1,
    packagingCostUsd: params.packagingCostUsd ?? opening.textCostUsd,
    kind: 'short',
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
