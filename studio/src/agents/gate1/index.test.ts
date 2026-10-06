import { describe, it, expect } from 'vitest';
import { parseGateReply, formatGateMessage } from './index';

// Week 5 Task 4 (C4) — parseGateReply is pure and DB/LLM-free, exactly the
// kind of function this first test slice targets.

describe('parseGateReply', () => {
  it('parses an exact, case-insensitive "approve"', () => {
    expect(parseGateReply('approve')).toEqual({ type: 'approve' });
    expect(parseGateReply('Approve')).toEqual({ type: 'approve' });
    expect(parseGateReply('  APPROVE  ')).toEqual({ type: 'approve' });
  });

  it('does not fuzzy-match a near-miss as approve', () => {
    // Documented deliberate behavior: "approved!" and "not approve" must NOT
    // silently pass through as an approval — they fall through to edit.
    expect(parseGateReply('approved!')).toEqual({ type: 'edit', editedScriptText: 'approved!' });
    expect(parseGateReply('not approve')).toEqual({ type: 'edit', editedScriptText: 'not approve' });
  });

  it('parses "reject <reason>" and captures the reason', () => {
    expect(parseGateReply('reject too generic')).toEqual({ type: 'reject', reason: 'too generic' });
    expect(parseGateReply('REJECT bad tone')).toEqual({ type: 'reject', reason: 'bad tone' });
  });

  it('parses a bare "reject" with an empty reason', () => {
    expect(parseGateReply('reject')).toEqual({ type: 'reject', reason: '' });
  });

  it('treats anything else as an edit, using the trimmed reply as the new script text', () => {
    expect(parseGateReply('  Here is my rewritten script.  ')).toEqual({
      type: 'edit',
      editedScriptText: 'Here is my rewritten script.',
    });
  });

  it('treats a typo\'d "aprove" as an edit, not an approval (safe-by-construction)', () => {
    expect(parseGateReply('aprove')).toEqual({ type: 'edit', editedScriptText: 'aprove' });
  });
});

describe('formatGateMessage', () => {
  const base = {
    channelName: 'Chan',
    briefText: 'the brief',
    scriptText: 'the script',
    reviewScore: '8',
    reviewNotes: 'fine',
  };
  // The exact text this function produced before Sprint 4 Task 2.
  const legacy = [
    'Gate 1 — Chan',
    '',
    'Brief: the brief',
    '',
    'Script:',
    'the script',
    '',
    'Review score: 8/10',
    'Review notes: fine',
    '',
    'Reply "approve", "reject <reason>", or send edited script text.',
  ].join('\n');

  it('is byte-identical to the pre-Task-2 message when nothing extra is passed', () => {
    expect(formatGateMessage(base)).toBe(legacy);
    expect(formatGateMessage({ ...base, factualConcerns: [], styleGuideViolations: [], sources: [] })).toBe(legacy);
    expect(formatGateMessage({ ...base, factualConcerns: undefined })).toBe(legacy);
  });

  it('keeps the restart notice and still ends with the Reply line', () => {
    const msg = formatGateMessage({ ...base, restarted: true, sources: ['a'] });
    expect(msg.split('\n')[1]).toContain('Re-sending after a restart');
    expect(msg.endsWith('send edited script text.')).toBe(true);
  });

  it('renders all three blocks in order, one item per line, before the Reply line', () => {
    const msg = formatGateMessage({
      ...base,
      factualConcerns: ['c1', 'c2'],
      styleGuideViolations: ['v1'],
      sources: ['https://example.com/study'],
    });
    expect(msg).toBe(
      [
        legacy.split('\n').slice(0, 9).join('\n'),
        '',
        'Factual concerns:',
        '- c1',
        '- c2',
        '',
        'Style guide violations:',
        '- v1',
        '',
        'Sources cited in brief:',
        '- https://example.com/study',
        '',
        'Reply "approve", "reject <reason>", or send edited script text.',
      ].join('\n'),
    );
  });

  it('omits only the empty blocks', () => {
    const msg = formatGateMessage({ ...base, styleGuideViolations: ['v1'] });
    expect(msg).toContain('Style guide violations:\n- v1');
    expect(msg).not.toContain('Factual concerns');
    expect(msg).not.toContain('Sources cited');
  });
});
