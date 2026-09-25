import { prisma } from '../prisma-client';
import type { User as PrismaUser } from '@prisma/client';
import type { DbClient } from './pipeline-stage.repository';
import type { CreateUserInput, User, UserRole } from '../../types';

function toDomainUser(row: PrismaUser): User {
  return {
    id: row.id,
    tenantId: row.tenantId,
    email: row.email,
    name: row.name,
    role: row.role as UserRole,
    expoPushToken: row.expoPushToken,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function findUserById(id: string): Promise<User | null> {
  const row = await prisma.user.findUnique({ where: { id } });
  return row ? toDomainUser(row) : null;
}

// Sprint 3 Task 1 (J2) — case-insensitive lookup at the DB layer (not just
// trimmed/lowercased at the API edge before calling this): Postgres's
// default collation is case-sensitive, and a founder typing their email
// with different casing than how it was seeded should still find their own
// account, not silently get the generic "no account" response.
export async function findUserByEmail(email: string): Promise<User | null> {
  const row = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
  return row ? toDomainUser(row) : null;
}

export async function insertUser(input: CreateUserInput, client: DbClient = prisma): Promise<User> {
  const row = await client.user.create({
    data: {
      tenantId: input.tenantId,
      email: input.email,
      name: input.name,
      role: input.role,
    },
  });
  return toDomainUser(row);
}

// Sprint 3 Task 3 (K2) — notification-routing's fallback recipient list for
// a channel with no specific ownerUserId (Task 2's own fail-closed design,
// applied to who gets told about a gate, not just who may resolve it): every
// owner-role user on the tenant.
export async function listUsersByTenantAndRole(tenantId: string, role: UserRole): Promise<User[]> {
  const rows = await prisma.user.findMany({ where: { tenantId, role }, orderBy: { createdAt: 'asc' } });
  return rows.map(toDomainUser);
}

// Sprint 3 Task 7 (O1) — the real writer for notifications.registerPushToken.
// `token: null` explicitly clears it (not merely "no change"), same
// null-vs-undefined update semantics Task 3's original chat-id equivalent
// (retired by this task) already established.
export async function updateUserExpoPushToken(userId: string, token: string | null): Promise<User> {
  const row = await prisma.user.update({ where: { id: userId }, data: { expoPushToken: token } });
  return toDomainUser(row);
}
