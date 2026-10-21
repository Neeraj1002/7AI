// Sprint 5 Task 7 R4 — change a setting on a stopped or waiting run without cancelling it.
//
// Backend (Task 8 R13, PR #107): `runs.updateSettings({ runId, voice?, audioLayer?, visualSource?, privacyStatus?,
// maxCostUsd?, retry? })`. It validates everything first and saves nothing if it refuses; `retry: true` retries the
// stopped step in the same call. Voice, music and pictures are refused once the video is made, with a one-line reason
// that points to Revise at Gate 2; that reason is shown as sent and those fields are marked unavailable. A run in legacy
// planner recovery must be retried on its own: the server says so, and the app saves first and then asks for Retry.
// Topic, format, length and the approved script are never changeable here. History: `runs.get.settingsChanges`.
import type { inferRouterInputs } from '@trpc/server';
import type { AppRouter } from '../../studio/src/api/router';

export type SettingKey = 'voice' | 'audioLayer' | 'visualSource' | 'privacyStatus' | 'maxCostUsd';

export type SettingMode = 'free' | 'locked';
export type SettingRule = { key: SettingKey; label: string; mode: SettingMode; note: string };
export type LockedSetting = { label: string; reason: string };

export type SettingsChange = Partial<{
  voice: string | null;
  audioLayer: string | null;
  visualSource: string | null;
  privacyStatus: 'private' | 'unlisted' | 'public';
  maxCostUsd: number;
}>;

const EDITABLE_STATUSES = ['needs_attention', 'paused_gate1', 'paused_gate2'];

export function canEditSettings(status: string): boolean {
  return EDITABLE_STATUSES.includes(status);
}

const LABEL: Record<SettingKey, string> = {
  voice: 'Voice',
  audioLayer: 'Music',
  visualSource: 'Pictures',
  privacyStatus: 'YouTube visibility',
  maxCostUsd: 'Max spend',
};
export const SETTING_LABEL = LABEL;

const AFTER_VIDEO = ['video_review', 'gate2', 'publishing', 'analytics'];

/** The video this run waits on (or has parked after) is already made: a voice, music or picture change would not apply. */
export function videoAlreadyMade(args: { status: string; currentStage?: string | null }): boolean {
  if (args.status === 'paused_gate2') return true;
  return args.status === 'needs_attention' && AFTER_VIDEO.includes(args.currentStage ?? '');
}

/** The server's sentence for this refusal (runs.updateSettings), shown on the unavailable field. */
export const madeReason = (what: string) => `The video is already made, so the ${what} can't change here. Use Revise at Gate 2 to redo it.`;

/** What each changeable setting allows at this point of the run. The server re-checks every one of these. */
export function settingRules(args: { status: string; currentStage?: string | null }): SettingRule[] {
  const keys = Object.keys(LABEL) as SettingKey[];
  if (!canEditSettings(args.status)) {
    return keys.map((key) => ({ key, label: LABEL[key], mode: 'locked' as const, note: 'Only a stopped or waiting run can be changed.' }));
  }
  const made = videoAlreadyMade(args);
  const rule = (key: SettingKey, what: string | null, free: string): SettingRule =>
    what && made ? { key, label: LABEL[key], mode: 'locked', note: madeReason(what) } : { key, label: LABEL[key], mode: 'free', note: free };
  return [
    rule('voice', 'voice', 'Applies to the narration made next.'),
    rule('audioLayer', 'music', 'Applies to the render made next.'),
    rule('visualSource', 'pictures', 'Applies to the pictures made next.'),
    rule('privacyStatus', null, 'Applied when the video is uploaded.'),
    rule('maxCostUsd', null, 'Takes effect on the next paid step.'),
  ];
}

/** Settings that cannot change once a script exists, with the reason in one line. */
export function lockedSettings(): LockedSetting[] {
  return [
    { label: 'Topic', reason: 'Changing it would redo the script. Start a new brief instead.' },
    { label: 'Format', reason: 'Changing it would redo the script. Start a new brief instead.' },
    { label: 'Length', reason: 'Changing it would redo the script. Start a new brief instead.' },
  ];
}

/** Only the entries that differ from what the run has now. */
export function diffSettings(current: SettingsChange, next: SettingsChange): SettingsChange {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(next) as SettingKey[]) {
    if ((current[key] ?? null) !== (next[key] ?? null)) out[key] = next[key];
  }
  return out as SettingsChange;
}

/** A change to a locked field is stopped here with the field's own reason; the server would refuse it as well. */
export function refusedChanges(change: SettingsChange, rules: readonly SettingRule[]): string[] {
  return (Object.keys(change) as SettingKey[]).flatMap((key) => {
    const rule = rules.find((r) => r.key === key);
    return !rule || rule.mode === 'locked' ? [rule?.note ?? `${LABEL[key]} cannot be changed.`] : [];
  });
}

/** "Voice: Ballad to Coral" lines for the confirmation and the step history. */
export function changeLines(from: Record<SettingKey, string>, to: Record<SettingKey, string>, change: SettingsChange): string[] {
  return (Object.keys(change) as SettingKey[]).map((key) => `${LABEL[key]}: ${from[key]} to ${to[key]}`);
}

/** The step-history lines for changes the server recorded: `runs.get.settingsChanges` (absent on an older server). */
export function settingsChangeNotes(data: unknown): string[] {
  const list = (data as { settingsChanges?: unknown } | undefined)?.settingsChanges;
  if (!Array.isArray(list)) return [];
  return list.flatMap((entry) => {
    const e = entry as { changes?: unknown; by?: { name?: unknown } };
    if (!Array.isArray(e?.changes)) return [];
    const name = e.by?.name;
    const who = typeof name === 'string' && name.trim() ? ` (by ${name.trim()})` : '';
    return e.changes.flatMap((c) => {
      const x = c as { label?: unknown; from?: unknown; to?: unknown };
      return typeof x.label === 'string' && typeof x.to === 'string' ? [`${x.label} changed${typeof x.from === 'string' ? ` from ${x.from}` : ''} to ${x.to}${who}`] : [];
    });
  });
}

/** The server may not have `runs.updateSettings` (an old server): the client then throws "No procedure found". */
export function missingProcedure(error: unknown): boolean {
  return error instanceof Error && /no .*procedure|procedure.*not found/i.test(error.message);
}

/** `retry: true` is refused for a run in legacy planner recovery: its Retry has to be started on its own. */
export function needsRetryOnItsOwn(error: unknown): boolean {
  return error instanceof Error && /retry on its own/i.test(error.message);
}

/** The router's own input type for `runs.updateSettings` (Task 8 R13). */
export type UpdateInput = inferRouterInputs<AppRouter>['runs']['updateSettings'];

/** The input for `runs.updateSettings`: only changed values and no nulls (the call has no "clear"), plus the retry flag.
 *  The values come from pickers as plain strings; the server validates them and answers with its own message. */
export function updateInput(runId: string, change: SettingsChange, retry: boolean): UpdateInput {
  const out: Record<string, unknown> = { runId };
  for (const [k, v] of Object.entries(change)) if (v !== null && v !== undefined) out[k] = v;
  if (retry) out.retry = true;
  return out as UpdateInput;
}
