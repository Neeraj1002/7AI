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
