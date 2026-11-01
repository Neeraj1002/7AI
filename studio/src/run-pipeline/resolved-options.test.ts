import { describe, it, expect } from 'vitest';
import { buildResolvedOptions } from './resolved-options';

const base = { profile: null };

describe('buildResolvedOptions', () => {
  it('all defaults: every entry comes from default and music is Auto', () => {
    expect(buildResolvedOptions({ ...base, picks: {} })).toEqual({
      voice: { key: 'alloy', label: 'Alloy', from: 'default' },
      visualSource: { value: 'auto', label: 'Auto', from: 'default' },
      music: { label: 'Auto', from: 'default' },
      targetSeconds: { value: 45, from: 'default' },
      videoKind: 'short',
      formatKey: null,
    });
  });

  it('run picks win and say so', () => {
    const r = buildResolvedOptions({
      ...base,
      picks: { voice: 'onyx', visualSource: 'ai-stills', audioLayer: 'calm', targetDurationSec: 30 },
    });
    expect(r.voice).toMatchObject({ key: 'onyx', from: 'run' });
    expect(r.visualSource).toEqual({ value: 'ai-stills', label: 'AI images', from: 'run' });
    expect(r.music).toEqual({ label: 'calm', from: 'run' });
    expect(r.targetSeconds).toEqual({ value: 30, from: 'run' });
  });

  it('profile and format sources', () => {
    const profile = { audio: { defaultVoice: 'echo', defaultMoodTag: 'calm' }, visual: { defaultSource: 'ai-stills' } } as never;
    const r = buildResolvedOptions({
      picks: { formatKey: 'countdown' },
      profile,
    });
    expect(r.voice.from).toBe('profile');
    expect(r.visualSource.from).toBe('profile');
    expect(r.music.from).toBe('profile');
    expect(r.targetSeconds).toEqual({ value: 45, from: 'format' });
    expect(r.formatKey).toBe('countdown');
  });

  it('a long run is AI stills with the stored length from the run', () => {
    const r = buildResolvedOptions({ ...base, picks: { videoKind: 'long', targetDurationSec: 600 } });
    expect(r.videoKind).toBe('long');
    expect(r.visualSource).toEqual({ value: 'ai-stills', label: 'AI images', from: 'default' });
    expect(r.targetSeconds).toEqual({ value: 600, from: 'run' });
  });
});
