import { failureUsageEvents } from '../../run-pipeline/stage-failure';
import { expect,it,vi } from 'vitest';
import { readFileSync } from 'node:fs';
import fixtures from '../../content-evidence/fixtures/sr-pre-gate.json';
import { buildEvidencePacket } from '../../content-evidence/packet';
import { reviewScript } from './index';
import { checkBrief } from './brief-checks';
import { scoreFromAudit } from './score-audit';
import type { LLMResponse } from '../../llm';
const clean={score:4,notes:'SR-3: repetitive. SR-4: awkward. SR-5: pronunciation.',hookScore:7,hookNotes:'Direct.',videoGenFit:{fitsLengthLimit:true,pacingRealistic:true,visualsProducible:true,flags:[]},factualConcerns:[] as string[],styleGuideViolations:[] as string[]};
const response=(o:unknown):LLMResponse=>({text:JSON.stringify(o),stopReason:'stop',provider:'anthropic',model:'claude-sonnet-5-5',usage:{inputTokens:100,outputTokens:100},costUsd:'0.001200',maxOutputTokens:16000});
const c=fixtures.evaluationCases.find(c=>c.caseId==='d4-imagined-clean')!;
const params={scriptText:c.scriptText,captions:'',nicheDescription:'History',evidence:buildEvidencePacket({briefText:c.briefText,factPolicy:'brief-only'})};
const criteria=['chapter-order','open-loop','factual-causality','brief-brand','hook-promise'] as const;
const audit=(findings: {rule:'SR-1'|'SR-2'|'SR-3'|'SR-4'|'SR-5'|'SR-7'|'SR-8'|'SR-9';finding:string}[]=[],lower?:{criterion:typeof criteria[number];score:number;finding:string})=>({
 rubricSubscores:criteria.map(criterion=>({criterion,score:criterion===lower?.criterion?lower.score:10,finding:criterion===lower?.criterion?lower.finding:null})),findings,
});
it('computes five-subscore average in code and excludes advisory findings',async()=>{
 const f='SR-3: repetitive';const complete=vi.fn().mockResolvedValue(response({...clean,score:0,scoreAudit:audit([{rule:'SR-3',finding:f}],{criterion:'brief-brand',score:1,finding:f}),notes:f}));
 const r=await reviewScript(params,complete);expect(r.output.score).toBe(10);expect(r.output).not.toHaveProperty('scoreAudit');expect(complete).toHaveBeenCalledTimes(1);
});
it('averages supported objective subscores and then applies caps',async()=>{
 const f='SR-1: Actual mismatch; restore the brief.';const o={...clean,factualConcerns:[f],scoreAudit:audit([{rule:'SR-1',finding:f}],{criterion:'factual-causality',score:5,finding:f})};
 const r=await reviewScript(params,vi.fn().mockResolvedValue(response(o)));expect(r.output.score).toBe(6);
});
it('requires a private audit and a complete response',async()=>{
 const complete=vi.fn().mockResolvedValue(response(clean));await expect(reviewScript(params,complete)).rejects.toThrow('after one format retry');expect(complete).toHaveBeenCalledTimes(2);
});
it('rejects duplicate or unmatched rule findings',async()=>{
 const f='SR-1: Actual mismatch';const o={...clean,factualConcerns:[f]};expect(()=>scoreFromAudit(o,o,audit([{rule:'SR-1',finding:'SR-1: other'}]))).toThrow('exact concern');expect(()=>scoreFromAudit(o,o,audit([{rule:'SR-1',finding:f},{rule:'SR-1',finding:f}]))).toThrow('Duplicate');
});
it('dismisses a chapter meta-commentary SR-2 without a score cap',async()=>{
 const f='SR-2: Chapters mostly restate facts in meta-commentary rather than narrating events.';const o={...clean,styleGuideViolations:[f],scoreAudit:audit([{rule:'SR-2',finding:f}],{criterion:'brief-brand',score:2,finding:f})};
 const r=await reviewScript(params,vi.fn().mockResolvedValue(response(o)));expect(r.output.score).toBe(10);expect(r.output.styleGuideViolations).toEqual([]);
});
it('listed scene prop is grounded while unlisted prop retains a soft cap',async()=>{
 const f='SR-9: "I want the balance to settle" and "beside the balance" add a specific weighing device not in the brief. Use "the weights" or a hand gesture instead.';
 const r=await reviewScript(params,vi.fn().mockResolvedValue(response({...clean,factualConcerns:[f],scoreAudit:audit([{rule:'SR-9',finding:f}])})));
 expect(r.output.score).toBe(10);expect(r.output.factualConcerns).toEqual([]);
 const soft='SR-9 (scene-prop soft): "bowl" is an unlisted scene prop; use a listed prop.';
 const r2=await reviewScript({...params,scriptText:'I touch the bowl.'},vi.fn().mockResolvedValue(response({...clean,factualConcerns:[soft],scoreAudit:audit([{rule:'SR-9',finding:soft}])})));
 expect(r2.output.score).toBe(8);expect(r2.output.factualConcerns).toEqual([soft]);
});
it('scene-policy severity numbers cannot become factual number evidence',()=>{
 const checks=checkBrief(c.briefText,'There were 6 weights.');expect(checks.numericViolations.join(' ')).toContain('SR-1:');expect(checks.supportedNumericValues).not.toContain(6);
});
it('applies only the five founder-approved fixture corrections; historical snapshots remain preserved',()=>{
 const old=JSON.parse(readFileSync('../docs/execution/sprint5/reports/task6-sonnet-evidence.json','utf8')).fixtureSnapshots as typeof fixtures.evaluationCases;
 const changed=fixtures.evaluationCases.filter(c=>JSON.stringify(c)!==JSON.stringify(old.find(o=>o.caseId===c.caseId))).map(c=>c.caseId).sort();expect(changed).toEqual(['appendix-A-clean','d4-imagined-clean','d4-sensory-speech-clean','lego-facts-control','lego-rhetoric-control'].sort());
 for(const id of ['lego-facts-control','lego-rhetoric-control']){const c=fixtures.evaluationCases.find(c=>c.caseId===id)!;expect(c.scriptText.trim().split(/\s+/).length).toBeGreaterThanOrEqual(290);expect(c.scriptText.trim().split(/\s+/).length).toBeLessThanOrEqual(348);expect(checkBrief(c.briefText,c.scriptText).numericViolations).toEqual([]);expect(checkBrief(c.briefText,c.scriptText).exactViolations).toEqual([]);}
 const a=fixtures.evaluationCases.find(c=>c.caseId==='appendix-A-clean')!;expect(a.scriptText).not.toContain('the answer from owners');expect(a.scriptText).toContain('Owners pushed automatic elevators.');expect(checkBrief(a.briefText,a.scriptText).exactViolations).toEqual([]);
});

it('books all native attempts behind both format replies when parsing finally fails',async()=>{
 const prior={provider:'anthropic' as const,model:'claude-sonnet-5-5',usage:{inputTokens:20,outputTokens:10},costUsd:'0.000140',stopReason:'length',maxOutputTokens:16000,replyLength:0};
 const complete=vi.fn().mockResolvedValue({...response({not:'a review'}),priorAttempts:[prior]});
 try{await reviewScript(params,complete);expect.fail('Must fail closed');}catch(error){expect(complete).toHaveBeenCalledTimes(2);expect(failureUsageEvents(error)).toHaveLength(4);expect(failureUsageEvents(error).map(u=>u.costUsd)).toEqual(['0.000140','0.001200','0.000140','0.001200']);}
});
