import { Bot, InputFile } from 'grammy';
import { env } from '../config/env';
import type { FounderChannel } from './channel';
import { parsePostHocTagCommand, recordPostHocTag } from '../run-pipeline/post-hoc-tag';

// The only file allowed to import grammy — see
// docs/decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md. Everything this
// module exposes outward implements FounderChannel; no grammy types cross
// that boundary.

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

type PendingRequest = {
  sentMessageId: number;
  resolve: (reply: string) => void;
};

// One Telegram thread per PipelineRun (Week 2 Task 6) — keyed by threadKey
// (the run id), correlated to a reply via Telegram's own reply_to_message,
// not "whichever message arrives next" (Task 2's placeholder, unsafe now
// that Gate 1 can have more than one gate open at once).
const pendingByThreadKey = new Map<string, PendingRequest>();

let receiveLoopStarted = false;

function ensureReceiveLoopStarted(): void {
  if (receiveLoopStarted) return;
  receiveLoopStarted = true;

  const b = getBot();

  b.on('message:text', async (ctx) => {
    console.log(
      `[telegram] received from chat ${ctx.chat.id} (${ctx.from?.username ?? ctx.from?.first_name ?? 'unknown'}): ${ctx.message.text}`,
    );

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
      await ctx.reply(tagAttempt.reason);
      return;
    }
    if (tagAttempt.kind === 'command') {
      try {
        const result = await recordPostHocTag(tagAttempt.command);
        const replyText = result.ok
          ? `Logged "${tagAttempt.command.tag}" for run ${tagAttempt.command.runId}.`
          : result.error;
        console.log(`[telegram] tag command reply: ${replyText}`);
        await ctx.reply(replyText);
      } catch (error) {
        console.error('[telegram] failed to record a post-hoc tag:', error);
        await ctx.reply('Something went wrong logging that tag — check the server logs.');
      }
      return;
    }

    const replyToId = ctx.message.reply_to_message?.message_id;
    if (replyToId !== undefined) {
      for (const [threadKey, pending] of pendingByThreadKey) {
        if (pending.sentMessageId === replyToId) {
          pendingByThreadKey.delete(threadKey);
          pending.resolve(ctx.message.text);
          return;
        }
      }
    }

    // Fallback: no explicit Telegram "reply" match — the founder won't
    // always remember to tap Reply. Only safe when exactly one gate is
    // pending; with two or more, an unthreaded message is genuinely
    // ambiguous, so it's just logged, not resolved against a guess.
    if (pendingByThreadKey.size === 1) {
      const [[threadKey, pending]] = pendingByThreadKey;
      pendingByThreadKey.delete(threadKey);
      pending.resolve(ctx.message.text);
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
  async notify(message: string): Promise<void> {
    if (!env.TELEGRAM_FOUNDER_CHAT_ID) {
      throw new Error(
        'TELEGRAM_FOUNDER_CHAT_ID is not set. Message your bot once, then read the chat id from the logged update, and put it in .env.local.',
      );
    }
    ensureReceiveLoopStarted();
    await getBot().api.sendMessage(env.TELEGRAM_FOUNDER_CHAT_ID, message);
  }

  async requestApproval(params: {
    threadKey: string;
    message: string;
    attachmentPath?: string;
  }): Promise<{ reply: string }> {
    if (!env.TELEGRAM_FOUNDER_CHAT_ID) {
      throw new Error(
        'TELEGRAM_FOUNDER_CHAT_ID is not set. Message your bot once, then read the chat id from the logged update, and put it in .env.local.',
      );
    }
    ensureReceiveLoopStarted();
    const sent = params.attachmentPath
      ? await getBot().api.sendVideo(env.TELEGRAM_FOUNDER_CHAT_ID, new InputFile(params.attachmentPath), {
          caption: params.message,
        })
      : await getBot().api.sendMessage(env.TELEGRAM_FOUNDER_CHAT_ID, params.message);
    const reply = await new Promise<string>((resolve) => {
      pendingByThreadKey.set(params.threadKey, { sentMessageId: sent.message_id, resolve });
    });
    return { reply };
  }

  // Frontend track Task 1 — see FounderChannel.resolvePendingApproval's own
  // comment. Checks and deletes `pendingByThreadKey` in one synchronous pass
  // (no `await` in between), so a Telegram reply arriving in the same tick
  // can't interleave with this and double-resolve the same gate.
  resolvePendingApproval(threadKey: string, reply: string): { resolved: boolean } {
    const pending = pendingByThreadKey.get(threadKey);
    if (!pending) {
      return { resolved: false };
    }
    pendingByThreadKey.delete(threadKey);
    pending.resolve(reply);
    return { resolved: true };
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
  return pendingByThreadKey.get(threadKey)?.sentMessageId;
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
