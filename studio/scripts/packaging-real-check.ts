// Sprint 6 Task 1 (PR A): the live check. Runs R1 to R3 (brief, six concepts, code checks, cold reader, rendering and
// lettering) on a real approved or generated script, with the real LLM Registry calls and the real image model, and
// writes everything to studio/data/packaging-real-check/<name>/ (gitignored) so the thumbnails can be looked at.
//
//   npx tsx scripts/packaging-real-check.ts --script <file> --name <name> [--look neutral|guided|styled] --live
//
// Spends real money (about $0.09 per run: text calls plus up to three images). Without --live it prints the plan and
// exits. Looks are generic test profiles, not channels: neutral = no profile; guided = title guidance only;
// styled = a style text and title guidance. It does not read or write the database.
import fs from 'node:fs';
import path from 'node:path';
import '../src/config/env'; // loads .env.local before anything reads the environment
import { buildPackaging } from '../src/packaging/build';
import { thumbnailsDir } from '../src/packaging/build';
import { DATA_DIR } from '../src/config/paths';

// This script's own cap; the whole task's live-check ceiling is the founder's $2.00 and every run counts against it.
const MAX_SPEND_USD = 0.4;

const LOOKS = {
  neutral: {},
  guided: { titleGuidance: 'Plain, specific and honest. One question the video answers. At most 60 characters, sentence case, no emoji.' },
  styled: {
    stylePrompt: 'Cinematic documentary still shot on a 35mm lens at eye level, shallow depth of field, fine film grain. Soft natural light, warm highlights and cool shadows. Muted natural colours, weathered and lived-in, never glossy.',
    titleGuidance: 'A human moment plus one soft link to today, taken from the script. 35 to 55 characters, never over 60. Sentence case, no emoji, no clickbait words.',
  },
} as const;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function readScript(file: string): string {
  const text = fs.readFileSync(file, 'utf8').replace(/\r/g, '');
  if (file.endsWith('.json')) return (JSON.parse(text) as { scriptText: string }).scriptText;
  // The spike's script files carry a two-line header before a blank line.
  const split = text.indexOf('\n\n');
  return split > 0 && split < 400 && /words\b/.test(text.slice(0, split)) ? text.slice(split).trim() : text.trim();
}

async function main() {
  const file = arg('script');
  const name = arg('name') ?? 'check';
  const lookKey = (arg('look') ?? 'neutral') as keyof typeof LOOKS;
  if (!file || !(lookKey in LOOKS)) throw new Error('usage: --script <file> --name <name> [--look neutral|guided|styled] [--live]');
  const live = process.argv.includes('--live');
  console.log(`script ${file}, look ${lookKey}, cap $${MAX_SPEND_USD}${live ? '' : ' (dry run: nothing is called)'}`);
  if (!live) return;

  const scriptText = readScript(file);
  const runId = `real-check-${name}`;
  fs.rmSync(thumbnailsDir(runId), { recursive: true, force: true });
  let spent = 0;
  const events: string[] = [];
  const out = await buildPackaging({
    runId,
    scriptText,
    look: LOOKS[lookKey],
    imagesAllowed: 3,
    hooks: {
      onText: async (label, calls) => {
        const cost = calls.reduce((s, c) => s + Number(c.costUsd), 0);
        spent += cost;
        events.push(`text ${label} $${cost.toFixed(4)} (${calls.map((c) => c.model).join(', ')})`);
        if (spent >= MAX_SPEND_USD) throw new Error(`spend cap $${MAX_SPEND_USD} reached at ${label}`);
      },
      onImage: async (info) => {
        spent += info.costUsd;
        events.push(`image ${info.packageId} $${info.costUsd.toFixed(4)} (${info.model})`);
      },
      checkpoint: async () => undefined,
    },
  });
  const dest = path.join(DATA_DIR, 'packaging-real-check', name);
  fs.mkdirSync(dest, { recursive: true });
  for (const p of out.packages) for (const f of Object.values(p.files)) fs.copyFileSync(path.join(thumbnailsDir(runId), f), path.join(dest, `${p.id}-${path.basename(f).split('-').pop()}`));
  fs.writeFileSync(path.join(dest, 'result.json'), JSON.stringify(out, null, 2));
  console.log(events.join('\n'));
  console.log(`status ${out.status}${out.reason ? `: ${out.reason}` : ''}; face ${out.faceMode}; typeface ${out.typeface}; total $${spent.toFixed(4)}`);
  if (out.brief) console.log(`brief: ${out.brief.question} | believe: ${out.brief.whatPeopleBelieve} | record: ${out.brief.whatTheRecordSays}`);
  for (const d of out.dropped) console.log(`dropped [${d.stage}] ${d.device} "${d.title}": ${d.reasons.join(' ')}`);
  for (const p of out.packages) {
    console.log(`PACKAGE ${p.id} ${p.device}: "${p.title}" | ${p.lettering.words}${p.lettering.subline ? ` / ${p.lettering.subline}` : ''} | asks: ${p.question} | answered: ${p.answeredAt.label} | sidebar ${p.lettering.mainPxSidebar}px | $${p.imageCostUsd.toFixed(4)}`);
  }
  console.log(`files in ${dest}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
