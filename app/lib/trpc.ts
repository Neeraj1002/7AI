import { createTRPCClient, httpBatchLink, TRPCClientError } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import superjson from 'superjson';
import { fetchWithTimeout } from './auth-api';
// Direct type-only import from the sibling studio/ package — Task 2's own
// acceptance criterion: no hand-written response types, no duplicated Zod
// schemas. This repo has no npm-workspace wiring (no root package.json), but
// a type-only import doesn't need one — tsc/Metro resolve the relative path
// and strip it entirely at build time, so there's no runtime coupling to
// studio/'s dependency tree.
import type { AppRouter } from '../../studio/src/api/router';

export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

// Recreated whenever the stored token/apiUrl change (AuthProvider) — see
// app/_layout.tsx. The auth header is attached per-request here, the same
// single-shared-token model the API itself expects (no session, no refresh).
export function createTrpcClient(apiUrl: string, token: string) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${apiUrl.replace(/\/$/, '')}/trpc`,
        transformer: superjson,
        headers: () => ({ authorization: `Bearer ${token}` }),
        // Bugs Task 8 (R2) — bounded, so a dead server fails instead of hanging.
        fetch: (url, options) => fetchWithTimeout(url, options as RequestInit),
      }),
    ],
  });
}

// Bugs Task 8 (R2) — true only when the API itself didn't answer: no HTTP
// response at all (connection refused, DNS, our timeout) or a gateway saying
// the upstream is gone (502/503/504 from the VPS proxy). Anything else the
// server sent back — a tRPC error, or the auth hook's plain-JSON 401 — is a
// real answer, not "server down".
const GATEWAY_DOWN_STATUSES = new Set([502, 503, 504]);

export function isServerUnreachableError(error: unknown): boolean {
  if (!(error instanceof TRPCClientError) || error.data) return false;
  const status = (error.meta?.response as { status?: number } | undefined)?.status;
  return status === undefined || GATEWAY_DOWN_STATUSES.has(status);
}
