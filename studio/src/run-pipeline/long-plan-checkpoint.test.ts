import { describe, it, expect } from 'vitest';
import { planCheckpointHash, reusableLongPlan } from './long-plan-checkpoint';
const inputs = { runId: 'r1', script: 'original', config: { voice: 'v', style: 's' }, chapters: ['one'], fixNotes: null };
const plan = { visualSource: 'ai-stills', stockFootageQuery: 'history', stillScenePrompts: ['scene'], longScenes: [{ chapterIndex: 0, words: 'original', prompt: 'scene' }], captionStyle: 'sentence-grouped', audioLayer: 'none', pacingNotes: 'steady', rationale: 'test' };
const stage = { status: 'failed' as const, output: { recovery: { kind: 'spend_limit' }, recoveryPlan: { inputHash: planCheckpointHash(inputs), plan } } };
describe('long-form plan validity', () => {
  it('reuses a valid plan on an eligible recovery', () => expect(reusableLongPlan(stage, planCheckpointHash(inputs))).toEqual(plan));
  it.each([{ runId: 'r2' }, { script: 'edited' }, { config: { voice: 'new', style: 's' } }, { chapters: ['changed'] }, { fixNotes: 'revise' }])('invalidates changed inputs %j', (change) => expect(reusableLongPlan(stage, planCheckpointHash({ ...inputs, ...change }))).toBeUndefined());
  it('rejects ordinary failures and completed attempts', () => {
    expect(reusableLongPlan({ ...stage, output: { ...stage.output, recovery: null } }, planCheckpointHash(inputs))).toBeUndefined();
    expect(reusableLongPlan({ ...stage, status: 'completed' }, planCheckpointHash(inputs))).toBeUndefined();
  });
  it('rejects malformed and non-long plans', () => {
    for (const invalid of [{}, { ...plan, longScenes: [] }]) expect(reusableLongPlan({ ...stage, output: { ...stage.output, recoveryPlan: { inputHash: planCheckpointHash(inputs), plan: invalid } } }, planCheckpointHash(inputs))).toBeUndefined();
  });
});
