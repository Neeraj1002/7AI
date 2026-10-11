import { describe, it, expect, vi } from 'vitest';

vi.mock('../models/repositories/notification.repository', () => ({
  markNotificationsResolvedByThreadKey: vi.fn().mockResolvedValue(undefined),
}));

import { getOrCreatePendingApproval, resolvePendingApproval, hasPendingApproval } from './pending-approvals';

describe('pending approvals carry the approver (Sprint 4 Task 4)', () => {
  it('resolves with the reply and the real user id as one unit', async () => {
    const pending = getOrCreatePendingApproval('run-a');
    expect(hasPendingApproval('run-a')).toBe(true);
    expect(resolvePendingApproval('run-a', { reply: 'approve', userId: 'user-1' })).toEqual({ resolved: true });
    await expect(pending).resolves.toEqual({ reply: 'approve', userId: 'user-1' });
  });

  it('keeps userId null for the ops/script path', async () => {
    const pending = getOrCreatePendingApproval('run-b');
    resolvePendingApproval('run-b', { reply: 'reject no', userId: null });
    await expect(pending).resolves.toEqual({ reply: 'reject no', userId: null });
  });

  it('every caller sharing a threadKey gets the same result, and the first resolution wins', async () => {
    const first = getOrCreatePendingApproval('run-c');
    const second = getOrCreatePendingApproval('run-c');
    expect(first).toBe(second);
    expect(resolvePendingApproval('run-c', { reply: 'approve', userId: 'u1' }).resolved).toBe(true);
    expect(resolvePendingApproval('run-c', { reply: 'reject x', userId: 'u2' }).resolved).toBe(false);
    await expect(first).resolves.toEqual({ reply: 'approve', userId: 'u1' });
  });
});
