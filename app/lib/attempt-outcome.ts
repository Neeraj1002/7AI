// Sprint 5 Task 7 R5 — what an attempt really ended as. The status of a stage row only says it ran ("completed"), which is
// why attempt 1 of the first acceptance run read "done" although Video Review had failed it (shot of 8.3 s, limit 7.5 s).
//
// Contract with the backend (Task 8 R5, field names to be confirmed against its report): each stage row of `runs.get` may
// carry `outcome: { kind, reason?, reasonCode?, errorClass? }`. Until it does, the same answer is derived from what the
// rows already hold: a video attempt whose review row says "fail" is a failed review.
import { shortSentence } from './failure-text';

export type OutcomeKind = 'completed' | 'failed_review' | 'failed_error' | 'blocked' | 'cancelled' | 'running';

export type AttemptOutcome = {
  kind: OutcomeKind;
  /** Short word for the attempt row: "done", "failed review", … */
  label: string;
  /** Plain reason, empty when there is nothing to add. */
  reason: string;
};

export type OutcomeStage = {
  id: string;
  stageName: string;
  status: string;
  attemptNumber: number;
  output: Record<string, unknown> | null;
  error?: string | null;
};

const KINDS: readonly OutcomeKind[] = ['completed', 'failed_review', 'failed_error', 'blocked', 'cancelled', 'running'];

export const OUTCOME_LABEL: Record<OutcomeKind, string> = {
  completed: 'done',
  failed_review: 'failed review',
  failed_error: 'failed',
  blocked: 'blocked, waiting for provider',
  cancelled: 'cancelled',
  running: 'in progress',
};

/** Provider limits are not defects of the video: the run waits and a retry reruns only the blocked step. */
const PROVIDER_LIMIT = /usage limit|workspace api usage|rate limit|quota|insufficient_quota|overloaded|429|spending limit/i;

function serverOutcome(stage: OutcomeStage): AttemptOutcome | null {
  const raw = (stage as unknown as { outcome?: { kind?: unknown; reason?: unknown } }).outcome;
  if (!raw || typeof raw.kind !== 'string' || !KINDS.includes(raw.kind as OutcomeKind)) return null;
  const kind = raw.kind as OutcomeKind;
  return { kind, label: OUTCOME_LABEL[kind], reason: typeof raw.reason === 'string' ? shortSentence(raw.reason, 160) : '' };
}

export function outcomeOfStage(stage: OutcomeStage, all: readonly OutcomeStage[]): AttemptOutcome {
  const fromServer = serverOutcome(stage);
  if (fromServer) return fromServer;

  if (stage.status === 'running' || stage.status === 'pending') return { kind: 'running', label: OUTCOME_LABEL.running, reason: '' };

  if (stage.status === 'failed') {
    const err = stage.error ?? '';
    if (/^cancel/i.test(err) || err === 'Cancelled by user') return { kind: 'cancelled', label: OUTCOME_LABEL.cancelled, reason: '' };
    if (PROVIDER_LIMIT.test(err)) return { kind: 'blocked', label: OUTCOME_LABEL.blocked, reason: '' };
    return { kind: 'failed_error', label: OUTCOME_LABEL.failed_error, reason: '' };
  }

  // A stage that ran to the end, but whose review said "fail", did not pass.
  const reviewRow =
    stage.stageName === 'video_generation'
      ? all.find((s) => s.stageName === 'video_review' && s.attemptNumber === stage.attemptNumber)
      : stage.stageName === 'video_review'
        ? stage
        : undefined;
  if (reviewRow?.output?.verdict === 'fail') {
    const rationale = typeof reviewRow.output.rationale === 'string' ? reviewRow.output.rationale : '';
    return { kind: 'failed_review', label: OUTCOME_LABEL.failed_review, reason: rationale ? shortSentence(rationale, 160) : '' };
  }
  return { kind: 'completed', label: OUTCOME_LABEL.completed, reason: '' };
}
