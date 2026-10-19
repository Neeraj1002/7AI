// Sprint 5 Task 7 R4 — change a setting on a stopped or waiting run without cancelling it.
//
// Rules follow the stage-by-setting table in docs/execution/sprint5/reports/task7.md (D1, approved by the founder):
// voice, music mood, picture style, YouTube visibility and max spend can change; topic, format, length and the approved
// script cannot, because they would invalidate finished work. A change that redoes some finished work is allowed but
// says what it redoes ("revision"). Backend contract: `runs.updateSettings({ runId, voice?, audioLayer?, visualSource?,
// privacyStatus?, maxCostUsd? })`, which patches the run's options, re-runs the preflight and answers with the same
// messages as run creation; `runs.retry` then reruns the stopped step.
export type SettingKey = 'voice' | 'audioLayer' | 'visualSource' | 'privacyStatus' | 'maxCostUsd';

export type SettingMode = 'free' | 'revision' | 'locked';
export type SettingRule = { key: SettingKey; label: string; mode: SettingMode; note: string };
export type LockedSetting = { label: string; reason: string };

export type SettingsChange = Partial<{
  voice: string | null;
  audioLayer: string | null;
  visualSource: string | null;
  privacyStatus: 'private' | 'unlisted' | 'public';
  maxCostUsd: number;
}>;

type StageIn = { stageName: string; status: string };

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

/** What each changeable setting allows at this point of the run. */
export function settingRules(args: { status: string; stages: readonly StageIn[] }): SettingRule[] {
  const keys = Object.keys(LABEL) as SettingKey[];
  if (!canEditSettings(args.status)) {
    return keys.map((key) => ({ key, label: LABEL[key], mode: 'locked' as const, note: 'Only a stopped or waiting run can be changed.' }));
  }
  const videoRows = args.stages.filter((s) => s.stageName === 'video_generation');
  const started = videoRows.length > 0;
  const made = videoRows.some((s) => s.status === 'completed');
  const rule = (key: SettingKey, mode: SettingMode, note: string): SettingRule => ({ key, label: LABEL[key], mode, note });
  return [
    made
      ? rule('voice', 'revision', 'The narration, captions and render are made again. Pictures already made are reused.')
      : rule('voice', 'free', 'Nothing has been made with it yet.'),
    made
      ? rule('audioLayer', 'revision', 'Only the final render is made again.')
      : rule('audioLayer', 'free', 'Nothing has been made with it yet.'),
    started
      ? rule('visualSource', 'revision', 'The pictures and the render are made again, which costs money.')
      : rule('visualSource', 'free', 'Nothing has been made with it yet.'),
    rule('privacyStatus', 'free', 'Applied when the video is uploaded.'),
    rule('maxCostUsd', 'free', 'Takes effect on the next paid step.'),
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
    if (!(key in next)) continue;
    if ((current[key] ?? null) !== (next[key] ?? null)) out[key] = next[key];
  }
  return out as SettingsChange;
}

/** A change is refused here when its rule is locked; the server still checks everything else. */
export function refusedChanges(change: SettingsChange, rules: readonly SettingRule[]): string[] {
  return (Object.keys(change) as SettingKey[]).flatMap((key) => {
    const rule = rules.find((r) => r.key === key);
    return !rule || rule.mode === 'locked' ? [`${LABEL[key]}: ${rule?.note ?? 'cannot be changed.'}`] : [];
  });
}

/** True when any chosen change redoes finished work, so the sheet can say so before the money is spent. */
export function redoesWork(change: SettingsChange, rules: readonly SettingRule[]): SettingRule[] {
  return (Object.keys(change) as SettingKey[]).flatMap((key) => {
    const rule = rules.find((r) => r.key === key);
    return rule?.mode === 'revision' ? [rule] : [];
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
    const e = entry as { changes?: unknown };
    if (!Array.isArray(e?.changes)) return [];
    return e.changes.flatMap((c) => {
      const x = c as { label?: unknown; from?: unknown; to?: unknown };
      return typeof x.label === 'string' && typeof x.to === 'string' ? [`${x.label} changed${typeof x.from === 'string' ? ` from ${x.from}` : ''} to ${x.to}`] : [];
    });
  });
}

/** The server the app talks to may not have `runs.updateSettings` yet; the client then throws "No procedure found". */
export function missingProcedure(error: unknown): boolean {
  return error instanceof Error && /no .*procedure|procedure.*not found/i.test(error.message);
}
