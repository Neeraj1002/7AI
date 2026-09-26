import { randomUUID } from 'node:crypto';
import { findUserByEmail, findUserById, updateUserTelegramChatId } from '../models/repositories/user.repository';
import { insertLoginToken, findLoginTokenByJti, markLoginTokenUsed } from '../models/repositories/login-token.repository';
import { signMagicLinkToken, verifyMagicLinkToken, signSessionToken } from './jwt';
import { sendTelegramMessage } from './telegram-token-delivery';
import { env } from '../config/env';
import type { Session } from './types';

// Sprint 3 Task 1 (J2) — magic-link email, no password to hash/manage/reset.
// No transactional-email provider is wired into this project yet and adding
// one is out of scope for this task.
//
// Sprint 3 Task 7 (O2) — Task 3 (K2)'s bot-relay fix (route to the
// requesting user's own linked chat, never the founder's) is retired along
// with that whole notification channel. This stays a console-only
// fallback: a magic link is requested *before* the recipient has a
// session, so there's no Notification-inbox recipient (or push token) to
// route to yet — a real gap, not silently pretended away, flagged by
// Sprint 3 frontend Task 1 as a known, temporary limitation until real
// email delivery exists. Not this task's job to close.

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
//
// Bugs Task 3 (R5) — `telegramChatId` is optional and, when present,
// self-healingly overwrites User.telegramChatId (never a one-time-only
// save) before sending. When omitted, falls back to whatever's already
// stored on the user — this is what makes "leave it blank after the first
// time" work, entirely server-side. Same no-enumeration posture as the
// unrecognized-email path above: never a distinct response/log path that
// would tell a caller whether a chat id was already on file for this user.
export async function requestMagicLink(params: { email: string; telegramChatId?: string }): Promise<void> {
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

  const chatId = params.telegramChatId?.trim() || user.telegramChatId;
  if (params.telegramChatId?.trim() && params.telegramChatId.trim() !== user.telegramChatId) {
    await updateUserTelegramChatId(user.id, params.telegramChatId.trim());
  }
  if (chatId) {
    // Never instead of the console log above — Telegram delivery is an
    // addition, the console line stays the zero-cost fallback regardless of
    // whether this succeeds.
    await sendTelegramMessage(
      chatId,
      `Your 7AI Studio sign-in token (expires in 15 minutes):\n\n${token}\n\nPaste it into the app's "sign-in link or token" field.`,
    );
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
