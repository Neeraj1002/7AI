// Sprint 5 Task 7 R2 — cost on the Run screen.
//
// The cost card on the Run screen holds the whole breakdown (follow-up R2); Step history shows outcome and reason only.
//
// Contract (Task 8 report, "App contract for Task 7"; field names are stable). `runs.get` returns:
//   cost { spentUsd, estimateUsd?, limitUsd?, retryAllowanceUsd?, attemptsUsd, otherStagesUsd, unattributedUsd }
//   videoAttempts[] { attempt, outcome, reasonCode?, reason?, errorClass?, retryStep?, costUsd, stages[] }
//   stageSummaries[] { stageId, stageName, attemptNumber, status, outcome, ..., costUsd, videoAttempt? }
// and spentUsd = attemptsUsd + otherStagesUsd + unattributedUsd. An older server sends none of these; every reader here
// then returns "nothing" and the screen shows what it showed before (spentUsd / maxCostUsd).

export type StageCost = { name: string; usd: number; failed: boolean };
export type AttemptCost = { totalUsd: number; failed: boolean; stages: StageCost[] };
export type CostEntry = { stageName: string; attemptNumber: number; cost: AttemptCost; /** The server's outcome word for the attempt or stage ("failed_review", "completed", …). */ outcome?: string };
export type CostBreakdown = {
  totalUsd: number;
  estimateUsd: number | null;
  limitUsd: number | null;
  retryAllowanceUsd: number | null;
  attemptsUsd: number;
  otherStagesUsd: number;
  unattributedUsd: number;
  /** One per video attempt, oldest first, with the stages inside it. */
  attempts: CostEntry[];
  /** Stages outside the video loop (script, review, gates, publishing). */
  others: CostEntry[];
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
type Row = Record<string, unknown>;

// What a person calls each stage row. A video attempt's voice, pictures and render are one stage on the server.
const STAGE_NAME: Record<string, string> = {
  intake: 'Brief',
  script_generation: 'Script',
  script_review: 'Script review',
  gate1: 'Gate 1',
  video_generation: 'Voice, pictures and render',
  video_review: 'Video review',
  gate2: 'Gate 2',
  publishing: 'Publishing',
  analytics: 'First stats',
};
export const stageDisplayName = (stageName: string) => STAGE_NAME[stageName] ?? stageName.replace(/_/g, ' ');

/** A provider call that did not go through: $0 there means "failed", not "free" or "under-counted". */
const NOT_CHARGED = ['failed_error', 'blocked', 'cancelled'];

function stageCost(s: Row, parentAttempt?: number): StageCost | null {
  const usd = num(s.costUsd);
  if (typeof s.stageName !== 'string' || usd === null) return null;
  // A try number is shown only when the stage was tried again on its own (a review retried inside one video attempt).
  const again = typeof s.attemptNumber === 'number' && s.attemptNumber > 1 && s.attemptNumber !== parentAttempt ? ` (try ${s.attemptNumber})` : '';
  return { name: `${stageDisplayName(s.stageName)}${again}`, usd, failed: typeof s.outcome === 'string' && NOT_CHARGED.includes(s.outcome) };
}

/** Reads `runs.get.cost`, `videoAttempts` and `stageSummaries`; null when the server does not send them. */
export function costBreakdownOf(data: unknown): CostBreakdown | null {
  const d = data as { cost?: Row; videoAttempts?: unknown; stageSummaries?: unknown } | undefined;
  const c = d?.cost;
  const total = num(c?.spentUsd);
  if (!c || total === null) return null;

  const attempts: CostEntry[] = [];
  const inAttempt = new Set<string>();
  for (const a of Array.isArray(d?.videoAttempts) ? (d!.videoAttempts as Row[]) : []) {
    const usd = num(a?.costUsd);
    if (typeof a?.attempt !== 'number' || usd === null) continue;
    const stages = (Array.isArray(a.stages) ? (a.stages as Row[]) : []).flatMap((s) => {
      if (typeof s.stageId === 'string') inAttempt.add(s.stageId);
      const sc = stageCost(s, a.attempt as number);
      return sc ? [sc] : [];
    });
    attempts.push({ stageName: 'video_generation', attemptNumber: a.attempt, outcome: typeof a.outcome === 'string' ? a.outcome : undefined, cost: { totalUsd: usd, failed: typeof a.outcome === 'string' && a.outcome.startsWith('failed'), stages } });
  }

  const others: CostEntry[] = [];
  for (const s of Array.isArray(d?.stageSummaries) ? (d!.stageSummaries as Row[]) : []) {
    const usd = num(s?.costUsd);
    if (typeof s?.stageName !== 'string' || typeof s.attemptNumber !== 'number' || usd === null) continue;
    if (typeof s.stageId === 'string' && inAttempt.has(s.stageId)) continue;
    others.push({ stageName: s.stageName, attemptNumber: s.attemptNumber, outcome: typeof s.outcome === 'string' ? s.outcome : undefined, cost: { totalUsd: usd, failed: typeof s.outcome === 'string' && NOT_CHARGED.includes(s.outcome), stages: [] } });
  }

  return {
    totalUsd: total,
    estimateUsd: num(c.estimateUsd),
    limitUsd: num(c.limitUsd),
    retryAllowanceUsd: num(c.retryAllowanceUsd),
    attemptsUsd: num(c.attemptsUsd) ?? 0,
    otherStagesUsd: num(c.otherStagesUsd) ?? 0,
    unattributedUsd: num(c.unattributedUsd) ?? 0,
    attempts,
    others,
  };
}

/** 4 decimals only where the amount is under one cent, otherwise cents (R2). */
export function formatMoney(usd: number): string {
  return `$${usd > 0 && usd < 0.01 ? usd.toFixed(4) : usd.toFixed(2)}`;
}

/** A cost of 0 on a call that did not go through is shown as failed, not as an error or as free. */
export function stageCostText(s: StageCost): string {
  return s.failed && s.usd === 0 ? 'failed, not charged' : formatMoney(s.usd);
}

/** The server's own rule: the attempts, the other stages and the unattributed rows add up to the total, and the attempts
 *  listed add up to `attemptsUsd`. False means the screen should say the numbers do not match rather than hide it. */
export function attemptsAddUp(b: CostBreakdown): boolean {
  const parts = b.attemptsUsd + b.otherStagesUsd + b.unattributedUsd;
  const listed = b.attempts.reduce((n, a) => n + a.cost.totalUsd, 0);
  return Math.abs(parts - b.totalUsd) < 0.00005 && Math.abs(listed - b.attemptsUsd) < 0.00005;
}
