import type { RetryGuard } from '../llm';
import { findChannelById } from '../models/repositories/channel.repository';
import { sumUsageCostForRun } from '../models/repositories/usage-event.repository';
import { checkBudget, describeBudgetRefusal } from './budget-gate';
import { describeRunSpendLimit, isRunSpendLimitReached } from './run-budget';

// LLM Registry task, Part B (R5): the stage's answer to "may this stage call make one more provider call?".
// callLLM asks before every extra call (a cut-off retry, a transient retry, the structured-output fallback, the
// JSON repair call). Same rules the stage applies before its first call (Sprint 5 Task 8 R8.2): the weekly
// account and channel budget (checkBudget), and the per-video limit the user set (creationOptions.maxCostUsd).
// Both add what this stage call has already spent but not yet booked (`unbookedCostUsd`), which the usage
// tables cannot see yet. Returns the words for a refusal, or null to allow.
export function makeLlmRetryGuard(run: {
  id: string;
  tenantId: string;
  channelId: string;
  creationOptions?: { maxCostUsd?: number } | null;
}): RetryGuard {
  return async ({ unbookedCostUsd }) => {
    const limit = run.creationOptions?.maxCostUsd;
    if (limit) {
      const spent = (await sumUsageCostForRun(run.id)) + unbookedCostUsd;
      if (isRunSpendLimitReached(spent, limit)) return describeRunSpendLimit(spent, limit);
    }
    const channel = await findChannelById(run.channelId);
    if (!channel) return null; // nothing to check against; the stage's own gate already ran for a real run
    const check = await checkBudget(run.tenantId, channel.id, channel.platform, new Date(), unbookedCostUsd);
    return check.ok ? null : describeBudgetRefusal(check);
  };
}
