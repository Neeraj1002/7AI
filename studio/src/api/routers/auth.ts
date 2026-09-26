import { router, publicProcedure } from '../trpc';
import { findUserById } from '../../models/repositories/user.repository';

// Sprint 3 Task 8 (R4) — lets the app show "Signed in as {email}" without a
// direct DB read. Deliberately a plain query keyed off the already-trusted
// ctx.userId, not an email claim baked into SessionTokenPayload: that would
// need a token-shape version bump and wouldn't apply retroactively to
// already-issued session tokens still in use. The ops-token fallback
// (ctx.userId === null) returns { email: null } rather than throwing.
export const authRouter = router({
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) return { email: null };
    const user = await findUserById(ctx.userId);
    return { email: user?.email ?? null };
  }),
});
