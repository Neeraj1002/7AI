/** Founder-approved five-control run. Budget enforced before EVERY native request, including registry retries. */
import { readFileSync,writeFileSync,renameSync,existsSync,openSync,closeSync,unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
import { requireOfflineProof } from '../src/agents/script-review/evaluation-budget';
import { founderHash,founderReservation,nativeReviewEvidence,FOUNDER_BASELINE_USD,FOUNDER_STEP_CEILING_USD } from '../src/agents/script-review/evaluation-founder';
import { reviewFailureEvidence } from '../src/agents/script-review/evaluation-failure';
import type { ScriptReviewOutput } from '../src/agents/script-review';
import type { LLMResponse } from '../src/llm';
type NativeCall={id:number;caseId:string;repeat:number;status:'reserved'|'metered'|'unmetered';reservedUsd:number;costUsd?:number;requestedModel:string;outputLimit:number;reasoningMode:string|null;requestHash:string;startedAt:string;endedAt?:string;httpStatus?:number;errorType?:string|null;evidence?:ReturnType<typeof nativeReviewEvidence>};
type Review={caseId:string;repeat:number;status:'running'|'complete'|'failed'|'budget-stopped';callIds:number[];output?:ScriptReviewOutput;responses?:LLMResponse[];failure?:ReturnType<typeof reviewFailureEvidence>};
type Fixture={caseId:string;briefText:string;scriptText:string;videoKind:'short'|'long';targetSeconds:number;chapterTitles?:string[];factPolicy:'brief-only'|'brief-plus-common'};
type Ledger={version:number;hash:string;priorArtifactHash:string;baselineConservativeUsd:number;historicalReservationsUsd:number;reservationsReleased:false;stepCeilingUsd:number;model:string;registry:{maxOutputTokens:number;reasoning:unknown};fixtures:Fixture[];calls:NativeCall[];reviews:Review[];stepChargedUsd:number;conservativeTotalUsd:number;complete:boolean;stopped?:string};
async function main(){
 if(!process.argv.includes('--run-founder-approved'))throw Error('Explicit founder approval mode required');
 const proofIndex=process.argv.indexOf('--offline-proof');if(proofIndex<0)throw Error('Offline proof required');const hash=founderHash();requireOfflineProof(hash,JSON.parse(readFileSync(process.argv[proofIndex+1],'utf8')));
 const priorBytes=readFileSync('../docs/execution/sprint5/reports/task6-control-audit-evidence.json'),prior=JSON.parse(priorBytes.toString());if(prior.allCampaignConservativeUsd!==FOUNDER_BASELINE_USD||prior.historicalReservationsUsd!==.219391)throw Error('Historical balance changed');
 const ids=['lego-facts-control','lego-rhetoric-control','appendix-A-clean','d4-imagined-clean','d4-sensory-speech-clean'];
 const all=JSON.parse(readFileSync('src/content-evidence/fixtures/sr-pre-gate.json','utf8')).evaluationCases as Fixture[],fixtures=ids.map(id=>all.find(c=>c.caseId===id)!);if(fixtures.some(c=>!c))throw Error('Missing approved control');
 const file='../docs/execution/sprint5/reports/task6-founder-decisions-evidence.json';const resume=process.argv.includes('--resume-interrupted');if(existsSync(file)&&!resume)throw Error('Approved run already started/closed; do not restart');if(!existsSync(file)&&resume)throw Error('No interrupted run to resume');
 const keyIndex=process.argv.indexOf('--key-env-file');if(keyIndex<0)throw Error('Existing approved key file required');const key=dotenv.parse(readFileSync(process.argv[keyIndex+1])).ANTHROPIC_API_KEY;if(!key)throw Error('Approved key unavailable');process.env.ANTHROPIC_API_KEY=key;process.env.NODE_ENV='test';process.env.DATABASE_URL='postgresql://fixtures:unused@127.0.0.1:1/task6_fixtures';
 const {reviewScript}=await import('../src/agents/script-review'),{buildEvidencePacket}=await import('../src/content-evidence/packet'),{callLLM,resolvePurpose,resolvePricing}=await import('../src/llm'),{llmUsageRows}=await import('../src/run-pipeline/stage-failure');const entry=resolvePurpose('script-review');if(entry.model!=='claude-sonnet-5-5')throw Error('Unexpected purpose model');
 const lock='data/task6-evaluation/round3-paid.lock',fd=openSync(lock,'wx'),nativeFetch=globalThis.fetch;
 const ledger:Ledger=resume?JSON.parse(readFileSync(file,'utf8')) as Ledger:{version:1,hash,priorArtifactHash:createHash('sha256').update(priorBytes).digest('hex'),baselineConservativeUsd:FOUNDER_BASELINE_USD,historicalReservationsUsd:.219391,reservationsReleased:false,stepCeilingUsd:FOUNDER_STEP_CEILING_USD,model:entry.model,registry:{maxOutputTokens:entry.maxOutputTokens,reasoning:entry.reasoning},fixtures,calls:[],reviews:[],stepChargedUsd:0,conservativeTotalUsd:FOUNDER_BASELINE_USD,complete:false};
 if(resume){if(ledger.complete||ledger.stopped||ledger.calls.length!==3||ledger.reviews.length!==3||ledger.reviews.some(r=>r.status!=='complete')||ledger.calls.some(c=>c.status!=='metered')||ledger.stepChargedUsd!==.081094||ledger.model!==entry.model||ledger.stepCeilingUsd!==.60||ledger.priorArtifactHash!==createHash('sha256').update(priorBytes).digest('hex')||JSON.stringify(ledger.fixtures)!==JSON.stringify(fixtures))throw Error('Unexpected interrupted ledger; no further paid request');(ledger as Ledger&{preResumeHash?:string}).preResumeHash=ledger.hash;ledger.hash=hash;}
 let active:Review|undefined,capped=false;
 const save=()=>{ledger.stepChargedUsd=Number(ledger.calls.reduce((s,c)=>s+(c.status==='metered'?c.costUsd!:c.reservedUsd),0).toFixed(6));ledger.conservativeTotalUsd=Number((FOUNDER_BASELINE_USD+ledger.stepChargedUsd).toFixed(6));const data=JSON.stringify(ledger,null,2)+'\n';if(data.includes(key)||/"(?:headers|responseHeaders|authorization|apiKey|requestId|email|userId|channelId)"\s*:/i.test(data))throw Error('Privacy guard failed');writeFileSync(file+'.tmp',data);for(let attempt=0;;attempt++)try{renameSync(file+'.tmp',file);break;}catch(error){const code=(error as NodeJS.ErrnoException).code;if(!['EPERM','EACCES','EBUSY'].includes(code??'')||attempt>=20)throw error;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,50);}};
 try{
 globalThis.fetch=async(input,init)=>{
  const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  if(!url.startsWith('https://api.anthropic.com/')||!url.includes('/messages'))return nativeFetch(input,init);
  if(!active||ledger.stopped)throw Error('No authorised active request');
  if(typeof init?.body!=='string')throw Error('Cannot reserve an opaque request body');const body=JSON.parse(init.body) as {model?:string;max_tokens?:number;thinking?:{type?:string}};
  if(body.model!==ledger.model||typeof body.max_tokens!=='number')throw Error('Unexpected native model/output limit');
  let reserve:number;try{reserve=founderReservation(ledger.stepChargedUsd,Buffer.byteLength(init.body)+16384,body.max_tokens,resolvePricing(ledger.model));}catch(error){capped=true;ledger.stopped='next native request reservation would exceed $0.60';save();throw error;}
  const call:NativeCall={id:ledger.calls.length+1,caseId:active.caseId,repeat:active.repeat,status:'reserved',reservedUsd:reserve,requestedModel:body.model,outputLimit:body.max_tokens,reasoningMode:['disabled','adaptive','enabled','between_tools'].includes(body.thinking?.type??'')?body.thinking!.type!:null,requestHash:createHash('sha256').update(init.body).digest('hex'),startedAt:new Date().toISOString()};ledger.calls.push(call);active.callIds.push(call.id);save();
  try{const response=await nativeFetch(input,init);call.httpStatus=response.status;
   if(response.ok){call.evidence=nativeReviewEvidence(await response.clone().text());const e=call.evidence;
    if(e.inputTokens!==null&&e.outputTokens!==null&&e.inputTokens>=0&&e.outputTokens>=0){const pricing=resolvePricing(ledger.model);call.costUsd=Number(((e.inputTokens*pricing.inputPerMillionUsd+e.outputTokens*pricing.outputPerMillionUsd)/1e6).toFixed(6));call.status='metered';}else{call.status='unmetered';ledger.stopped='native usage unavailable; reservation retained';}
   }else{call.status='unmetered';ledger.stopped='provider failure captured; reservation retained';let type:string|null=null;try{const parsed=await response.clone().json() as {error?:{type?:string}};if(['overloaded_error','rate_limit_error','invalid_request_error','authentication_error','permission_error','api_error'].includes(parsed.error?.type??''))type=parsed.error!.type!;}catch{/* no raw error body retained */}call.errorType=type;}
   call.endedAt=new Date().toISOString();save();return response;
  }catch(error){call.status='unmetered';call.endedAt=new Date().toISOString();ledger.stopped='transport/usage failure; reservation retained';save();throw error;}
 };
 save();
 // All five controls get a first attempt before any repeat; three repetitions only while affordable.
 outer:for(let repeat=1;repeat<=3;repeat++)for(const c of fixtures){
  if(ledger.reviews.some(r=>r.caseId===c.caseId&&r.repeat===repeat&&r.status==='complete'))continue;
  if(ledger.stopped)break outer;active={caseId:c.caseId,repeat,status:'running',callIds:[]};ledger.reviews.push(active);save();
  try{const result=await reviewScript({scriptText:c.scriptText,captions:'',nicheDescription:'Historical stories',videoKind:c.videoKind,targetSeconds:c.targetSeconds,chapterTitles:c.chapterTitles,evidence:buildEvidencePacket({briefText:c.briefText,factPolicy:c.factPolicy})},callLLM);active.output=result.output;active.responses=result.calls??[result.llm];
   const usage=active.responses.flatMap(llmUsageRows);if(usage.length!==active.callIds.length)throw Error('Native usage count mismatch');for(let i=0;i<usage.length;i++){const call=ledger.calls.find(c=>c.id===active!.callIds[i])!;if(call.status==='metered')call.costUsd=Math.max(call.costUsd!,Number(usage[i].costUsd));}active.status='complete';
  }catch(error){active.status=capped?'budget-stopped':'failed';active.failure=reviewFailureEvidence(error,ledger.model,entry.maxOutputTokens);if(!ledger.stopped)ledger.stopped='review/provider failure captured';}
  save();console.log(c.caseId+' / '+repeat+' score='+(active.output?.score??active.status)+' stepUSD='+ledger.stepChargedUsd.toFixed(6));
 }
 ledger.complete=ledger.reviews.filter(r=>r.status==='complete').length===15;save();console.log('complete='+ledger.complete+'; stepUSD='+ledger.stepChargedUsd.toFixed(6)+'; conservativeUSD='+ledger.conservativeTotalUsd.toFixed(6));
 }finally{globalThis.fetch=nativeFetch;closeSync(fd);unlinkSync(lock);}
}
main().catch(()=>{console.error('Approved run stopped; inspect sanitized evidence/offline inputs.');process.exitCode=1;});
