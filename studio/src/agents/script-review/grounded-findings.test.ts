import { expect, it, vi } from 'vitest';
import replays from '../../content-evidence/fixtures/sr-sonnet-round3-replays.json';
import { explicitlyAllowedRhetoric, groundModelFindings, unsupportedDocumentedCoverage } from './grounded-findings';
import { reviewScript, ScriptReviewOutputSchema } from './index';
import { buildEvidencePacket } from '../../content-evidence/packet';
const d4 = replays.cases.find(c => c.caseId === 'd4-imagined-clean')!.fixture;
const omission = replays.cases.find(c => c.caseId === 'd4-imagined-clean' && c.repeat === 2)!.output.styleGuideViolations[0];
it('replays four false DOCUMENTED-coverage findings (including one negative fixture) without rewriting fixtures or raising scores', () => {
 const rows = replays.cases.filter(c => c.output.styleGuideViolations.some(f => unsupportedDocumentedCoverage(c.fixture.briefText, f)));
 expect(rows).toHaveLength(4);
 for (const c of rows) { const r = groundModelFindings(c.output, c.fixture.briefText, c.fixture.scriptText); expect(r.styleGuideViolations).toEqual(c.output.styleGuideViolations.filter(f=>!unsupportedDocumentedCoverage(c.fixture.briefText,f)));expect(r.score).toBe(c.output.score);expect(r.notes).toContain('Original finding:'); }
});
it.each(['Include every DOCUMENTED fact. ', 'Mention the binary series. ', 'All facts are required. '])('keeps explicit coverage: %s', requirement => expect(unsupportedDocumentedCoverage(requirement + d4.briefText, omission)).toBe(false));
it.each(['SR-2: Documented facts are missing, and the opening is wrong.', 'SR-2: Documented facts are missing: prices were 999 coins.', 'SR-2: Documented cubical stone weights are missing; the length is wrong.', 'SR-8: Documented hedges are missing.', 'SR-2: Required facts are missing.'])('keeps mixed or uncertain findings: %s', f => expect(unsupportedDocumentedCoverage(d4.briefText, f)).toBe(false));
it('keeps genuine length, prop, numeric and disputed causal findings', () => {
 expect(unsupportedDocumentedCoverage('The weights were cubical.', omission)).toBe(false);
 for (const id of ['lego-facts-control','lego-rhetoric-control','d4-sensory-speech-clean','d4-imagined-invented-number','d4-sensory-speech-invented-quote','appendix-A-clean']) for(const c of replays.cases.filter(c=>c.caseId===id)) {
  const r=groundModelFindings(c.output,c.fixture.briefText,c.fixture.scriptText);expect(r.factualConcerns).toEqual(c.output.factualConcerns);
  expect(r.styleGuideViolations).toEqual(c.output.styleGuideViolations.filter(f=>!unsupportedDocumentedCoverage(c.fixture.briefText,f)));
 }
});
it('protects only exact expressly permitted rhetoric without licensing extra detail', () => {
 const c=replays.cases.find(c=>c.caseId==='lego-rhetoric-control')!.fixture;
 const f='SR-9: "It was a hard time for everyone involved" is not in brief. Remove it.';
 expect(explicitlyAllowedRhetoric(c.briefText,c.scriptText,f)).toBe(true);
 for(const bad of ['SR-9: "It was a hard time for everyone involved" and workers wore badges are not in brief.', 'SR-9: "Workers wore badges" is not in brief. Remove it.', 'SR-1: "It was a hard time for everyone involved" is not in brief. Remove it.'])expect(explicitlyAllowedRhetoric(c.briefText,c.scriptText,bad)).toBe(false);
 expect(explicitlyAllowedRhetoric('No rhetoric allowed.',c.scriptText,f)).toBe(false);
 expect(explicitlyAllowedRhetoric(c.briefText,'A different script.',f)).toBe(false);
});
it('a corrected optional omission cannot hide an invented number',async()=>{
 const f=replays.cases.find(c=>c.caseId==='d4-imagined-invented-number')!.fixture;
 const output=ScriptReviewOutputSchema.parse({...replays.cases[0].output,score:10,factualConcerns:[],styleGuideViolations:[omission]});
 const complete=vi.fn().mockResolvedValue({...replays.cases[0].response,text:JSON.stringify(output)});
 const r=await reviewScript({scriptText:f.scriptText,captions:'',nicheDescription:'history',evidence:buildEvidencePacket({briefText:f.briefText,factPolicy:'brief-only'})},complete);
 expect(r.output.score).toBe(6);expect(r.output.factualConcerns.join(' ')).toContain('777');expect(r.output.styleGuideViolations).toEqual([]);
});
