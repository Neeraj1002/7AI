// Sprint 5 Task 7 R4 — the Edit settings rules. Run with the server's vitest: cd studio && npx vitest run --root ../app
import { describe, it, expect } from 'vitest';
import {
  canEditSettings,
  changeLines,
  diffSettings,
  lockedSettings,
  madeReason,
  missingProcedure,
  needsRetryOnItsOwn,
  refusedChanges,
  settingRules,
  settingsChangeNotes,
  updateInput,
} from './run-settings';

const modes = (status: string, currentStage: string | null) => Object.fromEntries(settingRules({ status, currentStage }).map((r) => [r.key, r.mode]));

describe('which settings can change when (mirrors runs.updateSettings)', () => {
  it('a voice rejected before anything was made is free to change (the first acceptance run)', () => {
    expect(modes('needs_attention', 'video_generation')).toEqual({ voice: 'free', audioLayer: 'free', visualSource: 'free', privacyStatus: 'free', maxCostUsd: 'free' });
  });
  it('at Gate 1 everything allowed is free', () => {
    expect(new Set(Object.values(modes('paused_gate1', 'gate1')))).toEqual(new Set(['free']));
  });
  it('once the video is made voice, music and pictures are unavailable with the server reason; visibility and spend stay free', () => {
    for (const [status, stage] of [['paused_gate2', 'gate2'], ['needs_attention', 'video_review']] as const) {
      expect(modes(status, stage)).toEqual({ voice: 'locked', audioLayer: 'locked', visualSource: 'locked', privacyStatus: 'free', maxCostUsd: 'free' });
    }
    const voice = settingRules({ status: 'paused_gate2', currentStage: 'gate2' }).find((r) => r.key === 'voice')!;
    expect(voice.note).toBe("The video is already made, so the voice can't change here. Use Revise at Gate 2 to redo it.");
    expect(madeReason('music')).toContain('Use Revise at Gate 2');
  });
  it('a running, published or ended run cannot be changed', () => {
    for (const status of ['running', 'pending', 'completed', 'failed']) {
      expect(canEditSettings(status)).toBe(false);
      expect(new Set(Object.values(modes(status, null)))).toEqual(new Set(['locked']));
    }
  });
  it('topic, format and length are listed as unavailable with a reason', () => {
    const l = lockedSettings();
    expect(l.map((x) => x.label)).toEqual(['Topic', 'Format', 'Length']);
    expect(l.every((x) => x.reason.length > 0)).toBe(true);
  });
});

describe('changes', () => {
  const rules = settingRules({ status: 'paused_gate2', currentStage: 'gate2' });
  it('sends only what differs', () => {
    expect(diffSettings({ voice: 'ballad', maxCostUsd: 0.5 }, { voice: 'coral', maxCostUsd: 0.5 })).toEqual({ voice: 'coral' });
    expect(diffSettings({ voice: null }, { voice: null })).toEqual({});
  });
  it('shows the field reason instead of sending a change to a locked field', () => {
    expect(refusedChanges({ voice: 'coral' }, rules)).toEqual([madeReason('voice')]);
    expect(refusedChanges({ maxCostUsd: 1 }, rules)).toEqual([]);
  });
  it('builds the call input: no nulls, retry flag only when asked', () => {
    expect(updateInput('r1', { voice: 'coral', audioLayer: null, maxCostUsd: 1 }, false)).toEqual({ runId: 'r1', voice: 'coral', maxCostUsd: 1 });
    expect(updateInput('r1', { voice: 'coral' }, true)).toEqual({ runId: 'r1', voice: 'coral', retry: true });
  });
  it('words the change for the confirmation', () => {
    const from = { voice: 'Ballad', audioLayer: 'Calm', visualSource: 'AI images', privacyStatus: 'Private', maxCostUsd: '$0.50' };
    const to = { ...from, voice: 'Coral', maxCostUsd: '$1.00' };
    expect(changeLines(from, to, { voice: 'coral', maxCostUsd: 1 })).toEqual(['Voice: Ballad to Coral', 'Max spend: $0.50 to $1.00']);
  });
});

describe('server answers', () => {
  it('reads the recorded history, with who changed it, and ignores anything malformed', () => {
    const data = { settingsChanges: [{ at: 'x', by: { userId: 'u', name: 'Neeraj' }, changes: [{ label: 'Voice', from: 'Ballad', to: 'Coral' }, { nope: 1 }] }] };
    expect(settingsChangeNotes(data)).toEqual(['Voice changed from Ballad to Coral (by Neeraj)']);
    expect(settingsChangeNotes({ settingsChanges: [] })).toEqual([]);
    expect(settingsChangeNotes(undefined)).toEqual([]);
  });
  it('recognises an old server and the legacy planner recovery refusal', () => {
    expect(missingProcedure(new Error('No "mutation"-procedure on path "runs.updateSettings"'))).toBe(true);
    expect(missingProcedure(new Error('Voice must be one of nova, shimmer'))).toBe(false);
    expect(needsRetryOnItsOwn(new Error('This run needs its planner recovery started with Retry on its own; save the settings first, then Retry.'))).toBe(true);
    expect(needsRetryOnItsOwn(new Error('Nothing to change'))).toBe(false);
  });
});
