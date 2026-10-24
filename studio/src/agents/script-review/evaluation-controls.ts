import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { evaluationHash } from './evaluation-budget';
export const CONTROL_STEP_CEILING_USD = 1.50;
export const PRIOR_CONSERVATIVE_USD = 2.910662;
export const PRIOR_RESERVATIONS_USD = .219391;
export function controlReservation(charged: number, bytes: number, maxTokens: number, pricing: {inputPerMillionUsd:number;outputPerMillionUsd:number}): number {
 if (![charged,bytes,maxTokens,pricing.inputPerMillionUsd,pricing.outputPerMillionUsd].every(n=>Number.isFinite(n)&&n>=0)) throw Error('Invalid budget input');
 const reserve=bytes/1e6*pricing.inputPerMillionUsd+maxTokens/1e6*pricing.outputPerMillionUsd;
 if(charged+reserve>CONTROL_STEP_CEILING_USD+1e-10)throw Error('STOP: next reservation would exceed approved additional $1.50 ceiling');
 return reserve;
}
export function controlsHash(){const h=createHash('sha256').update(evaluationHash());for(const p of ['src/agents/script-review/grounded-findings.ts','src/agents/script-review/evaluation-controls.ts','src/agents/script-review/evaluation-failure.ts','scripts/recheck-script-review-controls.ts'])h.update(p).update(readFileSync(p,'utf8').replace(/\r\n/g,'\n'));return h.digest('hex');}
