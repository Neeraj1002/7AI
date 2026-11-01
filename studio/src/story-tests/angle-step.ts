import type { z } from 'zod';
import { resolvePricing, resolvePurpose, type LLMResponse, type Purpose, type RetryGuard } from '../llm';
import { callJson } from '../packaging/generate';
import { failureUsageEvents } from '../run-pipeline/stage-failure';
import { withFigureFlags, validateAngles } from './angles';
import { PART_A_CAP_USD } from './constants';
import { assignReaderIds, decideMark, failedReaderRun, mapReaderReply, readerItems, readerOrders, type Rng } from './pair-reader';
import { anglesSystem, anglesUser, pairReaderSystem, pairReaderUser, type VideoFormat } from './prompts';
import { AngleReplySchema, PairReaderReplySchema, type StoredCall, type StoredReaderRun, type StoredStoryTests } from './schemas';

// R1 to R3, R8. Part A as one function: one angle call, then two blind reader calls, then the code verdict. At most
// three calls, no retry (the guard below refuses every extra provider call), a hard cap checked before each call and
// the real usage metered after it. It never throws: whatever goes wrong is recorded and the run goes on.

export type AngleStepDeps = {
  // Books one finished call as usage events. Failed calls are booked through bookFailure.
  meter: (llm: LLMResponse, purpose: Purpose) => Promise<void>;
  bookFailure: (error: unknown, purpose: Purpose) => Promise<void>;
  rng?: Rng;
  capUsd?: number;
  // Test seam: the call function. Defaults to the registry-backed JSON call.
  call?: <S extends z.ZodType>(p: { purpose: Purpose; system: string; user: string; schema: S; retryGuard: RetryGuard }) => Promise<{ value: z.infer<S>; llm: LLMResponse }>;
};

// "No retry": every extra provider call callLLM would make (a cut-off retry, a transient retry, the structured-output
// fallback, the repair call) is refused, so a part never exceeds its call count.
export const NO_EXTRA_CALLS: RetryGuard = async () => 'story tests make no extra call';

// Worst-case cost of a call: the input at a rough 4 characters a token plus the full output limit, at the real prices.
export function worstCaseCostUsd(purpose: Purpose, system: string, user: string): number {
  const entry = resolvePurpose(purpose);
  const price = resolvePricing(entry.model);
  const inputTokens = Math.ceil((system.length + user.length) / 4);
  return (inputTokens * price.inputPerMillionUsd + entry.maxOutputTokens * price.outputPerMillionUsd) / 1_000_000;
}

function describeFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/valid JSON|failed validation|did not return/i.test(message)) return 'the reader returned an unreadable reply';
  return 'the reader could not be reached';
}

const CAP_REASON = 'the budget for this step was reached';

export async function runAngleStep(params: {
  topic: string;
  constraints: string[];
  // Text the figure flag compares a promise's numbers against (the brief and the intake result). Never sent to a model.
  sourceText: string;
  persona: string | null;
  format: VideoFormat;
  // What Part A already cost on this run (an earlier intake attempt). The cap is per run, so it counts here.
  priorSpentUsd?: number;
  deps: AngleStepDeps;
}): Promise<StoredStoryTests> {
  const { deps } = params;
  const cap = deps.capUsd ?? PART_A_CAP_USD;
  const rng = deps.rng ?? Math.random;
  const call = deps.call ?? ((p) => callJson(p));
  const calls: StoredCall[] = [];
  let spent = 0;

  // A failed call can still have cost something (a cut-off reply); it counts against the cap like any other.
  const countFailure = (error: unknown) => {
    for (const row of failureUsageEvents(error)) spent += Number(row.costUsd) || 0;
  };

  const record = (llm: LLMResponse, purpose: StoredCall['purpose']) => {
    const cost = Number(llm.costUsd) + (llm.priorAttempts ?? []).reduce((sum, a) => sum + Number(a.costUsd), 0);
    spent += cost;
    calls.push({ purpose, model: llm.model, inputTokens: llm.usage.inputTokens, outputTokens: llm.usage.outputTokens, costUsd: cost, durationMs: llm.evidence?.durationMs ?? null });
  };

  // Before each call: would its worst case still fit under the cap? One place, so no call skips it.
  const prior = params.priorSpentUsd ?? 0;
  const withinCap = (purpose: Purpose, system: string, user: string) => prior + spent + worstCaseCostUsd(purpose, system, user) <= cap;

  const finish = (partial: Partial<StoredStoryTests['angleStep']>): StoredStoryTests => {
    const step: StoredStoryTests['angleStep'] = {
      status: 'not_run', notRunReason: null, angles: [], readerRuns: [], mark: null, readerTopId: null,
      chosenId: null, choseReaderPick: null, chosenAt: null, ...partial,
    };
    return {
      version: 1, angleStep: step, calls, costUsd: spent,
      tags: { storyTests: 'on', partA: step.status === 'not_run' ? 'not_run' : 'used' },
    };
  };
  const notRun = (reason: string) => finish({ status: 'not_run', notRunReason: reason });

  // R1: the angle call.
  const anglesUserText = anglesUser(params.topic, params.constraints);
  if (!withinCap('story-angles', anglesSystem(params.format), anglesUserText)) return notRun(CAP_REASON);
  let reply: z.infer<typeof AngleReplySchema>;
  try {
    const out = await call({ purpose: 'story-angles', system: anglesSystem(params.format), user: anglesUserText, schema: AngleReplySchema, retryGuard: NO_EXTRA_CALLS });
    await deps.meter(out.llm, 'story-angles');
    record(out.llm, 'story-angles');
    reply = out.value;
  } catch (error) {
    countFailure(error);
    await deps.bookFailure(error, 'story-angles').catch(() => undefined);
    return notRun(describeFailure(error).replace('the reader', 'the angle writer'));
  }
  const validated = validateAngles(reply);
  if (!validated.ok) return notRun(`the angles were not usable: ${validated.reason}`);
  const angles = withFigureFlags(validated.angles, params.sourceText);

  // R2: two blind reads, the second in reverse order. Never a third.
  const shownAs = assignReaderIds(angles, rng);
  const orders = readerOrders(angles, rng);
  const system = pairReaderSystem(params.persona);
  const readerRuns: StoredReaderRun[] = [];
  for (const [index, order] of [orders.first, orders.second].entries()) {
    const run = (index + 1) as 1 | 2;
    const user = pairReaderUser(readerItems(angles, order, shownAs));
    if (!withinCap('story-pair-reader', system, user)) {
      readerRuns.push(failedReaderRun(run, order, shownAs, CAP_REASON));
      continue;
    }
    try {
      const out = await call({ purpose: 'story-pair-reader', system, user, schema: PairReaderReplySchema, retryGuard: NO_EXTRA_CALLS });
      await deps.meter(out.llm, 'story-pair-reader');
      record(out.llm, 'story-pair-reader');
      readerRuns.push(mapReaderReply(out.value, run, order, shownAs));
    } catch (error) {
      countFailure(error);
      await deps.bookFailure(error, 'story-pair-reader').catch(() => undefined);
      readerRuns.push(failedReaderRun(run, order, shownAs, describeFailure(error)));
    }
  }

  const { mark, readerTopId } = decideMark(readerRuns);
  return finish({ status: 'waiting', angles, readerRuns, mark, readerTopId });
}

// A part that never started (the channel's budget is spent, say): the same record shape, status not_run.
export function notRunStoryTests(reason: string): StoredStoryTests {
  return {
    version: 1,
    angleStep: { status: 'not_run', notRunReason: reason, angles: [], readerRuns: [], mark: null, readerTopId: null, chosenId: null, choseReaderPick: null, chosenAt: null },
    calls: [],
    costUsd: 0,
    tags: { storyTests: 'on', partA: 'not_run' },
  };
}
