import '../config/env';
import { PrismaClient } from '@prisma/client';

// One client for the whole process, per Prisma's own guidance — repositories
// import this rather than each constructing their own PrismaClient.
export const prisma = new PrismaClient();
