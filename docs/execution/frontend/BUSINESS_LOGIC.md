# Frontend Track: Business Logic Delta

**Status**: Introduces an authenticated API layer in front of the existing orchestrator. No changes to any existing state-machine transition table (Weeks 1–4's rules are unchanged) — this adds a second way to *reach* those transitions, not new transitions themselves.
**Runs alongside**: Week 4 (backend), independently — this track needs none of Week 4's new credentials (OpenAI, Pexels, YouTube OAuth).

## 1. Flagged architecture call: gate decisions need one resolution point, not two

Today, `runGate1Stage`/`runGate2Stage` call `founderChannel.requestApproval(...)`, which sends a Telegram message and blocks on a promise that resolves when a matching incoming Telegram reply arrives (`telegram-channel.ts`'s `pendingByThreadKey` map). Once the app can also submit a gate decision, there are two possible sources for "the founder decided" — a Telegram reply and an API call — and they must resolve the *same* pending gate, not race or silently duplicate.

**Decision**: extend `notify-founder/channel.ts`'s `FounderChannel` interface with a method the API can call to resolve a pending approval directly — e.g. `resolvePendingApproval(threadKey, decision)` — implemented by fulfilling the same `pendingByThreadKey` promise `telegram-channel.ts` already fulfills on a matched Telegram reply. Telegram and the API become two callers of one resolution mechanism, not two separate paths. Whichever arrives first resolves the gate; the other, if it arrives after, gets a clear "already resolved" response rather than silently overwriting the first decision.

This is the one real design fork in this track — flagged here for confirmation rather than decided silently in code. If it turns out awkward in practice, flag that in Task 1's report rather than quietly reworking it.

## 2. New capability: submitting a brief without a terminal

`scripts/dry-run.ts`'s `setup`/`start` commands are currently the only way to create a `PipelineRun`. This track extracts that into a real, callable `createRun({ channelId, briefText })` inside `studio/src/run-pipeline/`, called by both the new API endpoint and (unchanged behavior) by `dry-run.ts` for testing — one implementation, two callers, the same pattern used everywhere else in this project.

## 3. API surface (implemented by Task 1)

- `POST /runs` — create a run (`createRun`)
- `GET /runs` — list runs, filterable by status/stage (powers the Queue screen)
- `GET /runs/:id` — full run detail (stage history, script, video, review logs)
- `GET /runs/:id/video` — streams the run's generated video file (see Section 4 below)
- `POST /runs/:id/gate1` — resolve a pending Gate 1 (`approve` / `reject [reason]` / edited text)
- `POST /runs/:id/gate2` — resolve a pending Gate 2 (`approve` / `reject [reason]` / `revise` with notes)
- `GET /channels` — list channels
- `GET /dashboard/*` — aggregate queries per `docs/design_doc/frontend/MOBILE_APP_DESIGN.md` Section 4's four groups (operational health, cost, content performance, quality signal)

All authenticated via a single shared token (`API_AUTH_TOKEN`, env var) checked on every request — see `SCHEMA.md` for why this is enough for v1.

## 4. Video streaming endpoint (added 2026-09-09)

`videoPath` (from Week 3's Video Generation output) is a path on the orchestrator's local filesystem — the app can't reach it directly, and `GET /runs/:id` returning that path is useless to a mobile video player. `GET /runs/:id/video` serves the actual file bytes.

**Auth**: same `API_AUTH_TOKEN` header as every other endpoint — no query-param exception. `expo-video` (the app's video library, see `MOBILE_APP_DESIGN.md` Section 4) supports attaching custom headers to a video source, so there's no real reason to special-case this endpoint's auth just because a `<video>` tag historically couldn't send headers.

**HTTP Range support is required, not optional**: video players scrub by making ranged requests (`Range: bytes=...`), and without `Accept-Ranges`/206 support the player can only play from the start with no seeking, or may fail outright on larger files. If built on Fastify, `@fastify/static` handles this automatically when pointed at the video directory — prefer that over a hand-rolled file-streaming handler.

## 5. Implementation note: `POST /runs` needs something to actually drive the run (added during Task 1)

Not a new transition, but worth stating plainly since it wasn't explicit above: creating a `PipelineRun` row alone leaves it at `status='pending'` forever — nothing else in this codebase starts a `pending` run (`resume-on-startup.ts` only ever resumes a run already `status='running'`). `createRun` extracted cleanly (Section 2 above already covered), but the API's `POST /runs` needs the run to actually progress, not just exist.

`studio/src/run-pipeline/pipeline-runner.ts` (new, Task 1) adds `runPipelineToNextGate(runId)`: a loop over the existing `runXStage` functions, driven by `run.currentStage`, that advances a run automatically — through intake/script_generation/script_review into Gate 1, and (after that gate resolves) on into video_generation/video_review/Gate 2 — stopping the moment the run needs a human (a gate is open and blocking on a reply) or hits a state nothing processes yet (`needs_attention`, `failed`, or a stage with no wired-up processor). It calls no new transition logic — only the same `runXStage` functions state-machine.ts already exposes, in the sequence `resume-on-startup.ts`'s own `STAGE_RESUMERS` table already documents. `startPipelineInBackground(runId)` is the fire-and-forget wrapper `runs.create` actually calls, so the HTTP response doesn't block on a run that can take from seconds to minutes to reach its next gate.

## Reference
- `docs/design_doc/frontend/MOBILE_APP_DESIGN.md`
- `docs/execution/week2/BUSINESS_LOGIC.md` Section 4, `reports/task6.md` — the existing Gate 1 mechanism this extends
- `docs/execution/week3/reports/task4.md` — the existing Gate 2 mechanism this extends
