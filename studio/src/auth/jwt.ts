import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { UserRole } from '../types';
import type { MagicLinkTokenPayload, SessionTokenPayload, OAuthStateTokenPayload } from './types';

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
// Sprint 3 Task 5 (M2) — long enough for a real human to complete Google's
// real consent screen (read the permissions, maybe switch Google accounts
// first), short enough that a leaked/logged authUrl stops being useful
// quickly. Not spec'd exactly by the task; 10 minutes matches the same
// order of magnitude as the magic-link TTL above for a comparable
// "complete this real external step promptly" window.
const OAUTH_STATE_TTL_SECONDS = 10 * 60;

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

export function signOAuthStateToken(params: { channelId: string; userId: string }): string {
  const payload: OAuthStateTokenPayload = { purpose: 'oauth-state', channelId: params.channelId, userId: params.userId };
  return jwt.sign(payload, requireSecret(), { expiresIn: OAUTH_STATE_TTL_SECONDS });
}

export function verifyOAuthStateToken(token: string): OAuthStateTokenPayload | null {
  try {
    const decoded = jwt.verify(token, requireSecret()) as OAuthStateTokenPayload;
    return decoded.purpose === 'oauth-state' ? decoded : null;
  } catch {
    return null;
  }
}

// Sprint 6 Task 1 (R5, R6): a link to ONE thumbnail file, good for an hour, so the app can show it and the system
// browser can open or download it without an Authorization header. Minted only by an authenticated, tenant-checked
// call (runs.packaging); the route checks the token names this run, package and size and that the run is still
// in the token's tenant.
const THUMBNAIL_LINK_TTL_SECONDS = 60 * 60;
export type ThumbnailLinkPayload = { purpose: 'thumbnail-link'; runId: string; tenantId: string; packageId: string; size: string };

export function signThumbnailLinkToken(params: { runId: string; tenantId: string; packageId: string; size: string }): string {
  const payload: ThumbnailLinkPayload = { purpose: 'thumbnail-link', ...params };
  return jwt.sign(payload, requireSecret(), { expiresIn: THUMBNAIL_LINK_TTL_SECONDS });
}

export function verifyThumbnailLinkToken(token: string): ThumbnailLinkPayload | null {
  try {
    const decoded = jwt.verify(token, requireSecret()) as ThumbnailLinkPayload;
    return decoded.purpose === 'thumbnail-link' ? decoded : null;
  } catch {
    return null;
  }
}
