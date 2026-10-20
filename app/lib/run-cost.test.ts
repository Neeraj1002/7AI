// Sprint 5 Task 7 R2 — cost sums on a fixture shaped like the Task 8 report's "App contract for Task 7".
// Run with the server's vitest: cd studio && npx vitest run --root ../app
import { describe, it, expect } from 'vitest';
import { attemptsAddUp, costBreakdownOf, costMapOf, formatMoney, stageCostText, stageDisplayName } from './run-cost';

const stage = (stageId: string, stageName: string, attemptNumber: number, outcome: string, costUsd: number, videoAttempt?: number) => ({
  stageId,
  stageName,
  attemptNumber,
  status: outcome === 'failed_error' ? 'failed' : 'completed',
  outcome,
  costUsd,
  ...(videoAttempt !== undefined && { videoAttempt }),
});

// The first acceptance run: three video attempts, $0.5492 in all.
const g1 = stage('g1', 'video_generation', 1, 'completed', 0.2, 1);
const r1 = stage('r1', 'video_review', 1, 'failed_review', 0.01, 1);
const g2 = stage('g2', 'video_generation', 2, 'completed', 0.2, 2);
const r2 = stage('r2', 'video_review', 2, 'completed', 0.01, 2);
const g3 = stage('g3', 'video_generation', 3, 'completed', 0.1292, 3);
const r3 = stage('r3', 'video_review', 3, 'blocked', 0, 3);
const server = {
  cost: { spentUsd: 0.5492, estimateUsd: 0.24, limitUsd: 1, retryAllowanceUsd: 0.48, attemptsUsd: 0.5492, otherStagesUsd: 0, unattributedUsd: 0 },
  videoAttempts: [
    { attempt: 1, outcome: 'failed_review', reasonCode: 'shot_length', reason: 'Longest shot 8.3 s', costUsd: 0.21, stages: [g1, r1] },
    { attempt: 2, outcome: 'completed', costUsd: 0.21, stages: [g2, r2] },
    { attempt: 3, outcome: 'blocked', errorClass: 'provider_limit', retryStep: 'video_review', costUsd: 0.1292, stages: [g3, r3] },
  ],
  stageSummaries: [g1, r1, g2, r2, g3, r3],
};

describe('cost breakdown (runs.get.cost, videoAttempts, stageSummaries)', () => {
  it('reads the totals, the estimate, the limit and the retry allowance', () => {
    const b = costBreakdownOf(server)!;
    expect(b.totalUsd).toBe(0.5492);
    expect(b.estimateUsd).toBe(0.24);
    expect(b.limitUsd).toBe(1);
    expect(b.retryAllowanceUsd).toBe(0.48);
    expect(b.attempts.map((a) => a.attemptNumber)).toEqual([1, 2, 3]);
  });
  it('attempts, other stages and unattributed add up to the total, and the listed attempts to attemptsUsd', () => {
    expect(attemptsAddUp(costBreakdownOf(server)!)).toBe(true);
  });
  it('each attempt carries its stages; a $0 blocked review reads "failed, not charged"', () => {
    const b = costBreakdownOf(server)!;
    const a3 = b.attempts[2].cost;
    expect(a3.stages.map((s) => s.name)).toEqual(['Voice, pictures and render', 'Video review']);
    expect(stageCostText(a3.stages[1])).toBe('failed, not charged');
    expect(b.attempts[0].cost.failed).toBe(true); // failed review
    expect(b.attempts[1].cost.failed).toBe(false);
  });
  it('stages outside the video loop become their own entries, keyed for the step history', () => {
    const withScript = {
      ...server,
      cost: { ...server.cost, spentUsd: 0.6, otherStagesUsd: 0.0508 },
      stageSummaries: [stage('s1', 'script_generation', 1, 'completed', 0.0508), ...server.stageSummaries],
    };
    const b = costBreakdownOf(withScript)!;
    expect(b.others.map((o) => o.stageName)).toEqual(['script_generation']);
    const map = costMapOf(b);
    expect(map.get('script_generation:1')?.totalUsd).toBe(0.0508);
    expect(map.get('video_generation:2')?.totalUsd).toBe(0.21);
    expect(map.has('video_review:1')).toBe(false); // inside its attempt
    expect(attemptsAddUp(b)).toBe(true);
  });
  it('is null on an older server and on malformed data', () => {
    expect(costBreakdownOf({})).toBeNull();
    expect(costBreakdownOf({ cost: { spentUsd: 'x' } })).toBeNull();
    expect(costBreakdownOf(undefined)).toBeNull();
  });
  it('detects numbers that do not add up', () => {
    const bad = costBreakdownOf({ ...server, cost: { ...server.cost, spentUsd: 1 } })!;
    expect(attemptsAddUp(bad)).toBe(false);
  });
});

describe('money text', () => {
  it('uses 4 decimals only under one cent', () => {
    expect(formatMoney(0.0053)).toBe('$0.0053');
    expect(formatMoney(0.5492)).toBe('$0.55');
    expect(formatMoney(0)).toBe('$0.00');
    expect(formatMoney(1)).toBe('$1.00');
  });
  it('names stages the way a person does', () => {
    expect(stageDisplayName('video_review')).toBe('Video review');
    expect(stageDisplayName('something_new')).toBe('something new');
  });
});
