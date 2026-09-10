import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { findLatestAttempt } from '../models/repositories/pipeline-stage.repository';

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
    root: path.resolve(process.cwd(), 'data', 'videos'),
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
}
