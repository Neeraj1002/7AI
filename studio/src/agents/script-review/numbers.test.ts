import fixtures from '../../content-evidence/fixtures/sr-pre-gate.json';
import { expect, it } from 'vitest';
import { numericVerdicts, numberMentions, sentenceSpans } from './numbers';
it.each([['$120','one hundred twenty dollars'],['$1.5 million','one and a half million dollars'],['2s6d','thirty pence'],['two shillings and sixpence','30 pence'],['a penny and a half','1.5 pence'],['$1.50','150 cents'],['50','fifty']])('normalizes %s and %s', (brief,script)=>{
  expect(numericVerdicts(brief,script).violations).toEqual([]);
  expect(numberMentions(script).map(n=>n.value)).toEqual(numberMentions(brief).map(n=>n.value));
});
it('unmatched numbers are SR-1 verdicts, including new currencies and years',()=>{
  expect(numericVerdicts('In 1900 the price was $50.','In 1922 it cost sixty dollars.').violations).toHaveLength(2);
  expect(numericVerdicts('It cost $50.','It cost 50 pence.').violations[0]).toContain('SR-1');
});
it.each(['roughly','about','around','approximately'])('a dropped %s numeric hedge is SR-8, not a hint',h=>{
  expect(numericVerdicts(h+' 50 workers built it.','Fifty workers built it.').violations[0]).toContain('SR-8');
  expect(numericVerdicts(h+' 50 workers built it.','About fifty workers built it.').violations).toEqual([]);
});
it('the hedge must be in that sentence; decimal punctuation does not split a sentence',()=>{
  expect(numericVerdicts('About 1.5 million workers.','About the strike. 1.5 million workers stopped.').violations).toHaveLength(1);
  expect(sentenceSpans('About 1.5 million workers. Next.')).toHaveLength(2);
});
it('traced derived arithmetic remains a hint; an untraced number does not',()=>{
  const r=numericVerdicts('10 coins for 5 days.','Two coins per day.');expect(r.violations).toEqual([]);expect(r.derivedHints).toHaveLength(1);
  expect(numericVerdicts('10 coins for 5 days.','Seven coins per day.').violations).toHaveLength(1);
});
it('ambiguous repeated values do not create a spurious hedge verdict',()=>{
  expect(numericVerdicts('About 50 workers arrived. The bridge held 50 workers.','The bridge held fifty workers.').violations).toEqual([]);
});

it('both existing clean controls have zero code-level numeric verdicts',()=>{
 for(const c of fixtures.evaluationCases.filter(c=>c.control))expect(numericVerdicts(c.briefText,c.scriptText).violations,c.caseId).toEqual([]);
});
