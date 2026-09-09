# Frontend Track Task 1: API Layer (tRPC + Fastify, Auth, Gate Resolution, Run Creation)

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow (branch/commit/PR steps for this task), the `STATUS.md` update this task must make, and the section structure this file follows. This file states only this task's specifics — the template governs everything else, so don't skip it.

**Objective**: Give `studio/` a real HTTP API — the missing prerequisite `docs/design_doc/frontend/MOBILE_APP_DESIGN.md` Section 3 flags — covering run creation, run listing/detail, both gate decisions, channel listing, and dashboard aggregates, all behind a single shared auth token.
**Duration**: 4–6 hours
**Depends On**: Nothing from Week 4 (backend). Needs Weeks 1–3's schema and orchestrator as they stand today.
**Owning Component**: New — `studio/src/api/` (orchestrator process gains an HTTP surface; this is not a separate service).
**Success Criteria**: A real Gate 1 or Gate 2 decision, submitted via an authenticated HTTP call (curl is fine for this task — no app yet), provably advances a real `PipelineRun` in Postgres, and a dashboard endpoint returns real aggregate numbers from real data.

## Task Requirement

This is the track's foundation task — Task 2 (app scaffold) and Task 3 (dashboard) both build directly on the endpoints this task creates, so treat the API surface below as a contract, not a rough draft. Read `docs/execution/frontend/BUSINESS_LOGIC.md` in full before starting — it captures the one real design fork in this track (Section 1: gate resolution needs one shared mechanism, not two) and the exact API surface (Section 3).

### Context
`docs/design_doc/frontend/MOBILE_APP_DESIGN.md` (why this exists, Section 3 especially), `docs/execution/frontend/BUSINESS_LOGIC.md` (the two decisions this task implements), `docs/execution/frontend/SCHEMA.md` (confirms no new tables), `docs/execution/week2/BUSINESS_LOGIC.md` Section 4 and `reports/task6.md` (existing Gate 1 mechanism), `docs/execution/week3/reports/task4.md` (existing Gate 2 mechanism), `scripts/dry-run.ts` (existing `setup`/`start` commands to extract from).

### Acceptance Criteria
- [ ] `studio/src/api/` built on tRPC + Fastify (per `BUSINESS_LOGIC.md`'s recommendation — if Fastify turns out to conflict with something already in `studio/`'s process model, Express is an acceptable substitute, but justify the swap in the report rather than silently doing it).
- [ ] Every request authenticated via a single shared `API_AUTH_TOKEN` env var (a header check, not a database-backed session) — a request without a valid token gets a clean 401, not a stack trace.
- [ ] `createRun({ channelId, briefText })` extracted from `scripts/dry-run.ts`'s `setup`/`start` commands into a real, callable function inside `studio/src/run-pipeline/`. `dry-run.ts` is updated to call the extracted function rather than duplicating its logic — same behavior, one implementation.
- [ ] `FounderChannel` (`notify-founder/channel.ts`) gains a `resolvePendingApproval(threadKey, decision)` method, implemented by fulfilling the same `pendingByThreadKey` promise `telegram-channel.ts` already fulfills on a matched Telegram reply. Confirm the exact `threadKey` shape a caller needs (read `telegram-channel.ts`'s current implementation before assuming) — this task should surface it, not guess it.
- [ ] Whichever of Telegram or the API resolves a pending gate first wins; the second caller (if any) gets a clear "already resolved" response, not a silent no-op or a double-resolve. Prove this with a real test: open a gate, resolve it via the API, then send a Telegram reply to the same gate and confirm it's rejected as already-resolved (or vice versa).
- [ ] Endpoints implemented, matching `docs/execution/frontend/BUSINESS_LOGIC.md` Section 3 exactly:
  - `POST /runs` — create a run
  - `GET /runs` — list runs, filterable by status/stage
  - `GET /runs/:id` — full run detail (stage history, script, video, review logs)
  - `GET /runs/:id/video` — streams the run's video file, `API_AUTH_TOKEN`-authenticated same as every other endpoint, with real HTTP Range support (206 partial content) so the app's video player can seek/scrub — not just play from the start. If built on Fastify, use `@fastify/static` pointed at the video directory rather than hand-rolling range handling.
  - `POST /runs/:id/gate1` — resolve a pending Gate 1 (`approve` / `reject [reason]` / edited text)
  - `POST /runs/:id/gate2` — resolve a pending Gate 2 (`approve` / `reject [reason]` / `revise` with notes)
  - `GET /channels` — list channels
  - `GET /dashboard/operational`, `/dashboard/cost`, `/dashboard/content`, `/dashboard/quality` — one endpoint per `MOBILE_APP_DESIGN.md` Section 4's four dashboard groups (exact query shape is this task's call — Task 3 consumes whatever comes back, so document the response shape clearly in the report for Task 3 to build against)
- [ ] A real end-to-end proof: submit a brief via `POST /runs`, let it run to a paused gate, resolve that gate via the API, confirm in Postgres that the run actually advanced.
- [ ] `GET /runs/:id/video` proof: for a run with a real generated video, confirm the endpoint returns the actual video bytes with a valid auth header, returns 206 with the correct byte range on a `Range` request, and returns 401 without the token — test with `curl -H "Range: bytes=0-1023"` or equivalent, not just a browser tab.

## Schema Impact
None. Confirmed in `docs/execution/frontend/SCHEMA.md` — auth is a shared env token, not a database-backed table.

## Business Logic / State Transition
No new transitions. This adds a second caller of existing transition logic (gate resolution, run creation) — see `docs/execution/frontend/BUSINESS_LOGIC.md` Sections 1–2 for the exact framing.

### Reference
`docs/execution/frontend/BUSINESS_LOGIC.md` (all sections), `docs/execution/week1/BUSINESS_LOGIC.md` Section 1 (the persist-before-advancing rule this API's writes must respect same as everything else).

## Implementation

### Detailed Steps
1. Read `docs/execution/frontend/BUSINESS_LOGIC.md` and `telegram-channel.ts` in full before writing any code — the gate-resolution fork is the one place a wrong assumption here would be expensive to unwind later.
2. Extract `createRun` from `dry-run.ts` into `studio/src/run-pipeline/`; update `dry-run.ts` to call it.
3. Add `resolvePendingApproval` to `FounderChannel` and wire `telegram-channel.ts`'s existing resolution path through it (or confirm they already share a resolution primitive underneath, in which case this step is thinner than it looks — check before assuming a rewrite is needed).
4. Scaffold `studio/src/api/` (Fastify + tRPC), with `API_AUTH_TOKEN` middleware applied first, before any route logic.
5. Implement `/runs`, `/runs/:id`, `/runs/:id/video` (with Range support — use `@fastify/static` if on Fastify), `/runs/:id/gate1`, `/runs/:id/gate2`, `/channels`.
6. Implement the four `/dashboard/*` endpoints — start from real queries against real Week 1–3 data (`PipelineRun`, `AgentQuota`, `ReviewLog`, `UsageEvent`); `PerformanceSnapshot`-backed content-performance data will likely be empty until Week 4 Task 3 lands real snapshots — return an honest empty/zero shape rather than fabricating numbers.
7. Write the double-resolution race test (API vs. Telegram) as an explicit, repeatable test — not just a one-off manual check.
8. Run the full end-to-end proof described in the last acceptance criterion.
9. Update `docs/execution/frontend/STATUS.md` (new — this task creates it, following the same format as `week1/STATUS.md` etc.) and reconcile `BUSINESS_LOGIC.md`/`SCHEMA.md` against whatever actually got built if it diverged from the plan.

## Testing

### Test Commands
```bash
npm run build
npm run lint
npm run typecheck
npx tsx scripts/dry-run.ts   # confirm unchanged behavior after the createRun extraction
```

### Expected Results
- The API starts and rejects unauthenticated requests with 401.
- `POST /runs` with a valid token creates a real `PipelineRun` row and the orchestrator picks it up.
- A gate resolved via the API is reflected in Postgres and does not later get double-resolved by a matching Telegram reply.
- All four dashboard endpoints return real (possibly sparse/zero, never fabricated) data.

### How to Verify
1. Run all test commands above.
2. Submit a real brief via `POST /runs`, resolve its Gate 1 via the API, confirm the run's `currentStage` advanced in Postgres.
3. Run the double-resolution race test and confirm the second resolution attempt is cleanly rejected.
4. Hit all four `/dashboard/*` endpoints and sanity-check the numbers against a direct Postgres query.

## Additional Notes
No new external credentials needed for this task — it exercises the existing orchestrator, database, and Telegram bot, all already configured. `API_AUTH_TOKEN` is a new env var this task introduces (any long random string works for now; document it in the report so it can go in the app's config in Task 2).

## Links & References
- [docs/design_doc/frontend/MOBILE_APP_DESIGN.md](../../../design_doc/frontend/MOBILE_APP_DESIGN.md)
- [docs/execution/frontend/BUSINESS_LOGIC.md](../BUSINESS_LOGIC.md), [SCHEMA.md](../SCHEMA.md)
- [docs/execution/week2/BUSINESS_LOGIC.md](../../week2/BUSINESS_LOGIC.md) Section 4, [reports/task6.md](../../week2/reports/task6.md)
- [docs/execution/week3/reports/task4.md](../../week3/reports/task4.md)
- [docs/execution/frontend/tasks/task2.md](task2.md), [task3.md](task3.md) — both depend on this task's output
