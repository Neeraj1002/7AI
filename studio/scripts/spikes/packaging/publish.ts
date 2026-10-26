// Copies the finished spike outputs into the report's asset folder (live runs only; at most 15 MB in total).
// sheet/ is what the founder rates; after-rating/ holds the key, prompts, critic reads and every card by name.
import fs from 'node:fs';
import path from 'node:path';
import { ASSETS_DIR, LIVE, OUT, ensureDir, readJson } from './common';
import type { ScriptRecord } from './stages';

const MAX_BYTES = 15 * 1024 * 1024;

function dirSize(dir: string): number {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return total;
}

export async function publish(): Promise<void> {
  if (!LIVE) throw new Error('publish is for live runs only');
  fs.rmSync(ASSETS_DIR, { recursive: true, force: true });
  const sheet = ensureDir(path.join(ASSETS_DIR, 'sheet'));
  const after = ensureDir(path.join(ASSETS_DIR, 'after-rating'));
  for (const f of fs.readdirSync(path.join(OUT, 'sheet'))) fs.copyFileSync(path.join(OUT, 'sheet', f), path.join(sheet, f));
  for (const f of ['KEY.csv', 'key.json', 'packages.json', 'prune.json', 'cards.json', 'lettered.json', 'critic.json', 'spend.json', 'llm-calls.json']) {
    if (fs.existsSync(path.join(OUT, f))) fs.copyFileSync(path.join(OUT, f), path.join(after, f));
  }
  const scripts = ensureDir(path.join(after, 'scripts'));
  for (const s of readJson<ScriptRecord[]>(path.join(OUT, 'scripts.json'))) {
    fs.writeFileSync(path.join(scripts, `${s.id}.txt`), `${s.source}\n${s.words} words\n\n${s.scriptText}\n`);
  }
  const cards = ensureDir(path.join(after, 'cards'));
  for (const f of fs.readdirSync(path.join(OUT, 'cards'))) fs.copyFileSync(path.join(OUT, 'cards', f), path.join(cards, f));
  const size = dirSize(ASSETS_DIR);
  console.log(`published ${(size / 1024 / 1024).toFixed(2)} MB to ${path.relative(process.cwd(), ASSETS_DIR)}`);
  if (size > MAX_BYTES) throw new Error(`assets are ${(size / 1024 / 1024).toFixed(1)} MB, over the 15 MB limit`);
}

// Round 2: adds sheet2/ (what the founder rates) and after-rating/round2/ (key, concepts, prompts, face checks).
// Additive: leaves round 1's published files alone.
export async function publishRound2(): Promise<void> {
  if (!LIVE) throw new Error('publish is for live runs only');
  const sheet2 = ensureDir(path.join(ASSETS_DIR, 'sheet2'));
  const after = ensureDir(path.join(ASSETS_DIR, 'after-rating', 'round2'));
  for (const f of fs.readdirSync(path.join(OUT, 'sheet2'))) fs.copyFileSync(path.join(OUT, 'sheet2', f), path.join(sheet2, f));
  for (const f of ['KEY-round2.csv', 'key-round2.json', 'round2.json']) fs.copyFileSync(path.join(OUT, f), path.join(after, f));
  const size = dirSize(ASSETS_DIR);
  console.log(`assets now ${(size / 1024 / 1024).toFixed(2)} MB`);
  if (size > MAX_BYTES) throw new Error('assets are over the 15 MB limit');
}
