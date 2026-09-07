import { env } from './config/env';
import { resumeOnStartup } from './run-pipeline/resume-on-startup';
import { startReceiveLoop } from './notify-founder/send-receive-loop';

async function main(): Promise<void> {
  console.log(`[boot] 7AI orchestrator starting (env=${env.NODE_ENV})`);

  await resumeOnStartup();

  if (env.TELEGRAM_BOT_TOKEN) {
    startReceiveLoop();
  } else {
    console.log('[boot] TELEGRAM_BOT_TOKEN not set — skipping Telegram bot startup');
  }

  console.log('[boot] 7AI orchestrator ready');
}

main().catch((error) => {
  console.error('[boot] fatal error during startup:', error);
  process.exit(1);
});
