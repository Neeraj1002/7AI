import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import originals from '../../content-evidence/fixtures/sr-pre-gate.json';
import { buildEvidencePacket } from '../../content-evidence/packet';
import { reviewScript, type ScriptReviewOutput } from './index';
import type { LLMResponse } from '../../llm';
type Fixture={caseId:string;briefText:string;scriptText:string;videoKind:'short'|'long';targetSeconds:number;chapterTitles?:string[];factPolicy:'brief-only'};
const file='../docs/execution/sprint5/reports/task6-control-audit-evidence.json';
const ledger=JSON.parse(readFileSync(file,'utf8')) as {complete:boolean;hash:string;historicalReservationsUsd:number;reservationsReleased:boolean;stepChargedUsd:number;stepCeilingUsd:number;fixtures:Fixture[];calls:{id:number;status:string;http:{statusCode:number}[];response:LLMResponse}[];reviews:{caseId:string;repeat:number;status:string;callIds:number[];output:ScriptReviewOutput}[]};
it('retains the six original controls, all eighteen outcomes and historical reservations',()=>{
 expect(ledger.complete).toBe(true);expect(ledger.reviews).toHaveLength(18);expect(ledger.calls).toHaveLength(18);expect(ledger.historicalReservationsUsd).toBe(.219391);expect(ledger.reservationsReleased).toBe(false);expect(ledger.stepChargedUsd).toBe(.529818);expect(ledger.stepCeilingUsd).toBe(1.5);
 for(const c of ledger.fixtures)expect(c).toEqual(originals.evaluationCases.find(f=>f.caseId===c.caseId));
 for(const c of ledger.calls){expect(c.status).toBe('metered');expect(c.http.map(h=>h.statusCode)).toEqual([200]);expect(c.response.model).toBe('claude-sonnet-5-5');expect(c.response.rawStopReason).toBe('end_turn');}
});
it.each(ledger.reviews)('replays the original control $caseId / $repeat without spending',async row=>{
 const c=ledger.fixtures.find(c=>c.caseId===row.caseId)!;const complete=vi.fn();for(const id of row.callIds)complete.mockResolvedValueOnce(ledger.calls.find(c=>c.id===id)!.response);
 const r=await reviewScript({scriptText:c.scriptText,captions:'',nicheDescription:'Historical stories',videoKind:c.videoKind,targetSeconds:c.targetSeconds,chapterTitles:c.chapterTitles,evidence:buildEvidencePacket({briefText:c.briefText,factPolicy:c.factPolicy})},complete);
 expect(r.output).toEqual(row.output);expect(complete).toHaveBeenCalledTimes(row.callIds.length);
});
it('evidence has no credential material, header fields/IDs, account/contact data or network addresses',()=>{
 for(const f of [file,'../docs/execution/sprint5/reports/task6-sonnet-evidence.json']){
  const s=readFileSync(f,'utf8');expect(s).not.toMatch(/"(?:headers|responseHeaders|requestHeaders|authorization|apiKey|api_key|requestId|email|userId|channelId|accountId|ipAddress|password|accessToken|refreshToken)"\s*:/i);
  expect(s).not.toMatch(/sk-ant-[a-zA-Z0-9_-]{15,}|Bearer\s+[a-zA-Z0-9_-]{15,}|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|\b(?:\d{1,3}\.){3}\d{1,3}\b/);
 }
});
