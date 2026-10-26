import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Sprint 6 Task 1 (R5, R6): the thumbnail route checks the tenant, which the older video routes do not.
const mocks = vi.hoisted(() => ({ run: vi.fn(), stages: vi.fn(), identity: vi.fn(), verify: vi.fn() }));
vi.mock('../models/repositories/pipeline-run.repository', () => ({ findPipelineRunById: mocks.run }));
vi.mock('../models/repositories/pipeline-stage.repository', () => ({ findLatestAttempt: vi.fn(), listStagesForRun: mocks.stages }));
vi.mock('../auth', () => ({ resolveRequestIdentity: mocks.identity, verifyThumbnailLinkToken: mocks.verify }));

import { registerVideoRoute } from './video-route';
import { PACKAGING_OUTPUT_VERSION, thumbnailsDir } from '../packaging/build';

const RUN = '33333333-3333-4333-8333-333333333333';
const dir = thumbnailsDir(RUN);
const packaging = {
  version: PACKAGING_OUTPUT_VERSION, status: 'ready', packages: [{ id: 'c1', files: { full: 'c1-full.jpg', feed: 'c1-feed.jpg', sidebar: 'c1-sidebar.jpg' } }],
};
const app = Fastify();

beforeAll(async () => {
  fs.mkdirSync(dir, { recursive: true });
  for (const f of ['c1-full.jpg', 'c1-feed.jpg', 'c1-sidebar.jpg']) fs.writeFileSync(path.join(dir, f), Buffer.from('jpegbytes'));
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
  mocks.verify.mockReturnValue(null);
  mocks.run.mockResolvedValue({ id: RUN, tenantId: 't1' });
  mocks.stages.mockResolvedValue([{ stageName: 'gate2', output: { packaging } }]);
});
const get = (url: string) => app.inject({ method: 'GET', url, headers: { authorization: 'Bearer x' } });

describe('GET /runs/:id/thumbnail/:packageId/:size', () => {
  it('serves each size of a package to the run\'s own tenant', async () => {
    for (const size of ['full', 'feed', 'sidebar']) {
      const res = await get(`/runs/${RUN}/thumbnail/c1/${size}`);
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('image/jpeg');
    }
  });

  it('sends a download header on request', async () => {
    const res = await get(`/runs/${RUN}/thumbnail/c1/full?download=1`);
    expect(res.headers['content-disposition']).toContain('attachment');
  });

  it("refuses another tenant's session and an unauthenticated caller with the same 404", async () => {
    mocks.identity.mockReturnValue({ kind: 'session', userId: 'u9', tenantId: 'other-tenant', role: 'owner' });
    expect((await get(`/runs/${RUN}/thumbnail/c1/full`)).statusCode).toBe(404);
    mocks.identity.mockReturnValue({ kind: 'unauthenticated' });
    expect((await get(`/runs/${RUN}/thumbnail/c1/full`)).statusCode).toBe(404);
  });

  it('refuses a package, a size or a path that is not in the stored record', async () => {
    expect((await get(`/runs/${RUN}/thumbnail/c9/full`)).statusCode).toBe(404);
    expect((await get(`/runs/${RUN}/thumbnail/c1/huge`)).statusCode).toBe(404);
    expect((await get(`/runs/${RUN}/thumbnail/..%2F..%2Fc1/full`)).statusCode).toBe(404);
  });

  it('serves a signed link with no session, only for exactly the run, package and size it names', async () => {
    mocks.identity.mockReturnValue({ kind: 'unauthenticated' });
    mocks.verify.mockReturnValue({ purpose: 'thumbnail-link', runId: RUN, tenantId: 't1', packageId: 'c1', size: 'full' });
    expect((await app.inject({ method: 'GET', url: `/runs/${RUN}/thumbnail/c1/full?t=tok` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/runs/${RUN}/thumbnail/c1/feed?t=tok` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/runs/${RUN}/thumbnail/c9/full?t=tok` })).statusCode).toBe(404);
  });

  it('refuses a signed link whose tenant belongs to another tenant, and a link that does not verify', async () => {
    mocks.identity.mockReturnValue({ kind: 'unauthenticated' });
    mocks.verify.mockReturnValue({ purpose: 'thumbnail-link', runId: RUN, tenantId: 'other-tenant', packageId: 'c1', size: 'full' });
    expect((await app.inject({ method: 'GET', url: `/runs/${RUN}/thumbnail/c1/full?t=tok` })).statusCode).toBe(404);
    mocks.verify.mockReturnValue(null);
    expect((await app.inject({ method: 'GET', url: `/runs/${RUN}/thumbnail/c1/full?t=forged` })).statusCode).toBe(404);
  });

  it('is 404 for a run with no packaging', async () => {
    mocks.stages.mockResolvedValue([{ stageName: 'gate2', output: { outcome: 'approve' } }]);
    expect((await get(`/runs/${RUN}/thumbnail/c1/full`)).statusCode).toBe(404);
  });
});
