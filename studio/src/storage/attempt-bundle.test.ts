import { describe, it, expect, vi } from 'vitest';

// Stub every external provider BEFORE config/env is first imported.
vi.hoisted(() => {
  process.env.MEDIA_STUB = '1';
  process.env.STOCK_FOOTAGE_STUB = '1';
  process.env.AI_VISUALS_STUB = '1';
});

const uploads: Array<{ key: string; filePath: string; contentType: string }> = [];
vi.mock('./r2-client', () => ({
  uploadToR2: async (p: { key: string; filePath: string; contentType: string }) => {
    uploads.push(p);
  },
}));

import fs from 'node:fs/promises';
import path from 'node:path';
import { generateVideo } from '../agents/video-generation';
import { measureQualityMetrics } from '../agents/video-intelligence/quality-metrics';
import { CAPTION_FONT_FAMILY, CAPTION_FONT_FILE } from '../agents/video-generation/captions-ass';
import { uploadAttemptBundle } from './attempt-bundle';
import type { ProductionPlan } from '../agents/video-generation/plan';

// Sprint 4 Task 8 — Task 13's debug bundle must still assemble after the
// renderer rewrite: captions.ass (text/x-ssa) replaces captions.srt, the
// stock shot list replaces the single stock clip, and manifest.json carries
// the bundled font and the quality metrics.
describe('uploadAttemptBundle with the Task 8 renderer (all providers stubbed)', () => {
  const script = 'Octopuses have three hearts. Two pump blood to the gills, and one serves the body.';
  const base = { captionStyle: 'phrase-grouped', audioLayer: 'none', pacingNotes: 'n', rationale: 'r' } as const;
  const plans: Record<string, ProductionPlan> = {
    stock: { ...base, visualSource: 'stock-footage', stockFootageQuery: 'ocean', stockFootageQueries: ['ocean', 'coral', 'diver'] },
    stills: { ...base, visualSource: 'ai-stills', stockFootageQuery: 'ocean', stillScenePrompts: ['a', 'b', 'c', 'd', 'e', 'f'] },
  };

  for (const kind of ['stock', 'stills'] as const) {
    it(`assembles the bundle for a ${kind} render`, async () => {
      uploads.length = 0;
      const { output, usage, artifacts } = await generateVideo({
        pipelineRunId: `bundle-test-${kind}`,
        attemptNumber: 1,
        scriptText: script,
        brandAssets: { captionsEnabled: true } as never,
        plan: plans[kind],
      });
      const qualityMetrics = await measureQualityMetrics({ videoPath: output.videoPath, captionsEnabled: true, visualSource: kind === 'stock' ? 'stock-footage' : 'ai-stills' });
      const bundle = await uploadAttemptBundle({
        prefix: 'p/',
        artifacts,
        scriptText: script,
        scratchDir: path.dirname(output.videoPath),
        context: {
          runId: 'r', attemptNumber: 1, channelId: 'c', ttsModel: usage.metadata.ttsModel, voice: null,
          transcriptionModel: usage.metadata.transcriptionModel, visualSource: usage.metadata.visualSource,
          captionStyle: usage.metadata.captionStyle, audioLayer: usage.metadata.audioLayer,
          captionFont: { family: CAPTION_FONT_FAMILY, file: CAPTION_FONT_FILE }, qualityMetrics,
        },
      });

      const byName = new Map(bundle.files.map((f) => [f.name, f]));
      expect(byName.get('captions.ass')?.contentType).toBe('text/x-ssa');
      expect(byName.has('captions.srt')).toBe(false);
      expect(byName.has(kind === 'stock' ? 'stock-shotlist.mp4' : 'stills-video.mp4')).toBe(true);
      for (const n of ['voiceover.mp3', 'transcript.json', 'plan.json', 'ffmpeg-args.json', 'script.txt']) expect(byName.has(n)).toBe(true);

      const manifestUpload = uploads.find((u) => u.key === 'p/manifest.json')!;
      const manifest = JSON.parse(await fs.readFile(manifestUpload.filePath, 'utf-8'));
      expect(manifest.captionFont).toEqual({ family: 'Montserrat ExtraBold', file: 'Montserrat-ExtraBold.ttf' });
      expect(manifest.qualityMetrics.width).toBe(1080);
      expect(manifest.qualityMetrics.fps).toBe(30);
      expect(manifest.files.map((f: { name: string }) => f.name)).toContain('captions.ass');
      expect(manifest.stubFlags).toEqual({ media: true, stockFootage: true, aiVisuals: true });
    }, 240_000);
  }
});
