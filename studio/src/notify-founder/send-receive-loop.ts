import { getBot } from './bot';
import { env } from '../config/env';

// Minimal send/receive loop — no gate message formatting, no reply-command
// grammar, no per-run threading. Just prove messages flow both ways
// (BUSINESS_LOGIC.md Section 5).

export async function sendToFounder(text: string): Promise<void> {
  if (!env.TELEGRAM_FOUNDER_CHAT_ID) {
    throw new Error(
      'TELEGRAM_FOUNDER_CHAT_ID is not set. Message your bot once, then read the chat id from the logged update (see notify-founder/README notes) and put it in .env.local.',
    );
  }
  const bot = getBot();
  await bot.api.sendMessage(env.TELEGRAM_FOUNDER_CHAT_ID, text);
}

export function startReceiveLoop(): void {
  const bot = getBot();

  bot.on('message:text', (ctx) => {
    console.log(
      `[telegram] received from chat ${ctx.chat.id} (${ctx.from?.username ?? ctx.from?.first_name ?? 'unknown'}): ${ctx.message.text}`,
    );
  });

  bot.catch((err) => {
    console.error('[telegram] bot error:', err);
  });

  // Long-polling — fine for Week 1's single-flat-channel scope. `bot.start()`
  // resolves only when the bot stops, so this deliberately doesn't await it.
  void bot.start({
    onStart: (botInfo) => {
      console.log(`[telegram] bot @${botInfo.username} started, listening for messages`);
    },
  });
}
