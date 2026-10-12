// Public surface of the audio-bed capability layer. Call sites import only
// from here — never from client.ts/manifest.ts directly — mirroring every
// other capability layer's import-boundary pattern in this project.

export { pickAudioBedTrack, pickAudioBedTracks, pickTrackByMood, pickTracksByMood, assertMonetisableLicense } from './client';
export { AUDIO_BED_MANIFEST } from './manifest';
export { MOOD_TAGS } from './types';
export type { MoodTag, AudioBedTrack } from './types';
