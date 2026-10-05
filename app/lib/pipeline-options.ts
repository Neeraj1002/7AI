import { useQuery } from '@tanstack/react-query';
import type { inferRouterInputs } from '@trpc/server';
import { useTRPC } from './trpc';
import type { AppRouter } from '../../studio/src/api/router';

type CreateInput = inferRouterInputs<AppRouter>['runs']['create'];
type Voice = NonNullable<CreateInput['voice']>;
type VisualSource = NonNullable<CreateInput['visualSource']>;
type AudioLayer = NonNullable<CreateInput['audioLayer']>;

// Typed against the API's own input so a renamed/removed backend value fails
// typecheck. Verified against studio TTS_VOICES / VISUAL_SOURCES / MOOD_TAGS
// on 2026-09-26.
export const VOICES = [
  { value: 'alloy', label: 'Alloy' },
  { value: 'ash', label: 'Ash' },
  { value: 'ballad', label: 'Ballad' },
  { value: 'coral', label: 'Coral' },
  { value: 'echo', label: 'Echo' },
  { value: 'fable', label: 'Fable' },
  { value: 'onyx', label: 'Onyx' },
  { value: 'nova', label: 'Nova' },
  { value: 'sage', label: 'Sage' },
  { value: 'shimmer', label: 'Shimmer' },
  { value: 'verse', label: 'Verse' },
  { value: 'marin', label: 'Marin' },
  { value: 'cedar', label: 'Cedar' },
] as const satisfies readonly { value: Voice; label: string }[];

export const VISUAL_SOURCES = [
  { value: 'stock-footage', label: 'Stock footage' },
  { value: 'ai-stills', label: 'AI images' },
] as const satisfies readonly { value: VisualSource; label: string }[];

export const MUSIC_MOODS = [
  { value: 'upbeat', label: 'Upbeat' },
  { value: 'calm', label: 'Calm' },
  { value: 'mysterious', label: 'Mysterious' },
  { value: 'inspirational', label: 'Inspirational' },
  { value: 'tense', label: 'Tense' },
  { value: 'none', label: 'No music' },
] as const satisfies readonly { value: AudioLayer; label: string }[];

// Used only when flags.briefLength (B10).
export const LENGTHS = [30, 45, 60] as const;

const VISUAL_SOURCE_LABELS: Record<string, string> = { 'stock-footage': 'Stock footage', 'ai-stills': 'AI images' };
const MOOD_LABELS: Record<string, string> = { none: 'No music' };

function titleCase(value: string): string {
  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export type Option = { value: string; label: string };

// Task 4/E7 — the server's own options.list (B9) is the source of truth for
// what's actually offered (voice/visual-source/mood-tag keys, in the app's
// own display order for the two lists that don't carry labels); the static
// arrays above are kept only as the offline fallback while the query is
// loading or fails, so a picker is never empty on a cold app or a flaky
// connection. App-side label overrides win over the server's own labels only
// for the two lists whose keys read poorly as-is ("ai-stills", "none").
export function useOptionLists(): { voices: Option[]; visualSources: Option[]; moodTags: Option[] } {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.options.list.queryOptions());
  return {
    voices: data ? data.voices.map((v) => ({ value: v.key, label: v.label })) : [...VOICES],
    visualSources: data
      ? data.visualSources.map((v) => ({ value: v, label: VISUAL_SOURCE_LABELS[v] ?? titleCase(v) }))
      : [...VISUAL_SOURCES],
    moodTags: data ? data.moodTags.map((v) => ({ value: v, label: MOOD_LABELS[v] ?? titleCase(v) })) : [...MUSIC_MOODS],
  };
}
