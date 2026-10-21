import { describe, it, expect } from 'vitest';
import { effectivePrivacy, planSettingsChange, SettingsRejected, videoAlreadyMade, type SettingsPlanContext } from './run-settings';

const ctx = (over: Partial<SettingsPlanContext> = {}, run: Partial<SettingsPlanContext['run']> = {}): SettingsPlanContext => ({
  run: { status: 'paused_gate1', currentStage: 'gate1', creationOptions: null, ...run },
  retryTarget: null,
  current: { voice: 'coral', audioLayer: 'calm', visualSource: 'ai-stills', privacyStatus: 'private', maxCostUsd: 0.5 },
  isLong: true,
  gate2Enabled: true,
  alreadyUploaded: false,
  by: { userId: 'u1', name: 'Neeraj' },
  now: new Date('2026-10-19T10:00:00Z'),
  ...over,
});

describe('videoAlreadyMade', () => {
  it('Gate 1 and a failed stage at or before video generation: nothing made yet', () => {
    expect(videoAlreadyMade({ status: 'paused_gate1', currentStage: 'gate1' }, null)).toBe(false);
    expect(videoAlreadyMade({ status: 'needs_attention', currentStage: 'script_generation' }, 'script_generation')).toBe(false);
    expect(videoAlreadyMade({ status: 'needs_attention', currentStage: 'video_generation' }, 'video_generation')).toBe(false);
  });
  it('a regen-cap or allowance pause parked at video_review retries video_generation, so the video is not final', () => {
    expect(videoAlreadyMade({ status: 'needs_attention', currentStage: 'video_review' }, 'video_generation')).toBe(false);
  });
  it('Gate 2, a blocked review, and a failed publish: the video is made', () => {
    expect(videoAlreadyMade({ status: 'paused_gate2', currentStage: 'gate2' }, null)).toBe(true);
    expect(videoAlreadyMade({ status: 'needs_attention', currentStage: 'video_review' }, 'video_review')).toBe(true);
    expect(videoAlreadyMade({ status: 'needs_attention', currentStage: 'publishing' }, 'publishing')).toBe(true);
  });
});

describe('planSettingsChange', () => {
  it('records label, from and to for each change, and drops settings equal to what the run already uses', () => {
    const plan = planSettingsChange({ voice: 'onyx', audioLayer: 'calm', maxCostUsd: 1 }, ctx());
    expect(plan.changes).toEqual([
      { label: 'Voice', from: 'Coral', to: 'Onyx' },
      { label: 'Max spend', from: '$0.50', to: '$1.00' },
    ]);
    expect(plan.merge).toMatchObject({ voice: 'onyx', maxCostUsd: 1 });
    expect(plan.merge.audioLayer).toBeUndefined();
  });

  it('builds the history entry with the time and who', () => {
    const plan = planSettingsChange({ audioLayer: 'tense' }, ctx());
    expect(plan.merge.settingsChanges).toEqual([{ at: '2026-10-19T10:00:00.000Z', by: { userId: 'u1', name: 'Neeraj' }, changes: [{ label: 'Music', from: 'calm', to: 'tense' }] }]);
  });

  it('refreshes resolvedOptions for the voice, pictures and music it changed, marked as the run\'s own', () => {
    const resolvedOptions = { voice: { key: 'coral', label: 'Coral', from: 'default' }, visualSource: { value: 'stock-footage', label: 'Stock footage', from: 'default' }, music: { label: 'calm', from: 'default' }, targetSeconds: { value: 45, from: 'default' }, videoKind: 'short' as const, formatKey: null };
    const plan = planSettingsChange({ voice: 'onyx', visualSource: 'ai-stills', audioLayer: 'tense' }, ctx({ isLong: false, current: { voice: 'coral', audioLayer: 'calm', visualSource: 'stock-footage', privacyStatus: 'private', maxCostUsd: undefined } }, { creationOptions: { resolvedOptions } }));
    expect(plan.merge.resolvedOptions).toMatchObject({
      voice: { key: 'onyx', label: 'Onyx', from: 'run' },
      visualSource: { value: 'ai-stills', label: 'AI images', from: 'run' },
      music: { label: 'tense', from: 'run' },
      targetSeconds: { value: 45, from: 'default' },
    });
  });

  it('refuses voice, music and pictures once the video is made, each with a one-line reason', () => {
    const made = ctx({}, { status: 'paused_gate2', currentStage: 'gate2' });
    expect(() => planSettingsChange({ voice: 'onyx' }, made)).toThrow(SettingsRejected);
    expect(() => planSettingsChange({ voice: 'onyx' }, made)).toThrow("The video is already made, so the voice can't change here. Use Revise at Gate 2 to redo it.");
    expect(() => planSettingsChange({ audioLayer: 'tense' }, made)).toThrow(/music/);
    expect(() => planSettingsChange({ visualSource: 'stock-footage' }, ctx({ isLong: false }, { status: 'paused_gate2' }))).toThrow(/pictures/);
  });

  it('all or nothing: one refused setting refuses the whole call', () => {
    expect(() => planSettingsChange({ privacyStatus: 'unlisted', voice: 'onyx' }, ctx({}, { status: 'paused_gate2' }))).toThrow(/voice/);
  });

  it('visibility: not after upload, and only private when Gate 2 is off', () => {
    expect(planSettingsChange({ privacyStatus: 'public' }, ctx({}, { status: 'paused_gate2' })).changes[0]).toEqual({ label: 'YouTube visibility', from: 'Private', to: 'Public' });
    expect(() => planSettingsChange({ privacyStatus: 'public' }, ctx({ alreadyUploaded: true }))).toThrow(/already on YouTube/);
    expect(() => planSettingsChange({ privacyStatus: 'unlisted' }, ctx({ gate2Enabled: false }))).toThrow(/Gate 2 is off/);
    expect(planSettingsChange({ privacyStatus: 'private' }, ctx({ gate2Enabled: false, current: { voice: 'coral', audioLayer: null, visualSource: null, privacyStatus: 'public', maxCostUsd: undefined } })).changes).toHaveLength(1);
  });

  it('a long video refuses stock footage with run creation\'s message', () => {
    expect(() => planSettingsChange({ visualSource: 'stock-footage' }, ctx())).toThrow('Long videos use AI stills only; stock footage is not available for them');
  });

  it('no changes means no history entry', () => {
    const plan = planSettingsChange({ voice: 'coral' }, ctx());
    expect(plan.changes).toEqual([]);
    expect(plan.merge).toEqual({});
  });
});

describe('effectivePrivacy: what publishing reads (R13 item 5)', () => {
  it('the per-run override wins over what Gate 2 recorded, which wins over the channel default', () => {
    expect(effectivePrivacy({ privacyStatus: 'unlisted' }, { privacyStatus: 'public' }, 'private')).toBe('unlisted');
    expect(effectivePrivacy({}, { privacyStatus: 'public' }, 'private')).toBe('public');
    expect(effectivePrivacy(null, null, 'private')).toBe('private');
    expect(effectivePrivacy(undefined, { privacyStatus: undefined }, 'private')).toBe('private');
  });
});
