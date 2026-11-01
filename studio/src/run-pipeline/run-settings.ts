import { TTS_VOICES } from '../media';
import { STAGE_NAMES } from '../types';
import type { CreationOptions, PipelineRun, StageName } from '../types';
import type { PrivacyStatus } from '../agents/publishing';

// Sprint 5 Task 8 (R13): changing a run's settings while it waits (runs.updateSettings). This file is the rules and the
// wording, pure so every rule is tested without a database. The router validates, re-runs preflight and writes once.
//
// A change is allowed only when it cannot invalidate finished work. The one-line reason for a refusal says what to
// do instead. Max spend reuses runs.retry's validation (validateMaxCostUsd in runs.ts); there is one way to change it.

export const SETTINGS_ALLOWED_STATUSES = ['needs_attention', 'paused_gate1', 'paused_gate2', 'paused_angle'] as const;

export class SettingsRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettingsRejected';
  }
}

// The visibility a run publishes with, in one place: the per-run value (set with runs.updateSettings, and written by
// Gate 2 when it approves), else what Gate 2 recorded, else the channel default. Publishing, runs.updateSettings
// ("from") and the tests all use this.
export function effectivePrivacy(
  creationOptions: Pick<CreationOptions, 'privacyStatus'> | null | undefined,
  gate2Output: { privacyStatus?: PrivacyStatus } | null | undefined,
  fallback: PrivacyStatus,
): PrivacyStatus {
  return creationOptions?.privacyStatus ?? gate2Output?.privacyStatus ?? fallback;
}

export type SettingsInput = {
  voice?: string;
  audioLayer?: string;
  visualSource?: string;
  privacyStatus?: PrivacyStatus;
  maxCostUsd?: number;
};

export type SettingChange = { label: string; from: string; to: string };

export type SettingsChangeEntry = {
  at: string;
  by: { userId: string | null; name: string | null };
  changes: SettingChange[];
};

const VISUAL_LABELS: Record<string, string> = { 'stock-footage': 'Stock footage', 'ai-stills': 'AI images' };
const PRIVACY_LABELS: Record<PrivacyStatus, string> = { private: 'Private', unlisted: 'Unlisted', public: 'Public' };
const usd = (n: number | undefined) => (n === undefined ? 'No limit' : `$${n.toFixed(2)}`);
const voiceLabel = (key: string) => TTS_VOICES[key]?.label ?? key;

// True when the video this run is waiting on (or has parked after) is already made, so a voice, music or picture
// change would not apply to it. At Gate 2 the way to redo it is Revise; after a failed review that Retry would
// not redo, the same. A failed stage at or before video generation, and Gate 1, have nothing made yet.
export function videoAlreadyMade(run: Pick<PipelineRun, 'status' | 'currentStage'>, retryTarget: StageName | null): boolean {
  if (run.status === 'paused_gate2') return true;
  if (run.status === 'needs_attention') {
    const at = retryTarget ?? run.currentStage;
    return at ? STAGE_NAMES.indexOf(at) > STAGE_NAMES.indexOf('video_generation') : false;
  }
  return false;
}

export type SettingsPlanContext = {
  run: Pick<PipelineRun, 'status' | 'currentStage' | 'creationOptions'>;
  retryTarget: StageName | null;
  // What the run uses today (resolved), for the "from" side.
  current: { voice: string; audioLayer: string | null; visualSource: string | null; privacyStatus: PrivacyStatus; maxCostUsd: number | undefined };
  isLong: boolean;
  gate2Enabled: boolean;
  // YouTube already has this video, so its visibility is no longer this run's to set.
  alreadyUploaded: boolean;
  by: SettingsChangeEntry['by'];
  now: Date;
};

export type SettingsPlan = {
  changes: SettingChange[];
  // The creationOptions fields to merge: the new values, the history entry and the refreshed resolvedOptions.
  merge: Partial<CreationOptions>;
};

// Throws SettingsRejected (one line) for a change that would invalidate finished work or is not allowed. Settings
// equal to what the run already uses are dropped, so a repeated save changes nothing. `maxCostUsd` is validated by
// the caller with runs.retry's own rule; here it is only recorded.
export function planSettingsChange(input: SettingsInput, ctx: SettingsPlanContext): SettingsPlan {
  const made = videoAlreadyMade(ctx.run, ctx.retryTarget);
  const changes: SettingChange[] = [];
  const merge: Partial<CreationOptions> = {};

  const refuseMade = (what: string) => {
    if (made) throw new SettingsRejected(`The video is already made, so the ${what} can't change here. Use Revise at Gate 2 to redo it.`);
  };

  if (input.voice !== undefined && input.voice !== ctx.current.voice) {
    refuseMade('voice');
    changes.push({ label: 'Voice', from: voiceLabel(ctx.current.voice), to: voiceLabel(input.voice) });
    merge.voice = input.voice;
  }
  if (input.audioLayer !== undefined && input.audioLayer !== ctx.current.audioLayer) {
    refuseMade('music');
    changes.push({ label: 'Music', from: ctx.current.audioLayer ?? 'Auto', to: input.audioLayer });
    merge.audioLayer = input.audioLayer;
  }
  if (input.visualSource !== undefined && input.visualSource !== ctx.current.visualSource) {
    refuseMade('pictures');
    if (ctx.isLong && input.visualSource === 'stock-footage') {
      throw new SettingsRejected('Long videos use AI stills only; stock footage is not available for them');
    }
    changes.push({ label: 'Pictures', from: VISUAL_LABELS[ctx.current.visualSource ?? ''] ?? 'Auto', to: VISUAL_LABELS[input.visualSource] ?? input.visualSource });
    merge.visualSource = input.visualSource;
  }
  if (input.privacyStatus !== undefined && input.privacyStatus !== ctx.current.privacyStatus) {
    if (ctx.alreadyUploaded) throw new SettingsRejected("The video is already on YouTube, so its visibility can't change here.");
    // With Gate 2 off a video publishes without a person looking at it, which is only allowed privately (channels.update).
    if (!ctx.gate2Enabled && input.privacyStatus !== 'private') {
      throw new SettingsRejected('Gate 2 is off for this channel, so a video can only be published privately.');
    }
    changes.push({ label: 'YouTube visibility', from: PRIVACY_LABELS[ctx.current.privacyStatus], to: PRIVACY_LABELS[input.privacyStatus] });
    merge.privacyStatus = input.privacyStatus;
  }
  if (input.maxCostUsd !== undefined && input.maxCostUsd !== ctx.current.maxCostUsd) {
    changes.push({ label: 'Max spend', from: usd(ctx.current.maxCostUsd), to: usd(input.maxCostUsd) });
    merge.maxCostUsd = input.maxCostUsd;
  }

  if (changes.length > 0) {
    merge.settingsChanges = [
      ...(ctx.run.creationOptions?.settingsChanges ?? []),
      { at: ctx.now.toISOString(), by: ctx.by, changes },
    ];
    const resolved = ctx.run.creationOptions?.resolvedOptions;
    if (resolved) {
      merge.resolvedOptions = {
        ...resolved,
        ...(merge.voice && { voice: { key: merge.voice, label: voiceLabel(merge.voice), from: 'run' } }),
        ...(merge.visualSource && { visualSource: { value: merge.visualSource, label: VISUAL_LABELS[merge.visualSource] ?? 'Auto', from: 'run' } }),
        ...(merge.audioLayer && { music: { label: merge.audioLayer, from: 'run' } }),
      };
    }
  }
  return { changes, merge };
}
