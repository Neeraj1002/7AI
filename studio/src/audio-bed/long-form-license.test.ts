import { describe, it, expect } from 'vitest';
import { assertMonetisableLicense, pickTracksByMood } from './client';
import { AUDIO_BED_MANIFEST } from './manifest';
import type { AudioBedTrack } from './types';

const track = (over: Partial<AudioBedTrack>): AudioBedTrack => ({
  moodTag: 'calm',
  filePath: AUDIO_BED_MANIFEST[0].filePath,
  label: 'T',
  license: 'X: cleared for monetised public use; no attribution required',
  ...over,
});

describe('long-form music licenses (Sprint 4 Task 9, R6.4)', () => {
  it('every real manifest entry says it is cleared for monetised public use and whether attribution is required', () => {
    for (const t of AUDIO_BED_MANIFEST) expect(() => assertMonetisableLicense(t)).not.toThrow();
  });

  it('refuses a license that does not say monetised public use', () => {
    expect(() => assertMonetisableLicense(track({ license: 'YouTube Audio Library (no attribution required)' }))).toThrow(/monetised public use/);
    expect(() => assertMonetisableLicense(track({ license: undefined }))).toThrow(/monetised public use/);
  });

  it('refuses a license that does not say whether attribution is required', () => {
    expect(() => assertMonetisableLicense(track({ license: 'Cleared for monetised public use' }))).toThrow(/attribution/);
  });

  it('a track that requires attribution must carry its credit text', () => {
    const needs = track({ license: 'Cleared for monetised public use; attribution required' });
    expect(() => assertMonetisableLicense(needs)).toThrow(/no 'attribution' credit text/);
    expect(() => assertMonetisableLicense({ ...needs, attribution: 'Music by X' })).not.toThrow();
  });

  it('pickTracksByMood returns every track of the mood in manifest order', () => {
    const two = [
      track({ label: 'first' }),
      track({ label: 'other mood', moodTag: 'tense' }),
      track({ label: 'second' }),
    ];
    expect(pickTracksByMood(two, 'calm').map((t) => t.label)).toEqual(['first', 'second']);
    expect(() => pickTracksByMood(two, 'upbeat')).toThrow(/No audio-bed track/);
  });
});
