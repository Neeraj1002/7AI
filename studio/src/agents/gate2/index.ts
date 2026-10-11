import { composeNotificationChannel, resolveNotificationRecipients } from '../../notifications';
import { DEFAULT_PRIVACY_STATUS, type PrivacyStatus } from '../publishing';
import type { Channel } from '../../types';
import type { QualityMetrics } from '../video-generation/quality-spec';
import { formatQualityMetrics } from '../video-intelligence/quality-metrics';

// Approval Gate 2 — MVP_ROADMAP_OCT15.md Section 17's design, the "stays
// manual longest" gate (Section 6). Reuses Gate 1's notification interface
// and per-run threading (same threadKey = the run id) — no new transport
// code, just a second call site. Calls only studio/src/notifications/'s
// interface, never a specific channel SDK directly.

// Week 5 Task 5 (D2), founder direction 2026-09-14: approving at Gate 2 is
// also where the real, per-run privacy choice gets made — exactly like Gate
// 1's approve/edit/reject choice, not a source-level constant flipped and
// flipped back. `privacyStatus` is always resolved by parseGate2Reply itself
// (defaulting to DEFAULT_PRIVACY_STATUS on a bare "approve"), so every caller
// downstream sees a concrete value.
export type Gate2Decision =
  | { type: 'approve'; privacyStatus?: PrivacyStatus }
  | { type: 'reject'; reason: string }
  | { type: 'revise'; notes: string };
// Sprint 4 Task 4: plus the real user who resolved it (null for the ops/script path).
export type Gate2Outcome = Gate2Decision & { approvedByUserId: string | null };

// Same reply-command tolerance as Gate 1: exact, case-insensitive match for
// `approve`; `reject` matches its own command word only. Anything else is
// revision notes feeding a regen loop — **not** a raw content edit the way
// Gate 1's edited-script reply is, since a video can't be hand-edited as
// text (BUSINESS_LOGIC.md Section 4).
//
// Week 5 Task 5 (D2): "approve public"/"approve unlisted"/"approve private"
// are recognized the same way — an exact match (case-insensitive) against
// the whole reply, no fuzzy matching. A near-miss like "approved public" (a
// typo'd verb) deliberately does NOT match and falls through to `revise`,
// same reasoning as Gate 1's typo'd "aprove": a false-positive match here
// would silently publish at an unintended privacy level, which is a worse
// failure mode than requiring the founder to reply again.
const APPROVE_WITH_PRIVACY = /^approve\s+(public|unlisted|private)$/i;

export function parseGate2Reply(reply: string): Gate2Decision {
  const trimmed = reply.trim();

  if (trimmed.toLowerCase() === 'approve') {
    return { type: 'approve', privacyStatus: DEFAULT_PRIVACY_STATUS };
  }

  const privacyMatch = trimmed.match(APPROVE_WITH_PRIVACY);
  if (privacyMatch) {
    return { type: 'approve', privacyStatus: privacyMatch[1].toLowerCase() as PrivacyStatus };
  }

  const rejectMatch = trimmed.match(/^reject\b\s*(.*)$/is);
  if (rejectMatch) {
    return { type: 'reject', reason: rejectMatch[1].trim() };
  }

  return { type: 'revise', notes: trimmed };
}

export function formatGate2Message(params: {
  channelName: string;
  verdict: string;
  rationale: string;
  // Sprint 4 Task 8 (R7) — measured render quality, shown so the approver sees
  // the numbers. Absent on review rows that predate it.
  qualityMetrics?: QualityMetrics;
  // Week 5 Task 3 (restart-safe gates) — see gate1's own comment.
  restarted?: boolean;
  // Sprint 4 Task 10 (R4.1): plain warnings shown above the reply instructions (e.g. no chapter list).
  warnings?: string[];
}): string {
  const lines = [
    `Gate 2 — ${params.channelName}`,
    ...(params.restarted
      ? ['(Re-sending after a restart — this gate was already open, waiting on your reply.)']
      : []),
    ``,
    `Video Intelligence verdict: ${params.verdict}`,
    `Notes: ${params.rationale}`,
    ...(params.qualityMetrics ? [formatQualityMetrics(params.qualityMetrics)] : []),
    ...(params.warnings ?? []).map((w) => `Warning: ${w}`),
    ``,
    // Sprint 3 Task 7 (O2) — no channel left in this system attaches the
    // real video file to a gate message; the dashboard/app always reads it
    // via GET /runs/:id/video.
    `Watch the video in the app, then reply "approve" (private by default), "approve public", "approve unlisted", "reject <reason>", or send revision notes.`,
  ];
  return lines.join('\n');
}

export async function requestGate2Decision(params: {
  runId: string;
  channel: Pick<Channel, 'id' | 'tenantId' | 'ownerUserId'>;
  channelName: string;
  verdict: string;
  rationale: string;
  qualityMetrics?: QualityMetrics;
  restarted?: boolean;
  warnings?: string[];
}): Promise<Gate2Outcome> {
  const message = formatGate2Message({
    channelName: params.channelName,
    verdict: params.verdict,
    rationale: params.rationale,
    qualityMetrics: params.qualityMetrics,
    restarted: params.restarted,
    warnings: params.warnings,
  });

  // Sprint 3 Task 3 (K2) — same real per-user routing as Gate 1.
  const recipients = await resolveNotificationRecipients(params.channel);
  const channel = await composeNotificationChannel({
    tenantId: params.channel.tenantId,
    channelId: params.channel.id,
    userIds: recipients.map((user) => user.id),
  });
  const { reply, userId } = await channel.requestApproval({
    threadKey: params.runId,
    message,
  });

  return { ...parseGate2Reply(reply), approvedByUserId: userId };
}
