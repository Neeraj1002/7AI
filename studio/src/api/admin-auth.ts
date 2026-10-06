import { TRPCError } from '@trpc/server';
import { findUserById } from '../models/repositories/user.repository';
import type { AdminActor } from '../models/repositories/admin-audit.repository';

// Admin Sprint 1 (R1) — the one gate in front of every admin.* procedure.
// Structural ctx type (not trpc.ts's Context) so trpc.ts can import this file
// without a cycle.
export type AdminAuthContext = {
  identityKind: 'session' | 'ops-token';
  userId: string | null;
};

// True for the ops token, or for a session whose user row currently has
// isPlatformAdmin = true. The flag is a fresh database read on every call,
// never trusted from the session token, so a revoke applies immediately.
export async function resolveAdminActor(ctx: AdminAuthContext): Promise<AdminActor | null> {
  if (ctx.identityKind === 'ops-token') return { kind: 'ops-token', userId: null };
  if (!ctx.userId) return null;
  const user = await findUserById(ctx.userId);
  if (!user || !user.isPlatformAdmin) return null;
  return { kind: 'session', userId: user.id };
}

export async function requirePlatformAdmin(ctx: AdminAuthContext): Promise<AdminActor> {
  const actor = await resolveAdminActor(ctx);
  if (!actor) {
    // Fixed message: never reveal why (no user row, not flagged, ...).
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin only' });
  }
  return actor;
}
