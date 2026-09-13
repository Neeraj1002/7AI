# Week 5 Task 1: The First Genuinely Real End-to-End Dry Run

**Date**: 2026-09-10
**Status**: Complete
**Files Created**: 0 (docs + reports only, aside from noted code fixes)
**Files Modified**: 2 (`studio/src/agents/performance-analytics/index.ts` — poller resilience fix; `studio/scripts/dry-run.ts` — new `gate2-live` command)
**Tests**: All Passing. Real end-to-end run reached `completed` for real; real mid-`publishing` kill/resume re-verified with a real upload.

## What Was Done

The actual milestone `MVP_ROADMAP_OCT15.md` Section 12 calls for, done for real: one brief flowed
through all nine stages with real credentials throughout, both gates answered live by the founder
over actual Telegram, and a real private YouTube upload.

### Pre-flight

- All five credentials confirmed present and genuinely functional in `.env.local`:
  `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `PEXELS_API_KEY`, `YOUTUBE_REFRESH_TOKEN` (verified with a
  live `channels.list` call — real channel "Neeraj Singh Rajput" confirmed), `TELEGRAM_BOT_TOKEN`/
  `TELEGRAM_FOUNDER_CHAT_ID`. No `*_STUB` flags were set anywhere in `.env.local` to begin with.
- `npx tsx scripts/list-stale-running-runs.ts` → `total: 0`. Nothing to clean up — Week 4 Task 4's
  own close-out had left the DB clean.
- `AgentQuota.budgetCeilingUsd` confirmed at `$2.00` (the intended production value, not a
  leftover low test ceiling); `$0.93` already spent from prior weeks' real testing, leaving
  headroom. Total spend by the end of this task: `$1.02` — well under the ceiling.

### The real run

Brief: *"A short video about why the northern lights (aurora borealis) happen."*
(`runId=50198c2a-8ed7-4d3f-8d62-7b44d8bca0ca`)

- `intake` → `script_generation` → `script_review`: all real Anthropic calls.
- **Gate 1**: sent via `dry-run.ts gate1-live` — a real Telegram message, genuinely blocked on a
  real reply. The founder replied **"Approve"** live on Telegram. This also closes the
  long-standing Week 2 Task 6 open item (a real human-reply round trip) for the first time in the
  project's history.
- `video_generation`: real production-planning call chose `captionStyle: "phrase-grouped"` and
  `stockFootageQuery: "aurora borealis northern lights dancing"` on its own, no prior fixNotes
  needed. Real TTS + transcription (`openai`, `$0.0269`) produced a 48.6s video — under the 60s
  limit on the first real render. Real Pexels footage: genuine aurora-over-forest-silhouette video,
  visually confirmed by extracting and viewing a frame directly (`data/videos/<runId>/1.mp4`,
  reviewed in this session).
- `video_review`: **passed organically on the first attempt** — the real multimodal reviewer's own
  words: *"a clear aurora borealis display with characteristic green glowing curtains... directly
  matches the topic... sharp, not corrupted."* First fully organic (non-forced) pass in the
  project's history under real credentials.
- **Gate 2**: sent via `dry-run.ts gate2-live` (new command, added this task — see Deviations) —
  real Telegram message with the actual video attached, genuinely blocked. The founder replied
  **"Approve"** live, having watched the real video.
- `publishing`: real upload. `youtubeVideoId: "7KEF84iiApE"`, title *"Why the Sky Glows: Aurora
  Borealis Explained,"* real description and 10 tags, all genuinely on-topic (metadata-generation
  call, real).
- **Verified directly against the YouTube Data API** (not inferred from the DB): `GET
  videos?part=snippet,status&id=7KEF84iiApE` → `"privacyStatus": "private"`, `"uploadStatus":
  "processed"`, correct channel (`"channelTitle": "Neeraj Singh Rajput"`), title/description/tags
  match exactly what Publishing generated.
- `analytics`: real initial snapshot (`views: 0, likes: 0, comments: 0` — genuinely accurate for a
  private video seconds old, not a bug). `PipelineRun.status` reached **`completed`** —
  `completedAt: 2026-09-10T15:59:55Z`. All nine `pipeline_stages` rows present, one each, no gaps,
  no duplicates. Total real spend for this run: **$0.0396**.
- Real periodic poll (`npx tsx scripts/dry-run.ts poll`) confirmed working against the real video —
  see "A real bug found and fixed," below, for what that took.

### Mid-`publishing` kill/resume — re-verified with a real upload this time

Week 4 Task 4 proved this mechanism against a stub upload. This task re-proved it against a **real**
YouTube upload, on a separate scaffolding run (`runId=9b3b28af-2226-4dc3-a752-8af2972497da`, "why
bees are important for pollination" — an arbitrary throwaway topic, gates simulated since this run
exists purely to exercise the checkpoint mechanism, not to re-prove the live-gate criterion a
second time):

1. Started `publish` in the background with `PUBLISHING_TEST_KILL_DELAY_MS=60000` (no `YOUTUBE_STUB`
   — a real upload).
2. Confirmed via the log that a **real** video was uploaded and checkpointed:
   `youtubeVideoId=nnY46b0vOCw`.
3. Force-killed the actual `node.exe` process tree (identified via
   `Get-CimInstance Win32_Process`, not just the task wrapper — same lesson from Week 4 Task 4,
   applied correctly on the first attempt this time).
4. Confirmed via direct DB read: `publishing` stage still `status: 'running'`, with the real
   `youtubeVideoId` already present in its checkpointed `output`.
5. Ran `resume`. Log: *"attempt 1 already recorded a successful upload before the process stopped
   — completing the stage without uploading again."* DB confirms exactly **one** `publishing`
   attempt, `completed`, with the same `youtubeVideoId` — no second real upload happened.

This is a stronger proof than Week 4's stub-based version: the exact same code path was exercised
against a genuinely live, billable-scope external API call, not a fake id.

### A real bug found and fixed: the periodic poller wasn't resilient to mixed real/stub data

The first `poll` run against the real aurora video **threw and aborted** before reaching it —
`listCompletedRunsWithPublishedVideo()` also returns Week 4's old stub-completed runs
(`youtubeVideoId: "stub-..."`), and `runPeriodicPoll`'s loop had no per-target error handling, so
the first invalid (now-nonexistent, since it was never real) video id it hit killed the entire
tick. This was never visible in Week 4 because everything there was uniformly stubbed — it only
surfaces once real and stub data coexist, exactly what this task's pre-flight (correctly) didn't
clean up, since those old runs are `completed`, not `running` (outside `list-stale-running-runs.ts`'s
scope). Fixed in `studio/src/agents/performance-analytics/index.ts`: each target's `recordSnapshot`
call is now individually try/caught and logged, not fatal to the tick. Re-ran `poll` afterward:
`1/6 run(s) snapshotted` — the 5 old stub runs failed gracefully and were logged; the real run got
its second real snapshot. Confirmed via DB: 2 real snapshot rows for the aurora run, both
`views: 0` (accurate — the video is private, seconds old).

### A real process-contention finding

Setting up the scaffolding kill-test run's Gate 1 hit a genuine Telegram API conflict: `error_code:
409, "Conflict: terminated by other getUpdates request"`. Investigation found a persistent
`npm run dev` instance already running (started earlier today, presumably by the founder,
`tsx watch src/index.ts`) with its own active Telegram long-polling loop — `dry-run.ts`'s live gate
commands start a second, competing long-poll for the same bot token, which Telegram doesn't allow.
Stopped the persistent dev-server process tree for the duration of testing, then **restarted it**
(`npm run dev`, confirmed booting cleanly, `[resume] no running PipelineRuns found on startup`)
once done, so the founder's setup is left as found. Noted in `BUSINESS_LOGIC.md` as a
testing-methodology finding, not a code bug.

## Files Created/Modified

- Modified: `studio/src/agents/performance-analytics/index.ts` (poller resilience fix, above),
  `studio/scripts/dry-run.ts` (new `gate2-live` command, mirroring the existing `gate1-live`, plus
  an updated header usage comment)
- Created: `docs/execution/week5/{SCHEMA,BUSINESS_LOGIC,STATUS}.md`,
  `docs/execution/week5/tasks/task1.md`, `docs/execution/week5/reports/task1.md`; updates to
  `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md`

## Schema Changes Applied

None.

## Test Results

```
npm run typecheck   -> clean
npm run lint        -> clean
npm run build       -> clean
```

Real end-to-end evidence detailed above: `completed` PipelineRun with real data at every stage,
YouTube privacy status verified directly via API, real mid-publishing kill/resume proven with a
real upload, real periodic polling confirmed (after the fix) against the real video.

## Deviations from Spec

- **No credential was missing** — this is the clean case the task hoped for, not a partial-stub
  fallback. Nothing to report here beyond: all five were genuinely present and worked on the first
  try.
- **Added `gate2-live`** to `dry-run.ts` — it didn't exist yet (only `gate1-live` did, from Week 3/4).
  The task requires both gates answered live; this was a small, necessary addition, not scope
  creep, mirroring `gate1Live`'s exact shape.
- **Fixed a real bug in `runPeriodicPoll`** (per-target error isolation) — found live, during this
  task's own required "confirm Performance Analytics polling against the real video" acceptance
  criterion; without the fix, that criterion could not be met at all (the poll never reached the
  real video). Necessary to complete the task, not optional cleanup.
- **The mid-publishing kill test's throwaway video** (`nnY46b0vOCw`, "bees") could not be deleted
  from YouTube programmatically — `videos.delete` needs the broader `youtube`/`youtube.force-ssl`
  scope; the OAuth token only has `youtube.upload`/`youtube.readonly` (per Week 1 Task 7's original
  scope request). Left in place (private, harmless) — the founder can delete it manually via
  YouTube Studio if desired, or a future task can request the broader scope if programmatic
  cleanup becomes worth it.
- **The kill-test scaffolding run's gates were simulated**, not live — the task's live-gate
  requirement is satisfied by the main aurora run; re-doing two more live phone round-trips purely
  to set up test scaffolding for an unrelated mechanism (upload checkpointing) would have added
  real founder interruption for no additional proof value. Consistent with Week 4 Task 4's same
  judgment call for its own kill-test scaffolding.
- **Stopped and restarted a persistent `npm run dev` process** mid-task to resolve a genuine
  Telegram long-polling conflict — see the finding above. Restarted before finishing, confirmed
  clean boot.

## Sign-Off

- Task Objective: **Met.** A real brief reached `completed` with real audio, real footage, both
  gates answered live, and a real, API-verified private YouTube upload.
- Schema Impact: None.
- Business Logic: Matches `week4/BUSINESS_LOGIC.md`'s transition table exactly, now verified for
  real — reconciliation notes added to `week5/BUSINESS_LOGIC.md`.
- Tests: Passing.
- Ready for Integration: Yes. This closes `KNOWN_ISSUES_AND_BLOCKERS.md` Section 1's founder-action
  rows for YouTube OAuth, OpenAI/Pexels keys, and the first real dry run itself — see that file's
  updated version. The live-Gate-1-reply item (open since Week 2) is also now closed.
