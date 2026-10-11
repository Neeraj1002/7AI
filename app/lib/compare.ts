// Sprint 4 FE E2 — display helpers for the Compare channels × formats screen.

export function formatLabel(formatKey: string | null, labels: Record<string, string>): string {
  if (formatKey === null) return 'Freeform';
  return labels[formatKey] ?? formatKey;
}

export function compactNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  // Board "Compare channels": 18.4k, 3.1k, 1.0k.
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}
