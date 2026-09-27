import '../config/env';
import { PrismaClient } from '@prisma/client';

// One client for the whole process, per Prisma's own guidance — repositories
// import this rather than each constructing their own PrismaClient.
// Bugs Task 9 (R2) — Prisma's default 5s interactive-transaction timeout was hit
// live (P2028) on the gate-decision writes; every $transaction here is a few
// small row writes, so a roomier ceiling only absorbs slow moments (debugger
// pauses, a busy local Postgres) rather than masking real long transactions.
export const prisma = new PrismaClient({ transactionOptions: { maxWait: 10_000, timeout: 20_000 } });
