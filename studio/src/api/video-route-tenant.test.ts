import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Bugs Acceptance run 1 (R5): /runs/:id/video, /preview and /subtitles check that the run belongs to the caller,
// the same way the thumbnail route does (404 for another tenant, an unknown run and an unauthenticated caller).
const mocks = vi.hoisted(() => ({ run: vi.fn(), latest: vi.fn(), identity: vi.fn() }));
vi.mock('../models/repositories/pipeline-run.repository', () => ({ findPipelineRunById: mocks.run }));
vi.mock('../models/repositories/pipeline-stage.repository', () => ({ findLatestAttempt: mocks.latest, listStagesForRun: vi.fn() }));
vi.mock('../auth', () => ({ resolveRequestIdentity: mocks.identity, verifyThumbnailLinkToken: vi.fn() }));

import { registerVideoRoute } from './video-route';
import { DATA_DIR } from '../config/paths';
import { MVP_TENANT_ID } from '../types';

const RUN = '44444444-4444-4444-8444-444444444444';
const dir = path.resolve(DATA_DIR, 'videos', `tenant-test-${RUN}`);
const files = { video: path.join(dir, 'v.mp4'), preview: path.join(dir, 'p.mp4'), srt: path.join(dir, 'c.srt') };
const app = Fastify();

beforeAll(async () => {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of Object.values(files)) fs.writeFileSync(f, 'bytes');
  await registerVideoRoute(app);
  await app.ready();
});
afterAll(async () => {
  fs.rmSync(dir, { recursive: true, force: true });
  await app.close();
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.identity.mockReturnValue({ kind: 'session', userId: 'u1', tenantId: 't1', role: 'owner' });
  mocks.run.mockImplementation(async (id: string) => (id === RUN ? { id: RUN, tenantId: 't1' } : null));
  mocks.latest.mockImplementation(async (_id: string, stage: string) =>
    stage === 'video_generation'
      ? { status: 'completed', output: { videoPath: files.video } }
      : { status: 'completed', output: { previewPath: files.preview, srtPath: files.srt } },
  );
});
const get = (url: string) => app.inject({ method: 'GET', url, headers: { authorization: 'Bearer x' } });

describe.each(['video', 'preview', 'subtitles'])('GET /runs/:id/%s', (route) => {
  it("serves the run's own tenant", async () => {
    const res = await get(`/runs/${RUN}/${route}`);
    expect(res.statusCode).toBe(200);
    if (route === 'subtitles') expect(res.headers['content-disposition']).toContain('captions.srt');
  });

  it("refuses another tenant's session and an unauthenticated caller", async () => {
    mocks.identity.mockReturnValue({ kind: 'session', userId: 'u9', tenantId: 'other-tenant', role: 'owner' });
    expect((await get(`/runs/${RUN}/${route}`)).statusCode).toBe(404);
    mocks.identity.mockReturnValue({ kind: 'unauthenticated' });
    expect((await get(`/runs/${RUN}/${route}`)).statusCode).toBe(404);
  });

  it('answers an unknown run id with the same 404 as another tenant\'s run', async () => {
    const unknown = await get(`/runs/55555555-5555-4555-8555-555555555555/${route}`);
    mocks.identity.mockReturnValue({ kind: 'session', userId: 'u9', tenantId: 'other-tenant', role: 'owner' });
    const other = await get(`/runs/${RUN}/${route}`);
    expect(unknown.statusCode).toBe(404);
    expect(unknown.body).toBe(other.body);
  });

  it('treats the ops token as the MVP tenant, as the thumbnail route does', async () => {
    mocks.identity.mockReturnValue({ kind: 'ops-token' });
    mocks.run.mockResolvedValue({ id: RUN, tenantId: MVP_TENANT_ID });
    expect((await get(`/runs/${RUN}/${route}`)).statusCode).toBe(200);
  });
});
