import { afterEach, expect, it, vi } from 'vitest';
import { createTrpcClient } from './trpc';

afterEach(() => vi.unstubAllGlobals());

it('keeps the five Content profile reads under the Fastify route parameter limit', async () => {
  const requests: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    const route = new URL(url);
    const path = route.pathname.slice('/trpc/'.length);
    requests.push(path);
    if (path.length > 100) {
      return Response.json({ code: 'FST_ERR_MAX_PARAM_LENGTH', statusCode: 414 }, { status: 414 });
    }
    const replies = path.split(',').map(() => ({ result: { data: { json: [] } } }));
    return Response.json(route.searchParams.has('batch') ? replies : replies[0]);
  });

  const client = createTrpcClient('https://example.test', 'test-token');
  const input = { channelId: '00000000-0000-4000-8000-000000000001' };
  await Promise.all([
    client.options.list.query(),
    client.channels.getActiveProfile.query(input),
    client.channels.listProfileVersions.query(input),
    client.channels.directionPresets.query(),
    client.channels.listFormats.query(),
  ]);

  expect(requests).toEqual(expect.arrayContaining(['channels.directionPresets', 'channels.listFormats']));
  expect(requests.flatMap((path) => path.split(',')).sort()).toEqual([
    'channels.directionPresets',
    'channels.getActiveProfile',
    'channels.listFormats',
    'channels.listProfileVersions',
    'options.list',
  ]);
});
