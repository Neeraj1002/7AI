import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure } from '../trpc';
import { findPipelineRunById, listRuns } from '../../models/repositories/pipeline-run.repository';
import { createRun } from '../../run-pipeline/state-machine';
import { listStagesForRun } from '../../models/repositories/pipeline-stage.repository';
import { listReviewLogsForRun } from '../../models/repositories/review-log.repository';
import { findChannelById } from '../../models/repositories/channel.repository';
import { startPipelineInBackground } from '../../run-pipeline/pipeline-runner';
import { founderChannel } from '../../notify-founder';
import { TTS_VOICE_KEYS } from '../../media';
import { VISUAL_SOURCES, AUDIO_LAYERS } from '../../agents/video-generation/plan';
import { MVP_TENANT_ID, PIPELINE_RUN_STATUSES, STAGE_NAMES } from '../../types';

async function getRunDetail(id: string) {
  const run = await findPipelineRunById(id);
  if (!run) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `PipelineRun ${id} not found` });
  }
  const [channel, stages, reviewLogs] = await Promise.all([
    findChannelById(run.channelId),
    listStagesForRun(id),
    listReviewLogsForRun(id),
  ]);
  return { run, channel, stages, reviewLogs };
}

export const runsRouter = router({
  // POST /runs — BUSINESS_LOGIC.md Section 2. Creates the row, then drives it
  // in the background (pipeline-runner.ts) rather than leaving it sitting at
  // 'pending' forever — nothing else in this codebase currently starts a
  // 'pending' run on its own (resume-on-startup.ts only ever resumes
  // 'running' ones).
  create: publicProcedure
    .input(
      z.object({
        channelId: z.string().uuid(),
        briefText: z.string().min(1),
        // Sprint 2 Task 1 (D2) — an explicit, structured choice, validated
        // against media/registry.ts's known TTS_VOICES keys right here at
        // the API edge (Failure Modes: reject bad structured input at the
        // edge, not deep in the pipeline). Never passed through
        // parse-brief.ts's LLM call — that's the whole point of this field
        // existing separately from briefText.
        voice: z.enum(TTS_VOICE_KEYS).optional(),
        // Sprint 2 Task 2 (E2) — same edge-validation posture as voice:
        // rejected here (a structured tRPC input error) if it doesn't match
        // a real visualSource, never passed through as free text for
        // parse-brief.ts or the planning LLM to interpret loosely.
        visualSource: z.enum(VISUAL_SOURCES).optional(),
        // Sprint 2 Task 3 (F1) — same edge-validation posture as
        // voice/visualSource: rejected here if it doesn't match a real mood
        // tag (or "none"), never passed through as free text.
        audioLayer: z.enum(AUDIO_LAYERS).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const channel = await findChannelById(input.channelId);
      if (!channel) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Channel ${input.channelId} not found` });
      }
      const creationOptions =
        input.voice || input.visualSource || input.audioLayer
          ? {
              ...(input.voice && { voice: input.voice }),
              ...(input.visualSource && { visualSource: input.visualSource }),
              ...(input.audioLayer && { audioLayer: input.audioLayer }),
            }
          : undefined;
      const run = await createRun({
        tenantId: MVP_TENANT_ID,
        channelId: input.channelId,
        briefText: input.briefText,
        creationOptions,
      });
      startPipelineInBackground(run.id);
      return run;
    }),

  // GET /runs — Queue screen (Task 2): filterable by status/stage.
  list: publicProcedure
    .input(
      z.object({
        statuses: z.array(z.enum(PIPELINE_RUN_STATUSES)).optional(),
        stage: z.enum(STAGE_NAMES).optional(),
        channelId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ input }) => {
      return listRuns(input);
    }),

  // GET /runs/:id — full detail: run + channel + full stage history +
  // review logs (script, video, gate decisions all live here).
  get: publicProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input }) => {
    return getRunDetail(input.id);
  }),

  // POST /runs/:id/gate1 — resolves a pending Gate 1 through the same
  // resolution primitive a Telegram reply uses (FounderChannel.
  // resolvePendingApproval), converting the structured action into the exact
  // raw reply-string grammar agents/gate1/index.ts's parseGateReply already
  // parses (approve / "reject <reason>" / free text = edit) — no duplicate
  // parsing logic here.
  gate1: publicProcedure
    .input(
      z.discriminatedUnion('action', [
        z.object({ runId: z.string().uuid(), action: z.literal('approve') }),
        z.object({ runId: z.string().uuid(), action: z.literal('reject'), reason: z.string().min(1) }),
        z.object({ runId: z.string().uuid(), action: z.literal('edit'), editedScriptText: z.string().min(1) }),
      ]),
    )
    .mutation(async ({ input }) => {
      const replyText =
        input.action === 'approve'
          ? 'approve'
          : input.action === 'reject'
            ? `reject ${input.reason}`
            : input.editedScriptText;

      const { resolved } = founderChannel.resolvePendingApproval(input.runId, replyText);
      if (!resolved) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Gate 1 for run ${input.runId} is not currently pending (already resolved, or not open yet)`,
        });
      }
      return { resolved: true };
    }),

  // POST /runs/:id/gate2 — same pattern as gate1, against
  // agents/gate2/index.ts's parseGate2Reply grammar (approve / "reject
  // <reason>" / free text = revision notes).
  gate2: publicProcedure
    .input(
      z.discriminatedUnion('action', [
        z.object({ runId: z.string().uuid(), action: z.literal('approve') }),
        z.object({ runId: z.string().uuid(), action: z.literal('reject'), reason: z.string().min(1) }),
        z.object({ runId: z.string().uuid(), action: z.literal('revise'), notes: z.string().min(1) }),
      ]),
    )
    .mutation(async ({ input }) => {
      const replyText =
        input.action === 'approve'
          ? 'approve'
          : input.action === 'reject'
            ? `reject ${input.reason}`
            : input.notes;

      const { resolved } = founderChannel.resolvePendingApproval(input.runId, replyText);
      if (!resolved) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Gate 2 for run ${input.runId} is not currently pending (already resolved, or not open yet)`,
        });
      }
      return { resolved: true };
    }),
});
