// Sprint 5 Task 7 R6 — with the field names of the Task 8 report: options.list.voices[].
import { describe, it, expect } from 'vitest';
import { nextPlayback, parseVoiceEntry, parseVoiceList, sampleId } from './voice-catalog';

const row = {
  key: 'marin',
  label: 'Marin',
  provider: 'openai',
  model: 'gpt-4o-mini-tts',
  toneTags: ['warm', 7, 'calm'],
  defaultDirection: 'calm documentary narrator, human pauses',
  licenceNote: 'OpenAI terms',
  previews: { sad: 'https://r2/sad.mp3?sig=1', hopeful: 'https://r2/hopeful.mp3?sig=1' },
};

describe('voice catalog (options.list.voices[])', () => {
  it('stores the key as the id, keeps the tone tags and the direction line, and shows no provider or model', () => {
    const v = parseVoiceEntry(row);
    expect(v).toEqual({
      id: 'marin',
      displayName: 'Marin',
      toneTags: ['warm', 'calm'],
      description: 'calm documentary narrator, human pauses',
      previews: { sad: 'https://r2/sad.mp3?sig=1', hopeful: 'https://r2/hopeful.mp3?sig=1' },
    });
    expect(v).not.toHaveProperty('provider');
    expect(v).not.toHaveProperty('model');
    expect(v).not.toHaveProperty('licenceNote');
  });
  it('previews null (not generated yet) or half there means no sample', () => {
    expect(parseVoiceEntry({ ...row, previews: null })?.previews).toBeNull();
    expect(parseVoiceEntry({ ...row, previews: { sad: 'https://x', hopeful: '' } })?.previews).toBeNull();
  });
  it('drops unusable rows', () => {
    expect(parseVoiceEntry({ label: 'x' })).toBeNull();
    expect(parseVoiceEntry(null)).toBeNull();
    expect(parseVoiceList([row, { nope: 1 }, { key: 'coral', label: 'Coral', previews: null }]).map((v) => v.id)).toEqual(['marin', 'coral']);
    expect(parseVoiceList(undefined)).toEqual([]);
  });
  it('one sample at a time, the sad and the hopeful line of a voice are separate samples', () => {
    expect(nextPlayback(null, sampleId('marin', 'sad'))).toBe('play');
    expect(nextPlayback('marin:sad', 'marin:sad')).toBe('pause');
    expect(nextPlayback('marin:sad', 'marin:hopeful')).toBe('switch');
  });
});
