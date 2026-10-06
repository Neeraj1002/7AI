import { prisma } from '../prisma-client';

// Admin Sprint 1 (R9) - the run inspector's STRUCTURE view (DA-6). The response
// built from this file never carries a brief, intake data, a stage input/output
// body, a review rationale, a script, a transcript or a plan: only ids, statuses,
// timings, truncated error text, key NAMES, numbers and costs. Stage output is
// read server-side only to derive key names, the quality metrics and bundle
// availability; it is never passed through. Tenant content has exactly one
// route: admin.runs.content, which audits first.

const LAST_ERROR_MAX = 500;
const STAGE_REASON_MAX = 300;
const METRIC_STRING_MAX = 120;

const truncate = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max)}...` : text);
const num = (d: { toString(): string } | null | undefined): number => (d ? Number(d) : 0);

// Numbers, booleans and short strings only. An array of strings (softWarnings) is
// joined into one short string; any other nested value is dropped. The response
// therefore cannot carry a nested object or a long string.
export function sanitizeQualityMetrics(value: unknown): Record<string, number | boolean | string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: Record<string, number | boolean | string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') out[k] = truncate(v, METRIC_STRING_MAX);
    else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) out[k] = truncate(v.join('; '), METRIC_STRING_MAX);
  }
  return Object.keys(out).length > 0 ? out : null;
}

// The documented reason/error/message keys only; the stage's own `error` column
// (budget refusals and failures put their text there) wins.
function stageReason(errorColumn: string | null, output: unknown): string | null {
  if (errorColumn) return truncate(errorColumn, STAGE_REASON_MAX);
  if (output && typeof output === 'object' && !Array.isArray(output)) {
    const o = output as Record<string, unknown>;
    for (const key of ['reason', 'error', 'message']) {
      if (typeof o[key] === 'string' && o[key]) return truncate(o[key] as string, STAGE_REASON_MAX);
    }
  }
  return null;
}

const objectKeys = (v: unknown): string[] =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v as Record<string, unknown>).sort() : [];

// Same predicate runs.get uses for hasR2Bundle: a video_generation attempt whose output
// recorded a manifest key.
export function stageHasBundle(stageName: string, output: unknown): boolean {
  return (
    stageName === 'video_generation' &&
    Boolean(output && typeof output === 'object' && (output as { r2ManifestKey?: unknown }).r2ManifestKey)
  );
}

export async function getRunStructureForAdmin(runId: string) {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: runId },
    // briefText and intakeParsed are deliberately not selected.
    select: {
      id: true,
      tenantId: true,
      channelId: true,
      status: true,
      currentStage: true,
      lastError: true,
      createdAt: true,
      updatedAt: true,
      creationOptions: true,
      channel: { select: { name: true } },
      tenant: { select: { name: true } },
    },
  });
  if (!run) return null;

  const [stages, usage, gateLogs] = await Promise.all([
    prisma.pipelineStage.findMany({
      where: { pipelineRunId: runId },
      orderBy: [{ createdAt: 'asc' }, { attemptNumber: 'asc' }],
      // `input` is deliberately not selected. `output` is read only to derive key names,
      // quality metrics and bundle availability.
      select: { id: true, stageName: true, attemptNumber: true, status: true, startedAt: true, completedAt: true, error: true, output: true },
    }),
    prisma.usageEvent.findMany({
      where: { pipelineRunId: runId },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true, agent: true, provider: true, model: true, costUsd: true, metadata: true },
    }),
    // rationale and editedOutput are deliberately not selected.
    prisma.reviewLog.findMany({
      where: { pipelineRunId: runId, stageId: { not: null } },
      orderBy: { timestamp: 'asc' },
      select: { stageId: true, verdict: true, timestamp: true },
    }),
  ]);

  const gateByStageId = new Map<string, 1 | 2>();
  for (const s of stages) {
    if (s.stageName === 'gate1') gateByStageId.set(s.id, 1);
    else if (s.stageName === 'gate2') gateByStageId.set(s.id, 2);
  }

  return {
    run: {
      id: run.id,
      tenantId: run.tenantId,
      tenantName: run.tenant.name,
      channelId: run.channelId,
      channelName: run.channel.name,
      status: run.status,
      currentStage: run.currentStage,
      lastError: run.lastError === null ? null : truncate(run.lastError, LAST_ERROR_MAX),
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
      creationOptionKeys: objectKeys(run.creationOptions),
      // No column exists until Sprint 4 Task 1 (voice/profile versions) lands.
      profileVersionId: null as string | null,
    },
    stages: stages.map((s) => ({
      stageName: s.stageName,
      attemptNumber: s.attemptNumber,
      status: s.status,
      startedAt: s.startedAt ? s.startedAt.toISOString() : null,
      finishedAt: s.completedAt ? s.completedAt.toISOString() : null,
      reason: stageReason(s.error, s.output),
      outputKeys: objectKeys(s.output),
      qualityMetrics:
        s.stageName === 'video_review' && s.output && typeof s.output === 'object'
          ? sanitizeQualityMetrics((s.output as { qualityMetrics?: unknown }).qualityMetrics)
          : null,
    })),
    usage: usage.map((u) => ({
      at: u.createdAt.toISOString(),
      agent: u.agent,
      provider: u.provider,
      model: u.model,
      costUsd: num(u.costUsd),
      zeroCost: num(u.costUsd) === 0,
      metadataKeys: objectKeys(u.metadata),
    })),
    totals: {
      costUsd: usage.reduce((sum, u) => sum + num(u.costUsd), 0),
      events: usage.length,
      zeroCostEvents: usage.filter((u) => num(u.costUsd) === 0).length,
    },
    // decidedByUserId is omitted: review_logs has no column recording who decided
    // (human decisions are logged as agent 'human', not as a user id).
    gates: gateLogs
      .filter((l) => l.stageId !== null && gateByStageId.has(l.stageId))
      .map((l) => ({ gate: gateByStageId.get(l.stageId as string) as 1 | 2, decision: l.verdict, at: l.timestamp.toISOString() })),
    bundle: {
      attempts: stages.filter((s) => stageHasBundle(s.stageName, s.output)).map((s) => s.attemptNumber),
    },
  };
}

// For admin.runs.content: the run row (tenant id for the audit row) without any content.
export async function findRunIdentity(runId: string): Promise<{ id: string; tenantId: string } | null> {
  return prisma.pipelineRun.findUnique({ where: { id: runId }, select: { id: true, tenantId: true } });
}

// The ONLY reads of tenant content in the admin module. Called by admin.runs.content
// after its audit row has been written.
export async function readRunBrief(runId: string): Promise<{ briefText: string; intakeParsed: unknown } | null> {
  return prisma.pipelineRun.findUnique({ where: { id: runId }, select: { briefText: true, intakeParsed: true } });
}

export async function readStageAttempts(
  runId: string,
): Promise<{ stageName: string; attemptNumber: number; status: string; output: unknown }[]> {
  return prisma.pipelineStage.findMany({
    where: { pipelineRunId: runId },
    orderBy: [{ createdAt: 'asc' }, { attemptNumber: 'asc' }],
    select: { stageName: true, attemptNumber: true, status: true, output: true },
  });
}
