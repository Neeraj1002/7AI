import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
export const COMPARISON_MODELS = ['claude-haiku-4-5', 'claude-sonnet-5-5'] as const;
export type ComparisonModel = typeof COMPARISON_MODELS[number];
export const EVALUATION_INPUTS = ['src/agents/script-review/index.ts','src/agents/script-review/brief-checks.ts','src/agents/script-review/numbers.ts','src/agents/script-review/rules.ts','src/prompts/system-prompts.ts','src/agents/script-review/evaluation-budget.ts','src/llm/index.ts','src/llm/client.ts','src/llm/types.ts','src/llm/registry.ts','src/content-evidence/fixtures/sr-pre-gate.json','scripts/compare-script-review.ts'];
export function evaluationHash():string { const h=createHash('sha256'); for(const p of EVALUATION_INPUTS)h.update(p).update(readFileSync(p,'utf8').replace(/\r\n/g,'\n'));return h.digest('hex'); }
export function requireOfflineProof(hash:string,proof:{hash?:string;checks?:Record<string,boolean>}):void {
  if(proof.hash!==hash||!['tests','typecheck','lint','build'].every(k=>proof.checks?.[k]===true)) throw new Error('Offline checks missing or source changed; no paid call permitted');
}
export function callReservation(charged:number,bytes:number,maxTokens:number,pricing:{inputPerMillionUsd:number;outputPerMillionUsd:number}):number {
  const reserve=bytes/1e6*pricing.inputPerMillionUsd+maxTokens/1e6*pricing.outputPerMillionUsd;
  if(!Number.isFinite(reserve)||reserve<0||charged+reserve>3)throw new Error('STOP: next call would exceed the total $3 campaign ceiling');return reserve;
}
