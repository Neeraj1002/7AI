import type { UserRole } from '../types';

// Sprint 3 Task 1 (J2) — two distinct JWT shapes, both signed with
// JWT_SECRET but carrying a `purpose` claim so one can never be replayed as
// the other even though they share a signing key.

export type MagicLinkTokenPayload = {
  purpose: 'magic-link';
  sub: string; // userId
  jti: string;
};

export type SessionTokenPayload = {
  purpose: 'session';
  sub: string; // userId
  tenantId: string;
  role: UserRole;
};

export type Session = {
  userId: string;
  tenantId: string;
  role: UserRole;
};
