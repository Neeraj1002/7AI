// Public surface of the founder-notification / approval-gate layer. Call
// sites import only from here — never from telegram-channel.ts directly —
// mirroring studio/src/llm/'s import-boundary pattern.
import { TelegramFounderChannel } from './telegram-channel';

export type { FounderChannel } from './channel';
export {
  startTelegramReceiveLoop,
  simulateIncomingTelegramMessage,
  peekPendingMessageId,
} from './telegram-channel';

// Single implementation for now (Telegram) — a factory would be premature
// until a second channel actually exists.
export const founderChannel = new TelegramFounderChannel();
