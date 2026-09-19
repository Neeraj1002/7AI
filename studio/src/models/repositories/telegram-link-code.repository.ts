import { prisma } from '../prisma-client';
import type { TelegramLinkCode as PrismaTelegramLinkCode } from '@prisma/client';
import type { CreateTelegramLinkCodeInput, TelegramLinkCode } from '../../types';

function toDomainCode(row: PrismaTelegramLinkCode): TelegramLinkCode {
  return {
    id: row.id,
    code: row.code,
    userId: row.userId,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt,
    createdAt: row.createdAt,
  };
}

export async function insertTelegramLinkCode(input: CreateTelegramLinkCodeInput): Promise<TelegramLinkCode> {
  const row = await prisma.telegramLinkCode.create({
    data: { code: input.code, userId: input.userId, expiresAt: input.expiresAt },
  });
  return toDomainCode(row);
}

export async function findTelegramLinkCodeByCode(code: string): Promise<TelegramLinkCode | null> {
  const row = await prisma.telegramLinkCode.findUnique({ where: { code } });
  return row ? toDomainCode(row) : null;
}

export async function markTelegramLinkCodeUsed(id: string, usedAt: Date): Promise<TelegramLinkCode> {
  const row = await prisma.telegramLinkCode.update({ where: { id }, data: { usedAt } });
  return toDomainCode(row);
}
