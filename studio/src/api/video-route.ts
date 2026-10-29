import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { findLatestAttempt, listStagesForRun } from '../models/repositories/pipeline-stage.repository';
import { findPipelineRunById } from '../models/repositories/pipeline-run.repository';
import { resolveRequestIdentity, verifyThumbnailLinkToken } from '../auth';
import { MVP_TENANT_ID } from '../types';
import { readPackaging } from '../run-pipeline/packaging-stage';
import { OPENING_FRAME_FILE, OPENING_PACKAGE_ID, thumbnailFileFor } from '../packaging/view';
import { thumbnailsDir } from '../packaging/build';
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

  // Sprint 6 Task 1 (R5, R6): one thumbnail of a run's Gate 2 packages, in one of three sizes. Unlike the video
  // routes above this one checks that the run belongs to the caller's tenant (the packaging task's own rule), and
  // takes the file name from the stored record, never from the request. `?download=1` sends it as a download.
  fastify.get<{ Params: { id: string; packageId: string; size: string }; Querystring: { download?: string; t?: string } }>(
    '/runs/:id/thumbnail/:packageId/:size',
    async (request, reply) => {
      // Either the caller's own session (or the ops token), or a signed link minted by runs.packaging for exactly
      // this run, package and size. A link never reaches another tenant's run: the tenant in it must match the run.
      const identity = resolveRequestIdentity(request.headers.authorization);
      const link = request.query.t ? verifyThumbnailLinkToken(request.query.t) : null;
      const linkMatches = Boolean(link && link.runId === request.params.id && link.packageId === request.params.packageId && link.size === request.params.size);
      const tenantId = linkMatches ? link!.tenantId : identity.kind === 'session' ? identity.tenantId : identity.kind === 'ops-token' ? MVP_TENANT_ID : null;
      const run = await findPipelineRunById(request.params.id);
      if (!tenantId || !run || run.tenantId !== tenantId) return reply.code(404).send({ error: 'not available for this run' });
      const stages = await listStagesForRun(run.id);
      const packaging = [...stages].reverse().filter((st) => st.stageName === 'gate2').map((st) => readPackaging(st.output)).find(Boolean) ?? null;
      // A Short's first frame (R7) is not a package record: it is the one file kept for its opening.
      const file = request.params.packageId === OPENING_PACKAGE_ID && request.params.size === 'frame' && run.creationOptions?.opening
        ? { dir: thumbnailsDir(run.id), name: OPENING_FRAME_FILE }
        : thumbnailFileFor(run.id, packaging, request.params.packageId, request.params.size);
      if (!file) return reply.code(404).send({ error: 'not available for this run' });
      if (request.query.download) reply.header('Content-Disposition', `attachment; filename="${run.id}-${request.params.packageId}-${request.params.size}.jpg"`);
      reply.type('image/jpeg');
      return reply.sendFile(file.name, file.dir);
    },
  );
}
