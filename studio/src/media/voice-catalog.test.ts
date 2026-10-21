import { describe, it, expect, vi, beforeEach } from 'vitest';

// Sprint 5 Task 8 (R10 Part B): the voice catalog, its validation and how a catalog voice reaches the provider.
const speechCreateMock = vi.fn();
vi.mock('openai', () => {
  class MockAPIError extends Error {}
  class MockOpenAI {
    audio = { speech: { create: speechCreateMock }, transcriptions: { create: vi.fn() } };
  }
  return { default: Object.assign(MockOpenAI, { APIError: MockAPIError }) };
});

import { synthesizeSpeechViaProvider } from './client';
import { VOICE_CATALOG, VOICE_PREVIEW_SENTENCES, type VoiceCatalogEntry } from './voice-catalog.config';
import { assertSupportedVoice, buildVoiceTable, TTS_VOICES, TTS_VOICE_KEYS, providerVoiceFor, voiceDirection, resolveMediaPurpose } from './registry';

const entry = (over: Partial<VoiceCatalogEntry> = {}): VoiceCatalogEntry => ({ ...VOICE_CATALOG[0], ...over });

describe('catalog seed', () => {
  it('keeps the 13 original voice ids, so every stored channel and run setting still resolves, plus the two Part A voices', () => {
    for (const id of ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse', 'marin', 'cedar']) {
      expect(TTS_VOICE_KEYS).toContain(id);
    }
    expect(TTS_VOICE_KEYS).toContain('ballad-documentary');
    expect(TTS_VOICE_KEYS).toContain('marin-documentary');
    expect(TTS_VOICE_KEYS).toHaveLength(15);
  });

  it('every entry has the full field list and a voice its mapped model can speak', () => {
    for (const e of VOICE_CATALOG) {
      expect(e).toMatchObject({ provider: 'openai', enabled: true });
      expect(e.displayName.length).toBeGreaterThan(0);
      expect(e.toneTags.length).toBeGreaterThan(0);
      expect(e.licenceNote.length).toBeGreaterThan(0);
      expect(() => assertSupportedVoice(e.id)).not.toThrow();
    }
  });

  it('the documentary variants speak the provider voice with the sampled direction, on the newer model', () => {
    expect(providerVoiceFor('ballad-documentary')).toBe('ballad');
    expect(providerVoiceFor('coral')).toBe('coral');
    expect(voiceDirection('marin-documentary')).toMatch(/Calm documentary narrator/);
    expect(voiceDirection('coral')).toBeNull();
    expect(resolveMediaPurpose('tts', 'marin-documentary').model).toBe('gpt-4o-mini-tts');
    expect(resolveMediaPurpose('tts', 'coral').model).toBe('tts-1-hd');
  });

  it('two fixed preview sentences, one sad and one hopeful', () => {
    expect(Object.keys(VOICE_PREVIEW_SENTENCES).sort()).toEqual(['hopeful', 'sad']);
  });
});

describe('buildVoiceTable validation', () => {
  it('refuses a duplicate id', () => {
    expect(() => buildVoiceTable([entry(), entry()])).toThrow(/duplicate id/);
  });
  it('refuses an enabled entry that names a voice OpenAI does not offer, at load', () => {
    expect(() => buildVoiceTable([entry({ id: 'bad', providerVoiceId: 'robot' })])).toThrow(/no voice 'robot'/);
  });
  it('takes the model from the voice-to-model mapping of PR #104, and refuses a direction on a voice whose model takes none', () => {
    expect(buildVoiceTable([entry({ id: 'b', providerVoiceId: 'ballad' })]).b.model).toBe('gpt-4o-mini-tts');
    expect(buildVoiceTable([entry({ id: 'a', providerVoiceId: 'alloy' })]).a.model).toBe('tts-1-hd');
    expect(() => buildVoiceTable([entry({ defaultDirection: 'calm' })])).toThrow(/does not take one/);
  });
  it('a disabled entry is not offered and is not validated', () => {
    const table = buildVoiceTable([entry(), entry({ id: 'old', enabled: false, providerVoiceId: 'robot' })]);
    expect(Object.keys(table)).toEqual([VOICE_CATALOG[0].id]);
  });
  it('carries previews through', () => {
    const previews = { sad: 'voice-previews/alloy/sad.mp3', hopeful: 'voice-previews/alloy/hopeful.mp3' };
    expect(buildVoiceTable([entry({ previews })]).alloy.previews).toEqual(previews);
  });
});

describe('a catalog voice reaches the provider', () => {
  beforeEach(() => {
    speechCreateMock.mockReset();
    speechCreateMock.mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(8) });
  });

  it('sends the provider voice name and the direction for a documentary variant', async () => {
    await synthesizeSpeechViaProvider({ text: 'hello', voiceConfig: { voice: 'ballad-documentary' }, model: 'gpt-4o-mini-tts' });
    expect(speechCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      voice: 'ballad', model: 'gpt-4o-mini-tts', instructions: expect.stringMatching(/Calm documentary narrator/),
    }));
  });

  it('sends no instructions for a voice without a direction, and none to the original model', async () => {
    await synthesizeSpeechViaProvider({ text: 'hello', voiceConfig: { voice: 'coral' }, model: 'tts-1-hd' });
    expect(speechCreateMock.mock.calls[0][0]).not.toHaveProperty('instructions');
    await synthesizeSpeechViaProvider({ text: 'hello', voiceConfig: { voice: 'marin' }, model: 'gpt-4o-mini-tts' });
    expect(speechCreateMock.mock.calls[1][0]).not.toHaveProperty('instructions');
  });

  it('an explicit direction overrides the catalog one', async () => {
    await synthesizeSpeechViaProvider({ text: 'hello', voiceConfig: { voice: 'marin', direction: 'Brisk.' }, model: 'gpt-4o-mini-tts' });
    expect(speechCreateMock).toHaveBeenCalledWith(expect.objectContaining({ voice: 'marin', instructions: 'Brisk.' }));
  });

  it('every catalog voice is sent as a voice its model accepts (never a provider 400)', async () => {
    for (const id of TTS_VOICE_KEYS) {
      speechCreateMock.mockClear();
      await synthesizeSpeechViaProvider({ text: 'x', voiceConfig: { voice: id }, model: TTS_VOICES[id].model });
      expect(speechCreateMock.mock.calls[0][0].voice).toBe(TTS_VOICES[id].providerVoiceId);
    }
  });
});
