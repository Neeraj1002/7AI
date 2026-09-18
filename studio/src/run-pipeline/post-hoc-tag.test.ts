import { describe, it, expect } from 'vitest';
import { parsePostHocTagCommand } from './post-hoc-tag';

// Sprint 2 Task 6 (I2) — parsePostHocTagCommand is deliberately pure (no DB
// access), isolated exactly so its grammar can be unit tested directly.
// recordPostHocTag itself (the DB-backed half) is verified via real live
// testing instead — same posture budget-gate.test.ts's own comment
// establishes for this project's DB-backed functions.

const REAL_UUID = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';

describe('parsePostHocTagCommand', () => {
  it('parses a run id, tag word, and free-text notes', () => {
    const result = parsePostHocTagCommand(`tag ${REAL_UUID} weak_hook the opening was way too slow`);
    expect(result).toEqual({
      kind: 'command',
      command: { runId: REAL_UUID, tag: 'weak_hook', notes: 'the opening was way too slow' },
    });
  });

  it('parses a run id and tag word with no notes', () => {
    const result = parsePostHocTagCommand(`tag ${REAL_UUID} bad_thumbnail`);
    expect(result).toEqual({
      kind: 'command',
      command: { runId: REAL_UUID, tag: 'bad_thumbnail', notes: '' },
    });
  });

  it('is case-insensitive on the command word, the run id, and the tag', () => {
    const result = parsePostHocTagCommand(`TAG ${REAL_UUID.toUpperCase()} Weak_Hook`);
    expect(result).toEqual({
      kind: 'command',
      command: { runId: REAL_UUID, tag: 'weak_hook', notes: '' },
    });
  });

  it('treats a message that does not start with "tag" as not a tag attempt at all', () => {
    expect(parsePostHocTagCommand(`approve`)).toEqual({ kind: 'not-a-tag-attempt' });
    expect(parsePostHocTagCommand(`this is just an edited script, not a tag command`)).toEqual({
      kind: 'not-a-tag-attempt',
    });
  });

  it('flags a tag attempt with a bad run id as malformed, not silently dropped', () => {
    const result = parsePostHocTagCommand('tag not-a-real-id weak_hook');
    expect(result.kind).toBe('malformed');
  });

  it('flags a tag attempt missing the tag word entirely as malformed', () => {
    const result = parsePostHocTagCommand(`tag ${REAL_UUID}`);
    expect(result.kind).toBe('malformed');
  });

  it('truncates an unreasonably long tag word to 50 characters', () => {
    const longTag = 'a'.repeat(80);
    const result = parsePostHocTagCommand(`tag ${REAL_UUID} ${longTag}`);
    expect(result.kind).toBe('command');
    expect(result.kind === 'command' && result.command.tag.length).toBe(50);
  });
});
