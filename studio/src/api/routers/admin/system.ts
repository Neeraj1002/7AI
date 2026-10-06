import { router, adminProcedure } from '../../trpc';
import { getSystemInfo } from '../../system-info';

// Read-only, no audit row.
export const adminSystemRouter = router({
  info: adminProcedure.query(() => getSystemInfo()),
});
