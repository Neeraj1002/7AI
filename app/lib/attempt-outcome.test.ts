// Sprint 5 Task 7 R5 — attempt outcomes, with the field names of the Task 8 report's "App contract for Task 7".
import { describe, it, expect } from 'vitest';
import { outcomeOfStage, serverOutcomesOf, type OutcomeStage } from './attempt-outcome';

const st = (id: string, stageName: string, status: string, attemptNumber: number, extra: Partial<OutcomeStage> = {}): OutcomeStage => ({
  id,
  stageName,
  status,
  attemptNumber,
  output: null,
  ...extra,
});

describe('derived from the rows (an older server)', () => {
  const stages = [
    st('g1', 'video_generation', 'completed', 1),
    st('r1', 'video_review', 'completed', 1, { output: { verdict: 'fail', rationale: 'Longest shot 8.3 s, limit 7.5 s. Redistribute scene starts.' } }),
    st('g2', 'video_generation', 'completed', 2),
    st('r2', 'video_review', 'completed', 2, { output: { verdict: 'pass', rationale: 'ok' } }),
  ];

  it('attempt 1 failed Video Review: never "done"', () => {
    const o = outcomeOfStage(stages[0], stages);
    expect(o.kind).toBe('failed_review');
    expect(o.label).toBe('failed review');
    expect(o.reason).toBe('Longest shot 8.3 s, limit 7.5 s.');
  });
  it('a passed review is completed; the review row itself reads failed review when its verdict is fail', () => {
    expect(outcomeOfStage(stages[2], stages).kind).toBe('completed');
    expect(outcomeOfStage(stages[3], stages).kind).toBe('completed');
    expect(outcomeOfStage(stages[1], stages).kind).toBe('failed_review');
  });
  it('error classes: provider limit is blocked, cancel is cancelled, anything else failed', () => {
    const blocked = st('b', 'video_review', 'failed', 3, { error: 'You have reached your specified workspace API usage limits' });
    expect(outcomeOfStage(blocked, [blocked]).kind).toBe('blocked');
    const cancelled = st('c', 'video_generation', 'failed', 1, { error: 'Cancelled by user' });
    expect(outcomeOfStage(cancelled, [cancelled]).kind).toBe('cancelled');
    const failed = st('f', 'video_generation', 'failed', 1, { error: 'ffmpeg exited 1' });
    expect(outcomeOfStage(failed, [failed]).kind).toBe('failed_error');
    expect(outcomeOfStage(st('x', 'video_generation', 'running', 1), []).kind).toBe('running');
  });
});

describe('runs.get.stageSummaries and videoAttempts', () => {
  const server = {
    stageSummaries: [
      { stageId: 'g1', stageName: 'video_generation', attemptNumber: 1, status: 'completed', outcome: 'completed', costUsd: 0.2, videoAttempt: 1 },
      { stageId: 'r1', stageName: 'video_review', attemptNumber: 1, status: 'completed', outcome: 'failed_review', reasonCode: 'shot_length', reason: 'Longest shot 8.3 s, limit 7.5 s. Spread the scenes.', errorClass: 'content', costUsd: 0.01, videoAttempt: 1 },
      { stageId: 'r3', stageName: 'video_review', attemptNumber: 3, status: 'failed', outcome: 'blocked', errorClass: 'provider_limit', retryStep: 'video_review', reason: 'You have reached your specified workspace API usage limits. You will regain access on 2026-11-01 at 00:00 UTC.', costUsd: 0, videoAttempt: 3 },
      { stageId: 's1', stageName: 'script_generation', attemptNumber: 1, status: 'completed', outcome: 'completed', costUsd: 0.05 },
      { stageId: 'p1', stageName: 'gate2', attemptNumber: 1, status: 'completed', outcome: 'revised', reason: 'More energy', costUsd: 0 },
    ],
    videoAttempts: [
      { attempt: 1, outcome: 'failed_review', reasonCode: 'shot_length', reason: 'Longest shot 8.3 s, limit 7.5 s. Spread the scenes.', costUsd: 0.21, stages: [] },
      { attempt: 3, outcome: 'blocked', errorClass: 'provider_limit', retryStep: 'video_review', reason: 'You have reached your specified workspace API usage limits. You will regain access on 2026-11-01 at 00:00 UTC.', costUsd: 0.13, stages: [] },
    ],
  };
  const out = serverOutcomesOf(server);

  it('a video attempt takes the outcome of its review, even though its own row says completed', () => {
    const gen = st('g1', 'video_generation', 'completed', 1);
    const o = outcomeOfStage(gen, [gen], out);
    expect(o.kind).toBe('failed_review');
    expect(o.label).toBe('failed review');
    expect(o.reason).toBe('Longest shot 8.3 s, limit 7.5 s.');
    expect(o.reasonCode).toBe('shot_length');
  });
  it('a blocked step reads "waiting for provider, retry this step" with the provider\'s return date', () => {
    const review = st('r3', 'video_review', 'failed', 3);
    const o = outcomeOfStage(review, [review], out);
    expect(o.kind).toBe('blocked');
    expect(o.label).toBe('waiting for provider, retry this step');
    expect(o.reason).toContain('usage limit reached');
    expect(o.reason).toContain('1 Nov 2026');
  });
  it('other stages are looked up by their own row id, including gate outcomes', () => {
    expect(outcomeOfStage(st('s1', 'script_generation', 'completed', 1), [], out).kind).toBe('completed');
    const gate = outcomeOfStage(st('p1', 'gate2', 'completed', 1), [], out);
    expect(gate.kind).toBe('revised');
    expect(gate.label).toBe('sent back with notes');
  });
  it('a row the server did not list falls back to the derived answer; no data gives null', () => {
    expect(outcomeOfStage(st('zz', 'intake', 'completed', 1), [], out).kind).toBe('completed');
    expect(serverOutcomesOf({})).toBeNull();
    expect(serverOutcomesOf({ stageSummaries: [{ stageId: 'a', outcome: 'nonsense' }] })).toBeNull();
  });
});
