import { describe, it, expect } from 'vitest';
import { estimateStillCount, normalizeShotList, ProductionPlanSchema } from './plan';

const words = (n: number): string => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

describe('estimateStillCount (Sprint 4 Task 8, R6)', () => {
  it('a 120-word script requests ~18 stills; a 60-word script ~9', () => {
    expect(estimateStillCount(words(120))).toBe(18);
    expect(estimateStillCount(words(60))).toBe(9);
  });

  it('clamps to 6 at the low end and 20 at the high end', () => {
    expect(estimateStillCount(words(5))).toBe(6);
    expect(estimateStillCount('')).toBe(6);
    expect(estimateStillCount(words(400))).toBe(20);
  });

  it('ignores repeated whitespace when counting words', () => {
    expect(estimateStillCount(`  ${words(60).replace(/ /g, '   ')}\n`)).toBe(9);
  });
});

describe('normalizeShotList (R5)', () => {
  const base = { visualSource: 'stock-footage', stockFootageQuery: 'ocean' };

  it('passes plans without a shot list through untouched (old stage outputs stay valid)', () => {
    expect(normalizeShotList(base)).toEqual(base);
  });

  it('drops a too-short list so the single-query fallback is used', () => {
    expect(normalizeShotList({ ...base, stockFootageQueries: ['a', 'b'] })).toEqual(base);
  });

  it('truncates a too-long list to the 8-beat cap', () => {
    const out = normalizeShotList({ ...base, stockFootageQueries: Array.from({ length: 11 }, (_, i) => `q${i}`) }) as {
      stockFootageQueries: string[];
    };
    expect(out.stockFootageQueries).toHaveLength(8);
  });

  it('a plan with a 3-8 shot list validates against the schema', () => {
    const plan = {
      ...base,
      stockFootageQueries: ['ocean waves', 'coral reef', 'diver silhouette'],
      captionStyle: 'phrase-grouped',
      audioLayer: 'calm',
      pacingNotes: 'n',
      rationale: 'r',
    };
    expect(ProductionPlanSchema.safeParse(normalizeShotList(plan)).success).toBe(true);
  });
});
