import { describe, expect, it } from 'vitest';
import { buildLearningRecord, buildPipelineTags, hookShape, partAOutcome, readPipelineTags, titleShape } from './learning';
import type { StoredScriptCheck, StoredStoryTests } from './schemas';

const run = { id: 'r1', channelId: 'c1', tenantId: 't1' };

const stored = (status: StoredStoryTests['angleStep']['status'], tag: 'used' | 'skipped' | 'not_run' = 'used'): StoredStoryTests => ({
  version: 1,
  angleStep: { status, notRunReason: status === 'not_run' ? 'why' : null, angles: [{ id: 'a1', title: 'T', promise: 'P', figureFlag: null }], readerRuns: [], mark: 'clear_winner', readerTopId: 'a1', chosenId: status === 'chosen' ? 'a1' : null, choseReaderPick: status === 'chosen' ? true : null, chosenAt: null },
  calls: [{ purpose: 'story-angles', model: 'm', inputTokens: 1, outputTokens: 2, costUsd: 0.01, durationMs: 5 }], costUsd: 0.01,
  tags: { storyTests: 'on', partA: tag },
});
const check = (over: Partial<StoredScriptCheck> = {}): StoredScriptCheck => ({
  version: 1, status: 'ran', notRunReason: null, scriptHash: 'h', format: 'short', reader: null, swipeAtPercent: null, verdict: 'pass', reasons: [], promiseUsed: null,
  promiseMatch: { ran: false, note: 'n', about: null, remembered: null },
  calls: [{ purpose: 'story-cold-reader', model: 'm', inputTokens: 3, outputTokens: 4, costUsd: 0.02, durationMs: 7 }], costUsd: 0.02, tags: { partB: 'ran' },
  hookShape: { firstSentenceWordCount: 4, kind: 'statement', hasFigure: false }, ...over,
});

describe('titleShape', () => {
  it('counts words and reads the question mark, the figure and the opening word', () => {
    expect(titleShape('Why did 18 pieces survive?')).toEqual({ wordCount: 5, hasQuestionMark: true, hasFigure: true, openingWordType: 'question_word' });
    expect(titleShape('7 things nobody told you')).toMatchObject({ wordCount: 5, hasQuestionMark: false, hasFigure: true, openingWordType: 'number' });
    expect(titleShape('The quiet door')).toMatchObject({ hasFigure: false, openingWordType: 'other' });
    expect(titleShape('  ')).toEqual({ wordCount: 0, hasQuestionMark: false, hasFigure: false, openingWordType: 'none' });
  });
});

describe('hookShape', () => {
  it('reads the first sentence only', () => {
    expect(hookShape('Did the door open at 3? Nobody knew. More text.')).toEqual({ firstSentenceWordCount: 6, kind: 'question', hasFigure: true });
    expect(hookShape('It starts quietly. Then 5 more.')).toEqual({ firstSentenceWordCount: 3, kind: 'statement', hasFigure: false });
    expect(hookShape('')).toBeNull();
  });
});

describe('pipeline tags', () => {
  it('say on or off, carry the build, and have no stock-footage identifier', () => {
    expect(buildPipelineTags({ storyTestsOn: true, buildCommit: 'abc1234' })).toEqual({ version: 1, storyTests: 'on', stockFootageFix: null, build: 'abc1234' });
    expect(buildPipelineTags({ storyTestsOn: false, buildCommit: null })).toMatchObject({ storyTests: 'off', build: null });
  });
  it('an old intake output has none: untagged, not off', () => {
    expect(readPipelineTags({ topic: 'x' })).toBeNull();
    expect(readPipelineTags(null)).toBeNull();
    expect(readPipelineTags({ pipelineTags: buildPipelineTags({ storyTestsOn: false, buildCommit: null }) })?.storyTests).toBe('off');
  });
});

describe('buildLearningRecord', () => {
  const none = { run, intakeOutput: {}, scriptReviewOutput: {}, packaging: null };
  it('an old run: untagged, no Part A, no check, no shapes, no calls', () => {
    expect(buildLearningRecord(none)).toMatchObject({ tags: null, partA: null, angleStep: null, scriptCheck: null, titleShape: null, calls: [], costUsd: 0 });
  });
  it('a feature-off run is tagged off, with nothing else', () => {
    const rec = buildLearningRecord({ ...none, intakeOutput: { pipelineTags: buildPipelineTags({ storyTestsOn: false, buildCommit: 'b' }) } });
    expect(rec.tags?.storyTests).toBe('off');
    expect(rec.partA).toBeNull();
  });
  it('Part A used, skipped and not run are told apart', () => {
    const tags = buildPipelineTags({ storyTestsOn: true, buildCommit: null });
    const of = (s: StoredStoryTests) => buildLearningRecord({ ...none, intakeOutput: { pipelineTags: tags, storyTests: s } }).partA;
    expect(of(stored('chosen'))).toBe('used');
    expect(of(stored('skipped', 'skipped'))).toBe('skipped');
    expect(of(stored('not_run', 'not_run'))).toBe('not_run');
    expect(of(stored('waiting'))).toBe('waiting');
    expect(partAOutcome(null)).toBeNull();
  });
  it('partAOutcome maps each status value: only chosen is used, running is nothing', () => {
    const at = (status: string) => partAOutcome(stored('chosen', 'used') && ({ ...stored('chosen'), angleStep: { ...stored('chosen').angleStep, status } } as never));
    expect(at('chosen')).toBe('used');
    expect(at('skipped')).toBe('skipped');
    expect(at('not_run')).toBe('not_run');
    expect(at('waiting')).toBe('waiting');
    expect(at('running')).toBeNull();
  });
  it('joins both parts: calls, cost, hook shape, and the title shape from the packaging record', () => {
    const rec = buildLearningRecord({
      run, intakeOutput: { storyTests: stored('chosen'), pipelineTags: buildPipelineTags({ storyTestsOn: true, buildCommit: 'b' }) },
      scriptReviewOutput: { storyTest: check() }, packaging: { chosen: { title: 'Why is it so?' } as never },
    });
    expect(rec.calls.map((c) => c.purpose)).toEqual(['story-angles', 'story-cold-reader']);
    expect(rec.costUsd).toBeCloseTo(0.03, 6);
    expect(rec.scriptCheck?.hookShape).toEqual({ firstSentenceWordCount: 4, kind: 'statement', hasFigure: false });
    expect(rec.titleShape).toMatchObject({ wordCount: 4, hasQuestionMark: true, openingWordType: 'question_word' });
    expect(rec.angleStep?.chosenId).toBe('a1');
  });
  it('a check stored before Part C has no hook shape and reads null', () => {
    const older = check();
    delete older.hookShape;
    expect(buildLearningRecord({ ...none, scriptReviewOutput: { storyTest: older } }).scriptCheck?.hookShape).toBeNull();
  });
});
