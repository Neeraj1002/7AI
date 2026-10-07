import path from 'node:path';
import type { AudioBedTrack } from './types';
import { DATA_DIR } from '../config/paths';

// F1 — a curated local library, deliberately not a paid API: a handful of
// royalty-free tracks checked into the repo under data/audio-beds/ (see
// .gitignore's carve-out for that one path), tagged by mood. The tracks are
// real music from the YouTube Audio Library, every one under its "no
// attribution required" licence (replacing the original synthetic FFmpeg
// pads, scripts/generate-audio-beds.ts). Each was loudness-normalised to
// about -18 LUFS integrated with a true peak of at most -1.5 dBTP, so the
// music ducks the same way under the voice whichever mood is picked.
//
// `license` is filled in by hand for every entry, per F2's requirement —
// this manifest itself never omits it; the missing-license case F2's gate
// defends against is a real mistake a future addition could make, exercised
// directly in audio-bed's own unit tests against a synthetic fixture
// manifest, not against a deliberately-broken real entry here.

const AUDIO_BEDS_DIR = path.resolve(DATA_DIR, 'audio-beds');

export const AUDIO_BED_MANIFEST: AudioBedTrack[] = [
  {
    moodTag: 'upbeat',
    filePath: path.join(AUDIO_BEDS_DIR, 'upbeat.mp3'),
    label: 'AnaCaptainsLogue - Noir Et Blanc Vie',
    license: 'YouTube Audio Library (no attribution required)',
  },
  {
    moodTag: 'calm',
    filePath: path.join(AUDIO_BEDS_DIR, 'calm.mp3'),
    label: 'Far Behind — Silent Partner',
    license: 'YouTube Audio Library (no attribution required)',
  },
  {
    moodTag: 'mysterious',
    filePath: path.join(AUDIO_BEDS_DIR, 'mysterious.mp3'),
    label: 'Fun House - Coyote hearing',
    license: 'YouTube Audio Library (no attribution required)',
  },
  {
    moodTag: 'inspirational',
    filePath: path.join(AUDIO_BEDS_DIR, 'inspirational.mp3'),
    label: 'Subharmonic Bliss - Loopop',
    license: 'YouTube Audio Library (no attribution required)',
  },
  {
    moodTag: 'tense',
    filePath: path.join(AUDIO_BEDS_DIR, 'tense.mp3'),
    label: 'Dream of Ancestor - Asher Fulero',
    license: 'YouTube Audio Library (no attribution required)',
  },
];
