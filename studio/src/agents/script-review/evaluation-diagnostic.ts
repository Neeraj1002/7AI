import type { LLMRequest, LLMResponse } from '../../llm';
import { NonTransientStageError } from '../../run-pipeline/retry-with-backoff';
import { callReservation, evaluationHash } from './evaluation-budget';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
export function diagnosticReservation(charged:number,stepCharged:number,bytes:number,maxTokens:number,pricing:{inputPerMillionUsd:number;outputPerMillionUsd:number}){
 const reserve=callReservation(charged,bytes,maxTokens,pricing);
 if(stepCharged+reserve>0.15+1e-10)throw new Error('Diagnostic step would exceed its $0.15 ceiling');
 return reserve;
}
export function oneDiagnosticCall(complete:(req:LLMRequest)=>Promise<LLMResponse>){let calls=0;return async(req:LLMRequest)=>{if(calls++>=1)throw new NonTransientStageError('Diagnostic reproduction permits one provider call; format retry suppressed');return complete(req);};}

export function round3Hash(){const h=createHash('sha256').update(evaluationHash());for(const p of ['src/agents/script-review/evaluation-diagnostic.ts','src/agents/script-review/evaluation-failure.ts','scripts/continue-script-review.ts'])h.update(p).update(readFileSync(p,'utf8').replace(/\r\n/g,'\n'));return h.digest('hex');}
