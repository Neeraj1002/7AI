import { prisma } from '../models/prisma-client';
import { findTenantById, updateTenantLastDigestSentAt } from '../models/repositories/tenant.repository';
import { listActiveChannelsByTenant } from '../models/repositories/channel.repository';
import { listUsersByTenantAndRole } from '../models/repositories/user.repository';
import { composeNotificationChannel } from '../notifications';
import { env } from '../config/env';
import { MVP_TENANT_ID } from '../types';

// Sprint 2 Task 6 (I1) — MVP_ROADMAP_OCT15.md Section 17's "daily digest"
// sketch: "one end-of-day summary across all live channels — how many runs
// completed, how many are waiting on you." Same setInterval-against-Postgres
// pattern as gate-reminder.ts, not a restart/resume action.
//
// "Is it due" is judged against a real, persisted
// Tenant.lastFounderDigestSentAt, not elapsed process uptime — this dev
// process has restarted far more often than once a day throughout this
// project, and a plain setInterval(fn, 24h) would likely never actually fire
// in practice. The checker itself runs on a much shorter interval
// (FOUNDER_DIGEST_CHECK_INTERVAL_MS), only sending once
// FOUNDER_DIGEST_INTERVAL_MS has actually elapsed since the last real send.
//
// Single-tenant (MVP_TENANT_ID), same assumption dashboard.repository.ts's
// own comment states every other repository in this codebase already makes.

let digestCheckInFlight = false;

type DigestRunRef = { id: string; briefText: string };

type ChannelDigestCounts = {
  channelId: string;
  channelName: string;
  completedRuns: DigestRunRef[];
  needsAttentionRuns: DigestRunRef[];
  waitingOnYouRuns: (DigestRunRef & { status: string })[];
};

// A channel (or a whole tenant) that's accumulated a lot of
// `needs_attention` runs over time could otherwise produce an unreasonably
// long digest message. Each category lists at most this many runs
// individually, with a plain "...and N more" line rather than silently
// truncating mid-list.
const MAX_RUNS_LISTED_PER_CATEGORY = 5;

function formatRunLines(
  runs: (DigestRunRef & { status?: string })[],
  formatOne: (run: DigestRunRef & { status?: string }) => string,
): string[] {
  const shown = runs.slice(0, MAX_RUNS_LISTED_PER_CATEGORY);
  const lines = shown.map((run) => `    - ${formatOne(run)}`);
  const remaining = runs.length - shown.length;
  if (remaining > 0) {
    lines.push(`    ...and ${remaining} more`);
  }
  return lines;
}

export function formatDigestMessage(params: {
  windowStart: Date;
  channels: ChannelDigestCounts[];
}): string {
  const lines: string[] = [`Daily digest — since ${params.windowStart.toISOString()}`, ``];

  for (const channel of params.channels) {
    lines.push(`${channel.channelName}:`);
    lines.push(`  Completed: ${channel.completedRuns.length}`);
    lines.push(...formatRunLines(channel.completedRuns, (run) => `${run.id} (${run.briefText.slice(0, 60)})`));
    lines.push(`  Needs attention: ${channel.needsAttentionRuns.length}`);
    lines.push(...formatRunLines(channel.needsAttentionRuns, (run) => `${run.id} (${run.briefText.slice(0, 60)})`));
    lines.push(`  Waiting on you: ${channel.waitingOnYouRuns.length}`);
    lines.push(
      ...formatRunLines(channel.waitingOnYouRuns, (run) => `${run.id} [${run.status}] (${run.briefText.slice(0, 60)})`),
    );
    lines.push(``);
  }

  lines.push(
    // Sprint 3 Task 7 (O4) — the old "Reply 'tag <runId> <word> [notes]'"
    // text-command instruction is gone along with the parser it referred
    // to; post-hoc tagging is now a real form on the run's own Run Detail
    // screen in the app.
    `Open a run above in the app to tag your own read on why it did or didn't work.`,
  );

  const message = lines.join('\n');
  // Defensive final cap: the per-category cap above bounds each channel's
  // contribution, but a tenant with many active channels could still add up
  // to an unreasonably long push/in-app message. Truncated rather than left
  // unbounded.
  const MESSAGE_LIMIT = 4096;
  if (message.length <= MESSAGE_LIMIT) return message;
  const notice = '\n\n[digest truncated — see the dashboard for the full picture]';
  return message.slice(0, MESSAGE_LIMIT - notice.length) + notice;
}

export async function runFounderDigestCheck(): Promise<{ sent: boolean }> {
  if (digestCheckInFlight) {
    console.log('[founder-digest] check already in flight — skipping this tick');
    return { sent: false };
  }
  digestCheckInFlight = true;

  try {
    const tenant = await findTenantById(MVP_TENANT_ID);
    if (!tenant) {
      console.error(`[founder-digest] MVP_TENANT_ID (${MVP_TENANT_ID}) not found — skipping`);
      return { sent: false };
    }

    const now = new Date();
    const windowStart = tenant.lastFounderDigestSentAt ?? new Date(now.getTime() - env.FOUNDER_DIGEST_INTERVAL_MS);
    if (tenant.lastFounderDigestSentAt && now.getTime() - tenant.lastFounderDigestSentAt.getTime() < env.FOUNDER_DIGEST_INTERVAL_MS) {
      return { sent: false };
    }

    const channels = await listActiveChannelsByTenant(MVP_TENANT_ID);
    const channelDigests: ChannelDigestCounts[] = [];
    for (const channel of channels) {
      const [completedRows, needsAttentionRows, waitingRows] = await Promise.all([
        prisma.pipelineRun.findMany({
          where: { channelId: channel.id, status: 'completed', completedAt: { gte: windowStart } },
          select: { id: true, briefText: true },
          orderBy: { completedAt: 'desc' },
        }),
        prisma.pipelineRun.findMany({
          where: { channelId: channel.id, status: 'needs_attention' },
          select: { id: true, briefText: true },
          orderBy: { updatedAt: 'desc' },
        }),
        prisma.pipelineRun.findMany({
          where: { channelId: channel.id, status: { in: ['paused_gate1', 'paused_gate2'] } },
          select: { id: true, briefText: true, status: true },
          orderBy: { updatedAt: 'desc' },
        }),
      ]);
      channelDigests.push({
        channelId: channel.id,
        channelName: channel.name,
        completedRuns: completedRows,
        needsAttentionRuns: needsAttentionRows,
        waitingOnYouRuns: waitingRows,
      });
    }

    const message = formatDigestMessage({ windowStart, channels: channelDigests });
    // Sprint 3 Task 3 (K2) — per-user within the tenant, not the single
    // pre-Sprint-3 global founderChannel: every owner-role user on this
    // tenant gets their own real digest (in-app always, push — Task 7/O1 —
    // if registered). Tenant-wide, not one specific channel — channelId is
    // deliberately null (Notification's own nullable-channelId deviation).
    const owners = await listUsersByTenantAndRole(MVP_TENANT_ID, 'owner');
    const channel = await composeNotificationChannel({
      tenantId: MVP_TENANT_ID,
      channelId: null,
      userIds: owners.map((user) => user.id),
    });
    await channel.notify(message);
    await updateTenantLastDigestSentAt(MVP_TENANT_ID, now);

    console.log(`[founder-digest] sent — ${channelDigests.length} channel(s) covered`);
    return { sent: true };
  } finally {
    digestCheckInFlight = false;
  }
}
