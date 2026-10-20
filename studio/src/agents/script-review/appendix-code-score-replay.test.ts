import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { buildEvidencePacket } from '../../content-evidence/packet';
import { reviewScript } from './index';
import type { LLMResponse } from '../../llm';
const evidence=JSON.parse(readFileSync('../docs/execution/sprint5/reports/task6-d2-acceptance-evidence.json','utf8'));
const fixture=evidence.fixtures.find((f:{caseId:string})=>f.caseId==='appendix-A-clean');
const criteria=['chapter-order','open-loop','factual-causality','brief-brand','hook-promise'];
it.each<number>(evidence.calls.map((c:{id:number})=>c.id))('replays saved Appendix A provider reply %s without a rhetoric or recap cap',async id=>{
 const saved=evidence.calls.find((c:{id:number})=>c.id===id), raw=JSON.parse(saved.evidence.text);
 const old=raw.scoreAudit;raw.scoreAudit={rubricSubscores:criteria.map(criterion=>({criterion,score:criterion==='brief-brand'?8.5:10,finding:criterion==='brief-brand'?old.rubricDeductions[0].finding:null})),findings:old.deductions.map((d:{rule:string;finding:string})=>({rule:d.rule,finding:d.finding}))};
 const llm:LLMResponse={text:JSON.stringify(raw),stopReason:'stop',provider:'anthropic',model:'claude-sonnet-5-5',usage:{inputTokens:100,outputTokens:100},costUsd:'0.001200',maxOutputTokens:2560};
 const r=await reviewScript({scriptText:fixture.scriptText,captions:'',nicheDescription:'Historical stories',videoKind:fixture.videoKind,targetSeconds:fixture.targetSeconds,chapterTitles:fixture.chapterTitles,evidence:buildEvidencePacket({briefText:fixture.briefText,factPolicy:fixture.factPolicy})},vi.fn().mockResolvedValue(llm));
 expect(r.output.score).toBe(10);expect(r.output.styleGuideViolations).toEqual([]);expect(r.output.factualConcerns).toEqual([]);
});
