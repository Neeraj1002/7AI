import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CreationOptionsSchema } from '../types/pipeline.types';
import { deriveContainsSyntheticMedia } from '../run-pipeline/state-machine';
import { DISCLAIMER_ASSET_VERSION } from './asset-spec';
import { buildDisclaimerChoice, disclaimerEnabled } from './default';

const dir = __dirname;
const sources = fs.readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')] as const);

describe('platform asset: no channel, profile, run pick or catalog voice feeds it', () => {
  it.each(sources)('%s imports nothing from channels, profiles, the voice catalog or the registry', (_f, src) => {
    expect(src).not.toMatch(/from '\.\.\/(channel-profile|media\/voice-catalog|media\/registry|media'|models)/);
    expect(src).not.toMatch(/\bchannel(Id)?\b.*=|\bprofile\b\s*[:=]/i);
  });
  it('the splice has no voice or channel parameter, so two channels with different narration voices get the same clip', async () => {
    const splice = fs.readFileSync(path.join(dir, 'splice.ts'), 'utf8');
    const params = /spliceDisclaimerIntoNarration\(params: \{([^}]*)\}/.exec(splice)![1];
    expect(params).not.toMatch(/voice|channel|profile/i);
  });
});

describe('the YouTube AI-use declaration is independent of the toggle', () => {
  it('is derived from the plan only, whatever the choice', () => {
    expect(deriveContainsSyntheticMedia({ plan: { visualSource: 'ai-stills' } })).toBe(true);
    expect(deriveContainsSyntheticMedia({ plan: { visualSource: 'stock-footage' } })).toBe(false);
    expect(deriveContainsSyntheticMedia.length).toBe(1); // takes no disclaimer input
  });
});

describe('persistence and compatibility', () => {
  it('the choice and version survive a save, reload and restart (JSON round trip)', () => {
    const choice = buildDisclaimerChoice({ briefText: 'IMAGINED: light.', visualSource: 'stock-footage' });
    const reloaded = CreationOptionsSchema.parse(JSON.parse(JSON.stringify({ disclaimer: choice })));
    expect(reloaded.disclaimer).toEqual({ enabled: true, assetVersion: DISCLAIMER_ASSET_VERSION, defaultReason: 'imagined' });
  });
  it('runs created or in flight before this shipped parse unchanged and render without it', () => {
    const old = CreationOptionsSchema.parse({ voice: 'ash', visualSource: 'stock-footage' });
    expect(old.disclaimer).toBeUndefined();
    expect(disclaimerEnabled(old)).toBe(false);
  });
  it('the default does not depend on whether Gate 1 is enabled (it is set at creation, before any gate)', () => {
    const a = buildDisclaimerChoice({ briefText: 'DOCUMENTED: a fact', visualSource: 'stock-footage' });
    expect(a.enabled).toBe(false);
    expect(buildDisclaimerChoice.length).toBe(1);
  });
  it('two videos on one channel can differ', () => {
    const a = buildDisclaimerChoice({ briefText: 'IMAGINED: light', visualSource: 'stock-footage' });
    const b = buildDisclaimerChoice({ briefText: 'DOCUMENTED: fact', visualSource: 'stock-footage' });
    expect([a.enabled, b.enabled]).toEqual([true, false]);
    expect(a.assetVersion).toBe(b.assetVersion);
  });
});
