import { Bot } from 'grammy';
import { env } from '../config/env';
import type { FounderChannel } from './channel';

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

let receiveLoopStarted = false;
let pendingReplyResolver: ((reply: string) => void) | null = null;

function ensureReceiveLoopStarted(): void {
  if (receiveLoopStarted) return;
  receiveLoopStarted = true;

  const b = getBot();

  b.on('message:text', (ctx) => {
    console.log(
      `[telegram] received from chat ${ctx.chat.id} (${ctx.from?.username ?? ctx.from?.first_name ?? 'unknown'}): ${ctx.message.text}`,
    );
    if (pendingReplyResolver) {
      const resolve = pendingReplyResolver;
      pendingReplyResolver = null;
      resolve(ctx.message.text);
    }
  });

  b.catch((err) => {
    console.error('[telegram] bot error:', err);
  });

  // Long-polling — fine for Week 1/2's single-flat-channel scope. `bot.start()`
  // resolves only when the bot stops, so this deliberately doesn't await it.
  void b.start({
    onStart: (botInfo) => {
      console.log(`[telegram] bot @${botInfo.username} started, listening for messages`);
    },
  });
}

// Minimal Week 2 implementation: requestApproval sends a message, then
// resolves with whatever text message the bot receives next. No reply-command
// parsing (approve/reject[reason]/edited-text) and no per-run threading yet —
// those are Gate 1's actual requirements (MVP_ROADMAP_OCT15.md Section 17),
// not this task's. With one channel/one founder chat and no concurrent gates
// yet, "the next message is the reply" is a safe simplification; it stops
// being safe the moment two requestApproval calls can be pending at once,
// which doesn't happen until Gate 1 exists.
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

  async requestApproval(message: string): Promise<{ reply: string }> {
    ensureReceiveLoopStarted();
    await this.notify(message);
    const reply = await new Promise<string>((resolve) => {
      pendingReplyResolver = resolve;
    });
    return { reply };
  }
}

// Starts the receive loop without sending anything — used at boot so incoming
// messages are logged/handled even before the first notify()/requestApproval()
// call. Equivalent to Week 1's startReceiveLoop().
export function startTelegramReceiveLoop(): void {
  ensureReceiveLoopStarted();
}
