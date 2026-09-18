// Sprint 3 Task 1 (J2) — see schema.prisma's LoginToken model comment.

export type LoginToken = {
  id: string;
  userId: string;
  jti: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

export type CreateLoginTokenInput = {
  userId: string;
  jti: string;
  expiresAt: Date;
};
