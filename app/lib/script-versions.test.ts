// Sprint 5 Task 7 R3 — with the field names of the Task 8 report's "App contract for Task 7": runs.get.scripts.
import { describe, it, expect } from 'vitest';
import { lengthWords, scriptVersionsOf } from './script-versions';

const words = (n: number) => Array(n).fill('w').join(' ');
const draftChapters = [
  { title: 'A', text: words(100) },
  { title: 'B', text: words(100) },
  { title: 'C', text: words(111) },
];
const editedChapters = [
  { title: 'A', text: words(90) },
  { title: 'B', text: words(90) },
  { title: 'C', text: words(93) },
];
const gen = { stageName: 'script_generation', status: 'completed', attemptNumber: 1, output: { scriptText: 'draft text', chapters: draftChapters } };
const gate = (extra: Record<string, unknown>) => ({ stageName: 'gate1', status: 'completed', attemptNumber: 1, output: { outcome: 'edit', ...extra } });

describe('runs.get.scripts { draft, approved, usedByVideo }', () => {
  const scripts = {
    draft: { text: 'draft text', chapters: draftChapters },
    approved: { text: 'edited text', chapters: editedChapters, outcome: 'edit' },
    usedByVideo: 'approved',
  };
  it('reads the approved script with its own count and length, and says it was edited', () => {
    const v = scriptVersionsOf([], true, { scripts });
    expect(v.approved?.words).toBe(273);
    expect(v.approved?.edited).toBe(true);
    expect(lengthWords(v.approved!, true)).toBe('273 words · ~1:46');
    expect(v.draft?.words).toBe(311);
    expect(v.usedByVideo).toBe('approved');
  });
  it('approved as it was written is not shown as edited', () => {
    const v = scriptVersionsOf([], true, { scripts: { ...scripts, approved: { text: 'draft text', chapters: draftChapters, outcome: 'approve' } } });
    expect(v.approved?.edited).toBe(false);
  });
  it('says when the video was made from the draft, and null before any video', () => {
    expect(scriptVersionsOf([], true, { scripts: { ...scripts, usedByVideo: 'draft' } }).usedByVideo).toBe('draft');
    expect(scriptVersionsOf([], true, { scripts: { ...scripts, usedByVideo: null } }).usedByVideo).toBeNull();
    expect(scriptVersionsOf([], true, { scripts: { ...scripts, usedByVideo: 'nonsense' } }).usedByVideo).toBeNull();
  });
  it('before Gate 1 there is only the draft', () => {
    const v = scriptVersionsOf([], true, { scripts: { draft: scripts.draft, approved: null, usedByVideo: null } });
    expect(v.approved).toBeNull();
    expect(v.draft?.words).toBe(311);
  });
  it('a short script is counted from its text', () => {
    const v = scriptVersionsOf([], false, { scripts: { draft: { text: 'one two three four five' }, approved: null, usedByVideo: null } });
    expect(v.draft).toMatchObject({ words: 5, seconds: 2 });
  });
});

describe('without scripts (an older server): the Gate 1 stage output', () => {
  it('before Gate 1 there is only the draft', () => {
    const v = scriptVersionsOf([gen], true);
    expect(v.approved).toBeNull();
    expect(v.draft?.words).toBe(311);
  });
  it('after an edit the approved text is the edited one and the draft is kept apart', () => {
    const v = scriptVersionsOf([gen, gate({ sanctionedScriptText: 'edited text', chapters: editedChapters })], true);
    expect(v.approved?.words).toBe(273);
    expect(v.approved?.edited).toBe(true);
    expect(v.usedByVideo).toBeNull();
  });
  it('approved as-is is not shown as edited', () => {
    const v = scriptVersionsOf([gen, gate({ outcome: 'approve', sanctionedScriptText: 'draft text', chapters: draftChapters })], true);
    expect(v.approved?.edited).toBe(false);
  });
});
