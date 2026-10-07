import { describe, it, expect } from 'vitest';
import { findLikelyRepeatTopic, topicOverlap, OVERLAP_THRESHOLD, MIN_SHARED_WORDS } from './repeat-topic';

const recent = (topic: string, day = 1, runId = topic) => ({ runId, topic, createdAt: new Date(2026, 9, day) });

describe('findLikelyRepeatTopic', () => {
  it('flags a clear repeat: "the fall of the Roman Empire" vs "why the Roman Empire fell"', () => {
    const hit = findLikelyRepeatTopic('why the Roman Empire fell', [recent('the fall of the Roman Empire')]);
    expect(hit?.topic).toBe('the fall of the Roman Empire');
  });

  it('does not flag unrelated topics', () => {
    expect(findLikelyRepeatTopic('how octopuses taste with their arms', [recent('the fall of the Roman Empire')])).toBeNull();
    expect(findLikelyRepeatTopic('the deepest lake on Earth', [recent('Rocky and Sylvester Stallone')])).toBeNull();
  });

  it('edge: one shared word is never enough ("Roman Empire" vs "Roman roads")', () => {
    expect(topicOverlap('Roman roads', 'Roman Empire')).toEqual({ shared: 1, coefficient: 0.5 });
    expect(findLikelyRepeatTopic('Roman roads', [recent('Roman Empire')])).toBeNull();
  });

  it('edge: two shared words but below the threshold is not flagged', () => {
    // {roman, empire, army, roads, trade} vs {roman, empire, fall, collapse, plague, famine}
    const o = topicOverlap('Roman Empire army roads trade', 'Roman Empire fall collapse plague famine');
    expect(o.shared).toBe(2);
    expect(o.coefficient).toBeLessThan(OVERLAP_THRESHOLD);
    expect(findLikelyRepeatTopic('Roman Empire army roads trade', [recent('Roman Empire fall collapse plague famine')])).toBeNull();
  });

  it('is case-insensitive, ignores punctuation, and treats a plural as the same word', () => {
    expect(findLikelyRepeatTopic('Honey BEES, honey', [recent('honey bee')])?.topic).toBe('honey bee');
  });

  it('picks the highest-overlap match, newest on a tie', () => {
    const hit = findLikelyRepeatTopic('moon landing 1969 Apollo', [
      recent('Apollo moon landing', 1, 'older'),
      recent('Apollo moon landing', 5, 'newer'),
    ]);
    expect(hit?.runId).toBe('newer');
  });

  it('returns null for empty input or no history', () => {
    expect(findLikelyRepeatTopic('anything here', [])).toBeNull();
    expect(findLikelyRepeatTopic('the of and', [recent('the of and')])).toBeNull();
  });

  it('documents its parameters', () => {
    expect(OVERLAP_THRESHOLD).toBe(0.6);
    expect(MIN_SHARED_WORDS).toBe(2);
  });
});
