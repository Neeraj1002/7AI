import fs from 'fs';
import { NonTransientStageError } from '../run-pipeline/retry-with-backoff';
import { AUDIO_BED_MANIFEST } from './manifest';
import type { AudioBedTrack, MoodTag } from './types';

// F2 — Licensing / Content-ID risk check, deliberately lightweight per the
// design doc's own framing: this is a manifest-integrity check (does the
// entry this project curated actually carry a license field), NOT a live
// Content-ID API call — no such public API exists to call synchronously at
// generation time. A missing-license entry is refused here, at pick time,
// before any FFmpeg work starts, exactly like a bad/incomplete input
// anywhere else in this pipeline (NonTransientStageError, never
// auto-retried, surfaces to needs_attention).
//
// Pure and manifest-injectable on purpose — exercised directly in
// client.test.ts against both the real AUDIO_BED_MANIFEST and a synthetic
// fixture manifest missing a license, without needing to actually ship a
// broken real entry to prove the gate works.
export function pickTrackByMood(manifest: AudioBedTrack[], moodTag: MoodTag): AudioBedTrack {
  const track = manifest.find((t) => t.moodTag === moodTag);
  if (!track) {
    throw new NonTransientStageError(`No audio-bed track found for mood '${moodTag}' in the manifest`);
  }
  if (!track.license) {
    throw new NonTransientStageError(
      `Audio-bed track for mood '${moodTag}' (${track.filePath}) is missing license metadata — refusing to use it. Add a real license value to audio-bed/manifest.ts before this track can be picked.`,
    );
  }
  // Bugs Task 10 (R2) — a missing file used to reach ffmpeg as a plain error,
  // retried 3x and surfaced only as "Stage attempt failed after 3 retries"
  // (the repo-root-cwd video failures). Fail once, with the path.
  if (!fs.existsSync(track.filePath)) {
    throw new NonTransientStageError(`Audio-bed file for mood '${moodTag}' is missing on disk: ${track.filePath}`);
  }
  return track;
}

export function pickAudioBedTrack(moodTag: MoodTag): AudioBedTrack {
  return pickTrackByMood(AUDIO_BED_MANIFEST, moodTag);
}
