import { findFormat, type VideoKind } from './manifest';

// Sprint 4 Task 9 (R1): pure rules for the run's `videoKind` and length, shared by
// runs.create, runs.estimateCost and the resolver so the three cannot drift.

export const SHORT_DURATIONS_SEC = [30, 45, 60] as const;
export const LONG_MIN_SEC = 120;
export const LONG_MAX_SEC = 900;
export const LONG_DEFAULT_SEC = 600;
export const SHORT_DEFAULT_SEC = 45;
export const SHORT_MAX_SEC = 60;

export const LONG_LENGTH_MESSAGE = 'Video length must be a whole number of minutes from 2 to 15';
export const SHORT_LENGTH_MESSAGE = 'Short video length must be 30, 45 or 60 seconds';

export function isValidDuration(kind: VideoKind, sec: number): boolean {
  if (kind === 'short') return (SHORT_DURATIONS_SEC as readonly number[]).includes(sec);
  return Number.isInteger(sec) && sec % 60 === 0 && sec >= LONG_MIN_SEC && sec <= LONG_MAX_SEC;
}

export function durationErrorMessage(kind: VideoKind): string {
  return kind === 'long' ? LONG_LENGTH_MESSAGE : SHORT_LENGTH_MESSAGE;
}

// The kind a request means: an explicit videoKind, else the chosen format's, else 'short'.
// `conflict` is true when both are given and disagree; `unknownFormat` when formatKey names nothing.
export function resolveRequestedVideoKind(params: { videoKind?: VideoKind; formatKey?: string | null }): {
  videoKind: VideoKind;
  conflict: boolean;
} {
  const format = findFormat(params.formatKey);
  if (params.videoKind && format && format.videoKind !== params.videoKind) {
    return { videoKind: params.videoKind, conflict: true };
  }
  return { videoKind: params.videoKind ?? format?.videoKind ?? 'short', conflict: false };
}
