import { createHash } from 'node:crypto';
import path from 'node:path';
import { DATA_DIR } from '../config/paths';
import { DISCLAIMER_SENTENCE, DISCLAIMER_SENTENCE_SHA256 } from './sentence';

// Sprint 6 Task 2 (P5): the fixed recording and treatment of the disclaimer. Platform asset, shared by every
// channel; nothing here reads a channel, profile, run pick or the voice catalog. The recording uses a fixed
// provider voice id and delivery, never a catalog voice.
export const DISCLAIMER_TTS_MODEL = 'gpt-4o-mini-tts';
export const DISCLAIMER_PROVIDER_VOICE = 'ash';
export const DISCLAIMER_DELIVERY =
  'Speak quietly and gently, in a calm, neutral tone, at a brisk, flowing pace, with no long pauses between phrases. No drama, no emphasis; clear on every word.';
// Natural pace (1x). Softness comes from level and fades, not from speed.
export const DISCLAIMER_PACE = 1;
// Level of the clip under the measured narration, set in the mix graph, so the final loudness stage keeps the ratio.
export const DISCLAIMER_LEVEL_DB_UNDER_NARRATION = 6;
export const DISCLAIMER_FADE_IN_SEC = 0.25;
export const DISCLAIMER_FADE_OUT_SEC = 0.25;
// The card stays up for the whole clip and at least this long.
export const DISCLAIMER_MIN_CARD_SECONDS = 2;

// Anything that changes the sound, words or treatment changes the version, so old runs replay consistently.
export const DISCLAIMER_ASSET_VERSION = createHash('sha256')
  .update(
    JSON.stringify({
      sentence: DISCLAIMER_SENTENCE_SHA256,
      model: DISCLAIMER_TTS_MODEL,
      voice: DISCLAIMER_PROVIDER_VOICE,
      delivery: DISCLAIMER_DELIVERY,
      pace: DISCLAIMER_PACE,
      levelDb: DISCLAIMER_LEVEL_DB_UNDER_NARRATION,
      fadeIn: DISCLAIMER_FADE_IN_SEC,
      fadeOut: DISCLAIMER_FADE_OUT_SEC,
    }),
  )
  .digest('hex')
  .slice(0, 12);

export const DISCLAIMER_ASSET_DIR = path.join(DATA_DIR, 'disclaimer');
export const DISCLAIMER_CLIP_PATH = path.join(DISCLAIMER_ASSET_DIR, 'clip.mp3');
export const DISCLAIMER_MANIFEST_PATH = path.join(DISCLAIMER_ASSET_DIR, 'manifest.json');

export type DisclaimerManifest = {
  version: string;
  sentence: string;
  sentenceSha256: string;
  clipSha256: string;
  clipSeconds: number;
  model: string;
  voice: string;
};

export { DISCLAIMER_SENTENCE };
