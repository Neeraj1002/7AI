/**
 * Post-merge live detection check: runs Lego draft 1 and Lego draft 2 once each against the live Script Review
 * (Sonnet 5.5) and applies the pass bar (SR-9 flagged, the confirmation call fired and confirmed it, score capped at 6).
 *
 * Usage, from studio/:
 *   npx tsx scripts/postmerge-detection-check.ts
 *       prints the cost estimate and exits; no key is read and nothing is sent
 *   npx tsx scripts/postmerge-detection-check.ts --live --offline-proof <proof.json> --key-env-file <env file>
 *
 * It spends money only with the explicit --live flag. Every native request is reserved against COST_CAP_USD before it
 * is sent and the run stops when the next request would pass the cap. The API key is never printed or written. The
 * evidence file is created once, so a second --live run refuses to start. The production registry is restored on exit.
 */
import { createHash } from 'node:crypto';
import { readFileSync,writeFileSync,renameSync,existsSync,openSync,closeSync,unlinkSync } from 'node:fs';
import dotenv from 'dotenv';
import { requireOfflineProof } from '../src/agents/script-review/evaluation-budget';
import { founderHash,nativeReviewEvidence,FOUNDER_BASELINE_USD } from '../src/agents/script-review/evaluation-founder';
import { reviewFailureEvidence } from '../src/agents/script-review/evaluation-failure';
import type { ScriptReviewOutput } from '../src/agents/script-review';
import type { HardCapCheck } from '../src/agents/script-review/hard-cap-confirmation';
import type { LLMResponse } from '../src/llm';
/** Step cost cap in USD, counted from PRIOR_STEP_SPEND_USD, the spend already recorded for this step. */
const COST_CAP_USD=.90;
const PRIOR_STEP_SPEND_USD=.732122;
const OUTPUT_LIMIT=2560,INPUT_MARGIN_TOKENS=1024,EXPECTED_PRIOR_STEP=PRIOR_STEP_SPEND_USD,STEP_CEILING_USD=COST_CAP_USD,CONFIRM_OUTPUT_LIMIT=400,MAX_CONFIRM_CALLS=4;
let key='';
const report='../docs/execution/sprint5/reports/task6-post-merge-live-detection-evidence.json';
type NativeCall={id:number;caseId:string;repeat:number;status:'reserved'|'metered'|'unmetered';reservedUsd:number;costUsd?:number;estimatedInputTokens:number;inputMarginTokens:number;requestedModel:string;outputLimit:number;reasoningMode:string|null;temperature:number|null;requestHash:string;startedAt:string;endedAt?:string;httpStatus?:number;errorType?:string|null;evidence?:ReturnType<typeof nativeReviewEvidence>};
type Review={caseId:string;repeat:number;status:'running'|'complete'|'failed'|'budget-stopped';callIds:number[];output?:ScriptReviewOutput;hardCapChecks?:HardCapCheck[];detection?:{sr9Flagged:boolean;confirmationFired:boolean;confirmedUnsupported:boolean;score:number;pass:boolean};responses?:LLMResponse[];failure?:ReturnType<typeof reviewFailureEvidence>};
type Fixture={caseId:string;briefText:string;scriptText:string;videoKind:'short'|'long';targetSeconds:number;chapterTitles?:string[];factPolicy:'brief-only'|'brief-plus-common'};
type Ledger={version:number;hash:string;priorArtifactHash:string;priorStepChargedUsd:number;baselineConservativeUsd:number;historicalReservationsUsd:number;reservationsReleased:false;stepCeilingUsd:number;model:string;productionOutputLimit:number;evaluationOutputLimit:number;estimatedInputMarginTokens:number;fixtures:Fixture[];calls:NativeCall[];reviews:Review[];additionalChargedUsd:number;stepChargedUsd:number;conservativeTotalUsd:number;complete:boolean;passBar?:{bothComplete:boolean;met:boolean};stopped?:string};
async function main(){
 const live=process.argv.includes('--live');
 let hash='',priorBytes=Buffer.alloc(0);
 const all=JSON.parse(readFileSync('src/content-evidence/fixtures/sr-pre-gate.json','utf8')).evaluationCases as Fixture[];
 const ids=['lego-draft-1-excerpts','lego-draft-2-excerpts'],fixtures=ids.map(id=>all.find(c=>c.caseId===id)!);if(fixtures.some(c=>!c))throw Error('Approved control missing');
 if(live){
  if(existsSync(report))throw Error('Post-merge detection check already started; never reset the ledger');
  const proofIndex=process.argv.indexOf('--offline-proof');if(proofIndex<0)throw Error('Offline proof required');
  hash=createHash('sha256').update(founderHash()).update(readFileSync('src/agents/script-review/hard-cap-confirmation.ts','utf8').replace(/\r\n/g,'\n')).update(readFileSync('scripts/postmerge-detection-check.ts','utf8').replace(/\r\n/g,'\n')).digest('hex');
  requireOfflineProof(hash,JSON.parse(readFileSync(process.argv[proofIndex+1],'utf8')));
  priorBytes=readFileSync('../docs/execution/sprint5/reports/task6-hard-cap-confirmation-evidence.json');
  const prior=JSON.parse(priorBytes.toString()) as {stepChargedUsd:number;historicalReservationsUsd:number;complete:boolean};
  if(!prior.complete||prior.stepChargedUsd!==EXPECTED_PRIOR_STEP||prior.historicalReservationsUsd!==.219391)throw Error('Prior capped step changed');
  const keyIndex=process.argv.indexOf('--key-env-file');if(keyIndex<0)throw Error('Existing approved key path required');key=dotenv.parse(readFileSync(process.argv[keyIndex+1])).ANTHROPIC_API_KEY??'';if(!key)throw Error('Approved key unavailable');
  process.env.ANTHROPIC_API_KEY=key;
 }
 process.env.NODE_ENV='test';process.env.DATABASE_URL='postgresql://fixtures:unused@127.0.0.1:1/task6_fixtures';
 const {CONFIRM_SYSTEM_PROMPT}=await import('../src/agents/script-review/hard-cap-confirmation'),{reviewScript}=await import('../src/agents/script-review'),{buildEvidencePacket}=await import('../src/content-evidence/packet'),{callLLM,resolvePurpose,resolvePricing}=await import('../src/llm'),{llmUsageRows}=await import('../src/run-pipeline/stage-failure');
 {
  // Cost estimate, printed before anything is spent. Deliberately high: three characters per token, every output at its cap.
  const {LONG_FORM_SYSTEM_PROMPT}=await import('../src/agents/script-review'),{reviewRules}=await import('../src/agents/script-review/rules'),price=resolvePricing('claude-sonnet-5-5');
  const usd=(chars:number,outTokens:number)=>(Math.ceil(chars/3)*price.inputPerMillionUsd+outTokens*price.outputPerMillionUsd)/1e6;
  const system=LONG_FORM_SYSTEM_PROMPT.length+reviewRules(true).length+1500;
  const rows=fixtures.map(c=>({id:c.caseId,review:usd(system+c.briefText.length+c.scriptText.length,OUTPUT_LIMIT),confirm:usd(CONFIRM_SYSTEM_PROMPT.length+c.briefText.length+600,CONFIRM_OUTPUT_LIMIT)}));
  const total=rows.reduce((sum,r)=>sum+r.review+MAX_CONFIRM_CALLS*r.confirm,0);
  console.log('Cost estimate (upper bound, Sonnet 5.5, '+rows.length+' drafts, one review each, up to '+MAX_CONFIRM_CALLS+' confirmations per review):');
  for(const r of rows)console.log('  '+r.id+': review <= $'+r.review.toFixed(4)+', each confirmation <= $'+r.confirm.toFixed(4));
  console.log('  total <= $'+total.toFixed(4)+'; cap $'+COST_CAP_USD.toFixed(2)+' counted from prior $'+PRIOR_STEP_SPEND_USD.toFixed(6)+' leaves $'+(COST_CAP_USD-PRIOR_STEP_SPEND_USD).toFixed(6)+'. The previous live run of these two drafts cost $0.064840.');
  if(!live){console.log('Not live: no key was read and nothing was sent. Re-run with --live (plus --offline-proof and --key-env-file) to spend.');return;}
 }
 const entry=resolvePurpose('script-review');if(entry.model!=='claude-sonnet-5-5'||entry.maxOutputTokens!==16000||entry.reasoning!=='off')throw Error('Unexpected production purpose');
 const productionLimit=entry.maxOutputTokens,lock='data/task6-evaluation/postmerge-paid.lock',fd=openSync(lock,'wx'),nativeFetch=globalThis.fetch;
 const ledger:Ledger={version:1,hash,priorArtifactHash:createHash('sha256').update(priorBytes).digest('hex'),priorStepChargedUsd:EXPECTED_PRIOR_STEP,baselineConservativeUsd:FOUNDER_BASELINE_USD,historicalReservationsUsd:.219391,reservationsReleased:false,stepCeilingUsd:STEP_CEILING_USD,model:entry.model,productionOutputLimit:productionLimit,evaluationOutputLimit:OUTPUT_LIMIT,estimatedInputMarginTokens:INPUT_MARGIN_TOKENS,fixtures,calls:[],reviews:[],additionalChargedUsd:0,stepChargedUsd:EXPECTED_PRIOR_STEP,conservativeTotalUsd:FOUNDER_BASELINE_USD+EXPECTED_PRIOR_STEP,complete:false};
 let active:Review|undefined,capped=false;
 const save=()=>{ledger.additionalChargedUsd=Number(ledger.calls.reduce((sum,c)=>sum+(c.status==='metered'?c.costUsd!:c.reservedUsd),0).toFixed(6));ledger.stepChargedUsd=Number((EXPECTED_PRIOR_STEP+ledger.additionalChargedUsd).toFixed(6));ledger.conservativeTotalUsd=Number((FOUNDER_BASELINE_USD+ledger.stepChargedUsd).toFixed(6));const data=JSON.stringify(ledger,null,2)+'\n';if(data.includes(key)||/"(?:headers|responseHeaders|authorization|apiKey|requestId|email|userId|channelId)"\s*:/i.test(data))throw Error('Privacy guard failed');writeFileSync(report+'.tmp',data);for(let attempt=0;;attempt++)try{renameSync(report+'.tmp',report);break;}catch(error){const code=(error as NodeJS.ErrnoException).code;if(!['EPERM','EACCES','EBUSY'].includes(code??'')||attempt>=20)throw error;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,50);}};
 try{
  entry.maxOutputTokens=OUTPUT_LIMIT;
  globalThis.fetch=async(input,init)=>{
   const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
   if(!url.startsWith('https://api.anthropic.com/')||!url.endsWith('/messages'))return nativeFetch(input,init);
   if(!active||ledger.stopped||typeof init?.body!=='string')throw Error('No authorised native message');
   const body=JSON.parse(init.body) as {model?:string;max_tokens?:number;stream?:boolean;thinking?:{type?:string};temperature?:number;system?:unknown};
   // Evaluation only: the confirmation reply is a few dozen tokens, so reserve and cap at a small limit, not the review cap.
   if(JSON.stringify(body.system??'').includes(JSON.stringify(CONFIRM_SYSTEM_PROMPT.slice(0,60)).slice(1,-1))){body.max_tokens=CONFIRM_OUTPUT_LIMIT;(init as {body:string}).body=JSON.stringify(body);}
   if(body.model!==ledger.model||typeof body.max_tokens!=='number'||body.max_tokens<1||body.max_tokens>OUTPUT_LIMIT*2)throw Error('Unexpected native model/output cap');
   const countBody={...body} as Record<string,unknown>;delete countBody.max_tokens;delete countBody.stream;
   const countResponse=await nativeFetch(url+'/count_tokens',{method:'POST',headers:init.headers,body:JSON.stringify(countBody)});
   if(!countResponse.ok){ledger.stopped='free token-count preflight failed (HTTP '+countResponse.status+')';save();throw Error(ledger.stopped);}
   const count=await countResponse.json() as {input_tokens?:unknown};if(typeof count.input_tokens!=='number'||!Number.isInteger(count.input_tokens)||count.input_tokens<0){ledger.stopped='token-count preflight invalid';save();throw Error(ledger.stopped);}
   let reserve:number;try{{const price=resolvePricing(ledger.model);reserve=((count.input_tokens+INPUT_MARGIN_TOKENS)*price.inputPerMillionUsd+body.max_tokens*price.outputPerMillionUsd)/1e6;if(ledger.stepChargedUsd+reserve>STEP_CEILING_USD+1e-10)throw Error('STOP: native request would exceed approved $0.80 ceiling');}}catch(error){capped=true;ledger.stopped='next native message reservation would exceed total $0.80';save();throw error;}
   const call:NativeCall={id:ledger.calls.length+1,caseId:active.caseId,repeat:active.repeat,status:'reserved',reservedUsd:reserve,estimatedInputTokens:count.input_tokens,inputMarginTokens:INPUT_MARGIN_TOKENS,requestedModel:body.model,outputLimit:body.max_tokens,reasoningMode:['disabled','adaptive','enabled','between_tools'].includes(body.thinking?.type??'')?body.thinking!.type!:null,temperature:typeof body.temperature==='number'?body.temperature:null,requestHash:createHash('sha256').update(init.body).digest('hex'),startedAt:new Date().toISOString()};ledger.calls.push(call);active.callIds.push(call.id);save();
   try{const response=await nativeFetch(input,init);call.httpStatus=response.status;
    if(response.ok){call.evidence=nativeReviewEvidence(await response.clone().text());const e=call.evidence;if(e.inputTokens!==null&&e.outputTokens!==null&&e.inputTokens>=0&&e.outputTokens>=0){const price=resolvePricing(ledger.model);call.costUsd=Number(((e.inputTokens*price.inputPerMillionUsd+e.outputTokens*price.outputPerMillionUsd)/1e6).toFixed(6));call.status='metered';if(call.costUsd>call.reservedUsd){ledger.stopped='actual usage exceeded safety reservation';}}else{call.status='unmetered';ledger.stopped='native usage unavailable; reservation held';}}
    else{call.status='unmetered';ledger.stopped='provider failure (HTTP '+response.status+'); reservation held';let kind:string|null=null;try{const parsed=await response.clone().json() as {error?:{type?:string}};if(['overloaded_error','rate_limit_error','invalid_request_error','authentication_error','permission_error','api_error'].includes(parsed.error?.type??''))kind=parsed.error!.type!;}catch{/* no raw error body */}call.errorType=kind;}
    call.endedAt=new Date().toISOString();save();return response;
   }catch(error){call.status='unmetered';call.endedAt=new Date().toISOString();ledger.stopped='transport/evidence failure; reservation held';save();throw error;}
  };
  save();
  for(const c of fixtures)for(let repeat=1;repeat<=1;repeat++){
   if(ledger.stopped)break;active={caseId:c.caseId,repeat,status:'running',callIds:[]};ledger.reviews.push(active);save();
   try{const result=await reviewScript({scriptText:c.scriptText,captions:'',nicheDescription:'Historical stories',videoKind:c.videoKind,targetSeconds:c.targetSeconds,chapterTitles:c.chapterTitles,evidence:buildEvidencePacket({briefText:c.briefText,factPolicy:c.factPolicy})},callLLM);active.output=result.output;active.hardCapChecks=result.hardCapChecks;active.responses=result.calls??[result.llm];const usage=active.responses.flatMap(llmUsageRows);if(usage.length!==active.callIds.length)throw Error('Native usage count mismatch');for(let i=0;i<usage.length;i++){const call=ledger.calls.find(x=>x.id===active!.callIds[i])!;if(call.status==='metered')call.costUsd=Math.max(call.costUsd!,Number(usage[i].costUsd));}active.status='complete';const checks=result.hardCapChecks??[],sr9=checks.filter(k=>/^\s*\[?SR-9\b/i.test(k.finding)),confirmed=sr9.some(k=>k.outcome==='confirmed'&&k.verdicts.some(v=>v.verdict==='unsupported')),pass=confirmed&&result.output.score<=6;active.detection={sr9Flagged:sr9.length>0,confirmationFired:checks.some(k=>k.verdicts.length>0),confirmedUnsupported:confirmed,score:result.output.score,pass};if(!pass){ledger.stopped='detection check failed: sr9Flagged='+active.detection.sr9Flagged+' confirmationFired='+active.detection.confirmationFired+' confirmed='+confirmed+' score='+result.output.score;}}
   catch(error){active.status=capped?'budget-stopped':'failed';active.failure=reviewFailureEvidence(error,ledger.model,OUTPUT_LIMIT);if(!ledger.stopped)ledger.stopped='review/provider failure captured';}
   save();console.log(c.caseId+' / '+repeat+' '+active.status+' score='+(active.output?.score??'n/a')+' stepUSD='+ledger.stepChargedUsd.toFixed(6));
   if(ledger.stopped)break;
  }
  ledger.complete=ledger.reviews.filter(r=>r.status==='complete').length===2;ledger.passBar={bothComplete:ledger.complete,met:ledger.complete&&ledger.reviews.every(r=>r.detection?.pass===true)};save();console.log('complete='+ledger.complete+'; stepUSD='+ledger.stepChargedUsd.toFixed(6)+'; conservativeUSD='+ledger.conservativeTotalUsd.toFixed(6));
 }finally{globalThis.fetch=nativeFetch;entry.maxOutputTokens=productionLimit;closeSync(fd);unlinkSync(lock);}
}
main().catch(error=>{const message=error instanceof Error?error.message:'unknown';console.error('Post-merge detection check stopped: '+(key?message.split(key).join('[key]'):message));process.exitCode=1;});

