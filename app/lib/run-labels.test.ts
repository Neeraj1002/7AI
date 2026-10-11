// Bugs Task 13. App tests have no runner of their own; run with the server's vitest:
//   cd studio && npx vitest run --root ../app
import { describe, it, expect } from 'vitest';
import {
  automaticRegensUsed,
  isPublishingPhase,
  runStatusLabel,
  stepperIndexForStage,
  STEPPER_STEPS,
} from './run-labels';

describe('after Gate 2 approval the Run screen shows Publish, not Brief', () => {
  it('maps publishing and analytics (the stats snapshot after the upload) to the Publish step', () => {
    expect(STEPPER_STEPS[stepperIndexForStage('publishing')]).toBe('Publish');
    expect(STEPPER_STEPS[stepperIndexForStage('analytics')]).toBe('Publish');
    expect(stepperIndexForStage('gate2')).toBe(5);
  });
  it('labels a running run in the publishing phase "Publishing"', () => {
    expect(runStatusLabel({ status: 'running', currentStage: 'publishing' })).toBe('Publishing');
    expect(runStatusLabel({ status: 'running', currentStage: 'analytics' })).toBe('Publishing');
    expect(runStatusLabel({ status: 'running', currentStage: 'video_generation' })).toBe('In progress');
    expect(runStatusLabel({ status: 'completed', currentStage: null })).toBe('Published');
  });
  it('treats only a running run as being in the publishing phase (Cancel is hidden then)', () => {
    expect(isPublishingPhase({ status: 'running', currentStage: 'analytics' })).toBe(true);
    expect(isPublishingPhase({ status: 'needs_attention', currentStage: 'publishing' })).toBe(false);
    expect(isPublishingPhase({ status: 'paused_gate2', currentStage: 'gate2' })).toBe(false);
  });
});

describe('automaticRegensUsed', () => {
  const review = (verdict: string) => ({ stageName: 'video_review', output: { verdict } });
  const gen = { stageName: 'video_generation', output: null };
  it('counts failed reviews only, capped at 2', () => {
    expect(automaticRegensUsed([gen, review('pass')])).toBe(0);
    expect(automaticRegensUsed([gen, review('fail'), gen, review('pass')])).toBe(1);
    expect(automaticRegensUsed([gen, review('fail'), gen, review('fail'), gen, review('fail')])).toBe(2);
  });
  it('manual Revise presses add video attempts but never push the count past what reviews failed', () => {
    const afterThreeRevises = [gen, review('pass'), gen, review('pass'), gen, review('pass'), gen, review('pass')];
    expect(automaticRegensUsed(afterThreeRevises)).toBe(0);
  });
});
