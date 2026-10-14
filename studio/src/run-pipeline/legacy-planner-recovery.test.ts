import { describe, expect, it, vi } from 'vitest';
vi.mock('../llm', async orig => ({ ...(await orig<object>()), callLLM: vi.fn() }));
import { longPlanningInputHash } from '../agents/video-generation/plan-long';
import { legacyPlannerRecoveryCheckpoint } from './legacy-planner-recovery';
import type { PipelineRun, PipelineStage } from '../types';
import type { ResolvedChannelConfig } from '../channel-profile';
const chapters = [{ title: 'Merchant', text: Array.from({length:240},(_,i)=>`word${i}`).join(' ') }];
const inputs = { chapters, topic:'Market', targetSeconds:120, audioLayerOverride:'none' as const };
const config = {videoKind:'long', targetSeconds:120,audioDefaultMoodTag:'none'} as ResolvedChannelConfig;
const run = {status:'needs_attention', currentStage:'video_generation',creationOptions:{manualRetries:{video_generation:3}},intakeParsed:{topic:'Market'}} as unknown as PipelineRun;
const gate = {status:'completed',output:{chapters,sanctionedScriptText:chapters[0].text}} as unknown as PipelineStage;
const checkpoint = { inputHash:longPlanningInputHash(inputs,2), scenes:{'0:0':{words:'word0 word1 word2 word3 word4 word5',prompt:'saved scene'}} };
const stage = {status:'failed',error:'Video production planning for chapter 2 ("Merchant") was unusable twice: received 13 scenes, exactly 12 were requested',input:{scriptText:chapters[0].text,fixNotes:null},output:{longPlanningCheckpoint:checkpoint}} as unknown as PipelineStage;
describe('single release-bound legacy planner recovery',()=>{
  it('allows the capped legacy count failure only with a same-input validated checkpoint',()=>{
    expect(legacyPlannerRecoveryCheckpoint(run,stage,gate,config)?.scenes).toEqual(checkpoint.scenes);
  });
  it.each(['used','cancelled','running','new contract','changed script','changed style','changed notes','bad checkpoint','render error','no checkpoint','unapproved gate'])('rejects %s',kind=>{
    const r=structuredClone(run), s=structuredClone(stage), g=structuredClone(gate), c={...config};
    let notes: string|undefined;
    if(kind==='used')r.creationOptions!.plannerContractRecoveryUsed=true;
    if(kind==='cancelled')r.status='failed';
    if(kind==='running')r.status='running';
    if(kind==='new contract')(s.output as {longPlanningCheckpoint: typeof checkpoint & {contractVersion?:number}}).longPlanningCheckpoint.contractVersion=3;
    if(kind==='changed script')(g.output as {chapters:typeof chapters}).chapters[0].text+=' changed';
    if(kind==='changed style')c.visualStylePrompt='different';
    if(kind==='changed notes')notes='new review';
    if(kind==='bad checkpoint')(s.output as {longPlanningCheckpoint: typeof checkpoint & {contractVersion?:number}}).longPlanningCheckpoint.scenes['0:0'].words='wrong anchor';
    if(kind==='render error')s.error='render failed';
    if(kind==='no checkpoint')s.output=null;
    if(kind==='unapproved gate')g.status='running';
    expect(legacyPlannerRecoveryCheckpoint(r,s,g,c,notes)).toBeUndefined();
  });
});
