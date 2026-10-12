// Sprint 4 Frontend Task 2 (R3) — one Inbox card per run. Notifications are grouped by `threadKey` (the run id) in
// the app, and each card's step timeline is read from the run row `runs.list` already returns (status,
// currentStage, lastError, completedAt) plus the group's own notification times. Nothing is fetched per card.
import { runTopic } from './run-labels';
import { chipFromRun } from './run-video';

export type InboxNotification = {
  id: string;
  kind: string;
  message: string;
  threadKey: string | null;
  createdAt: Date | string;
  resolvedAt: Date | string | null;
};

export type InboxRun = {
  id: string;
  channelId: string;
  status: string;
  currentStage: string | null;
  lastError: string | null;
  briefText: string;
  intakeParsed?: { topic?: string } | null;
  completedAt: Date | string | null;
  creationOptions?: unknown;
};

export type StepTone = 'ok' | 'alert' | 'dark' | 'warn' | 'fail';
export type TimelineStep = { key: 'script' | 'video' | 'final'; name: string; word: string; tone: StepTone; glyph: string; when: Date | null };

export type InboxCard = {
  key: string;
  runId: string | null;
  channelId: string | null;
  title: string;
  /** Set for a long video, so the card can show the "Video · {n} min" chip. */
  video?: { videoKind: string | undefined; targetSeconds: number | undefined };
  /** Which review the "Review …" button opens; null on a card that needs nothing. */
  gate: 1 | 2 | null;
  steps: TimelineStep[] | null;
  latestAt: Date;
};

// Each gate raises its own inbox entry; which one is read off the message the gate itself wrote
// ("Gate 1 — <channel>" / "Gate 2 — <channel>"), so no payload change is needed.
export function gateOf(message: string): 1 | 2 | null {
  const m = /^\s*Gate ([12])(?!\d)/.exec(message);
  return m ? (Number(m[1]) as 1 | 2) : null;
}

const STAGE_ORDER = ['intake', 'script_generation', 'script_review', 'gate1', 'video_generation', 'video_review', 'gate2', 'publishing', 'analytics'];
const GATE1 = STAGE_ORDER.indexOf('gate1');
const GATE2 = STAGE_ORDER.indexOf('gate2');

function asDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function endKind(lastError: string | null): 'cancelled' | 'rejected' | 'channel_deleted' | 'failed' {
  const err = lastError ?? '';
  if (err === 'Cancelled by user') return 'cancelled';
  if (err.startsWith('Rejected at Gate')) return 'rejected';
  if (err === 'Channel deleted') return 'channel_deleted';
  return 'failed';
}

export function runTimeline(run: InboxRun, group: InboxNotification[]): TimelineStep[] {
  const rank = run.status === 'completed' ? 99 : Math.max(0, STAGE_ORDER.indexOf(run.currentStage ?? 'intake'));
  const ended = run.status === 'completed' || run.status === 'failed';
  const timeOf = (gate: 1 | 2, field: 'createdAt' | 'resolvedAt') => {
    const n = group.filter((x) => x.kind === 'approval_request' && gateOf(x.message) === gate).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
    return asDate(n?.[field]);
  };
  const steps: TimelineStep[] = [];

  if (run.status === 'paused_gate1') {
    steps.push({ key: 'script', name: 'Script', word: 'Waiting for you', tone: 'alert', glyph: '!', when: timeOf(1, 'createdAt') });
  } else if (rank > GATE1) {
    steps.push({ key: 'script', name: 'Script', word: 'Approved', tone: 'ok', glyph: '✓', when: timeOf(1, 'resolvedAt') });
  }

  if (run.status === 'paused_gate2') {
    steps.push({ key: 'video', name: 'Video', word: 'Waiting for you', tone: 'alert', glyph: '!', when: timeOf(2, 'createdAt') });
  } else if (rank > GATE2) {
    steps.push({ key: 'video', name: 'Video', word: 'Approved', tone: 'ok', glyph: '✓', when: timeOf(2, 'resolvedAt') });
  } else if (!ended && rank > GATE1) {
    steps.push(
      run.status === 'needs_attention'
        ? { key: 'video', name: 'Video', word: 'Needs attention', tone: 'warn', glyph: '!', when: null }
        : { key: 'video', name: 'Video', word: 'In progress', tone: 'dark', glyph: '…', when: null },
    );
  }

  if (run.status === 'completed') {
    steps.push({ key: 'final', name: 'Run', word: 'Published', tone: 'ok', glyph: '▶', when: asDate(run.completedAt) });
  } else if (run.status === 'failed') {
    const kind = endKind(run.lastError);
    const word = kind === 'cancelled' ? 'Cancelled by you' : kind === 'rejected' ? 'Rejected by you' : kind === 'channel_deleted' ? 'Channel deleted' : 'Failed';
    steps.push({ key: 'final', name: 'Run', word, tone: kind === 'failed' ? 'fail' : 'dark', glyph: '✕', when: asDate(run.completedAt) });
  }
  return steps;
}

function firstLine(message: string): string {
  return message.split(/\r?\n/).find((l) => l.trim().length > 0)?.trim() ?? 'Notification';
}

export function buildInboxCards(
  notifications: InboxNotification[],
  runs: InboxRun[],
): { needsYou: InboxCard[]; earlier: InboxCard[] } {
  const runById = new Map(runs.map((r) => [r.id, r]));
  const groups = new Map<string, InboxNotification[]>();
  for (const n of notifications) {
    const key = n.threadKey ?? `solo:${n.id}`;
    groups.set(key, [...(groups.get(key) ?? []), n]);
  }

  const needsYou: InboxCard[] = [];
  const earlier: InboxCard[] = [];
  for (const [key, group] of groups) {
    const newest = [...group].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
    const latestAt = asDate(newest.createdAt) ?? new Date(0);
    const run = newest.threadKey ? runById.get(newest.threadKey) : undefined;
    const open = group.filter((n) => n.kind === 'approval_request' && !n.resolvedAt);
    const openGate = open.map((n) => gateOf(n.message)).find((g): g is 1 | 2 => g !== null) ?? null;

    if (run) {
      const waitingGate = run.status === 'paused_gate1' ? 1 : run.status === 'paused_gate2' ? 2 : null;
      const card: InboxCard = {
        key,
        runId: run.id,
        channelId: run.channelId,
        title: runTopic(run),
        video: chipFromRun(run),
        gate: waitingGate,
        steps: runTimeline(run, group),
        latestAt,
      };
      (waitingGate ? needsYou : earlier).push(card);
    } else {
      // The run is not in the loaded lists: title and button only, no timeline.
      const card: InboxCard = {
        key,
        runId: newest.threadKey,
        channelId: null,
        title: firstLine(newest.message),
        gate: openGate,
        steps: null,
        latestAt,
      };
      (open.length > 0 && newest.threadKey ? needsYou : earlier).push(card);
    }
  }
  const byNewest = (a: InboxCard, b: InboxCard) => +b.latestAt - +a.latestAt;
  return { needsYou: needsYou.sort(byNewest), earlier: earlier.sort(byNewest) };
}

export function reviewLabel(gate: 1 | 2 | null): string {
  return gate === 1 ? 'Review script' : gate === 2 ? 'Review video' : 'Open run';
}
