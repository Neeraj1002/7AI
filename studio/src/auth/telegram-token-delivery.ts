import { env } from '../config/env';

// Bugs Task 3 (R5) — a small, narrowly-scoped rebuild of Telegram delivery
// for the magic-link flow only. Not a revert of the old notify-founder/
// Telegram module (removed entirely in Sprint 3 Task 7/O2): that module
// routed already-authenticated notifications to a per-user-linked chat;
// this one exists because a magic-link *request* happens before any session
// exists, so there was never a recipient for the old module to resolve in
// the first place. No new npm dependency — a single global fetch call,
// same as the rest of this codebase's HTTP-calling agents.

const TELEGRAM_API_BASE = 'https://api.telegram.org';

function isConfigured(): boolean {
  return env.TELEGRAM_BOT_TOKEN.length > 0;
}

// Best-effort, never throws: called alongside the existing console.log
// fallback in requestMagicLink, never instead of it. A Telegram outage or a
// bad/expired bot token should never break sign-in for someone still using
// the console fallback.
export async function sendTelegramMessage(chatId: string, text: string): Promise<boolean> {
  if (!isConfigured()) {
    return false;
  }
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[telegram-token-delivery] sendMessage failed (${res.status}): ${body}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[telegram-token-delivery] sendMessage threw:', error);
    return false;
  }
}

type TelegramUpdate = {
  update_id: number;
  message?: { chat: { id: number }; text?: string };
};

// In-memory only, deliberately: same posture as gate-reminder.ts's own
// remindedRunIds — a restart just means Telegram redelivers the last batch
// of updates once more (getUpdates' own offset semantics), which is
// harmless here since replying to /start again is idempotent (it only ever
// echoes the chat's own id back).
let updateOffset: number | undefined;
let pollInFlight = false;

// The one-time handshake Telegram itself requires: a bot can't message a
// chat that has never messaged it first. A tester sends /start once and
// gets their numeric chat id back to paste into the login screen — no
// webhook (would need a public HTTPS endpoint this LAN-testing setup
// doesn't have), same setInterval-against-an-external-source shape
// src/index.ts's other background checkers already use.
export async function runTelegramStartPollCheck(): Promise<{ handled: number }> {
  if (!isConfigured() || pollInFlight) {
    return { handled: 0 };
  }
  pollInFlight = true;
  try {
    const params = new URLSearchParams({ timeout: '0' });
    if (updateOffset !== undefined) {
      params.set('offset', String(updateOffset));
    }
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${env.TELEGRAM_BOT_TOKEN}/getUpdates?${params}`);
    if (!res.ok) {
      console.error(`[telegram-token-delivery] getUpdates failed (${res.status})`);
      return { handled: 0 };
    }
    const body = (await res.json()) as { ok: boolean; result: TelegramUpdate[] };
    if (!body.ok) {
      return { handled: 0 };
    }

    let handled = 0;
    for (const update of body.result) {
      updateOffset = update.update_id + 1;
      const chatId = update.message?.chat.id;
      const text = update.message?.text?.trim();
      if (chatId === undefined || text !== '/start') {
        continue;
      }
      const ok = await sendTelegramMessage(
        String(chatId),
        `Your Telegram Chat ID is: ${chatId}\n\nPaste this into the "Telegram Chat ID" field on the 7AI Studio login screen to receive your sign-in token here.`,
      );
      if (ok) handled += 1;
    }
    return { handled };
  } catch (error) {
    console.error('[telegram-token-delivery] getUpdates threw:', error);
    return { handled: 0 };
  } finally {
    pollInFlight = false;
  }
}
