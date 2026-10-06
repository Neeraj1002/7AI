import { useQuery } from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../studio/src/api/router';
import { useTRPC } from './trpc';

// Admin Sprint 1 FE (R1) — the server decides who is an Admin (admin.whoami) and
// re-checks on every admin call; this hook only drives what the app shows.
export function useIsAdmin(): { isAdmin: boolean; isLoading: boolean; userId: string | null } {
  const trpc = useTRPC();
  const whoami = useQuery({
    ...trpc.admin.whoami.queryOptions(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return {
    // An error means "not an Admin": the entry point stays hidden.
    isAdmin: whoami.data?.platformAdmin === true,
    isLoading: whoami.isLoading,
    userId: whoami.data?.userId ?? null,
  };
}

export function isForbiddenError(error: unknown): boolean {
  return error instanceof TRPCClientError && (error.data as { code?: string } | undefined)?.code === 'FORBIDDEN';
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof TRPCClientError && (error.data as { code?: string } | undefined)?.code === 'NOT_FOUND';
}

/** Response types of the admin procedures, e.g. AdminOutputs['budget']['get']. */
export type AdminOutputs = inferRouterOutputs<AppRouter>['admin'];
