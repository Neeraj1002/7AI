import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// LLM Registry task (R4): the registry owns every output limit. No file outside src/llm/ may define an
// output-token cap constant or pass a number as maxTokens / maxOutputTokens. There is no exceptions list.
const SRC = join(__dirname, '..');
const LLM_DIR = __dirname;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : sourceFiles(full);
    return name.endsWith('.ts') ? [full] : [];
  });
}

const CAP_CONSTANT = /\b(?:const|let|var)\s+[A-Za-z0-9_]*(?:MAX_?TOKENS|MAX_?OUTPUT_?TOKENS|OUTPUT_?TOKEN_?(?:CAP|LIMIT))[A-Za-z0-9_]*\s*[:=]/i;
const NUMERIC_LIMIT = /\bmax(?:Output)?Tokens\s*:\s*[0-9_]+\b/;

describe('no file outside src/llm/ defines an output-token cap', () => {
  const outside = sourceFiles(SRC).filter((file) => !file.startsWith(LLM_DIR + sep) && !file.endsWith('.test.ts'));

  it('scans the real source tree', () => {
    expect(outside.length).toBeGreaterThan(50);
  });

  it('defines no cap constant and passes no numeric maxTokens / maxOutputTokens', () => {
    const found: string[] = [];
    for (const file of outside) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (CAP_CONSTANT.test(line) || NUMERIC_LIMIT.test(line)) found.push(`${relative(SRC, file)}:${index + 1}: ${line.trim()}`);
        });
    }
    expect(found).toEqual([]);
    // Reads the whole source tree; under a loaded full run the default 5 s was not enough (seen twice in Sprint 6 Task 1).
  }, 30_000);

  it('the patterns catch what they are meant to catch', () => {
    expect(CAP_CONSTANT.test('export const SCRIPT_MAX_TOKENS = 4096;')).toBe(true);
    expect(CAP_CONSTANT.test('const LONG_CHAPTER_PLAN_MAX_TOKENS = 8192;')).toBe(true);
    expect(NUMERIC_LIMIT.test('    maxTokens: 512,')).toBe(true);
    expect(NUMERIC_LIMIT.test('maxOutputTokens: 16_000')).toBe(true);
    expect(NUMERIC_LIMIT.test('maxTokens: llm.maxOutputTokens,')).toBe(false);
  });
});
