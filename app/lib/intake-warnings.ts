// Sprint 5 Task 7 follow-up R4 — the soft warnings the server writes at intake (`run.creationOptions.intakeWarnings`, an
// optional list of plain sentences, for example "Each chapter averages about 30 seconds; chapters usually work better at 40
// or more"). They are shown as amber lines under the brief and never block or turn red. Absent means nothing is shown.
export function intakeWarningsOf(run: unknown): string[] {
  const list = (run as { creationOptions?: { intakeWarnings?: unknown } | null } | null | undefined)?.creationOptions?.intakeWarnings;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of list) {
    const t = typeof w === 'string' ? w.trim() : '';
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}
