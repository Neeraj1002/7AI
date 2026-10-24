import { describe, it, expect } from 'vitest';
import { inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  assertConfirmed,
  assertDevEnvironment,
  DEFAULT_CEILING_USD,
  formatNearMisses,
  formatTable,
  parseCanaryArgs,
  proposeLimit,
  solidPng,
  type CanaryRow,
} from './canary-support';

// LLM Registry task, Part B (R8): the rules of `npm run llm:canary` that need no provider.
describe('canary arguments and safety rules', () => {
  it('refuses to run without --yes, and says how to', () => {
    expect(() => assertConfirmed(parseCanaryArgs([]))).toThrow(/--yes/);
    expect(() => assertConfirmed(parseCanaryArgs(['--yes']))).not.toThrow();
  });

  it('the default spend ceiling is $1, and a flag raises it', () => {
    expect(DEFAULT_CEILING_USD).toBe(1);
    expect(parseCanaryArgs(['--yes']).ceilingUsd).toBe(1);
    expect(parseCanaryArgs(['--yes', '--ceiling', '2.5']).ceilingUsd).toBe(2.5);
    expect(() => parseCanaryArgs(['--ceiling', 'abc'])).toThrow(/positive dollar amount/);
    expect(() => parseCanaryArgs(['--ceiling', '0'])).toThrow(/positive dollar amount/);
  });

  it('runs against the dev environment only', () => {
    expect(() => assertDevEnvironment({ NODE_ENV: 'development', DATABASE_URL: 'postgresql://u:p@localhost:5432/sevenai_dev' })).not.toThrow();
    expect(() => assertDevEnvironment({ DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/sevenai_llm_registry_check' })).not.toThrow();
    expect(() => assertDevEnvironment({})).not.toThrow();
    expect(() => assertDevEnvironment({ NODE_ENV: 'production' })).toThrow(/dev environment only/);
    expect(() => assertDevEnvironment({ DATABASE_URL: 'postgresql://u:p@localhost:5432/sevenai_preview' })).toThrow(/sevenai_preview/);
    expect(() => assertDevEnvironment({ DATABASE_URL: 'postgresql://u:p@db.example.com:5432/sevenai_dev' })).toThrow(/not this machine/);
    expect(() => assertDevEnvironment({ DATABASE_URL: 'not a url' })).toThrow(/could not read DATABASE_URL/);
  });
});

describe('the table and the near-miss list', () => {
  const row = (patch: Partial<CanaryRow>): CanaryRow => ({
    purpose: 'script-generation', fixture: 'S-1', model: 'claude-sonnet-5', limit: 16_000, outputTokens: 556,
    reasoningTokens: 0, percentUsed: 3.5, stopReason: 'stop', costUsd: 0.0123, ms: 4100, nearMiss: false, ...patch,
  });

  it('prints every column and a total', () => {
    const table = formatTable([row({}), row({ purpose: 'intake-parsing', limit: 4_000, outputTokens: 2_800, percentUsed: 70, nearMiss: true, reasoningTokens: null, costUsd: 0.01 })]);
    const lines = table.split('\n');
    expect(lines[0]).toBe('| purpose | fixture | model | limit | outputTokens | reasoningTokens | % used | stopReason | cost | ms |');
    expect(lines[2]).toBe('| script-generation | S-1 | claude-sonnet-5 | 16000 | 556 | 0 | 3.5% | stop | $0.0123 | 4100 |');
    expect(lines[3]).toContain('| n/a |');
    expect(lines[4]).toBe('| **total** | 2 calls |  |  |  |  |  |  | **$0.0223** |  |');
  });

  it('lists a call at 60% or more with a proposed limit (about three times its use, 4,000 floor)', () => {
    expect(formatNearMisses([row({})])).toBe('near-miss (60% of the limit or more): none');
    const text = formatNearMisses([row({ purpose: 'intake-parsing', fixture: 'L-1', limit: 4_000, outputTokens: 2_800, percentUsed: 70, nearMiss: true })]);
    expect(text).toContain('- intake-parsing (L-1): 2800 of 4000 (70.0%), proposed limit 9000');
    expect(proposeLimit(100)).toBe(4_000);
    expect(proposeLimit(2_800)).toBe(9_000);
  });
});

describe('the plain frame for the Video Intelligence row', () => {
  it('is a valid PNG of the size asked for', () => {
    const png = solidPng(8, 4, [10, 20, 30]);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.readUInt32BE(16)).toBe(8);
    expect(png.readUInt32BE(20)).toBe(4);
    const idatStart = png.indexOf(Buffer.from('IDAT'));
    const idatLength = png.readUInt32BE(idatStart - 4);
    const raw = inflateSync(png.subarray(idatStart + 4, idatStart + 4 + idatLength));
    expect(raw.length).toBe(4 * (1 + 8 * 3));
    expect([...raw.subarray(1, 4)]).toEqual([10, 20, 30]);
  });
});

describe('the package script', () => {
  it('npm run llm:canary exists and points at llm/canary.ts (inside llm/, so the output-cap scan still passes)', () => {
    const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['llm:canary']).toBe('tsx src/llm/canary.ts');
  });
});
