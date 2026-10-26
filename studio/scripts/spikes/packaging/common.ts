// Sprint 6 Task 1 spike: shared plumbing. Throwaway; nothing in studio/src imports this.
//
// Two modes. Default is STUB: no provider is called (images come from the stub in ai-visuals/stub.ts, text
// replies are canned), so the whole flow can be rehearsed for free. `--live` calls the real LLM Registry
// (callLLM) and the real image generator, and every paid call goes through the spend ledger below.
//
// This file must be the first import of the entry point: it sets AI_VISUALS_STUB before src/config/env reads it.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const LIVE = process.argv.includes('--live');
if (!LIVE) process.env.AI_VISUALS_STUB = '1';

// Hard cap for the whole spike (task doc, "Spend"). A paid step that could cross it throws instead.
export const SPEND_CEILING_USD = 3.0;

export const SPIKE_DIR = __dirname;
export const REPO_ROOT = path.resolve(__dirname, '../../../..');
export const OUT = path.join(SPIKE_DIR, 'out', LIVE ? 'live' : 'stub');
export const CACHE_DIR = path.join(OUT, 'cache');
export const ASSETS_DIR = path.join(REPO_ROOT, 'docs', 'execution', 'sprint6', 'reports', 'task1-spike-assets');

export function ensureDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
ensureDir(CACHE_DIR);

export function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}
export function writeJson(file: string, data: unknown): void {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}
export function sha(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 16);
}

export class SpendCeilingError extends Error {}

type SpendEntry = { label: string; usd: number; at: string };

// Every paid call is added here and the running total is stored next to the outputs, so a re-run (which
// reuses cached replies for free) still counts everything already spent against the one ceiling.
export class Ledger {
  private readonly file = path.join(OUT, 'spend.json');
  entries: SpendEntry[] = fs.existsSync(this.file) ? readJson<SpendEntry[]>(this.file) : [];

  total(): number {
    return this.entries.reduce((sum, e) => sum + e.usd, 0);
  }
  // Refuse a step before it runs when its worst case would cross the ceiling.
  assertRoom(estimateUsd: number, label: string): void {
    if (LIVE && this.total() + estimateUsd > SPEND_CEILING_USD) {
      throw new SpendCeilingError(
        `Spend ceiling: $${this.total().toFixed(4)} spent, next step "${label}" could cost $${estimateUsd.toFixed(4)}, ceiling $${SPEND_CEILING_USD.toFixed(2)}. Stop and report.`,
      );
    }
  }
  add(label: string, usd: number): void {
    this.entries.push({ label, usd, at: new Date().toISOString() });
    writeJson(this.file, this.entries);
  }
  byPrefix(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const e of this.entries) {
      const key = e.label.split(':')[0];
      out[key] = (out[key] ?? 0) + e.usd;
    }
    return out;
  }
}
export const ledger = new Ledger();

// Free-for-reruns cache of paid replies, keyed by what was sent.
export async function cached<T>(key: string, produce: () => Promise<{ value: T; costUsd: number; label: string }>): Promise<T> {
  const file = path.join(CACHE_DIR, `${sha(key)}.json`);
  if (fs.existsSync(file)) return readJson<T>(file);
  const { value, costUsd, label } = await produce();
  writeJson(file, value);
  if (costUsd > 0) ledger.add(label, costUsd);
  return value;
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Small seeded shuffle (mulberry32) so the blind order is reproducible from a number kept in the key file.
export function seededShuffle<T>(items: T[], seed: number): T[] {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
