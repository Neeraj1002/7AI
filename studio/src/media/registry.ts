import type { MediaProvider, MediaPurpose } from './types';

export type RegistryEntry = {
  provider: MediaProvider;
  model: string;
};

// Purpose -> provider+model, mirroring studio/src/llm/registry.ts's shape —
// even with only one provider today, this keeps a later ElevenLabs (TTS) or
// self-hosted WhisperX (transcription) swap a config change here, not a
// call-site rewrite. Both named as future upgrades in
// docs/execution/week1/reports/task8.md.
export const MEDIA_REGISTRY: Record<MediaPurpose, RegistryEntry> = {
  tts: { provider: 'openai', model: 'tts-1-hd' },
  transcription: { provider: 'openai', model: 'whisper-1' },
};

// tts-1-hd accepts only the nine original voices; the newer ones are
// gpt-4o-mini-tts only (OpenAI 400s otherwise).
export const TTS_NEWER_MODEL = 'gpt-4o-mini-tts';
const NEWER_VOICES: ReadonlySet<string> = new Set(['ballad', 'verse', 'marin', 'cedar']);

// Pass the voice to get the model that can actually speak it.
export function resolveMediaPurpose(purpose: MediaPurpose, voice?: string | null): RegistryEntry {
  if (purpose === 'tts' && voice && NEWER_VOICES.has(voice)) {
    return { provider: 'openai', model: TTS_NEWER_MODEL };
  }
  return MEDIA_REGISTRY[purpose];
}

// Fail before any spend: an unknown voice would only be rejected by the provider after the script,
// stills and earlier chunks were already paid for.
export function assertSupportedVoice(voice: string | null | undefined): void {
  if (voice && !(voice in TTS_VOICES)) {
    throw new Error(`Voice '${voice}' is not supported. Choose one of: ${Object.keys(TTS_VOICES).join(', ')}.`);
  }
}

// Sprint 2 Task 1 (D1) — the preset voices OpenAI's TTS endpoint currently
// offers, per the installed `openai` SDK's own `SpeechCreateParams.voice`
// doc comment (node_modules/openai/resources/audio/speech.d.ts), not a
// guessed list. `label` is what the app shows a human; the key is the exact
// string OpenAI's API expects.
export const TTS_VOICES = {
  alloy: { label: 'Alloy' },
  ash: { label: 'Ash' },
  ballad: { label: 'Ballad' },
  coral: { label: 'Coral' },
  echo: { label: 'Echo' },
  fable: { label: 'Fable' },
  onyx: { label: 'Onyx' },
  nova: { label: 'Nova' },
  sage: { label: 'Sage' },
  shimmer: { label: 'Shimmer' },
  verse: { label: 'Verse' },
  marin: { label: 'Marin' },
  cedar: { label: 'Cedar' },
} as const;
export type TtsVoice = keyof typeof TTS_VOICES;
// Zod's z.enum needs a non-empty tuple, not a plain string[] — this is that
// tuple, derived once here so the API layer never hand-maintains its own copy.
export const TTS_VOICE_KEYS = Object.keys(TTS_VOICES) as [TtsVoice, ...TtsVoice[]];

// Today's previously-hardcoded voice (client.ts used to inline `?? 'alloy'`
// directly) — now named here so it's one source of truth, matching every
// other DEFAULT_* constant this project already has (e.g. publishing/
// types.ts's DEFAULT_PRIVACY_STATUS).
export const DEFAULT_TTS_VOICE: TtsVoice = 'alloy';

// The three-step "creation option resolution" rule this sprint establishes
// (sprint2/BUSINESS_LOGIC.md) — explicit per-run override wins, else the
// channel's own default, else today's unchanged hardcoded fallback. Pure and
// DB-free on purpose, so it's directly unit-testable (registry.test.ts) the
// same way Week 5 Task 4's computeChannelBudgetCeilings was — this exact
// precedence order is what Task 2 (visualSource) and Task 3 (audioLayer)
// will each reuse verbatim, so getting it right once here matters beyond
// just voice.
export function resolveVoice(params: { overrideVoice?: string | null; channelDefaultVoice?: string | null }): string {
  return params.overrideVoice ?? params.channelDefaultVoice ?? DEFAULT_TTS_VOICE;
}

// Pricing, sitting alongside the registry (same reasoning as
// studio/src/llm/registry.ts's MODEL_PRICING). Sourced from OpenAI's own
// published rates (2026-09): tts-1-hd $30/1M characters; whisper-1 $0.006/minute.
export type TtsPricingEntry = { perCharacterUsd: number };
export type TranscriptionPricingEntry = { perSecondUsd: number };

export const TTS_PRICING: Record<string, TtsPricingEntry> = {
  'tts-1-hd': { perCharacterUsd: 30 / 1_000_000 },
  // OpenAI lists gpt-4o-mini-tts at ~$0.015/minute of audio; expressed per character at the
  // estimate's pace (155 words/min x 6 chars/word) so the same arithmetic applies. About half
  // of tts-1-hd's ~$0.028/min, so the estimate (priced on tts-1-hd) stays an upper bound.
  [TTS_NEWER_MODEL]: { perCharacterUsd: 0.015 / (155 * 6) },
};

export const TRANSCRIPTION_PRICING: Record<string, TranscriptionPricingEntry> = {
  'whisper-1': { perSecondUsd: 0.006 / 60 },
};

export function resolveTtsPricing(model: string): TtsPricingEntry {
  const entry = TTS_PRICING[model];
  if (!entry) {
    throw new Error(`No TTS pricing entry for model '${model}' — add one to registry.ts's TTS_PRICING.`);
  }
  return entry;
}

export function resolveTranscriptionPricing(model: string): TranscriptionPricingEntry {
  const entry = TRANSCRIPTION_PRICING[model];
  if (!entry) {
    throw new Error(
      `No transcription pricing entry for model '${model}' — add one to registry.ts's TRANSCRIPTION_PRICING.`,
    );
  }
  return entry;
}
