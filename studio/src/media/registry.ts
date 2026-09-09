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

export function resolveMediaPurpose(purpose: MediaPurpose): RegistryEntry {
  return MEDIA_REGISTRY[purpose];
}

// Pricing, sitting alongside the registry (same reasoning as
// studio/src/llm/registry.ts's MODEL_PRICING). Sourced from OpenAI's own
// published rates (2026-09): tts-1-hd $30/1M characters; whisper-1 $0.006/minute.
export type TtsPricingEntry = { perCharacterUsd: number };
export type TranscriptionPricingEntry = { perSecondUsd: number };

export const TTS_PRICING: Record<string, TtsPricingEntry> = {
  'tts-1-hd': { perCharacterUsd: 30 / 1_000_000 },
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
