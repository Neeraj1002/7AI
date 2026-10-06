import { initTRPC, TRPCError } from '@trpc/server';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import superjson from 'superjson';
import { resolveRequestIdentity } from '../auth';
import { MVP_TENANT_ID, type UserRole } from '../types';
import { requirePlatformAdmin } from './admin-auth';

// Sprint 3 Task 1 (J2) — real per-request identity, replacing the "no
// session table, nothing per-request to attach to a context" posture this
// file's comment used to describe. Every request reaching here has already
// passed api/server.ts's onRequest hook (a real session or the
// API_AUTH_TOKEN ops fallback) — resolveRequestIdentity is called again
// here (not passed through from the hook) since Fastify's hook and tRPC's
// createContext are separate mechanisms with no shared per-request state;
// see auth/request-identity.ts's own comment for why the classification
// logic itself lives in one shared place rather than being duplicated.
export type Context = {
  tenantId: string;
  userId: string | null;
  role: UserRole;
  // Admin Sprint 1 (R1) - which kind of credential resolved this request.
  // Before this, an ops-token call and a tenant-owner session were
  // indistinguishable except userId === null. Existing routers ignore it.
  identityKind: 'session' | 'ops-token';
};

export function createContext({ req }: CreateFastifyContextOptions): Context {
  const identity = resolveRequestIdentity(req.headers.authorization);

  if (identity.kind === 'session') {
    return { tenantId: identity.tenantId, userId: identity.userId, role: identity.role, identityKind: 'session' };
  }
  if (identity.kind === 'ops-token') {
    // Ops/script tooling acts as the founder/owner on the single MVP
    // tenant — matches this project's pre-Sprint-3 single-tenant behavior
    // exactly, so scripts/dry-run.ts and similar tooling keep working
    // unchanged.
    return { tenantId: MVP_TENANT_ID, userId: null, role: 'owner', identityKind: 'ops-token' };
  }

  // Defensive, not the expected path in production: api/server.ts's
  // onRequest hook already rejects an unauthenticated request with a 401
  // before it ever reaches tRPC. Never silently fall back to a real tenant.
  throw new TRPCError({ code: 'UNAUTHORIZED', message: 'No valid session or ops token' });
}

// superjson as the transformer: several response shapes here carry real
// Date/Decimal/BigInt values (PipelineRun.completedAt, UsageEvent.costUsd,
// performance_snapshots.views, ...) — Task 2's app is meant to consume this
// router's inferred types directly, and those types only match what actually
// arrives on the wire if rich types round-trip instead of silently
// flattening to strings/numbers under plain JSON.
const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

// Admin Sprint 1 (R1) - every admin.* procedure except whoami goes through
// this. The platform-admin flag is read from the database per call; the actor
// is put on ctx.admin for the audit writer. Admin procedures never read
// ctx.tenantId: tenant is always an explicit input.
export const adminProcedure = t.procedure.use(async ({ ctx, next }) => {
  const admin = await requirePlatformAdmin(ctx);
  return next({ ctx: { ...ctx, admin } });
});
