import type { inferRouterInputs } from '@trpc/server';
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
