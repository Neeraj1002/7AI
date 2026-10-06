import { describe, it, expect } from 'vitest';
import { resolveChannelConfig } from './resolve';
import { ChannelProfileDataSchema } from './schema';
import type { ChannelProfileData } from './schema';
import { DEFAULT_TTS_VOICE } from '../media';

const none = { profile: null, legacyStyleGuide: null, legacyDefaultVoice: null };

describe('resolveChannelConfig', () => {
  it('(a) no profile, no overrides, no legacy fields gives every platform default', () => {
    expect(resolveChannelConfig(none)).toEqual({
      scriptGuide: null,
      targetSeconds: 45,
      bannedOpeners: [],
      bannedEndings: [],
      factPolicy: 'brief-plus-common',
      visualDefaultSource: null,
      visualStylePrompt: null,
      visualNegativePrompt: null,
      visualSecondsPerStill: null,
      audioDefaultVoice: DEFAULT_TTS_VOICE,
      audioDefaultMoodTag: null,
      titleGuidance: null,
      descriptionTemplate: null,
      hashtagsBase: [],
      editorCredit: false,
      selfDeclaredMadeForKids: false,
      categoryId: null,
      defaultLanguage: null,
    });
  });

  it('an empty {} profile behaves exactly like no profile', () => {
    expect(resolveChannelConfig({ ...none, profile: {} })).toEqual(resolveChannelConfig(none));
  });

  it('(b) a legacy-only channel keeps its styleGuide and defaultVoice, everything else default', () => {
    const out = resolveChannelConfig({ profile: null, legacyStyleGuide: 'be punchy', legacyDefaultVoice: 'onyx' });
    expect(out).toEqual({
      ...resolveChannelConfig(none),
      scriptGuide: 'be punchy',
      audioDefaultVoice: 'onyx',
    });
  });

  it('(c) voice: run override > profile > legacy > platform default', () => {
    const profile: ChannelProfileData = { audio: { defaultVoice: 'nova' } };
    const base = { profile, legacyStyleGuide: null, legacyDefaultVoice: 'onyx' };
    expect(resolveChannelConfig({ ...base, runOverrideVoice: 'cedar' }).audioDefaultVoice).toBe('cedar');
    expect(resolveChannelConfig(base).audioDefaultVoice).toBe('nova');
    expect(resolveChannelConfig({ ...base, profile: null }).audioDefaultVoice).toBe('onyx');
    expect(resolveChannelConfig(none).audioDefaultVoice).toBe(DEFAULT_TTS_VOICE);
  });

  it('(c) visualSource: run override > profile > null', () => {
    const profile: ChannelProfileData = { visual: { defaultSource: 'ai-stills' } };
    expect(
      resolveChannelConfig({ ...none, profile, runOverrideVisualSource: 'stock-footage' }).visualDefaultSource,
    ).toBe('stock-footage');
    expect(resolveChannelConfig({ ...none, profile }).visualDefaultSource).toBe('ai-stills');
    expect(resolveChannelConfig(none).visualDefaultSource).toBeNull();
  });

  it('script guide: profile wins over the legacy styleGuide', () => {
    const out = resolveChannelConfig({
      profile: { script: { guide: 'new' } },
      legacyStyleGuide: 'old',
      legacyDefaultVoice: null,
    });
    expect(out.scriptGuide).toBe('new');
  });

  it('audio layer: run override wins over the profile mood tag', () => {
    const profile: ChannelProfileData = { audio: { defaultMoodTag: 'none' } };
    expect(resolveChannelConfig({ ...none, profile, runOverrideAudioLayer: 'none' }).audioDefaultMoodTag).toBe('none');
    expect(resolveChannelConfig({ ...none, profile }).audioDefaultMoodTag).toBe('none');
    expect(resolveChannelConfig(none).audioDefaultMoodTag).toBeNull();
  });
});

describe('ChannelProfileDataSchema', () => {
  it('accepts {} and a normal profile', () => {
    expect(ChannelProfileDataSchema.safeParse({}).success).toBe(true);
    expect(ChannelProfileDataSchema.safeParse({ script: { guide: 'x', targetSeconds: 30 } }).success).toBe(true);
  });

  it('rejects a typo, an unknown section, and out-of-range values', () => {
    expect(ChannelProfileDataSchema.safeParse({ script: { guid: 'x' } }).success).toBe(false);
    expect(ChannelProfileDataSchema.safeParse({ scripts: {} }).success).toBe(false);
    expect(ChannelProfileDataSchema.safeParse({ script: { targetSeconds: 5 } }).success).toBe(false);
    expect(ChannelProfileDataSchema.safeParse({ audio: { defaultVoice: 'nope' } }).success).toBe(false);
    expect(ChannelProfileDataSchema.safeParse({ visual: { defaultSource: 'video' } }).success).toBe(false);
  });
});

describe('resolveChannelConfig targetSeconds', () => {
  it('run override > profile > platform default 45', () => {
    const profile: ChannelProfileData = { script: { targetSeconds: 30 } };
    expect(resolveChannelConfig({ ...none, profile, runOverrideTargetSeconds: 60 }).targetSeconds).toBe(60);
    expect(resolveChannelConfig({ ...none, profile }).targetSeconds).toBe(30);
    expect(resolveChannelConfig(none).targetSeconds).toBe(45);
  });
});
