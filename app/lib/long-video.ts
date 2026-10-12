// Sprint 4 FE N3 — helpers shared by the Run, Queue and Inbox screens for long-form videos. Nothing here is
// fetched or invented: every value comes from `runs.get`, `runs.progress` or `runs.list`.

// "Video · 10 min" for a long run; null for a Short (no chip). 150 s reads "Video · 2.5 min".
export function videoChipLabel(videoKind: string | undefined | null, targetSeconds: number | undefined | null): string | null {
  if (videoKind !== 'long') return null;
  if (!targetSeconds || targetSeconds <= 0) return 'Video';
  const minutes = Math.round(targetSeconds / 6) / 10;
  return `Video · ${minutes} min`;
}

// 602 -> "10:02"; 0 -> "0:00"; 3725 -> "62:05" (minutes keep counting: videos are at most 15 min).
export function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// The image-stage line. Counts exist only when the server sends them; otherwise there is no number at all.
export function imageStageLine(progress: { done?: number; total?: number } | undefined): string {
  const { done, total } = progress ?? {};
  return typeof done === 'number' && typeof total === 'number' && total > 0
    ? `Generating images ${done} of ${total}`
    : 'Generating images…';
}

export function imageStageFraction(progress: { done?: number; total?: number } | undefined): number | null {
  const { done, total } = progress ?? {};
  return typeof done === 'number' && typeof total === 'number' && total > 0 ? Math.min(1, Math.max(0, done / total)) : null;
}

export const LONG_WAIT_NOTE =
  "Long videos take 25 to 45 minutes. You can leave the app; you'll get a notification at Gate 2.";

// Raise the spend limit (R2 point 8). Decided from the two numbers only, never from message text.
export function needsHigherLimit(run: { videoKind?: string; spentUsd?: number; maxCostUsd?: number }): boolean {
  return (
    run.videoKind === 'long' &&
    typeof run.spentUsd === 'number' &&
    typeof run.maxCostUsd === 'number' &&
    run.spentUsd >= run.maxCostUsd
  );
}

export function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}

// A new limit has to be a positive amount above what the run already spent. The server decides the rest
// (weekly budget, the absolute cap) and its words are shown as sent.
export function newLimitError(text: string, spentUsd: number): string | null {
  const t = text.trim().replace(/^\$\s*/, '');
  if (!/^\d+(\.\d{1,4})?$/.test(t) || Number(t) <= 0) return 'Enter an amount in dollars.';
  if (Number(t) <= spentUsd) return `Enter more than the ${usd(spentUsd)} already spent.`;
  return null;
}

export function parseLimit(text: string): number | null {
  return newLimitError(text, 0) === null ? Number(text.trim().replace(/^\$\s*/, '')) : null;
}

// A link from runs.get is either absolute (a signed storage link, no sign-in header wanted) or a path on our own API
// (needs the session token). Both cases are handled here so no screen guesses.
export function mediaLink(url: string | undefined, apiUrl: string | null): { url: string; sendAuth: boolean } | null {
  if (!url) return null;
  if (url.startsWith('/')) return apiUrl ? { url: `${apiUrl.replace(/\/$/, '')}${url}`, sendAuth: true } : null;
  return { url, sendAuth: false };
}
