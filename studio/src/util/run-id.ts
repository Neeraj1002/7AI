// Admin Sprint 1 (R3) - which run a bug report is about.
//
// BugReport has a real `runId` column (set by POST /bugs only when the tester
// form supplied a well-formed UUID) and a free-text `screenContext` holding the
// screen path (for example `/run/<uuid>`). Prefer the column; fall back to the
// path. A short id prefix cannot be resolved against a uuid column, so it
// yields null rather than a guess.

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const UUID_ONLY = new RegExp(`^${UUID}$`, 'i');
// `/run/<uuid>` (or `/runs/<uuid>`) as a whole path segment, followed by the end,
// a further path segment, a query string or a fragment. Works for a bare path
// and for a full URL.
const RUN_PATH = new RegExp(`/runs?/(${UUID})(?=$|[/?#])`, 'i');

export type RunIdSource = { runId?: string | null; screenContext?: string | null };

export function extractRunId(report: RunIdSource | string | null | undefined): string | null {
  if (!report) return null;
  const source: RunIdSource = typeof report === 'string' ? { screenContext: report } : report;
  if (source.runId && UUID_ONLY.test(source.runId)) return source.runId.toLowerCase();
  const context = source.screenContext?.trim();
  if (!context) return null;
  const match = RUN_PATH.exec(context);
  return match ? match[1].toLowerCase() : null;
}
