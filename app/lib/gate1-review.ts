// Sprint 4 FE E3/E6 — pure helpers for the Gate 1 review cards and the repeat-topic banner.
// All data comes from `runs.get().scriptReview`; nothing here is fetched or invented.

export type ScriptReview = {
  factualConcerns?: unknown;
  styleGuideViolations?: unknown;
  sources?: unknown;
  repeatTopic?: { runId?: unknown; topic?: unknown; createdAt?: unknown } | null;
} | null | undefined;

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : [];
}

export function gate1Lists(review: ScriptReview) {
  return {
    factualConcerns: strings(review?.factualConcerns),
    styleGuideViolations: strings(review?.styleGuideViolations),
    sources: strings(review?.sources),
  };
}

export function repeatTopicBanner(
  review: ScriptReview,
  now: Date = new Date(),
): { runId: string; text: string } | null {
  const rt = review?.repeatTopic;
  if (!rt || typeof rt.runId !== 'string' || typeof rt.topic !== 'string' || !rt.topic.trim()) return null;
  const created = typeof rt.createdAt === 'string' ? new Date(rt.createdAt) : null;
  const days = created && !Number.isNaN(created.getTime()) ? Math.max(0, Math.floor((now.getTime() - created.getTime()) / 86_400_000)) : null;
  const when = days === null ? 'an earlier run' : days === 0 ? 'a run from today' : `a run from ${days} day${days === 1 ? '' : 's'} ago`;
  return { runId: rt.runId, text: `Similar to ${when}: “${rt.topic.trim()}”. Approve only if the angle is different.` };
}
