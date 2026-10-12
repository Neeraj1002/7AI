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

// Sprint 4 Task 9 (R6.4): every long-form video is published publicly and may be monetised, so every
// entry's `license` must say it is cleared for monetised public use and whether attribution is required
// (checked at pick time by assertMonetisableLicense). Add `attribution` for a track that needs a credit.
const LICENSE_YT_LIBRARY = 'YouTube Audio Library: cleared for monetised public use; no attribution required';

export const AUDIO_BED_MANIFEST: AudioBedTrack[] = [
  {
    moodTag: 'upbeat',
    filePath: path.join(AUDIO_BEDS_DIR, 'upbeat.mp3'),
    label: 'AnaCaptainsLogue - Noir Et Blanc Vie',
    license: LICENSE_YT_LIBRARY,
  },
  {
    moodTag: 'calm',
    filePath: path.join(AUDIO_BEDS_DIR, 'calm.mp3'),
    label: 'Far Behind — Silent Partner',
    license: LICENSE_YT_LIBRARY,
  },
  {
    moodTag: 'mysterious',
    filePath: path.join(AUDIO_BEDS_DIR, 'mysterious.mp3'),
    label: 'Fun House - Coyote hearing',
    license: LICENSE_YT_LIBRARY,
  },
  {
    moodTag: 'inspirational',
    filePath: path.join(AUDIO_BEDS_DIR, 'inspirational.mp3'),
    label: 'Subharmonic Bliss - Loopop',
    license: LICENSE_YT_LIBRARY,
  },
  {
    moodTag: 'tense',
    filePath: path.join(AUDIO_BEDS_DIR, 'tense.mp3'),
    label: 'Dream of Ancestor - Asher Fulero',
    license: LICENSE_YT_LIBRARY,
  },
];
