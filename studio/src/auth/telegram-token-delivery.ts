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
  const ok = await (async () => {
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
  })();
  // Bugs Task 4 (R4) — the missing half of the trail: a failure already
  // logged above, but a *success* previously logged nothing at all,
  // making "never attempted" and "sent fine" indistinguishable from the
  // console alone. Reuses the same `ok` the function already returns.
  console.log(`[telegram-token-delivery] sendMessage to ${chatId}: ${ok ? 'ok' : 'failed'}`);
  return ok;
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

// Sprint 3 Task 10 (R4) — a long-held HTTPS connection to Telegram's
// getUpdates gets periodically reset by Telegram's own side (a normal,
// transient characteristic of long-polling, confirmed real and recurring
// from the founder: TypeError: fetch failed / SocketError: other side
// closed). Before this, every tick's own catch logged unconditionally —
// harmless to the poll loop itself (the outer setInterval, src/index.ts,
// always calls again regardless), but noisy during a bad patch. Tracked
// per consecutive-failure streak, not per tick: log once when a streak
// starts, back off exponentially (capped) while it continues, reset to
// nothing the moment a call succeeds again.
let consecutiveFailures = 0;
let nextAttemptAt = 0;
const BACKOFF_BASE_MS = 3_000;
// Never wait longer than this between attempts — a cap, not a permanent
// stop: even a long, unusually bad patch keeps retrying, just slowly.
const BACKOFF_MAX_MS = 60_000;

function recordFailure(message: string, error?: unknown): void {
  consecutiveFailures += 1;
  if (consecutiveFailures === 1) {
    if (error !== undefined) {
      console.error(`[telegram-token-delivery] ${message}:`, error);
    } else {
      console.error(`[telegram-token-delivery] ${message}`);
    }
  }
  const backoff = Math.min(BACKOFF_BASE_MS * 2 ** (consecutiveFailures - 1), BACKOFF_MAX_MS);
  nextAttemptAt = Date.now() + backoff;
}

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
  // Still backing off from a recent failure streak — skip this tick
  // silently (the outer setInterval will call again in
  // TELEGRAM_START_POLL_INTERVAL_MS regardless; this just makes some of
  // those ticks no-ops instead of a real attempt).
  if (Date.now() < nextAttemptAt) {
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
      recordFailure(`getUpdates failed (${res.status})`);
      return { handled: 0 };
    }
    const body = (await res.json()) as { ok: boolean; result: TelegramUpdate[] };
    if (!body.ok) {
      recordFailure('getUpdates returned ok:false');
      return { handled: 0 };
    }

    consecutiveFailures = 0;
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
    recordFailure('getUpdates threw', error);
    return { handled: 0 };
  } finally {
    pollInFlight = false;
  }
}
