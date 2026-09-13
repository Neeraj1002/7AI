import { fetchVideoStatsViaProvider } from './youtube-stats-client';
import { stubFetchVideoStats } from './stub';
import {
  insertPerformanceSnapshot,
  listCompletedRunsWithPublishedVideo,
} from '../../models/repositories/performance-snapshot.repository';
import { env } from '../../config/env';
import type { PerformanceSnapshot } from '../../types';
import type { VideoStats } from './types';

// Performance Analytics agent — AGENT_FLEET_DESIGN.md Section 4.8, "basic
// polling/logging only" per its MVP status. Two distinct triggers, per
// docs/execution/week4/BUSINESS_LOGIC.md Section 3: (a) an initial snapshot
// right after Publishing succeeds, called synchronously from
// state-machine.ts's runAnalyticsStage; (b) an ongoing periodic poll
// (runPeriodicPoll, below), independent of any single run's state machine.

export type { VideoStats } from './types';

// YOUTUBE_STUB=1 swaps the real Data API call for the stub — same flag
// Publishing's upload uses (both blocked by the exact same missing
// YOUTUBE_REFRESH_TOKEN, Week 1 Task 7 still open).
async function fetchVideoStats(youtubeVideoId: string): Promise<VideoStats> {
  if (env.YOUTUBE_STUB === '1') {
    return stubFetchVideoStats(youtubeVideoId);
  }
  return fetchVideoStatsViaProvider(youtubeVideoId);
}

// Records one snapshot for a single run's published video. Used both for the
// initial post-publish snapshot and by each periodic poll tick — a plain
// insert, no upsert/dedup logic, since accumulating many rows over time is
// the entire point (SCHEMA.md: "a video accumulates many rows over time").
//
// watchTimeMinutes/retentionPct are always left undefined (-> null) here: the
// YouTube Analytics API needs a separate `yt-analytics.readonly` OAuth scope
// that scripts/youtube-oauth.ts never requested (only
// youtube.upload/youtube.readonly), per docs/execution/week4/SCHEMA.md's own
// note. Not attempted — the scope genuinely isn't available, not a bug to
// work around.
export async function recordSnapshot(params: {
  tenantId: string;
  channelId: string;
  pipelineRunId: string;
  youtubeVideoId: string;
}): Promise<PerformanceSnapshot> {
  const stats = await fetchVideoStats(params.youtubeVideoId);
  return insertPerformanceSnapshot({
    tenantId: params.tenantId,
    channelId: params.channelId,
    pipelineRunId: params.pipelineRunId,
    youtubeVideoId: params.youtubeVideoId,
    views: stats.views,
    likes: stats.likes,
    comments: stats.comments,
    snapshotAt: new Date(),
  });
}

// Periodic poll — Section 8.3 "batch over real-time." Re-polls every
// `completed` run's video, independent of any single run's state machine
// (a "cron + Postgres" tick, not a new job queue — see
// studio/src/index.ts's setInterval caller). A simple in-process reentrancy
// guard keeps two overlapping ticks (a slow real API call plus a short
// interval, or a manual test trigger firing mid-tick) from running
// concurrently — "no duplicate/overlapping polls for the same video at the
// same time," per this task's acceptance criteria. This does NOT prevent two
// separate ticks over time from each writing their own row for the same
// video — that's expected; each is a genuinely new data point.
let pollInFlight = false;

export async function runPeriodicPoll(): Promise<{ polled: number; skipped: boolean }> {
  if (pollInFlight) {
    console.log('[performance-analytics] poll already in flight — skipping this tick');
    return { polled: 0, skipped: true };
  }
  pollInFlight = true;
  try {
    const targets = await listCompletedRunsWithPublishedVideo();
    let polled = 0;
    for (const target of targets) {
      // One bad target (e.g. a run completed under YOUTUBE_STUB=1 whose
      // youtubeVideoId was never real — a real, live finding from Week 5
      // Task 1's first genuinely real poll, which otherwise aborted the
      // entire tick on the first stub id it hit) must not block every other
      // real video's snapshot. Log and continue, same "one target's failure
      // isn't every target's failure" reasoning as any batch job.
      try {
        await recordSnapshot(target);
        polled += 1;
      } catch (error) {
        console.error(
          `[performance-analytics] poll failed for run ${target.pipelineRunId} (youtubeVideoId=${target.youtubeVideoId}):`,
          error,
        );
      }
    }
    console.log(`[performance-analytics] poll tick complete — ${polled}/${targets.length} run(s) snapshotted`);
    return { polled, skipped: false };
  } finally {
    pollInFlight = false;
  }
}
