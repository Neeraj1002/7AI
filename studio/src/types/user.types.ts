// Sprint 3 Task 1 (J1) — see schema.prisma's User model comment for the
// Tenant<->User relationship decision and the two-role rationale.

export const USER_ROLES = ['owner', 'approver'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export type User = {
  id: string;
  tenantId: string;
  email: string;
  name: string | null;
  role: UserRole;
  telegramChatId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateUserInput = {
  tenantId: string;
  email: string;
  name?: string;
  role: UserRole;
};
