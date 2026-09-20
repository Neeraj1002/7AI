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

// Sprint 3 Task 5 (M2) — carried as OAuth's own `state` parameter, so
// /oauth2callback (hit by a real Google redirect, never carrying our own
// Authorization header) knows which channel this consent belongs to and
// that the original request was genuinely made by an authorized session —
// without relying on session/cookie continuity across the Google redirect,
// which a mobile app's in-app browser doesn't reliably preserve.
export type OAuthStateTokenPayload = {
  purpose: 'oauth-state';
  channelId: string;
  userId: string;
};

export type Session = {
  userId: string;
  tenantId: string;
  role: UserRole;
};
