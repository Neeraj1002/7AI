# Frontend Track Task 1: API Layer (tRPC + Fastify, Auth, Gate Resolution, Run Creation)

**Date**: 2026-09-09
**Status**: Complete
**Files Created**: 12
**Files Modified**: 5
**Tests**: All Passing

## What Was Done

Built `studio/src/api/` — a tRPC router served over Fastify, mounted inside the existing orchestrator process (not a separate service), covering run creation/listing/detail, both gate decisions, channel listing, the four dashboard aggregate groups, and (added mid-task — see Deviations) a Range-capable video-streaming route. Every request (video route included) is checked against a single `API_AUTH_TOKEN` header before any route logic runs.

Extended `FounderChannel` with `resolvePendingApproval(threadKey, reply)`, giving the API and a Telegram reply one shared resolution primitive instead of two competing paths — proven with a real, repeatable race test (`scripts/test-double-resolution-race.ts`) against the live DB and live Telegram bot, not a mock.

`createRun` was already extracted into `state-machine.ts` and already consumed by `dry-run.ts` before this task started (visible in `dry-run.ts`'s existing imports) — that acceptance criterion was satisfied by prior work, not new in this task. What *was* missing, and is new here: nothing drove a `pending` run forward on its own. `studio/src/run-pipeline/pipeline-runner.ts` adds `runPipelineToNextGate`, which the API's `runs.create` kicks off in the background so a submitted brief actually reaches a gate instead of sitting inert.

## Files Created/Modified

- Created: `studio/src/api/trpc.ts`, `studio/src/api/router.ts`, `studio/src/api/server.ts`, `studio/src/api/video-route.ts`, `studio/src/api/routers/runs.ts`, `studio/src/api/routers/channels.ts`, `studio/src/api/routers/dashboard.ts`, `studio/src/run-pipeline/pipeline-runner.ts`, `studio/src/models/repositories/dashboard.repository.ts`, `studio/src/types/dashboard.types.ts`, `studio/scripts/test-double-resolution-race.ts`, `docs/execution/frontend/STATUS.md`
- Modified: `studio/src/notify-founder/channel.ts` (interface addition), `studio/src/notify-founder/telegram-channel.ts` (implementation), `studio/src/config/env.ts` (`API_AUTH_TOKEN`, `API_PORT`), `studio/src/index.ts` (boots the API server), `studio/src/models/repositories/pipeline-run.repository.ts` (`listRuns`), `studio/src/models/repositories/pipeline-stage.repository.ts` (`listStagesForRun`), `studio/src/types/index.ts` (export dashboard types), `docs/execution/frontend/BUSINESS_LOGIC.md` (Section 5 addendum)
- Dependencies added: `fastify`, `@trpc/server`, `@fastify/static`, `superjson`

## Schema Changes Applied

None — confirmed against `SCHEMA.md`. `performance_snapshots` (Week 4 Task 3's table) is read via a raw, quoted-camelCase-column SQL query rather than a Prisma model, specifically so this track's `schema.prisma` stays untouched — see Deviations.

## API Surface — what Task 2/3 actually consume

tRPC procedures (POST for mutations, GET with `?input=<url-encoded-json>` for queries; body/response wrapped in superjson's `{json, meta}` envelope — see below):

- `runs.create` (mutation) — `{ channelId, briefText }` → creates the run, starts `runPipelineToNextGate` in the background, returns the created row.
- `runs.list` (query) — `{ statuses?, stage?, channelId? }` → `PipelineRun[]`.
- `runs.get` (query) — `{ id }` → `{ run, channel, stages, reviewLogs }` (full detail: stage history includes script/video/gate outputs; review logs cover script-review, video-intelligence-own-draft, and human gate decisions).
- `runs.gate1` (mutation) — discriminated union `{ runId, action: 'approve' } | { runId, action: 'reject', reason } | { runId, action: 'edit', editedScriptText }` → `{ resolved: true }` or a `CONFLICT` error if the gate wasn't pending.
- `runs.gate2` (mutation) — same shape, `action: 'approve' | 'reject' | 'revise'` (`notes` for revise).
- `channels.list` (query) — no input → `Channel[]`.
- `dashboard.operational` / `.cost` / `.content` / `.quality` (queries) — response shapes documented field-by-field in `studio/src/types/dashboard.types.ts`.

Plus one plain REST route (not tRPC — see Deviations): `GET /runs/:id/video`, same auth, real `Accept-Ranges`/206 support via `@fastify/static`'s `reply.sendFile()`.

`AppRouter` (`studio/src/api/router.ts`) is the type Task 2's app imports directly for its tRPC client — no hand-written response types needed for the tRPC procedures.

## Test Results

```
npm run build       — passes, no errors
npm run lint         — passes, no warnings
npm run typecheck    — passes, no errors
npx tsx scripts/dry-run.ts setup   — still works (runId printed), confirming the pre-existing createRun extraction is unaffected
```

### Real end-to-end proof (Gate 1, via the live API against the live orchestrator + Postgres + Telegram)

1. `POST runs.create` with a real channelId/briefText → run created, `status=pending`.
2. Background driver advanced it through intake → script_generation → script_review → opened Gate 1 (real Telegram message sent) within ~5s; polled `runs.get` and observed `status=paused_gate1, currentStage=gate1`.
3. `POST runs.gate1 { action: 'approve' }` with a valid token → `{ resolved: true }`.
4. Re-queried `runs.get`: `currentStage` advanced to `video_generation` (`status` moved off `paused_gate1`) — confirmed via the API, which itself reads straight from Postgres (no caching layer in front of it).

### Double-resolution race (explicit, repeatable — `scripts/test-double-resolution-race.ts`)

Real DB, real Telegram bot, no mocks:
1. Created a run, drove it to Gate 1 (real Telegram message sent, real `sentMessageId` captured).
2. `founderChannel.resolvePendingApproval(runId, 'approve')` → `resolved: true` (this is exactly what `runs.gate1` calls).
3. Same call again → `resolved: false` — the API's own conflict path.
4. A real, simulated incoming Telegram reply to the same message (`simulateIncomingTelegramMessage`, the same test primitive `dry-run.ts` already uses) → logged, did not throw, did not alter anything (no pending entry remained to match against).
5. Awaited the original `runGate1Stage` call: it resolved with the **first** decision only (`status=running, currentStage=video_generation`) — proving the run advanced exactly once, not twice, regardless of the second/third attempt.

Output: `[race-test] PASS`.

### `GET /runs/:id/video` proof

Using a real run driven through Gate 1 with `MEDIA_STUB=1` (see Deviations) to get a real, playable MP4 without needing `OPENAI_API_KEY`:
- No `Authorization` header → `HTTP 401`.
- Valid token, full request → `HTTP 200`, `accept-ranges: bytes`, `content-length: 2018515`, downloaded bytes match that length exactly.
- Valid token, `Range: bytes=0-1023` → `HTTP 206 Partial Content`, `content-range: bytes 0-1023/2018515`, `content-length: 1024`, downloaded exactly 1024 bytes.

### Dashboard endpoints — real data, cross-checked against direct Postgres queries

All four returned real (non-fabricated) numbers from the shared dev database (which already had real prior-session data, including a real `performance_snapshots` table from the concurrent Week 4 backend session — see Deviations):

- `dashboard.cost.totalSpendUsd = 0.7273` — matches a direct `prisma.usageEvent.aggregate({_sum:{costUsd:true}})` query exactly.
- `dashboard.quality.gate1Rates = {approve:16, edit:3, reject:2}` — matches a direct SQL count on `review_logs` joined to `pipeline_stages` exactly.
- `dashboard.operational.needsAttention.length = 20` — matches a direct `prisma.pipelineRun.count({status:'needs_attention'})` exactly.
- `dashboard.content` returned `available: true` with real (stub-video) view/like/comment totals, since `performance_snapshots` already had rows in the shared DB.

## Deviations from Spec

1. **`createRun` extraction was already done before this task started.** `state-machine.ts` already exported `createRun`, and `dry-run.ts` already called it — verified by reading both files at the start of this task. No code change was needed for that specific acceptance criterion; noted here rather than silently claiming new work.
2. **Mid-task spec update, incorporated:** `docs/execution/frontend/BUSINESS_LOGIC.md` and `tasks/task1.md`/`task2.md` were revised during this session (2026-09-09) to add `GET /runs/:id/video`. Implemented as specified: `@fastify/static`'s `reply.sendFile()` for Range support, same token auth, no query-param exception. Proven with curl per the updated acceptance criterion.
3. **`GET /runs/:id/video` is a plain Fastify route, not a tRPC procedure.** tRPC's JSON-RPC shape doesn't fit streaming file bytes with `Range` headers, and the task docs describe this endpoint in REST terms specifically (unlike the others, which are described in REST terms but implemented as tRPC procedures per BUSINESS_LOGIC.md's own tRPC recommendation). Both live behind the same global auth hook in `server.ts`.
4. **The other six "REST-shaped" endpoints in the acceptance criteria are implemented as tRPC procedures, not literal REST routes** — `POST /runs` → `runs.create`, `GET /runs/:id` → `runs.get`, etc. This matches `BUSINESS_LOGIC.md`'s own reasoning for choosing tRPC ("same TypeScript types shared end-to-end... no separate OpenAPI/schema layer") and Task 2's explicit expectation of consuming `AppRouter`'s inferred types directly. The REST-style bullet list in the task docs is treated as naming the required *operations*, not mandating literal HTTP verb+path routing — flagged here per the template's "justify the swap in the report" instruction, even though the underlying framework (tRPC + Fastify) itself wasn't swapped.
5. **`performance_snapshots` is read via raw SQL, not a Prisma model.** That table belongs to Week 4 Task 3 (Performance Analytics), not this track — `SCHEMA.md` explicitly says no schema changes here, and adding a model this track doesn't own would blur that boundary. It happens to already exist in the shared dev database (the concurrent Week 4 session's migration already ran there), so `dashboard.content` reads it with `prisma.$queryRaw`, with a specific catch for Postgres's "relation does not exist" (42P01) that returns an honest `available: false` empty shape instead of erroring — for an environment where that table genuinely doesn't exist yet.
6. **New orchestration piece not explicitly named in the task file:** `pipeline-runner.ts` (`runPipelineToNextGate` / `startPipelineInBackground`). Necessary because nothing else in this codebase advances a `status='pending'` run — `resume-on-startup.ts` only resumes `status='running'` runs. Documented in `BUSINESS_LOGIC.md` Section 5 (new). It adds no new transition logic — it only sequences the existing `runXStage` functions.
7. **Gate 2 wasn't independently proven end-to-end in this session.** Every test run that reached video generation hit `needs_attention` before Gate 2 opened — the `MEDIA_STUB` stub's placeholder audio duration (driven by script length, not directly controllable) tripped Video Intelligence's 60-second Shorts-length check in both attempts I drove. `runs.gate2` uses the exact same `resolvePendingApproval` primitive and the same discriminated-union pattern as `runs.gate1` (proven), so risk is low, but this is a real gap, not a claimed pass — flagged rather than glossed over. The literal acceptance criterion ("a real Gate 1 **or** Gate 2 decision") is satisfied by the Gate 1 proof above.
8. **`MEDIA_STUB=1` was set in `.env.local` for testing** (pre-existing Week 3 stub, not new) — real `OPENAI_API_KEY` isn't configured in this environment. This produced real, playable audio/video files via FFmpeg (not fake-shaped data), which is what let the video-streaming endpoint get a genuine proof rather than being skipped. Left enabled in `.env.local` for Task 2/3's testing convenience; the API itself has no dependency on this flag.
9. **Working-directory isolation:** this session's `FRONTEND_FE` work happened in a separate git worktree (`../7AI-frontend`) rather than the original directory, because the concurrent Week 4 backend session shares the same physical repo checkout and had already caused one branch-switch collision mid-session. See STATUS.md and the PR description for details — this doesn't affect the branch/commit history, only where the files physically live during development.

## Sign-Off
- Task Objective: Met
- Schema Impact: Matches SCHEMA.md (no changes)
- Business Logic: Matches BUSINESS_LOGIC.md (Section 5 added to document the pipeline-runner addition)
- Tests: Passing
- Ready for Integration: Yes — Task 2 can build against `AppRouter` and the endpoints documented above.
