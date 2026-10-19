/** Separately owner-approved $1.50 control replay. Originals only; no DB/production writes. */
import { readFileSync, writeFileSync, renameSync, existsSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
import { requireOfflineProof } from '../src/agents/script-review/evaluation-budget';
import { controlReservation, controlsHash, CONTROL_STEP_CEILING_USD, PRIOR_CONSERVATIVE_USD, PRIOR_RESERVATIONS_USD } from '../src/agents/script-review/evaluation-controls';
import { reviewFailureEvidence } from '../src/agents/script-review/evaluation-failure';
import type { LLMRequest, LLMResponse } from '../src/llm';
import type { ScriptReviewOutput } from '../src/agents/script-review';
type Http={statusCode:number;errorType:string|null};
type Call={id:number;caseId:string;repeat:number;model:string;maxTokens:number;reservedUsd:number;status:'reserved'|'metered'|'unmetered';http:Http[];startedAt:string;endedAt?:string;response?:LLMResponse;failure?:ReturnType<typeof reviewFailureEvidence>;stopReason?:string;rawStopReason?:string;inputTokens?:number;outputTokens?:number;reasoningTokens?:number|null;replyLengthChars?:number;requestHash:string};
type Row={caseId:string;repeat:number;status:'running'|'complete'|'failed'|'budget-stopped';callIds:number[];output?:ScriptReviewOutput};
type Fixture={caseId:string;briefText:string;scriptText:string;videoKind:'short'|'long';targetSeconds:number;chapterTitles?:string[];factPolicy:'brief-only'|'brief-plus-common'};
type Ledger={version:number;hash:string;priorEvidenceHash:string;baselineConservativeUsd:number;historicalReservationsUsd:number;reservationsReleased:false;stepCeilingUsd:number;model:string;fixtures:Fixture[];calls:Call[];reviews:Row[];stepChargedUsd:number;allCampaignConservativeUsd:number;complete:boolean;stopped?:string};
async function main(){
 if(!process.argv.includes('--run-approved-controls'))throw Error('Explicit approved-control mode required');
 const hash=controlsHash(),proofIndex=process.argv.indexOf('--offline-proof');if(proofIndex<0)throw Error('Offline proof required');requireOfflineProof(hash,JSON.parse(readFileSync(process.argv[proofIndex+1],'utf8')));
 const priorBytes=readFileSync('../docs/execution/sprint5/reports/task6-sonnet-evidence.json'),prior=JSON.parse(priorBytes.toString());
 if(Number(prior.observations.conservativeCampaignUsd)!==PRIOR_CONSERVATIVE_USD||Number(prior.observations.priorUnresolvedReservationsUsd)!==PRIOR_RESERVATIONS_USD)throw Error('Historical baseline/reservations changed');
 const fixtureBytes=readFileSync('src/content-evidence/fixtures/sr-pre-gate.json');
 const ids=['clean-short','lego-facts-control','lego-rhetoric-control','appendix-A-clean','d4-imagined-clean','d4-sensory-speech-clean'];
 const originals=JSON.parse(fixtureBytes.toString()).evaluationCases as Fixture[],fixtures=ids.map(id=>originals.find(c=>c.caseId===id)!);if(fixtures.some(c=>!c))throw Error('Missing original control');
 const file='../docs/execution/sprint5/reports/task6-control-audit-evidence.json',lock='data/task6-evaluation/round3-paid.lock';const fd=openSync(lock,'wx'),nativeFetch=globalThis.fetch;let activeHttp:Http[]=[];
 try{
 const priorEvidenceHash=createHash('sha256').update(priorBytes).digest('hex');
 const ledger:Ledger=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{version:1,hash,priorEvidenceHash,baselineConservativeUsd:PRIOR_CONSERVATIVE_USD,historicalReservationsUsd:PRIOR_RESERVATIONS_USD,reservationsReleased:false,stepCeilingUsd:CONTROL_STEP_CEILING_USD,model:'claude-sonnet-5-5',fixtures,calls:[],reviews:[],stepChargedUsd:0,allCampaignConservativeUsd:PRIOR_CONSERVATIVE_USD,complete:false};
 if(ledger.hash!==hash||ledger.priorEvidenceHash!==priorEvidenceHash||JSON.stringify(ledger.fixtures)!==JSON.stringify(fixtures))throw Error('Source, historical ledger or original fixtures changed; no paid restart');
 if(ledger.complete||ledger.stopped||ledger.reviews.some(r=>r.status!=='complete'))throw Error('Run is closed or has an unresolved attempt; no additional requests');
 process.env.DATABASE_URL='postgresql://fixtures:unused@127.0.0.1:1/task6_fixtures';process.env.NODE_ENV='test';const keyIndex=process.argv.indexOf('--key-env-file');if(keyIndex<0)throw Error('Existing approved key file required');const key=dotenv.parse(readFileSync(process.argv[keyIndex+1])).ANTHROPIC_API_KEY;if(!key)throw Error('Existing approved key unavailable');process.env.ANTHROPIC_API_KEY=key;
 const charge=(c:Call)=>c.status==='metered'?Number(c.response!.costUsd):c.reservedUsd;
 const save=()=>{ledger.stepChargedUsd=Number(ledger.calls.reduce((n,c)=>n+charge(c),0).toFixed(6));ledger.allCampaignConservativeUsd=Number((PRIOR_CONSERVATIVE_USD+ledger.stepChargedUsd).toFixed(6));const data=JSON.stringify(ledger,null,2)+'\n';if(data.includes(key)||/"(?:headers|responseHeaders|authorization|apiKey|requestId|email|userId|channelId)"\s*:/i.test(data))throw Error('Evidence privacy guard failed');writeFileSync(file+'.tmp',data);renameSync(file+'.tmp',file);};
 globalThis.fetch=async(input,init)=>{const response=await nativeFetch(input,init),url=typeof input==='string'?input:input instanceof URL?input.href:input.url;if(url.startsWith('https://api.anthropic.com/')&&url.includes('/messages')){let errorType:string|null=null;if(!response.ok)try{const body=await response.clone().json() as {error?:{type?:string}};if(['overloaded_error','rate_limit_error','invalid_request_error','authentication_error','permission_error','api_error'].includes(body.error?.type??''))errorType=body.error!.type!;}catch{/* Keep status, never raw provider bodies. */}activeHttp.push({statusCode:response.status,errorType});}return response;};
 const {reviewScript}=await import('../src/agents/script-review'),{buildEvidencePacket}=await import('../src/content-evidence/packet'),{callLLM,resolvePurpose,resolvePricing}=await import('../src/llm');if(resolvePurpose('script-review').model!==ledger.model)throw Error('Unexpected production reviewer model');
 save();
 for(const c of fixtures)for(let repeat=1;repeat<=3;repeat++){
  if(ledger.stopped)break;if(ledger.reviews.some(r=>r.caseId===c.caseId&&r.repeat===repeat))continue;
  const row:Row={caseId:c.caseId,repeat,status:'running',callIds:[]};ledger.reviews.push(row);save();let capped=false;
  const complete=async(req:LLMRequest):Promise<LLMResponse>=>{
   const body=JSON.stringify({system:req.system,messages:req.messages});let reservedUsd:number;
   try{reservedUsd=controlReservation(ledger.stepChargedUsd,Buffer.byteLength(body)+16384,resolvePurpose('script-review').maxOutputTokens,resolvePricing(ledger.model));}catch(error){capped=true;throw error;}
   const call:Call={id:ledger.calls.length+1,caseId:c.caseId,repeat,model:ledger.model,maxTokens:resolvePurpose('script-review').maxOutputTokens,reservedUsd,status:'reserved',http:[],startedAt:new Date().toISOString(),requestHash:createHash('sha256').update(body).digest('hex')};ledger.calls.push(call);row.callIds.push(call.id);save();activeHttp=call.http;
   try{const response=await callLLM(req);call.response=response;call.stopReason=response.stopReason;call.rawStopReason=response.rawStopReason;call.inputTokens=response.usage.inputTokens;call.outputTokens=response.usage.outputTokens;call.reasoningTokens=response.usage.reasoningTokens??null;call.replyLengthChars=[...response.text].length;call.status=response.usage.inputTokens>0&&response.usage.outputTokens>0?'metered':'unmetered';call.endedAt=new Date().toISOString();save();return response;
   }catch(error){call.failure=reviewFailureEvidence(error,ledger.model,resolvePurpose('script-review').maxOutputTokens);call.status='unmetered';call.endedAt=new Date().toISOString();save();throw error;}
  };
  try{const result=await reviewScript({scriptText:c.scriptText,captions:'',nicheDescription:'Historical stories',videoKind:c.videoKind,targetSeconds:c.targetSeconds,chapterTitles:c.chapterTitles,evidence:buildEvidencePacket({briefText:c.briefText,factPolicy:c.factPolicy})},complete);row.output=result.output;row.status='complete';if(row.callIds.some(id=>ledger.calls.find(c=>c.id===id)!.status!=='metered'))ledger.stopped='unmetered response retained at full reservation';
  }catch{row.status=capped?'budget-stopped':'failed';ledger.stopped=capped?'next reservation would exceed approved step ceiling':'provider or review failure captured; stop';}
  save();console.log(c.caseId+' / '+repeat+' '+(row.output?.score??row.status)+' stepUSD='+ledger.stepChargedUsd.toFixed(6));
 }
 ledger.complete=ledger.reviews.filter(r=>r.status==='complete').length===18;save();console.log('complete='+ledger.complete+'; stepUSD='+ledger.stepChargedUsd.toFixed(6)+'; total conservativeUSD='+ledger.allCampaignConservativeUsd.toFixed(6));
 }finally{globalThis.fetch=nativeFetch;closeSync(fd);unlinkSync(lock);}
}
main().catch(()=>{console.error('Control run stopped; inspect sanitized ledger or offline inputs.');process.exitCode=1;});
