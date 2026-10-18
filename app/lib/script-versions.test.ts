// Sprint 5 Task 7 R3.
import { describe, it, expect } from 'vitest';
import { lengthWords, scriptVersionsOf } from './script-versions';

const draftChapters = [
  { title: 'A', text: Array(100).fill('w').join(' ') },
  { title: 'B', text: Array(100).fill('w').join(' ') },
  { title: 'C', text: Array(111).fill('w').join(' ') },
];
const editedChapters = [
  { title: 'A', text: Array(90).fill('w').join(' ') },
  { title: 'B', text: Array(90).fill('w').join(' ') },
  { title: 'C', text: Array(93).fill('w').join(' ') },
];
const gen = { stageName: 'script_generation', status: 'completed', attemptNumber: 1, output: { scriptText: 'draft text', chapters: draftChapters } };
const gate = (extra: Record<string, unknown>) => ({ stageName: 'gate1', status: 'completed', attemptNumber: 1, output: { outcome: 'edit', ...extra } });

describe('script versions', () => {
  it('before Gate 1 there is only the draft', () => {
    const v = scriptVersionsOf([gen], true);
    expect(v.approved).toBeNull();
    expect(v.draft?.words).toBe(311);
  });
  it('after an edit the approved text is the edited one, with its real count and length, and the draft is kept apart', () => {
    const v = scriptVersionsOf([gen, gate({ sanctionedScriptText: 'edited text', chapters: editedChapters })], true);
    expect(v.approved?.words).toBe(273);
    expect(v.approved?.edited).toBe(true);
    expect(v.draft?.words).toBe(311);
    expect(lengthWords(v.approved!, true)).toBe('273 words · ~1:46');
  });
  it('approved as-is is not shown as edited', () => {
    const v = scriptVersionsOf([gen, gate({ outcome: 'approve', sanctionedScriptText: 'draft text', chapters: draftChapters })], true);
    expect(v.approved?.edited).toBe(false);
  });
  it('a short script is counted from its text', () => {
    const short = { stageName: 'script_generation', status: 'completed', attemptNumber: 1, output: { scriptText: 'one two three four five' } };
    expect(scriptVersionsOf([short], false).draft).toMatchObject({ words: 5, seconds: 2 });
  });
  it('the server fields win when sent', () => {
    const v = scriptVersionsOf([gen], true, { approvedScript: { text: 'server text', edited: true, chapters: editedChapters }, originalDraft: { text: 'd', chapters: draftChapters } });
    expect(v.approved?.words).toBe(273);
    expect(v.approved?.edited).toBe(true);
  });
});
