// Sprint 5 Task 7 R6 — the voice picker's data.
//
// Contract (Task 8 report, "App contract for Task 7"): `options.list.voices[]` rows are `{ key, label, provider, model,
// toneTags, defaultDirection, licenceNote, previews { sad, hopeful } | null }`. `key` is the catalog id a channel or run
// stores; `previews` are signed links to two fixed sentences (one sad, one hopeful), valid one hour, null until generated.
// Provider and model are never shown. On an older server the list is just keys and labels, with no samples.
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from './trpc';
import { VOICES } from './pipeline-options';

export type VoicePreviews = { sad: string; hopeful: string };

export type VoiceEntry = {
  /** The catalog id; this is what is stored on a channel or a run. */
  id: string;
  displayName: string;
  toneTags: string[];
  /** The catalog's direction line for the voice ("calm documentary narrator, …"). */
  description: string | null;
  previews: VoicePreviews | null;
};

/** Defensive read of one `options.list.voices[]` row; null when it is unusable. */
export function parseVoiceEntry(raw: unknown): VoiceEntry | null {
  const r = raw as { key?: unknown; label?: unknown; toneTags?: unknown; defaultDirection?: unknown; previews?: { sad?: unknown; hopeful?: unknown } | null } | null;
  if (!r || typeof r.key !== 'string' || typeof r.label !== 'string') return null;
  const sad = r.previews?.sad;
  const hopeful = r.previews?.hopeful;
  return {
    id: r.key,
    displayName: r.label,
    toneTags: Array.isArray(r.toneTags) ? r.toneTags.filter((t): t is string => typeof t === 'string') : [],
    description: typeof r.defaultDirection === 'string' && r.defaultDirection.trim() ? r.defaultDirection.trim() : null,
    previews: typeof sad === 'string' && sad && typeof hopeful === 'string' && hopeful ? { sad, hopeful } : null,
  };
}

export function parseVoiceList(raw: unknown): VoiceEntry[] {
  return Array.isArray(raw) ? raw.flatMap((r) => parseVoiceEntry(r) ?? []) : [];
}

export function useVoiceCatalog(): { voices: VoiceEntry[]; hasSamples: boolean } {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.options.list.queryOptions());
  const parsed = parseVoiceList((data as { voices?: unknown } | undefined)?.voices);
  // The static list is only the offline fallback while the query loads or fails, so a picker is never empty.
  const voices: VoiceEntry[] = parsed.length > 0 ? parsed : VOICES.map((v) => ({ id: v.value, displayName: v.label, toneTags: [], description: null, previews: null }));
  return { voices, hasSamples: voices.some((v) => v.previews !== null) };
}

export type PlaybackAction = 'play' | 'pause' | 'switch';

/** One sample plays at a time: tapping the playing sample pauses it, tapping another switches to it. */
export function nextPlayback(playingId: string | null, tappedId: string): PlaybackAction {
  if (playingId === null) return 'play';
  return playingId === tappedId ? 'pause' : 'switch';
}

export const sampleId = (voiceId: string, which: 'sad' | 'hopeful') => `${voiceId}:${which}`;
