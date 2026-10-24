// Sprint 5 Task 7 R2 (A10) — the Admin run view lists usage events flat (68 of them for the first acceptance run). The
// events carry no stage or attempt, so each is placed in the stage attempt whose time window holds it; the subtotals then
// add up to the total by construction (an event outside every window goes to "Before the first stage").
export type AdminStageIn = { stageName: string; attemptNumber: number; startedAt: Date | string | null; finishedAt: Date | string | null };
export type AdminUsageIn = { at: Date | string; costUsd: number };

export type UsageGroup<U extends AdminUsageIn> = {
  key: string;
  stageName: string | null;
  attemptNumber: number | null;
  events: U[];
  subtotalUsd: number;
  zeroEvents: number;
};

const ms = (d: Date | string | null) => (d ? new Date(d).getTime() : null);

export function groupUsage<U extends AdminUsageIn>(stages: AdminStageIn[], usage: U[]): { groups: UsageGroup<U>[]; totalUsd: number } {
  const timed = stages
    .map((s) => ({ s, start: ms(s.startedAt), end: ms(s.finishedAt) }))
    .filter((x): x is { s: AdminStageIn; start: number; end: number | null } => x.start !== null)
    .sort((a, b) => a.start - b.start);
  const groups = new Map<string, UsageGroup<U>>();
  const slot = (stageName: string | null, attemptNumber: number | null): UsageGroup<U> => {
    const key = stageName === null ? 'before' : `${stageName}:${attemptNumber}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, stageName, attemptNumber, events: [], subtotalUsd: 0, zeroEvents: 0 };
      groups.set(key, g);
    }
    return g;
  };
  const ordered = [...usage].sort((a, b) => +new Date(a.at) - +new Date(b.at));
  for (const u of ordered) {
    const t = +new Date(u.at);
    // The latest stage that had started by then and was still open (or had no end recorded) at that time.
    let hit: AdminStageIn | null = null;
    for (const x of timed) {
      if (x.start > t) break;
      if (x.end === null || t <= x.end) hit = x.s;
    }
    // Otherwise the latest stage that started before it (an event written just after its stage closed).
    if (!hit) for (const x of timed) if (x.start <= t) hit = x.s;
    const g = hit ? slot(hit.stageName, hit.attemptNumber) : slot(null, null);
    g.events.push(u);
    g.subtotalUsd += u.costUsd;
    if (u.costUsd === 0) g.zeroEvents += 1;
  }
  const list = [...groups.values()];
  return { groups: list, totalUsd: list.reduce((n, g) => n + g.subtotalUsd, 0) };
}

export function adminStageLabel(stageName: string): string {
  const m = /^gate(\d)$/.exec(stageName);
  if (m) return `Gate ${m[1]}`;
  const words = stageName.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
