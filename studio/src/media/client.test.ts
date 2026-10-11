import { describe, it, expect, vi, beforeEach } from 'vitest';

// Sprint 2 Task 1 (D1) — mocked-client test, same rigor the task's own spec
// explicitly allows as an alternative to inspecting a real request payload
// ("confirm by inspecting the real request payload (or a mocked client
// call, same rigor as Week 2's LLM-layer tests)"). This is the layer where
// an unresolved/dropped voice would actually manifest — asserting the exact
// object passed to the real OpenAI SDK call, not just that our own wrapper
// function returns without throwing.

const speechCreateMock = vi.fn();

vi.mock('openai', () => {
  class MockAPIError extends Error {}
  class MockOpenAI {
    audio = {
      speech: { create: speechCreateMock },
      transcriptions: { create: vi.fn() },
    };
  }
  return { default: Object.assign(MockOpenAI, { APIError: MockAPIError }) };
});

import { synthesizeSpeechViaProvider } from './client';
import { DEFAULT_TTS_VOICE } from './registry';

describe('synthesizeSpeechViaProvider (Sprint 2 Task 1, D1)', () => {
  beforeEach(() => {
    speechCreateMock.mockReset();
    speechCreateMock.mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(8) });
  });

  it('passes an explicit voice through to the real OpenAI request payload', async () => {
    await synthesizeSpeechViaProvider({ text: 'hello world', voiceConfig: { voice: 'onyx' }, model: 'tts-1-hd' });
    expect(speechCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ voice: 'onyx', model: 'tts-1-hd', input: 'hello world' }),
    );
  });

  it('falls back to DEFAULT_TTS_VOICE when no voice is given — the unchanged hardcoded behavior every existing call site relies on', async () => {
    await synthesizeSpeechViaProvider({ text: 'hello world', voiceConfig: {}, model: 'tts-1-hd' });
    expect(speechCreateMock).toHaveBeenCalledWith(expect.objectContaining({ voice: DEFAULT_TTS_VOICE }));
  });
});

// Bugs Task 12 (R10.9) - the transient path (429 / 5xx) classification had never been exercised here.
import OpenAI from 'openai';
import { TransientStageError, NonTransientStageError } from '../run-pipeline/retry-with-backoff';

describe('synthesizeSpeechViaProvider error classification', () => {
  const apiError = (status: number) => Object.assign(new OpenAI.APIError(status as never, {} as never, `HTTP ${status}`, {} as never), { status });
  it.each([429, 500, 503])('a %i is transient (retryable)', async (status) => {
    speechCreateMock.mockRejectedValue(apiError(status));
    await expect(synthesizeSpeechViaProvider({ text: 'x', voiceConfig: {}, model: 'tts-1-hd' })).rejects.toBeInstanceOf(TransientStageError);
  });
  it('a 400 is not retried', async () => {
    speechCreateMock.mockRejectedValue(apiError(400));
    await expect(synthesizeSpeechViaProvider({ text: 'x', voiceConfig: {}, model: 'tts-1-hd' })).rejects.toBeInstanceOf(NonTransientStageError);
  });
});
