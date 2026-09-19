import { describe, it, expect } from 'vitest';
import { parseLinkCommand } from './telegram-channel';

// Sprint 3 Task 3 (K2) — parseLinkCommand is deliberately pure (no DB
// access), isolated exactly so its grammar can be unit tested directly, same
// posture Sprint 2 Task 6's parsePostHocTagCommand already established for
// this project's other Telegram-command parsers.

describe('parseLinkCommand', () => {
  it('parses a real code and uppercases it', () => {
    expect(parseLinkCommand('/link ab3xyz')).toBe('AB3XYZ');
  });

  it('is case-insensitive on the command word itself', () => {
    expect(parseLinkCommand('/LINK AB3XYZ')).toBe('AB3XYZ');
  });

  it('returns null for a message that is not a /link command at all', () => {
    expect(parseLinkCommand('approve')).toBeNull();
    expect(parseLinkCommand('tag some-run-id weak_hook')).toBeNull();
    expect(parseLinkCommand('this is just an edited script')).toBeNull();
  });

  it('returns null for /link with no code', () => {
    expect(parseLinkCommand('/link')).toBeNull();
    expect(parseLinkCommand('/link   ')).toBeNull();
  });

  it('returns null for /link with more than one token after it', () => {
    expect(parseLinkCommand('/link AB3XYZ extra')).toBeNull();
  });
});
