import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_TTS_VOICE } from '../media';

const mocks = vi.hoisted(() => ({ findProfileVersionById: vi.fn() }));
vi.mock('../models/repositories/channel-profile-version.repository', () => ({
  findProfileVersionById: mocks.findProfileVersionById,
}));

import { loadResolvedConfig } from './resolved-config';

describe('loadResolvedConfig without a content profile', () => {
  it('a run with no profile snapshot gets no script guide and the platform default voice, without throwing', async () => {
    const config = await loadResolvedConfig({ profileVersionId: null, creationOptions: null });
    expect(config.scriptGuide).toBeNull();
    expect(config.audioDefaultVoice).toBe(DEFAULT_TTS_VOICE);
    expect(mocks.findProfileVersionById).not.toHaveBeenCalled();
  });

  it('a snapshot with a guide and voice resolves to them; a run voice override still wins', async () => {
    mocks.findProfileVersionById.mockResolvedValue({ data: { script: { guide: 'g' }, audio: { defaultVoice: 'onyx' } } });
    const run = { profileVersionId: 'v1', creationOptions: null };
    expect(await loadResolvedConfig(run)).toMatchObject({ scriptGuide: 'g', audioDefaultVoice: 'onyx' });
    expect((await loadResolvedConfig({ ...run, creationOptions: { voice: 'nova' } as never })).audioDefaultVoice).toBe('nova');
  });
});

it('resolves a resumed run from its pinned profile even after the active profile changes', async () => {
  mocks.findProfileVersionById.mockImplementation(async (id) => ({ data: { direction: id === 'original'
    ? { preset: 'puzzle-reveal', note: 'First note.' }
    : { preset: 'explainer', note: 'Second note.' } } }));
  const original = await loadResolvedConfig({ profileVersionId: 'original', creationOptions: null });
  const newer = await loadResolvedConfig({ profileVersionId: 'new', creationOptions: null });
  const resumed = await loadResolvedConfig({ profileVersionId: 'original', creationOptions: null });
  expect(original.direction).toMatchObject({ presetKey: 'puzzle-reveal', note: 'First note.' });
  expect(newer.direction).toMatchObject({ presetKey: 'explainer', note: 'Second note.' });
  expect(resumed.direction).toEqual(original.direction);
});
