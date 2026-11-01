import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  channel: vi.fn(),
  profile: vi.fn(),
  create: vi.fn(),
}));
vi.mock('../models/repositories/channel.repository', async (orig) => ({
  ...(await orig<object>()), findChannelById: mocks.channel,
}));
vi.mock('../models/repositories/channel-profile-version.repository', async (orig) => ({
  ...(await orig<object>()), findProfileVersionById: mocks.profile,
}));
vi.mock('../models/repositories/pipeline-run.repository', async (orig) => ({
  ...(await orig<object>()), createPipelineRun: mocks.create,
}));

import { createRun } from './state-machine';

it('pins the selected profile version and its preset key/version on the run', async () => {
  mocks.channel.mockResolvedValue({ id: 'channel', activeProfileVersionId: 'profile-1' });
  mocks.profile.mockResolvedValue({ id: 'profile-1', data: { direction: { preset: 'explainer' } } });
  mocks.create.mockResolvedValue({ id: 'run' });
  await createRun({ tenantId: 'tenant', channelId: 'channel', briefText: 'brief', creationOptions: {} });
  expect(mocks.create).toHaveBeenCalledWith(
    expect.objectContaining({ creationOptions: expect.objectContaining({ presetKey: 'explainer', presetVersion: 1 }) }),
    'profile-1',
  );
});

it('records neutral for a profile-less channel', async () => {
  mocks.channel.mockResolvedValue({ id: 'channel', activeProfileVersionId: null });
  mocks.profile.mockClear();
  await createRun({ tenantId: 'tenant', channelId: 'channel', briefText: 'brief', creationOptions: {} });
  expect(mocks.profile).not.toHaveBeenCalled();
  expect(mocks.create).toHaveBeenCalledWith(
    expect.objectContaining({ creationOptions: expect.objectContaining({ presetKey: 'neutral', presetVersion: 1 }) }),
    null,
  );
});
