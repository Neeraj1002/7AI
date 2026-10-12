// Sprint 4 Frontend Task 2 (R1/R2) — pure helpers for the redesigned Run screen. Nothing here is fetched or
// invented: every value is read from `runs.get` (or one of its optional Sprint 4 Task 12 fields) and every
// missing field has the fallback the task doc names.
import { humanizeRunError } from './run-labels';
import { MUSIC_MOODS, VISUAL_SOURCES, VOICES } from './pipeline-options';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../studio/src/api/router';
import type { StatusChipKind } from '../components/StatusChip';

// Sprint 4 Task 12 fields, typed straight from the API (no hand-written copy). Partial so a caller may pass a subset.
type RunGet = inferRouterOutputs<AppRouter>['runs']['get'];
export type ResolvedOptions = Partial<NonNullable<RunGet['resolvedOptions']>>;
export type GateDecisionEntry = Pick<NonNullable<RunGet['gateDecisions']>[number], 'gate' | 'outcome' | 'decidedBy'> &
  Partial<Pick<NonNullable<RunGet['gateDecisions']>[number], 'privacyStatus'>>;

// ---------- header: chip + title ----------

export type EndReason = 'rejected' | 'cancelled' | 'failed' | 'channel_deleted' | null | undefined;

export function runChip(
  run: { status: string; currentStage?: string | null },
  endReason: EndReason,
): { label: string; kind: StatusChipKind } {
  switch (run.status) {
    case 'paused_gate1':
      return { label: 'Gate 1 · approve script', kind: 'waiting' };
    case 'paused_gate2':
      return { label: 'Gate 2 · approve video', kind: 'waiting' };
    case 'needs_attention':
      return { label: 'Needs attention', kind: 'attention' };
    case 'completed':
      return { label: 'Published', kind: 'ok' };
    case 'failed':
      if (endReason === 'cancelled') return { label: 'Cancelled', kind: 'neutral' };
      if (endReason === 'rejected') return { label: 'Rejected', kind: 'neutral' };
      return { label: 'Failed', kind: 'error' };
    default:
      // Upload + first-stats snapshot read "Publishing", as the built screen already did.
      return run.currentStage === 'publishing' || run.currentStage === 'analytics'
        ? { label: 'Publishing', kind: 'neutral' }
        : { label: 'In progress', kind: 'neutral' };
  }
}

// ---------- settings tiles ----------

export type SettingTile = { key: 'length' | 'visuals' | 'voice' | 'music'; label: string; value: string };

function titleCase(value: string): string {
  return value.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function labelFor(list: readonly { value: string; label: string }[], value: string): string {
  return list.find((o) => o.value === value)?.label ?? titleCase(value);
}

// B3: a resolved value reads exactly as the server's label (no suffix added); `from` is not shown.
function resolvedLabel(opt: { label: string } | undefined): string | null {
  return opt ? opt.label : null;
}

export function lengthLabel(videoKind: string | undefined, targetSeconds: number | undefined): string {
  const kind = videoKind === 'long' ? 'Video' : 'Shorts';
  if (!targetSeconds) return kind;
  if (videoKind === 'long' || targetSeconds >= 120) {
    const minutes = Math.round(targetSeconds / 6) / 10;
    return `${kind} · ${minutes} min`;
  }
  return `${kind} · ${targetSeconds} s`;
}

export function settingTiles(args: {
  creationOptions: { voice?: string; visualSource?: string; audioLayer?: string; formatKey?: string } | null | undefined;
  resolved: ResolvedOptions | undefined;
  videoKind: string | undefined;
  targetSeconds: number | undefined;
}): { tiles: SettingTile[]; formatLine: string | null } {
  const { creationOptions: picked, resolved } = args;
  const CHANNEL_DEFAULT = 'Channel default';
  const pick = (r: 'voice' | 'visualSource' | 'music', value: string | undefined, labels: readonly { value: string; label: string }[]) =>
    resolvedLabel(resolved?.[r]) ?? (value ? labelFor(labels, value) : CHANNEL_DEFAULT);

  const length = lengthLabel(resolved?.videoKind ?? args.videoKind, resolved?.targetSeconds?.value ?? args.targetSeconds);
  const tiles: SettingTile[] = [
    { key: 'length', label: 'Type · length', value: length },
    { key: 'visuals', label: 'Visuals', value: pick('visualSource', picked?.visualSource, VISUAL_SOURCES) },
    { key: 'voice', label: 'Voice', value: pick('voice', picked?.voice, VOICES) },
    { key: 'music', label: 'Music', value: pick('music', picked?.audioLayer, MUSIC_MOODS) },
  ];
  // The response carries the format key only (null = Freeform), so the key is made readable here.
  const key = resolved && 'formatKey' in resolved ? resolved.formatKey : picked?.formatKey;
  const format = resolved && key === null ? 'Freeform' : key ? titleCase(key) : null;
  return { tiles, formatLine: format ? `Format: ${format}` : null };
}

// ---------- step history ----------

export type StageLike = {
  id: string;
  stageName: string;
  status: string;
  attemptNumber: number;
  output: Record<string, unknown> | null;
  error?: string | null;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  createdAt?: Date | string | null;
};

export type HistoryAttempt = {
  key: string;
  title: string;
  when: Date | null;
  why: string;
  failed: boolean;
  /** The raw error, shown only behind "Technical details ›". */
  raw: string | null;
};

export type HistoryStep = {
  key: string;
  name: string;
  state: 'done' | 'current' | 'failed' | 'future';
  published?: boolean;
  when: Date | null;
  note: string;
  warnNote: boolean;
  attempts: HistoryAttempt[];
};

type StepDef = { key: string; stage: string; name: string };
const STEP_DEFS: StepDef[] = [
  { key: 'intake', stage: 'intake', name: 'Brief received' },
  { key: 'script', stage: 'script_generation', name: 'Script written' },
  { key: 'review', stage: 'script_review', name: 'Script reviewed' },
  { key: 'gate1', stage: 'gate1', name: 'Gate 1 · script' },
  { key: 'video', stage: 'video_generation', name: 'Video made' },
  { key: 'gate2', stage: 'gate2', name: 'Gate 2 · video' },
  { key: 'publish', stage: 'publishing', name: 'Published' },
];

function asDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const lowerFirst = (s: string) => (/^[A-Z][a-z]+\b/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);

/** The plain sentence for a stored error, from the existing wording helper. */
export function plainReason(error: string | null | undefined): string {
  return humanizeRunError(error ?? '') || 'something went wrong';
}

export function scriptStats(scriptText: string): { words: number; seconds: number } | null {
  const text = scriptText.trim();
  if (!text) return null;
  const words = text.split(/\s+/).length;
  return { words, seconds: Math.round(words / 2.5) };
}

const times = (n: number) => (n === 1 ? 'once' : `${n} times`);

export function gateWords(
  gate: 1 | 2,
  entries: GateDecisionEntry[] | undefined,
  last: { gate: number; outcome: string; privacyStatus?: string } | null | undefined,
): string {
  const cap = (p?: string) => (p ? ` · ${p[0].toUpperCase()}${p.slice(1)}` : '');
  // B4 — when the backend sends every decision, say who decided.
  const mine = entries?.filter((e) => e.gate === gate).pop();
  if (mine) {
    if (mine.outcome === 'approve') return mine.decidedBy === 'auto' ? 'Auto-approved' : `Approved by you${gate === 2 ? cap(mine.privacyStatus) : ''}`;
    if (mine.outcome === 'edit') return 'Edited and approved';
    if (mine.outcome === 'revise') return 'Sent back with notes';
    if (mine.outcome === 'reject') return 'Rejected by you';
  }
  // Fallback: only the latest gate is known and never who decided, so no "by you".
  if (!entries && last && last.gate === gate) {
    if (last.outcome === 'approve') return `Approved${gate === 2 ? cap(last.privacyStatus) : ''}`;
    if (last.outcome === 'edit') return 'Edited and approved';
    if (last.outcome === 'revise') return 'Sent back with notes';
    if (last.outcome === 'reject') return 'Rejected';
  }
  return 'Done';
}

export function buildStepHistory(args: {
  stages: StageLike[];
  lastGateDecision?: { gate: number; outcome: string; privacyStatus?: string } | null;
  gateDecisions?: GateDecisionEntry[];
}): { steps: HistoryStep[]; doneCount: number; summary: string } {
  const { stages } = args;
  const rowsOf = (stage: string) =>
    stages.filter((s) => s.stageName === stage).sort((a, b) => a.attemptNumber - b.attemptNumber);
  const hasRows = STEP_DEFS.map((d) => rowsOf(d.stage).length > 0);

  const steps: HistoryStep[] = STEP_DEFS.map((def, i) => {
    const rows = rowsOf(def.stage);
    const latest = rows[rows.length - 1];
    const laterStarted = hasRows.slice(i + 1).some(Boolean);
    const failedRows = rows.filter((r) => r.status === 'failed');
    const attempts: HistoryAttempt[] =
      rows.length > 1
        ? rows.map((r) => ({
            key: r.id,
            title: `Attempt ${r.attemptNumber} · ${
              r.status === 'completed' ? 'done' : r.status === 'failed' ? 'failed' : r.status === 'running' ? 'in progress' : r.status
            }`,
            when: asDate(r.completedAt ?? r.startedAt ?? r.createdAt),
            why: r.status === 'failed' ? `${capitalise(plainReason(r.error))}.` : '',
            failed: r.status === 'failed',
            raw: r.status === 'failed' && r.error ? r.error : null,
          }))
        : [];

    let state: HistoryStep['state'] = 'future';
    let note = '';
    let warnNote = false;
    if (!latest) {
      if (laterStarted) {
        state = 'done';
      }
    } else if (latest.status === 'failed') {
      state = 'failed';
      note = `failed ${times(failedRows.length)} · last: ${lowerFirst(plainReason(latest.error))}`;
      warnNote = true;
    } else if (latest.status === 'running' || latest.status === 'pending') {
      state = 'current';
      note = def.stage === 'gate1' || def.stage === 'gate2' ? 'Waiting for you' : 'In progress';
    } else {
      state = 'done';
      note = 'Done';
      if (rows.length > 1) {
        note = `Done on attempt ${latest.attemptNumber}`;
        if (failedRows.length === 1) note += ` · attempt ${failedRows[0].attemptNumber} failed`;
        else if (failedRows.length > 1) note += ` · ${failedRows.length} attempts failed`;
        warnNote = failedRows.length > 0;
      }
    }

    if (state === 'done' && latest) {
      if (def.key === 'intake') note = 'From you';
      else if (def.key === 'script') {
        const stats = scriptStats(String(latest.output?.scriptText ?? ''));
        if (stats && rows.length === 1) note = `~${stats.words} words · ~${stats.seconds} s`;
      } else if (def.key === 'review') {
        const score = latest.output?.score;
        if (typeof score === 'number' && rows.length === 1) note = `Score ${score}/10`;
      } else if (def.key === 'gate1' || def.key === 'gate2') {
        note = gateWords(def.key === 'gate1' ? 1 : 2, args.gateDecisions, args.lastGateDecision);
      } else if (def.key === 'publish') note = 'Uploaded to YouTube';
    }

    return {
      key: def.key,
      name: def.name,
      state,
      published: def.key === 'publish' && state === 'done',
      when: latest && state !== 'future' ? asDate(latest.completedAt ?? latest.startedAt ?? latest.createdAt) : null,
      note,
      warnNote,
      attempts,
    };
  });

  const doneCount = steps.filter((s) => s.state === 'done').length;
  const failed = steps.find((s) => s.state === 'failed');
  const failedCount = failed ? rowsOf(STEP_DEFS.find((d) => d.key === failed.key)!.stage).filter((r) => r.status === 'failed').length : 0;
  return {
    steps,
    doneCount,
    summary: failed ? `${failed.name} · failed ${times(failedCount)}` : `${doneCount} of ${steps.length} done`,
  };
}

function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// ---------- states ----------

// What the run is doing, in the words a person uses for it.
const STAGE_PHRASE: Record<string, string> = {
  intake: 'Reading the brief',
  script_generation: 'Writing the script',
  script_review: 'Reviewing the script',
  video_generation: 'Making the video',
  video_review: 'Reviewing the video',
  publishing: 'Uploading to YouTube',
  analytics: 'Saving the first stats',
};

export function stagePhrase(stage: string | null | undefined): string {
  return (stage && STAGE_PHRASE[stage]) || 'Working on it';
}

export function needsAttentionText(args: { stage: string | null | undefined; stages: StageLike[]; lastError: string | null | undefined }): string {
  const failures = args.stages.filter((s) => s.stageName === args.stage && s.status === 'failed').length;
  const reason = plainReason(args.lastError);
  const step = stagePhrase(args.stage);
  return `${step} failed ${times(Math.max(failures, 1))}: ${lowerFirst(reason)}.`;
}

export function endedTitle(endReason: EndReason, rejectedGate: number | undefined): string {
  if (endReason === 'cancelled') return 'You cancelled this run';
  if (endReason === 'rejected') return `You rejected this ${rejectedGate === 1 ? 'script' : 'video'}`;
  return 'This run stopped';
}

export function spentLine(spentUsd: number | undefined): string {
  if (spentUsd === undefined) return '';
  // 0 means nothing was booked, not that the run was free.
  return spentUsd === 0 ? ' Nothing booked for this run.' : ` Spent on this run: $${spentUsd.toFixed(2)}.`;
}

// ---------- "Why didn't it work?" tags ----------

// The backend keeps no fixed vocabulary, so the app owns this list: the keys it sends today, in plain words.
export const POST_HOC_TAGS = [
  { key: 'weak_hook', label: 'Weak hook' },
  { key: 'topic_already_saturated', label: 'Topic already saturated' },
  { key: 'bad_thumbnail_frame', label: 'Bad thumbnail frame' },
] as const;

export function tagLabel(stored: string): string {
  const known = POST_HOC_TAGS.find((t) => t.key === stored.trim().toLowerCase());
  if (known) return known.label;
  const spaced = stored.trim().replace(/_/g, ' ');
  return capitalise(spaced);
}
