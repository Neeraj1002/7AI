import { prisma } from '../prisma-client';
import type { Prisma, ReviewLog as PrismaReviewLog } from '@prisma/client';
import type { DbClient } from './pipeline-stage.repository';
import type { CreateReviewLogInput, ReviewLog } from '../../types';

function toDomainReviewLog(row: PrismaReviewLog): ReviewLog {
  return {
    id: row.id,
    tenantId: row.tenantId,
    channelId: row.channelId,
    pipelineRunId: row.pipelineRunId,
    stageId: row.stageId,
    agent: row.agent,
    verdict: row.verdict,
    rationale: row.rationale,
    editedOutput: (row.editedOutput as Record<string, unknown> | null) ?? null,
    timestamp: row.timestamp,
  };
}

export async function insertReviewLog(input: CreateReviewLogInput, client: DbClient = prisma): Promise<ReviewLog> {
  const row = await client.reviewLog.create({
    data: {
      tenantId: input.tenantId,
      channelId: input.channelId,
      pipelineRunId: input.pipelineRunId,
      stageId: input.stageId,
      agent: input.agent,
      verdict: input.verdict,
      rationale: input.rationale,
      editedOutput: input.editedOutput as Prisma.InputJsonValue | undefined,
    },
  });
  return toDomainReviewLog(row);
}

export async function listReviewLogsForRun(pipelineRunId: string): Promise<ReviewLog[]> {
  const rows = await prisma.reviewLog.findMany({
    where: { pipelineRunId },
    orderBy: { timestamp: 'asc' },
  });
  return rows.map(toDomainReviewLog);
}

// Bugs Task 6 (R2) — a budget refusal mid-retry doesn't run a fresh review
// (nothing to insert a new ReviewLog row for), so the "why this reached
// Gate 1 despite a low score" note gets appended onto the existing most
// recent review's own rationale in place, mirroring the cap-reached case's
// note (which is baked into a freshly-inserted row instead, since that case
// does have a fresh review to attach it to).
export async function updateReviewLogRationale(
  id: string,
  rationale: string,
  client: DbClient = prisma,
): Promise<ReviewLog> {
  const row = await client.reviewLog.update({ where: { id }, data: { rationale } });
  return toDomainReviewLog(row);
}
