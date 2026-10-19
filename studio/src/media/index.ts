// Public surface of the media generation capability layer (TTS +
// transcription). Call sites import only from here — never from client.ts or
// registry.ts directly — mirroring studio/src/llm/'s import-boundary pattern.

import { synthesizeSpeechViaProvider, transcribeViaProvider } from './client';
import { stubSynthesizeSpeech, stubTranscribe } from './stub';
import { resolveMediaPurpose } from './registry';
import { env } from '../config/env';
import type { SynthesizeSpeechResult, TranscribeResult, VoiceConfig } from './types';

export type {
  MediaPurpose,
  MediaProvider,
  VoiceConfig,
  SynthesizeSpeechResult,
  TranscriptSegment,
  TranscribeResult,
} from './types';
export {
  TTS_VOICES,
  TTS_VOICE_KEYS,
  DEFAULT_TTS_VOICE,
  resolveVoice,
  assertSupportedVoice,
  resolveMediaPurpose,
  resolveTtsPricing,
  resolveTranscriptionPricing,
  type TtsVoice,
} from './registry';

// MEDIA_STUB=1 swaps both calls for the stubs in ./stub.ts — no
// OPENAI_API_KEY has been available in any session so far. Same pattern Week
// 1 used for INTAKE_STAGE_STUB, applied here at the layer's own public
// surface (rather than at each call site) so agents calling this module never
// need to know or care which mode is active.
export async function synthesizeSpeech(
  text: string,
  voiceConfig: VoiceConfig = {},
): Promise<SynthesizeSpeechResult> {
  if (env.MEDIA_STUB === '1') {
    return stubSynthesizeSpeech(text, voiceConfig);
  }
  const { model } = resolveMediaPurpose('tts', voiceConfig.voice);
  return synthesizeSpeechViaProvider({ text, voiceConfig, model });
}

export async function transcribe(audioPath: string): Promise<TranscribeResult> {
  if (env.MEDIA_STUB === '1') {
    return stubTranscribe(audioPath);
  }
  const { model } = resolveMediaPurpose('transcription');
  return transcribeViaProvider({ audioPath, model });
}
