import { describe, it, expect } from 'vitest';
import { ScriptReviewOutputSchema, SYSTEM_PROMPT, buildUserMessage } from './index';

const output = {
  score: 8,
  notes: 'ok',
  hookScore: 7,
  hookNotes: 'ok',
  videoGenFit: { fitsLengthLimit: true, pacingRealistic: true, visualsProducible: true, flags: [] },
  factualConcerns: [],
};

describe('script-review', () => {
  it('defaults styleGuideViolations to [] for outputs stored before the field existed', () => {
    expect(ScriptReviewOutputSchema.parse(output).styleGuideViolations).toEqual([]);
  });

  it('accepts styleGuideViolations and rejects a wrong type', () => {
    expect(ScriptReviewOutputSchema.parse({ ...output, styleGuideViolations: ['x'] }).styleGuideViolations).toEqual(['x']);
    expect(ScriptReviewOutputSchema.safeParse({ ...output, styleGuideViolations: 'x' }).success).toBe(false);
  });

  it('the prompt asks for styleGuideViolations and no longer hardcodes 30-60', () => {
    expect(SYSTEM_PROMPT).toContain('"styleGuideViolations": string[]');
    expect(SYSTEM_PROMPT).not.toContain('30-60');
  });

  it('the user message carries the brief, banned lists and target only when given', () => {
    const base = { scriptText: 's', captions: 'c', nicheDescription: 'n' };
    expect(buildUserMessage(base)).toBe('Script:\ns\n\nCaptions:\nc\n\nChannel niche: n');
    const msg = buildUserMessage({ ...base, briefText: 'B', bannedOpeners: ['Did you know'], bannedEndings: ['Bye'], targetSeconds: 30 });
    expect(msg).toContain('Original brief:\nB');
    expect(msg).toContain('Banned openings: Did you know');
    expect(msg).toContain('Banned endings: Bye');
    expect(msg).toContain('approximately 30 seconds');
  });
});
