# Week 4 Task 2: Publishing Agent

**Date**: 2026-09-09
**Status**: Complete
**Files Created**: 4
**Files Modified**: 5
**Tests**: All Passing (build/lint/typecheck clean; real end-to-end publish tested against the stub upload path)

## What Was Done

Built the Publishing agent (`studio/src/agents/publishing/`), mirroring `media/`/`stock-footage/`'s
boundary shape (`types.ts`, `youtube-client.ts` — the only file touching the YouTube Data API v3's
upload endpoint, `stub.ts`, `index.ts`). Two responsibilities:

1. **Metadata generation** — a new `purpose: 'metadata-generation'` LLM call (added to
   `studio/src/llm/` in the same pass as Task 1's `video-production-planning` purpose — same
   `claude-haiku-4-5` tier judgment call, see Task 1's report for the reasoning) turns the
   sanctioned script + hashtags into `{ title, description, tags }`. Its own `UsageEvent` row
   (`agent: 'metadata-generation'`).
2. **Upload** — `videos.insert` via a hand-built multipart/related request against
   `google-auth-library`'s `OAuth2Client` (no `googleapis` package needed — the same approach
   `scripts/youtube-oauth.ts` already uses for its `channels.list` sanity check), hardcoded
   `privacyStatus: 'private'`.

`runPublishingStage` (state-machine.ts) wires `paused_gate2 → publishing → analytics`: validates
gate2's outcome is `approve`, pulls `videoPath` from `video_generation`, `sanctionedScriptText`
from `gate1`, and `hashtags` from `script_generation`.

**Confirmed the flagged architecture call**: Publishing owning metadata generation (rather than
Script Generation) is correct as built — the script-review rubric, gate1 approval, and video
generation never needed a title/description, and Publishing already needs the sanctioned script in
hand for the upload call, so generating metadata immediately before upload keeps it colocated with
where it's used. No rework needed.

### A real correctness gap found and closed: duplicate-upload-on-resume

Every prior stage's resumability story is "redo the work, it's idempotent-enough" (re-running an
LLM call or a render just costs money again). Publishing is the first stage with a genuinely
irreversible external side effect — a second `videos.insert` call means a second real video on the
channel, not just wasted spend. The existing resume pattern (`resume-on-startup.ts` re-invokes the
same `runXStage(runId)`, which always starts a brand-new attempt from scratch) would have silently
double-uploaded if the process died between a successful upload and the stage's normal completion.

Fixed with a durable mid-attempt checkpoint: `pipeline-stage.repository.ts` gained
`recordStageProgress(id, partialOutput)`, which overwrites a still-`running` stage's `output`
without marking it complete. `runPublishingStage` calls it immediately after `uploadVideo(...)`
returns a real `youtubeVideoId` — before `completeStage`. On any resumed call, it first checks
whether the latest `publishing` attempt is `running` **and** already has a checkpointed
`youtubeVideoId`; if so, it completes that same stage row directly (no new attempt, no second
upload call). Verified in code and exercised by Task 4's real kill-mid-publishing test — see that
task's report.

One known residual gap, stated plainly rather than smoothed over: the narrow window while the
`uploadVideo` HTTP request is literally in flight (sent, but no response received when the process
dies) still has no idempotency guarantee — YouTube's simple multipart upload endpoint doesn't
accept a client-supplied idempotency key. Out of scope to close fully this task; flagged in
`docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md`.

## Files Created/Modified

- Created: `studio/src/agents/publishing/types.ts`, `youtube-client.ts`, `stub.ts`, `index.ts`
- Modified:
  - `studio/src/models/repositories/pipeline-stage.repository.ts` — new `recordStageProgress`
  - `studio/src/run-pipeline/state-machine.ts` — new `runPublishingStage`
  - `studio/src/run-pipeline/resume-on-startup.ts` — `publishing` added to the resumer map
  - `studio/scripts/dry-run.ts` — new `publish <runId>` command
  - `studio/.env.example` — `YOUTUBE_STUB` documented
  - (`studio/src/llm/types.ts`/`registry.ts`'s `metadata-generation` purpose was added in Task 1's
    commit, alongside `video-production-planning` — one registry edit, both purposes)

## Schema Changes Applied

None. Writes to `pipeline_stages`/`usage_events` only, as `SCHEMA.md` anticipated.

## Test Results

```
npm run typecheck   -> clean
npm run lint        -> clean
npm run build       -> clean
```

### Real end-to-end test (stub upload path)

Week 1 Task 7's OAuth is still `Done — action needed` (confirmed via `docs/execution/week1/STATUS.md`
before starting, per this task's own acceptance criterion) — no `YOUTUBE_REFRESH_TOKEN` exists, so
this ran under `YOUTUBE_STUB=1` for the upload half. Metadata generation is real Anthropic, not
stubbed (Publishing's own LLM call needs no external credential beyond what's already configured).

Used the existing dry-run fixture run, forced to `paused_gate2` via `fixture-force-video-review-pass.ts`
(a pre-existing Week 3 test helper, avoiding more real video-regen spend), approved for real via
`gate2 <runId> approve`, then `YOUTUBE_STUB=1 npx tsx scripts/dry-run.ts publish <runId>`. Result,
read back from the DB:
- Real metadata generated: title "Why Cats Always Land On Their Feet", a 2-sentence description,
  13 relevant tags — genuinely on-topic, not placeholder text.
- Stub upload returned `youtubeVideoId: "stub-ec8b1fa7-..."`, `privacyStatus: "private"`.
- `PipelineRun.status = 'running'`, `currentStage = 'analytics'` — correct per
  `BUSINESS_LOGIC.md` Section 1 (advances automatically, no gate).
- One real `metadata-generation` `UsageEvent` row (`claude-haiku-4-5`, $0.001).

### Non-transient failure path

Verified directly (a targeted script calling `uploadVideo(...)` with `YOUTUBE_STUB` unset, no
`YOUTUBE_REFRESH_TOKEN` configured — the genuine current state) rather than through the full
pipeline, since no real bad-credential 401/403 from Google is reproducible without a real OAuth
client to begin with. Confirmed the thrown error is a real `NonTransientStageError` (not
`TransientStageError`), which `withRetryAndCircuitBreaker` propagates immediately — the same
pattern every other stage already relies on to route to `needs_attention` without retrying. The
transient path (429/5xx) is untested against a real Google response, same honestly-flagged gap as
every other capability layer's transient path (`KNOWN_ISSUES_AND_BLOCKERS.md` §4).

## Deviations from Spec

- Added `recordStageProgress` to the stage repository — not called out in the task file's "Files
  to Modify" list, but necessary to satisfy Task 4's "no duplicate upload on resume" acceptance
  criterion, which this task's own upload boundary makes possible to violate for the first time in
  the project. Flagged here rather than silently added.
- `studio/src/agents/publishing/youtube-client.ts` and `stub.ts` weren't named in the task file's
  file list (only `index.ts` was) — added to keep the same "only one file touches the external API"
  boundary convention every other capability layer in this project uses, rather than mixing the
  real Google call and the stub into `index.ts` directly.

## Sign-Off

- Task Objective: Met — metadata generation and upload both work end-to-end against the stub path;
  the metadata-generation half is fully real.
- Schema Impact: Matches `SCHEMA.md` — no changes.
- Business Logic: Matches `BUSINESS_LOGIC.md` Sections 1-2.
- Tests: Passing.
- Ready for Integration: Yes.
- **Still stubbed, pending tonight's keys**: the real YouTube upload itself (Week 1 Task 7's
  OAuth). Once `YOUTUBE_REFRESH_TOKEN` lands, unset `YOUTUBE_STUB` and re-run — no code change
  needed.
