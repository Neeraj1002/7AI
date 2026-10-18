import { describe, it, expect } from 'vitest';
import { deriveDisplayChapters, deriveScriptVersions } from './script-versions';

const stage = (stageName: string, attemptNumber: number, output: unknown, status = 'completed', input: unknown = null) =>
  ({ stageName, attemptNumber, status, output, input }) as never;
const draftChapters = [{ title: 'One', text: 'draft one' }, { title: 'Two', text: 'draft two' }];
const editedChapters = [{ title: 'One', text: 'edited one' }, { title: 'Two', text: 'edited two' }];

describe('draft vs approved script (R11.1, E10)', () => {
  const generation = stage('script_generation', 1, { scriptText: 'draft one\n\ndraft two', chapters: draftChapters });

  it('before Gate 1 there is only the draft', () => {
    const v = deriveScriptVersions([generation]);
    expect(v.draft?.text).toContain('draft one');
    expect(v.approved).toBeNull();
    expect(v.usedByVideo).toBeNull();
    expect(deriveDisplayChapters([generation])).toEqual(draftChapters);
  });

  it('an edit at Gate 1 is the approved script; the Script tab shows it and the video used it', () => {
    const gate = stage('gate1', 1, { outcome: 'edit', sanctionedScriptText: 'edited one\n\nedited two', chapters: editedChapters });
    const video = stage('video_generation', 1, { videoPath: '/v.mp4' }, 'completed', { scriptText: 'edited one\n\nedited two' });
    const v = deriveScriptVersions([generation, gate, video]);
    expect(v.approved).toMatchObject({ outcome: 'edit', text: 'edited one\n\nedited two', chapters: editedChapters });
    expect(v.draft?.text).toContain('draft one');
    expect(v.usedByVideo).toBe('approved');
    expect(deriveDisplayChapters([generation, gate, video])).toEqual(editedChapters);
  });

  it('says draft when the video was made from the draft text', () => {
    const gate = stage('gate1', 1, { outcome: 'edit', sanctionedScriptText: 'edited', chapters: editedChapters });
    const video = stage('video_generation', 1, null, 'completed', { scriptText: 'draft one\n\ndraft two' });
    expect(deriveScriptVersions([generation, gate, video]).usedByVideo).toBe('draft');
  });

  it('an approve-as-is leaves both equal and reports the approved one as used', () => {
    const gate = stage('gate1', 1, { outcome: 'approve', sanctionedScriptText: 'draft one\n\ndraft two', chapters: draftChapters });
    const video = stage('video_generation', 1, null, 'completed', { scriptText: 'draft one\n\ndraft two' });
    expect(deriveScriptVersions([generation, gate, video]).usedByVideo).toBe('approved');
  });

  it('a rejected gate is not an approved script', () => {
    const gate = stage('gate1', 1, { outcome: 'reject', reason: 'no' });
    expect(deriveScriptVersions([generation, gate]).approved).toBeNull();
  });

  it('a Short has no chapters but still has both texts', () => {
    const short = stage('script_generation', 1, { scriptText: 'short draft' });
    const gate = stage('gate1', 1, { outcome: 'edit', sanctionedScriptText: 'short edited' });
    const v = deriveScriptVersions([short, gate]);
    expect(v.approved?.text).toBe('short edited');
    expect(deriveDisplayChapters([short, gate])).toBeUndefined();
  });
});
