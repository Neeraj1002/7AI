import { describe, it, expect } from 'vitest';
import {
  MAX_MANUAL_RETRIES_PER_STAGE,
  isManualRetryCapReached,
  manualRetriesUsed,
  retryTargetStage,
} from './manual-retries';

const withCount = (n: number) => ({ creationOptions: { manualRetries: { video_generation: n } } });

describe('manual retry cap', () => {
  it('is 3', () => expect(MAX_MANUAL_RETRIES_PER_STAGE).toBe(3));
  it('counts per stage and starts at zero', () => {
    expect(manualRetriesUsed({ creationOptions: null }, 'video_generation')).toBe(0);
    expect(manualRetriesUsed(withCount(2), 'script_generation')).toBe(0);
  });
  it('allows three and refuses the fourth', () => {
    expect(isManualRetryCapReached(withCount(2), 'video_generation')).toBe(false);
    expect(isManualRetryCapReached(withCount(3), 'video_generation')).toBe(true);
    expect(isManualRetryCapReached(withCount(3), 'script_generation')).toBe(false);
  });
});

describe('retryTargetStage - Retry never re-runs a gate', () => {
  it('gate2 -> video_generation, gate1 -> script_generation', () => {
    expect(retryTargetStage({ currentStage: 'gate2', lastError: null })).toBe('video_generation');
    expect(retryTargetStage({ currentStage: 'gate1', lastError: null })).toBe('script_generation');
  });
  it('regen cap at video_review -> video_generation; otherwise the failed stage', () => {
    expect(retryTargetStage({ currentStage: 'video_review', lastError: 'Video Intelligence regen cap (2) reached' })).toBe('video_generation');
    expect(retryTargetStage({ currentStage: 'publishing', lastError: 'x' })).toBe('publishing');
    expect(retryTargetStage({ currentStage: null, lastError: null })).toBeNull();
  });
});

import { isRetryBlockedByCap } from './manual-retries';
import type { PipelineRun, PipelineStage } from '../types';
it('shares display/API cap eligibility for provider recovery, legacy remediation, and ordinary content failures',()=>{
  const run={status:'needs_attention',...withCount(3)} as unknown as PipelineRun;
  const quota={status:'failed',output:{recovery:{kind:'provider_capacity'}}} as unknown as PipelineStage;
  expect(isRetryBlockedByCap(run,'video_generation',quota)).toBe(false);
  expect(isRetryBlockedByCap(run,'video_generation',null,true)).toBe(false);
  expect(isRetryBlockedByCap(run,'video_generation',null)).toBe(true);
  expect(isRetryBlockedByCap({...run,status:'failed'},'video_generation',quota)).toBe(true);
});
