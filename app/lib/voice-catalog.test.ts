// Sprint 5 Task 7 R6.
import { describe, it, expect } from 'vitest';
import { nextPlayback, parseVoiceEntry } from './voice-catalog';

describe('voice catalog', () => {
  it('reads a catalog row and keeps no provider ids', () => {
    const v = parseVoiceEntry({ id: 'v1', displayName: 'Marin', toneTags: ['warm', 7, 'calm'], description: 'A calm narrator', previewUrl: 'https://x/y.mp3', providerVoiceId: 'marin' });
    expect(v).toEqual({ id: 'v1', displayName: 'Marin', toneTags: ['warm', 'calm'], description: 'A calm narrator', previewUrl: 'https://x/y.mp3' });
    expect(v).not.toHaveProperty('providerVoiceId');
  });
  it('drops unusable rows and blanks a missing sample', () => {
    expect(parseVoiceEntry({ displayName: 'x' })).toBeNull();
    expect(parseVoiceEntry(null)).toBeNull();
    expect(parseVoiceEntry({ id: 'a', displayName: 'A', previewUrl: '' })?.previewUrl).toBeNull();
  });
  it('one sample at a time', () => {
    expect(nextPlayback(null, 'a')).toBe('play');
    expect(nextPlayback('a', 'a')).toBe('pause');
    expect(nextPlayback('a', 'b')).toBe('switch');
  });
});
