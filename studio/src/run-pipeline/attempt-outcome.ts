import type { PipelineStage } from '../types';
import { SCRIPT_REVIEW_AUTO_REJECT_THRESHOLD } from '../agents/script-review';

// Sprint 5 Task 8 (R5, R8.7): what each stage row and each video attempt really ended as, and what it
// cost, derived from the rows and the usage ledger that already exist (no new storage).
//
// A stage's own status only says whether it ran ("completed" = it finished its work). Whether the work
// was accepted is a separate fact: a review that returned a failing verdict is a completed stage whose
// outcome is "failed_review", so a screen never shows a failed review as "done".

export const STAGE_OUTCOMES = [
  'pending',
  'running',
  'completed',
  'failed_review',
  'blocked',
  'failed_error',
  'cancelled',
  'skipped',
  'rejected',
  'revised',
] as const;
export type StageOutcome = (typeof STAGE_OUTCOMES)[number];

// What kind of error ended or blocked a stage (R4). 'content' is a defect in the work itself.
export const ERROR_CLASSES = ['provider_limit', 'rate_limit', 'auth', 'spend_limit', 'network', 'content', 'other'] as const;
export type ErrorClass = (typeof ERROR_CLASSES)[number];

export type StageOutcomeInfo = {
  outcome: StageOutcome;
  // Stable machine code for a failed review (for example "shot_length"); absent otherwise.
  reasonCode?: string;
  // The reason in words: the review's rationale, the error message, or the provider's own message.
  reason?: string;
  errorClass?: ErrorClass;
  // For a blocked stage: the step Retry will run again.
  retryStep?: string;
};

type StageInfoInput = Pick<PipelineStage, 'stageName' | 'status' | 'output' | 'error'>;

const RECOVERY_CLASS: Record<string, ErrorClass> = {
  provider_capacity: 'provider_limit',
  rate_limit_exhausted: 'rate_limit',
  provider_auth: 'auth',
  spend_limit: 'spend_limit',
};

function errorClassFromText(text: string): ErrorClass {
  return /ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|fetch failed|timed? ?out|network|overloaded/i.test(text) ? 'network' : 'other';
}

export function describeStageOutcome(stage: StageInfoInput): StageOutcomeInfo {
  const output = (stage.output ?? {}) as Record<string, unknown>;
  switch (stage.status) {
    case 'pending':
      return { outcome: 'pending' };
    case 'running':
      return { outcome: 'running' };
    case 'skipped':
      return { outcome: 'skipped', ...(stage.error && { reason: stage.error }) };
    case 'failed': {
      const message = stage.error ?? 'The step failed';
      if (/cancelled by user/i.test(message)) return { outcome: 'cancelled', reason: message };
      const recovery = output.recovery as { kind?: string; message?: string; providerErrorMessage?: string | null } | undefined;
      const recoveryClass = recovery?.kind ? RECOVERY_CLASS[recovery.kind] : undefined;
      if (recoveryClass) {
        return {
          outcome: 'blocked',
          errorClass: recoveryClass,
          // The provider's own words first (they carry the date a limit returns), then ours.
          reason: recovery?.providerErrorMessage || recovery?.message || message,
          retryStep: stage.stageName,
        };
      }
      return { outcome: 'failed_error', errorClass: errorClassFromText(message), reason: message };
    }
    case 'completed': {
      if (stage.stageName === 'video_review' && output.verdict === 'fail') {
        return {
          outcome: 'failed_review',
          errorClass: 'content',
          ...(typeof output.reasonCode === 'string' && { reasonCode: output.reasonCode }),
          reason: typeof output.rationale === 'string' ? output.rationale : 'The video did not pass review',
        };
      }
      if (stage.stageName === 'script_review' && typeof output.score === 'number' && output.score < SCRIPT_REVIEW_AUTO_REJECT_THRESHOLD) {
        return {
          outcome: 'failed_review',
          errorClass: 'content',
          reason: `Script scored ${output.score} of 10, below the ${SCRIPT_REVIEW_AUTO_REJECT_THRESHOLD} needed`,
        };
      }
      if ((stage.stageName === 'gate1' || stage.stageName === 'gate2') && output.outcome === 'reject') {
        return { outcome: 'rejected', ...(typeof output.reason === 'string' && { reason: output.reason }) };
      }
      if ((stage.stageName === 'gate1' || stage.stageName === 'gate2') && output.outcome === 'revise') {
        return { outcome: 'revised', ...(typeof output.notes === 'string' && { reason: output.notes }) };
      }
      return { outcome: 'completed' };
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Video attempts and cost roll-up
// ---------------------------------------------------------------------------------------------

type RollupStage = Pick<PipelineStage, 'id' | 'stageName' | 'status' | 'attemptNumber' | 'input' | 'output' | 'error'>;

export type StageSummary = StageOutcomeInfo & {
  stageId: string;
  stageName: string;
  attemptNumber: number;
  status: string;
  costUsd: number;
  // The video attempt this row belongs to; absent for stages outside the video loop.
  videoAttempt?: number;
};

export type VideoAttempt = StageOutcomeInfo & {
  // The video_generation attempt number, which is what a person calls "attempt N".
  attempt: number;
  costUsd: number;
  stages: StageSummary[];
};

export type RunCostBreakdown = {
  spentUsd: number;
  estimateUsd?: number;
  limitUsd?: number;
  retryAllowanceUsd?: number;
  attemptsUsd: number;
  otherStagesUsd: number;
  // Usage rows not tied to any stage row (for example a preflight probe), so the parts add up to the total.
  unattributedUsd: number;
};

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export function summarizeStages(stages: RollupStage[], costByStage: Map<string | null, number>): StageSummary[] {
  const generation = stages.filter((s) => s.stageName === 'video_generation');
  const owner = new Map<string, number>(); // stageId -> video attempt number
  for (const g of generation) {
    owner.set(g.id, g.attemptNumber);
    const videoPath = (g.output as { videoPath?: string } | null)?.videoPath;
    if (!videoPath) continue;
    // A review (and a later gate) belongs to the video it looked at.
    for (const r of stages.filter((s) => s.stageName === 'video_review')) {
      if ((r.input as { videoPath?: string } | null)?.videoPath === videoPath) owner.set(r.id, g.attemptNumber);
    }
  }
  return stages.map((s) => ({
    stageId: s.id,
    stageName: s.stageName,
    attemptNumber: s.attemptNumber,
    status: s.status,
    ...describeStageOutcome(s),
    costUsd: round6(costByStage.get(s.id) ?? 0),
    ...(owner.has(s.id) && { videoAttempt: owner.get(s.id) }),
  }));
}

// One entry per video_generation attempt, oldest first.
export function buildVideoAttempts(summaries: StageSummary[]): VideoAttempt[] {
  const attempts: VideoAttempt[] = [];
  for (const gen of summaries.filter((s) => s.stageName === 'video_generation')) {
    const members = summaries.filter((s) => s.videoAttempt === gen.attemptNumber);
    const reviews = members.filter((s) => s.stageName === 'video_review').sort((a, b) => b.attemptNumber - a.attemptNumber);
    const latestReview = reviews[0];
    let info: StageOutcomeInfo;
    if (gen.outcome !== 'completed') {
      info = gen;
    } else if (!latestReview) {
      info = { outcome: 'running' };
    } else {
      info = latestReview;
    }
    const { outcome, reasonCode, reason, errorClass, retryStep } = info;
    attempts.push({
      attempt: gen.attemptNumber,
      outcome,
      ...(reasonCode && { reasonCode }),
      ...(reason && { reason }),
      ...(errorClass && { errorClass }),
      ...(retryStep && { retryStep }),
      costUsd: round6(members.reduce((sum, s) => sum + s.costUsd, 0)),
      stages: members,
    });
  }
  return attempts.sort((a, b) => a.attempt - b.attempt);
}

export function buildCostBreakdown(params: {
  summaries: StageSummary[];
  attempts: VideoAttempt[];
  costByStage: Map<string | null, number>;
  estimateUsd?: number;
  limitUsd?: number;
  retryAllowanceUsd?: number;
}): RunCostBreakdown {
  let spent = 0;
  for (const v of params.costByStage.values()) spent += v;
  const attemptsUsd = params.attempts.reduce((sum, a) => sum + a.costUsd, 0);
  const inAttempt = new Set(params.attempts.flatMap((a) => a.stages.map((s) => s.stageId)));
  const otherStagesUsd = params.summaries.filter((s) => !inAttempt.has(s.stageId)).reduce((sum, s) => sum + s.costUsd, 0);
  const knownStageIds = new Set(params.summaries.map((s) => s.stageId));
  let unattributed = 0;
  for (const [id, v] of params.costByStage) if (id === null || !knownStageIds.has(id)) unattributed += v;
  return {
    spentUsd: round6(spent),
    ...(params.estimateUsd !== undefined && { estimateUsd: params.estimateUsd }),
    ...(params.limitUsd !== undefined && { limitUsd: params.limitUsd }),
    ...(params.retryAllowanceUsd !== undefined && { retryAllowanceUsd: params.retryAllowanceUsd }),
    attemptsUsd: round6(attemptsUsd),
    otherStagesUsd: round6(otherStagesUsd),
    unattributedUsd: round6(unattributed),
  };
}
