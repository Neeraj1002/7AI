import type { ExpoPushReceipt, ExpoPushReceiptId, ExpoPushTicket } from 'expo-server-sdk';
import { findUserById, updateUserExpoPushToken } from '../models/repositories/user.repository';

// Bugs Task 10 (R3) — Expo's delivery receipts. A push ticket only says Expo
// *accepted* the message; whether the device actually got it (and whether the
// token is dead) only shows up in the receipt, minutes later. Tickets of
// accepted pushes are kept in memory (lost on restart — accepted, stated in
// the report) and checked on a timer.
//
// Nothing here may throw into the notification path: every entry point
// catches and logs one line.

export const RECEIPT_MIN_AGE_MS = 2 * 60 * 1000;
export const RECEIPT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const RECEIPT_CHECK_INTERVAL_MS = 5 * 60 * 1000;

type PendingTicket = { ticketId: string; userId: string; token: string; sentAt: number };

const pending = new Map<string, PendingTicket>();

// The slice of expo-server-sdk's client this file needs, so tests can mock it.
export interface ReceiptClient {
  chunkPushNotificationReceiptIds(ids: ExpoPushReceiptId[]): ExpoPushReceiptId[][];
  getPushNotificationReceiptsAsync(ids: ExpoPushReceiptId[]): Promise<Record<string, ExpoPushReceipt>>;
}

export function pendingTicketCount(): number {
  return pending.size;
}

export function resetPendingTickets(): void {
  pending.clear();
}

// Clears the stored token only if it is still the one that failed — a user
// who re-registered a fresh token since must not lose it to a late receipt.
async function clearTokenIfUnchanged(userId: string, failedToken: string): Promise<void> {
  const user = await findUserById(userId);
  if (user && user.expoPushToken === failedToken) {
    await updateUserExpoPushToken(userId, null);
    console.warn(`[push-receipts] user ${userId}: DeviceNotRegistered — stored push token cleared`);
  }
}

// Expo's own error text echoes the token ("\"ExponentPushToken[...]\" is not a
// registered push notification recipient ..."); logs must never carry it.
function redact(message: string): string {
  return message.replace(/Expo(?:nent)?PushToken\[[^\]]*\]/g, '[token]');
}

function errorCode(details: unknown): string | undefined {
  return (details as { error?: string } | undefined)?.error;
}

// Called by ExpoPushChannel for every ticket Expo returns at send time.
export async function handleTicket(
  ticket: ExpoPushTicket,
  ctx: { userId: string; token: string },
  now: number = Date.now(),
): Promise<void> {
  try {
    if (ticket.status === 'ok') {
      pending.set(ticket.id, { ticketId: ticket.id, userId: ctx.userId, token: ctx.token, sentAt: now });
      return;
    }
    const code = errorCode(ticket.details);
    // Never log the token (or ticket.details, which can echo it).
    console.error(`[push-receipts] send ticket error for user ${ctx.userId}: ${redact(ticket.message)} (${code ?? 'no code'})`);
    if (code === 'DeviceNotRegistered') await clearTokenIfUnchanged(ctx.userId, ctx.token);
  } catch (error) {
    console.error(`[push-receipts] could not handle a ticket: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// One pass: drop expired tickets unchecked, ask Expo for receipts of tickets
// old enough to have one, log errors, clear dead tokens, forget what was read.
export async function checkReceipts(client: ReceiptClient, now: number = Date.now()): Promise<void> {
  try {
    for (const [id, t] of pending) {
      if (now - t.sentAt > RECEIPT_MAX_AGE_MS) pending.delete(id);
    }
    const due = [...pending.values()].filter((t) => now - t.sentAt >= RECEIPT_MIN_AGE_MS);
    if (due.length === 0) return;
    for (const chunk of client.chunkPushNotificationReceiptIds(due.map((t) => t.ticketId))) {
      const receipts = await client.getPushNotificationReceiptsAsync(chunk);
      for (const [id, receipt] of Object.entries(receipts)) {
        const t = pending.get(id);
        if (!t) continue;
        pending.delete(id);
        if (receipt.status !== 'error') continue;
        const code = errorCode(receipt.details);
        console.error(
          `[push-receipts] receipt error for user ${t.userId} ticket ${id}: ${redact(receipt.message)} (${code ?? 'no code'}) details=${redact(JSON.stringify(receipt.details ?? {}))}`,
        );
        if (code === 'DeviceNotRegistered') await clearTokenIfUnchanged(t.userId, t.token);
      }
    }
  } catch (error) {
    console.error(`[push-receipts] receipt check failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Started at boot; the timer is unref'd so it never keeps the process alive,
// and the returned stop function (also wired to process 'exit') clears it.
export function startReceiptChecker(client: ReceiptClient): () => void {
  const timer = setInterval(() => {
    void checkReceipts(client);
  }, RECEIPT_CHECK_INTERVAL_MS);
  timer.unref();
  const stop = () => clearInterval(timer);
  process.once('exit', stop);
  return stop;
}
