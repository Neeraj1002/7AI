import { mmss } from './long-video';

// Sprint 6 Task 1 (Gate 2 package screens, FE): types written from docs/execution/sprint6/contracts/task1-gate2-packaging.md
// (r2) and the pure helpers the new screens use, kept free of React so they can be tested. The server decides everything
// that matters (limits, title checks, what is live); the app only formats it. The types are hand-written because the
// backend adds these fields in Task 1 PR C (R11); the flip PR replaces them with the real AppRouter types.

export const YOUTUBE_SUGGESTED = 'youtube-suggested';

export type Gate2Package = {
  id: string;
  device: string;
  title: string;
  question: string;
  answeredAt: string;
  answeredAtParts?: { chapter: number | null; chapterTitle: string | null; startSec: number | null };
  round?: 1 | 2;
  hookLine?: string | null;
  firstFrameUrl?: string | null;
  imageUrls: { full: string; feed: string; sidebar: string } | null;
  coldReader?: { curiosity: number; wouldClick: string; guessedAbout: string } | null;
  stranger?: { wouldClick: string; expectsToSee: string; wantsToKnow: string; wouldDisappoint: string } | null;
  headToHead?: { wins: number; losses: number; ties: number } | null;
  answerQuote?: string | null;
  warnings: string[];
};

export type Gate2View = {
  status: 'ready' | 'weak_gap' | 'none_passed' | 'failed' | 'skipped';
  reason: string | null;
  brief: { question: string } | null;
  packages: Gate2Package[];
  dropped: Array<{ title: string; device: string; reasons: string[] }>;
  choice: { packageId: string; title: string | null; titleEdited: boolean } | null;
  titleLimit: number;
  videoSeconds: number | null;
  packagingCostUsd?: number;
  round?: 1 | 2;
};

export type Gate2Response = { pending: boolean; making?: boolean; view: Gate2View | null };

export type TitleProblem = {
  kind: 'unsupported_figure' | 'too_long' | 'empty' | 'other';
  text: string | null;
  message: string;
  supportedFigures: string[];
};
export type TitleCheck = { ok: boolean; length: number; titleLimit: number; problems: TitleProblem[] };

export type ThumbnailResult = {
  status: 'live' | 'not_applied' | 'pending' | 'not_set';
  reasonText: string | null;
  source: 'package' | 'youtube-suggested' | 'frame-grab';
  packageId: string | null;
  fileUrl: string | null;
};

// ---- which screen ---------------------------------------------------------------------------------------------------

export type Gate2Screen = 'none' | 'making' | 'pending' | 'cards' | 'short' | 'no_package';

// A Short has no 16:9 image (imageUrls null) and one package; the cards are the Video swipe cards otherwise.
export const isShortPackaging = (view: Gate2View): boolean => view.packages.length > 0 && view.packages.every((p) => p.imageUrls === null);

export function gate2Screen(response: Gate2Response | undefined): Gate2Screen {
  if (!response) return 'none';
  if (response.making) return 'making';
  if (response.pending) return 'pending';
  const view = response.view;
  if (!view) return 'none';
  if (view.status !== 'ready') return 'no_package';
  if (view.packages.length === 0) return 'no_package';
  return isShortPackaging(view) ? 'short' : 'cards';
}

// Approve, choose and edit are not shown while the packages are made (the approval is not open yet).
export const canChoose = (response: Gate2Response | undefined): boolean => gate2Screen(response) === 'cards' || gate2Screen(response) === 'short';

// Whether to ask the run query for packaging at all: while Gate 2 is open or being prepared, and once published.
export function packagingQueryWanted(run: { status: string; currentStage?: string | null }, isLong: boolean): boolean {
  if (!isLong) return false;
  if (run.status === 'paused_gate2' || run.status === 'completed') return true;
  return (run.status === 'running' || run.status === 'pending') && (run.currentStage === 'video_review' || run.currentStage === 'gate2');
}

export const packagingPollMs = (response: Gate2Response | undefined, runStatus: string): number | false =>
  response?.making || response?.pending || (runStatus !== 'paused_gate2' && runStatus !== 'completed') ? 4_000 : false;

// ---- the cards ------------------------------------------------------------------------------------------------------

// The duration chip is drawn by the card, never baked into the picture file.
export const durationChip = (videoSeconds: number | null | undefined): string | null =>
  typeof videoSeconds === 'number' && videoSeconds > 0 ? mmss(videoSeconds) : null;

// "Answered at" chip: the parts when the server sends them ("Chapter 3 / 4:20", a Short: "0:18 in the video"), else the string.
export function answeredChip(p: Gate2Package): string {
  const a = p.answeredAtParts;
  if (a && a.startSec !== null) {
    const t = mmss(a.startSec);
    return a.chapter !== null ? `Chapter ${a.chapter} / ${t}` : `${t} in the video`;
  }
  if (a && a.chapter !== null) return `Chapter ${a.chapter}`;
  return p.answeredAt;
}

export const isSecondRound = (p: Gate2Package): boolean => p.round === 2;
export const isChosen = (view: Gate2View, p: Gate2Package): boolean => view.choice?.packageId === p.id;
export const isTitleEdited = (view: Gate2View, p: Gate2Package): boolean => isChosen(view, p) && Boolean(view.choice?.titleEdited);
export const keptYoutube = (view: Gate2View): boolean => view.choice?.packageId === YOUTUBE_SUGGESTED;
export const cardTitle = (view: Gate2View, p: Gate2Package): string => (isChosen(view, p) && view.choice?.title ? view.choice.title : p.title);

export const packageLabel = (index: number, total: number): string => `Package ${index + 1} of ${total}`;

// "Why this works": the server's own check text, joined; never worded by the app.
export function whyThisWorks(p: Gate2Package): string | null {
  const parts: string[] = [];
  if (p.stranger?.expectsToSee) parts.push(p.stranger.expectsToSee.trim());
  else if (p.coldReader?.guessedAbout) parts.push(p.coldReader.guessedAbout.trim());
  if (p.answerQuote) parts.push(`The video says: "${p.answerQuote.trim()}"`);
  return parts.length > 0 ? parts.join(' ') : null;
}

export const quietLinkLabel = (short: boolean): string => (short ? 'Use the script’s own title and hook' : 'Keep YouTube’s suggested thumbnail');
export const keptLabel = (short: boolean): string =>
  short ? 'Using the script’s own title and hook.' : 'Using YouTube’s suggested thumbnail. The title comes from the script.';
export const downloadLabel = (short: boolean): string => (short ? 'Download frame' : 'Download image');

// The line above Approve in the bottom bar.
export function statusLine(view: Gate2View): { text: string; tone: 'pending' | 'done' } {
  const short = isShortPackaging(view);
  if (!view.choice) return { text: 'Nothing chosen yet. Choose a package, or keep YouTube’s thumbnail.', tone: 'pending' };
  if (view.choice.packageId === YOUTUBE_SUGGESTED) {
    return { text: short ? 'Using the script’s own title and hook.' : 'Using YouTube’s suggested thumbnail. Title from the script.', tone: 'done' };
  }
  const index = view.packages.findIndex((p) => p.id === view.choice!.packageId);
  const title = view.choice.title ?? view.packages[index]?.title ?? '';
  return { text: `Using package ${index + 1}${view.choice.titleEdited ? ' (title edited)' : ''}: ${title}`, tone: 'done' };
}

// Approve with nothing chosen asks first. Only when there are packages to choose from: with none, YouTube's is already the option.
export const approveNeedsAsk = (response: Gate2Response | undefined): boolean => {
  if (gate2Screen(response) !== 'cards' && gate2Screen(response) !== 'short') return false;
  return !response?.view?.choice;
};

// ---- Edit title -----------------------------------------------------------------------------------------------------

export const counterText = (length: number, limit: number): string => `${length} / ${limit}`;

export type TitleSegment = { text: string; highlight: boolean };

// Splits the title so each server-named `problem.text` can be shown highlighted. No rule of its own: only finds the text.
export function highlightSegments(title: string, problems: TitleProblem[]): TitleSegment[] {
  const needles = [...new Set(problems.map((p) => p.text).filter((t): t is string => Boolean(t)))];
  if (needles.length === 0 || !title) return [{ text: title, highlight: false }];
  const ranges: Array<[number, number]> = [];
  for (const n of needles) {
    let from = 0;
    for (;;) {
      const at = title.indexOf(n, from);
      if (at < 0) break;
      ranges.push([at, at + n.length]);
      from = at + n.length;
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  const out: TitleSegment[] = [];
  let pos = 0;
  for (const [s, e] of merged) {
    if (s > pos) out.push({ text: title.slice(pos, s), highlight: false });
    out.push({ text: title.slice(s, e), highlight: true });
    pos = e;
  }
  if (pos < title.length) out.push({ text: title.slice(pos), highlight: false });
  return out;
}

export const supportedFiguresOf = (problems: TitleProblem[]): string[] => [...new Set(problems.flatMap((p) => p.supportedFigures))];

export type SaveState = 'checking' | 'blocked' | 'ready';
// Save is blocked until the server says ok; while a check is in flight (or none has come back for this text) it waits.
export function saveState(check: TitleCheck | null, checkedTitle: string | null, currentTitle: string): SaveState {
  if (!check || checkedTitle !== currentTitle) return 'checking';
  return check.ok ? 'ready' : 'blocked';
}
export const SAVE_BLOCKED_NOTE = 'Fix the title above to save it.';
export const SAVE_CHECKING_NOTE = 'Checking the title…';

// ---- No package -----------------------------------------------------------------------------------------------------

export type NoPackageCopy = { head: string; lead: string; reasons: string[] };

export function noPackageCopy(view: Gate2View): NoPackageCopy {
  const reason = view.reason?.trim() ? [view.reason.trim()] : [];
  if (view.status === 'weak_gap') {
    return { head: 'This script doesn’t raise a strong question', lead: 'We made no package rather than promise something the video doesn’t deliver.', reasons: reason };
  }
  if (view.status === 'none_passed') {
    const tried = view.round === 2 ? ['We tried twice: the first set and one automatic second round. Nothing passed.'] : [];
    const dropped = view.dropped.map((d, i) => `Package ${i + 1}: ${d.reasons.join(' ')}`.trim());
    return { head: 'Nothing passed our checks', lead: 'We’d rather not publish something that could mislead viewers.', reasons: [...tried, ...(dropped.length > 0 ? dropped : reason)] };
  }
  if (view.status === 'skipped') {
    return { head: 'No packages this time', lead: 'This video’s spend limit left no room to make them.', reasons: [...reason, 'Your video itself is not affected.'] };
  }
  return { head: 'We couldn’t make packages', lead: 'Something stopped them from being made. Nothing is blocked.', reasons: reason };
}

// ---- Making ---------------------------------------------------------------------------------------------------------

export function makingCopy(round: 1 | 2 | undefined): { title: string; sub: string } {
  return round === 2
    ? { title: 'Making a second set…', sub: 'The first set didn’t pass our checks, so we’re trying once more. We try once, then stop.' }
    : { title: 'Making your packages…', sub: 'They’ll be here when you come back.' };
}
export const packagingCostLine = (usd: number | undefined, round: 1 | 2 | undefined): string | null =>
  typeof usd === 'number' ? `Packaging so far $${usd.toFixed(2)}${round === 2 ? ', including the second round' : ''}` : null;

// ---- After publishing -----------------------------------------------------------------------------------------------

export type ThumbnailCard =
  | { kind: 'live'; tag: string; downloadable: false }
  | { kind: 'not_applied'; tag: string; reasonText: string | null; downloadable: boolean }
  | { kind: 'pending'; tag: string; downloadable: false }
  | { kind: 'youtube_chose'; line: string }
  | { kind: 'frame_grab' }
  | null;

// The app never shows a custom thumbnail as live unless the status is `live`. The reason text is the server's.
export function thumbnailCard(t: ThumbnailResult | null | undefined): ThumbnailCard {
  if (!t) return null;
  if (t.source === 'frame-grab') return { kind: 'frame_grab' };
  if (t.source === 'youtube-suggested' || t.status === 'not_set') return { kind: 'youtube_chose', line: 'YouTube chose the thumbnail' };
  if (t.status === 'live') return { kind: 'live', tag: 'Live on YouTube', downloadable: false };
  if (t.status === 'not_applied') return { kind: 'not_applied', tag: 'Not on YouTube', reasonText: t.reasonText, downloadable: Boolean(t.fileUrl) };
  return { kind: 'pending', tag: 'Applying', downloadable: false };
}
