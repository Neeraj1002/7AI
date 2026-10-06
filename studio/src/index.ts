import { env } from './config/env';
import { resumeOnStartup } from './run-pipeline/resume-on-startup';
import { runGateReminderCheck } from './run-pipeline/gate-reminder';
import { runFounderDigestCheck } from './run-pipeline/founder-digest';
import { startApiServer } from './api/server';
import { runPeriodicPoll } from './agents/performance-analytics';
import { runTelegramStartPollCheck } from './auth/telegram-token-delivery';
import { isPrivateIpRedirectHost } from './config/redirect-uri-guard';
import { isR2Configured } from './storage/r2-client';

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

// Week 5 Task 3's "you haven't answered in a while" nudge — same
// setInterval-against-Postgres pattern as the Performance Analytics poller
// above, not a restart/resume action (see gate-reminder.ts's own comment).
function startGateReminderChecker(): void {
  setInterval(() => {
    runGateReminderCheck().catch((error) => {
      console.error('[gate-reminder] periodic check failed:', error);
    });
  }, env.GATE_REMINDER_CHECK_INTERVAL_MS);
  console.log(
    `[boot] Gate reminder checker started (every ${env.GATE_REMINDER_CHECK_INTERVAL_MS}ms, threshold ${env.GATE_REMINDER_THRESHOLD_MS}ms)`,
  );
}

// Sprint 2 Task 6 (I1) — same setInterval-against-Postgres pattern as the
// two checkers above. runFounderDigestCheck itself decides whether a digest
// is actually due (against the real, persisted
// Tenant.lastFounderDigestSentAt), so this interval only needs to be
// "frequent enough," not exactly once a day.
function startFounderDigestChecker(): void {
  setInterval(() => {
    runFounderDigestCheck().catch((error) => {
      console.error('[founder-digest] periodic check failed:', error);
    });
  }, env.FOUNDER_DIGEST_CHECK_INTERVAL_MS);
  console.log(
    `[boot] Founder digest checker started (every ${env.FOUNDER_DIGEST_CHECK_INTERVAL_MS}ms, due every ${env.FOUNDER_DIGEST_INTERVAL_MS}ms)`,
  );
}

// Bugs Task 3 (R5) — same setInterval-against-an-external-source pattern as
// the checkers above, just polling Telegram's getUpdates instead of
// Postgres. Only started when TELEGRAM_BOT_TOKEN is actually set — a
// checkout without one configured just skips this entirely, same
// "optional, don't break startup" posture every other credential-gated
// feature in this file already follows.
function startTelegramStartPollChecker(): void {
  if (!env.TELEGRAM_BOT_TOKEN) {
    console.log('[boot] TELEGRAM_BOT_TOKEN not set — Telegram magic-link delivery disabled (console fallback only)');
    return;
  }
  setInterval(() => {
    runTelegramStartPollCheck().catch((error) => {
      console.error('[telegram-token-delivery] periodic /start poll failed:', error);
    });
  }, env.TELEGRAM_START_POLL_INTERVAL_MS);
  console.log(
    `[boot] Telegram /start poll checker started (every ${env.TELEGRAM_START_POLL_INTERVAL_MS}ms)`,
  );
}

async function main(): Promise<void> {
  console.log(`[boot] 7AI orchestrator starting (env=${env.NODE_ENV})`);

  // Bugs Task 4 (R3) — a real request already produced a localhost link
  // (and would produce the same text in a Telegram message) when this was
  // silently unset; a boot-time warning makes that never-silent again,
  // rather than only discoverable by reading a request's own output.
  if (isPrivateIpRedirectHost(env.YOUTUBE_REDIRECT_URI)) {
    console.warn(
      '[boot] YOUTUBE_REDIRECT_URI resolves to a private IP — Google will reject this at OAuth time; use localhost for local testing or a real public domain',
    );
  }
  if (!env.PUBLIC_API_BASE_URL) {
    console.warn(
      '[boot] PUBLIC_API_BASE_URL not set — magic-link text will show localhost, unusable from a phone',
    );
  }

  // Bugs Closure R2 — a stub flag left on in a real environment makes runs "work" with
  // placeholder output (e.g. AI_VISUALS_STUB gives 14-byte-style placeholder stills,
  // reported as "AI images don't work"). Never silent.
  const activeStubs = (
    ['INTAKE_STAGE_STUB', 'MEDIA_STUB', 'STOCK_FOOTAGE_STUB', 'AI_VISUALS_STUB', 'YOUTUBE_STUB', 'YOUTUBE_ANALYTICS_STUB'] as const
  ).filter((flag) => env[flag] === '1');
  if (activeStubs.length > 0) {
    console.warn(
      `[boot] stub flag(s) ON: ${activeStubs.join(', ')} — those capabilities return placeholder output, not real provider calls`,
    );
  }

  // Sprint 3 Task 13 (R1) — r2-client's own skip is deliberately silent for
  // local dev, but on production it is how real videos went unrecorded
  // without anyone noticing. Log only; never fail boot.
  if (env.NODE_ENV === 'production' && !isR2Configured()) {
    console.warn('[boot] R2 not configured — drafts/final/bundles will NOT be uploaded');
  }

  await resumeOnStartup();

  startPerformanceAnalyticsPoller();
  startGateReminderChecker();
  startFounderDigestChecker();
  startTelegramStartPollChecker();

  await startApiServer();

  console.log('[boot] 7AI orchestrator ready');
}

main().catch((error) => {
  console.error('[boot] fatal error during startup:', error);
  process.exit(1);
});
