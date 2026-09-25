import { describe, it, expect } from 'vitest';
import { resolveVoice, TTS_VOICES, TTS_VOICE_KEYS, DEFAULT_TTS_VOICE } from './registry';

// Sprint 2 Task 1 (D1/D2) — resolveVoice is the pure, DB-free three-step
// "creation option resolution" rule (override -> channel default -> hardcoded
// fallback) that sprint2/BUSINESS_LOGIC.md documents as the general pattern
// Task 2 (visualSource) and Task 3 (audioLayer) will each reuse verbatim, so
// it gets the same unit-test rigor Week 5 Task 4's computeChannelBudgetCeilings
// did.

describe('resolveVoice', () => {
  it('prefers an explicit per-run override over everything else', () => {
    expect(resolveVoice({ overrideVoice: 'nova', channelDefaultVoice: 'onyx' })).toBe('nova');
  });

  it('falls back to the channel default when there is no override', () => {
    expect(resolveVoice({ overrideVoice: undefined, channelDefaultVoice: 'onyx' })).toBe('onyx');
    expect(resolveVoice({ overrideVoice: null, channelDefaultVoice: 'onyx' })).toBe('onyx');
  });

  it("falls back to today's unchanged hardcoded default when neither is set — the regression case that matters most, since every existing channel has defaultVoice = null", () => {
    expect(resolveVoice({})).toBe(DEFAULT_TTS_VOICE);
    expect(resolveVoice({ overrideVoice: null, channelDefaultVoice: null })).toBe(DEFAULT_TTS_VOICE);
    expect(resolveVoice({ overrideVoice: undefined, channelDefaultVoice: undefined })).toBe(DEFAULT_TTS_VOICE);
  });

  it('an explicit override still wins even when the channel has no default', () => {
    expect(resolveVoice({ overrideVoice: 'cedar', channelDefaultVoice: null })).toBe('cedar');
  });
});

describe('TTS_VOICES', () => {
  it('DEFAULT_TTS_VOICE is itself a real, known voice key', () => {
    expect(TTS_VOICE_KEYS).toContain(DEFAULT_TTS_VOICE);
  });

  it('every voice has a non-empty human-readable label', () => {
    for (const key of TTS_VOICE_KEYS) {
      expect(TTS_VOICES[key].label.length).toBeGreaterThan(0);
    }
  });

  it('TTS_VOICE_KEYS matches TTS_VOICES exactly, for the API layer\'s z.enum validation', () => {
    expect(TTS_VOICE_KEYS.sort()).toEqual(Object.keys(TTS_VOICES).sort());
  });
});
