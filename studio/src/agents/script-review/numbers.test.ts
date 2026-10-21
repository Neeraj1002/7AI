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

it.each(['capped at three pence per day','three pence a day, the official maximum'])('preserves an explicit legal limit paraphrase: %s',sentence=>{
 expect(numericVerdicts('At most three pence per day.',sentence+'.').violations).toEqual([]);
 expect(numericVerdicts('At most three pence per day.','Three pence per day.').violations[0]).toContain('SR-8:');
});
it('the recorded case 4 legal maximum does not create a numeric hedge false flag',()=>{
 const c=fixtures.evaluationCases.find(c=>c.caseId==='SR-case-4')!;
 expect(numericVerdicts(c.briefText,c.scriptText).violations).toEqual([]);
});

// A hedge covers a figure only when it sits next to it, not anywhere in the sentence (Addendum r5).
const HEDGED_BRIEF = 'In 2003 a shortfall of about 1.4 billion Danish kroner, roughly 220 million dollars. Automatic elevators were invented around 1900. About 1.5 million office workers were stranded.';
const dropped = (script: string) => numericVerdicts(HEDGED_BRIEF, script).violations;
it.each([
  ['How Lego Turned Around Its $220M Crisis', 'a verb particle is not a hedge on the figure'],
  ['How Lego Turned Around Its $220 million Crisis', 'the spelled-out form Task 8 passes in'],
  ['Around the same time, it lost $220 million.', 'a sentence-initial "Around" is far from the figure'],
])('flags %s (%s)', script => {
  expect(dropped(script).join(' ')).toContain('SR-8: dropped numeric hedge');
});
it.each([
  'It lost roughly 220 million dollars.',
  'It lost roughly $220M.',
  'Automatic elevators were invented around 1900.',
  'About 1.5 million office workers were stranded.',
  'Almost a thousand workers were laid off, and the shortfall was about 1.4 billion Danish kroner.',
])('still passes the hedged figure: %s', script => {
  expect(dropped(script).filter(v => !v.includes('thousand'))).toEqual([]);
});
it('Task 8 Lego title, against Task 8 brief: unhedged "Turned Around Its $220M" is flagged, the hedged wording is not', () => {
  const brief = 'in 2003 a shortfall of about 1.4 billion Danish kroner, roughly 220 million dollars; in 2005 it sold its four Legoland theme parks for 375 million euros';
  expect(numericVerdicts(brief, 'How Lego Turned Around Its $220 million Crisis').violations[0]).toContain('SR-8');
  expect(numericVerdicts(brief, 'How Lego Beat Its Roughly $220 million Crisis').violations).toEqual([]);
});
it('a hedge keeps its reach in the forms the fixtures use', () => {
  expect(numericVerdicts('Estimates range from forty to sixty percent.', 'Estimates range from forty to sixty percent.').violations).toEqual([]);
  expect(numericVerdicts('Wages were capped at three pence.', 'Wages were capped at three pence.').violations).toEqual([]);
  expect(numericVerdicts('There were over a thousand goods.', 'There were over a thousand goods.').violations).toEqual([]);
  expect(numericVerdicts('The limit was a maximum of eight denarii.', 'The limit was a maximum of eight denarii.').violations).toEqual([]);
  expect(numericVerdicts('It cost about 1,200 to 1,500 crates.', 'It cost about 1,200 to 1,500 crates.').violations).toEqual([]);
  // A hedge that names something else in the sentence does not cover the figure.
  expect(numericVerdicts('It had a maximum of eight denarii.', 'It cost 8 denarii, about a third of a day.').violations[0]).toContain('SR-8');
  expect(numericVerdicts('The Edict of Maximum Prices in 301 AD set limits.', 'In 301 AD it began.').violations).toEqual([]);
});
it('an attached magnitude suffix is one figure with its currency', () => {
  expect(numberMentions('$220M').map(n => [n.value, n.unit])).toEqual([[220e6, 'USD']]);
  expect(numberMentions('1.4bn and 90K and 2.5B').map(n => n.value)).toEqual([1.4e9, 9e4, 2.5e9]);
  expect(numberMentions('a 12m run, 5 mm').map(n => n.value)).toEqual([5]); // lowercase unit letters are not magnitudes
});
