import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { findLatestAttempt } from '../models/repositories/pipeline-stage.repository';
import { DATA_DIR } from '../config/paths';

// GET /runs/:id/video (BUSINESS_LOGIC.md Section 4, added 2026-09-09) — a
// plain REST route, not a tRPC procedure: tRPC's JSON-RPC shape isn't a fit
// for streaming file bytes with Range support, and the task docs describe
// this endpoint in REST terms specifically. Covered by the same global
// onRequest auth hook every other route goes through (server.ts) — no
// query-param token exception, per BUSINESS_LOGIC.md's explicit call-out.
//
// @fastify/static's decorated reply.sendFile() (built on the `send` package)
// handles Range/206/ETag/Last-Modified for us — registered with `serve:
// false` so it only provides that decoration, not its own auto-served
// wildcard route; this handler is what actually resolves :id to a real file
// path and answers 404 for a run with no generated video yet.
export async function registerVideoRoute(fastify: FastifyInstance): Promise<void> {
  await fastify.register(fastifyStatic, {
    root: path.resolve(DATA_DIR, 'videos'),
    serve: false,
  });

  fastify.get<{ Params: { id: string } }>('/runs/:id/video', async (request, reply) => {
    const stage = await findLatestAttempt(request.params.id, 'video_generation');
    const videoPath =
      stage?.status === 'completed'
        ? ((stage.output as { videoPath?: string } | null)?.videoPath ?? undefined)
        : undefined;

    if (!videoPath) {
      return reply.code(404).send({ error: 'no generated video for this run yet' });
    }

    return reply.sendFile(path.basename(videoPath), path.dirname(videoPath));
  });

  // Sprint 4 Task 10 (R3): the long-form Gate 2 preview copy and the subtitle file, served from the
  // local files when R2 is not configured (runs.get then returns these paths as previewUrl/subtitlesUrl).
  const sendReviewFile = (field: 'previewPath' | 'srtPath', contentType: string, filename?: string) =>
    async (request: { params: { id: string } }, reply: import('fastify').FastifyReply) => {
      const stage = await findLatestAttempt(request.params.id, 'video_review');
      const filePath =
        stage?.status === 'completed' ? ((stage.output as Record<string, string | undefined> | null)?.[field] ?? undefined) : undefined;
      if (!filePath) return reply.code(404).send({ error: 'not available for this run yet' });
      if (filename) reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      reply.type(contentType);
      return reply.sendFile(path.basename(filePath), path.dirname(filePath));
    };
  fastify.get<{ Params: { id: string } }>('/runs/:id/preview', sendReviewFile('previewPath', 'video/mp4'));
  fastify.get<{ Params: { id: string } }>('/runs/:id/subtitles', sendReviewFile('srtPath', 'application/x-subrip', 'captions.srt'));
}
