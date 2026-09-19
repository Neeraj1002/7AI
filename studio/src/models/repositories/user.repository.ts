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
    telegramChatId: row.telegramChatId,
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

// Sprint 3 Task 3 (K2) — the real writer for the `/link <code>` flow and
// the unlink mutation. `chatId: null` explicitly unlinks (not merely "no
// change"), since a caller passing undefined would leave the column
// untouched — Prisma's own null-vs-undefined update semantics.
export async function updateUserTelegramChatId(userId: string, chatId: string | null): Promise<User> {
  const row = await prisma.user.update({ where: { id: userId }, data: { telegramChatId: chatId } });
  return toDomainUser(row);
}
