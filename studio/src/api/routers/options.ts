import { router, publicProcedure } from '../trpc';
import { TTS_VOICES, TTS_VOICE_KEYS, resolveMediaPurpose } from '../../media';
import { VISUAL_SOURCES, AUDIO_LAYERS } from '../../agents/video-generation/plan';

// Sprint 3 Task 9 (R5, optional) — read-only, tenant-independent static data
// (voice/visual-source/mood-tag labels and keys) so the app's own picker
// lists come from the real backend constants instead of a hardcoded copy
// that can drift. No input, no auth beyond the existing global hook —
// nothing here is sensitive or scoped to a caller.
export const optionsRouter = router({
  list: publicProcedure.query(async () => ({
    voices: TTS_VOICE_KEYS.map((key) => ({ key, label: TTS_VOICES[key].label, model: resolveMediaPurpose('tts', key).model })),
    visualSources: VISUAL_SOURCES,
    moodTags: AUDIO_LAYERS,
  })),
});
