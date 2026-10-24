// Sprint 4 Frontend Task 2. Run with the server's vitest: cd studio && npx vitest run --root ../app
import { describe, it, expect } from 'vitest';
import {
  buildStepHistory,
  endedTitle,
  gateWords,
  lengthLabel,
  needsAttentionText,
  plainReason,
  runChip,
  settingTiles,
  spentLine,
  tagLabel,
  type StageLike,
} from './run-view';

const row = (id: string, stageName: string, status: string, attemptNumber = 1, extra: Partial<StageLike> = {}): StageLike => ({
  id,
  stageName,
  status,
  attemptNumber,
  output: null,
  ...extra,
});

describe('run chip', () => {
  it('uses the board wording for each state', () => {
    expect(runChip({ status: 'paused_gate1' }, null).label).toBe('Gate 1 · approve script');
    expect(runChip({ status: 'paused_gate2' }, null).label).toBe('Gate 2 · approve video');
    expect(runChip({ status: 'running', currentStage: 'video_generation' }, null).label).toBe('In progress');
    expect(runChip({ status: 'needs_attention' }, null).label).toBe('Needs attention');
    expect(runChip({ status: 'completed' }, null).label).toBe('Published');
    expect(runChip({ status: 'failed' }, 'cancelled').label).toBe('Cancelled');
    expect(runChip({ status: 'failed' }, 'rejected').label).toBe('Rejected');
    expect(runChip({ status: 'failed' }, 'failed').label).toBe('Failed');
    expect(runChip({ status: 'failed' }, 'channel_deleted').label).toBe('Failed');
  });
});

describe('settings tiles (B3 fallback and resolvedOptions)', () => {
  const base = { videoKind: 'short', targetSeconds: 45 };
  it('shows the picked value, or "Channel default" when nothing was picked, never an invented default', () => {
    const { tiles } = settingTiles({ ...base, creationOptions: { visualSource: 'ai-stills' }, resolved: undefined });
    expect(tiles.find((t) => t.key === 'visuals')?.value).toBe('AI images');
    expect(tiles.find((t) => t.key === 'voice')?.value).toBe('Channel default');
    expect(tiles.find((t) => t.key === 'music')?.value).toBe('Channel default');
    expect(tiles.find((t) => t.key === 'length')?.value).toBe('Shorts · 45 s');
  });
  it('shows the server label exactly as sent (no suffix added)', () => {
    const { tiles } = settingTiles({
      ...base,
      creationOptions: null,
      resolved: { voice: { key: 'onyx', label: 'Onyx', from: 'channel' }, music: { label: 'Calm', from: 'run' }, targetSeconds: { value: 60, from: 'default' } },
    });
    expect(tiles.find((t) => t.key === 'voice')?.value).toBe('Onyx');
    expect(tiles.find((t) => t.key === 'music')?.value).toBe('Calm');
    expect(tiles.find((t) => t.key === 'length')?.value).toBe('Shorts · 60 s');
  });
  it('formats long videos in minutes and hides the format line when unknown', () => {
    expect(lengthLabel('long', 600)).toBe('Video · 10 min');
    expect(lengthLabel('short', 30)).toBe('Shorts · 30 s');
    expect(settingTiles({ ...base, creationOptions: null, resolved: undefined }).formatLine).toBeNull();
    expect(settingTiles({ ...base, creationOptions: null, resolved: { formatKey: null } }).formatLine).toBe('Format: Freeform');
    expect(settingTiles({ ...base, creationOptions: { formatKey: 'true_story' }, resolved: undefined }).formatLine).toBe('Format: True Story');
  });
});

describe('step history', () => {
  it('groups attempts: done on a later attempt after a failed first one', () => {
    const { steps } = buildStepHistory({
      stages: [
        row('a', 'intake', 'completed'),
        row('b', 'video_generation', 'failed', 1, { error: 'boom' }),
        row('c', 'video_generation', 'completed', 2),
      ],
    });
    const video = steps.find((s) => s.key === 'video')!;
    expect(video.state).toBe('done');
    expect(video.note).toBe('Done on attempt 2 · attempt 1 failed');
    expect(video.attempts.map((a) => a.title)).toEqual(['Attempt 1 · failed', 'Attempt 2 · done']);
    expect(video.attempts[0].raw).toBe('boom');
  });

  it('summarises repeated failures with the plain reason, raw error only on the attempt', () => {
    const err = 'Retry limit reached for video_generation: ECONNRESET at foo.js:12';
    const { steps, summary } = buildStepHistory({
      stages: [1, 2, 3].map((n) => row(`v${n}`, 'video_generation', 'failed', n, { error: err })),
    });
    const video = steps.find((s) => s.key === 'video')!;
    expect(video.state).toBe('failed');
    expect(video.note).toBe('failed 3 times · last: retry limit reached');
    expect(video.note).not.toContain('ECONNRESET');
    expect(summary).toBe('Video made · failed 3 times');
  });

  it('counts done steps, including earlier steps that left no row', () => {
    const { doneCount, summary } = buildStepHistory({
      stages: [row('s', 'script_generation', 'completed'), row('r', 'script_review', 'completed')],
    });
    expect(doneCount).toBe(3); // intake has no row but a later step ran
    expect(summary).toBe('3 of 7 done');
  });

  it('says nothing about who decided until gateDecisions arrives (B4)', () => {
    const stages = [row('g', 'gate1', 'completed')];
    expect(buildStepHistory({ stages }).steps.find((s) => s.key === 'gate1')?.note).toBe('Done');
    expect(
      buildStepHistory({ stages, gateDecisions: [{ gate: 1, outcome: 'approve', decidedBy: 'user' }] }).steps.find((s) => s.key === 'gate1')?.note,
    ).toBe('Approved by you');
  });
});

describe('gate words', () => {
  it('maps backend decisions to plain words', () => {
    expect(gateWords(1, [{ gate: 1, outcome: 'approve', decidedBy: 'auto' }], null)).toBe('Auto-approved');
    expect(gateWords(1, [{ gate: 1, outcome: 'edit', decidedBy: 'user' }], null)).toBe('Edited and approved');
    expect(gateWords(2, [{ gate: 2, outcome: 'approve', decidedBy: 'user', privacyStatus: 'unlisted' }], null)).toBe('Approved by you · Unlisted');
    expect(gateWords(2, undefined, { gate: 2, outcome: 'approve', privacyStatus: 'private' })).toBe('Approved · Private');
    expect(gateWords(1, undefined, { gate: 2, outcome: 'approve' })).toBe('Done');
  });
});

describe('state texts', () => {
  it('needs attention names the step, the count and the plain reason', () => {
    const stages = [1, 2, 3].map((n) => row(`v${n}`, 'video_generation', 'failed', n));
    expect(needsAttentionText({ stage: 'video_generation', stages, lastError: 'Video Intelligence regen cap reached' })).toBe(
      'Making the video failed 3 times: video retry limit reached.',
    );
    expect(plainReason(null)).toBe('something went wrong');
  });
  it('ended titles follow endReason', () => {
    expect(endedTitle('cancelled', undefined)).toBe('You cancelled this run');
    expect(endedTitle('rejected', 1)).toBe('You rejected this script');
    expect(endedTitle('rejected', 2)).toBe('You rejected this video');
    expect(endedTitle('failed', undefined)).toBe('This run stopped');
    expect(endedTitle('channel_deleted', undefined)).toBe('This run stopped');
  });
  it('shows spend only when the backend sends it', () => {
    expect(spentLine(undefined)).toBe('');
    expect(spentLine(0.4)).toBe(' Spent on this run: $0.40.');
    expect(spentLine(0)).toBe(' Nothing booked for this run.');
  });
});

describe('post-hoc tag labels', () => {
  it('maps the keys the app sends and capitalises anything else', () => {
    expect(tagLabel('weak_hook')).toBe('Weak hook');
    expect(tagLabel('bad_thumbnail_frame')).toBe('Bad thumbnail frame');
    expect(tagLabel('too_long')).toBe('Too long');
    expect(tagLabel('flat')).toBe('Flat');
  });
});

describe('step history after the first acceptance run (Sprint 5 Task 7 R5, R11)', () => {
  const failedReview = { verdict: 'fail', rationale: 'Longest shot 8.3 s, limit 7.5 s. Spread the scenes.' };
  const stages = [
    row('g1', 'video_generation', 'completed', 1),
    row('r1', 'video_review', 'completed', 1, { output: failedReview }),
    row('g2', 'video_generation', 'completed', 2),
    row('r2', 'video_review', 'completed', 2, { output: { verdict: 'pass', rationale: 'ok' } }),
  ];

  it('attempt 1 that failed review is not "done"; attempt 2 is', () => {
    const video = buildStepHistory({ stages }).steps.find((s) => s.key === 'video')!;
    expect(video.attempts.map((a) => a.title)).toEqual(['Attempt 1 · failed review', 'Attempt 2 · done']);
    expect(video.attempts[0].tone).toBe('warn');
    expect(video.attempts[0].why).toBe('Longest shot 8.3 s, limit 7.5 s.');
    expect(video.attempts[1].tone).toBe('ok');
    expect(video.note).toBe('Done on attempt 2 · attempt 1 failed');
  });

  it('a run whose only video attempt failed review is a failed step with the reason', () => {
    const { steps, summary } = buildStepHistory({ stages: stages.slice(0, 2) });
    const video = steps.find((s) => s.key === 'video')!;
    expect(video.state).toBe('failed');
    expect(video.note).toBe('failed review · longest shot 8.3 s, limit 7.5 s.');
    expect(summary).toBe('Video made · failed once');
  });

  it('keeps the rows Details used to hold: the review and the first stats appear in the one history', () => {
    const { steps } = buildStepHistory({ stages: [...stages, row('p', 'publishing', 'completed'), row('a', 'analytics', 'completed')] });
    expect(steps.map((s) => s.key)).toContain('video_review');
    expect(steps.map((s) => s.key)).toContain('analytics');
    expect(steps.find((s) => s.key === 'analytics')?.note).toBe('Saved');
    // a run that has not got that far still shows the original seven
    expect(buildStepHistory({ stages: [row('s', 'script_generation', 'completed')] }).steps).toHaveLength(7);
  });

  it("shows each attempt's outcome and reason only; the cost lives on the cost card", () => {
    const video = buildStepHistory({ stages }).steps.find((s) => s.key === 'video')!;
    expect(video.attempts[0].title).toBe('Attempt 1 · failed review');
    expect(video.attempts[0].why).toBe('Longest shot 8.3 s, limit 7.5 s.');
    expect(video.attempts[0]).not.toHaveProperty('cost');
  });
});
