import { NonTransientStageError } from './retry-with-backoff';
import { sumUsageCostForRun } from '../models/repositories/usage-event.repository';

// Sprint 4 Task 9 (R7.3): the per-video spend limit the user sets on the brief screen
// (creationOptions.maxCostUsd). Checked before the image stage, before the render and after every
// paid call; reaching it stops the stage with a plain message (the stage's normal failure path
// then puts the run in needs_attention, where Retry can continue with a higher limit).

export const RUN_SPEND_LIMIT_PREFIX = 'Spend limit reached';

export class RunSpendLimitError extends NonTransientStageError {
  constructor(spentUsd: number, limitUsd: number) {
    super(describeRunSpendLimit(spentUsd, limitUsd), undefined, {
      recoveryKind: 'spend_limit',
    });
    this.name = 'RunSpendLimitError';
  }
}

export function describeRunSpendLimit(spentUsd: number, limitUsd: number): string {
  return `${RUN_SPEND_LIMIT_PREFIX}: this video has used $${spentUsd.toFixed(2)} of its $${limitUsd.toFixed(2)} limit, so it was stopped. Everything finished so far is kept; raise the limit and Retry to continue.`;
}

// Pure so it can be unit tested: the limit is reached when what is booked has met it.
export function isRunSpendLimitReached(spentUsd: number, limitUsd: number): boolean {
  return spentUsd >= limitUsd;
}

// Sprint 5 Task 8 (R8.2): `nextCallUsd` is what the call about to be made costs, so the stop comes before a
// call that would pass the limit and not after it (run 7a90cd6e ended at $0.51 against a $0.50 limit). A
// call's price is known to the cent for a picture and a narration chunk; a caller that cannot know passes 0.
export async function assertWithinRunLimit(
  runId: string,
  limitUsd: number,
  sumSpend: (runId: string) => Promise<number> = sumUsageCostForRun,
  nextCallUsd = 0,
): Promise<void> {
  const spent = await sumSpend(runId);
  if (isRunSpendLimitReached(spent, limitUsd) || spent + nextCallUsd > limitUsd) throw new RunSpendLimitError(spent, limitUsd);
}
