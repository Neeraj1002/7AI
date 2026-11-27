import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { PROMPT_INDEX } from './prompt-index';
import { PURPOSES } from './types';

const SRC = join(__dirname, '..');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : files(full);
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [full] : [];
  });

describe('prompt index', () => {
  it('has an entry, with files that exist, for every purpose', () => {
    expect(Object.keys(PROMPT_INDEX).sort()).toEqual([...PURPOSES].sort());
    for (const purpose of PURPOSES) {
      expect(PROMPT_INDEX[purpose], purpose).toContain('prompts/system-prompts.ts');
      for (const file of PROMPT_INDEX[purpose]) expect(existsSync(join(SRC, file)), `${purpose}: ${file}`).toBe(true);
    }
  });

  it('lists every file that calls a purpose', () => {
    const missing: string[] = [];
    for (const file of files(SRC).filter((f) => !f.startsWith(__dirname + sep))) {
      const rel = relative(SRC, file).split(sep).join('/');
      for (const match of readFileSync(file, 'utf8').matchAll(/purpose:\s*['"]([a-z-]+)['"]/g)) {
        const purpose = match[1] as (typeof PURPOSES)[number];
        if ((PURPOSES as readonly string[]).includes(purpose) && !PROMPT_INDEX[purpose].includes(rel)) missing.push(`${purpose}: ${rel}`);
      }
    }
    expect(missing).toEqual([]);
  }, 30_000);
});
