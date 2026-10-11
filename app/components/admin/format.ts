// Admin Sprint 1 FE (R2) — display helpers shared by the admin screens.

type DateInput = Date | string | number;

const toDate = (d: DateInput): Date => (d instanceof Date ? d : new Date(d));

/** >= $1 two decimals, else four, so $0.7285 matches the SQL the founder already knows. */
export function fmtUsd(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `$${Math.abs(n) >= 1 ? n.toFixed(2) : n.toFixed(4)}`;
}

/** "3h ago", "2d ago". */
export function fmtAgo(d: DateInput | null | undefined, now: number = Date.now()): string {
  if (d === null || d === undefined) return '—';
  const diff = Math.max(0, now - toDate(d).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** A duration in seconds as "3d 4h", "2h 5m", "7m", "12s". */
export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "6 Oct 2026, 14:05 UTC": the server's clock, not the phone's, so it matches the SQL. */
export function fmtDate(d: DateInput | null | undefined): string {
  if (d === null || d === undefined) return '—';
  const x = toDate(d);
  const hh = String(x.getUTCHours()).padStart(2, '0');
  const mm = String(x.getUTCMinutes()).padStart(2, '0');
  return `${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]} ${x.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Monday 00:00 UTC" */
export function fmtWeekdayTime(d: DateInput): string {
  const x = toDate(d);
  return `${WEEKDAYS[x.getUTCDay()]} ${String(x.getUTCHours()).padStart(2, '0')}:${String(x.getUTCMinutes()).padStart(2, '0')} UTC`;
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

/** "awaiting_verification" -> "Awaiting verification" */
export function humanize(value: string): string {
  const s = value.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
