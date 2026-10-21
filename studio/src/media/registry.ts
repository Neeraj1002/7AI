import type { MediaProvider, MediaPurpose } from './types';
import { VOICE_CATALOG, type VoiceCatalogEntry } from './voice-catalog.config';

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
  if (purpose === 'tts' && voice && NEWER_VOICES.has(providerVoiceFor(voice))) {
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

// Sprint 5 Task 8 (R10 Part B): the choosable voices come from the catalog (voice-catalog.config.ts), built and
// validated here. Which model speaks a voice is NOT stored in the catalog: it is PR #104's mapping above
// (resolveMediaPurpose), applied to the entry's provider voice, so there is one source for it. The 13 voices of
// Sprint 2 Task 1 (D1) are the first catalog entries and keep their ids, so every stored setting still resolves.
export type TtsVoiceEntry = {
  label: string;
  model: string;
  providerVoiceId: string;
  defaultDirection: string | null;
  toneTags: string[];
  licenceNote: string;
  previews: { sad: string; hopeful: string } | null;
};

// The voices OpenAI offers (the nine tts-1-hd accepts plus the four newer ones). A catalog entry must name one.
const OPENAI_PROVIDER_VOICES: ReadonlySet<string> = new Set([
  'alloy', 'ash', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', ...NEWER_VOICES,
]);

// Pure and exported for tests. Throws on a duplicate id or an ENABLED entry that names a voice the provider does
// not offer, or that carries a direction its model does not take. Disabled entries are not offered.
export function buildVoiceTable(catalog: VoiceCatalogEntry[]): Record<string, TtsVoiceEntry> {
  const table: Record<string, TtsVoiceEntry> = {};
  const seen = new Set<string>();
  for (const entry of catalog) {
    if (seen.has(entry.id)) throw new Error(`Voice catalog: duplicate id '${entry.id}'`);
    seen.add(entry.id);
    if (!entry.enabled) continue;
    if (!OPENAI_PROVIDER_VOICES.has(entry.providerVoiceId)) {
      throw new Error(`Voice catalog: '${entry.id}' is enabled but OpenAI has no voice '${entry.providerVoiceId}'`);
    }
    const model = NEWER_VOICES.has(entry.providerVoiceId) ? TTS_NEWER_MODEL : MEDIA_REGISTRY.tts.model;
    if (entry.defaultDirection && model !== TTS_NEWER_MODEL) {
      throw new Error(`Voice catalog: '${entry.id}' has a direction but ${model} does not take one`);
    }
    table[entry.id] = {
      label: entry.displayName,
      model,
      providerVoiceId: entry.providerVoiceId,
      defaultDirection: entry.defaultDirection,
      toneTags: entry.toneTags,
      licenceNote: entry.licenceNote,
      previews: entry.previews,
    };
  }
  return table;
}

export const TTS_VOICES: Record<string, TtsVoiceEntry> = buildVoiceTable(VOICE_CATALOG);
export type TtsVoice = string;
// Zod's z.enum needs a non-empty tuple, not a plain string[]; derived once here so the API layer never
// hand-maintains its own copy.
export const TTS_VOICE_KEYS = Object.keys(TTS_VOICES) as [TtsVoice, ...TtsVoice[]];

// Today's previously-hardcoded voice (client.ts used to inline `?? 'alloy'`
// directly) — now named here so it's one source of truth, matching every
// other DEFAULT_* constant this project already has (e.g. publishing/
// types.ts's DEFAULT_PRIVACY_STATUS).
export const DEFAULT_TTS_VOICE: TtsVoice = 'alloy';

// The spoken-style direction a catalog voice is sent with, or null (only the newer model takes one).
export function voiceDirection(voice: string | null | undefined): string | null {
  return (voice && TTS_VOICES[voice]?.defaultDirection) || null;
}

// What the provider is asked to speak for a catalog id (an unknown id passes through unchanged).
export function providerVoiceFor(voice: string): string;
export function providerVoiceFor(voice: string | null | undefined): string | undefined;
export function providerVoiceFor(voice: string | null | undefined): string | undefined {
  return voice ? TTS_VOICES[voice]?.providerVoiceId ?? voice : undefined;
}

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
// perCharacterUsd prices the pre-flight estimate (and tts-1-hd's bill). perMinuteUsd, when set, is how
// that model is billed: the cost booked for a real call is the measured audio duration x this rate.
export type TtsPricingEntry = { perCharacterUsd: number; perMinuteUsd?: number };
export type TranscriptionPricingEntry = { perSecondUsd: number };

export const TTS_PRICING: Record<string, TtsPricingEntry> = {
  'tts-1-hd': { perCharacterUsd: 30 / 1_000_000 },
  // OpenAI lists gpt-4o-mini-tts at ~$0.015/minute of audio; expressed per character at the
  // estimate's pace (155 words/min x 6 chars/word) so the same arithmetic applies. About half
  // of tts-1-hd's ~$0.028/min, so the estimate (priced on tts-1-hd) stays an upper bound.
  [TTS_NEWER_MODEL]: { perCharacterUsd: 0.015 / (155 * 6), perMinuteUsd: 0.015 },
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
