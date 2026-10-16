import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, adminProcedure } from '../../trpc';
import { prisma } from '../../../models/prisma-client';
import { redact, writeAdminAudit } from '../../../models/repositories/admin-audit.repository';
import {
  failedStageDiagnostics,
  findRunIdentity,
  getRunStructureForAdmin,
  readRunBrief,
  readStageAttempts,
  stageHasBundle,
} from '../../../models/repositories/admin-runs.repository';
import { readPlannerDiagnostics } from '../../../models/repositories/admin-planner-diagnostics.repository';
import { getObjectText, getPresignedDownloadUrl, isR2Configured } from '../../../storage/r2-client';

// Keys dropped from any tenant content before it leaves the server.
const CONTENT_SECRET_KEYS = /token|secret|password|api[-_]?key/i;
export const CONTENT_MAX_BYTES = 200 * 1024;
// A bundle file link is short-lived: long enough to open, not to forward around.
export const BUNDLE_FILE_URL_TTL_SECONDS = 10 * 60;

type BundleManifest = { files: { name: string; key: string; contentType: string; bytes: number }[] };

// JSON content, redacted, capped. Over the cap the text is cut and flagged.
function shapeContent(value: unknown): { content: unknown; truncated: boolean } {
  const redacted = redact(value, CONTENT_SECRET_KEYS);
  const text = JSON.stringify(redacted);
  if (text !== undefined && Buffer.byteLength(text, 'utf8') > CONTENT_MAX_BYTES) {
    return { content: Buffer.from(text, 'utf8').subarray(0, CONTENT_MAX_BYTES).toString('utf8'), truncated: true };
  }
  return { content: redacted, truncated: false };
}

export const adminRunsRouter = router({
  // Structure only (DA-6): ids, statuses, stages, truncated errors, key names, costs,
  // bundle availability. Read-only, writes no audit row.
  get: adminProcedure.input(z.object({ runId: z.string().uuid() })).query(async ({ input }) => {
    const structure = await getRunStructureForAdmin(input.runId);
    if (!structure) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `PipelineRun ${input.runId} not found` });
    }
    return structure;
  }),

  // The ONLY admin procedure that returns tenant content. One call per view; the audit row
  // is written FIRST and, if that write fails, nothing is returned.
  content: adminProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        kind: z.enum(['brief', 'stage_output', 'bundle_manifest', 'bundle_file', 'planner_diagnostics']),
        attemptNumber: z.number().int().positive().optional(),
        stageName: z.string().min(1).max(50).optional(),
        file: z.string().min(1).max(200).optional(),
      }),
    )
    // A mutation, not a query: it has a side effect (the audit row), and a query would be cached
    // and re-fetched by the client, so a view could go unaudited or be audited twice.
    .mutation(async ({ input, ctx }) => {
      if (input.kind === 'stage_output' && !input.stageName) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'stageName is required for kind "stage_output"' });
      }
      if (input.kind === 'bundle_file' && !input.file) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'file is required for kind "bundle_file"' });
      }
      const run = await findRunIdentity(input.runId);
      if (!run) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `PipelineRun ${input.runId} not found` });
      }

      try {
        await prisma.$transaction((tx) =>
          writeAdminAudit(tx, {
            actor: ctx.admin,
            action: 'run.content_view',
            targetType: 'run',
            targetId: input.runId,
            tenantId: run.tenantId,
            after: { kind: input.kind, attemptNumber: input.attemptNumber, stageName: input.stageName, file: input.file },
          }),
        );
      } catch {
        // An unaudited content view is not allowed: no content leaves.
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Could not record the audit entry; no content returned' });
      }

      if (input.kind === 'brief') {
        const brief = await readRunBrief(input.runId);
        return { kind: input.kind, ...shapeContent(brief) };
      }

      if (input.kind === 'planner_diagnostics') {
        const diagnostics = await readPlannerDiagnostics(input.runId, input.attemptNumber);
        if (!diagnostics) throw new TRPCError({ code: 'NOT_FOUND', message: 'No video_generation attempt found for this run' });
        // Explicit fixed projection: generic secret-key redaction would erase token COUNTS.
        return { kind: input.kind, content: diagnostics, truncated: diagnostics.truncated };
      }

      const stages = await readStageAttempts(input.runId);
      if (input.kind === 'stage_output') {
        const matches = stages.filter(
          (s) => s.stageName === input.stageName && (input.attemptNumber === undefined || s.attemptNumber === input.attemptNumber),
        );
        const stage = matches[matches.length - 1];
        if (!stage) {
          throw new TRPCError({ code: 'NOT_FOUND', message: `No ${input.stageName} stage attempt found for run ${input.runId}` });
        }
        // A failed stage's output is the raw model reply kept for debugging; it never
        // leaves through an admin route (only its diagnostic keys do).
        const output = stage.status === 'failed' ? failedStageDiagnostics(stage.output) : stage.output;
        return { kind: input.kind, stageName: stage.stageName, attemptNumber: stage.attemptNumber, ...shapeContent(output) };
      }

      // bundle_manifest / bundle_file: same lookup runs.getAttemptBundle uses (latest
      // video_generation attempt with a manifest unless one is named).
      if (!isR2Configured()) {
        return { kind: input.kind, available: false as const };
      }
      const withBundle = stages.filter((s) => stageHasBundle(s.stageName, s.output));
      const stage = input.attemptNumber ? withBundle.find((s) => s.attemptNumber === input.attemptNumber) : withBundle[withBundle.length - 1];
      const manifestKey = (stage?.output as { r2ManifestKey?: string } | undefined)?.r2ManifestKey;
      if (!stage || !manifestKey) {
        return { kind: input.kind, available: false as const };
      }
      const manifest = JSON.parse(await getObjectText(manifestKey)) as BundleManifest;

      if (input.kind === 'bundle_manifest') {
        return { kind: input.kind, available: true as const, attemptNumber: stage.attemptNumber, ...shapeContent(manifest) };
      }
      const entry = manifest.files.find((f) => f.name === input.file);
      if (!entry) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `File ${input.file} is not in the attempt ${stage.attemptNumber} bundle` });
      }
      const url = await getPresignedDownloadUrl({ key: entry.key, expiresInSeconds: BUNDLE_FILE_URL_TTL_SECONDS });
      return {
        kind: input.kind,
        available: true as const,
        attemptNumber: stage.attemptNumber,
        file: entry.name,
        contentType: entry.contentType,
        bytes: entry.bytes,
        url,
        expiresAt: new Date(Date.now() + BUNDLE_FILE_URL_TTL_SECONDS * 1000).toISOString(),
      };
    }),
});
