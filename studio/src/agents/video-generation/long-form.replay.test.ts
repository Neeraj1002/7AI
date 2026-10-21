import { describe, it, expect, vi, afterAll } from 'vitest';

// Sprint 5 Task 8 (R3): replay of E2 with the real long-form render (stub narration and stub pictures, real
// FFmpeg). One scene was longer than the shot limit and the whole video, pictures included, was made again.
// Now the limit is checked on the plan before any picture, and the repair makes no picture it already has.
vi.hoisted(() => {
  process.env.MEDIA_STUB = '1';
  process.env.AI_VISUALS_STUB = '1';
  process.env.STOCK_FOOTAGE_STUB = '1';
});

// The stub pictures do not report paid calls or keep a cache. The real client keeps a per-run cache keyed by the
// final prompt text (ai-visuals/cache.ts stillCacheKey) and calls the provider only for a prompt it has not
// seen. This stand-in applies that same rule on top of the stub pictures, so "picture calls" below means
// "prompts the run's cache had not seen".
const seenPrompts = vi.hoisted(() => new Map<string, Set<string>>());
const callsLog = vi.hoisted(() => ({ fresh: 0 }));
vi.mock('../../ai-visuals', async () => {
  const stub = await import('../../ai-visuals/stub');
  return {
    generateStills: async (params: { scenePrompts: string[]; cacheDir?: string; onStillGenerated?: (info: { index: number; costUsd: number; model: string }) => Promise<void> | void } & Record<string, unknown>) => {
      const seen = seenPrompts.get(params.cacheDir ?? '') ?? new Set<string>();
      seenPrompts.set(params.cacheDir ?? '', seen);
      const result = await stub.stubGenerateStills(params as never);
      for (const [i, prompt] of params.scenePrompts.entries()) {
        if (seen.has(prompt)) continue;
        seen.add(prompt);
        callsLog.fresh += 1;
        await params.onStillGenerated?.({ index: i, costUsd: 0.0053, model: 'gpt-image-2.5-flare-2026-09-08' });
      }
      return result;
    },
  };
});

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA_DIR } from '../../config/paths';
import { removeRunWorkFiles } from '../../ai-visuals/cache';
import { qualityProfileFor } from './quality-spec';
import { generateLongVideo } from './long-form';
import type { ProductionPlan } from './plan';

const runIds: string[] = [];
afterAll(async () => {
  for (const id of runIds) {
    await removeRunWorkFiles(id);
    await fs.rm(path.join(DATA_DIR, 'videos', id), { recursive: true, force: true });
  }
});

const words = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);
const chapters = [
  { title: 'One', text: words('brick', 45).join(' ') }, // about 29 s at the stub pace
  { title: 'Two', text: words('stone', 15).join(' ') }, // about 10 s
];
const MAX_SHOT = qualityProfileFor('long', 5).maxShotSeconds; // 7.5

function plan(starts: number[], extra: Partial<ProductionPlan> = {}): ProductionPlan {
  const first = starts.map((w, k) => ({ chapterIndex: 0, words: words('brick', 45).slice(w, w + 3).join(' '), prompt: `brick scene ${k}` }));
  const second = [0, 7].map((w, k) => ({ chapterIndex: 1, words: words('stone', 15).slice(w, w + 3).join(' '), prompt: `stone scene ${k}` }));
  const longScenes = [...first, ...second];
  return {
    visualSource: 'ai-stills', stockFootageQuery: 'x', captionStyle: 'sentence-grouped', audioLayer: 'none', pacingNotes: 'p', rationale: 'r',
    stillScenePrompts: longScenes.map((s) => s.prompt), longScenes, ...extra,
  };
}

async function render(runId: string, p: ProductionPlan, attemptNumber: number, maxShotSeconds?: number) {
  let stills = 0;
  let narration = 0;
  const result = await generateLongVideo({
    pipelineRunId: runId, attemptNumber, chapters, plan: p, voice: 'coral',
    ...(maxShotSeconds && { maxShotSeconds }),
    onStillPaid: async () => { stills += 1; },
    onNarrationPaid: async () => { narration += 1; },
  });
  return { result, stills, narration };
}

describe('long video: shot limit on the plan, and the repair makes no picture it already has', () => {
  it('one scene over the limit is retimed before any picture; attempt 2 of the replay makes zero picture calls', async () => {
    const runId = randomUUID();
    runIds.push(runId);
    // Chapter 1: scenes open at words 0, 25, 30 and 38, so the first one holds for about 16 s.
    const p = plan([0, 25, 30, 38]);
    const first = await render(runId, p, 1, MAX_SHOT);
    const shot = first.result.usage.metadata.shotPlan!;
    expect(shot.longestBefore).toBeGreaterThan(MAX_SHOT);
    expect(shot.longestAfter).toBeLessThanOrEqual(MAX_SHOT);
    expect(shot.addedScenes).toBe(0);
    expect(first.result.output.plan!.longScenes).toHaveLength(6);
    expect(first.stills).toBe(6);

    // The review of attempt 1 found nothing wrong with the pictures; a timing repair reuses the plan.
    const second = await render(runId, first.result.output.plan!, 2, MAX_SHOT);
    expect(second.stills).toBe(0);
    expect(second.narration).toBe(0);
    expect(second.result.output.durationSeconds).toBeCloseTo(first.result.output.durationSeconds, 1);
    console.log(`[replay] picture calls per attempt: before this change 6 then 6 (new plan); after: ${first.stills} then ${second.stills}`);
  }, 300_000);

  it('a chapter with too few scenes gets exactly the missing scenes, and only those are new pictures', async () => {
    const runId = randomUUID();
    runIds.push(runId);
    // Chapter 1 has three scenes for about 29 s, which cannot meet the limit; it needs four.
    const p = plan([0, 15, 30]);
    const without = await render(runId, p, 1); // what happened before: no check, three long scenes
    expect(without.stills).toBe(5);
    const withCheck = await render(runId, p, 2, MAX_SHOT);
    expect(withCheck.result.usage.metadata.shotPlan!.addedScenes).toBe(1);
    expect(withCheck.result.output.plan!.longScenes).toHaveLength(6);
    expect(withCheck.result.usage.metadata.shotPlan!.longestAfter).toBeLessThanOrEqual(MAX_SHOT);
    expect(withCheck.stills).toBe(1);
    console.log(`[replay] one scene added: ${withCheck.stills} new picture call, the other ${6 - withCheck.stills} came from the run's cache`);
  }, 300_000);
});
