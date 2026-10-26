// S5: a cold-reader critic that sees only the finished thumbnail (and the tiny version) plus the title.
// The registry's image-capable purpose is 'video-intelligence-own-draft' (claude-haiku-4-5, attachments allowed;
// see agents/video-intelligence and agents/video-generation/still-check for the same call shape).
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { OUT, readJson, writeJson } from './common';
import { SCRIPTS } from './config';
import { askJson } from './llm';
import { CRITIC_SYSTEM, criticUser } from './prompts';
import type { Lettered } from './lettering';
import type { PackagesRecord, Card } from './stages';

const CriticSchema = z.object({
  about: z.string(),
  expectsToSee: z.string(),
  wantsToKnow: z.string(),
  wouldClick: z.enum(['yes', 'maybe', 'no']),
  whyNot: z.string(),
  wouldDisappoint: z.string(),
  smallWords: z.string(),
  smallReadable: z.boolean(),
});
export type CriticRecord = { cardId: string; title: string; lettering: string; read: z.infer<typeof CriticSchema>; smallWordsMatch: boolean };

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

export async function stageCritic(): Promise<CriticRecord[]> {
  const lettered = readJson<Lettered[]>(path.join(OUT, 'lettered.json'));
  const packs = readJson<PackagesRecord[]>(path.join(OUT, 'packages.json'));
  const cards = readJson<Card[]>(path.join(OUT, 'cards.json'));
  const out: CriticRecord[] = [];
  for (const l of lettered) {
    const card = cards.find((c) => c.cardId === l.cardId)!;
    const spec = SCRIPTS.find((s) => s.id === card.scriptId)!;
    const pkg = packs.find((p) => p.scriptId === spec.id)!.packages.find((p) => p.id === card.packageId)!;
    const b64 = (rel: string) => fs.readFileSync(path.join(OUT, rel)).toString('base64');
    const read = await askJson({
      label: `critic:${l.cardId}`,
      purpose: 'video-intelligence-own-draft',
      system: CRITIC_SYSTEM,
      user: criticUser(pkg.title),
      schema: CriticSchema,
      attachments: [
        { mediaType: 'image/jpeg', dataBase64: b64(l.full) },
        { mediaType: 'image/jpeg', dataBase64: b64(l.side) },
      ],
      estimateUsd: 0.02,
      stub: () => ({ about: 'STUB', expectsToSee: 'STUB', wantsToKnow: 'STUB', wouldClick: 'maybe' as const, whyNot: 'STUB', wouldDisappoint: 'STUB', smallWords: l.words, smallReadable: true }),
    });
    const lettering = l.subline ? `${l.words} / ${l.subline}` : l.words;
    out.push({ cardId: l.cardId, title: pkg.title, lettering, read, smallWordsMatch: norm(read.smallWords).includes(norm(l.words)) });
  }
  writeJson(path.join(OUT, 'critic.json'), out);
  return out;
}
