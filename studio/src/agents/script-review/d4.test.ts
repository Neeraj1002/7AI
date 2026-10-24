import { expect,it,vi } from 'vitest';
import fixtures from '../../content-evidence/fixtures/sr-pre-gate.json';
import { buildEvidencePacket } from '../../content-evidence/packet';
import { reviewScript as reviewAuditedScript } from './index';
import { checkBrief } from './brief-checks';
import { reviewRules } from './rules';
const output={score:9,notes:'Supported within the supplied allowance.',hookScore:8,hookNotes:'Clear.',videoGenFit:{fitsLengthLimit:true,pacingRealistic:true,visualsProducible:true,flags:[]},factualConcerns:[],styleGuideViolations:[]};
const response=(o:unknown)=>({text:JSON.stringify(o),provider:'anthropic',model:'claude-sonnet-5-5',stopReason:'stop',usage:{inputTokens:100,outputTokens:100},costUsd:'0.001200'});
const params=(c:(typeof fixtures.evaluationCases)[number])=>({scriptText:c.scriptText,captions:'',nicheDescription:'History',videoKind:c.videoKind as 'short'|'long',targetSeconds:c.targetSeconds,evidence:buildEvidencePacket({briefText:c.briefText,factPolicy:'brief-only'})});
it.each(['d4-imagined-clean','d4-sensory-speech-clean','lego-facts-control','lego-rhetoric-control'])('does not add a numeric/exact cap to supported control %s',async id=>{
 const c=fixtures.evaluationCases.find(c=>c.caseId===id)!;const complete=vi.fn().mockResolvedValue(response(output));const r=await reviewScript(params(c),complete);expect(r.output.score).toBe(9);expect(r.output.factualConcerns).toEqual([]);expect(r.output.styleGuideViolations).toEqual([]);expect(complete).toHaveBeenCalledTimes(1);
});
it.each(['d4-imagined-invented-number','d4-sensory-speech-invented-quote'])('an IMAGINED label cannot license unsupported numbers in %s',async id=>{
 const c=fixtures.evaluationCases.find(c=>c.caseId===id)!;const r=await reviewScript(params(c),vi.fn().mockResolvedValue(response(output)));expect(r.output.score).toBe(6);expect(r.output.factualConcerns.some(s=>s.startsWith('SR-1:')&&s.includes('777'))).toBe(true);
});
it('names remain hints, but an actual invented-name/quotation finding is capped under brief-only',async()=>{
 const c=fixtures.evaluationCases.find(c=>c.caseId==='d4-sensory-speech-invented-quote')!;const script=c.scriptText.replace('777','32');const checks=checkBrief(c.briefText,script);expect(checks.hints.some(h=>h.kind==='name'&&h.text.includes('Dagan'))).toBe(true);
 const r=await reviewScript({...params(c),scriptText:script},vi.fn().mockResolvedValue(response({...output,factualConcerns:['SR-9: Dagan and the quoted factual speech are not in the documented facts; remove them.']})));expect(r.output.score).toBe(6);
});
it.each([false,true])('both prompts distinguish allowed imagination, factual dialogue and modern-term advice (long=%s)',long=>{
 const rules=reviewRules(long);expect(rules).toContain('IMAGINED allowance supports');expect(rules).toContain('invented quotations from real named people');expect(rules).toContain('SR-4 advisory anachronisms');expect(rules).toContain('The allowance never licenses new numbers');
});

// Frozen historical replies predate the private scoreAudit wire field.
const reviewScript: typeof reviewAuditedScript = (params, complete) => reviewAuditedScript(params, complete, { legacyReplay: true });
