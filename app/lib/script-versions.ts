// Sprint 5 Task 7 R3 — after Gate 1 the screens show the script that was approved (and narrated), with the writer's
// draft as a labelled extra. Before, the Script tab always read the writer's draft, so an edited script looked unused.
//
// Source: the Gate 1 stage's completed output already holds `sanctionedScriptText` and, for a long script, `chapters`
// (state-machine.ts: the edit replaces the draft there and the video reads it). When Task 8 R11.1 sends
// `runs.get.approvedScript` / `originalDraft` those win; the field names are to be confirmed against its report.
import { narrationWords, WORDS_PER_MINUTE } from './script-editor';
import { scriptStats } from './run-view';

export type Chapter = { title: string; text: string };
export type ScriptVersion = { text: string; chapters?: Chapter[]; words: number; seconds: number };
export type ScriptVersions = {
  draft: ScriptVersion | null;
  /** Null until Gate 1 is decided. */
  approved: (ScriptVersion & { edited: boolean }) | null;
};

type StageIn = { stageName: string; status: string; attemptNumber: number; output: Record<string, unknown> | null };

function chaptersOf(v: unknown): Chapter[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const ok = v.filter((c): c is Chapter => typeof c?.title === 'string' && typeof c?.text === 'string');
  return ok.length > 0 ? ok : undefined;
}

function version(text: string, chapters: Chapter[] | undefined, isLong: boolean): ScriptVersion {
  const words = chapters ? chapters.reduce((n, c) => n + narrationWords(c.text), 0) : (scriptStats(text)?.words ?? 0);
  const seconds = isLong ? Math.round((words / WORDS_PER_MINUTE) * 60) : (scriptStats(text)?.seconds ?? 0);
  return { text, chapters, words, seconds };
}

function latest(stages: StageIn[], name: string): StageIn | undefined {
  return stages
    .filter((s) => s.stageName === name && s.status === 'completed' && s.output)
    .sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
}

export function scriptVersionsOf(stages: StageIn[], isLong: boolean, server?: unknown): ScriptVersions {
  const gen = latest(stages, 'script_generation');
  const draftText = typeof gen?.output?.scriptText === 'string' ? gen.output.scriptText : '';
  const draft = draftText ? version(draftText, chaptersOf(gen?.output?.chapters), isLong) : null;

  const s = server as { approvedScript?: { text?: unknown; chapters?: unknown; edited?: unknown }; originalDraft?: { text?: unknown; chapters?: unknown } } | undefined;
  if (s?.approvedScript && typeof s.approvedScript.text === 'string') {
    const approved = { ...version(s.approvedScript.text, chaptersOf(s.approvedScript.chapters), isLong), edited: s.approvedScript.edited === true };
    const od = s.originalDraft && typeof s.originalDraft.text === 'string' ? version(s.originalDraft.text, chaptersOf(s.originalDraft.chapters), isLong) : draft;
    return { draft: od, approved };
  }

  const gate = latest(stages, 'gate1');
  const text = gate?.output?.sanctionedScriptText;
  if (typeof text !== 'string' || !text.trim()) return { draft, approved: null };
  const approved = version(text, chaptersOf(gate?.output?.chapters), isLong);
  // "Edited" is read off the text itself: the same words as the draft is an approval as-is.
  return { draft, approved: { ...approved, edited: draft !== null && draft.text.trim() !== approved.text.trim() } };
}

export function lengthWords(v: { words: number; seconds: number }, isLong: boolean): string {
  const mins = Math.floor(v.seconds / 60);
  const secs = String(v.seconds % 60).padStart(2, '0');
  return `${v.words} words · ~${isLong ? `${mins}:${secs}` : `${v.seconds} s`}`;
}
