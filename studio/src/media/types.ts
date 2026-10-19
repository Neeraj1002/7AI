// This project's own media request/response types — never the underlying
// provider's. Mirrors studio/src/llm/types.ts's shape, per Week 3 Task 1's
// instruction to replicate that boundary pattern.

export const MEDIA_PURPOSES = ['tts', 'transcription'] as const;
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];

export const MEDIA_PROVIDERS = ['openai'] as const;
export type MediaProvider = (typeof MEDIA_PROVIDERS)[number];

export type VoiceConfig = {
  voice?: string; // provider-specific voice name, e.g. OpenAI's 'alloy'
};

export type SynthesizeSpeechResult = {
  audioPath: string;
  characterCount: number;
  costUsd: string; // NUMERIC as string, matching UsageEvent.costUsd's DB representation
  // 'duration' = measured audio length x per-minute rate; 'characters' = per-character rate (the only
  // basis for tts-1-hd, and the fallback when the audio could not be measured).
  costBasis?: 'duration' | 'characters';
};

export type TranscriptSegment = {
  text: string;
  startMs: number;
  endMs: number;
};

export type TranscribeResult = {
  segments: TranscriptSegment[];
  audioDurationSeconds: number;
  costUsd: string;
};
