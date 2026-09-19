import { composeFounderChannel, resolveNotificationRecipients } from '../../notify-founder';
import type { Channel } from '../../types';

// Approval Gate 1 — MVP_ROADMAP_OCT15.md Section 17's first-pass design,
// implemented as specified rather than reinvented. Calls only
// studio/src/notify-founder/'s interface, never grammy directly.

export type Gate1Outcome =
  | { type: 'approve' }
  | { type: 'reject'; reason: string }
  | { type: 'edit'; editedScriptText: string };

// "approve" — case-insensitive, exact match preferred over fuzzy matching:
// a false-positive fuzzy match (e.g. matching "approved!" or "not approve")
// would silently pass through a script the founder didn't actually approve,
// which is a worse failure mode than requiring the exact word. Reject
// likewise only matches its own command word; anything else, including a
// typo'd "aprove", falls through to "edit" (the reply becomes the sanctioned
// script text) — safe by construction, since worst case is an unintended
// script substitution the founder can see and correct next round, not a
// silently-approved bad script.
export function parseGateReply(reply: string): Gate1Outcome {
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
}): string {
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
}): Promise<Gate1Outcome> {
  const message = formatGateMessage(params);
  // Sprint 3 Task 3 (K2) — real per-user routing: the channel's real owner
  // (or, absent one, every owner-role user on the tenant — Task 2's own
  // fail-closed design, applied here to who gets told, not just who may
  // resolve it), in-app always, Telegram only if that user has linked it.
  const recipients = await resolveNotificationRecipients(params.channel);
  const channel = await composeFounderChannel({
    tenantId: params.channel.tenantId,
    channelId: params.channel.id,
    userIds: recipients.map((user) => user.id),
  });
  const { reply } = await channel.requestApproval({ threadKey: params.runId, message });
  return parseGateReply(reply);
}
