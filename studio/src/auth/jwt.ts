import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { UserRole } from '../types';
import type { MagicLinkTokenPayload, SessionTokenPayload } from './types';

// Sprint 3 Task 1 (J2) — the only file allowed to touch `jsonwebtoken`
// directly, same provider-boundary pattern every external-integration
// client.ts in this codebase already holds.

// 15 minutes — J2's own explicit spec.
const MAGIC_LINK_TTL_SECONDS = 15 * 60;
// Not spec'd exactly by the task. No DB-backed session/revocation exists
// (J2: "a JWT is itself the bearer credential"), so this is a real tradeoff,
// not an arbitrary number: 30 days is a reasonable "stay signed in" window
// for a ~10-tester internal tool where re-login just means another magic
// link, not a real security incident if a session outlives its usefulness
// by a few days.
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

export function isAuthConfigured(): boolean {
  return Boolean(env.JWT_SECRET);
}

function requireSecret(): string {
  if (!env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not set — call isAuthConfigured() before signing/verifying a token');
  }
  return env.JWT_SECRET;
}

export function signMagicLinkToken(params: { userId: string; jti: string }): string {
  const payload: MagicLinkTokenPayload = { purpose: 'magic-link', sub: params.userId, jti: params.jti };
  return jwt.sign(payload, requireSecret(), { expiresIn: MAGIC_LINK_TTL_SECONDS });
}

// Broad catch-and-return-null by design: an expired token, a bad signature,
// a malformed token, and JWT_SECRET being unset (requireSecret() throwing)
// are all "this token doesn't verify" from the caller's point of view —
// none of them should ever throw into request-handling code.
export function verifyMagicLinkToken(token: string): MagicLinkTokenPayload | null {
  try {
    const decoded = jwt.verify(token, requireSecret()) as MagicLinkTokenPayload;
    return decoded.purpose === 'magic-link' ? decoded : null;
  } catch {
    return null;
  }
}

export function signSessionToken(params: { userId: string; tenantId: string; role: UserRole }): string {
  const payload: SessionTokenPayload = {
    purpose: 'session',
    sub: params.userId,
    tenantId: params.tenantId,
    role: params.role,
  };
  return jwt.sign(payload, requireSecret(), { expiresIn: SESSION_TTL_SECONDS });
}

export function verifySessionToken(token: string): SessionTokenPayload | null {
  try {
    const decoded = jwt.verify(token, requireSecret()) as SessionTokenPayload;
    return decoded.purpose === 'session' ? decoded : null;
  } catch {
    return null;
  }
}
