import { listRuns } from '../models/repositories/pipeline-run.repository';
import { findLatestAttempt } from '../models/repositories/pipeline-stage.repository';
import { founderChannel } from '../notify-founder';
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
        await founderChannel.notify(
          `Reminder: run ${run.id} has been waiting at ${label} for about ${openHours}h. Reply on the earlier message whenever you get a chance (or use the app).`,
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
