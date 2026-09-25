import { env } from '../config/env';
import { verifySessionToken } from './jwt';
import type { UserRole } from '../types';

// Sprint 3 Task 1 (J2) — the single source of truth for "who is this
// request," shared by api/server.ts's onRequest hook (the early 401 gate)
// and api/trpc.ts's createContext (what ctx.tenantId/userId/role actually
// resolve to) — deliberately factored out so the two never drift out of
// sync by re-implementing the same bearer-token parsing twice.

export type RequestIdentity =
  | { kind: 'session'; userId: string; tenantId: string; role: UserRole }
  // J2: API_AUTH_TOKEN is downgraded to an explicit ops/script fallback —
  // used by scripts/dry-run.ts and similar tooling, never by the real app.
  // Resolves to the founder's own seeded tenant/owner identity, matching
  // this project's pre-Sprint-3 single-tenant behavior exactly, so every
  // existing ops flow keeps working unchanged.
  | { kind: 'ops-token' }
  | { kind: 'unauthenticated' };

export function resolveRequestIdentity(authorizationHeader: string | undefined): RequestIdentity {
  const token = authorizationHeader?.startsWith('Bearer ') ? authorizationHeader.slice('Bearer '.length) : undefined;
  if (!token) {
    return { kind: 'unauthenticated' };
  }

  if (env.API_AUTH_TOKEN && token === env.API_AUTH_TOKEN) {
    return { kind: 'ops-token' };
  }

  const session = verifySessionToken(token);
  if (session) {
    return { kind: 'session', userId: session.sub, tenantId: session.tenantId, role: session.role };
  }

  return { kind: 'unauthenticated' };
}
