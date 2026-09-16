import { describe, it, expect } from 'vitest';
import { formatDigestMessage } from './founder-digest';

// Sprint 2 Task 6 (I1) — formatDigestMessage is deliberately pure (no DB
// access), isolated exactly so its output shape can be unit tested
// directly. runFounderDigestCheck itself (the DB-backed half) is verified
// via real live testing instead — same posture as post-hoc-tag.test.ts.

describe('formatDigestMessage', () => {
  it('lists each channel with its completed/needs-attention/waiting counts and run ids', () => {
    const message = formatDigestMessage({
      windowStart: new Date('2026-09-15T00:00:00.000Z'),
      channels: [
        {
          channelId: 'chan-1',
          channelName: 'Octopus Facts',
          completedRuns: [{ id: 'run-1', briefText: 'A short about octopus hearts' }],
          needsAttentionRuns: [],
          waitingOnYouRuns: [{ id: 'run-2', briefText: 'A short about deep sea fish', status: 'paused_gate1' }],
        },
      ],
    });

    expect(message).toContain('Octopus Facts:');
    expect(message).toContain('Completed: 1');
    expect(message).toContain('run-1');
    expect(message).toContain('Needs attention: 0');
    expect(message).toContain('Waiting on you: 1');
    expect(message).toContain('run-2');
    expect(message).toContain('[paused_gate1]');
    expect(message).toContain('tag <runId> <word> [notes]');
  });

  it('handles a channel with nothing to report without omitting it', () => {
    const message = formatDigestMessage({
      windowStart: new Date('2026-09-15T00:00:00.000Z'),
      channels: [
        {
          channelId: 'chan-1',
          channelName: 'Quiet Channel',
          completedRuns: [],
          needsAttentionRuns: [],
          waitingOnYouRuns: [],
        },
      ],
    });

    expect(message).toContain('Quiet Channel:');
    expect(message).toContain('Completed: 0');
    expect(message).toContain('Needs attention: 0');
    expect(message).toContain('Waiting on you: 0');
  });

  it('caps a long run list at 5 with an "...and N more" line — real Telegram messages have a 4096-char limit', () => {
    const manyRuns = Array.from({ length: 58 }, (_, i) => ({ id: `run-${i}`, briefText: `brief ${i}` }));
    const message = formatDigestMessage({
      windowStart: new Date('2026-09-15T00:00:00.000Z'),
      channels: [
        {
          channelId: 'chan-1',
          channelName: 'Busy Channel',
          completedRuns: [],
          needsAttentionRuns: manyRuns,
          waitingOnYouRuns: [],
        },
      ],
    });

    expect(message).toContain('Needs attention: 58');
    expect(message).toContain('run-0');
    expect(message).toContain('run-4');
    expect(message).not.toContain('run-5');
    expect(message).toContain('...and 53 more');
    expect(message.length).toBeLessThan(4096);
  });

  it('lists multiple channels independently', () => {
    const message = formatDigestMessage({
      windowStart: new Date('2026-09-15T00:00:00.000Z'),
      channels: [
        {
          channelId: 'chan-1',
          channelName: 'Channel A',
          completedRuns: [{ id: 'run-a', briefText: 'brief a' }],
          needsAttentionRuns: [],
          waitingOnYouRuns: [],
        },
        {
          channelId: 'chan-2',
          channelName: 'Channel B',
          completedRuns: [],
          needsAttentionRuns: [{ id: 'run-b', briefText: 'brief b' }],
          waitingOnYouRuns: [],
        },
      ],
    });

    expect(message).toContain('Channel A:');
    expect(message).toContain('Channel B:');
    expect(message).toContain('run-a');
    expect(message).toContain('run-b');
  });
});
