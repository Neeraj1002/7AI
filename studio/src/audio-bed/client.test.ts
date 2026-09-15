import { describe, it, expect } from 'vitest';
import { pickTrackByMood } from './client';
import { AUDIO_BED_MANIFEST } from './manifest';
import type { AudioBedTrack } from './types';

// Sprint 2 Task 3 (F2) — the license gate is a manifest-integrity check
// (does the entry this project curated carry a license field), not a live
// Content-ID API call. Exercised here against a synthetic fixture manifest
// with a deliberately-missing license, without needing to ship an actually
// broken real entry to prove the gate works — same "pure function,
// injectable manifest" pattern computeChannelBudgetCeilings (Week 5 Task 4)
// used for its own testability.

describe('pickTrackByMood', () => {
  it('returns the matching track when the mood exists and carries a license', () => {
    const track = pickTrackByMood(AUDIO_BED_MANIFEST, 'calm');
    expect(track.moodTag).toBe('calm');
    expect(track.license).toBeTruthy();
  });

  it('every real manifest entry carries a license — the manifest never ships broken', () => {
    for (const track of AUDIO_BED_MANIFEST) {
      expect(track.license, `${track.moodTag} track is missing a license`).toBeTruthy();
    }
  });

  it('throws for a mood tag with no matching entry in the manifest', () => {
    const emptyManifest: AudioBedTrack[] = [];
    expect(() => pickTrackByMood(emptyManifest, 'calm')).toThrow(/No audio-bed track found/);
  });

  it('refuses (throws) a track that is missing license metadata, never silently using it', () => {
    const fixtureManifest: AudioBedTrack[] = [
      { moodTag: 'tense', filePath: '/fake/path/tense.mp3', label: 'Tense (test fixture)' },
    ];
    expect(() => pickTrackByMood(fixtureManifest, 'tense')).toThrow(/missing license metadata/);
  });

  it('does not confuse a track for a different mood with the requested one', () => {
    const fixtureManifest: AudioBedTrack[] = [
      { moodTag: 'calm', filePath: '/fake/path/calm.mp3', label: 'Calm', license: 'CC0' },
    ];
    expect(() => pickTrackByMood(fixtureManifest, 'upbeat')).toThrow(/No audio-bed track found for mood 'upbeat'/);
  });
});
