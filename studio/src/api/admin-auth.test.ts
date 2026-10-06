import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../models/repositories/user.repository', () => ({ findUserById: vi.fn() }));

import { findUserById } from '../models/repositories/user.repository';
import { requirePlatformAdmin, resolveAdminActor } from './admin-auth';

// Admin Sprint 1 (R1) — the requirePlatformAdmin matrix: ops token ok; flagged
// session ok; unflagged session FORBIDDEN; session for a deleted user
// FORBIDDEN; flag revoked between two calls.
const findUser = vi.mocked(findUserById);

function userRow(isPlatformAdmin: boolean) {
  return { id: 'user-1', isPlatformAdmin } as Awaited<ReturnType<typeof findUserById>>;
}

beforeEach(() => {
  findUser.mockReset();
});

describe('requirePlatformAdmin', () => {
  it('lets the ops token through without a user lookup', async () => {
    const actor = await requirePlatformAdmin({ identityKind: 'ops-token', userId: null });
    expect(actor).toEqual({ kind: 'ops-token', userId: null });
    expect(findUser).not.toHaveBeenCalled();
  });

  it('lets a flagged session through, identified by its user id', async () => {
    findUser.mockResolvedValue(userRow(true));
    const actor = await requirePlatformAdmin({ identityKind: 'session', userId: 'user-1' });
    expect(actor).toEqual({ kind: 'session', userId: 'user-1' });
  });

  it('refuses an unflagged session with the fixed FORBIDDEN message', async () => {
    findUser.mockResolvedValue(userRow(false));
    await expect(requirePlatformAdmin({ identityKind: 'session', userId: 'user-1' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Admin only',
    });
  });

  it('refuses a session whose user row no longer exists', async () => {
    findUser.mockResolvedValue(null);
    await expect(requirePlatformAdmin({ identityKind: 'session', userId: 'gone' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'Admin only',
    });
  });

  it('refuses a session with no user id', async () => {
    await expect(requirePlatformAdmin({ identityKind: 'session', userId: null })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(findUser).not.toHaveBeenCalled();
  });

  it('reads the flag fresh on every call: a revoke between two calls applies immediately', async () => {
    const ctx = { identityKind: 'session' as const, userId: 'user-1' };
    findUser.mockResolvedValueOnce(userRow(true)).mockResolvedValueOnce(userRow(false));
    await expect(requirePlatformAdmin(ctx)).resolves.toBeTruthy();
    await expect(requirePlatformAdmin(ctx)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(findUser).toHaveBeenCalledTimes(2);
  });
});

describe('resolveAdminActor', () => {
  it('returns null rather than throwing for a non-admin (whoami uses it)', async () => {
    findUser.mockResolvedValue(userRow(false));
    await expect(resolveAdminActor({ identityKind: 'session', userId: 'user-1' })).resolves.toBeNull();
  });
});
