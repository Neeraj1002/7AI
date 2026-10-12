// Sprint 4 FE N3 R1 — New brief helpers for the Video type: length, cost and spend-limit rules, and the run input.
// The app mirrors only what the boards give it as copy; every number (limits, the estimate, the suggestion) comes
// from runs.estimateCost. The server stays the real validator and its BAD_REQUEST words are shown as sent.

export type VideoKind = 'short' | 'long';

export const TYPE_OPTIONS = [
  { value: 'short' as const, label: 'Shorts', helper: 'Vertical 9:16, up to 60 seconds.' },
  { value: 'long' as const, label: 'Video', helper: 'Landscape 16:9, 2 to 15 minutes. Takes 25 to 45 minutes to make.' },
];

export const LENGTH_PRESETS = [5, 10, 15] as const;
export const DEFAULT_LONG_MINUTES = 10;
export const LENGTH_HELPER = 'Pick 5, 10 or 15 min, or type any whole number of minutes from 2 to 15.';
export const LENGTH_ERROR = 'Enter 2 to 15 minutes.';
export const MIN_MINUTES = 2;
export const MAX_MINUTES = 15;

// Whole minutes in 2..15, else null. "10", " 10 " and "010" are fine; "10.5", "1e1", "" and "-3" are not.
export function parseMinutes(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = Number(t);
  return n >= MIN_MINUTES && n <= MAX_MINUTES ? n : null;
}

export function minutesError(text: string): string | null {
  return parseMinutes(text) === null ? LENGTH_ERROR : null;
}

export function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

// A positive dollar amount typed by a person ("3.5", "$3.50", "3,50" is not accepted). null when it is not one.
export function parseMoney(text: string): number | null {
  const t = text.trim().replace(/^\$\s*/, '');
  if (!/^\d+(\.\d{1,4})?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}

export type CostEstimate = {
  estimateUsd: number;
  worstCaseUsd: number;
  suggestedMaxUsd: number;
  remainingWeeklyUsd: number;
};

export function estimateHelper(e: CostEstimate): string {
  return `Up to ${formatUsd(e.worstCaseUsd)} if the video has to be made again. ${formatUsd(e.remainingWeeklyUsd)} left this week for this channel.`;
}

// The weekly-budget card replaces the normal estimate card when one attempt does not fit.
export function weeklyBudgetBlocked(e: CostEstimate): boolean {
  return e.estimateUsd > e.remainingWeeklyUsd;
}

export function weeklyBudgetText(e: CostEstimate): string {
  return `Estimated ${formatUsd(e.estimateUsd)} for this video, ${formatUsd(e.remainingWeeklyUsd)} left this week for this channel. Pick a shorter length or wait for next week's budget.`;
}

export const MAX_SPEND_HELPER = 'Suggested from the estimate. If the run reaches this, it stops and asks you.';
export const ESTIMATE_FAILED = "Couldn't estimate the cost. Try again.";

// Max spend must be a positive amount that covers one attempt. The estimate decides "at least"; the upper cap is the
// server's rule and comes back as its own message.
export function maxSpendError(text: string, estimate: CostEstimate | undefined): string | null {
  const value = parseMoney(text);
  if (value === null) return 'Enter an amount in dollars.';
  if (estimate && value < estimate.estimateUsd) {
    return `Must be at least ${formatUsd(estimate.estimateUsd)}, the estimate for one attempt.`;
  }
  return null;
}

// While the user has not edited Max spend it follows each new suggestion; once edited it stays (and is re-validated).
export function maxSpendText(edited: string | null, estimate: CostEstimate | undefined): string {
  if (edited !== null) return edited;
  return estimate ? estimate.suggestedMaxUsd.toFixed(2) : '';
}

export type BriefInput = {
  kind: VideoKind;
  minutes: number | null; // the Video length picked or typed; unused when a format sets it
  formatLocksLength: boolean;
  maxSpendUsd: number | null;
};

// Fields a Video adds to runs.create. A Short adds none: its body stays exactly as before (no videoKind, no maxCostUsd).
// With a format the server takes the length from the format, so no targetDurationSec is sent.
export function longRunFields(input: BriefInput): { videoKind?: 'long'; targetDurationSec?: number; maxCostUsd?: number } {
  if (input.kind !== 'long') return {};
  return {
    videoKind: 'long',
    ...(!input.formatLocksLength && input.minutes !== null ? { targetDurationSec: input.minutes * 60 } : {}),
    ...(input.maxSpendUsd !== null ? { maxCostUsd: input.maxSpendUsd } : {}),
  };
}

// Where a runs.create BAD_REQUEST belongs. Matching text is only used to choose the place; the words shown are always
// the server's. Anything that fits none goes above Create run.
export type ServerErrorPlace = 'length' | 'maxSpend' | 'budget' | 'general';

export function placeServerError(message: string): ServerErrorPlace {
  const m = message.toLowerCase();
  if (m.includes('spend limit')) return 'maxSpend';
  if (m.includes('left this week') || m.includes('weekly budget')) return 'budget';
  if (m.includes('video length') || m.includes('length must')) return 'length';
  return 'general';
}
