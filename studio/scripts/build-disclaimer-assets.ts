// Sprint 6 Task 2 (P5): records the one disclaimer clip. Run once, deliberately; spends real money.
//   npx tsx scripts/build-disclaimer-assets.ts          dry run (prints the plan, spends nothing)
//   npx tsx scripts/build-disclaimer-assets.ts --live   one speech call, then writes data/disclaimer/
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';
import OpenAI from 'openai';
import { env } from '../src/config/env';
import {
  DISCLAIMER_ASSET_DIR, DISCLAIMER_ASSET_VERSION, DISCLAIMER_CLIP_PATH, DISCLAIMER_DELIVERY, DISCLAIMER_MANIFEST_PATH,
  DISCLAIMER_PACE, DISCLAIMER_PROVIDER_VOICE, DISCLAIMER_TTS_MODEL, type DisclaimerManifest,
} from '../src/disclaimer/asset-spec';
import { DISCLAIMER_SENTENCE, DISCLAIMER_SENTENCE_SHA256 } from '../src/disclaimer/sentence';

const execFileAsync = promisify(execFile);
const COST_CEILING_USD = 0.5; // whole-task live ceiling; one short sentence costs well under a cent

async function main() {
  const live = process.argv.includes('--live');
  console.log(`version ${DISCLAIMER_ASSET_VERSION}\nsentence: ${DISCLAIMER_SENTENCE}\nvoice ${DISCLAIMER_PROVIDER_VOICE} (${DISCLAIMER_TTS_MODEL}), ceiling $${COST_CEILING_USD}`);
  if (!live) return console.log('dry run: pass --live to record');
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY, maxRetries: 0 });
  const response = await client.audio.speech.create({
    model: DISCLAIMER_TTS_MODEL, voice: DISCLAIMER_PROVIDER_VOICE as never, input: DISCLAIMER_SENTENCE,
    instructions: DISCLAIMER_DELIVERY, response_format: 'mp3',
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.mkdir(DISCLAIMER_ASSET_DIR, { recursive: true });
  // One-time tempo change at record time; the render path never changes speed.
  const rawPath = `${DISCLAIMER_CLIP_PATH}.raw.mp3`;
  await fs.writeFile(rawPath, bytes);
  await execFileAsync(env.FFMPEG_PATH, ['-y', '-i', rawPath, '-filter:a', `atempo=${DISCLAIMER_PACE}`, DISCLAIMER_CLIP_PATH]);
  await fs.rm(rawPath);
  const clipBytes = await fs.readFile(DISCLAIMER_CLIP_PATH);
  const { stdout } = await execFileAsync(env.FFPROBE_PATH, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', DISCLAIMER_CLIP_PATH]);
  const manifest: DisclaimerManifest = {
    version: DISCLAIMER_ASSET_VERSION, sentence: DISCLAIMER_SENTENCE, sentenceSha256: DISCLAIMER_SENTENCE_SHA256,
    clipSha256: createHash('sha256').update(clipBytes).digest('hex'), clipSeconds: Number(parseFloat(stdout.trim()).toFixed(3)),
    model: DISCLAIMER_TTS_MODEL, voice: DISCLAIMER_PROVIDER_VOICE,
  };
  await fs.writeFile(DISCLAIMER_MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`wrote ${DISCLAIMER_CLIP_PATH} (${manifest.clipSeconds}s), est. cost about $${((manifest.clipSeconds / 60) * 0.015).toFixed(4)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
