import { describe, it, expect } from 'vitest';
import { parseGate2Reply } from './index';

// Week 5 Task 5 (D2) — parseGate2Reply is pure and DB/LLM-free, same kind of
// function Task 4's first test slice targeted (see gate1/index.test.ts).
// The new privacy-status grammar ("approve public"/"approve unlisted") is the
// real, per-run replacement for the old PRIVACY_STATUS source constant, so
// its parsing gets the same exact-match discipline as the rest of Gate 1/2.

describe('parseGate2Reply', () => {
  it('parses a bare, case-insensitive "approve" as private by default', () => {
    expect(parseGate2Reply('approve')).toEqual({ type: 'approve', privacyStatus: 'private' });
    expect(parseGate2Reply('Approve')).toEqual({ type: 'approve', privacyStatus: 'private' });
    expect(parseGate2Reply('  APPROVE  ')).toEqual({ type: 'approve', privacyStatus: 'private' });
  });

  it('parses "approve public" as a public approval', () => {
    expect(parseGate2Reply('approve public')).toEqual({ type: 'approve', privacyStatus: 'public' });
    expect(parseGate2Reply('Approve Public')).toEqual({ type: 'approve', privacyStatus: 'public' });
  });

  it('parses "approve unlisted" as an unlisted approval', () => {
    expect(parseGate2Reply('approve unlisted')).toEqual({ type: 'approve', privacyStatus: 'unlisted' });
  });

  it('parses "approve private" as an explicit private approval', () => {
    expect(parseGate2Reply('approve private')).toEqual({ type: 'approve', privacyStatus: 'private' });
  });

  it('does not fuzzy-match near-misses — they fall through to revise, not a false-positive approval', () => {
    // Documented deliberate behavior, same reasoning as Gate 1's typo'd
    // "aprove": a false-positive match here would silently publish at an
    // unintended privacy level, worse than asking the founder to reply again.
    expect(parseGate2Reply('approved public')).toEqual({ type: 'revise', notes: 'approved public' });
    expect(parseGate2Reply('approve loudly')).toEqual({ type: 'revise', notes: 'approve loudly' });
    expect(parseGate2Reply('please approve public')).toEqual({ type: 'revise', notes: 'please approve public' });
  });

  it('parses "reject <reason>" and captures the reason', () => {
    expect(parseGate2Reply('reject too blurry')).toEqual({ type: 'reject', reason: 'too blurry' });
    expect(parseGate2Reply('REJECT bad audio')).toEqual({ type: 'reject', reason: 'bad audio' });
  });

  it('parses a bare "reject" with an empty reason', () => {
    expect(parseGate2Reply('reject')).toEqual({ type: 'reject', reason: '' });
  });

  it('treats freeform text as revision notes', () => {
    expect(parseGate2Reply('  Please fix the intro pacing.  ')).toEqual({
      type: 'revise',
      notes: 'Please fix the intro pacing.',
    });
  });
});
