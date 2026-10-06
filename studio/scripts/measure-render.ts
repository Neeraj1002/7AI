// Sprint 4 Task 8 (R7) — prints the deterministic quality metrics for any
// rendered mp4, using the exact same instrument the Video Intelligence gate
// uses (agents/video-intelligence/quality-metrics.ts), so a human can compare
// an old published video and a new render on identical terms.
//
// Usage: npx tsx scripts/measure-render.ts <video.mp4> [ai-stills|stock-footage] [--captions]

import { measureQualityMetrics, hardFailureReason, formatQualityMetrics } from '../src/agents/video-intelligence/quality-metrics';

async function main(): Promise<void> {
  const [videoPath, sourceArg, ...flags] = process.argv.slice(2);
  if (!videoPath) {
    console.error('Usage: npx tsx scripts/measure-render.ts <video.mp4> [ai-stills|stock-footage] [--captions]');
    process.exit(1);
  }
  const visualSource = sourceArg === 'ai-stills' || sourceArg === 'stock-footage' ? sourceArg : undefined;
  const metrics = await measureQualityMetrics({ videoPath, captionsEnabled: flags.includes('--captions'), visualSource });
  console.log(JSON.stringify(metrics, null, 2));
  console.log(formatQualityMetrics(metrics));
  console.log(`hard failure: ${hardFailureReason(metrics) ?? 'none'}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
