/** One owner-authorized comparison round, gated on offline checks; fixture-only. */
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';
import { evaluationHash, requireOfflineProof, callReservation, COMPARISON_MODELS, type ComparisonModel } from '../src/agents/script-review/evaluation-budget';
import type { LLMResponse } from '../src/llm';
import type { ScriptReviewOutput } from '../src/agents/script-review';
type Call={model:ComparisonModel;caseId:string;repeat:number;attempt:number;maxTokens:number;reservedUsd:number;status:'reserved'|'metered'|'unmetered-failure';requestHash:string;response?:LLMResponse;error?:string};
type Review={model:ComparisonModel;caseId:string;repeat:number;status:'running'|'complete'|'failed';output?:ScriptReviewOutput;error?:string};
async function main(){
 if(!process.argv.includes('--run-paid-comparison'))throw new Error('Explicit --run-paid-comparison required; offline only otherwise.');
 const proofFile=process.argv[process.argv.indexOf('--offline-proof')+1];if(!process.argv.includes('--offline-proof'))throw new Error('Offline proof required');
 const hash=evaluationHash(); requireOfflineProof(hash,JSON.parse(readFileSync(proofFile,'utf8')));
 const baselineBytes=readFileSync('src/content-evidence/fixtures/sr-evaluation-results.json');const baseline=JSON.parse(baselineBytes.toString());
 const baselineCharge=Number(baseline.campaign.conservativeTotalUsd);if(baselineCharge!==0.937710)throw new Error('Historical spend changed; verify ledger before proceeding');
 process.env.DATABASE_URL='postgresql://fixtures:unused@127.0.0.1:1/task6_fixtures';process.env.NODE_ENV='test';
 const keyFile=process.argv[process.argv.indexOf('--key-env-file')+1];if(process.argv.includes('--key-env-file'))process.env.ANTHROPIC_API_KEY=dotenv.parse(readFileSync(keyFile)).ANTHROPIC_API_KEY;
 if(!process.env.ANTHROPIC_API_KEY)throw new Error('Existing credential unavailable');
 const {reviewScript}=await import('../src/agents/script-review');const {buildEvidencePacket}=await import('../src/content-evidence/packet');
 const {callScriptReviewForEvaluation,resolvePricing}=await import('../src/llm');
 const fixtures=JSON.parse(readFileSync('src/content-evidence/fixtures/sr-pre-gate.json','utf8')).evaluationCases as {caseId:string;briefText:string;scriptText:string;videoKind:'short'|'long';targetSeconds:number;chapterTitles?:string[];factPolicy:'brief-only'|'brief-plus-common'}[];
 const directory='data/task6-evaluation';mkdirSync(directory,{recursive:true});const file=directory+'/comparison-round.json',lock=file+'.lock';const fd=openSync(lock,'wx');
 try{
 const ledger: {version:number;hash:string;baselineCharge:number;baselineHash:string;calls:Call[];reviews:Review[];complete:boolean}=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{version:1,hash,baselineCharge,baselineHash:createHash('sha256').update(baselineBytes).digest('hex'),calls:[],reviews:[],complete:false};
 if(ledger.hash!==hash||ledger.baselineHash!==createHash('sha256').update(baselineBytes).digest('hex'))throw new Error('One round already started with different inputs; no new paid round authorized');
 const save=()=>{writeFileSync(file+'.tmp',JSON.stringify(ledger,null,2)+'\n');renameSync(file+'.tmp',file);};
 const charged=()=>ledger.baselineCharge+ledger.calls.reduce((s,c)=>s+(c.response?Number(c.response.costUsd):c.reservedUsd),0);
 // Model streams are sequential; only two independent fixture requests can overlap. Every reservation is synchronous and durable before I/O.
 let stopped=false;
 await Promise.all(COMPARISON_MODELS.map(async model=>{
  modelLoop: for(const c of fixtures)for(let repeat=1;repeat<=3;repeat++){
   if(stopped)break modelLoop;
   if(ledger.reviews.some(r=>r.model===model&&r.caseId===c.caseId&&r.repeat===repeat))continue;
   const row:Review={model,caseId:c.caseId,repeat,status:'running'};ledger.reviews.push(row);save();
   const evidence=buildEvidencePacket({briefText:c.briefText,factPolicy:c.factPolicy});
   try{
    const result=await reviewScript({scriptText:c.scriptText,captions:'',nicheDescription:'Historical stories',videoKind:c.videoKind,targetSeconds:c.targetSeconds,chapterTitles:c.chapterTitles,evidence},async req=>{
     const body=JSON.stringify({system:req.system,messages:req.messages});const bytes=Buffer.byteLength(body)+16384;
     let reservedUsd:number;try{reservedUsd=callReservation(charged(),bytes,req.maxTokens,resolvePricing(model));}catch(error){stopped=true;throw error;}
     const attempt=ledger.calls.filter(x=>x.model===model&&x.caseId===c.caseId&&x.repeat===repeat).length+1;if(attempt>2)throw new Error('More than one format retry prohibited');
     const call:Call={model,caseId:c.caseId,repeat,attempt,maxTokens:req.maxTokens,reservedUsd,status:'reserved',requestHash:createHash('sha256').update(body).digest('hex')};ledger.calls.push(call);save();
     try{const response=await callScriptReviewForEvaluation(req,model);call.response=response;call.status='metered';save();return response;}catch(error){call.status='unmetered-failure';call.error=error instanceof Error?error.name:'UnknownError';save();throw error;}
    });row.output=result.output;row.status='complete';save();console.log(model+' '+c.caseId+' '+repeat+'/3 score='+row.output.score+' campaign USD '+charged().toFixed(6));
   }catch(error){row.status='failed';row.error=error instanceof Error?error.name:'UnknownError';save();console.log(model+' '+c.caseId+' '+repeat+'/3 failed; campaign USD '+charged().toFixed(6));
    if(stopped||ledger.calls.some(x=>x.model===model&&x.status==='unmetered-failure'))break modelLoop;
   }
  }
 }));
 ledger.complete=ledger.reviews.length===fixtures.length*3*COMPARISON_MODELS.length&&ledger.reviews.every(r=>r.status!=='running');save();
 console.log('Comparison complete='+ledger.complete+'; conservative campaign USD '+charged().toFixed(6));
 }finally{closeSync(fd);unlinkSync(lock);}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Comparison stopped');process.exitCode=1;});
