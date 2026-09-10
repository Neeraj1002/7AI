import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import superjson from 'superjson';
// Direct type-only import from the sibling studio/ package — Task 2's own
// acceptance criterion: no hand-written response types, no duplicated Zod
// schemas. This repo has no npm-workspace wiring (no root package.json), but
// a type-only import doesn't need one — tsc/Metro resolve the relative path
// and strip it entirely at build time, so there's no runtime coupling to
// studio/'s dependency tree.
import type { AppRouter } from '../../studio/src/api/router';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

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
      }),
    ],
  });
}
