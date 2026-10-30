// Sprint 5 Task 7 R6 / follow-up R1 — the voice picker's data.
//
// Contract (Task 8 report, "App contract for Task 7"): `options.list.voices[]` rows are `{ key, label, provider, model,
// toneTags, defaultDirection, licenceNote, previews { sad, hopeful } | null }`. `key` is the catalog id a channel or run
// stores; `previews` are signed links to two fixed sentences (one sad, one hopeful), valid one hour, null until generated.
// Provider and model are never shown.
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from './trpc';

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

export type CatalogStatus = 'loading' | 'ready' | 'error';

/** The picker has nothing to show but a message when the catalog could not be read. */
export function catalogStatus(args: { isError: boolean; isLoading: boolean; count: number }): CatalogStatus {
  if (args.count > 0) return 'ready';
  return args.isError ? 'error' : args.isLoading ? 'loading' : 'ready';
}

export function useVoiceCatalog(): { voices: VoiceEntry[]; hasSamples: boolean; status: CatalogStatus; retry: () => void } {
  const trpc = useTRPC();
  const q = useQuery(trpc.options.list.queryOptions());
  const voices = parseVoiceList((q.data as { voices?: unknown } | undefined)?.voices);
  return {
    voices,
    hasSamples: voices.some((v) => v.previews !== null),
    status: catalogStatus({ isError: q.isError, isLoading: q.isLoading, count: voices.length }),
    retry: () => void q.refetch(),
  };
}

export type PlaybackAction = 'play' | 'pause' | 'switch';

/** One sample plays at a time: tapping the playing sample pauses it, tapping another switches to it. */
export function nextPlayback(playingId: string | null, tappedId: string): PlaybackAction {
  if (playingId === null) return 'play';
  return playingId === tappedId ? 'pause' : 'switch';
}

export const sampleId = (voiceId: string, which: 'sad' | 'hopeful') => `${voiceId}:${which}`;

export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The text on a sample button: "▶ Sad", "■ Sad 0:04" while it plays, "Sample unavailable" when it failed or is missing. */
export function sampleButtonText(args: { which: 'sad' | 'hopeful'; playing: boolean; elapsed: number; failed: boolean; available: boolean }): string {
  if (args.failed || !args.available) return 'Sample unavailable';
  const name = args.which === 'sad' ? 'Sad' : 'Hopeful';
  return args.playing ? `■ ${name} ${formatElapsed(args.elapsed)}` : `▶ ${name}`;
}

/**
 * Pause a player without ever throwing. expo-video releases the player when the component unmounts (`useVideoPlayer` →
 * `useReleasingSharedObject`), and a cleanup effect that runs after that release calls into a freed native object, which
 * throws; with no error boundary above the Voice page that unmount-time throw is a white screen (Bugs Acceptance run 1, R2).
 * Returns false when the player was already gone.
 */
export function pauseQuietly(player: { pause: () => void }): boolean {
  try {
    player.pause();
    return true;
  } catch {
    return false;
  }
}
