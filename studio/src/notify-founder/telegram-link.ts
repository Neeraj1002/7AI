import { randomInt } from 'node:crypto';
import { insertTelegramLinkCode } from '../models/repositories/telegram-link-code.repository';
import { updateUserTelegramChatId } from '../models/repositories/user.repository';

// Sprint 3 Task 3 (K2) — the real "link Telegram" flow: the dashboard calls
// createTelegramLinkCode to show the user a one-time code, they send
// "/link <code>" to the bot (telegram-channel.ts's message handler), which
// looks the code up and sets their real telegramChatId.

const LINK_CODE_TTL_MS = 15 * 60 * 1000;
// Unambiguous alphabet — no 0/O or 1/I/L, so a code read off a phone screen
// and typed into Telegram doesn't fail on a genuinely hard-to-tell-apart
// character, same UX concern most short-code systems (2FA backup codes,
// device-pairing codes) solve the same way.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

export async function createTelegramLinkCode(userId: string): Promise<{ code: string; expiresAt: Date }> {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);
  await insertTelegramLinkCode({ code, userId, expiresAt });
  return { code, expiresAt };
}

// Sprint 3 Task 3 (K2) — the design doc's own "a clear disconnect path in
// the app" requirement. Sets telegramChatId back to null explicitly (not
// merely "leaves it as-is") — see user.repository.ts's
// updateUserTelegramChatId comment on the null-vs-undefined distinction.
export async function unlinkTelegram(userId: string): Promise<void> {
  await updateUserTelegramChatId(userId, null);
}
