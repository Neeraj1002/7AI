// Sprint 5 Task 7 R2 — cost on the Run screen.
//
// Contract with the backend (Task 8 R8.7, field names to be confirmed against its report). `runs.get` already returns
// `spentUsd` and `maxCostUsd`; Task 8 adds, from the existing ledger:
//   costBreakdown?: {
//     totalUsd: number; estimateUsd?: number; limitUsd?: number;
//     attempts: { stageName: string; attemptNumber: number; totalUsd: number; failed?: boolean;
//                 stages: { name: string; usd: number; failed?: boolean }[] }[];
//   }
// Until it arrives every reader below returns "nothing" and the screen shows only what it showed before.

export type StageCost = { name: string; usd: number; failed: boolean };
export type AttemptCost = { totalUsd: number; failed: boolean; stages: StageCost[] };
export type CostBreakdown = {
  totalUsd: number;
  estimateUsd: number | null;
  limitUsd: number | null;
  attempts: { stageName: string; attemptNumber: number; cost: AttemptCost }[];
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Reads `runs.get.costBreakdown` defensively; null when the server does not send it yet. */
export function costBreakdownOf(data: unknown): CostBreakdown | null {
  const raw = (data as { costBreakdown?: unknown } | undefined)?.costBreakdown as
    | { totalUsd?: unknown; estimateUsd?: unknown; limitUsd?: unknown; attempts?: unknown }
    | undefined;
  const total = num(raw?.totalUsd);
  if (!raw || total === null || !Array.isArray(raw.attempts)) return null;
  const attempts: CostBreakdown['attempts'] = [];
  for (const a of raw.attempts as Record<string, unknown>[]) {
    const attemptTotal = num(a?.totalUsd);
    if (typeof a?.stageName !== 'string' || typeof a.attemptNumber !== 'number' || attemptTotal === null) continue;
    const stages = Array.isArray(a.stages)
      ? (a.stages as Record<string, unknown>[]).flatMap((s) =>
          typeof s?.name === 'string' && num(s.usd) !== null ? [{ name: s.name, usd: s.usd as number, failed: s.failed === true }] : [],
        )
      : [];
    attempts.push({ stageName: a.stageName, attemptNumber: a.attemptNumber, cost: { totalUsd: attemptTotal, failed: a.failed === true, stages } });
  }
  return { totalUsd: total, estimateUsd: num(raw.estimateUsd), limitUsd: num(raw.limitUsd), attempts };
}

/** Map key used by the step history: "<stage>:<attempt>". */
export function costMapOf(breakdown: CostBreakdown | null): Map<string, AttemptCost> {
  return new Map((breakdown?.attempts ?? []).map((a) => [`${a.stageName}:${a.attemptNumber}`, a.cost]));
}

/** 4 decimals only where the amount is under one cent, otherwise cents (R2). */
export function formatMoney(usd: number): string {
  return `$${usd > 0 && usd < 0.01 ? usd.toFixed(4) : usd.toFixed(2)}`;
}

/** A cost of 0 on a failed provider call is shown as failed, not as an error or as free. */
export function stageCostText(s: StageCost): string {
  return s.failed && s.usd === 0 ? 'failed, not charged' : formatMoney(s.usd);
}

/** True when the attempts add up to the total to the cent (the check the Admin view also shows). */
export function attemptsAddUp(b: CostBreakdown): boolean {
  const sum = b.attempts.reduce((n, a) => n + a.cost.totalUsd, 0);
  return Math.abs(sum - b.totalUsd) < 0.005;
}
