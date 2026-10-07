import { composeNotificationChannel, resolveNotificationRecipients } from '../../notifications';
import type { Channel } from '../../types';

// Approval Gate 1 — MVP_ROADMAP_OCT15.md Section 17's first-pass design,
// implemented as specified rather than reinvented. Calls only
// studio/src/notifications/'s interface, never a specific channel SDK
// directly.

// Sprint 4 Task 4: every outcome the gate hands back also carries the real
// user who resolved it (null for the ops/script path). The parser itself stays
// pure and user-agnostic: it returns GateDecision, requestGate1Decision adds the id.
export type GateDecision =
  | { type: 'approve' }
  | { type: 'reject'; reason: string }
  | { type: 'edit'; editedScriptText: string };
export type Gate1Outcome = GateDecision & { approvedByUserId: string | null };

// "approve" — case-insensitive, exact match preferred over fuzzy matching:
// a false-positive fuzzy match (e.g. matching "approved!" or "not approve")
// would silently pass through a script the founder didn't actually approve,
// which is a worse failure mode than requiring the exact word. Reject
// likewise only matches its own command word; anything else, including a
// typo'd "aprove", falls through to "edit" (the reply becomes the sanctioned
// script text) — safe by construction, since worst case is an unintended
// script substitution the founder can see and correct next round, not a
// silently-approved bad script.
export function parseGateReply(reply: string): GateDecision {
  const trimmed = reply.trim();

  if (trimmed.toLowerCase() === 'approve') {
    return { type: 'approve' };
  }

  const rejectMatch = trimmed.match(/^reject\b\s*(.*)$/is);
  if (rejectMatch) {
    return { type: 'reject', reason: rejectMatch[1].trim() };
  }

  return { type: 'edit', editedScriptText: trimmed };
}

// Channel name, the original brief, the full script, and Script Review's
// score/notes inline — MVP_ROADMAP_OCT15.md Section 17: "so you're not
// context-switching to see why it passed/what was flagged."
export function formatGateMessage(params: {
  channelName: string;
  briefText: string;
  scriptText: string;
  reviewScore: string;
  reviewNotes: string;
  // Week 5 Task 3 (restart-safe gates): true when this message is a
  // re-prompt after a process restart re-opened an already-pending gate,
  // not a fresh gate — worth saying plainly so it doesn't read as a
  // confusing duplicate ask.
  restarted?: boolean;
  // Sprint 4 Task 2 (R8): each renders as its own labelled block before the
  // closing Reply line, and is omitted entirely when empty or undefined, so a
  // run with none of them produces exactly the message this function always did.
  factualConcerns?: string[];
  styleGuideViolations?: string[];
  sources?: string[];
  // Sprint 4 Task 5 (R20): non-blocking, omitted when no likely repeat was found.
  repeatTopic?: { topic: string; createdAt: string | Date } | null;
}): string {
  const block = (label: string, items: string[] | undefined): string[] =>
    items && items.length > 0 ? [``, `${label}:`, ...items.map((item) => `- ${item}`)] : [];
  return [
    `Gate 1 — ${params.channelName}`,
    ...(params.restarted
      ? ['(Re-sending after a restart — this gate was already open, waiting on your reply.)']
      : []),
    ``,
    `Brief: ${params.briefText}`,
    ``,
    `Script:`,
    params.scriptText,
    ``,
    `Review score: ${params.reviewScore}/10`,
    `Review notes: ${params.reviewNotes}`,
    ...block('Factual concerns', params.factualConcerns),
    ...block('Style guide violations', params.styleGuideViolations),
    ...block('Sources cited in brief', params.sources),
    ...(params.repeatTopic
      ? [
          ``,
          `Possible repeat topic: this looks similar to a run from ${new Date(params.repeatTopic.createdAt).toISOString().slice(0, 10)} ("${params.repeatTopic.topic}") — not blocked, just flagged.`,
        ]
      : []),
    ``,
    `Reply "approve", "reject <reason>", or send edited script text.`,
  ].join('\n');
}

export async function requestGate1Decision(params: {
  runId: string;
  channel: Pick<Channel, 'id' | 'tenantId' | 'ownerUserId'>;
  channelName: string;
  briefText: string;
  scriptText: string;
  reviewScore: string;
  reviewNotes: string;
  restarted?: boolean;
  factualConcerns?: string[];
  styleGuideViolations?: string[];
  sources?: string[];
  repeatTopic?: { topic: string; createdAt: string | Date } | null;
}): Promise<Gate1Outcome> {
  const message = formatGateMessage(params);
  // Sprint 3 Task 3 (K2) — real per-user routing: the channel's real owner
  // (or, absent one, every owner-role user on the tenant — Task 2's own
  // fail-closed design, applied here to who gets told, not just who may
  // resolve it), in-app always, push (Task 7/O1) only if that user has a
  // registered token.
  const recipients = await resolveNotificationRecipients(params.channel);
  const channel = await composeNotificationChannel({
    tenantId: params.channel.tenantId,
    channelId: params.channel.id,
    userIds: recipients.map((user) => user.id),
  });
  const { reply, userId } = await channel.requestApproval({ threadKey: params.runId, message });
  return { ...parseGateReply(reply), approvedByUserId: userId };
}
