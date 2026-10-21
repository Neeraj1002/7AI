import { expect, it } from 'vitest';
import fixture from './fixtures/sr-pre-gate.json';
import { checkBrief } from '../agents/script-review/brief-checks';
import { buildEvidencePacket } from './packet';
import { buildUserMessage } from '../agents/script-review';
it('retains pre-gate contract fixtures and labels incomplete historical provenance', () => {
  expect(fixture.recordedCases).toHaveLength(7);
  expect(fixture.evaluationCases).toHaveLength(19);
  expect(fixture.evaluationCases.filter(c => c.caseId.startsWith('SR-case-'))).toHaveLength(6);
  for (const c of fixture.evaluationCases) {
    expect(c.briefText.length).toBeGreaterThan(20);
    expect(c.scriptText.length).toBeGreaterThan(20);
    const evidence = buildEvidencePacket({ briefText: c.briefText, factPolicy: 'brief-only' });
    expect(buildUserMessage({ scriptText: c.scriptText, captions: '', nicheDescription: 'history', evidence })).not.toContain('expectedRules');
  }
  for (const id of ['SR-case-3','SR-case-4','SR-case-5','SR-case-6'])
    expect(fixture.evaluationCases.find(c => c.caseId === id)?.provenance).toMatch(/reconstruct/i);
});
it('uses the actual Task 9 dev replay with both previously missed inventions', () => {
  const c = fixture.evaluationCases.find(c => c.caseId === 'S4-task9-long')!;
  expect(c.provenance).toContain('recovered read-only');
  for (const claim of ['sold for scrap', 'the research still happening inside it']) { expect(c.scriptText).toContain(claim); expect(c.briefText).not.toContain(claim); }
});
it('the Appendix control satisfies literal constraints; the damaged hedge variant does not', () => {
  const clean = fixture.evaluationCases.find(c => c.caseId === 'appendix-A-clean')!;
  const bad = fixture.evaluationCases.find(c => c.caseId === 'appendix-A-dropped-hedge')!;
  expect(checkBrief(clean.briefText, clean.scriptText).exactViolations).toEqual([]);
  expect(checkBrief(bad.briefText, bad.scriptText).exactViolations.join(' ')).toContain('around 1900');
  const words = clean.scriptText.split(/\s+/).length;
  expect(words).toBeGreaterThanOrEqual(1240 * .8); expect(words).toBeLessThanOrEqual(1240 * 1.2);
});
