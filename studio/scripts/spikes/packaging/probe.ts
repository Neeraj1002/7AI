// Extra (not one of the twelve blind cards): does a higher image quality setting lift the "ceiling" renders?
// The pipeline always asks for 'low' (ai-visuals/sizes.ts STILL_QUALITY). This calls the same model and the same
// ceiling prompts at 'medium' and 'high' and prices them with the registry's own priceStill, so the report can say what
// the quality lever would cost. Spike-only: it talks to the image endpoint directly because the product client fixes quality.
// Run: npx tsx scripts/spikes/packaging/spike.ts --live --stages probe --qualities medium,high
import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { OUT, ensureDir, ledger, readJson, writeJson, LIVE } from './common';
import { letterCard, type Lettered } from './lettering';
import type { Card, PackagesRecord } from './stages';
import { env } from '../../../src/config/env';
import { priceStill, resolveAiVisualsPurpose, resolveImagePricing } from '../../../src/ai-visuals/registry';

export type ProbeRecord = { cardId: string; quality: string; costUsd: number; lettered: Lettered };

export async function stageProbe(): Promise<ProbeRecord[]> {
  if (!LIVE) throw new Error('probe is live only');
  const arg = process.argv.find((a, i, all) => all[i - 1] === '--qualities') ?? 'medium';
  const qualities = arg.split(',');
  const { model } = resolveAiVisualsPurpose('still-generation');
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY, maxRetries: 0 });
  const cards = readJson<Card[]>(path.join(OUT, 'cards.json')).filter((c) => c.kind === 'ceiling');
  const lettered = readJson<Lettered[]>(path.join(OUT, 'lettered.json'));
  const packs = readJson<PackagesRecord[]>(path.join(OUT, 'packages.json'));
  const file = path.join(OUT, 'probe.json');
  const out: ProbeRecord[] = fs.existsSync(file) ? readJson<ProbeRecord[]>(file) : [];
  const rawDir = ensureDir(path.join(OUT, 'probe-raw'));
  for (const quality of qualities) {
    for (const card of cards) {
      const id = `${card.cardId}-${quality}`;
      if (out.some((r) => r.cardId === id)) continue;
      ledger.assertRoom(quality === 'high' ? 0.45 : 0.15, `probe:${id}`);
      const res = (await client.images.generate({ model, prompt: card.prompt, size: '1536x1024', quality: quality as 'low', n: 1 })) as OpenAI.Images.ImagesResponse;
      const b64 = res.data?.[0]?.b64_json;
      if (!b64) throw new Error(`no image for ${id}`);
      const costUsd = priceStill(resolveImagePricing(model), res.usage);
      ledger.add(`probe:${id}`, costUsd);
      const raw = path.join(rawDir, `${id}.png`);
      fs.writeFileSync(raw, Buffer.from(b64, 'base64'));
      const base = lettered.find((l) => l.cardId === card.cardId)!;
      const concept = packs.find((p) => p.scriptId === card.scriptId)!.packages.find((p) => p.id === card.packageId)!.thumbnail;
      const probeCard: Card = { ...card, cardId: id, rawFile: path.relative(OUT, raw) };
      const l = await letterCard(probeCard, concept, base.font, path.join(OUT, 'probe-cards'));
      out.push({ cardId: id, quality, costUsd, lettered: l });
      writeJson(file, out);
      console.log(`probe ${id}: $${costUsd.toFixed(4)} usage=${JSON.stringify(res.usage)}`);
    }
  }
  // Side-by-side strip: low (pipeline setting) vs each probe quality, one row per script.
  const cols = 1 + qualities.length;
  const w = 480;
  const h = 270;
  const strip = createCanvas(cols * w, cards.length * h);
  const ctx = strip.getContext('2d');
  for (const [r, card] of cards.entries()) {
    const imgs = [lettered.find((l) => l.cardId === card.cardId)!.full, ...qualities.map((q) => out.find((o) => o.cardId === `${card.cardId}-${q}`)!.lettered.full)];
    for (const [c, rel] of imgs.entries()) ctx.drawImage(await loadImage(path.join(OUT, rel)), c * w, r * h, w, h);
  }
  fs.writeFileSync(path.join(OUT, 'quality-probe.png'), strip.toBuffer('image/png'));
  return out;
}
