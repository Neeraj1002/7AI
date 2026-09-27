import OpenAI from 'openai';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env';
import { NonTransientStageError, TransientStageError } from '../run-pipeline/retry-with-backoff';
import { resolveTranscriptionPricing, resolveTtsPricing, DEFAULT_TTS_VOICE } from './registry';
import type { SynthesizeSpeechResult, TranscribeResult, VoiceConfig } from './types';
import { DATA_DIR } from '../config/paths';

// The only file allowed to import the `openai` SDK — see
// docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md's boundary
// pattern, replicated here per Week 3 Task 1. Everything this module returns
// is this project's own shape (types.ts); everything it catches is
// translated to the existing TransientStageError/NonTransientStageError
// taxonomy before it leaves this file.

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return client;
}

// Scratch directory the media layer manages itself — callers get back a path,
// not a binary; per SCHEMA.md's "plain, human-readable, no opaque binary"
// convention, the file itself lives on disk, not in Postgres.
const MEDIA_TMP_DIR = path.resolve(DATA_DIR, 'media-tmp');

async function ensureTmpDir(): Promise<void> {
  await fsPromises.mkdir(MEDIA_TMP_DIR, { recursive: true });
}

function mapOpenAiError(error: unknown, context: Record<string, unknown>): Error {
  if (error instanceof OpenAI.APIError) {
    if (error.status !== undefined && (error.status === 429 || error.status >= 500)) {
      return new TransientStageError(`OpenAI API call failed (retryable): ${error.message}`, error, context);
    }
    return new NonTransientStageError(`OpenAI API call failed: ${error.message}`, error, context);
  }
  return new NonTransientStageError('OpenAI API call failed with an unrecognized error', error, context);
}

export async function synthesizeSpeechViaProvider(params: {
  text: string;
  voiceConfig: VoiceConfig;
  model: string;
}): Promise<SynthesizeSpeechResult> {
  await ensureTmpDir();
  try {
    const response = await getClient().audio.speech.create({
      model: params.model,
      voice: params.voiceConfig.voice ?? DEFAULT_TTS_VOICE,
      input: params.text,
      response_format: 'mp3',
    });
    const arrayBuffer = await response.arrayBuffer();
    const audioPath = path.join(MEDIA_TMP_DIR, `${randomUUID()}.mp3`);
    await fsPromises.writeFile(audioPath, Buffer.from(arrayBuffer));

    const characterCount = params.text.length;
    const pricing = resolveTtsPricing(params.model);
    const costUsd = (characterCount * pricing.perCharacterUsd).toFixed(6);

    return { audioPath, characterCount, costUsd };
  } catch (error) {
    if (error instanceof TransientStageError || error instanceof NonTransientStageError) throw error;
    throw mapOpenAiError(error, { provider: 'openai', model: params.model });
  }
}

export async function transcribeViaProvider(params: {
  audioPath: string;
  model: string;
}): Promise<TranscribeResult> {
  try {
    const result = await getClient().audio.transcriptions.create({
      file: fs.createReadStream(params.audioPath),
      model: params.model,
      response_format: 'verbose_json',
      timestamp_granularities: ['word'],
    });

    const words = result.words ?? [];
    const segments = words.map((w) => ({
      text: w.word,
      startMs: Math.round(w.start * 1000),
      endMs: Math.round(w.end * 1000),
    }));
    const audioDurationSeconds = result.duration;

    const pricing = resolveTranscriptionPricing(params.model);
    const costUsd = (audioDurationSeconds * pricing.perSecondUsd).toFixed(6);

    return { segments, audioDurationSeconds, costUsd };
  } catch (error) {
    if (error instanceof TransientStageError || error instanceof NonTransientStageError) throw error;
    throw mapOpenAiError(error, { provider: 'openai', model: params.model });
  }
}
