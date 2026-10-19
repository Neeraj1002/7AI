import { describe, it, expect, vi } from 'vitest';

// Sprint 5 Task 8 (R10 Part B): options.list lists the enabled catalog voices, with signed preview links when previews exist.
const r2 = vi.hoisted(() => ({ configured: true }));
vi.mock('../../storage/r2-client', () => ({
  isR2Configured: () => r2.configured,
  getPresignedDownloadUrl: async ({ key }: { key: string }) => `https://signed.example/${key}`,
}));
vi.mock('../../media', async (orig) => {
  const actual = await orig<typeof import('../../media')>();
  return { ...actual, TTS_VOICES: { ...actual.TTS_VOICES, coral: { ...actual.TTS_VOICES.coral, previews: { sad: 'voice-previews/coral/sad.mp3', hopeful: 'voice-previews/coral/hopeful.mp3' } } } };
});

import { optionsRouter } from './options';

const caller = () => optionsRouter.createCaller({ tenantId: 't', userId: 'u', role: 'owner' } as never);

describe('options.list voices', () => {
  it('lists every enabled voice with its catalog fields; key is the stored id', async () => {
    const { voices } = await caller().list();
    expect(voices).toHaveLength(15);
    const ballad = voices.find((v) => v.key === 'ballad-documentary')!;
    expect(ballad).toMatchObject({ label: 'Ballad (documentary)', provider: 'openai', model: 'gpt-4o-mini-tts' });
    expect(ballad.defaultDirection).toMatch(/documentary narrator/);
    expect(ballad.toneTags.length).toBeGreaterThan(0);
    expect(ballad.licenceNote.length).toBeGreaterThan(0);
  });

  it('signs the two preview links when generated, null otherwise or without storage', async () => {
    const { voices } = await caller().list();
    expect(voices.find((v) => v.key === 'coral')!.previews).toEqual({ sad: 'https://signed.example/voice-previews/coral/sad.mp3', hopeful: 'https://signed.example/voice-previews/coral/hopeful.mp3' });
    expect(voices.find((v) => v.key === 'alloy')!.previews).toBeNull();
    r2.configured = false;
    expect((await caller().list()).voices.find((v) => v.key === 'coral')!.previews).toBeNull();
    r2.configured = true;
  });
});
