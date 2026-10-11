import { describe, it, expect } from 'vitest';
import { buildStyledScenePrompts, SAFETY_NEGATIVE_CLAUSE } from './scene-prompts';
import { computeDesiredStillCount, estimateStillCount } from './plan';
import { buildSystemPrompt, SAFETY_CHECK_INSTRUCTION } from '../video-intelligence';

const scenes = ['a runner on a track', 'a podium'];

describe('buildStyledScenePrompts', () => {
  it('returns the scenes unchanged when nothing is set', () => {
    expect(buildStyledScenePrompts(scenes, {})).toEqual(scenes);
    expect(buildStyledScenePrompts(scenes, { stylePrompt: null, negativePrompt: null, safetyNegatives: false })).toEqual(scenes);
  });

  it('appends style and avoid to every scene', () => {
    expect(buildStyledScenePrompts(scenes, { stylePrompt: 'muted watercolor', negativePrompt: 'neon' })).toEqual([
      'a runner on a track. Style: muted watercolor. Avoid: neon',
      'a podium. Style: muted watercolor. Avoid: neon',
    ]);
  });

  it('adds the safety clause after the profile negative, not replacing it', () => {
    const out = buildStyledScenePrompts(['x'], { negativePrompt: 'neon', safetyNegatives: true });
    expect(out[0]).toBe(`x. Avoid: neon; ${SAFETY_NEGATIVE_CLAUSE}`);
    expect(buildStyledScenePrompts(['x'], { safetyNegatives: true })[0]).toBe(`x. Avoid: ${SAFETY_NEGATIVE_CLAUSE}`);
  });
});

describe('computeDesiredStillCount', () => {
  it('is undefined when the profile does not set secondsPerStill', () => {
    expect(computeDesiredStillCount(40, null)).toBeUndefined();
    expect(computeDesiredStillCount(40, undefined)).toBeUndefined();
  });
  it('is ceil(target / secondsPerStill): 40 s at 4 s per still is 10', () => {
    expect(computeDesiredStillCount(40, 4)).toBe(10);
  });
  it('clamps to 3-20 for extreme values', () => {
    expect(computeDesiredStillCount(40, 0.1)).toBe(20);
    expect(computeDesiredStillCount(15, 10)).toBe(3);
    expect(computeDesiredStillCount(60, 1)).toBe(20);
  });
  it('leaves Task 8 default untouched (estimateStillCount unchanged)', () => {
    const words = Array(120).fill('word').join(' ');
    expect(estimateStillCount(words)).toBe(18);
  });
});

describe('video-intelligence safety check', () => {
  it('is only added for ai-stills with the flag on', () => {
    expect(buildSystemPrompt('ai-stills', true)).toContain(SAFETY_CHECK_INSTRUCTION);
    expect(buildSystemPrompt('ai-stills', false)).not.toContain('safety rule');
    expect(buildSystemPrompt('ai-stills')).toBe(buildSystemPrompt('ai-stills', false));
    expect(buildSystemPrompt('stock-footage', true)).toBe(buildSystemPrompt('stock-footage', false));
    expect(buildSystemPrompt('stock-footage', true)).not.toContain('safety rule');
  });
});
