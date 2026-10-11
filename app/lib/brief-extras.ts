// Sprint 4 FE E3/E4 — New brief helpers: source-link validation and the "recent formats" chips.

export const MAX_SOURCES = 20;
const MAX_SOURCE_LENGTH = 500; // matches runs.create's sources[] schema

export type SourcesResult = { sources: string[]; error: string | null };

// Empty rows are ignored. Every other row must be an http(s) URL; the first bad row is named.
export function validateSources(rows: string[]): SourcesResult {
  const sources: string[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const value = rows[i].trim();
    if (!value) continue;
    let ok = false;
    try {
      const u = new URL(value);
      ok = (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.');
    } catch {
      ok = false;
    }
    if (!ok) return { sources: [], error: `Source ${i + 1} isn't a valid link (start with https://).` };
    if (value.length > MAX_SOURCE_LENGTH) {
      return { sources: [], error: `Source ${i + 1} is too long (max ${MAX_SOURCE_LENGTH} characters).` };
    }
    sources.push(value);
  }
  if (sources.length > MAX_SOURCES) return { sources: [], error: `At most ${MAX_SOURCES} sources.` };
  return { sources, error: null };
}

type FormatLite = { key: string };
type ComparisonChannelLite = { channelId: string; byFormat: { formatKey: string | null; videoCount: number }[] } | undefined;

// Two chips next to Freeform: the channel's most-used formats (from real run history), topped up with the
// first formats of the library. A format picked from the sheet is always shown, replacing the last chip.
export function chipFormatKeys(
  formats: FormatLite[],
  channel: ComparisonChannelLite,
  selected: string | null,
): string[] {
  const known = new Set(formats.map((f) => f.key));
  const used = (channel?.byFormat ?? [])
    .filter((r): r is { formatKey: string; videoCount: number } => r.formatKey !== null && known.has(r.formatKey))
    .sort((a, b) => b.videoCount - a.videoCount)
    .map((r) => r.formatKey);
  const chips: string[] = [];
  for (const k of [...used, ...formats.map((f) => f.key)]) {
    if (chips.length >= 2) break;
    if (!chips.includes(k)) chips.push(k);
  }
  if (selected && known.has(selected) && !chips.includes(selected)) chips[chips.length - 1] = selected;
  return chips;
}
