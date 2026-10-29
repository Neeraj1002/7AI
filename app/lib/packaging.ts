import { mediaLink } from './long-video';

// Sprint 6 Task 1: link helpers for the Gate 2 package screens, the curiosity-device label and the Compare dash rule.
// The server decides everything else; see gate2-packaging.ts.


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


// ---- Compare by curiosity device (R8) ----
// A blank is a blank: a metric the data does not supply is shown as a dash, never as zero or an estimate.
export const dashIfNull = (n: number | null, format: (n: number) => string = (v) => String(Math.round(v * 10) / 10)): string => (n === null ? '\u2014' : format(n));
export const watchTime = (sec: number | null): string => dashIfNull(sec, (v) => `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`);
