import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { evaluationHash } from './evaluation-budget';
export const FOUNDER_STEP_CEILING_USD=.60;
export const FOUNDER_BASELINE_USD=3.440480;
export function founderReservation(charged:number,bytes:number,outputLimit:number,pricing:{inputPerMillionUsd:number;outputPerMillionUsd:number}){
 if(![charged,bytes,outputLimit,pricing.inputPerMillionUsd,pricing.outputPerMillionUsd].every(n=>Number.isFinite(n)&&n>=0))throw Error('Invalid budget input');
 const reserve=(bytes*pricing.inputPerMillionUsd+outputLimit*pricing.outputPerMillionUsd)/1e6;
 if(charged+reserve>FOUNDER_STEP_CEILING_USD+1e-10)throw Error('STOP: native request would exceed the approved $0.60 ceiling');return reserve;
}
/** Strip provider transport to usage/stop/model/text only; never headers, IDs, errors or thinking text. */
export function nativeReviewEvidence(text:string){
 let model:string|null=null,stopReason:string|null=null,inputTokens:number|null=null,outputTokens:number|null=null,reply='';
 const usage=(u:unknown)=>{const v=u as {input_tokens?:unknown;output_tokens?:unknown}|undefined;if(typeof v?.input_tokens==='number')inputTokens=v.input_tokens;if(typeof v?.output_tokens==='number')outputTokens=v.output_tokens;};
 const read=(v:Record<string,unknown>)=>{const m=(v.message??v) as Record<string,unknown>;if(typeof m.model==='string'&&/^claude-[a-z0-9.-]+$/.test(m.model))model=m.model;usage(m.usage);if(Array.isArray(m.content))for(const c of m.content as {type?:string;text?:string}[])if(c.type==='text'&&typeof c.text==='string')reply+=c.text;const delta=v.delta as {type?:string;text?:string;stop_reason?:unknown}|undefined;if(delta?.type==='text_delta'&&typeof delta.text==='string')reply+=delta.text;const stop=delta?.stop_reason??m.stop_reason;if(typeof stop==='string'&&['end_turn','max_tokens','stop_sequence','tool_use','refusal'].includes(stop))stopReason=stop;usage(v.usage);};
 if(text.trimStart().startsWith('{'))read(JSON.parse(text));else for(const line of text.split('\n'))if(line.startsWith('data: '))try{read(JSON.parse(line.slice(6)));}catch{/* Non-JSON terminators supply no usage. */}
 return {model,stopReason,inputTokens,outputTokens,text:reply,replyLengthChars:[...reply].length};
}
export function founderHash(){const h=createHash('sha256').update(evaluationHash());for(const p of ['src/agents/script-review/grounded-findings.ts','src/agents/script-review/score-audit.ts','src/agents/script-review/scene-props.ts','src/agents/script-review/evaluation-founder.ts','src/agents/script-review/evaluation-failure.ts','src/llm/models.ts','scripts/recheck-founder-controls.ts'])h.update(p).update(readFileSync(p,'utf8').replace(/\r\n/g,'\n'));return h.digest('hex');}
