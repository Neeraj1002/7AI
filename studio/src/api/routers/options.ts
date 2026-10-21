import { router, publicProcedure } from '../trpc';
import { TTS_VOICES, TTS_VOICE_KEYS, resolveMediaPurpose } from '../../media';
import { getPresignedDownloadUrl, isR2Configured } from '../../storage/r2-client';
import { VISUAL_SOURCES, AUDIO_LAYERS } from '../../agents/video-generation/plan';

// Sprint 3 Task 9 (R5, optional) — read-only, tenant-independent static data
// (voice/visual-source/mood-tag labels and keys) so the app's own picker
// lists come from the real backend constants instead of a hardcoded copy
// that can drift. No input, no auth beyond the existing global hook —
// nothing here is sensitive or scoped to a caller.
const PREVIEW_LINK_SECONDS = 60 * 60;

// Signed links for a voice's preview files; null when none were generated or storage is not configured.
async function signPreviews(previews: { sad: string; hopeful: string } | null): Promise<{ sad: string; hopeful: string } | null> {
  if (!previews || !isR2Configured()) return null;
  try {
    return {
      sad: await getPresignedDownloadUrl({ key: previews.sad, expiresInSeconds: PREVIEW_LINK_SECONDS }),
      hopeful: await getPresignedDownloadUrl({ key: previews.hopeful, expiresInSeconds: PREVIEW_LINK_SECONDS }),
    };
  } catch (error) {
    console.error(`[options] could not sign voice previews: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export const optionsRouter = router({
  list: publicProcedure.query(async () => ({
    // Sprint 5 Task 8 (R10 Part B): the enabled voices of the catalog. `key` is the catalog id a channel or run stores
    // (kept as `key` for the app); the model is PR #104's mapping; previews are signed links to the two fixed
    // sentences, null until generated.
    voices: await Promise.all(TTS_VOICE_KEYS.map(async (key) => {
      const voice = TTS_VOICES[key];
      return {
        key,
        label: voice.label,
        provider: 'openai' as const,
        model: resolveMediaPurpose('tts', key).model,
        toneTags: voice.toneTags,
        defaultDirection: voice.defaultDirection,
        licenceNote: voice.licenceNote,
        previews: await signPreviews(voice.previews),
      };
    })),
    visualSources: VISUAL_SOURCES,
    moodTags: AUDIO_LAYERS,
  })),
});
