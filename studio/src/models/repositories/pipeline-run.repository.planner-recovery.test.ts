import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks=vi.hoisted(()=>({updateMany:vi.fn(),findUnique:vi.fn()}));
vi.mock('../prisma-client',()=>({prisma:{pipelineRun:mocks}}));
import { claimPlannerContractRecovery } from './pipeline-run.repository';
import type { PipelineRun } from '../../types';
const run={id:'run',status:'needs_attention',currentStage:'video_generation',creationOptions:{manualRetries:{video_generation:3},targetDurationSec:480}} as unknown as PipelineRun;
beforeEach(()=>{vi.clearAllMocks();mocks.findUnique.mockResolvedValue({...run,creationOptions:{...run.creationOptions,plannerContractRecoveryUsed:true},status:'running'});});
describe('atomic planner recovery claim',()=>{
  it('compares original state/options and preserves the ordinary counter and user choices',async()=>{
    mocks.updateMany.mockResolvedValue({count:1});
    expect(await claimPlannerContractRecovery(run,3)).toMatchObject({status:'running'});
    expect(mocks.updateMany).toHaveBeenCalledWith({where:{id:'run',status:'needs_attention',currentStage:'video_generation',creationOptions:{equals:run.creationOptions}},data:{status:'running',lastError:null,creationOptions:{...run.creationOptions,plannerContractRecoveryUsed:true,maxCostUsd:3}}});
  });
  it('only one concurrent claim succeeds, and a changed/cancelled run is not restarted',async()=>{
    mocks.updateMany.mockResolvedValueOnce({count:1}).mockResolvedValueOnce({count:0});
    const results=await Promise.all([claimPlannerContractRecovery(run),claimPlannerContractRecovery(run)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(mocks.findUnique).toHaveBeenCalledTimes(1);
  });
});

it('does not enqueue a run cancelled after the atomic claim',async()=>{
  mocks.updateMany.mockResolvedValue({count:1});
  mocks.findUnique.mockResolvedValue({...run,status:'failed',lastError:'Cancelled by user'});
  expect(await claimPlannerContractRecovery(run)).toBeUndefined();
});
