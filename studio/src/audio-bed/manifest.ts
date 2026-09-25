import path from 'node:path';
import type { AudioBedTrack } from './types';

// F1 — a curated local library, deliberately not a paid API: a handful of
// royalty-free tracks checked into the repo under data/audio-beds/ (see
// .gitignore's carve-out for that one path), tagged by mood. Every real
// entry here was synthesized locally with FFmpeg's own signal generators
// (scripts/generate-audio-beds.ts) — simple layered sine tones, not sourced
// from any external rights holder — so `license: 'CC0'` is a real,
// accurate claim, not a guess: this project generated the audio itself and
// owns it outright.
//
// `license` is filled in by hand for every entry, per F2's requirement —
// this manifest itself never omits it; the missing-license case F2's gate
// defends against is a real mistake a future addition could make, exercised
// directly in audio-bed's own unit tests against a synthetic fixture
// manifest, not against a deliberately-broken real entry here.

const AUDIO_BEDS_DIR = path.resolve(process.cwd(), 'data', 'audio-beds');

export const AUDIO_BED_MANIFEST: AudioBedTrack[] = [
  { moodTag: 'upbeat', filePath: path.join(AUDIO_BEDS_DIR, 'upbeat.mp3'), label: 'Upbeat', license: 'CC0' },
  { moodTag: 'calm', filePath: path.join(AUDIO_BEDS_DIR, 'calm.mp3'), label: 'Calm', license: 'CC0' },
  { moodTag: 'mysterious', filePath: path.join(AUDIO_BEDS_DIR, 'mysterious.mp3'), label: 'Mysterious', license: 'CC0' },
  {
    moodTag: 'inspirational',
    filePath: path.join(AUDIO_BEDS_DIR, 'inspirational.mp3'),
    label: 'Inspirational',
    license: 'CC0',
  },
  { moodTag: 'tense', filePath: path.join(AUDIO_BEDS_DIR, 'tense.mp3'), label: 'Tense', license: 'CC0' },
];
