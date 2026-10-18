// Sprint 5 Task 7 R5.
import { describe, it, expect } from 'vitest';
import { outcomeOfStage, type OutcomeStage } from './attempt-outcome';

const st = (id: string, stageName: string, status: string, attemptNumber: number, extra: Partial<OutcomeStage> = {}): OutcomeStage => ({
  id,
  stageName,
  status,
  attemptNumber,
  output: null,
  ...extra,
});

describe('attempt outcome', () => {
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
  it('a passed review is completed', () => {
    expect(outcomeOfStage(stages[2], stages).kind).toBe('completed');
    expect(outcomeOfStage(stages[3], stages).kind).toBe('completed');
  });
  it('the review row itself reads failed review when its verdict is fail', () => {
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
  it('the backend outcome wins when it is sent', () => {
    const s = { ...st('s', 'video_generation', 'completed', 1), outcome: { kind: 'failed_review', reason: 'Logo found in 2 stills. More text.' } } as OutcomeStage;
    const o = outcomeOfStage(s, [s]);
    expect(o.kind).toBe('failed_review');
    expect(o.reason).toBe('Logo found in 2 stills.');
  });
});
