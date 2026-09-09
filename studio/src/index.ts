import { env } from './config/env';
import { resumeOnStartup } from './run-pipeline/resume-on-startup';
import { startTelegramReceiveLoop } from './notify-founder';
import { startApiServer } from './api/server';

async function main(): Promise<void> {
  console.log(`[boot] 7AI orchestrator starting (env=${env.NODE_ENV})`);

  await resumeOnStartup();

  if (env.TELEGRAM_BOT_TOKEN) {
    startTelegramReceiveLoop();
  } else {
    console.log('[boot] TELEGRAM_BOT_TOKEN not set — skipping Telegram bot startup');
  }

  await startApiServer();

  console.log('[boot] 7AI orchestrator ready');
}

main().catch((error) => {
  console.error('[boot] fatal error during startup:', error);
  process.exit(1);
});
