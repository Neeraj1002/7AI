import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../studio/src/api/router';
import { mediaLink, mmss } from './long-video';

// Sprint 6 Task 1 (R5, R6): what the Gate 2 packaging cards and the published-thumbnail card need, kept free of
// React so it can be tested. The server decides everything that matters (limits, checks, what is live); the app
// only formats it.

export type PackagingResponse = inferRouterOutputs<AppRouter>['runs']['packaging'];
export type PackagingView = NonNullable<PackagingResponse['view']>;
export type PackageView = PackagingView['packages'][number];

export const YOUTUBE_SUGGESTED = 'youtube-suggested';

const DEVICE_LABEL: Record<string, string> = {
  stake: 'Stake',
  scale: 'Scale',
  mystery: 'Mystery',
  correction: 'Correction',
  how: 'How',
  person: 'Person',
  countdown: 'Countdown',
};
export const deviceLabel = (device: string): string => DEVICE_LABEL[device] ?? device;

// The duration chip is drawn by the card, never baked into the picture file.
export function durationChip(videoSeconds: number | null | undefined): string | null {
  return typeof videoSeconds === 'number' && videoSeconds > 0 ? mmss(videoSeconds) : null;
}

export function pictureLink(url: string, apiUrl: string | null): { url: string; sendAuth: boolean } | null {
  const link = mediaLink(url, apiUrl);
  if (!link) return null;
  // A signed link carries its own proof; only the plain path needs the session header.
  return { url: link.url, sendAuth: !/[?&]t=/.test(link.url) };
}

export function downloadLink(url: string, apiUrl: string | null): string | null {
  const link = mediaLink(url, apiUrl);
  if (!link) return null;
  return `${link.url}${link.url.includes('?') ? '&' : '?'}download=1`;
}

export function titleCounter(title: string, limit: number): { text: string; over: boolean } {
  const n = title.trim().length;
  return { text: `${n}/${limit}`, over: n > limit };
}

// "Viewers will ask: ..." and "Answered at: ..." lines; trailing punctuation is tidied so the pair reads the same on every card.
export const askedLine = (question: string): string => `Viewers will ask: ${question.trim().replace(/\s+/g, ' ')}`;
export const answeredLine = (answeredAt: string): string => `Answered at: ${answeredAt}`;

export function coldReaderLine(p: PackageView): string | null {
  if (!p.coldReader) return null;
  const click = p.coldReader.wouldClick === 'yes' ? 'would click' : p.coldReader.wouldClick === 'maybe' ? 'might click' : 'would not click';
  return `A stranger guessed "${p.coldReader.guessedAbout.replace(/\.$/, '')}" and ${click} (curiosity ${p.coldReader.curiosity}/5).`;
}

// PR B: what a stranger who saw only the picture and the title said. Advisory; it never picks for the founder.
export function strangerLines(p: PackageView): string[] {
  if (!p.stranger) return [];
  const click = p.stranger.wouldClick === 'yes' ? 'Would click' : p.stranger.wouldClick === 'maybe' ? 'Might click' : 'Would not click';
  return [
    click,
    `Expects to see: ${p.stranger.expectsToSee}`,
    `Wants to know: ${p.stranger.wantsToKnow}`,
    `Would be disappointed by: ${p.stranger.wouldDisappoint}`,
  ].filter((l) => !/: ?$/.test(l));
}

// "Won 2 of 2 head-to-head comparisons": the picture checks compare every kept option with the others.
export function headToHeadLine(p: PackageView): string | null {
  const h = p.headToHead;
  if (!h) return null;
  const total = h.wins + h.losses + h.ties;
  if (total === 0) return null;
  return `Won ${h.wins} of ${total} head-to-head comparisons${h.ties ? ` (${h.ties} tied)` : ''}.`;
}

// R10: the plain sentence under an empty or second-round Gate 2. A second round is said, and so is a double failure.
export function secondRoundNote(view: PackagingView): string | null {
  const { state, reason } = view.secondRound;
  if (view.status === 'ready') return state === 'finished' ? 'Every first-round option was dropped by the checks, so a second round was made. These come from it.' : null;
  if (state === 'finished') return "Nothing passed, even after a second try. Approving publishes with YouTube's suggested thumbnail and a title written for you.";
  if (state === 'skipped') return `Nothing passed, and a second try was not made: ${reason ?? 'there was no budget for it'}. Approving publishes with YouTube's suggested thumbnail and a title written for you.`;
  return null;
}

// What the founder has chosen so far, in words.
export function choiceSummary(view: PackagingView): string | null {
  if (!view.choice) return null;
  if (view.choice.packageId === YOUTUBE_SUGGESTED) return "You chose YouTube's suggested thumbnail.";
  const pkg = view.packages.find((p) => p.id === view.choice!.packageId);
  return pkg ? `Chosen: "${view.choice.title ?? pkg.title}"${view.choice.titleEdited ? ' (title edited)' : ''}.` : null;
}

// The line under the cards when nothing is chosen yet: approving then publishes with YouTube's own thumbnail.
export const NO_CHOICE_NOTE = "Nothing chosen yet. If you approve now, YouTube's suggested thumbnail is used and the title is written for you.";

export type PublishedThumbnail = {
  source: 'package' | 'youtube-suggested' | 'frame-grab';
  packageId?: string;
  file?: string;
};

// R6: what is really live. A custom thumbnail is claimed only when the server says it went up (coverFrameSet).
export function publishedThumbnailStatus(out: { coverFrameSet?: boolean; coverFrameMessage?: string; thumbnail?: PublishedThumbnail } | undefined): {
  kind: 'ok' | 'attention' | 'neutral';
  headline: string;
  detail: string | null;
  canDownload: boolean;
} | null {
  if (!out || !out.thumbnail) return null;
  const { thumbnail } = out;
  if (thumbnail.source === 'package') {
    return out.coverFrameSet
      ? { kind: 'ok', headline: 'Your chosen thumbnail is live', detail: null, canDownload: true }
      : {
          kind: 'attention',
          headline: 'Your thumbnail was not set on YouTube',
          detail: `${out.coverFrameMessage ?? 'YouTube did not take the thumbnail.'} The video is published with YouTube's suggested thumbnail. The file is below if you want to set it by hand.`,
          canDownload: true,
        };
  }
  if (thumbnail.source === 'youtube-suggested') {
    return { kind: 'neutral', headline: "YouTube's suggested thumbnail is live", detail: out.coverFrameMessage ?? null, canDownload: false };
  }
  return null;
}

// ---- Compare by curiosity device (R8) ----
// A blank is a blank: a metric the data does not supply is shown as a dash, never as zero or an estimate.
export const dashIfNull = (n: number | null, format: (n: number) => string = (v) => String(Math.round(v * 10) / 10)): string => (n === null ? '\u2014' : format(n));
export const watchTime = (sec: number | null): string => dashIfNull(sec, (v) => `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`);
