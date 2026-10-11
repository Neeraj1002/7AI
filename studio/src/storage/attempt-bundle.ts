import fs from 'node:fs/promises';
import path from 'node:path';
import { uploadToR2 } from './r2-client';
import type { VideoArtifacts } from '../agents/video-generation';
import type { QualityMetrics } from '../agents/video-generation/quality-spec';

// Sprint 3 Task 13 (R3) — per-attempt debug bundle, uploaded next to Task
// 12's draft .mp4 under `<draftKeyWithoutExt>/`. Pure orchestration over
// uploadToR2: each artifact uploads independently (one failure logs and
// continues), and manifest.json goes last so its presence implies a complete
// bundle. Callers must check isR2Configured() first, same as uploadToR2.

const UPLOAD_CONCURRENCY = 4;

export type BundleManifestFile = { name: string; key: string; contentType: string; bytes: number };

export type BundleManifestContext = {
  runId: string;
  attemptNumber: number;
  channelId: string;
  ttsModel: string;
  voice: string | null;
  transcriptionModel: string;
  visualSource: string;
  captionStyle: string;
  audioLayer: string;
  // Sprint 4 Task 8 — bundled caption font (null when captions are off) and the
  // deterministic render metrics measured on the finished mp4 (null if the
  // measurement failed; the bundle never depends on it).
  captionFont?: { family: string; file: string } | null;
  qualityMetrics?: QualityMetrics | null;
};

type Candidate = { name: string; filePath: string; contentType: string };

export async function uploadAttemptBundle(params: {
  prefix: string; // ends with '/'
  artifacts: VideoArtifacts;
  scriptText: string;
  scratchDir: string;
  context: BundleManifestContext;
  // Sprint 4 Task 10 (R3.3): a long-form bundle keeps only the small files (script, plan, ffmpeg args,
  // transcript): no full-length intermediate videos, voiceover, bed or the ~120 stills. The Gate 2
  // preview copy is stored beside the draft video instead.
  longForm?: boolean;
}): Promise<{ manifestKey: string; files: BundleManifestFile[] }> {
  const { artifacts: a, prefix } = params;

  const scriptPath = path.join(params.scratchDir, `${params.context.attemptNumber}.script.txt`);
  await fs.writeFile(scriptPath, params.scriptText, 'utf-8');

  const candidates: Candidate[] = [
    { name: 'voiceover.mp3', filePath: a.ttsAudioPath, contentType: 'audio/mpeg' },
    { name: 'transcript.json', filePath: a.transcriptJsonPath, contentType: 'application/json' },
    { name: 'plan.json', filePath: a.planJsonPath, contentType: 'application/json' },
    { name: 'ffmpeg-args.json', filePath: a.ffmpegArgsJsonPath, contentType: 'application/json' },
    { name: 'script.txt', filePath: scriptPath, contentType: 'text/plain' },
  ];
  if (params.longForm) {
    // keep: transcript.json, plan.json, ffmpeg-args.json, script.txt
    candidates.splice(0, 1);
  }
  if (!params.longForm && a.captionsPath) candidates.push({ name: 'captions.ass', filePath: a.captionsPath, contentType: 'text/x-ssa' });
  if (!params.longForm && a.stockVideoPath) candidates.push({ name: 'stock-shotlist.mp4', filePath: a.stockVideoPath, contentType: 'video/mp4' });
  if (!params.longForm && a.stillsVideoPath) candidates.push({ name: 'stills-video.mp4', filePath: a.stillsVideoPath, contentType: 'video/mp4' });
  (params.longForm ? [] : a.stillImagePaths ?? []).forEach((p, i) =>
    candidates.push({ name: `still-${i}.png`, filePath: p, contentType: 'image/png' }),
  );
  if (!params.longForm && a.audioBedPath) {
    const ext = path.extname(a.audioBedPath) || '.mp3';
    candidates.push({ name: `audio-bed${ext}`, filePath: a.audioBedPath, contentType: ext === '.wav' ? 'audio/wav' : 'audio/mpeg' });
  }

  const results: Array<BundleManifestFile | null> = new Array(candidates.length).fill(null);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < candidates.length) {
      const idx = next++;
      const c = candidates[idx];
      const key = `${prefix}${c.name}`;
      try {
        const bytes = (await fs.stat(c.filePath)).size;
        await uploadToR2({ key, filePath: c.filePath, contentType: c.contentType });
        results[idx] = { name: c.name, key, contentType: c.contentType, bytes };
      } catch (error) {
        console.error(
          `[video_generation] run ${params.context.runId} attempt ${params.context.attemptNumber}: bundle artifact ${c.name} upload failed (non-blocking) — ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, candidates.length) }, worker));
  const files = results.filter((r): r is BundleManifestFile => r !== null);

  const manifestKey = `${prefix}manifest.json`;
  const manifestPath = path.join(params.scratchDir, `${params.context.attemptNumber}.manifest.json`);
  await fs.writeFile(
    manifestPath,
    JSON.stringify({ ...params.context, stubFlags: a.stubFlags, createdAt: new Date().toISOString(), files }, null, 2),
    'utf-8',
  );
  await uploadToR2({ key: manifestKey, filePath: manifestPath, contentType: 'application/json' });
  return { manifestKey, files };
}
