import { describe,expect,it } from 'vitest';
import { readFileSync } from 'node:fs';
import { reviewScript } from './index';
import { buildEvidencePacket } from '../../content-evidence/packet';
import type { LLMResponse } from '../../llm';
const raw=readFileSync('../docs/execution/sprint5/reports/task6-founder-decisions-evidence.json','utf8');
const ledger=JSON.parse(raw) as {complete:boolean;stepChargedUsd:number;stepCeilingUsd:number;calls:{status:string;httpStatus:number;evidence:{stopReason:string}}[];fixtures:{caseId:string;scriptText:string;briefText:string;factPolicy:'brief-only'|'brief-plus-common';videoKind:'short'|'long';targetSeconds:number;chapterTitles?:string[]}[];reviews:{caseId:string;repeat:number;status:string;output:{score:number};responses:LLMResponse[]}[]};
describe('founder-approved Sonnet controls: saved-response replay',()=>{
 it('retains only the five approved controls, complete measured usage, and the hard step cap',()=>{
  expect(new Set(ledger.fixtures.map(f=>f.caseId))).toEqual(new Set(['lego-facts-control','lego-rhetoric-control','appendix-A-clean','d4-imagined-clean','d4-sensory-speech-clean']));
  expect(ledger.reviews).toHaveLength(15);expect(ledger.calls).toHaveLength(15);expect(ledger.complete).toBe(true);expect(ledger.stepChargedUsd).toBeLessThanOrEqual(ledger.stepCeilingUsd);
  expect(ledger.calls.every(c=>c.status==='metered'&&c.httpStatus===200&&c.evidence.stopReason==='end_turn')).toBe(true);
  expect(raw).not.toMatch(/"(?:headers|responseHeaders|authorization|apiKey|requestId|email|userId|channelId)"\s*:/i);
 });
 it.each(ledger.reviews)('$caseId repeat $repeat reproduces the recorded review without a provider call',async entry=>{
  const c=ledger.fixtures.find(f=>f.caseId===entry.caseId)!;let next=0;
  const result=await reviewScript({scriptText:c.scriptText,captions:'',nicheDescription:'Historical stories',videoKind:c.videoKind,targetSeconds:c.targetSeconds,chapterTitles:c.chapterTitles,evidence:buildEvidencePacket({briefText:c.briefText,factPolicy:c.factPolicy})},async()=>{const response=entry.responses[next++];if(!response)throw Error('Missing saved reply');return response});
  expect(next).toBe(entry.responses.length);expect(result.output).toEqual(entry.output);
 });
});
