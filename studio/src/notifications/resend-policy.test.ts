import { describe, it, expect } from 'vitest';
import { decideApprovalPush, buildPushBody, PUSH_BODY_MAX_CHARS } from './resend-policy';

const now = Date.parse('2026-10-11T12:00:00Z');
const ago = (ms: number) => new Date(now - ms);
const base = { now, windowMs: 30 * 60_000, staleDays: 7 };

describe('decideApprovalPush', () => {
  it('sends normally when no card is open (a new gate)', () => {
    expect(decideApprovalPush({ ...base, openApprovalCreatedAt: null, lastNotificationAt: null })).toBe('send');
  });
  it('skips a second send for the same gate inside the window (the 2026-10-10 loop)', () => {
    expect(decideApprovalPush({ ...base, openApprovalCreatedAt: ago(3600_000), lastNotificationAt: ago(5_000) })).toBe('skip-recent');
  });
  it('sends one labelled reminder once the window has passed', () => {
    expect(decideApprovalPush({ ...base, openApprovalCreatedAt: ago(3600_000), lastNotificationAt: ago(40 * 60_000) })).toBe('reminder');
  });
  it('reopens a gate older than the staleness limit without a push', () => {
    expect(decideApprovalPush({ ...base, openApprovalCreatedAt: ago(8 * 86_400_000), lastNotificationAt: ago(8 * 86_400_000) })).toBe('skip-stale');
  });
});

describe('buildPushBody', () => {
  const gate1 = ['Gate 1 - Underdogs', '', 'Brief: ' + 'b'.repeat(900), '', 'Script:', 's'.repeat(2500), 'Review notes: ' + 'n'.repeat(1500)].join('\n');
  it('keeps a Gate 1 message far under Expo limits', () => {
    const body = buildPushBody(gate1, false);
    expect(body.length).toBeLessThanOrEqual(PUSH_BODY_MAX_CHARS);
    expect(Buffer.byteLength(body)).toBeLessThan(4096);
    expect(body.startsWith('Gate 1 - Underdogs')).toBe(true);
  });
  it('labels a re-send as a reminder and drops the restart line', () => {
    const body = buildPushBody('Gate 2 - Underdogs\n(Re-sending after a restart - x)\n\nVideo Intelligence verdict: pass', true);
    expect(body).toBe('Reminder: Gate 2 - Underdogs - Video Intelligence verdict: pass');
  });
});
