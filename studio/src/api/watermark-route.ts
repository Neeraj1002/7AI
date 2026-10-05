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
import { DATA_DIR } from '../config/paths';
import { env } from '../config/env';
import { isR2Configured, uploadToR2, deleteFromR2 } from '../storage/r2-client';

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

const WATERMARK_DIR = path.resolve(DATA_DIR, 'watermarks');
const MAX_WATERMARK_BYTES = 1024 * 1024;
const ALLOWED_MIME_TO_EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg' };

async function deleteExistingWatermarkFile(channelId: string): Promise<void> {
  for (const ext of Object.values(ALLOWED_MIME_TO_EXT)) {
    await fs.rm(path.join(WATERMARK_DIR, `${channelId}.${ext}`), { force: true });
  }
}

// Sprint 3 Task 12 (R4) — mirror the local watermark to R2 alongside the
// existing local read/write, best-effort, never failing the request or
// changing its response shape. Local storage stays the source of truth
// (video-generation's own FFmpeg overlay keeps reading the local path,
// unchanged) — this is a durability/external-visibility copy only.
function watermarkR2Key(tenantId: string, channelId: string, ext: string): string {
  return `watermarks/${env.NODE_ENV}/${tenantId}/${channelId}.${ext}`;
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

    // Sprint 3 Task 12 (R4) — best-effort R2 mirror, after the local write/
    // DB update above have already succeeded. Never fails the request or
    // changes its response shape.
    if (isR2Configured()) {
      const r2Key = watermarkR2Key(channel.tenantId, channel.id, ext);
      try {
        await uploadToR2({ key: r2Key, filePath, contentType: file.mimetype });
        await updateChannelBrandAssets(channel.id, { watermarkR2Key: r2Key });
      } catch (error) {
        console.error(
          `[watermark-route] channel ${channel.id}: R2 mirror upload failed (non-blocking, local watermark already saved) — ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

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
    await updateChannelBrandAssets(channel.id, { watermarkUrl: undefined, watermarkR2Key: undefined });

    // Sprint 3 Task 12 (R4) — best-effort R2 mirror delete, after the local
    // delete/DB update above have already succeeded. The extension may have
    // changed between uploads (e.g. png -> jpg) — same defensive
    // both-extensions pattern deleteExistingWatermarkFile already uses
    // locally, since this route doesn't otherwise know which one is live.
    if (isR2Configured()) {
      for (const ext of Object.values(ALLOWED_MIME_TO_EXT)) {
        try {
          await deleteFromR2({ key: watermarkR2Key(channel.tenantId, channel.id, ext) });
        } catch (error) {
          console.error(
            `[watermark-route] channel ${channel.id}: R2 mirror delete (.${ext}) failed (non-blocking, local watermark already removed) — ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }

    return reply.send({ success: true });
  });
}
