import { Bot, InputFile, type Context } from 'grammy';
import { env } from '../config/env';
import type { FounderChannel } from './channel';
import { parsePostHocTagCommand, recordPostHocTag } from '../run-pipeline/post-hoc-tag';
import {
  getOrCreatePendingApproval,
  attachTelegramMessageId,
  findThreadKeyByTelegramMessageId,
  singlePendingTelegramThreadKey,
  resolvePendingApproval as resolvePendingApprovalShared,
  peekPendingMessageId as peekPendingMessageIdShared,
} from './pending-approvals';
import { findTelegramLinkCodeByCode, markTelegramLinkCodeUsed } from '../models/repositories/telegram-link-code.repository';
import { updateUserTelegramChatId } from '../models/repositories/user.repository';

// The only file allowed to import grammy — see
// docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md. Everything this
// module exposes outward implements FounderChannel; no grammy types cross
// that boundary.
//
// Sprint 3 Task 3 (K2) — one real bot process-wide (one token, one
// long-polling connection — Telegram allows only one active getUpdates
// poller per token, same constraint KNOWN_ISSUES_AND_BLOCKERS.md §3
// already documents), shared across every TelegramFounderChannel instance;
// each instance now differs only by which real chatId it sends to, no
// longer the single hardcoded env.TELEGRAM_FOUNDER_CHAT_ID.

let bot: Bot | null = null;
function getBot(): Bot {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error(
      'TELEGRAM_BOT_TOKEN is not set. Create a bot via @BotFather in Telegram and put the token in .env.local.',
    );
  }
  if (!bot) {
    bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  }
  return bot;
}

// Derived from grammy's own handleUpdate signature rather than importing
// @grammyjs/types directly (a transitive dependency, not a direct one) — kept
// in sync with whatever grammy itself expects.
type IncomingUpdate = Parameters<Bot['handleUpdate']>[0];

let receiveLoopStarted = false;

// Sprint 3 Task 3 (K2) — a real, live-found robustness gap, fixed here: a
// bare `ctx.reply(...)` inside a catch block that itself throws (e.g. the
// chat no longer exists, the bot was blocked) previously propagated
// uncaught — for a real running server, grammy's own bot.catch() masks
// this from crashing the whole process, but the underlying action (a real
// DB write, e.g. a successful /link) could still silently never reach the
// user's confirmation, and a test harness calling handleUpdate directly
// (simulateIncomingTelegramMessage) had nothing to catch it at all, so it
// crashed outright — confirmed live during this task's own verification.
// Every reply in this handler now goes through this helper instead of a
// bare `ctx.reply`.
async function safeReply(ctx: Pick<Context, 'reply'>, text: string): Promise<void> {
  try {
    await ctx.reply(text);
  } catch (error) {
    console.error('[telegram] failed to send a reply (the underlying action, if any, already completed):', error);
  }
}

// Sprint 3 Task 3 (K2) — `/link <code>` grammar, matching the exact
// precedent Sprint 2 Task 6's `tag ...` command established: checked first,
// unconditionally, before the reply-to-message/single-pending-gate
// resolution logic, so a link attempt can never be mistaken for a gate
// reply. Short, human-typeable codes (see notify-founder/link-code.ts) —
// case-insensitive, since a phone keyboard's autocapitalize would otherwise
// make a real code fail to match.
export function parseLinkCommand(text: string): string | null {
  const match = text.trim().match(/^\/link\s+(\S+)$/i);
  return match ? match[1].toUpperCase() : null;
}

function ensureReceiveLoopStarted(): void {
  if (receiveLoopStarted) return;
  receiveLoopStarted = true;

  const b = getBot();

  b.on('message:text', async (ctx) => {
    console.log(
      `[telegram] received from chat ${ctx.chat.id} (${ctx.from?.username ?? ctx.from?.first_name ?? 'unknown'}): ${ctx.message.text}`,
    );

    // Sprint 3 Task 3 (K2) — the real Telegram-linking flow. Checked first,
    // same precedence reasoning as the tag-command check below: a
    // deliberate command word should never be swallowed by the gate-reply
    // fallback.
    const linkCode = parseLinkCommand(ctx.message.text);
    if (linkCode) {
      try {
        const codeRow = await findTelegramLinkCodeByCode(linkCode);
        if (!codeRow) {
          await safeReply(ctx, 'That code is invalid. Check the app for the current one and try again.');
          return;
        }
        if (codeRow.usedAt) {
          await safeReply(ctx, 'That code has already been used. Generate a new one in the app.');
          return;
        }
        if (codeRow.expiresAt.getTime() < Date.now()) {
          await safeReply(ctx, 'That code has expired. Generate a new one in the app.');
          return;
        }
        await markTelegramLinkCodeUsed(codeRow.id, new Date());
        await updateUserTelegramChatId(codeRow.userId, String(ctx.chat.id));
        console.log(`[telegram] linked user ${codeRow.userId} to chat ${ctx.chat.id}`);
        await safeReply(ctx, 'Linked! Gate notifications for your channels will now also come through here.');
      } catch (error) {
        console.error('[telegram] failed to process a /link command:', error);
        await safeReply(ctx, 'Something went wrong linking that code — check the server logs.');
      }
      return;
    }

    // Sprint 2 Task 6 (I2) — the project's first *unsolicited* incoming
    // message: every other flow only ever resolves a pending
    // requestApproval() promise. Checked first, unconditionally, before the
    // reply-to-message/single-pending-gate resolution below — a "tag ..."
    // command must never be accidentally consumed as an edited-script reply
    // to an unrelated, simultaneously-open gate.
    //
    // Genuinely awaited (not fire-and-forget): grammy's handleUpdate awaits
    // this handler, so a caller awaiting handleUpdate (production's real
    // update loop, and simulateIncomingTelegramMessage in tests) can rely on
    // the DB write and the reply actually being done before it returns —
    // a real, live-found gap in an earlier fire-and-forget version, caught
    // by this task's own live verification (see task6's report).
    const tagAttempt = parsePostHocTagCommand(ctx.message.text);
    if (tagAttempt.kind === 'malformed') {
      console.log(`[telegram] malformed tag command: ${tagAttempt.reason}`);
      await safeReply(ctx, tagAttempt.reason);
      return;
    }
    if (tagAttempt.kind === 'command') {
      try {
        const result = await recordPostHocTag(tagAttempt.command);
        const replyText = result.ok
          ? `Logged "${tagAttempt.command.tag}" for run ${tagAttempt.command.runId}.`
          : result.error;
        console.log(`[telegram] tag command reply: ${replyText}`);
        await safeReply(ctx, replyText);
      } catch (error) {
        console.error('[telegram] failed to record a post-hoc tag:', error);
        await safeReply(ctx, 'Something went wrong logging that tag — check the server logs.');
      }
      return;
    }

    // Sprint 3 Task 3 (K2) — resolution now goes through the shared
    // pending-approvals module (notify-founder/pending-approvals.ts), not a
    // local map, so an in-app-registered gate resolves identically whether
    // the reply arrives here or via the API.
    const replyToId = ctx.message.reply_to_message?.message_id;
    if (replyToId !== undefined) {
      const threadKey = findThreadKeyByTelegramMessageId(replyToId);
      if (threadKey) {
        resolvePendingApprovalShared(threadKey, ctx.message.text);
        return;
      }
    }

    // Fallback: no explicit Telegram "reply" match — the founder won't
    // always remember to tap Reply. Only safe when exactly one gate has a
    // real Telegram message attached — an in-app-only gate (no Telegram
    // message ever sent for it) is correctly excluded, not just "any
    // pending gate."
    const soleThreadKey = singlePendingTelegramThreadKey();
    if (soleThreadKey) {
      resolvePendingApprovalShared(soleThreadKey, ctx.message.text);
    }
  });

  b.catch((err) => {
    console.error('[telegram] bot error:', err);
  });

  // Long-polling — fine for this scale. `bot.start()` resolves only when the
  // bot stops, so this deliberately doesn't await it.
  void b.start({
    onStart: (botInfo) => {
      console.log(`[telegram] bot @${botInfo.username} started, listening for messages`);
    },
  });
}

export class TelegramFounderChannel implements FounderChannel {
  // Sprint 3 Task 3 (K2) — the real recipient's chat id (User.telegramChatId),
  // never the single hardcoded env.TELEGRAM_FOUNDER_CHAT_ID directly. The
  // founder's own seeded User row carries that exact value (this task's own
  // data migration), so their existing flow is unaffected.
  constructor(private readonly chatId: string) {}

  async notify(message: string): Promise<void> {
    ensureReceiveLoopStarted();
    await getBot().api.sendMessage(this.chatId, message);
  }

  async requestApproval(params: {
    threadKey: string;
    message: string;
    attachmentPath?: string;
  }): Promise<{ reply: string }> {
    ensureReceiveLoopStarted();
    const sent = params.attachmentPath
      ? await getBot().api.sendVideo(this.chatId, new InputFile(params.attachmentPath), {
          caption: params.message,
        })
      : await getBot().api.sendMessage(this.chatId, params.message);
    attachTelegramMessageId(params.threadKey, sent.message_id);
    const reply = await getOrCreatePendingApproval(params.threadKey);
    return { reply };
  }

  // Delegates to the shared module — see pending-approvals.ts's own
  // comment. Every FounderChannel implementation's resolvePendingApproval
  // does the exact same delegation, since resolution is channel-agnostic.
  resolvePendingApproval(threadKey: string, reply: string): { resolved: boolean } {
    return resolvePendingApprovalShared(threadKey, reply);
  }
}

// Starts the receive loop without sending anything — used at boot so incoming
// messages are logged/handled even before the first notify()/requestApproval()
// call.
export function startTelegramReceiveLoop(): void {
  ensureReceiveLoopStarted();
}

// Test-only: the real Telegram message id a pending requestApproval() call is
// waiting on a reply to, if any — lets a test target that exact message via
// reply_to_message rather than relying on the "exactly one pending" fallback,
// which a real, unrelated incoming message (e.g. the founder's own earlier
// chat history with the bot) could otherwise race against and consume.
export function peekPendingMessageId(threadKey: string): number | undefined {
  return peekPendingMessageIdShared(threadKey);
}

// Test-only: feeds a synthetic Telegram update through the exact same
// handleUpdate path a real webhook/long-poll update would take, so Gate 1's
// reply-matching and parsing logic can be verified without waiting on a live
// human reply (used by scripts/dry-run.ts). Never called from production code.
export async function simulateIncomingTelegramMessage(params: {
  chatId: number;
  text: string;
  replyToMessageId?: number;
}): Promise<void> {
  ensureReceiveLoopStarted();
  const update: IncomingUpdate = {
    update_id: Math.floor(Math.random() * 1_000_000_000),
    message: {
      message_id: Math.floor(Math.random() * 1_000_000_000),
      date: Math.floor(Date.now() / 1000),
      chat: { id: params.chatId, type: 'private', first_name: 'Founder' },
      from: { id: params.chatId, is_bot: false, first_name: 'Founder' },
      text: params.text,
      ...(params.replyToMessageId !== undefined
        ? {
            reply_to_message: {
              message_id: params.replyToMessageId,
              date: 0,
              chat: { id: params.chatId, type: 'private', first_name: 'Founder' },
            },
          }
        : {}),
    },
  } as IncomingUpdate;
  const b = getBot();
  // handleUpdate requires botInfo to already be populated; bot.start()
  // populates it internally but asynchronously, so explicitly await init()
  // here rather than racing it (init() is a no-op if already initialized).
  await b.init();
  await b.handleUpdate(update);
}
