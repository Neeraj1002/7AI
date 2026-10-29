import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { DISCLAIMER_ASSET_VERSION, DISCLAIMER_CLIP_PATH, DISCLAIMER_MANIFEST_PATH, type DisclaimerManifest } from './asset-spec';
import { buildDisclaimerChoice, deriveDisclaimerDefault, disclaimerEnabled } from './default';
import { DISCLAIMER_SENTENCE, DISCLAIMER_SENTENCE_SHA256 } from './sentence';
import { planSettingsChange } from '../run-pipeline/run-settings';

describe('shared disclaimer asset', () => {
  const manifest = JSON.parse(fs.readFileSync(DISCLAIMER_MANIFEST_PATH, 'utf8')) as DisclaimerManifest;
  it('the stored clip was made from the current sentence and version', () => {
    expect(manifest.sentence).toBe(DISCLAIMER_SENTENCE);
    expect(manifest.sentenceSha256).toBe(DISCLAIMER_SENTENCE_SHA256);
    expect(manifest.version).toBe(DISCLAIMER_ASSET_VERSION);
  });
  it('the clip file matches its recorded hash', () => {
    expect(createHash('sha256').update(fs.readFileSync(DISCLAIMER_CLIP_PATH)).digest('hex')).toBe(manifest.clipSha256);
  });
});

describe('script-and-visuals default', () => {
  const imagined = 'DOCUMENTED: a. IMAGINED: light and sounds only.';
  it('AI stills (every Long) default On', () => expect(deriveDisclaimerDefault({ briefText: 'DOCUMENTED: a', visualSource: 'ai-stills' })).toEqual({ enabled: true, reason: 'ai-visuals' }));
  it('imagined passages default On', () => expect(deriveDisclaimerDefault({ briefText: imagined, visualSource: 'stock-footage' }).reason).toBe('imagined'));
  it('a purely factual stock-footage brief defaults Off', () => expect(deriveDisclaimerDefault({ briefText: 'DOCUMENTED: a fact', visualSource: 'stock-footage' })).toEqual({ enabled: false, reason: 'factual' }));
  it('cannot tell defaults On', () => expect(deriveDisclaimerDefault({ briefText: 'make a video about bridges', visualSource: 'stock-footage' })).toEqual({ enabled: true, reason: 'unknown' }));
  it('an explicit tap overrides and keeps the reason and version', () => {
    const c = buildDisclaimerChoice({ briefText: imagined, visualSource: 'stock-footage', override: false });
    expect(c).toEqual({ enabled: false, assetVersion: DISCLAIMER_ASSET_VERSION, defaultReason: 'imagined' });
  });
  it('runs without the field render as Off', () => expect(disclaimerEnabled({})).toBe(false));
});

describe('settings change', () => {
  const ctx = (status: 'paused_gate1' | 'paused_gate2', enabled?: boolean) => ({
    run: { status, currentStage: 'gate1' as const, creationOptions: enabled === undefined ? {} : { disclaimer: { enabled, assetVersion: 'old', defaultReason: 'factual' as const } } },
    retryTarget: null,
    current: { voice: 'ash', audioLayer: null, visualSource: null, privacyStatus: 'private' as const, maxCostUsd: undefined, disclaimerEnabled: enabled },
    isLong: false, gate2Enabled: true, alreadyUploaded: false, by: { userId: null, name: null }, now: new Date(0),
  });
  it('flips the choice before the video is made and records the current version', () => {
    const plan = planSettingsChange({ disclaimerEnabled: true }, ctx('paused_gate1', false));
    expect(plan.merge.disclaimer).toEqual({ enabled: true, assetVersion: DISCLAIMER_ASSET_VERSION, defaultReason: 'factual' });
    expect(plan.changes[0]).toEqual({ label: 'Disclaimer', from: 'Off', to: 'On' });
  });
  it('treats a missing field as Off and refuses once the video is made', () => {
    expect(planSettingsChange({ disclaimerEnabled: false }, ctx('paused_gate1')).changes).toHaveLength(0);
    expect(() => planSettingsChange({ disclaimerEnabled: true }, ctx('paused_gate2', false))).toThrow(/already made/);
  });
});
