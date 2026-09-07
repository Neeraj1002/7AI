import { Bot } from 'grammy';
import { env } from '../config/env';

// Telegram bot scaffold — BUSINESS_LOGIC.md Section 5. Week 1 proves a basic
// send/receive loop works; no gate logic, reply-command parsing, or per-run
// threading yet (explicitly deferred to Week 2).

let bot: Bot | null = null;

export function getBot(): Bot {
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
