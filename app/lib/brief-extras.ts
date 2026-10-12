// Sprint 4 FE E3 / N2 — New brief helpers: source-link validation and the run input (Freeform sends no formatKey).

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

// Freeform is "no formatKey": the key is only present when a format is picked. A picked key the channel does not
// offer (e.g. after switching channel) is treated as Freeform rather than sent.
export function formatKeyField(formatKey: string | null, offered: { key: string }[]): { formatKey?: string } {
  return formatKey !== null && offered.some((f) => f.key === formatKey) ? { formatKey } : {};
}
