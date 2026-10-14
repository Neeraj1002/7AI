import crypto from 'node:crypto';
import { resolvePurpose } from '../llm';
import { ProductionPlanSchema, type ProductionPlan } from '../agents/video-generation/plan';
import { isEligibleRecovery } from './manual-retries';
import type { PipelineStage } from '../types';

export function planCheckpointHash(inputs: Record<string, unknown>): string {
  return crypto.createHash('sha256').update(JSON.stringify({ version: 1, planner: resolvePurpose('video-production-planning'), ...inputs })).digest('hex');
}

export function reusableLongPlan(stage: Pick<PipelineStage, 'status' | 'output'> | null, inputHash: string): ProductionPlan | undefined {
  if (!isEligibleRecovery(stage)) return undefined;
  const saved = (stage?.output as { recoveryPlan?: { inputHash?: unknown; plan?: unknown } } | null)?.recoveryPlan;
  if (saved?.inputHash !== inputHash) return undefined;
  const parsed = ProductionPlanSchema.safeParse(saved.plan);
  if (!parsed.success || parsed.data.visualSource !== 'ai-stills' || !parsed.data.longScenes?.length) return undefined;
  return parsed.data;
}
