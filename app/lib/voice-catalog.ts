// Sprint 5 Task 7 R6 — the voice picker's data.
//
// Contract with the backend (Task 8 R10 Part B, field names to be confirmed against its report): an API that lists the
// enabled voices, each `{ id, displayName, toneTags: string[], description?: string, previewUrl: string | null }`, where
// `id` is the catalog id a channel or run stores and `previewUrl` is a stored sample (R2 link or an API stream). No
// provider voice id is ever shown. Until it exists, the picker is built from `options.list` (the keys the server accepts
// today) with no sample, so the play button says "no sample yet" instead of pretending.
import { useOptionLists } from './pipeline-options';

export type VoiceEntry = {
  id: string;
  displayName: string;
  toneTags: string[];
  description: string | null;
  previewUrl: string | null;
};

/** Defensive read of one catalog row from the server; null when it is unusable. */
export function parseVoiceEntry(raw: unknown): VoiceEntry | null {
  const r = raw as { id?: unknown; displayName?: unknown; toneTags?: unknown; description?: unknown; previewUrl?: unknown } | null;
  if (!r || typeof r.id !== 'string' || typeof r.displayName !== 'string') return null;
  return {
    id: r.id,
    displayName: r.displayName,
    toneTags: Array.isArray(r.toneTags) ? r.toneTags.filter((t): t is string => typeof t === 'string') : [],
    description: typeof r.description === 'string' && r.description.trim() ? r.description : null,
    previewUrl: typeof r.previewUrl === 'string' && r.previewUrl ? r.previewUrl : null,
  };
}

export function useVoiceCatalog(): { voices: VoiceEntry[]; hasSamples: boolean } {
  const { voices } = useOptionLists();
  const list: VoiceEntry[] = voices.map((v) => ({ id: v.value, displayName: v.label, toneTags: [], description: null, previewUrl: null }));
  return { voices: list, hasSamples: list.some((v) => v.previewUrl !== null) };
}

export type PlaybackAction = 'play' | 'pause' | 'switch';

/** One sample plays at a time: tapping the playing voice pauses it, tapping another switches to it. */
export function nextPlayback(playingId: string | null, tappedId: string): PlaybackAction {
  if (playingId === null) return 'play';
  return playingId === tappedId ? 'pause' : 'switch';
}
