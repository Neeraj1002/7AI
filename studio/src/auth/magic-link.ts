import { randomUUID } from 'node:crypto';
import { findUserByEmail, findUserById } from '../models/repositories/user.repository';
import { insertLoginToken, findLoginTokenByJti, markLoginTokenUsed } from '../models/repositories/login-token.repository';
import { signMagicLinkToken, verifyMagicLinkToken, signSessionToken } from './jwt';
import { founderChannel } from '../notify-founder';
import { env } from '../config/env';
import type { Session } from './types';

// Sprint 3 Task 1 (J2) — magic-link email, no password to hash/manage/reset.
// No transactional-email provider is wired into this project yet and adding
// one is out of scope for this task — the real link is logged to the server
// console (always) and additionally relayed via founderChannel.notify()
// (today's one real Telegram sink; genuinely useful "for the founder's own
// login," and still a real, visible, honest notification — not a silent
// drop — for any other user until Task 2/K's per-user Telegram linking
// exists or real email is added later).

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

function buildBaseUrl(): string {
  return env.PUBLIC_API_BASE_URL ?? `http://localhost:${env.API_PORT}`;
}

// No self-serve account creation (J2's own scope note: a tenant needs a
// seeded AgentQuota — Sprint 3 Task 3/L — and who gets a shared-cost account
// during a ~10-tester phase is the founder's call, not an open signup form).
// Deliberately returns void, not a found/not-found result — the caller
// (the /auth/request-link route) must reply with the same generic message
// either way, so this function's own return shape can't leak that
// distinction by accident.
export async function requestMagicLink(params: { email: string }): Promise<void> {
  const user = await findUserByEmail(params.email);
  if (!user) {
    console.log(`[auth] magic-link requested for an unrecognized email (${params.email}) — no link sent`);
    return;
  }

  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS);
  await insertLoginToken({ userId: user.id, jti, expiresAt });
  const token = signMagicLinkToken({ userId: user.id, jti });
  const link = `${buildBaseUrl()}/auth/verify?token=${token}`;

  console.log(`[auth] magic link for ${user.email}: ${link}`);
  try {
    await founderChannel.notify(`Login link for ${user.email}:\n${link}\n(expires in 15 minutes, single-use)`);
  } catch (error) {
    console.error('[auth] failed to relay the magic link over Telegram (already logged above):', error);
  }
}

export type VerifyMagicLinkResult = { ok: true; sessionToken: string; session: Session } | { ok: false; error: string };

const GENERIC_INVALID_LINK_ERROR = 'This login link is invalid or has expired. Request a new one.';

export async function verifyMagicLink(token: string): Promise<VerifyMagicLinkResult> {
  const payload = verifyMagicLinkToken(token);
  if (!payload) {
    return { ok: false, error: GENERIC_INVALID_LINK_ERROR };
  }

  const loginToken = await findLoginTokenByJti(payload.jti);
  if (!loginToken) {
    return { ok: false, error: GENERIC_INVALID_LINK_ERROR };
  }
  // Two separate checks against the JWT's own exp claim (already enforced
  // inside verifyMagicLinkToken) — usedAt is the real replay guard a
  // signature alone can't provide; expiresAt is a DB-level check that
  // doesn't depend solely on trusting the token's self-reported claims.
  if (loginToken.usedAt) {
    return { ok: false, error: 'This login link has already been used. Request a new one.' };
  }
  if (loginToken.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: 'This login link has expired. Request a new one.' };
  }

  const user = await findUserById(loginToken.userId);
  if (!user) {
    return { ok: false, error: 'This login link is no longer valid.' };
  }

  await markLoginTokenUsed(loginToken.id, new Date());

  const session: Session = { userId: user.id, tenantId: user.tenantId, role: user.role };
  const sessionToken = signSessionToken(session);
  return { ok: true, sessionToken, session };
}
