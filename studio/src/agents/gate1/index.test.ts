import { describe, it, expect } from 'vitest';
import { parseGateReply } from './index';

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
