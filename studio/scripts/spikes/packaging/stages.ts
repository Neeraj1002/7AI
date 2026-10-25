// S1 to S3: scripts, six packages per script, cold-reader prune, renders.
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { LIVE, OUT, REPO_ROOT, SpendCeilingError, cached, ensureDir, ledger, readJson, wordCount, writeJson } from './common';
import { DEVICES, NEUTRAL_TITLE_LIMIT, SCRIPTS, type ScriptSpec } from './config';
import { askJson, logCall, replyCostUsd } from './llm';
import {
  COLD_READER_SYSTEM,
  PACKAGES_SYSTEM,
  ceilingPrompt,
  channelLookPrompt,
  packagesUser,
  type ThumbnailConcept,
} from './prompts';
import { generateScript } from '../../../src/agents/script-generation';
import { generateStills } from '../../../src/ai-visuals';
import { STILL_SIZE_LANDSCAPE } from '../../../src/ai-visuals/sizes';

// ---------------------------------------------------------------------------------------------------------
// S1. Scripts
// ---------------------------------------------------------------------------------------------------------

export type ScriptRecord = {
  id: string;
  channelLabel: string;
  source: string;
  lookSource: string;
  kind: string;
  words: number;
  costUsd: number;
  stub: boolean;
  scriptText: string;
};

function briefParts(briefText: string): { topic: string; constraints: string[] } {
  const topic = /^Topic:\s*(.+)$/m.exec(briefText)?.[1] ?? briefText.split('\n')[0];
  const constraints = [...briefText.matchAll(/^Constraint:\s*(.+)$/gm)].map((m) => m[1]);
  return { topic, constraints };
}

async function scriptFor(spec: ScriptSpec): Promise<ScriptRecord> {
  const base = { id: spec.id, channelLabel: spec.channelLabel, lookSource: spec.look.source, kind: spec.kind };
  if (spec.fixtureFile) {
    const fx = readJson<{ scriptText: string; runId: string; gate1: string[] }>(spec.fixtureFile);
    return { ...base, source: `dev database sevenai_dev, run ${fx.runId.slice(0, 8)}, Gate 1 approved (attempt 2), read-only copy`, words: wordCount(fx.scriptText), costUsd: 0, stub: false, scriptText: fx.scriptText };
  }
  const briefText = fs.readFileSync(path.join(REPO_ROOT, spec.briefFile!), 'utf8');
  const parts = briefParts(briefText);
  const topic = spec.topic ?? parts.topic;
  const constraints = spec.constraints ?? parts.constraints;
  const source = `generated with the real generateScript() from fixture brief ${spec.briefFile} (not an approved script)`;
  if (!LIVE) return { ...base, source: `STUB: brief text stands in for the script (${spec.briefFile})`, words: wordCount(briefText), costUsd: 0, stub: true, scriptText: briefText };
  const rec = await cached<ScriptRecord>(`script:${spec.id}:${briefText}`, async () => {
    ledger.assertRoom(0.25, `script:${spec.id}`);
    const { output, calls } = await generateScript({
      topic,
      constraints,
      briefText,
      targetSeconds: spec.targetSeconds,
      factPolicy: 'brief-only',
      videoKind: 'long',
    });
    let costUsd = 0;
    for (const c of calls) {
      const cost = replyCostUsd(c);
      costUsd += cost;
      logCall({ label: `script:${spec.id}`, purpose: 'script-generation', model: c.model, inputTokens: c.usage.inputTokens, outputTokens: c.usage.outputTokens, costUsd: cost, stopReason: c.stopReason });
    }
    return { value: { ...base, source, words: wordCount(output.scriptText), costUsd, stub: false, scriptText: output.scriptText }, costUsd, label: `script:${spec.id}` };
  });
  return rec;
}

export async function stageScripts(): Promise<ScriptRecord[]> {
  const out: ScriptRecord[] = [];
  for (const spec of SCRIPTS) out.push(await scriptFor(spec));
  writeJson(path.join(OUT, 'scripts.json'), out);
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// S2. Six packages per script
// ---------------------------------------------------------------------------------------------------------

const DeviceEnum = z.enum(DEVICES);
const ConceptSchema = z.object({
  subject: z.string(),
  gazeOrGesture: z.string(),
  scale: z.string(),
  threatOrMystery: z.string(),
  light: z.string(),
  composition: z.string(),
  lettering: z.object({ words: z.string(), subline: z.string().nullable(), zone: z.enum(['top', 'bottom', 'left', 'right']) }),
});
const PackageSchema = z.object({
  id: z.string(),
  question: z.string(),
  device: DeviceEnum,
  supportingDevice: DeviceEnum.nullable(),
  title: z.string(),
  thumbnail: ConceptSchema,
  answeredAt: z.string(),
  supportQuote: z.string(),
  deviceNote: z.string().nullable(),
});
const PackagesReplySchema = z.object({ packages: z.array(PackageSchema) });
export type Package = z.infer<typeof PackageSchema> & { violations: string[] };

const BADGES = /\b(4k|8k|full movie|official|hd)\b/i;

function violationsOf(p: z.infer<typeof PackageSchema>, titleLimit: number): string[] {
  const v: string[] = [];
  if (p.title.length > titleLimit) v.push(`title ${p.title.length} chars, limit ${titleLimit}`);
  if (wordCount(p.thumbnail.lettering.words) > 4) v.push(`lettering ${wordCount(p.thumbnail.lettering.words)} words, limit 4`);
  if (p.thumbnail.lettering.subline && wordCount(p.thumbnail.lettering.subline) > 5) v.push(`subline ${wordCount(p.thumbnail.lettering.subline)} words, limit 5`);
  if (BADGES.test(`${p.title} ${p.thumbnail.lettering.words} ${p.thumbnail.lettering.subline ?? ''}`)) v.push('badge-like word');
  return v;
}

function stubPackages(): z.infer<typeof PackagesReplySchema> {
  const mk = (i: number, device: (typeof DEVICES)[number]): z.infer<typeof PackageSchema> => ({
    id: `p${i}`,
    question: `STUB question ${i}?`,
    device,
    supportingDevice: null,
    title: `STUB title ${i}: a specific question`,
    thumbnail: {
      subject: `a stub subject ${i}`,
      gazeOrGesture: 'seen from behind, looking at the horizon',
      scale: 'tiny against a vast wall',
      threatOrMystery: 'something large and unseen',
      light: 'low gold side light',
      composition: 'foreground rope, mid-ground figure, hazy background',
      lettering: { words: ['THE LAST SHIP', 'NOBODY ON DECK', 'WHO WAS AT THE WHEEL', 'EIGHTEEN THOUSAND PIECES', 'ALMOST LOST', 'THE SILENT DECK'][i - 1], subline: i % 2 ? 'what the record shows' : null, zone: (['bottom', 'left', 'top', 'right', 'bottom', 'left'] as const)[i - 1] },
    },
    answeredAt: 'STUB',
    supportQuote: 'STUB',
    deviceNote: null,
  });
  return { packages: DEVICES.slice(0, 6).map((d, i) => mk(i + 1, d)) };
}

export type PackagesRecord = { scriptId: string; packages: Package[] };

export async function stagePackages(): Promise<PackagesRecord[]> {
  const scripts = readJson<ScriptRecord[]>(path.join(OUT, 'scripts.json'));
  const out: PackagesRecord[] = [];
  for (const spec of SCRIPTS) {
    const script = scripts.find((s) => s.id === spec.id)!;
    const reply = await askJson({
      label: `packages:${spec.id}`,
      purpose: 'script-generation',
      system: PACKAGES_SYSTEM,
      user: packagesUser(script.scriptText, spec.look),
      schema: PackagesReplySchema,
      estimateUsd: 0.12,
      stub: stubPackages,
    });
    const titleLimit = spec.look.titleGuidance ? 60 : NEUTRAL_TITLE_LIMIT;
    out.push({ scriptId: spec.id, packages: reply.packages.map((p) => ({ ...p, violations: violationsOf(p, titleLimit) })) });
  }
  writeJson(path.join(OUT, 'packages.json'), out);
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// S3a. Cold-reader prune
// ---------------------------------------------------------------------------------------------------------

const PruneSchema = z.object({
  reads: z.array(z.object({ id: z.string(), aboutGuess: z.string(), curiosity: z.number(), wouldClick: z.enum(['yes', 'maybe', 'no']) })),
  ranking: z.array(z.string()),
});
export type PruneRecord = { scriptId: string; reads: z.infer<typeof PruneSchema>['reads']; ranking: string[]; keep: string[]; best: string };

export async function stagePrune(): Promise<PruneRecord[]> {
  const all = readJson<PackagesRecord[]>(path.join(OUT, 'packages.json'));
  const out: PruneRecord[] = [];
  for (const rec of all) {
    const user = rec.packages
      .map((p) => `${p.id}. Title: ${p.title}\n   Thumbnail words: ${p.thumbnail.lettering.words}${p.thumbnail.lettering.subline ? ` (small line: ${p.thumbnail.lettering.subline})` : ''}`)
      .join('\n');
    const reply = await askJson({
      label: `prune:${rec.scriptId}`,
      purpose: 'metadata-generation',
      system: COLD_READER_SYSTEM,
      user,
      schema: PruneSchema,
      estimateUsd: 0.02,
      stub: () => ({ reads: rec.packages.map((p, i) => ({ id: p.id, aboutGuess: 'STUB guess', curiosity: 5 - (i % 3), wouldClick: 'maybe' as const })), ranking: rec.packages.map((p) => p.id) }),
    });
    const valid = new Set(rec.packages.map((p) => p.id));
    const ranking = [...new Set(reply.ranking.filter((id) => valid.has(id)))];
    for (const p of rec.packages) if (!ranking.includes(p.id)) ranking.push(p.id);
    out.push({ scriptId: rec.scriptId, reads: reply.reads, ranking, keep: ranking.slice(0, 3), best: ranking[0] });
  }
  writeJson(path.join(OUT, 'prune.json'), out);
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// S3b. Renders: three channel-look cards per script, plus one unconstrained "ceiling" card for the best concept
// ---------------------------------------------------------------------------------------------------------

export type Card = {
  cardId: string;
  scriptId: string;
  packageId: string;
  kind: 'channel-look' | 'ceiling';
  prompt: string;
  rawFile: string | null; // relative to OUT
  costUsd: number;
  skipped?: string;
};

// Highest estimate for one image: 'low' quality is about $0.005; padded so the ceiling check is conservative.
const IMAGE_ESTIMATE_USD = 0.03;

export async function renderOne(cardId: string, prompt: string): Promise<{ rawFile: string | null; costUsd: number; skipped?: string }> {
  ledger.assertRoom(IMAGE_ESTIMATE_USD, `image:${cardId}`);
  const cacheDir = ensureDir(path.join(OUT, 'stills-cache'));
  let costUsd = 0;
  try {
    const res = await generateStills({
      scenePrompts: [prompt],
      size: STILL_SIZE_LANDSCAPE,
      cacheDir,
      onStillGenerated: (info) => {
        costUsd += info.costUsd;
        if (info.costUsd > 0) ledger.add(`image:${cardId}`, info.costUsd);
      },
    });
    if (res.imagePaths.length === 0) return { rawFile: null, costUsd, skipped: 'provider returned no image' };
    const dest = path.join(ensureDir(path.join(OUT, 'raw')), `${cardId}.png`);
    fs.copyFileSync(res.imagePaths[0], dest);
    return { rawFile: path.relative(OUT, dest), costUsd };
  } catch (error) {
    if (error instanceof SpendCeilingError) throw error;
    return { rawFile: null, costUsd, skipped: error instanceof Error ? error.message : String(error) };
  }
}

export async function stageRender(): Promise<Card[]> {
  const packs = readJson<PackagesRecord[]>(path.join(OUT, 'packages.json'));
  const prunes = readJson<PruneRecord[]>(path.join(OUT, 'prune.json'));
  const cards: Card[] = [];
  for (const spec of SCRIPTS) {
    const pack = packs.find((p) => p.scriptId === spec.id)!;
    const prune = prunes.find((p) => p.scriptId === spec.id)!;
    const byId = (id: string) => pack.packages.find((p) => p.id === id)!;
    for (const id of prune.keep) {
      const concept = byId(id).thumbnail as ThumbnailConcept;
      const prompt = channelLookPrompt(concept, spec.look);
      const cardId = `${spec.id}-${id}`;
      cards.push({ cardId, scriptId: spec.id, packageId: id, kind: 'channel-look', prompt, ...(await renderOne(cardId, prompt)) });
    }
    const best = byId(prune.best);
    const prompt = ceilingPrompt(best.thumbnail as ThumbnailConcept);
    const cardId = `${spec.id}-${best.id}-ceiling`;
    cards.push({ cardId, scriptId: spec.id, packageId: best.id, kind: 'ceiling', prompt, ...(await renderOne(cardId, prompt)) });
  }
  writeJson(path.join(OUT, 'cards.json'), cards);
  return cards;
}
