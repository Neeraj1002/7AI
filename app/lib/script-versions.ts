// Sprint 5 Task 7 R3 — after Gate 1 the screens show the script that was approved (and narrated), with the writer's
// draft as a labelled extra. Before, the Script tab always read the writer's draft, so an edited script looked unused.
//
// Contract (Task 8 report, "App contract for Task 7"): `runs.get.scripts { draft, approved, usedByVideo }` where
// draft = { text, chapters? } | null, approved = { text, chapters?, outcome: 'approve' | 'edit' } | null and usedByVideo =
// 'approved' | 'draft' | null (null before any video attempt). `chapters` and `scriptEditText` on runs.get are the approved
// script after Gate 1. Without `scripts` (an older server) the same is read from the Gate 1 stage output, which holds
// `sanctionedScriptText` and `chapters`.
import { narrationWords } from './script-editor';
import { scriptStats } from './run-view';

export type Chapter = { title: string; text: string };
export type ScriptVersion = { text: string; chapters?: Chapter[]; words: number; /** A Short only: the server owns a long script's length, so none is estimated here. */ seconds?: number };
export type UsedByVideo = 'approved' | 'draft' | null;
export type ScriptVersions = {
  draft: ScriptVersion | null;
  /** Null until Gate 1 is decided. `edited` is true when the person changed the text. */
  approved: (ScriptVersion & { edited: boolean }) | null;
  /** Which of the two the latest video was narrated from; null before a video exists or when the server does not say. */
  usedByVideo: UsedByVideo;
};

type StageIn = { stageName: string; status: string; attemptNumber: number; output: Record<string, unknown> | null };

function chaptersOf(v: unknown): Chapter[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const ok = v.filter((c): c is Chapter => typeof c?.title === 'string' && typeof c?.text === 'string');
  return ok.length > 0 ? ok : undefined;
}

function version(text: string, chapters: Chapter[] | undefined, isLong: boolean): ScriptVersion {
  const words = chapters ? chapters.reduce((n, c) => n + narrationWords(c.text), 0) : (scriptStats(text)?.words ?? 0);
  return { text, chapters, words, ...(isLong ? {} : { seconds: scriptStats(text)?.seconds ?? 0 }) };
}

function latest(stages: StageIn[], name: string): StageIn | undefined {
  return stages
    .filter((s) => s.stageName === name && s.status === 'completed' && s.output)
    .sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
}

type ServerScripts = {
  draft?: { text?: unknown; chapters?: unknown } | null;
  approved?: { text?: unknown; chapters?: unknown; outcome?: unknown } | null;
  usedByVideo?: unknown;
};

export function scriptVersionsOf(stages: StageIn[], isLong: boolean, server?: unknown): ScriptVersions {
  const sv = (server as { scripts?: ServerScripts } | undefined)?.scripts;
  if (sv && typeof sv === 'object') {
    const d = sv.draft && typeof sv.draft.text === 'string' ? version(sv.draft.text, chaptersOf(sv.draft.chapters), isLong) : null;
    const a = sv.approved && typeof sv.approved.text === 'string' ? { ...version(sv.approved.text, chaptersOf(sv.approved.chapters), isLong), edited: sv.approved.outcome === 'edit' } : null;
    const used: UsedByVideo = sv.usedByVideo === 'approved' || sv.usedByVideo === 'draft' ? sv.usedByVideo : null;
    return { draft: d, approved: a, usedByVideo: used };
  }

  const gen = latest(stages, 'script_generation');
  const draftText = typeof gen?.output?.scriptText === 'string' ? gen.output.scriptText : '';
  const draft = draftText ? version(draftText, chaptersOf(gen?.output?.chapters), isLong) : null;
  const gate = latest(stages, 'gate1');
  const text = gate?.output?.sanctionedScriptText;
  if (typeof text !== 'string' || !text.trim()) return { draft, approved: null, usedByVideo: null };
  const approved = version(text, chaptersOf(gate?.output?.chapters), isLong);
  // "Edited" is read off the text itself: the same words as the draft is an approval as-is.
  return { draft, approved: { ...approved, edited: draft !== null && draft.text.trim() !== approved.text.trim() }, usedByVideo: null };
}

export function lengthWords(v: { words: number; seconds?: number }, isLong: boolean): string {
  return !isLong && v.seconds !== undefined ? `${v.words} words · ~${v.seconds} s` : `${v.words} words`;
}
