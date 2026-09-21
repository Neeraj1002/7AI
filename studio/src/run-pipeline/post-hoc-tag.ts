import { findPipelineRunById } from '../models/repositories/pipeline-run.repository';
import { insertReviewLog } from '../models/repositories/review-log.repository';
import type { ReviewLog } from '../types';

// Sprint 2 Task 6 (I2) — MVP_PART3_CONTENT_QUALITY_AND_GROWTH_LOOP.md §2:
// "Add a cheap manual tagging step for the founder's own post-hoc read on an
// underperforming video." Reuses the existing ReviewLog table (a new row,
// not a new column/table) via the existing insertReviewLog repository
// function — the same "real training signal" table Gate 1/Gate 2 verdicts
// already write to, distinguished by a new `agent: 'founder-post-hoc'`
// value so dashboard.repository.ts's existing `agent = 'human'` gate-rate
// queries can't accidentally pick these up.
//
// No fixed tag vocabulary is enforced, by design — the design doc's own
// examples ("weak hook," "topic already saturated," "bad thumbnail frame")
// are illustrative, not exhaustive; a solo founder typing their own words is
// the actual "cheap" this task asks for, not a rigid enum to memorize.

export const FOUNDER_POST_HOC_AGENT = 'founder-post-hoc';

export type PostHocTagCommand = {
  runId: string;
  tag: string;
  notes: string;
};

// A message that starts with the "tag" command word but doesn't otherwise
// match the grammar is a probable mistake worth telling the founder about,
// not silent fallthrough to the ordinary gate-reply logic (a real "tag ..."
// attempt that goes nowhere would be a confusing, silent failure — this
// task's own Verify step explicitly checks for a real, honest reply here).
// A message that doesn't start with "tag" at all is never touched — it
// could legitimately be an edited script or ordinary conversation.
export type ParsedTagAttempt =
  | { kind: 'command'; command: PostHocTagCommand }
  | { kind: 'malformed'; reason: string }
  | { kind: 'not-a-tag-attempt' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Exact grammar, fail closed rather than guess — same "safe by construction"
// posture gate1/index.ts's parseGateReply already established: `tag`, then a
// real run id (full UUID — no fuzzy/suffix matching, since a wrong-run
// mismatch here would corrupt training-signal data silently), then a single
// tag word, then optional free-text notes.
export function parsePostHocTagCommand(text: string): ParsedTagAttempt {
  const trimmed = text.trim();
  if (!/^tag\b/i.test(trimmed)) {
    return { kind: 'not-a-tag-attempt' };
  }

  const match = trimmed.match(/^tag\s+(\S+)\s+(\S+)(?:\s+([\s\S]*))?$/i);
  if (!match) {
    return { kind: 'malformed', reason: 'Usage: tag <runId> <word> [notes] — e.g. "tag <the run id> weak_hook".' };
  }

  const [, runIdCandidate, tag, notes] = match;
  if (!UUID_RE.test(runIdCandidate)) {
    return {
      kind: 'malformed',
      reason: `"${runIdCandidate}" doesn't look like a real run id (expected a full UUID, like the ones in the daily digest).`,
    };
  }

  return {
    kind: 'command',
    command: {
      runId: runIdCandidate.toLowerCase(),
      tag: tag.toLowerCase().slice(0, 50),
      notes: (notes ?? '').trim(),
    },
  };
}

export type RecordPostHocTagResult = { ok: true; reviewLog: ReviewLog } | { ok: false; error: string };

export async function recordPostHocTag(command: PostHocTagCommand): Promise<RecordPostHocTagResult> {
  const run = await findPipelineRunById(command.runId);
  if (!run) {
    return { ok: false, error: `No run found with id ${command.runId} — check the id and try again.` };
  }

  const reviewLog = await insertReviewLog({
    tenantId: run.tenantId,
    channelId: run.channelId,
    pipelineRunId: run.id,
    agent: FOUNDER_POST_HOC_AGENT,
    verdict: command.tag,
    // rationale is required (non-null text) — falls back to the tag word
    // itself when no extra notes were given, rather than an empty string.
    rationale: command.notes || command.tag,
  });

  return { ok: true, reviewLog };
}
