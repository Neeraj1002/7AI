// Sprint 3 Task 3 (K2) — see schema.prisma's TelegramLinkCode model comment.

export type TelegramLinkCode = {
  id: string;
  code: string;
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

export type CreateTelegramLinkCodeInput = {
  code: string;
  userId: string;
  expiresAt: Date;
};
