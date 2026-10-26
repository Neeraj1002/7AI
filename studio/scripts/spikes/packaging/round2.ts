// Round 2, "the face test": re-render six of the twelve concepts (B, C, E, G, J, L of the first sheet) with an
// imagined, unnamed face allowed, then mix the six new cards with the six originals into a second blind sheet (M to X).
//
// What changes from round 1: the picture may now contain one anonymous person, face visible, looking at the thing
// under threat (the person must be someone the script supports; no likeness of any real person, living or dead; never
// named), and the channel's stills NEGATIVE prompt is left out. What stays: the channel's style text, the lettering
// (words, zone and font), the 16:9 crop, and the platform clauses (no logos or marks, no identifiable real person).
// Spend: round 2 may use at most ROUND2_CAP_USD more; the whole spike's $3.00 ceiling still applies.
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { OUT, ensureDir, ledger, readJson, seededShuffle, writeJson, SpendCeilingError } from './common';
import { SCRIPTS, type FontKey } from './config';
import { askJson } from './llm';
import { letterCard, type Lettered } from './lettering';
import { conceptScene, type ThumbnailConcept } from './prompts';
import { writeSheet } from './sheet';
import { renderOne, type Card, type PackagesRecord, type ScriptRecord } from './stages';
import { buildStyledScenePrompts } from '../../../src/agents/video-generation/scene-prompts';
import type { KeyRow } from './sheet';

export const ROUND2_CAP_USD = 1.0;
const SEED2 = 20261026;
const LABELS2 = 'MNOPQRSTUVWX';
// First-sheet labels of the six concepts to re-render.
const ORIGINAL_LABELS = ['B', 'C', 'E', 'G', 'J', 'L'];

function round2Spent(): number {
  return ledger.entries.filter((e) => /r2[:-]/.test(e.label)).reduce((s, e) => s + e.usd, 0);
}
function assertRound2Room(estimate: number, label: string): void {
  if (round2Spent() + estimate > ROUND2_CAP_USD) {
    throw new SpendCeilingError(`Round 2 cap: $${round2Spent().toFixed(4)} spent, "${label}" could cost $${estimate.toFixed(4)}, cap $${ROUND2_CAP_USD.toFixed(2)}. Stop and report.`);
  }
}

// ---- the face concept: one LLM call per card ---------------------------------------------------------------

const FaceConceptSchema = z.object({
  subject: z.string(),
  gazeOrGesture: z.string(),
  scale: z.string(),
  threatOrMystery: z.string(),
  light: z.string(),
  composition: z.string(),
  personRole: z.string(),
  personSupportQuote: z.string(),
});

const FACE_SYSTEM = `You revise one thumbnail concept for an image generator so that it contains one imagined, anonymous person whose face is clearly visible, looking at the thing that is under threat or unexplained.

Rules, never bent:
- The person's role must be supported by the script (someone who is actually there in the story: a crew member, a worker, a child, an engineer). Quote the supporting phrase in personSupportQuote.
- The person is imagined and anonymous: no likeness of any real person, living or dead, never named, never described as a particular historical person.
- Keep the rest of the picture as close as you can to the original concept: same place, same threat or mystery, same light, same calm zone for lettering. Change only what is needed to bring the person in, face visible (three-quarter or profile, not a passport photo), with their gaze on the thing at stake and an expression that shows what is at stake.
- The picture must not show anything the script does not support.
- No text, letters, numbers, logos or signs in the picture.

Reply with JSON only: subject, gazeOrGesture, scale, threatOrMystery, light, composition, personRole, personSupportQuote.`;

function faceUser(script: string, c: ThumbnailConcept, title: string): string {
  return `Title of the video: ${title}\nThe lettering that will sit on the thumbnail: ${c.lettering.words}${c.lettering.subline ? ` / ${c.lettering.subline}` : ''} (zone: ${c.lettering.zone}; keep that zone calm)\n\nOriginal concept:\n${JSON.stringify({ subject: c.subject, gazeOrGesture: c.gazeOrGesture, scale: c.scale, threatOrMystery: c.threatOrMystery, light: c.light, composition: c.composition }, null, 2)}\n\nThe approved script:\n"""\n${script}\n"""\n\nRevise the concept.`;
}

// Appended to the scene text. The face rule in words; the platform's own clauses are added by buildStyledScenePrompts.
const FACE_CLAUSE =
  'An imagined, anonymous person is in the frame with the face clearly visible, turned three-quarters, eyes on the thing under threat, an expression that shows what is at stake; not a portrait or likeness of any real person, living or dead';

export function faceCardPrompt(c: ThumbnailConcept, stylePrompt: string | undefined): string {
  return buildStyledScenePrompts([`${conceptScene(c)}. ${FACE_CLAUSE}`], {
    stylePrompt,
    // No channel negativePrompt on purpose (round 2). The safety clause keeps no logos or marks and no identifiable real person.
    safetyNegatives: true,
    allowBrandMarks: false,
  })[0];
}

// ---- the face check (a defect check, not a rating) -----------------------------------------------------------

const FaceCheckSchema = z.object({
  faceVisible: z.boolean(),
  uncannyAtFeed: z.boolean(),
  uncannyAtSidebar: z.boolean(),
  defects: z.array(z.string()),
  handsOk: z.boolean(),
});
const FACE_CHECK_SYSTEM = `You inspect a generated thumbnail for visible defects only; you do not judge whether it is good. Image 1 is the thumbnail at feed size; image 2 is the same thumbnail tiny, as in a sidebar. Say whether a human face is visible; whether any face looks uncanny (distorted or asymmetric eyes, wrong teeth, waxy or plastic skin, melted features, a dead stare) at feed size and, separately, at sidebar size; list each specific defect you can see; and whether hands, if any are visible, look normal. Reply with JSON only.`;

export type Round2Card = {
  newCardId: string;
  originalLabel: string;
  originalCardId: string;
  scriptId: string;
  packageId: string;
  title: string;
  font: FontKey;
  look: string;
  concept: z.infer<typeof FaceConceptSchema>;
  prompt: string;
  rawFile: string | null;
  costUsd: number;
  skipped?: string;
  lettered?: Lettered;
  faceCheck?: z.infer<typeof FaceCheckSchema>;
};

export async function stageRound2(): Promise<Round2Card[]> {
  const key1 = readJson<KeyRow[]>(path.join(OUT, 'key.json'));
  const cards1 = readJson<Card[]>(path.join(OUT, 'cards.json'));
  const packs = readJson<PackagesRecord[]>(path.join(OUT, 'packages.json'));
  const scripts = readJson<ScriptRecord[]>(path.join(OUT, 'scripts.json'));
  const lettered1 = readJson<Lettered[]>(path.join(OUT, 'lettered.json'));
  const out: Round2Card[] = [];

  for (const label of ORIGINAL_LABELS) {
    const k = key1.find((r) => r.label === label)!;
    const card = cards1.find((c) => c.cardId === k.cardId)!;
    const spec = SCRIPTS.find((s) => s.id === card.scriptId)!;
    const pkg = packs.find((p) => p.scriptId === spec.id)!.packages.find((p) => p.id === card.packageId)!;
    const base = pkg.thumbnail as ThumbnailConcept;
    const script = scripts.find((s) => s.id === spec.id)!;

    assertRound2Room(0.05, `r2:concept:${k.cardId}`);
    const revised = await askJson({
      label: `r2:concept:${k.cardId}`,
      purpose: 'script-generation',
      system: FACE_SYSTEM,
      user: faceUser(script.scriptText, base, pkg.title),
      schema: FaceConceptSchema,
      estimateUsd: 0.05,
      stub: () => ({ ...base, personRole: 'STUB crew member', personSupportQuote: 'STUB' }),
    });
    // Lettering stays exactly as in round 1.
    const concept: ThumbnailConcept = { ...revised, lettering: base.lettering };
    const prompt = faceCardPrompt(concept, spec.look.stylePrompt);
    const newCardId = `${spec.id}-${pkg.id}-face`;
    assertRound2Room(0.03, `r2:image:${newCardId}`);
    const rendered = await renderOne(`r2-${newCardId}`, prompt);
    const rec: Round2Card = {
      newCardId, originalLabel: label, originalCardId: k.cardId, scriptId: spec.id, packageId: pkg.id, title: pkg.title,
      font: lettered1.find((l) => l.cardId === k.cardId)!.font,
      look: spec.look.stylePrompt ? 'channel style text, no channel negative' : 'neutral, no channel negative',
      concept: revised, prompt, rawFile: rendered.rawFile, costUsd: rendered.costUsd, skipped: rendered.skipped,
    };
    if (rec.rawFile) {
      const asCard: Card = { cardId: newCardId, scriptId: spec.id, packageId: pkg.id, kind: 'channel-look', prompt, rawFile: rec.rawFile, costUsd: rendered.costUsd };
      rec.lettered = await letterCard(asCard, base, rec.font, path.join(OUT, 'cards-r2'));
      assertRound2Room(0.02, `r2:facecheck:${newCardId}`);
      const b64 = (rel: string) => fs.readFileSync(path.join(OUT, rel)).toString('base64');
      rec.faceCheck = await askJson({
        label: `r2:facecheck:${newCardId}`,
        purpose: 'video-intelligence-own-draft',
        system: FACE_CHECK_SYSTEM,
        user: 'Inspect this thumbnail for defects.',
        schema: FaceCheckSchema,
        attachments: [
          { mediaType: 'image/jpeg', dataBase64: b64(rec.lettered.feed) },
          { mediaType: 'image/jpeg', dataBase64: b64(rec.lettered.side) },
        ],
        estimateUsd: 0.02,
        stub: () => ({ faceVisible: true, uncannyAtFeed: false, uncannyAtSidebar: false, defects: [], handsOk: true }),
      });
    }
    out.push(rec);
    writeJson(path.join(OUT, 'round2.json'), out);
  }

  // Second blind sheet: six originals plus six new cards, shuffled, labelled M to X.
  const items = [
    ...out.map((r) => ({ kind: 'round2-face' as const, cardId: r.newCardId, title: r.title, full: r.lettered?.full, rec: r })),
    ...ORIGINAL_LABELS.map((l) => {
      const k = key1.find((r) => r.label === l)!;
      const lt = lettered1.find((x) => x.cardId === k.cardId)!;
      return { kind: 'round1-original' as const, cardId: k.cardId, title: k.title, full: lt.full, rec: undefined };
    }),
  ].filter((i) => i.full);
  const order = seededShuffle(items, SEED2);
  const sheetDir = ensureDir(path.join(OUT, 'sheet2'));
  const rows = order.map((it, i) => {
    const label = LABELS2[i];
    fs.copyFileSync(path.join(OUT, it.full!), path.join(sheetDir, `${label}.jpg`));
    return { label, title: it.title, file: `${label}.jpg`, it };
  });
  await writeSheet(rows.map(({ label, title, file }) => ({ label, title, file })), sheetDir);
  const key = rows.map(({ label, it }) => ({
    label,
    cardId: it.cardId,
    round: it.kind,
    firstSheetLabel: it.kind === 'round1-original' ? key1.find((r) => r.cardId === it.cardId)!.label : out.find((r) => r.newCardId === it.cardId)!.originalLabel,
    title: it.title,
    look: it.kind === 'round2-face' ? it.rec!.look : key1.find((r) => r.cardId === it.cardId)!.look,
    font: it.kind === 'round2-face' ? it.rec!.lettered!.fontFamily : key1.find((r) => r.cardId === it.cardId)!.font,
    personRole: it.kind === 'round2-face' ? it.rec!.concept.personRole : '',
    seed: SEED2,
  }));
  writeJson(path.join(OUT, 'key-round2.json'), key);
  const header = Object.keys(key[0]);
  const csv = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  fs.writeFileSync(path.join(OUT, 'KEY-round2.csv'), [header.join(','), ...key.map((r) => header.map((h) => csv((r as Record<string, string | number>)[h])).join(','))].join('\n') + '\n');
  return out;
}
