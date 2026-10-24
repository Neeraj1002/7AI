// Sprint 5 Task 7 R5 — what an attempt really ended as. The status of a stage row only says it ran ("completed"), which is
// why attempt 1 of the first acceptance run read "done" although Video Review had failed it (shot of 8.3 s, limit 7.5 s).
//
// Contract (Task 8 report, "App contract for Task 7"): `runs.get.stageSummaries[] { stageId, stageName, attemptNumber,
// status, outcome, reasonCode?, reason?, errorClass?, retryStep?, costUsd, videoAttempt? }` and `videoAttempts[] { attempt,
// outcome, reasonCode?, reason?, errorClass?, retryStep?, costUsd, stages[] }`. A video attempt's outcome is the outcome of
// its review, so "attempt 1" reads "failed review" when its review said fail. Without them (an older server) the same answer
// is derived from the rows: a video attempt whose review row says "fail" is a failed review.
import { describeFailure, shortSentence } from './failure-text';

// The server's outcome words (STAGE_OUTCOMES in studio/src/run-pipeline/attempt-outcome.ts).
export type OutcomeKind =
  | 'completed'
  | 'failed_review'
  | 'failed_error'
  | 'blocked'
  | 'cancelled'
  | 'running'
  | 'pending'
  | 'skipped'
  | 'rejected'
  | 'revised';

export type AttemptOutcome = {
  kind: OutcomeKind;
  /** Short word for the attempt row: "done", "failed review", … */
  label: string;
  /** Plain reason, empty when there is nothing to add. */
  reason: string;
  /** The server's stable code for a failed review (for example "shot_length"), when it sends one. */
  reasonCode?: string;
};

export type OutcomeStage = {
  id: string;
  stageName: string;
  status: string;
  attemptNumber: number;
  output: Record<string, unknown> | null;
  error?: string | null;
};

const KINDS: readonly OutcomeKind[] = ['completed', 'failed_review', 'failed_error', 'blocked', 'cancelled', 'running', 'pending', 'skipped', 'rejected', 'revised'];

export const OUTCOME_LABEL: Record<OutcomeKind, string> = {
  completed: 'done',
  failed_review: 'failed review',
  failed_error: 'failed',
  blocked: 'waiting for provider, retry this step',
  cancelled: 'cancelled',
  running: 'in progress',
  pending: 'waiting',
  skipped: 'skipped',
  rejected: 'rejected by you',
  revised: 'sent back with notes',
};

type ServerInfo = { outcome: OutcomeKind; reason?: string; reasonCode?: string; errorClass?: string; retryStep?: string };
export type ServerOutcomes = { byStageId: Map<string, ServerInfo>; byVideoAttempt: Map<number, ServerInfo> };

function infoOf(raw: Record<string, unknown>): ServerInfo | null {
  if (typeof raw.outcome !== 'string' || !KINDS.includes(raw.outcome as OutcomeKind)) return null;
  return {
    outcome: raw.outcome as OutcomeKind,
    ...(typeof raw.reason === 'string' && raw.reason && { reason: raw.reason }),
    ...(typeof raw.reasonCode === 'string' && { reasonCode: raw.reasonCode }),
    ...(typeof raw.errorClass === 'string' && { errorClass: raw.errorClass }),
    ...(typeof raw.retryStep === 'string' && { retryStep: raw.retryStep }),
  };
}

/** Reads `runs.get.stageSummaries` and `videoAttempts`; null when the server sends neither. */
export function serverOutcomesOf(data: unknown): ServerOutcomes | null {
  const d = data as { stageSummaries?: unknown; videoAttempts?: unknown } | undefined;
  const byStageId = new Map<string, ServerInfo>();
  const byVideoAttempt = new Map<number, ServerInfo>();
  for (const s of Array.isArray(d?.stageSummaries) ? (d!.stageSummaries as Record<string, unknown>[]) : []) {
    const info = typeof s?.stageId === 'string' ? infoOf(s) : null;
    if (info) byStageId.set(s.stageId as string, info);
  }
  for (const a of Array.isArray(d?.videoAttempts) ? (d!.videoAttempts as Record<string, unknown>[]) : []) {
    const info = typeof a?.attempt === 'number' ? infoOf(a) : null;
    if (info) byVideoAttempt.set(a.attempt as number, info);
  }
  return byStageId.size === 0 && byVideoAttempt.size === 0 ? null : { byStageId, byVideoAttempt };
}

/** The reason in words. A blocked step keeps the provider's own message, with a return date when it gives one. */
function reasonOf(info: ServerInfo): string {
  if (!info.reason) return '';
  if (info.outcome === 'blocked') {
    const f = describeFailure(info.reason);
    return f.kind === 'provider_limit' && f.detail ? `${f.title}. ${f.detail}` : shortSentence(info.reason, 200);
  }
  return shortSentence(info.reason, 160);
}

function serverOutcome(stage: OutcomeStage, server: ServerOutcomes | null | undefined): AttemptOutcome | null {
  if (!server) return null;
  // A video attempt's outcome is its review's; the other stages are looked up by their own row.
  const info = stage.stageName === 'video_generation' ? server.byVideoAttempt.get(stage.attemptNumber) : server.byStageId.get(stage.id);
  return info ? { kind: info.outcome, label: OUTCOME_LABEL[info.outcome], reason: reasonOf(info), ...(info.reasonCode && { reasonCode: info.reasonCode }) } : null;
}

/** Provider limits are not defects of the video: the run waits and a retry reruns only the blocked step. */
const PROVIDER_LIMIT = /usage limit|workspace api usage|rate limit|quota|insufficient_quota|overloaded|429|spending limit/i;

export function outcomeOfStage(stage: OutcomeStage, all: readonly OutcomeStage[], server?: ServerOutcomes | null): AttemptOutcome {
  const fromServer = serverOutcome(stage, server);
  if (fromServer) return fromServer;

  if (stage.status === 'running' || stage.status === 'pending') return { kind: 'running', label: OUTCOME_LABEL.running, reason: '' };

  if (stage.status === 'failed') {
    const err = stage.error ?? '';
    if (/^cancel/i.test(err) || err === 'Cancelled by user') return { kind: 'cancelled', label: OUTCOME_LABEL.cancelled, reason: '' };
    if (PROVIDER_LIMIT.test(err)) return { kind: 'blocked', label: OUTCOME_LABEL.blocked, reason: reasonOf({ outcome: 'blocked', reason: err }) };
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
