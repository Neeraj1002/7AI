import fs from 'node:fs/promises';
import { founderChannel } from '../../notify-founder';

// Approval Gate 2 — MVP_ROADMAP_OCT15.md Section 17's design, the "stays
// manual longest" gate (Section 6). Reuses Gate 1's notification interface
// and per-run threading (same threadKey = the run id) — no new transport
// code, just a second call site. Calls only studio/src/notify-founder/'s
// interface, never grammy directly.

export type Gate2Outcome =
  | { type: 'approve' }
  | { type: 'reject'; reason: string }
  | { type: 'revise'; notes: string };

// Telegram's bot-upload limit for sendVideo is 50MB (per grammy's own docs,
// matching this task's own "~50MB" figure).
const TELEGRAM_MAX_VIDEO_BYTES = 50 * 1024 * 1024;

// Same reply-command tolerance as Gate 1: exact, case-insensitive match for
// `approve`; `reject` matches its own command word only. Anything else is
// revision notes feeding a regen loop — **not** a raw content edit the way
// Gate 1's edited-script reply is, since a video can't be hand-edited as
// text (BUSINESS_LOGIC.md Section 4).
export function parseGate2Reply(reply: string): Gate2Outcome {
  const trimmed = reply.trim();

  if (trimmed.toLowerCase() === 'approve') {
    return { type: 'approve' };
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
  videoPath: string;
  videoTooLargeToAttach: boolean;
  // Week 5 Task 3 (restart-safe gates) — see gate1's own comment.
  restarted?: boolean;
}): string {
  const lines = [
    `Gate 2 — ${params.channelName}`,
    ...(params.restarted
      ? ['(Re-sending after a restart — this gate was already open, waiting on your reply.)']
      : []),
    ``,
    `Video Intelligence verdict: ${params.verdict}`,
    `Notes: ${params.rationale}`,
  ];
  if (params.videoTooLargeToAttach) {
    lines.push(``, `(Video exceeds Telegram's 50MB upload limit — not attached. Local path: ${params.videoPath})`);
  }
  lines.push(``, `Reply "approve", "reject <reason>", or send revision notes.`);
  return lines.join('\n');
}

export async function requestGate2Decision(params: {
  runId: string;
  channelName: string;
  videoPath: string;
  verdict: string;
  rationale: string;
  restarted?: boolean;
}): Promise<Gate2Outcome> {
  const stat = await fs.stat(params.videoPath);
  const videoTooLargeToAttach = stat.size > TELEGRAM_MAX_VIDEO_BYTES;

  const message = formatGate2Message({
    channelName: params.channelName,
    verdict: params.verdict,
    rationale: params.rationale,
    videoPath: params.videoPath,
    videoTooLargeToAttach,
    restarted: params.restarted,
  });

  const { reply } = await founderChannel.requestApproval({
    threadKey: params.runId,
    message,
    attachmentPath: videoTooLargeToAttach ? undefined : params.videoPath,
  });

  return parseGate2Reply(reply);
}
