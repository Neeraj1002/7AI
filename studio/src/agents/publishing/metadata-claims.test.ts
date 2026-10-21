import { describe, it, expect } from 'vitest';
import { checkMetadataClaims, describeClaimIssues, holdingIssues, spellOutAbbreviations } from './metadata-claims';

// Sprint 5 Task 8 (R11.6) against the merged Task 6 rule (script-review/numbers.ts): these tests pin what Task 8
// relies on, not the rule itself (Task 6's own tests do that).
const BRIEF = 'in 2003 a shortfall of about 1.4 billion Danish kroner, roughly 220 million dollars; in 2005 it sold its four Legoland theme parks for 375 million euros; first half of 2015, it outsold Mattel, 2.1 billion dollars against 1.9 billion';
const SCRIPT = 'In 2003, Lego was losing money fast. A shortfall of about 1.4 billion Danish kroner, roughly 220 million dollars. In 2005 it sold its four Legoland parks for 375 million euros. In 2015 it outsold Mattel, 2.1 billion dollars against 1.9 billion.';
const meta = (over: Partial<{ title: string; description: string; tags: string[] }> = {}) => ({
  title: 'How Lego Turned Its Crisis Around', description: 'The story of a toy company going back to basics.', tags: ['lego', 'business history'], ...over,
});
const check = (m: ReturnType<typeof meta>) => checkMetadataClaims({ scriptText: SCRIPT, briefText: BRIEF, metadata: m });

describe('abbreviations are spelled out before the shared rule reads them', () => {
  it('turns $220M, 1.4B and 90K into words the rule understands, and leaves other unit letters alone (12 mm stays)', () => {
    expect(spellOutAbbreviations('Its $220M crisis')).toBe('Its $220 million crisis');
    expect(spellOutAbbreviations('1.4B and 2.1bn')).toBe('1.4 billion and 2.1 billion');
    expect(spellOutAbbreviations('90K fans')).toBe('90 thousand fans');
    expect(spellOutAbbreviations('A 4K video, 3 men, 12 mm')).toBe('A 4 thousand video, 3 men, 12 mm');
  });
});

describe('metadata check on the merged shared rule (R11.6)', () => {
  it('a title that writes "$220M" for "roughly 220 million dollars" drops the hedge: flagged, and holds', () => {
    const issues = check(meta({ title: 'How Lego Beat Its $220M Crisis' }));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'hedge_dropped', where: 'title', holds: true, figure: '220 million' });
    expect(issues[0].message).toContain('SR-8');
  });

  it('keeps passing when the hedge is kept, in any spelling', () => {
    expect(check(meta({ title: 'Roughly $220M: How Lego Beat a Crisis' }))).toEqual([]);
    expect(check(meta({ title: 'How Lego Beat a Crisis of About 220 Million Dollars' }))).toEqual([]);
  });

  it('a figure in neither the script nor the brief is flagged (SR-1), in the title, description or tags', () => {
    const issues = check(meta({ description: 'Lego cut 18,000 jobs and lost $500 million.', tags: ['lego', '900 million'] }));
    expect(issues.every((i) => i.code === 'unsupported_number' && i.holds)).toBe(true);
    expect(issues.map((i) => i.where)).toEqual(expect.arrayContaining(['description', 'tags']));
    expect(describeClaimIssues(issues)).toMatch(/18,000|500/);
    expect(holdingIssues(issues)).toHaveLength(issues.length);
  });

  it('every figure of the approved script is accepted, years and unhedged figures included', () => {
    expect(check(meta({
      title: 'Lego vs Mattel: $2.1B to $1.9B', description: 'In 2005 Lego sold its parks for €375M; in 2003 the shortfall was about 1.4B kroner.', tags: ['lego 2003', 'mattel'] }))).toEqual([]);
  });

  it('a clean title, description and tags raise nothing', () => {
    expect(check(meta())).toEqual([]);
  });

  it('the figures of the script count as source too, not only the brief', () => {
    const issues = checkMetadataClaims({ scriptText: 'It took 12 years to finish.', briefText: '', metadata: meta({ title: 'Twelve years' }) });
    expect(issues).toEqual([]);
  });
});

describe('the original Lego title', () => {
  it('"How Lego Turned Around Its $220M Crisis" drops the hedge of "roughly 220 million dollars": one issue', () => {
    const issues = check(meta({ title: 'How Lego Turned Around Its $220M Crisis' }));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'hedge_dropped', where: 'title', holds: true });
  });
});
