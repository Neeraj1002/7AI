import { describe, it, expect } from 'vitest';
import { checkMetadataClaims, describeClaimIssues, figuresIn, holdingIssues } from './metadata-claims';

const BRIEF = 'in 2003 a shortfall of about 1.4 billion Danish kroner, roughly 220 million dollars; in 2005 it sold its four Legoland theme parks for 375 million euros; first half of 2015, it outsold Mattel, 2.1 billion dollars against 1.9 billion';
const SCRIPT = 'In 2003, Lego was losing money fast. A shortfall of about 1.4 billion Danish kroner, roughly 220 million dollars. In 2005 it sold its four Legoland parks for 375 million euros. In 2015 it outsold Mattel, 2.1 billion dollars against 1.9 billion.';
const meta = (over: Partial<{ title: string; description: string; tags: string[] }> = {}) => ({
  title: 'How Lego Turned Around Its Crisis', description: 'The story of a toy company going back to basics.', tags: ['lego', 'business history'], ...over,
});

describe('figuresIn', () => {
  it('reads the forms the same number takes', () => {
    expect(figuresIn('$220M').map((f) => f.value)).toEqual([220e6]);
    expect(figuresIn('roughly 220 million dollars').map((f) => f.value)).toEqual([220e6]);
    expect(figuresIn('220,000,000')[0].value).toBe(220e6);
    expect(figuresIn('€375 million')[0]).toMatchObject({ value: 375e6, kind: 'currency', strength: 'strong' });
    expect(figuresIn('down 27%')[0]).toMatchObject({ value: 27, kind: 'percent', strength: 'strong' });
  });
  it('finds the hedge before a figure and treats years as weak', () => {
    expect(figuresIn('roughly 220 million dollars')[0].hedge).toBe('roughly');
    expect(figuresIn('more than 50 years')[0].hedge).toBe('more than');
    expect(figuresIn('a shortfall of about 1.4 billion')[0].hedge).toBe('about');
    expect(figuresIn('220 million')[0].hedge).toBeNull();
    expect(figuresIn('In 2003')[0]).toMatchObject({ strength: 'weak' });
  });
});

describe('metadata figure and hedge check (R11.6)', () => {
  it('replays the Lego title: "$220M" drops the hedge of "roughly 220 million dollars"', () => {
    const issues = checkMetadataClaims({ scriptText: SCRIPT, briefText: BRIEF, metadata: meta({ title: 'How Lego Turned Around Its $220M Crisis' }) });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'hedge_dropped', where: 'title', holds: true });
    expect(issues[0].message).toContain('roughly');
  });

  it('passes when the hedge is kept', () => {
    expect(checkMetadataClaims({ scriptText: SCRIPT, briefText: BRIEF, metadata: meta({ title: 'How Lego Beat a Roughly $220M Crisis' }) })).toEqual([]);
    expect(checkMetadataClaims({ scriptText: SCRIPT, briefText: BRIEF, metadata: meta({ title: 'How Lego Beat a Crisis of About 220 Million Dollars' }) })).toEqual([]);
  });

  it('holds a figure that is in neither the script nor the brief', () => {
    const issues = checkMetadataClaims({ scriptText: SCRIPT, briefText: BRIEF, metadata: meta({ description: 'Lego cut 18,000 jobs and lost $500 million.' }) });
    expect(issues.map((i) => [i.code, i.figure, i.holds])).toEqual([['unsupported_number', '18,000', true], ['unsupported_number', '$500 million', true]]);
    expect(holdingIssues(issues)).toHaveLength(2);
  });

  it('only warns about a year or a small count that is not in the source', () => {
    const issues = checkMetadataClaims({ scriptText: SCRIPT, briefText: BRIEF, metadata: meta({ title: '5 Lessons From Lego in 2025' }) });
    expect(issues.length).toBeGreaterThan(0);
    expect(holdingIssues(issues)).toEqual([]);
  });

  it('accepts every figure of the approved script, in any written form', () => {
    const ok = checkMetadataClaims({ scriptText: SCRIPT, briefText: BRIEF, metadata: meta({
      title: 'Lego vs Mattel: $2.1B to $1.9B', description: 'In 2005 Lego sold its parks for €375M and in 2003 faced a shortfall of about 1.4B kroner.', tags: ['lego 2003', 'mattel'] }) });
    expect(holdingIssues(ok)).toEqual([]);
  });

  it('a figure the script states plainly once is not treated as hedged', () => {
    const script = 'It cost about 220 million dollars at first. Later it was confirmed at 220 million dollars.';
    expect(checkMetadataClaims({ scriptText: script, metadata: meta({ title: 'The 220 Million Dollar Crisis' }) })).toEqual([]);
  });

  it('checks tags too, and describes the problem in one sentence for the regeneration', () => {
    const issues = checkMetadataClaims({ scriptText: SCRIPT, briefText: BRIEF, metadata: meta({ tags: ['lego', '900 million'] }) });
    expect(issues[0]).toMatchObject({ where: 'tags', code: 'unsupported_number' });
    expect(describeClaimIssues(issues)).toContain('900 million');
  });

  it('a clean title, description and tags raise nothing', () => {
    expect(checkMetadataClaims({ scriptText: SCRIPT, briefText: BRIEF, metadata: meta() })).toEqual([]);
  });
});
