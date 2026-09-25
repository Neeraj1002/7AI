import type { Context } from '../api/trpc';
import type { Channel } from '../types';

// Sprint 3 Task 2 (K1) — the gate-ownership decision, deliberately pure (no
// DB access) so it can be unit tested directly, same posture
// budget-gate.ts's computeChannelBudgetCeilings already established for
// this codebase's other pure allocation/authorization logic.
//
// Fails closed: a null channel.ownerUserId is never treated as "anyone may
// resolve it" — it falls through to the isTenantOwnerRole check only, same
// as a channel with a real owner would for a different tenant's owner-role
// user (which is still correctly rejected by the tenantId check first).
export function canResolveGate(ctx: Pick<Context, 'tenantId' | 'userId' | 'role'>, channel: Pick<Channel, 'tenantId' | 'ownerUserId'>): boolean {
  const sameTenant = ctx.tenantId === channel.tenantId;
  const isChannelOwner = ctx.userId !== null && ctx.userId === channel.ownerUserId;
  const isTenantOwnerRole = ctx.role === 'owner';

  return sameTenant && (isChannelOwner || isTenantOwnerRole);
}
