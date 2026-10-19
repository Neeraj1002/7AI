// Sprint 5 Task 8 (R10 Part B): the voice catalog, as configuration (decision D2: a config file, no migration).
// One entry per choosable voice. `id` is what a channel profile, a run and the app store; a voice may appear more
// than once with different directions (a "documentary" variant of Ballad), so the id is not the provider's voice
// name. The speech model is not stored here: it is PR #104's voice-to-model mapping (media/registry.ts,
// resolveMediaPurpose) applied to `providerVoiceId`. media/registry.ts validates this list when it loads: ids are
// unique, an enabled entry must name a voice OpenAI offers, and a direction only goes with the newer model; a bad
// enabled entry throws at startup, so a bad edit is found on boot and never after money is spent.
//
// To add a voice: add an entry here, run `npx tsx scripts/generate-voice-previews.ts --upload`, then paste the
// printed `previews` block into the entry. To retire one, set `enabled: false` (stored settings keep working).

export type VoiceCatalogEntry = {
  id: string;
  displayName: string;
  provider: 'openai';
  // The provider's own voice name sent with the request.
  providerVoiceId: string;
  toneTags: string[];
  // Spoken-style instruction, sent only to a model that accepts one (gpt-4o-mini-tts). null = none.
  defaultDirection: string | null;
  licenceNote: string;
  enabled: boolean;
  // R2 keys of the two fixed preview sentences (one sad, one hopeful); null until generated and uploaded.
  previews: { sad: string; hopeful: string } | null;
};

const OPENAI_LICENCE =
  'OpenAI text-to-speech voice. AI-generated audio; tell listeners the voice is AI-generated where OpenAI usage policies or the platform require it.';
const DOCUMENTARY =
  'Calm documentary narrator, human pauses, heavier on loss, lifting at recovery.';

const v = (
  id: string,
  displayName: string,
  toneTags: string[],
  extra: Partial<Pick<VoiceCatalogEntry, 'providerVoiceId' | 'defaultDirection'>> = {},
): VoiceCatalogEntry => ({
  id,
  displayName,
  provider: 'openai',
  providerVoiceId: extra.providerVoiceId ?? id,
  toneTags,
  defaultDirection: extra.defaultDirection ?? null,
  licenceNote: OPENAI_LICENCE,
  enabled: true,
  previews: null,
});

export const VOICE_CATALOG: VoiceCatalogEntry[] = [
  v('alloy', 'Alloy', ['neutral', 'clear']),
  v('ash', 'Ash', ['warm', 'steady']),
  v('ballad', 'Ballad', ['soft', 'reflective']),
  v('coral', 'Coral', ['friendly', 'bright']),
  v('echo', 'Echo', ['calm', 'male']),
  v('fable', 'Fable', ['storyteller', 'expressive']),
  v('onyx', 'Onyx', ['deep', 'authoritative']),
  v('nova', 'Nova', ['energetic', 'female']),
  v('sage', 'Sage', ['measured', 'wise']),
  v('shimmer', 'Shimmer', ['light', 'gentle']),
  v('verse', 'Verse', ['expressive', 'dramatic']),
  v('marin', 'Marin', ['natural', 'warm']),
  v('cedar', 'Cedar', ['grounded', 'deep']),
  // Sprint 5 Task 8 Part A voices: the same two voices with the direction line that was sampled.
  v('ballad-documentary', 'Ballad (documentary)', ['documentary', 'soft', 'reflective'], { providerVoiceId: 'ballad', defaultDirection: DOCUMENTARY }),
  v('marin-documentary', 'Marin (documentary)', ['documentary', 'natural', 'warm'], { providerVoiceId: 'marin', defaultDirection: DOCUMENTARY }),
];

// The two fixed preview sentences: one sad, one hopeful (R10 Part B).
export const VOICE_PREVIEW_SENTENCES = {
  sad: 'The factory floors grew quiet, and nobody could say whether the company would survive.',
  hopeful: 'Slowly the shelves filled again, and the company found its way back.',
} as const;
