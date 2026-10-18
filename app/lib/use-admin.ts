import { useQuery } from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '../../studio/src/api/router';
import { useAuth } from './auth';
import { whoamiQueryKey } from './admin-keys';
import { useTRPCClient } from './trpc';

// Admin Sprint 1 FE (R1) — the server decides who is an Admin (admin.whoami) and
// re-checks on every admin call; this hook only drives what the app shows.
export function useIsAdmin(): { isAdmin: boolean; isLoading: boolean; userId: string | null } {
  const client = useTRPCClient();
  const { userId: signedInUserId } = useAuth();
  const whoami = useQuery({
    queryKey: whoamiQueryKey(signedInUserId),
    queryFn: () => client.admin.whoami.query(),
    // No signed-in user, nothing to ask; the entry point stays hidden.
    enabled: signedInUserId !== null,
    staleTime: 5 * 60_000,
    retry: false,
  });
  // Only trust an answer that was given for this user.
  const answer = signedInUserId !== null && whoami.data?.userId === signedInUserId ? whoami.data : undefined;
  return {
    // An error means "not an Admin": the entry point stays hidden.
    isAdmin: answer?.platformAdmin === true,
    isLoading: signedInUserId !== null && whoami.isLoading,
    userId: answer?.userId ?? null,
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
