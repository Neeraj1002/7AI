import { adminProcedure } from '../../trpc';
import { loadOverviewData, type OverviewData } from '../../../models/repositories/admin.repository';

// ---------------------------------------------------------------------------
// Decision-queue thresholds. Each is a rule the founder can read and change here.
// ---------------------------------------------------------------------------
// The OAuth consent screen is in Testing mode, where refresh tokens expire after 7 days;
// flag a YouTube connection a day early.
export const YOUTUBE_CONNECTION_OLD_DAYS = 6;
// A run sitting in needs_attention for longer than this has been forgotten.
export const NEEDS_ATTENTION_STALE_HOURS = 24;
// A review gate waiting longer than this needs a nudge.
export const GATE_PENDING_STALE_HOURS = 12;
// Provider values whose usage rows are legitimately $0 (free APIs); a $0 row from any other
// provider (for example openai image calls) is a cost-recording gap.
export const KNOWN_FREE_PROVIDERS = ['pexels', 'youtube', 'youtube-analytics'] as const;
// Window for the cost_gap rule.
export const COST_GAP_WINDOW_DAYS = 7;
// The queue is capped so the screen stays a queue, not a log.
export const DECISION_QUEUE_CAP = 50;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export type DecisionKind =
  | 'budget_zero_share'
  | 'budget_pool_exhausted'
  | 'youtube_connection_old'
  | 'run_needs_attention_stale'
  | 'gate_pending_stale'
  | 'bug_untriaged'
  | 'cost_gap';

export type DecisionItem = {
  kind: DecisionKind;
  severity: 'high' | 'medium' | 'low';
  tenantId: string | null;
  tenantName: string | null;
  channelId?: string;
  runId?: string;
  message: string;
  since: string | null;
};

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 } as const;

// Pure: all the rules in one place, driven by already-loaded data, so the queue is testable
// without a database.
export function buildDecisionQueue(data: OverviewData, now: Date): DecisionItem[] {
  const tenantName = (id: string | null) => (id ? (data.tenantNames.get(id) ?? null) : null);
  const items: DecisionItem[] = [];

  for (const [tenantId, analysis] of data.budgets) {
    for (const w of analysis.warnings) {
      if (w.code === 'zero_share') {
        items.push({
          kind: 'budget_zero_share',
          severity: 'high',
          tenantId,
          tenantName: tenantName(tenantId),
          channelId: w.channelId,
          message: w.message,
          since: null,
        });
      } else if (w.code === 'pool_exhausted') {
        items.push({
          kind: 'budget_pool_exhausted',
          severity: 'high',
          tenantId,
          tenantName: tenantName(tenantId),
          message: w.message,
          since: analysis.weekStartUtc.toISOString(),
        });
      }
    }
  }

  for (const c of data.credentials) {
    if (!c.channelIsActive) continue;
    if (now.getTime() - c.updatedAt.getTime() > YOUTUBE_CONNECTION_OLD_DAYS * DAY_MS) {
      const ageDays = Math.floor((now.getTime() - c.updatedAt.getTime()) / DAY_MS);
      items.push({
        kind: 'youtube_connection_old',
        severity: 'medium',
        tenantId: c.tenantId,
        tenantName: tenantName(c.tenantId),
        channelId: c.channelId,
        message: `The YouTube connection for "${c.channelName}" was last saved ${ageDays} days ago; in Testing mode the token expires after 7 days, so reconnect it.`,
        since: c.updatedAt.toISOString(),
      });
    }
  }

  for (const r of data.pendingRuns) {
    const waitedMs = now.getTime() - r.updatedAt.getTime();
    if (r.status === 'needs_attention' && waitedMs > NEEDS_ATTENTION_STALE_HOURS * HOUR_MS) {
      items.push({
        kind: 'run_needs_attention_stale',
        severity: 'high',
        tenantId: r.tenantId,
        tenantName: tenantName(r.tenantId),
        channelId: r.channelId,
        runId: r.id,
        message: `A run has needed attention for ${Math.floor(waitedMs / HOUR_MS)} hours.`,
        since: r.updatedAt.toISOString(),
      });
    } else if ((r.status === 'paused_gate1' || r.status === 'paused_gate2') && waitedMs > GATE_PENDING_STALE_HOURS * HOUR_MS) {
      items.push({
        kind: 'gate_pending_stale',
        severity: 'medium',
        tenantId: r.tenantId,
        tenantName: tenantName(r.tenantId),
        channelId: r.channelId,
        runId: r.id,
        message: `A run has waited ${Math.floor(waitedMs / HOUR_MS)} hours at ${r.status === 'paused_gate1' ? 'Gate 1' : 'Gate 2'}.`,
        since: r.updatedAt.toISOString(),
      });
    }
  }

  if (data.untriagedBugs.count > 0) {
    items.push({
      kind: 'bug_untriaged',
      severity: 'low',
      tenantId: null,
      tenantName: null,
      message: `${data.untriagedBugs.count} bug report(s) have no area set.`,
      since: data.untriagedBugs.oldest ? data.untriagedBugs.oldest.toISOString() : null,
    });
  }

  if (data.costGaps.count > 0) {
    items.push({
      kind: 'cost_gap',
      severity: 'medium',
      tenantId: null,
      tenantName: null,
      message: `${data.costGaps.count} usage row(s) in the last ${COST_GAP_WINDOW_DAYS} days recorded $0 from a paid provider; cost is not being tracked for them.`,
      since: data.costGaps.oldest ? data.costGaps.oldest.toISOString() : null,
    });
  }

  const sinceMs = (i: DecisionItem) => (i.since ? new Date(i.since).getTime() : Number.POSITIVE_INFINITY);
  items.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || sinceMs(a) - sinceMs(b));
  return items.slice(0, DECISION_QUEUE_CAP);
}

// admin.overview - read-only. Aggregates and groupBys, never one query per tenant.
export const adminOverviewProcedure = adminProcedure.query(async () => {
  const now = new Date();
  const data = await loadOverviewData(now, { freeProviders: KNOWN_FREE_PROVIDERS, costGapWindowDays: COST_GAP_WINDOW_DAYS });
  return {
    generatedAt: now.toISOString(),
    weekStartUtc: data.weekStartUtc.toISOString(),
    totals: data.totals,
    runsThisWeek: data.runsThisWeek,
    openNow: data.openNow,
    spend: data.spend,
    decisionQueue: buildDecisionQueue(data, now),
  };
});
