// Sprint 6 Task 1, R0: what one 16:9 thumbnail image really costs on the registered image model.
//   npx tsx scripts/thumbnail-price-check.ts --live [--quality low,medium]
//
// Spends real money. Without --live it prints the plan and exits. One image per quality, same prompt, at the
// landscape still size; each is priced from the response's own `usage` with ai-visuals/registry.ts's priceStill
// (the pricing the pipeline books), saved under studio/data/thumbnail-price-check/ (gitignored) and the running
// total is checked before every call. It does not read or write the database.
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { resolveAiVisualsPurpose } from '../src/ai-visuals/registry';
import { priceStill, resolveImagePricing } from '../src/ai-visuals/registry';
import { STILL_SIZE_LANDSCAPE } from '../src/ai-visuals/sizes';

// The cap for this script on its own. The whole task's live-check ceiling is the founder's number (Task 1 doc,
// Spend), and this script's calls count against it.
const MAX_SPEND_USD = 0.2;

const PROMPT =
  'Cinematic documentary still, 35mm look, soft dawn light with warm highlights and cool shadows. A lone sailor seen ' +
  'from behind at the rail of a small wooden ship, a second ship drifting far ahead on a flat grey sea with its sails ' +
  'torn and nobody on deck. Wide frame, the sailor small against the sea, shallow depth of field, fine film grain. ' +
  'Empty sky in the upper left third. No text, no lettering, no logos, no faces toward the camera.';

async function main() {
  const live = process.argv.includes('--live');
  const qArg = process.argv.indexOf('--quality');
  const qualities = (qArg >= 0 ? process.argv[qArg + 1] : 'low,medium').split(',').map((q) => q.trim());
  const { model } = resolveAiVisualsPurpose('still-generation');
  const pricing = resolveImagePricing(model);
  console.log(`model ${model}, size ${STILL_SIZE_LANDSCAPE}, qualities ${qualities.join(', ')}, cap $${MAX_SPEND_USD}`);
  console.log(`pricing entry: flat fallback $${pricing.perImageUsd}/image; token rates ${JSON.stringify(pricing.tokenRates)}`);
  if (!live) {
    console.log('dry run (no --live): nothing was called.');
    return;
  }
  dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set in studio/.env.local');
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 });
  const outDir = path.resolve(__dirname, '../data/thumbnail-price-check');
  await fs.mkdir(outDir, { recursive: true });

  let total = 0;
  for (const quality of qualities) {
    if (total >= MAX_SPEND_USD) {
      console.log(`stopping before quality ${quality}: running total $${total.toFixed(4)} reached the cap`);
      break;
    }
    const started = Date.now();
    const response = (await client.images.generate({
      model,
      prompt: PROMPT,
      size: STILL_SIZE_LANDSCAPE,
      quality: quality as 'low' | 'medium' | 'high',
      n: 1,
    })) as OpenAI.Images.ImagesResponse;
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new Error(`no image data for quality ${quality}`);
    const file = path.join(outDir, `${quality}.png`);
    await fs.writeFile(file, Buffer.from(b64, 'base64'));
    const cost = priceStill(pricing, response.usage);
    total += cost;
    console.log(
      `${quality}: $${cost.toFixed(5)} (${((Date.now() - started) / 1000).toFixed(1)}s) usage ${JSON.stringify(response.usage)} -> ${file}`,
    );
  }
  console.log(`total $${total.toFixed(5)} of the $${MAX_SPEND_USD} cap`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
