import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({callLLM:vi.fn()}));vi.mock('../../llm',async orig=>({...await orig<object>(),callLLM:mocks.callLLM}));
import { reviewScript as reviewAuditedScript, ScriptReviewOutputSchema, SCRIPT_REVIEW_MAX_TOKENS, SCRIPT_REVIEW_RETRY_MAX_TOKENS, ScriptReviewWireSchema } from './index';
import { getStageErrorContext } from '../../run-pipeline/retry-with-backoff';
import { failureUsageEvents } from '../../run-pipeline/stage-failure';
import replays from '../../content-evidence/fixtures/sr-offline-replays.json';
const clean=()=>({score:10,notes:'Clear.',hookScore:8,hookNotes:'Direct.',videoGenFit:{fitsLengthLimit:true,pacingRealistic:true,visualsProducible:true,flags:[]},factualConcerns:[],styleGuideViolations:[]});
const call=(text:string,stopReason='stop')=>({text,stopReason,usage:{inputTokens:100,outputTokens:100,reasoningTokens:0},costUsd:'0.000600',provider:'anthropic',model:'claude-haiku-4-5'});
const params={scriptText:'A bridge opened in 1901. It carried 50 workers.',captions:'',nicheDescription:'history',briefText:'First sentence must be exactly: "A bridge opened in 1901." It carried fifty workers. Use only those facts.'};
beforeEach(()=>mocks.callLLM.mockReset());
it('replays the exact saved false spelling finding with no paid call',async()=>{
 const old=replays.cases.find(c=>c.caseId==='clean-short'&&c.repeat===1)!;mocks.callLLM.mockResolvedValue(call(JSON.stringify(old.savedOutput)));
 const result=await reviewScript(params);expect(result.output.styleGuideViolations).toEqual([]);expect(result.output.score).toBe(8);
});
it('equivalent number spelling cannot bypass an actual exact-wording requirement',async()=>{
 mocks.callLLM.mockResolvedValue(call(JSON.stringify(clean())));
 const r=await reviewScript({...params,briefText:'Last sentence must be exactly: "It carried fifty workers." The bridge opened in 1901.'});
 expect(r.output.styleGuideViolations.join(' ')).toContain('last sentence');expect(r.output.score).toBe(8);
});
it('applies new numeric verdicts even when a saved/model output says clean',async()=>{
 mocks.callLLM.mockResolvedValue(call(JSON.stringify(clean())));let r=await reviewScript({...params,briefText:'About 50 workers built it.',scriptText:'Fifty workers built it.'});expect(r.output.score).toBe(8);expect(r.output.factualConcerns[0]).toMatch(/^SR-8:/);
 r=await reviewScript({...params,briefText:'It opened in 1901.',scriptText:'It opened in 1922.'});expect(r.output.score).toBe(6);expect(r.output.factualConcerns[0]).toMatch(/^SR-1:/);
});
it.each(['length','max_tokens'])('rejects even parseable clean JSON on stop %s, then retries once',async reason=>{
 mocks.callLLM.mockResolvedValueOnce(call(JSON.stringify(clean()),reason)).mockResolvedValueOnce(call(JSON.stringify(clean())));
 const r=await reviewScript(params);expect(mocks.callLLM).toHaveBeenCalledTimes(2);expect(r.calls).toHaveLength(2);expect(r.llm.costUsd).toBe('0.000600');
 expect(mocks.callLLM.mock.calls[0][0].maxTokens).toBe(SCRIPT_REVIEW_MAX_TOKENS.short);expect(mocks.callLLM.mock.calls[1][0].maxTokens).toBe(SCRIPT_REVIEW_RETRY_MAX_TOKENS.short);expect(mocks.callLLM.mock.calls[0][0].outputSchema).toBe(ScriptReviewWireSchema);
});
it('invalid JSON twice fails closed, retains raw replies/reason/usage, and never returns a score',async()=>{
 mocks.callLLM.mockResolvedValue(call('{"score":10,"notes":"cut off','length'));
 try{await reviewScript(params);expect.fail('must not score');}catch(e){expect(mocks.callLLM).toHaveBeenCalledTimes(2);const c=getStageErrorContext(e)!;expect(c.stopReason).toBe('length');expect(c.rawReply).toContain('cut off');expect(c.rawReviewResponses).toHaveLength(2);expect(failureUsageEvents(e)).toHaveLength(2);}
});
it('a failed retry retains the first billed response',async()=>{
 mocks.callLLM.mockResolvedValueOnce(call('invalid')).mockRejectedValueOnce(new Error('provider unavailable'));
 await expect(reviewScript(params)).rejects.toThrow('retry call failed');
});

it('does not dismiss explicitly required numeric spelling',async()=>{
 mocks.callLLM.mockResolvedValue(call(JSON.stringify({...clean(),styleGuideViolations:['SR-2: Use fifty spelled out, not 50 as a numeral.']})));
 const r=await reviewScript({...params,briefText:'A bridge opened in 1901. Spell out fifty workers, in words.'});expect(r.output.styleGuideViolations).toHaveLength(1);expect(r.output.score).toBe(8);
});

import comparison from '../../content-evidence/fixtures/sr-comparison-results.json';
import { readFileSync } from 'node:fs';
const evaluationFixtures = { evaluationCases: JSON.parse(readFileSync('../docs/execution/sprint5/reports/task6-sonnet-evidence.json','utf8')).fixtureSnapshots as {caseId:string;briefText:string;scriptText:string;videoKind:string;targetSeconds:number;chapterTitles?:string[];factPolicy:string}[] };
import { buildEvidencePacket } from '../../content-evidence/packet';
import type { LLMResponse } from '../../llm';
it.each(comparison.round.calls.filter(c=>c.response))('replays actual $model / $caseId / $repeat with no provider call',async recorded=>{
 const c=evaluationFixtures.evaluationCases.find(c=>c.caseId===recorded.caseId)!;
 const complete=vi.fn().mockResolvedValue(recorded.response as LLMResponse);
 const evidence=buildEvidencePacket({briefText:c.briefText,factPolicy:c.factPolicy as 'brief-only'|'brief-plus-common'});
 const r=await reviewScript({scriptText:c.scriptText,captions:'',nicheDescription:'Historical stories',videoKind:c.videoKind as 'short'|'long',targetSeconds:c.targetSeconds,chapterTitles:c.chapterTitles,evidence},complete);
 expect(complete).toHaveBeenCalledTimes(1);
 expect(r.output.score).toBeLessThanOrEqual(JSON.parse(recorded.response!.text).score);
 if(['clean-short','appendix-A-clean'].includes(c.caseId)){expect(r.output.factualConcerns).toEqual([]);expect(r.output.styleGuideViolations).toEqual([]);}
 if(c.caseId==='SR-case-4')expect(r.output.factualConcerns.join(' ')).not.toContain('matching brief number carries an approximation/limit hedge');
});

// Frozen historical replies predate the private scoreAudit wire field.
const reviewScript: typeof reviewAuditedScript = (params, complete) => reviewAuditedScript(params, complete, { legacyReplay: true });
