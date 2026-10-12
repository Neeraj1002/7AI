// Sprint 4 Task 9: operator tool. Measures a finished long-form run: cost by part, stage times, video
// facts (resolution, fps, frames, duration vs narration, LUFS) and the SRT parse-back.
//   npx tsx scripts/long-form-measure.ts <runId>
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { prisma } from '../src/models/prisma-client';
import { DATA_DIR } from '../src/config/paths';
import { env } from '../src/config/env';
import { measureQualityMetrics } from '../src/agents/video-intelligence/quality-metrics';
import { parseSrt } from '../src/agents/video-generation/subtitles-srt';
import { joinChapterTexts } from '../src/agents/script-generation/long-form';

async function main(): Promise<void> {
  const runId = process.argv[2];
  if (!runId) throw new Error('usage: long-form-measure.ts <runId>');
  const stages = await prisma.pipelineStage.findMany({ where: { pipelineRunId: runId }, orderBy: { createdAt: 'asc' } });
  const usage = await prisma.usageEvent.findMany({ where: { pipelineRunId: runId }, orderBy: { createdAt: 'asc' } });
  const gen = [...stages].reverse().find((s) => s.stageName === 'video_generation' && s.status === 'completed');
  const out = gen?.output as { videoPath: string; durationSeconds: number; frameCount: number; subtitlesPath: string; chapterTimings: { endSec: number }[]; plan: { longScenes: unknown[] } };
  const script = [...stages].reverse().find((s) => s.stageName === 'gate1')?.output as { sanctionedScriptText: string; chapters: { title: string; text: string }[] };

  const byPart: Record<string, { n: number; usd: number }> = {};
  for (const u of usage) {
    const part = (u.metadata as { part?: string } | null)?.part ?? u.agent;
    byPart[part] ??= { n: 0, usd: 0 };
    byPart[part].n += 1;
    byPart[part].usd += Number(u.costUsd);
  }
  const total = usage.reduce((s, u) => s + Number(u.costUsd), 0);

  const metrics = await measureQualityMetrics({ videoPath: out.videoPath, captionsEnabled: false, visualSource: 'ai-stills', videoKind: 'long' });
  const narrationPath = path.join(DATA_DIR, 'videos', runId, 'work');
  const narrationFile = (await fs.readdir(narrationPath)).find((f) => f.startsWith('narration-') && f.endsWith('.mp3'));
  const probe = (p: string) => parseFloat(execFileSync(env.FFPROBE_PATH, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', p]).toString());
  const narration = narrationFile ? probe(path.join(narrationPath, narrationFile)) : null;
  const srt = parseSrt(await fs.readFile(out.subtitlesPath, 'utf-8'));
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const increasing = srt.cues.every((c, i) => c.endMs > c.startMs && (i === 0 || c.startMs >= srt.cues[i - 1].endMs));
  const sizeMb = (await fs.stat(out.videoPath)).size / 1024 / 1024;
  const timing = (name: string) => {
    const s = stages.filter((x) => x.stageName === name).at(-1);
    return s?.startedAt && s.completedAt ? (s.completedAt.getTime() - s.startedAt.getTime()) / 1000 : null;
  };
  console.log(JSON.stringify({
    runId,
    stills: out.plan.longScenes.length,
    seconds: { script_generation: timing('script_generation'), video_generation: timing('video_generation'), video_review: timing('video_review') },
    costUsd: { total: Number(total.toFixed(4)), byPart: Object.fromEntries(Object.entries(byPart).map(([k, v]) => [k, { calls: v.n, usd: Number(v.usd.toFixed(4)) }])) },
    video: {
      width: metrics.width, height: metrics.height, fps: metrics.fps, frames: out.frameCount, framesExpected: Math.round(out.durationSeconds * 30),
      durationSeconds: out.durationSeconds, narrationSeconds: narration,
      durationVsNarrationPct: narration ? Number((((out.durationSeconds - narration) / narration) * 100).toFixed(2)) : null,
      lufs: metrics.integratedLufs, truePeakDb: metrics.truePeakDb, audioSampleRate: metrics.audioSampleRate, audioKbps: metrics.audioBitrateKbps, sizeMb: Number(sizeMb.toFixed(1)),
    },
    srt: { cues: srt.cues.length, timesIncreasing: increasing, textEqualsScript: norm(srt.cues.map((c) => c.text).join(' ')) === norm(joinChapterTexts(script.chapters)) },
    chapterTimings: out.chapterTimings,
    renderSecondsPerOutputSecond: null,
    videoReview: (stages.filter((s) => s.stageName === 'video_review').at(-1)?.output ?? null),
  }, null, 2));
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
