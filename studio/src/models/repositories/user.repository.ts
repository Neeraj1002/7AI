import { prisma } from '../prisma-client';
import type { User as PrismaUser } from '@prisma/client';
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

export async function insertUser(input: CreateUserInput): Promise<User> {
  const row = await prisma.user.create({
    data: {
      tenantId: input.tenantId,
      email: input.email,
      name: input.name,
      role: input.role,
    },
  });
  return toDomainUser(row);
}
