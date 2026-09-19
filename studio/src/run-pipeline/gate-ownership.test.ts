import { describe, it, expect } from 'vitest';
import { canResolveGate } from './gate-ownership';

// Sprint 3 Task 2 (K1) — canResolveGate is deliberately pure (no DB
// access), isolated exactly so its allow/deny decision can be unit tested
// directly. The DB-backed wrapper (assertGateOwnership, api/routers/runs.ts)
// is verified via real live testing instead — same posture this project's
// other DB-backed authorization/allocation logic already established (see
// budget-gate.test.ts for computeChannelBudgetCeilings).

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const CHANNEL_OWNER = 'user-channel-owner';
const OTHER_TENANT_A_OWNER = 'user-other-owner';
const TENANT_A_APPROVER = 'user-approver';

describe('canResolveGate', () => {
  it('allows the channel\'s real owner', () => {
    expect(
      canResolveGate(
        { tenantId: TENANT_A, userId: CHANNEL_OWNER, role: 'approver' },
        { tenantId: TENANT_A, ownerUserId: CHANNEL_OWNER },
      ),
    ).toBe(true);
  });

  it('allows any owner-role user on the same tenant, even if not the channel\'s specific owner', () => {
    expect(
      canResolveGate(
        { tenantId: TENANT_A, userId: OTHER_TENANT_A_OWNER, role: 'owner' },
        { tenantId: TENANT_A, ownerUserId: CHANNEL_OWNER },
      ),
    ).toBe(true);
  });

  it('rejects a different tenant\'s owner-role user, even matching a coincidental userId', () => {
    expect(
      canResolveGate(
        { tenantId: TENANT_B, userId: CHANNEL_OWNER, role: 'owner' },
        { tenantId: TENANT_A, ownerUserId: CHANNEL_OWNER },
      ),
    ).toBe(false);
  });

  it('rejects an approver-role user on the same tenant who is not the channel\'s owner', () => {
    expect(
      canResolveGate(
        { tenantId: TENANT_A, userId: TENANT_A_APPROVER, role: 'approver' },
        { tenantId: TENANT_A, ownerUserId: CHANNEL_OWNER },
      ),
    ).toBe(false);
  });

  it('fails closed on a null ownerUserId — rejects a same-tenant approver', () => {
    expect(
      canResolveGate(
        { tenantId: TENANT_A, userId: TENANT_A_APPROVER, role: 'approver' },
        { tenantId: TENANT_A, ownerUserId: null },
      ),
    ).toBe(false);
  });

  it('a null ownerUserId still lets a same-tenant owner-role user through', () => {
    expect(
      canResolveGate(
        { tenantId: TENANT_A, userId: OTHER_TENANT_A_OWNER, role: 'owner' },
        { tenantId: TENANT_A, ownerUserId: null },
      ),
    ).toBe(true);
  });

  it('allows the ops-token identity (userId: null, role: owner) on its resolved tenant', () => {
    expect(
      canResolveGate(
        { tenantId: TENANT_A, userId: null, role: 'owner' },
        { tenantId: TENANT_A, ownerUserId: CHANNEL_OWNER },
      ),
    ).toBe(true);
  });
});
