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

// Sprint 4 Task 9 (R6.4): a long-form video is published publicly and may earn money, so a track's
// license must say both that it is cleared for monetised public use and whether attribution is
// required (with the credit text when it is). Fails loudly rather than guessing.
export function assertMonetisableLicense(track: AudioBedTrack): void {
  const license = (track.license ?? '').toLowerCase();
  if (!license.includes('monetised public use') && !license.includes('monetized public use')) {
    throw new NonTransientStageError(
      `Audio-bed track '${track.label}' (${track.moodTag}) is not marked as cleared for monetised public use in audio-bed/manifest.ts — refusing to use it in a long-form video.`,
    );
  }
  const needsCredit = license.includes('attribution required') && !license.includes('no attribution required');
  if (!needsCredit && !license.includes('no attribution required')) {
    throw new NonTransientStageError(
      `Audio-bed track '${track.label}' (${track.moodTag}): its license must say whether attribution is required.`,
    );
  }
  if (needsCredit && !track.attribution) {
    throw new NonTransientStageError(
      `Audio-bed track '${track.label}' (${track.moodTag}) requires attribution but has no 'attribution' credit text in audio-bed/manifest.ts.`,
    );
  }
}

// Sprint 4 Task 9 (R6.4): every track of the mood, in manifest order (the fixed chain order for
// long-form beds). Each one passes the same checks pickTrackByMood applies, plus the monetisation one.
export function pickTracksByMood(manifest: AudioBedTrack[], moodTag: MoodTag): AudioBedTrack[] {
  const tracks = manifest.filter((t) => t.moodTag === moodTag);
  if (tracks.length === 0) {
    throw new NonTransientStageError(`No audio-bed track found for mood '${moodTag}' in the manifest`);
  }
  for (const t of tracks) {
    pickTrackByMood([t], moodTag);
    assertMonetisableLicense(t);
  }
  return tracks;
}

export function pickAudioBedTracks(moodTag: MoodTag): AudioBedTrack[] {
  return pickTracksByMood(AUDIO_BED_MANIFEST, moodTag);
}

export function pickAudioBedTrack(moodTag: MoodTag): AudioBedTrack {
  return pickTrackByMood(AUDIO_BED_MANIFEST, moodTag);
}
