import { prisma } from '../prisma-client';
import type { LoginToken as PrismaLoginToken } from '@prisma/client';
import type { CreateLoginTokenInput, LoginToken } from '../../types';

function toDomainLoginToken(row: PrismaLoginToken): LoginToken {
  return {
    id: row.id,
    userId: row.userId,
    jti: row.jti,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt,
    createdAt: row.createdAt,
  };
}

export async function insertLoginToken(input: CreateLoginTokenInput): Promise<LoginToken> {
  const row = await prisma.loginToken.create({
    data: { userId: input.userId, jti: input.jti, expiresAt: input.expiresAt },
  });
  return toDomainLoginToken(row);
}

export async function findLoginTokenByJti(jti: string): Promise<LoginToken | null> {
  const row = await prisma.loginToken.findUnique({ where: { jti } });
  return row ? toDomainLoginToken(row) : null;
}

// Sprint 3 Task 1 (J2) — the actual replay guard. The JWT signature alone
// only proves the token was issued by this server; this DB-tracked
// single-use check is what prevents the same real link being used twice.
export async function markLoginTokenUsed(id: string, usedAt: Date): Promise<LoginToken> {
  const row = await prisma.loginToken.update({ where: { id }, data: { usedAt } });
  return toDomainLoginToken(row);
}
