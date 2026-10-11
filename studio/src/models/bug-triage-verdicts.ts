import type { BugReport, BugReportArea, BugReportStatus } from './repositories/bug-report.repository';

// Sprint 3 closure (closure2.md): the founder's 2026-10-11 verdicts for the open bug reports, as data, so
// scripts/triage-verdicts.ts can show a dry run before anything is written. Reports are matched to a group
// by what their description says (the groups come from closureTask2.md's P2 table and
// closure2-phone-verification.md), never by number. A report that matches no group, or more than one, is
// returned as 'needs-decision' and is left unchanged.

export type VerdictGroupKey =
  | 'budget'
  | 'identical-clips'
  | 'stutter'
  | 'audio'
  | 'dashboard'
  | 'inbox'
  | 'failed-label'
  | 'wrong-status-after-approval'
  | 'quality-line'
  | 'endms'
  | 'area-only';

export type Verdict = {
  // undefined = keep the report's current status.
  status?: BugReportStatus;
  note: string;
  // Only 'area-only' sets an area; undefined = leave the area alone.
  area?: BugReportArea;
};

// Only values that already exist in BUG_REPORT_STATUSES: open, fixed, wontfix, awaiting_verification.
export const VERDICTS: Record<VerdictGroupKey, Verdict> = {
  budget: { status: 'fixed', note: 'No longer reproduces on the real build (2026-10-11)' },
  'identical-clips': { status: 'fixed', note: 'No longer reproduces on the real build (2026-10-11)' },
  stutter: { status: 'fixed', note: 'No longer reproduces on the real build (2026-10-11)' },
  audio: { status: 'fixed', note: 'No longer reproduces on the real build (2026-10-11)' },
  dashboard: { status: 'fixed', note: 'Verified OK on the real build' },
  inbox: { status: 'fixed', note: 'Verified OK on the real build' },
  'failed-label': { status: 'fixed', note: 'Verified OK on the real build' },
  'wrong-status-after-approval': {
    status: 'fixed',
    note: 'Reproduced, fixed by PR #63, verified on the phone 2026-10-11 (stepper, Publishing chip, no Cancel)',
  },
  'quality-line': { status: 'open', note: 'Not built; planned for Sprint 4 (Gate 2 quality checks, PR #53)' },
  // Not verified, so not closed: the closest existing status is awaiting_verification.
  endms: { status: 'awaiting_verification', note: 'Probably fixed by PR #46; not reproduced' },
  'area-only': { note: 'Area noted only; no code change in Sprint 3', area: 'APP' },
};

// Keyword rules per group (case-insensitive, over the description + screen context).
const RULES: Record<VerdictGroupKey, RegExp[]> = {
  budget: [/budget/, /ceiling/, /spend limit/, /limit reached/, /refus/, /retry this step/],
  'identical-clips': [
    /same (clip|footage|video|image)/,
    /identical/,
    /ai images?/,
    /images? (don.?t|doesn.?t|not) work/,
    /revis\w+.*(same|again)/,
  ],
  stutter: [/stutter/, /choppy/, /\blag/, /freez/, /buffer/, /jerk/, /playback/],
  audio: [/music/, /audio/, /voice/, /loud/, /sound/, /volume/],
  dashboard: [/dashboard/, /success rate/, /\d+ failed/, /published rate/],
  inbox: [/inbox/, /notification/, /approval needed/, /pending card/],
  'failed-label': [/failed (label|state|attempt)/, /details (list|screen)/, /attempt.*(failed|error)/],
  'wrong-status-after-approval': [
    /after (i )?(approv|press)/,
    /approve (&|and) upload/,
    /(shows?|showing|displays?) (the )?(old|earlier|wrong|previous) (state|status)/,
    /still (says|shows|showing) (in progress|brief)/,
    /stepper/,
    /wrong status/,
  ],
  'quality-line': [/quality (line|check|metric|numbers)/, /loudness.*(length|shots)/],
  endms: [/endms/],
  'area-only': [],
};

export type Classification =
  | { kind: 'group'; group: VerdictGroupKey; via: 'keywords' | 'override' | 'feedback' }
  | { kind: 'needs-decision'; reason: string; candidates: VerdictGroupKey[] };

export function classifyReport(
  report: Pick<BugReport, 'id' | 'description' | 'reportType' | 'screenContext'>,
  overrides: Record<string, VerdictGroupKey> = {},
): Classification {
  const override = Object.entries(overrides).find(([prefix]) => report.id.startsWith(prefix));
  if (override) return { kind: 'group', group: override[1], via: 'override' };

  const text = `${report.description} ${report.screenContext ?? ''}`.toLowerCase();
  const hits = (Object.keys(RULES) as VerdictGroupKey[]).filter((g) => RULES[g].some((re) => re.test(text)));

  // Founder, 2026-10-11: every feedback-type report is "area noted only", whatever its text matches.
  if (report.reportType === 'feedback') return { kind: 'group', group: 'area-only', via: 'feedback' };
  if (hits.length === 1) return { kind: 'group', group: hits[0], via: 'keywords' };
  if (hits.length === 0) return { kind: 'needs-decision', reason: 'matches no group', candidates: [] };
  return { kind: 'needs-decision', reason: 'matches more than one group', candidates: hits };
}
