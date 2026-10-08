import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
}));
vi.mock('../models/prisma-client', () => ({
  prisma: { notification: { findFirst: mocks.findFirst, create: mocks.create } },
}));

import { insertOrReuseApprovalNotification } from '../models/repositories/notification.repository';
import { formatGateReminder } from '../run-pipeline/gate-reminder';
import { formatGateMessage } from '../agents/gate1';
import { formatGate2Message } from '../agents/gate2';

// The Inbox (app/app/(app)/(tabs)/notifications.tsx, gateOf) reads which gate a
// card is from the message's first line. This is the same pattern, so the
// server's message format and the app's reader cannot drift apart unnoticed.
const APP_GATE_PATTERN = /^\s*Gate ([12])(?!\d)/;

function row(over: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: 'n1', tenantId: 't', channelId: 'c', userId: 'u1', kind: 'approval_request', message: 'Gate 1 — Chan',
    threadKey: 'run-1', resolvedAt: null, createdAt: now, ...over,
  };
}

const input = {
  tenantId: 't', channelId: 'c', userId: 'u1', kind: 'approval_request' as const, message: 'Gate 1 — Chan', threadKey: 'run-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue(row({ id: 'new' }));
});

describe('insertOrReuseApprovalNotification', () => {
  it('reuses the still-open card for that run instead of adding a duplicate', async () => {
    mocks.findFirst.mockResolvedValue(row({ id: 'existing' }));
    const out = await insertOrReuseApprovalNotification(input);
    expect(out.id).toBe('existing');
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.findFirst.mock.calls[0][0].where).toEqual({
      userId: 'u1', kind: 'approval_request', threadKey: 'run-1', resolvedAt: null,
    });
  });

  it('inserts a new card when none is open (first send, or a later gate after the earlier one was resolved)', async () => {
    mocks.findFirst.mockResolvedValue(null);
    const out = await insertOrReuseApprovalNotification(input);
    expect(out.id).toBe('new');
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});

describe('formatGateReminder', () => {
  it('names the channel and the brief first line, never a run id', () => {
    const text = formatGateReminder({
      channelName: 'Space Facts', briefText: '\n  Why Saturn has rings  \nsecond line', gateLabel: 'Gate 1', openHours: '2.5',
    });
    expect(text).toBe('Reminder: "Why Saturn has rings" on Space Facts has been waiting at Gate 1 for about 2.5h. Open the app to respond.');
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
  });

  it('truncates a long brief line and copes with an empty brief', () => {
    const long = 'x'.repeat(200);
    expect(formatGateReminder({ channelName: 'C', briefText: long, gateLabel: 'Gate 2', openHours: '1.0' })).toContain('x'.repeat(77) + '..."');
    expect(formatGateReminder({ channelName: 'C', briefText: '', gateLabel: 'Gate 2', openHours: '1.0' })).toBe(
      'Reminder: C has been waiting at Gate 2 for about 1.0h. Open the app to respond.',
    );
  });
});

describe('gate message format the Inbox depends on', () => {
  it('Gate 1 and Gate 2 messages, fresh and re-sent, all start with a readable gate number', () => {
    const g1 = formatGateMessage({ channelName: 'Chan', briefText: 'b', scriptText: 's', reviewScore: '8', reviewNotes: 'n' });
    const g1r = formatGateMessage({ channelName: 'Chan', briefText: 'b', scriptText: 's', reviewScore: '8', reviewNotes: 'n', restarted: true });
    const g2 = formatGate2Message({ channelName: 'Chan', verdict: 'pass', rationale: 'ok' });
    const g2r = formatGate2Message({ channelName: 'Chan', verdict: 'pass', rationale: 'ok', restarted: true });
    expect(APP_GATE_PATTERN.exec(g1)?.[1]).toBe('1');
    expect(APP_GATE_PATTERN.exec(g1r)?.[1]).toBe('1');
    expect(APP_GATE_PATTERN.exec(g2)?.[1]).toBe('2');
    expect(APP_GATE_PATTERN.exec(g2r)?.[1]).toBe('2');
  });
});
