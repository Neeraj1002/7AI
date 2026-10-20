import { failureUsageEvents } from '../../run-pipeline/stage-failure';
import { expect,it,vi } from 'vitest';
import { readFileSync } from 'node:fs';
import fixtures from '../../content-evidence/fixtures/sr-pre-gate.json';
import { buildEvidencePacket } from '../../content-evidence/packet';
import { reviewScript, ScriptReviewOutputSchema } from './index';
import { checkBrief } from './brief-checks';
import { calibrateReview } from './rules';
import { scenePropStatus } from './scene-props';
import { scoreWithoutAdvisories } from './score-audit';
import type { LLMResponse } from '../../llm';
const clean={score:4,notes:'SR-3: repetitive. SR-4: awkward. SR-5: pronunciation.',hookScore:7,hookNotes:'Direct.',videoGenFit:{fitsLengthLimit:true,pacingRealistic:true,visualsProducible:true,flags:[]},factualConcerns:[] as string[],styleGuideViolations:[] as string[]};
const response=(o:unknown):LLMResponse=>({text:JSON.stringify(o),stopReason:'stop',provider:'anthropic',model:'claude-sonnet-5-5',usage:{inputTokens:100,outputTokens:100},costUsd:'0.001200',maxOutputTokens:16000});
const c=fixtures.evaluationCases.find(c=>c.caseId==='d4-imagined-clean')!;
const params={scriptText:c.scriptText,captions:'',nicheDescription:'History',evidence:buildEvidencePacket({briefText:c.briefText,factPolicy:'brief-only'})};
const audit={rubricScore:9,deductions:[{rule:'SR-3' as const,points:3,finding:'repetitive'},{rule:'SR-4' as const,points:1,finding:'awkward'},{rule:'SR-5' as const,points:1,finding:'pronunciation'}]};
it('D2 reconstructs the score from the explicit rubric, excluding all three advisory deductions',async()=>{
 const complete=vi.fn().mockResolvedValue(response({...clean,scoreAudit:audit}));const r=await reviewScript(params,complete);expect(r.output.score).toBe(9);expect(r.output.notes).toContain('SR-3');expect(r.output).not.toHaveProperty('scoreAudit');expect(Object.keys(r.output).sort()).toEqual(Object.keys(ScriptReviewOutputSchema.parse(clean)).sort());expect(complete).toHaveBeenCalledTimes(1);
});
it('does not manufacture a passing score for an independently low rubric grade',async()=>{
 const r=await reviewScript(params,vi.fn().mockResolvedValue(response({...clean,scoreAudit:{...audit,rubricScore:4}})));expect(r.output.score).toBe(4);
});
it.each([1,2,7,8,9])('eligible SR-%s deductions survive D2 and the correct cap still applies',async rule=>{
 const f='SR-'+rule+': Actual mismatch; restore the brief.';const o={...clean,factualConcerns:rule===2?[]:[f],styleGuideViolations:rule===2?[f]:[],scoreAudit:{rubricScore:10,deductions:[{rule:'SR-'+rule,points:1,finding:f},...audit.deductions]}};const r=await reviewScript(params,vi.fn().mockResolvedValue(response(o)));expect(r.output.score).toBe(rule===1||rule===9?6:8);expect([...r.output.factualConcerns,...r.output.styleGuideViolations]).toContain(f);
});
it('requires a score audit on live wire replies and fails closed after the existing single format retry',async()=>{
 const complete=vi.fn().mockResolvedValue(response(clean));await expect(reviewScript(params,complete)).rejects.toThrow('after one format retry');expect(complete).toHaveBeenCalledTimes(2);
});
it('rejects an untraceable or duplicate non-advisory deduction rather than silently scoring clean',()=>{
 const f='SR-1: Actual mismatch';const o={...clean,factualConcerns:[f]};expect(()=>scoreWithoutAdvisories(o,o,{rubricScore:9,deductions:[{rule:'SR-1',points:1,finding:'not a recorded finding'}]},()=>false)).toThrow('exact finding');expect(()=>scoreWithoutAdvisories(o,o,{rubricScore:9,deductions:[{rule:'SR-1',points:1,finding:f},{rule:'SR-1',points:1,finding:f}]},()=>false)).toThrow('Duplicate');
});
it('explicitly listed balance is grounded, including an old exact provider finding',async()=>{
 const f='SR-9: "I want the balance to settle" and "beside the balance" add a specific weighing device not in the brief. Use "the weights" or a hand gesture instead.';expect(scenePropStatus(c.briefText,c.scriptText,f)).toBe('listed');const r=await reviewScript(params,vi.fn().mockResolvedValue(response({...clean,factualConcerns:[f],scoreAudit:{rubricScore:9,deductions:[{rule:'SR-9',points:3,finding:f}]}})));expect(r.output.score).toBe(9);expect(r.output.factualConcerns).toEqual([]);
});
it('an unlisted ordinary prop is a visible soft SR-9 capped at eight, with no hidden hard deduction',async()=>{
 const script='I touch the bowl.';const f='SR-9 (scene-prop soft): "bowl" is an unlisted scene prop; use a listed prop.';expect(scenePropStatus(c.briefText,script,f)).toBe('soft');const r=await reviewScript({...params,scriptText:script},vi.fn().mockResolvedValue(response({...clean,factualConcerns:[f],scoreAudit:{rubricScore:10,deductions:[{rule:'SR-9',points:5,finding:f}]}})));expect(r.output.score).toBe(8);expect(r.output.factualConcerns).toEqual([f]);expect(calibrateReview({...clean,score:10,factualConcerns:[f]},[],true).score).toBe(6);
});
it.each(['SR-9 (scene-prop soft): "Dagan touches the balance" adds a prop.','SR-9 (scene-prop soft): "The bowl costs 777 coins" adds a prop.','SR-9 (scene-prop soft): "The bowl" adds a ritual prop.'])('does not downgrade a name, quantity, price or ritual: %s',f=>expect(scenePropStatus(c.briefText,'Dagan touches the balance. The bowl costs 777 coins. The bowl.',f)).toBeNull());
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
