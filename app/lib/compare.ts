// Sprint 4 FE E2 — display helpers for the Compare channels × formats screen.

export function formatLabel(formatKey: string | null, labels: Record<string, string>): string {
  if (formatKey === null) return 'Freeform';
  return labels[formatKey] ?? formatKey;
}

export function compactNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (n >= 1_000_000) return `${Number((n / 1_000_000).toFixed(1))}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${Number((n / 1000).toFixed(1))}K`;
  return String(Math.round(n));
}
