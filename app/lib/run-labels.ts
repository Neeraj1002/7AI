// The only place raw run/stage values become words a human reads. No raw
// internal string (status enum, stage name, [tag]-prefixed lastError) should
// ever reach a screen directly — route it through here instead.
import type { StatusChipKind } from '../components/StatusChip';
import { describeFailure, shortSentence } from './failure-text';
import { ANGLE_STATUS_WORDING, isAngleWait } from './story-tests';

export function statusLabel(status: string): string {
  if (isAngleWait(status)) return ANGLE_STATUS_WORDING;
  switch (status) {
    case 'paused_gate1':
      return 'Waiting on you · Gate 1 script review';
    case 'paused_gate2':
      return 'Waiting on you · Gate 2 video review';
    case 'needs_attention':
      return 'Needs attention';
    case 'running':
      return 'In progress';
    case 'pending':
      return 'Starting';
    case 'completed':
      return 'Published';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

// A running run that has reached publishing (or the stats snapshot right after the upload) reads
// "Publishing", not the generic "In progress".
export function isPublishingPhase(run: { status: string; currentStage?: string | null }): boolean {
  return run.status === 'running' && (run.currentStage === 'publishing' || run.currentStage === 'analytics');
}

export function runStatusLabel(run: { status: string; currentStage?: string | null }): string {
  return isPublishingPhase(run) ? 'Publishing' : statusLabel(run.status);
}

// "Regenerations used: N of 2" counts AUTOMATIC regenerations only: each failed video review triggers one,
// capped at 2. A manual Revise adds a video attempt but is not an automatic regeneration.
export const AUTO_REGEN_CAP = 2;
export function automaticRegensUsed(stages: { stageName: string; output?: Record<string, unknown> | null }[]): number {
  const fails = stages.filter((s) => s.stageName === 'video_review' && s.output?.verdict === 'fail').length;
  return Math.min(fails, AUTO_REGEN_CAP);
}

export function statusChipKind(status: string): StatusChipKind {
  if (isAngleWait(status)) return 'waiting';
  switch (status) {
    case 'paused_gate1':
    case 'paused_gate2':
      return 'waiting';
    case 'needs_attention':
      return 'attention';
    case 'failed':
      return 'failed';
    case 'completed':
      return 'ok';
    default:
      return 'neutral';
  }
}

export function queueChip(status: string): string {
  switch (status) {
    case 'paused_gate1':
      return 'Gate 1 · Script';
    case 'paused_gate2':
      return 'Gate 2 · Video';
    default:
      return statusLabel(status);
  }
}

// Ordered patterns matched against the real `lastError` shapes written by
// studio/src/run-pipeline/state-machine.ts / resume-on-startup.ts (checked
// 2026-09-26). A new backend message is a one-line addition to this table.
const ERROR_PATTERNS: { test: (msg: string) => boolean; label: string }[] = [
  { test: (m) => m.startsWith('[stale-resume-skip]'), label: 'Stalled — no progress 30+ min' },
  { test: (m) => m.startsWith('Video Intelligence regen cap'), label: 'Video retry limit reached' },
  { test: (m) => m.startsWith('Retry limit reached'), label: 'Retry limit reached' },
  { test: (m) => m.startsWith('The YouTube connection'), label: 'YouTube connection expired - reconnect needed' },
  { test: (m) => m.startsWith('Gate 2 regen cap'), label: 'Revision limit reached' },
  { test: (m) => m.startsWith('Rejected at Gate 1'), label: 'Rejected at Gate 1' },
  { test: (m) => m.startsWith('Rejected at Gate 2'), label: 'Rejected at Gate 2' },
  { test: (m) => m.includes('budget ceiling'), label: 'Budget ceiling reached' },
  { test: (m) => m.startsWith('Channel deleted'), label: 'Channel deleted' },
];

export function humanizeRunError(lastError: string | null | undefined): string {
  if (!lastError) return '';
  // Bugs Closure R1 — a budget refusal now carries its own exact sentence (which
  // limit, how much used, when it resets); show it whole rather than truncated.
  // Older rows start with 'the pooled budget ceiling' and keep the generic label.
  const refusal = /^(?:Script|Video) Generation refused: (.+)$/s.exec(lastError);
  if (refusal && !refusal[1].startsWith('the pooled')) return refusal[1];
  for (const pattern of ERROR_PATTERNS) {
    if (pattern.test(lastError)) return pattern.label;
  }
  const known = describeFailure(lastError);
  if (known.kind !== 'other') return known.title;
  // Never cut in the middle of a bracket (Sprint 5 Task 7 R5): shortSentence drops a trailing payload first.
  return shortSentence(lastError, 80);
}

// Stepper's 7 steps, mapped from stage names. `analytics` is not shown.
export const STEPPER_STEPS = ['Brief', 'Script', 'Review', 'Gate 1', 'Video', 'Gate 2', 'Publish'] as const;

export function stepperIndexForStage(stageName: string | null | undefined): number {
  switch (stageName) {
    case 'intake':
      return 0;
    case 'script_generation':
      return 1;
    case 'script_review':
      return 2;
    case 'gate1':
      return 3;
    case 'video_generation':
    case 'video_review':
      return 4;
    case 'gate2':
      return 5;
    case 'publishing':
    // After the upload the run sits at 'analytics' (first stats snapshot) while still status 'running'. The
    // video is already live, so it belongs to the Publish step; unmapped it fell back to 0 (Brief).
    case 'analytics':
      return 6;
    default:
      return 0;
  }
}

// U3: two runs of the same brief look alike; the exact start (e.g. "12 Oct, 14:05") tells them apart.
export function startedLabel(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function ageHours(date: string | Date): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  return (Date.now() - d.getTime()) / 3_600_000;
}

export function relativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 5) return `${diffDay}d ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// Bugs Closure 2 (P9) — the short line that tells two runs apart: the parsed
// topic when intake produced one, otherwise the brief's first non-empty line,
// trimmed. Never the whole brief.
const TOPIC_MAX_CHARS = 90;
export function runTopic(run: { briefText: string; intakeParsed?: { topic?: string } | null }): string {
  const parsed = run.intakeParsed?.topic?.trim();
  const firstLine = run.briefText.split(/\r?\n/).find((l) => l.trim().length > 0)?.trim() ?? '';
  const text = parsed || firstLine || 'Untitled run';
  return text.length > TOPIC_MAX_CHARS ? `${text.slice(0, TOPIC_MAX_CHARS - 1)}…` : text;
}

// Chip for a run in the "Ended" list. The runs.list rows carry no endReason,
// so this reads the same lastError texts the server's deriveEndReason matches.
export function endedChip(run: { status: string; lastError?: string | null }): { label: string; kind: StatusChipKind } {
  if (run.status === 'completed') return { label: 'Published', kind: 'ok' };
  const err = run.lastError ?? '';
  if (err === 'Cancelled by user') return { label: 'Cancelled', kind: 'neutral' };
  const rejected = /^Rejected at Gate ([12])/.exec(err);
  if (rejected) return { label: `Rejected at Gate ${rejected[1]}`, kind: 'neutral' };
  if (err === 'Channel deleted') return { label: 'Channel deleted', kind: 'neutral' };
  // Bugs Task 12 (R3): the server's classifyEndError (run-pipeline/end-reason.ts) is the source of truth;
  // this mirrors it for the list rows, which carry no endReason.
  return { label: 'Failed', kind: 'error' };
}

// Bugs Closure 2 (P10) - "script_generation" -> "script generation", and the two
// gates read "gate 1" / "gate 2" instead of the raw "gate1" / "gate2".
export function stageLabel(stageName: string): string {
  return stageName.replace(/_/g, ' ').replace(/^gate(\d)$/, 'gate $1');
}
