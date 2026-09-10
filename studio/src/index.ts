import { env } from './config/env';
import { resumeOnStartup } from './run-pipeline/resume-on-startup';
import { startTelegramReceiveLoop } from './notify-founder';
import { startApiServer } from './api/server';
import { runPeriodicPoll } from './agents/performance-analytics';

// Performance Analytics' periodic poll (AGENT_FLEET_DESIGN.md 8.3, "batch
// over real-time") — a plain setInterval tick against Postgres, matching the
// project's "cron + Postgres, no magic" convention (no new job-queue
// dependency). Started here, not per-run — it polls every `completed` run's
// video on its own schedule, independent of any single run's state machine.
function startPerformanceAnalyticsPoller(): void {
  setInterval(() => {
    runPeriodicPoll().catch((error) => {
      console.error('[performance-analytics] periodic poll tick failed:', error);
    });
  }, env.ANALYTICS_POLL_INTERVAL_MS);
  console.log(
    `[boot] Performance Analytics poller started (every ${env.ANALYTICS_POLL_INTERVAL_MS}ms)`,
  );
}

async function main(): Promise<void> {
  console.log(`[boot] 7AI orchestrator starting (env=${env.NODE_ENV})`);

  await resumeOnStartup();

  if (env.TELEGRAM_BOT_TOKEN) {
    startTelegramReceiveLoop();
  } else {
    console.log('[boot] TELEGRAM_BOT_TOKEN not set — skipping Telegram bot startup');
  }

  startPerformanceAnalyticsPoller();

  await startApiServer();

  console.log('[boot] 7AI orchestrator ready');
}

main().catch((error) => {
  console.error('[boot] fatal error during startup:', error);
  process.exit(1);
});
