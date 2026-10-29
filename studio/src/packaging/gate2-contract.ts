import { checkTitle, type ConceptIssue } from './check';
import type { PackagingOutput } from './build';
import { YOUTUBE_SUGGESTED } from './constants';

// Task 1 R11 / the Gate 2 contract (sprint6/contracts/task1-gate2-packaging.md, r2): the pure parts of what the app's package screens
// need from the server. Nothing here adds a rule: titles go through `checkTitle`, the same function `choosePackage` uses.

// ---- B3. The live title check -------------------------------------------------------------------------------------

export type TitleProblem = {
  kind: 'unsupported_figure' | 'too_long' | 'empty' | 'other';
  // The figure or phrase to highlight, when there is one.
  text: string | null;
  // The server's own sentence, shown as it is.
  message: string;
  supportedFigures: string[];
};
export type TitleCheck = { ok: boolean; length: number; titleLimit: number; problems: TitleProblem[] };

const KIND_OF: Record<string, TitleProblem['kind']> = {
  unsupported_number: 'unsupported_figure',
  hedge_dropped: 'unsupported_figure',
  title_too_long: 'too_long',
  title_empty: 'empty',
};

// The figures the script (and the brief text) really state, so the screen can show what is allowed. Digits as written, up to a dozen.
export function supportedFiguresIn(scriptText: string, briefText?: string | null): string[] {
  const found = `${briefText ?? ''}\n${scriptText}`.match(/\d[\d,.]*\d|\d/g) ?? [];
  return [...new Set(found)].slice(0, 12);
}

export function problemsOf(issues: ConceptIssue[], supportedFigures: string[]): TitleProblem[] {
  return issues.map((i) => ({ kind: KIND_OF[i.code] ?? 'other', text: i.text ?? null, message: i.message, supportedFigures: KIND_OF[i.code] === 'unsupported_figure' ? supportedFigures : [] }));
}

// One function for both "check as you type" and "refuse on save": same inputs, same checkTitle, so they cannot disagree.
export function checkPackageTitle(params: {
  title: string;
  packaging: PackagingOutput;
  packageId: string;
  scriptText: string;
  briefText?: string | null;
}): TitleCheck | { error: 'unknown_package' } {
  const pkg = params.packaging.packages.find((p) => p.id === params.packageId);
  if (!pkg) return { error: 'unknown_package' };
  const issues = titleIssues({ title: params.title, packaging: params.packaging, pkg, scriptText: params.scriptText, briefText: params.briefText });
  return {
    ok: issues.length === 0,
    length: params.title.trim().length,
    titleLimit: params.packaging.titleLimit,
    problems: problemsOf(issues, supportedFiguresIn(params.scriptText, params.briefText)),
  };
}

export function titleIssues(params: {
  title: string;
  packaging: PackagingOutput;
  pkg: PackagingOutput['packages'][number];
  scriptText: string;
  briefText?: string | null;
}): ConceptIssue[] {
  return checkTitle({
    title: params.title,
    scriptText: params.scriptText,
    briefText: params.briefText,
    brief: params.packaging.brief,
    titleLimit: params.packaging.titleLimit,
    alsoShown: [params.pkg.lettering.words, params.pkg.lettering.subline].filter(Boolean).map((t) => `${t!.trim().replace(/[.!?]+$/, '')}.`).join(' '),
  });
}

// ---- B1. Is the packaging being made right now? -------------------------------------------------------------------

// Packaging is made before the Gate 2 approval is registered, while the run already reads `paused_gate2` (video review parks it
// there) and the Gate 2 row is `running`: so "making" is: a long video at Gate 2, with no finished packaging, and no approval open yet.
// With an approval open and no packaging (a restart that skipped it, a channel with packaging off) it is `pending`, not `making`.
export function packagingState(params: {
  runStatus: string;
  isLong: boolean;
  packaging: PackagingOutput | null;
  approvalOpen: boolean;
}): { making: boolean; pending: boolean } {
  const unfinished = !params.packaging || params.packaging.status === 'building';
  const atGate = params.runStatus === 'paused_gate2' && params.isLong && unfinished;
  return { making: atGate && !params.approvalOpen, pending: atGate && params.approvalOpen };
}

export const packagingRound = (packaging: PackagingOutput): 1 | 2 => (packaging.rounds?.some((r) => r.round === 2) ? 2 : 1);

// ---- B4. The thumbnail result on runs.get -------------------------------------------------------------------------

export type ThumbnailResult = {
  status: 'live' | 'not_applied' | 'pending' | 'not_set';
  reasonText: string | null;
  source: 'package' | 'youtube-suggested' | 'frame-grab';
  packageId: string | null;
  fileUrl: string | null;
};

type PublishOutput = {
  youtubeVideoId?: string;
  coverFrameSet?: boolean;
  coverFrameMessage?: string;
  thumbnail?: { source: 'package' | 'youtube-suggested' | 'frame-grab'; packageId?: string; file?: string };
};

// Composed from the publishing stage output and the receipt's follow-up state. What the receipt cannot tell apart: after the thumbnail call
// started, a refusal that came back (a 403) and a call whose outcome is unknown both leave the follow-up `uncertain`; they are told apart by
// the stage output's `coverFrameMessage` (an error came back) and not by the receipt. A crash between the call and its result leaves no
// message and shows as `pending`, which is the truth: nobody knows.
export function thumbnailResult(params: {
  output: PublishOutput | null | undefined;
  followup: 'pending' | 'started' | 'succeeded' | 'uncertain' | 'failed' | undefined;
  fileUrlFor: (packageId: string) => string | null;
}): ThumbnailResult | null {
  const out = params.output;
  // Not published until a video id exists.
  if (!out?.youtubeVideoId) return null;
  const message = out.coverFrameMessage ?? null;
  // The thumbnail step has not finished: the id is saved, the result is not.
  if (!out.thumbnail) {
    return { status: 'pending', reasonText: null, source: 'frame-grab', packageId: null, fileUrl: null };
  }
  const { source, packageId } = out.thumbnail;
  if (source === 'youtube-suggested') return { status: 'not_set', reasonText: null, source, packageId: null, fileUrl: null };
  const base = { source, packageId: packageId ?? null, fileUrl: source === 'package' && packageId ? params.fileUrlFor(packageId) : null };
  if (out.coverFrameSet) return { status: 'live', reasonText: null, ...base };
  if (message) return { status: 'not_applied', reasonText: message, ...base };
  if (params.followup === 'started' || params.followup === 'uncertain') return { status: 'pending', reasonText: null, ...base };
  // Nothing was sent and nothing came back (a frame grab that was skipped): YouTube chose its own.
  return { status: 'not_set', reasonText: null, ...base, fileUrl: null, source: source === 'package' ? 'package' : 'frame-grab' };
}

export const isYoutubeSuggestedChoice = (packaging: PackagingOutput | null): boolean => packaging?.choice?.packageId === YOUTUBE_SUGGESTED;
