// Sprint 5 Task 7 R4 — the Edit settings rules. Run with the server's vitest: cd studio && npx vitest run --root ../app
import { describe, it, expect } from 'vitest';
import { canEditSettings, changeLines, diffSettings, lockedSettings, missingProcedure, redoesWork, refusedChanges, settingRules, settingsChangeNotes } from './run-settings';

const modes = (status: string, stages: { stageName: string; status: string }[]) =>
  Object.fromEntries(settingRules({ status, stages }).map((r) => [r.key, r.mode]));

describe('which settings can change when', () => {
  it('a voice rejected before anything was made is free to change (the first acceptance run)', () => {
    const m = modes('needs_attention', [{ stageName: 'video_generation', status: 'failed' }]);
    expect(m.voice).toBe('free');
    expect(m.audioLayer).toBe('free');
    expect(m.visualSource).toBe('revision'); // a failed attempt may already have made pictures
    expect(m.privacyStatus).toBe('free');
    expect(m.maxCostUsd).toBe('free');
  });
  it('before the video stage everything allowed is free', () => {
    const m = modes('paused_gate1', [{ stageName: 'script_generation', status: 'completed' }]);
    expect(Object.values(m)).toEqual(['free', 'free', 'free', 'free', 'free']);
  });
  it('at Gate 2 voice, music and pictures are revisions; visibility and spend stay free', () => {
    const m = modes('paused_gate2', [{ stageName: 'video_generation', status: 'completed' }]);
    expect(m).toEqual({ voice: 'revision', audioLayer: 'revision', visualSource: 'revision', privacyStatus: 'free', maxCostUsd: 'free' });
  });
  it('a running, published or ended run cannot be changed', () => {
    for (const status of ['running', 'pending', 'completed', 'failed']) {
      expect(canEditSettings(status)).toBe(false);
      expect(new Set(Object.values(modes(status, [])))).toEqual(new Set(['locked']));
    }
  });
  it('topic, format and length are listed as unavailable with a reason', () => {
    const l = lockedSettings();
    expect(l.map((x) => x.label)).toEqual(['Topic', 'Format', 'Length']);
    expect(l.every((x) => x.reason.length > 0)).toBe(true);
  });
});

describe('changes', () => {
  const rules = settingRules({ status: 'paused_gate2', stages: [{ stageName: 'video_generation', status: 'completed' }] });
  it('sends only what differs', () => {
    expect(diffSettings({ voice: 'ballad', maxCostUsd: 0.5 }, { voice: 'coral', maxCostUsd: 0.5 })).toEqual({ voice: 'coral' });
    expect(diffSettings({ voice: null }, { voice: null })).toEqual({});
  });
  it('names the finished work a change redoes', () => {
    expect(redoesWork({ voice: 'coral' }, rules).map((r) => r.key)).toEqual(['voice']);
    expect(redoesWork({ maxCostUsd: 1 }, rules)).toEqual([]);
  });
  it('refuses a change to a locked rule', () => {
    const locked = settingRules({ status: 'running', stages: [] });
    expect(refusedChanges({ voice: 'coral' }, locked)).toHaveLength(1);
    expect(refusedChanges({ voice: 'coral' }, rules)).toEqual([]);
  });
  it('words the change for the confirmation', () => {
    const from = { voice: 'Ballad', audioLayer: 'Calm', visualSource: 'AI images', privacyStatus: 'Private', maxCostUsd: '$0.50' };
    const to = { ...from, voice: 'Coral', maxCostUsd: '$1.00' };
    expect(changeLines(from, to, { voice: 'coral', maxCostUsd: 1 })).toEqual(['Voice: Ballad to Coral', 'Max spend: $0.50 to $1.00']);
  });
});

describe('recorded changes in the history', () => {
  it('reads the server list and ignores anything malformed', () => {
    expect(settingsChangeNotes({ settingsChanges: [{ at: 'x', changes: [{ label: 'Voice', from: 'Ballad', to: 'Coral' }, { nope: 1 }] }] })).toEqual(['Voice changed from Ballad to Coral']);
    expect(settingsChangeNotes({})).toEqual([]);
    expect(settingsChangeNotes(undefined)).toEqual([]);
  });
});

describe('older server', () => {
  it('recognises the missing call', () => {
    expect(missingProcedure(new Error('No "mutation"-procedure on path "runs.updateSettings"'))).toBe(true);
    expect(missingProcedure(new Error('Voice must be one of nova, shimmer'))).toBe(false);
    expect(missingProcedure('x')).toBe(false);
  });
});
