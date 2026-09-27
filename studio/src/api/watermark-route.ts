import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { findChannelById, updateChannelBrandAssets } from '../models/repositories/channel.repository';
import { canResolveGate } from '../run-pipeline/gate-ownership';
import { resolveRequestIdentity } from '../auth';
import { MVP_TENANT_ID } from '../types';
import type { Context } from './trpc';

// Sprint 3 Task 9 (R3) — same "binary content doesn't fit tRPC's JSON-RPC
// shape" reasoning video-route.ts already established, applied to upload as
// well as serving: a plain REST route, covered by the same global onRequest
// auth hook (server.ts) every other route goes through — no exception.
//
// Identity is resolved the same way api/trpc.ts's createContext does (this
// route has no tRPC ctx to reuse), since Fastify's hook and this handler are
// separate mechanisms with no shared per-request state — same posture
// trpc.ts's own comment already documents for why that duplication exists.
function resolveContext(authorization: string | undefined): Context {
  const identity = resolveRequestIdentity(authorization);
  if (identity.kind === 'session') {
    return { tenantId: identity.tenantId, userId: identity.userId, role: identity.role };
  }
  return { tenantId: MVP_TENANT_ID, userId: null, role: 'owner' };
}

const WATERMARK_DIR = path.resolve(process.cwd(), 'data', 'watermarks');
const MAX_WATERMARK_BYTES = 1024 * 1024;
const ALLOWED_MIME_TO_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg' };

async function deleteExistingWatermarkFile(channelId: string): Promise<void> {
  for (const ext of Object.values(ALLOWED_MIME_TO_EXT)) {
    await fs.rm(path.join(WATERMARK_DIR, `${channelId}.${ext}`), { force: true });
  }
}

export async function registerWatermarkRoute(fastify: FastifyInstance): Promise<void> {
  await fs.mkdir(WATERMARK_DIR, { recursive: true });
  await fastify.register(fastifyStatic, { root: WATERMARK_DIR, serve: false, decorateReply: false });

  fastify.post<{ Params: { id: string } }>('/channels/:id/watermark', async (request, reply) => {
    const ctx = resolveContext(request.headers.authorization);
    const channel = await findChannelById(request.params.id);
    if (!channel || channel.tenantId !== ctx.tenantId) {
      return reply.code(404).send({ error: `Channel ${request.params.id} not found` });
    }
    if (!canResolveGate(ctx, channel)) {
      return reply.code(403).send({ error: `You are not allowed to manage channel ${request.params.id}` });
    }

    const file = await request.file({ limits: { fileSize: MAX_WATERMARK_BYTES } });
    if (!file) {
      return reply.code(400).send({ error: 'No file uploaded (expected a single multipart file field)' });
    }
    const ext = ALLOWED_MIME_TO_EXT[file.mimetype];
    if (!ext) {
      // Drain the stream so Fastify doesn't hang waiting for it — rejecting
      // before reading it fully must not leave a half-consumed request.
      await file.toBuffer().catch(() => undefined);
      return reply.code(400).send({ error: 'Only image/png or image/jpeg watermarks are accepted' });
    }

    const buffer = await file.toBuffer();
    if (file.file.truncated || buffer.byteLength > MAX_WATERMARK_BYTES) {
      return reply.code(400).send({ error: 'Watermark must be 1MB or smaller' });
    }

    // Delete any existing watermark file first — avoids an orphaned file
    // left behind if the extension changes between uploads (e.g. png -> jpg).
    await deleteExistingWatermarkFile(channel.id);
    const filePath = path.join(WATERMARK_DIR, `${channel.id}.${ext}`);
    await fs.writeFile(filePath, buffer);

    // The stored value stays a local fs path — that's what video-generation
    // already consumes unmodified; the HTTP path returned to the app is a
    // separate, derived value, not what's persisted.
    await updateChannelBrandAssets(channel.id, { watermarkUrl: filePath });
    return reply.send({ watermarkUrl: `/channels/${channel.id}/watermark` });
  });

  fastify.get<{ Params: { id: string } }>('/channels/:id/watermark', async (request, reply) => {
    const ctx = resolveContext(request.headers.authorization);
    const channel = await findChannelById(request.params.id);
    if (!channel || channel.tenantId !== ctx.tenantId) {
      return reply.code(404).send({ error: `Channel ${request.params.id} not found` });
    }
    const watermarkPath = channel.brandAssets.watermarkUrl;
    if (!watermarkPath || !fsSync.existsSync(watermarkPath)) {
      return reply.code(404).send({ error: 'No watermark set for this channel' });
    }
    return reply.sendFile(path.basename(watermarkPath), path.dirname(watermarkPath));
  });

  fastify.delete<{ Params: { id: string } }>('/channels/:id/watermark', async (request, reply) => {
    const ctx = resolveContext(request.headers.authorization);
    const channel = await findChannelById(request.params.id);
    if (!channel || channel.tenantId !== ctx.tenantId) {
      return reply.code(404).send({ error: `Channel ${request.params.id} not found` });
    }
    if (!canResolveGate(ctx, channel)) {
      return reply.code(403).send({ error: `You are not allowed to manage channel ${request.params.id}` });
    }
    await deleteExistingWatermarkFile(channel.id);
    await updateChannelBrandAssets(channel.id, { watermarkUrl: undefined });
    return reply.send({ success: true });
  });
}
