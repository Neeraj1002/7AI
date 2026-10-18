import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import type { OAuth2Client } from 'google-auth-library';
import { decryptRefreshToken } from '../credential-crypto';
import { uploadResumableVideo } from '../../agents/publishing/resumable-upload';
import { prisma } from '../prisma-client';
import { findPipelineRunById, listRuns } from './pipeline-run.repository';
import { getRunStructureForAdmin } from './admin-runs.repository';
import { claimPublishing, completePublishingReceipt, mutatePublishingReceipt, observePublishingSuccess, parkPublishingAmbiguous, readPublishingReceipt, releasePublishing, savePublishingSession } from './publishing-recovery.repository';
import type { ReceiptIdentity } from '../../run-pipeline/publishing-recovery';

const sandbox = new URL(process.env.DATABASE_URL ?? 'postgres://none:none@localhost/none').pathname.slice(1);
const enabled = process.env.PUBLISHING_TEST_DB === '1' && sandbox === 'sevenai_sprint5_task2_20261015_test';
describe.skipIf(!enabled)('publishing claim with real sandbox connections', () => {
  let tenantId: string;
  let channelId: string;
  const runIds: string[] = [];
  const identity = (): ReceiptIdentity => ({ channelId, fileSha256: 'approved-hash', fileSize: 123,
    gate2Id: 'gate-two', metadataHash: 'metadata-hash', metadata: { title: 'T', description: 'D', tags: ['x'], coverFrameTimestampRatio: 0.2 } });
  async function makeRun() {
    const run = await prisma.pipelineRun.create({ data: { tenantId, channelId, briefText: 'sandbox fixture', status: 'running' } });
    runIds.push(run.id);
    return run.id;
  }
  beforeAll(async () => {
    const tenant = await prisma.tenant.create({ data: { name: 'sprint5-task2-sandbox' } });
    tenantId = tenant.id;
    const channel = await prisma.channel.create({ data: {
      tenantId, name: 'sandbox-channel', nicheDescription: 'sandbox only',
    } });
    channelId = channel.id;
  });
  afterAll(async () => {
    if (runIds.length) await prisma.pipelineStage.deleteMany({ where: { pipelineRunId: { in: runIds } } });
    if (runIds.length) await prisma.pipelineRun.deleteMany({ where: { id: { in: runIds } } });
    if (channelId) await prisma.channel.delete({ where: { id: channelId } });
    if (tenantId) await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.$disconnect();
  });
  it('serializes two callers, saves an encrypted session, and keeps late success', async () => {
    const runId = await makeRun();
    const [a, b] = await Promise.all([claimPublishing(runId, identity()), claimPublishing(runId, identity())]);
    expect([a.kind, b.kind].sort()).toEqual(['acquired', 'busy']);
    const owner = a.kind === 'acquired' ? a : b;
    if (owner.kind !== 'acquired') throw new Error('no owner');
    await savePublishingSession(runId, owner.token, 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=test');
    const persisted = await readPublishingReceipt(runId);
    expect(persisted?.sessionCiphertext).toBeTruthy();
    expect(JSON.stringify(persisted)).not.toContain('upload_id=test');
    for (const projection of [await findPipelineRunById(runId), await listRuns({ tenantId }),
      await getRunStructureForAdmin(runId)]) {
      const serialized = JSON.stringify(projection);
      expect(serialized).not.toContain(persisted?.sessionCiphertext);
      expect(serialized).not.toContain('publishingRecovery');
      expect(serialized).not.toContain(owner.token);
    }
    await prisma.pipelineRun.update({ where: { id: runId }, data: {
      publishingRecovery: { ...persisted!, leaseUntil: '2000-01-01T00:00:00.000Z', uploadStarted: true },
    } });
    const expired = await claimPublishing(runId, identity());
    expect(expired.kind).toBe('acquired');
    expect(expired.receipt.sessionCiphertext).toBe(persisted?.sessionCiphertext);
    await observePublishingSuccess(runId, identity(), 'late-video-id');
    expect((await readPublishingReceipt(runId))?.youtubeVideoId).toBe('late-video-id');
    expect((await claimPublishing(runId, identity())).kind).toBe('busy');
    if (expired.kind === 'acquired') await releasePublishing(runId, expired.token, false);
    expect((await claimPublishing(runId, identity())).kind).toBe('acquired');
  });
  it('recovers a saved session after the worker process stops before bytes', async () => {
    const runId = await makeRun();
    const dir = await mkdtemp(path.join(os.tmpdir(), '7ai-task2-restart-'));
    const videoPath = path.join(dir, 'video.mp4');
    await writeFile(videoPath, 'abcdefghij');
    const id = { ...identity(), fileSize: 10 };
    const session = 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=restart';
    let sessions = 0;
    let submissions = 0;
    const server = createServer(async (req, res) => {
      if (req.method === 'POST') {
        sessions++;
        let metadataBytes = 0;
        for await (const chunk of req) metadataBytes += chunk.length;
        expect(metadataBytes).toBeGreaterThan(0);
        res.writeHead(200, { Location: session }).end();
      } else if (req.headers['content-range'] === 'bytes */10') {
        res.writeHead(308).end();
      } else {
        submissions++;
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        expect(Buffer.concat(chunks).toString()).toBe('abcdefghij');
        res.writeHead(201, { 'Content-Type': 'application/json' }).end(JSON.stringify({ id: 'restart-video-id' }));
      }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No fake server address');
    const port = String(address.port);
    const worker = path.resolve(__dirname, 'publishing-recovery.restart-worker.ts');
    // Run the worker itself in this process, so killing it stops the actual
    // owner on Windows as well as Unix (the tsx CLI adds another child process).
    const child = spawn(process.execPath, ['--import', 'tsx', worker, runId, JSON.stringify(id), videoPath, port],
      { cwd: path.resolve(__dirname, '../../..'), env: { ...process.env, PUBLISHING_TEST_DB: '1' },
        stdio: 'ignore' });
    try {
      let persisted = await readPublishingReceipt(runId);
      const deadline = Date.now() + 10_000;
      while (!persisted?.sessionCiphertext && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 100));
        persisted = await readPublishingReceipt(runId);
      }
      expect(persisted?.sessionCiphertext).toBeTruthy();
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit'); child.kill(); await exited;
      }
      expect(submissions).toBe(0);
      await prisma.pipelineRun.update({ where: { id: runId }, data: { publishingRecovery: {
        ...persisted!, leaseUntil: '2000-01-01T00:00:00.000Z',
      } } });
      const next = await claimPublishing(runId, id);
      if (next.kind !== 'acquired') throw new Error('restart could not reclaim saved session');
      const request = async (options: { url: string; method: string; headers?: Record<string, string>; data?: unknown }) => {
        const source = new URL(options.url);
        const body = options.data && typeof options.data === 'object' && !('pipe' in options.data)
          ? JSON.stringify(options.data) : options.data as RequestInit['body'];
        const response = await fetch('http://127.0.0.1:' + port + source.pathname + source.search, {
          method: options.method, headers: options.headers, body: body as RequestInit['body'],
          redirect: 'manual', duplex: 'half',
        } as RequestInit & { duplex: 'half' });
        return { status: response.status, headers: response.headers,
          data: response.status === 308 || response.status === 200 ? {} : await response.json() };
      };
      const result = await uploadResumableVideo({ request } as unknown as OAuth2Client, {
        channelId, videoPath, metadata: id.metadata, privacyStatus: 'private',
        containsSyntheticMedia: false, selfDeclaredMadeForKids: false,
      }, 10, decryptRefreshToken(next.receipt.sessionCiphertext!), {
        persistSession: async () => { throw new Error('new session was attempted'); },
        confirmedOffset: async offset => { expect(offset).toBe(0); },
        beforeBytes: async () => {},
      });
      await observePublishingSuccess(runId, id, result.youtubeVideoId);
      expect([sessions, submissions]).toEqual([1, 1]);
      expect((await readPublishingReceipt(runId))?.youtubeVideoId).toBe('restart-video-id');
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit'); child.kill(); await exited;
      }
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);
  it('fences a second process through the same database row', async () => {
    const runId = await makeRun();
    const owner = await claimPublishing(runId, identity());
    if (owner.kind !== 'acquired') throw new Error('no owner');
    const worker = path.resolve(__dirname, 'publishing-recovery.claim-worker.ts');
    const invoke = () => execFileSync(process.execPath, ['--import', 'tsx', worker, runId, JSON.stringify(identity())],
      { cwd: path.resolve(__dirname, '../../..'), encoding: 'utf8',
        env: { ...process.env, PUBLISHING_TEST_DB: '1' } });
    expect(invoke()).toContain('CLAIM=busy');
    await releasePublishing(runId, owner.token, false);
    expect(invoke()).toContain('CLAIM=acquired');
  });
  it('imports a consistent failed legacy ID, but parks conflicting IDs', async () => {
    const known = await makeRun();
    await prisma.pipelineStage.create({ data: { pipelineRunId: known, stageName: 'publishing',
      attemptNumber: 1, status: 'failed', output: { youtubeVideoId: 'legacy-video-id' } } });
    const imported = await claimPublishing(known, identity());
    expect(imported.kind).toBe('acquired');
    expect(imported.receipt.youtubeVideoId).toBe('legacy-video-id');
    const conflict = await makeRun();
    for (const [i, id] of ['first-id', 'second-id'].entries()) {
      await prisma.pipelineStage.create({ data: { pipelineRunId: conflict, stageName: 'publishing',
        attemptNumber: i + 1, status: 'failed', output: { youtubeVideoId: id } } });
    }
    expect((await claimPublishing(conflict, identity())).kind).toBe('ambiguous');
  });
  it('parks an unresolved transfer and still accepts its late confirmed ID', async () => {
    const runId = await makeRun();
    const owner = await claimPublishing(runId, identity());
    if (owner.kind !== 'acquired') throw new Error('no owner');
    await savePublishingSession(runId, owner.token, 'https://www.googleapis.com/upload/youtube/v3/videos?upload_id=fault');
    await mutatePublishingReceipt(runId, owner.token, () => ({ phase: 'uploading', uploadStarted: true }));
    await parkPublishingAmbiguous(runId, owner.token);
    expect((await claimPublishing(runId, identity())).kind).toBe('ambiguous');
    await observePublishingSuccess(runId, identity(), 'late-confirmed-id');
    expect((await readPublishingReceipt(runId))?.youtubeVideoId).toBe('late-confirmed-id');
    expect((await claimPublishing(runId, identity())).kind).toBe('acquired');
  });
  it('permits a failed metadata-only attempt explicitly marked before any session', async () => {
    const runId = await makeRun();
    await prisma.pipelineStage.create({ data: { pipelineRunId: runId, stageName: 'publishing',
      attemptNumber: 1, status: 'failed', output: { uploadNotStarted: true } } });
    expect((await claimPublishing(runId, identity())).kind).toBe('acquired');
  });
  it('commits receipt completion only with the surrounding stage transaction', async () => {
    const runId = await makeRun();
    const owner = await claimPublishing(runId, identity());
    if (owner.kind !== 'acquired') throw new Error('no owner');
    await observePublishingSuccess(runId, identity(), 'completed-id');
    await expect(prisma.$transaction(async tx => {
      await completePublishingReceipt(runId, owner.token, tx);
      throw new Error('stage completion failed');
    })).rejects.toThrow('stage completion failed');
    expect((await readPublishingReceipt(runId))?.phase).toBe('uploaded');
    await prisma.$transaction(async tx => { await completePublishingReceipt(runId, owner.token, tx); });
    expect((await readPublishingReceipt(runId))?.phase).toBe('complete');
  });
  it('fails closed on an unsupported or malformed stored receipt', async () => {
    const runId = await makeRun();
    await prisma.pipelineRun.update({ where: { id: runId }, data: { publishingRecovery: { version: 2 } } });
    await expect(claimPublishing(runId, identity())).rejects.toThrow(/Invalid or unsupported publishing receipt/);
    expect((await prisma.pipelineRun.findUniqueOrThrow({ where: { id: runId } })).publishingRecovery)
      .toEqual({ version: 2 });
  });
  it('rejects changed file or metadata identity', async () => {
    const runId = await makeRun();
    expect((await claimPublishing(runId, identity())).kind).toBe('acquired');
    expect((await claimPublishing(runId, { ...identity(), fileSha256: 'different' })).kind).toBe('mismatch');
  });
});
