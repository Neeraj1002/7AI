import { describe, it, expect } from 'vitest';
import { resolveChannelConfig } from './resolve';
import { ChannelProfileDataSchema } from './schema';
import type { ChannelProfileData } from './schema';
import { DEFAULT_TTS_VOICE } from '../media';
import { directionPreset } from '../channel-direction/presets';

const none = { profile: null };

describe('resolveChannelConfig', () => {
  it('(a) no profile, no overrides gives every platform default', () => {
    expect(resolveChannelConfig(none)).toEqual({
      direction: {
        presetKey: 'neutral',
        presetVersion: 1,
        parts: directionPreset('neutral').parts,
        note: null,
      },
      scriptGuide: null,
      formatScriptStructure: null,
      videoKind: 'short',
      targetSeconds: 45,
      offeredFormatKeys: [],
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
      readerPersona: null,
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

  it('(b) a channel with no profile resolves to no script guide and the platform default voice', () => {
    const out = resolveChannelConfig({ profile: null });
    expect(out.scriptGuide).toBeNull();
    expect(out.audioDefaultVoice).toBe(DEFAULT_TTS_VOICE);
  });

  it('(b) a profile with a guide and a voice resolves to them, everything else default', () => {
    const profile: ChannelProfileData = { script: { guide: 'be punchy' }, audio: { defaultVoice: 'onyx' } };
    expect(resolveChannelConfig({ profile })).toEqual({
      ...resolveChannelConfig(none),
      scriptGuide: 'be punchy',
      audioDefaultVoice: 'onyx',
    });
  });

  it('(b) a profile without a voice resolves to the platform default voice', () => {
    const out = resolveChannelConfig({ profile: { script: { guide: 'g' } } });
    expect(out.scriptGuide).toBe('g');
    expect(out.audioDefaultVoice).toBe(DEFAULT_TTS_VOICE);
  });

  it('(c) voice: run override > profile > platform default', () => {
    const profile: ChannelProfileData = { audio: { defaultVoice: 'nova' } };
    const base = { profile };
    expect(resolveChannelConfig({ ...base, runOverrideVoice: 'cedar' }).audioDefaultVoice).toBe('cedar');
    expect(resolveChannelConfig(base).audioDefaultVoice).toBe('nova');
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

  it('audio layer: run override wins over the profile mood tag', () => {
    const profile: ChannelProfileData = { audio: { defaultMoodTag: 'none' } };
    expect(resolveChannelConfig({ ...none, profile, runOverrideAudioLayer: 'none' }).audioDefaultMoodTag).toBe('none');
    expect(resolveChannelConfig({ ...none, profile }).audioDefaultMoodTag).toBe('none');
    expect(resolveChannelConfig(none).audioDefaultMoodTag).toBeNull();
  });
});

describe('ChannelProfileDataSchema', () => {
  it('accepts each direction and rejects unknown keys, long notes and extra fields', () => {
    for (const preset of ['history', 'story-first', 'explainer', 'neutral']) {
      expect(ChannelProfileDataSchema.safeParse({ direction: { preset } }).success).toBe(true);
    }
    expect(ChannelProfileDataSchema.safeParse({ direction: { preset: 'other' } }).success).toBe(false);
    expect(ChannelProfileDataSchema.safeParse({ direction: { preset: 'history', note: 'x'.repeat(301) } }).success).toBe(false);
    expect(ChannelProfileDataSchema.safeParse({ direction: { preset: 'history', typo: true } }).success).toBe(false);
  });
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

describe('resolveChannelConfig formatKey (Sprint 4 Task 6)', () => {
  const profile: ChannelProfileData = { script: { targetSeconds: 20 } };

  it('format beats the profile: countdown 45 s wins over a profile 20 s', () => {
    const out = resolveChannelConfig({ ...none, profile, formatKey: 'countdown' });
    expect(out.targetSeconds).toBe(45);
    expect(out.formatScriptStructure).toContain('Numbered items');
  });

  it('an explicit run-level target still beats the format', () => {
    expect(resolveChannelConfig({ ...none, profile, formatKey: 'countdown', runOverrideTargetSeconds: 30 }).targetSeconds).toBe(30);
  });

  it('no format, or an unknown one, leaves resolution exactly as before', () => {
    expect(resolveChannelConfig({ ...none, profile }).targetSeconds).toBe(20);
    expect(resolveChannelConfig({ ...none, profile, formatKey: 'nope' }).targetSeconds).toBe(20);
    expect(resolveChannelConfig({ ...none, profile, formatKey: 'nope' }).formatScriptStructure).toBeNull();
    expect(resolveChannelConfig({ ...none, formatKey: null })).toEqual(resolveChannelConfig(none));
  });

  it('a format with no profile uses the format target', () => {
    expect(resolveChannelConfig({ ...none, formatKey: 'question-surprising-answer' }).targetSeconds).toBe(35);
  });
});

describe('resolveChannelConfig videoKind and offeredFormatKeys (Sprint 4 Task 9)', () => {
  it('defaults: short, 45 s, no offered formats; long defaults to 600 s', () => {
    const out = resolveChannelConfig(none);
    expect([out.videoKind, out.targetSeconds, out.offeredFormatKeys]).toEqual(['short', 45, []]);
    expect(resolveChannelConfig({ ...none, runOverrideVideoKind: 'long' }).targetSeconds).toBe(600);
  });

  it('the format decides the kind when the run does not; a long format gives its length', () => {
    const out = resolveChannelConfig({ ...none, formatKey: 'chaptered-explainer' });
    expect([out.videoKind, out.targetSeconds]).toEqual(['long', 600]);
  });

  it('precedence for long: run override > format > default; the profile Shorts target is ignored', () => {
    const profile: ChannelProfileData = { script: { targetSeconds: 30 } };
    const long = { ...none, profile, runOverrideVideoKind: 'long' as const };
    expect(resolveChannelConfig(long).targetSeconds).toBe(600);
    expect(resolveChannelConfig({ ...long, formatKey: 'chaptered-explainer', runOverrideTargetSeconds: 300 }).targetSeconds).toBe(300);
    expect(resolveChannelConfig({ ...long, formatKey: 'chaptered-explainer' }).targetSeconds).toBe(600);
  });

  it('a format of the other kind contributes nothing', () => {
    const out = resolveChannelConfig({ ...none, runOverrideVideoKind: 'long', formatKey: 'countdown' });
    expect([out.targetSeconds, out.formatScriptStructure]).toEqual([600, null]);
  });

  it('the 60-second cap applies to short only', () => {
    expect(resolveChannelConfig({ ...none, runOverrideTargetSeconds: 120 }).targetSeconds).toBe(60);
    expect(resolveChannelConfig({ ...none, runOverrideVideoKind: 'long', runOverrideTargetSeconds: 900 }).targetSeconds).toBe(900);
  });

  it('returns the profile offeredFormatKeys in order', () => {
    const profile: ChannelProfileData = { offeredFormatKeys: ['top-3', 'chaptered-explainer'] };
    expect(resolveChannelConfig({ ...none, profile }).offeredFormatKeys).toEqual(['top-3', 'chaptered-explainer']);
  });
});

describe('ChannelProfileDataSchema offeredFormatKeys (Sprint 4 Task 9, R1b)', () => {
  const parse = (offeredFormatKeys: unknown) => ChannelProfileDataSchema.safeParse({ offeredFormatKeys });
  it('accepts known keys in any short/long mix, and an empty list', () => {
    expect(parse(['countdown', 'chaptered-explainer']).success).toBe(true);
    expect(parse([]).success).toBe(true);
  });
  it('rejects an unknown key and a duplicate', () => {
    expect(parse(['nope']).success).toBe(false);
    expect(parse(['countdown', 'countdown']).success).toBe(false);
  });
  it('a profile version without the field still parses (older versions mean none offered)', () => {
    const parsed = ChannelProfileDataSchema.parse({ script: { guide: 'x' } });
    expect(parsed.offeredFormatKeys).toBeUndefined();
    expect(resolveChannelConfig({ ...none, profile: parsed }).offeredFormatKeys).toEqual([]);
  });
});

