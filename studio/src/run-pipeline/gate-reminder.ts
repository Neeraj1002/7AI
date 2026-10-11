import { listRuns } from '../models/repositories/pipeline-run.repository';
import { findLatestAttempt } from '../models/repositories/pipeline-stage.repository';
import { findChannelById } from '../models/repositories/channel.repository';
import { composeNotificationChannel, resolveNotificationRecipients } from '../notifications';
import { env } from '../config/env';
import type { StageName } from '../types';

// Week 5 Task 3, second half: independent of a restart, a gate can sit open
// for hours with no reminder if the founder is just asleep or away. This is
// a nudge, not a resume — it never re-invokes runGate1Stage/runGate2Stage
// (that would re-send the whole gate message and register a second pending
// reply for no reason; the original one is still live and unaffected). It
// only sends a short "still waiting" notification once a gate has been open
// longer than GATE_REMINDER_THRESHOLD_MS.
//
// `remindedRunIds` is a simple in-memory, per-run "already nudged once"
// marker — deliberately not persisted (no schema change expected this
// task). It's pruned every tick against the currently-pending run list, so
// it can never grow unbounded and a run that resolves and later reopens a
// *different* gate (e.g. a video regen looping back through gate2 again)
// is eligible for a fresh reminder rather than being permanently silenced.
const remindedRunIds = new Set<string>();

let reminderCheckInFlight = false;

function gateStageNameFor(status: 'paused_gate1' | 'paused_gate2'): StageName {
  return status === 'paused_gate1' ? 'gate1' : 'gate2';
}

function gateLabelFor(status: 'paused_gate1' | 'paused_gate2'): string {
  return status === 'paused_gate1' ? 'Gate 1' : 'Gate 2';
}

// Bugs Closure follow-up - a reminder names the channel and the brief's first line,
// never the raw run id.
export function formatGateReminder(params: {
  channelName: string;
  briefText: string;
  gateLabel: string;
  openHours: string;
}): string {
  const firstLine = params.briefText.split(/\r?\n/).find((l) => l.trim().length > 0)?.trim() ?? '';
  const brief = firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine;
  const what = brief ? '"' + brief + '" on ' + params.channelName : params.channelName;
  return 'Reminder: ' + what + ' has been waiting at ' + params.gateLabel + ' for about ' + params.openHours + 'h. Open the app to respond.';
}

export async function runGateReminderCheck(): Promise<{ reminded: number }> {
  if (reminderCheckInFlight) {
    console.log('[gate-reminder] check already in flight — skipping this tick');
    return { reminded: 0 };
  }
  reminderCheckInFlight = true;

  try {
    const pendingRuns = await listRuns({ statuses: ['paused_gate1', 'paused_gate2'] });
    const pendingIds = new Set(pendingRuns.map((run) => run.id));
    for (const id of remindedRunIds) {
      if (!pendingIds.has(id)) remindedRunIds.delete(id);
    }

    let reminded = 0;
    for (const run of pendingRuns) {
      if (remindedRunIds.has(run.id)) continue;
      const status = run.status as 'paused_gate1' | 'paused_gate2';
      const gateStage = await findLatestAttempt(run.id, gateStageNameFor(status));
      const openedAt = gateStage?.startedAt ?? gateStage?.createdAt;
      if (!openedAt) continue;

      const openMs = Date.now() - openedAt.getTime();
      if (openMs <= env.GATE_REMINDER_THRESHOLD_MS) continue;

      const openHours = (openMs / 3_600_000).toFixed(1);
      const label = gateLabelFor(status);
      try {
        // Sprint 3 Task 3 (K2) — the run's real channel owner (or, absent
        // one, every owner-role user on the tenant), not the single
        // pre-Sprint-3 global founderChannel.
        const channel = await findChannelById(run.channelId);
        if (!channel) {
          console.error(`[gate-reminder] run ${run.id}: channel ${run.channelId} not found — skipping reminder`);
          continue;
        }
        const recipients = await resolveNotificationRecipients(channel);
        const notificationChannel = await composeNotificationChannel({
          tenantId: channel.tenantId,
          channelId: channel.id,
          userIds: recipients.map((user) => user.id),
        });
        // threadKey = run.id lets a push notification's data payload carry
        // the run id for deep-linking (Task 7/O1), same as requestApproval's
        // own threadKey.
        await notificationChannel.notify(
          formatGateReminder({ channelName: channel.name, briefText: run.briefText, gateLabel: label, openHours }),
          { threadKey: run.id },
        );
        remindedRunIds.add(run.id);
        reminded += 1;
      } catch (error) {
        console.error(`[gate-reminder] failed to send a reminder for run ${run.id}:`, error);
      }
    }

    if (reminded > 0) {
      console.log(`[gate-reminder] check complete — ${reminded} reminder(s) sent`);
    }
    return { reminded };
  } finally {
    reminderCheckInFlight = false;
  }
}
