# Bugs Sprint 3 Closure — Report

**Date**: 2026-10-06
**Branch / PR**: `Sprint3_CLOSURE` / [#48](https://github.com/Neeraj1002/7AI/pull/48) (draft — **not** marked ready, see "Left open")
**Status**: Partially complete. Code items R1, R3, R4, R6 (step 2) and part of R2/R5 are done and verified as stated below. Everything that needs the live preview app, the VPS database or a device is **not done** and is listed under "Needs the founder".

## Verification honesty

- `npm run lint`, `npx tsc --noEmit` and `npx vitest run` (studio) pass: 120 + 3 new tests. The app type-checks except for one error that was already there (`expo-image-picker` missing from this checkout's `node_modules`).
- R1 and R3 backend behaviour was exercised against an **isolated sandbox database** (`sevenai_closure_sandbox` on the local Postgres, created for this task — not the dev or preview DB), with real `checkBudget`, `runs.retry`, `channels.update` and `dashboard.*` calls through the tRPC router. Those scripts were temporary and are not committed.
- App changes (R1 labels, R3 cards, R4 inbox, R5 Details) are **typecheck/lint only — never rendered on a device or in the preview app**.
- **Nothing was run against the preview server or `sevenai_preview`, and no report's status was changed via `bugs.updateTriage`** (no owner session/ops token available, and every state change there is a live-preview action). Success criterion 1 (all 24 triaged) is therefore **not met**.

## What was done

### Commit 1 — `BUGS_CLOSURE_MOVE`
Tasks/reports of Bugs Tasks 1-7 now live under `docs/execution/bugs/Sprint3/`; links in `STATUS.md` and `HOTFIXER_AGENT_PROTOCOL.md` updated; closure row added to `STATUS.md`. (Only Tasks 1-7 existed at the old path on `main`; other docs outside `bugs/` that link the old paths — `sprint3/`, `ui-ux/` — were left alone because the protocol puts them out of scope.)

### R1 — budget refusals (`BUGS_CLOSURE_R1`)
- `checkBudget()` returns `{ok:false, scope, spentUsd, ceilingUsd, channelName, shareReservedByOverrides, resetsAt}`; `isBudgetAvailable` is a wrapper. Both state-machine gates and `runs.retry` use the same numbers for their text.
- Exact texts produced (sandbox):
  - `Account spend limit reached: $2.14 used of $2.00 this week. Resets Monday 00:00 UTC.`
  - `Limit for channel "Underdogs" reached: $2.14 used of $0.90 this week. Resets Monday 00:00 UTC.`
  - F9: `Channel "Underdogs" has a $0.00 share because another channel's override reserves the whole account limit. Lower that override or raise the account limit.`
- `runs.retry` on a run whose gate would refuse it returns `CONFLICT` with that text and creates no stage row (verified: stage count unchanged, run still `needs_attention`). The app's `humanizeRunError` now shows the sentence whole instead of truncating it.
- D1 weekly window (Monday 00:00 UTC): one helper used by the gate and `getCostDashboard`. Verified: a $2.50 event at Sunday 23:59:59 UTC does not count; an event at Monday 00:00:00 UTC does. `dashboard.cost` additively gains `weekSpendUsd`, `budgetWindow`, and per-channel `weekSpendUsd`/`effectiveCeilingUsd`; app labels read "Spend this week … Resets Monday". `invite-tenant` default is now $20/week and its log says `/week`.
- F9 allocator: a warning fires when overrides equal the pool (verified in the sandbox log). `channels.update` refuses an override larger than the weekly pool or one that leaves $0 for other active channels, naming them (verified; override not stored).
- **A bug found and fixed during sandbox verification**: the per-channel weekly SUM returned 0 because a `Date` parameter in raw SQL was compared with the wrong timestamp type; fixed with an explicit `::timestamp` cast and re-verified.
- Step 7 (recorded spend), from reading the code — **not yet confirmed against preview rows**:
  - The 6 `video-generation` / `gpt-image-1.5` rows at $0 in F10 are most likely **failed image generations**, not stub calls: a failed attempt writes a row with the error context's provider/model at `$0`, while the stub records model `stub`. This fits report 6 ("AI images not work") and points at the OpenAI image call failing. The preview's `usage_events.metadata` / stage `output` will confirm.
  - The `unknown/unknown` rows are failed attempts whose error carried no provider/model.
  - **Real under-count**: `generateVideo` pays for TTS + transcription (about $0.031) *before* the visuals step, and a failed attempt then recorded $0 — and the retry loop repeats this up to 3 more times. Fixed: the failure row now records the cost already spent and `metadata.failed`, with a warning log when provider/model are unknown; stub image renders carry `metadata.stub`. Not exercised end to end (needs a failing media call).
  - Image pricing already exists (`gpt-image-1.5` $0.013/image) and is counted on success.

### R2 (partial) — `BUGS_CLOSURE_R2`
A loud `[boot]` warning when any `*_STUB` flag is on. Per-run non-budget causes and report 6's root cause need preview data.

### R3 — dashboard (`BUGS_CLOSURE_R3`)
`successRate` adds `needsAttention` and its `rate` is over completed + needs_attention + failed (D2; there is no `cancelled` status in this codebase). `publishedRate {published, stopped, rate}` (D3). New `dashboard.gates` with approve/revise/reject counts and median time to decision per gate (gate stage created → human review log; blended across verdicts by count, so approximate). Sandbox fixture (2 completed [1 published], 1 failed, 1 needs_attention, 1 running): counts 2/1/1, rate 0.5, published 1 of 4, funnel total 5, channel-scoped numbers correct, gate medians 60 s / 120 s. Report 9 (channel run count) was not touched (F4: re-test first).

### R4 — inbox (`BUGS_CLOSURE_R4`)
Cards read "Script approval" / "Video approval", then the decision once resolved (read from the run's human review log), plus the script's first line and score or the video review result, parsed from the gate's own message (no payload change). Gates already raise one entry each, so one-per-gate holds. Video length was **not** added (not in the message). Not rendered on a device.

### R5 (partial) — `BUGS_CLOSURE_R5`
Report 11: the backend writes `failed` for a failed stage; the "completed" the tester saw is earlier stages in the history. Details now shows "done / FAILED / skipped (not run)" with failures in the danger colour. Reports 12/13 need the live re-test.
**Answer to report 13 ("is the data dirty?")**: not determined — it needs the run's `runs.get` / stage rows from preview, which this session could not read.

### R6 (partial) — `BUGS_CLOSURE_R6`
A revise attempt now skips stock clips earlier attempts used (`excludeSourceIds` → Pexels results, falling back to the first result if all were used). Unit-tested against mocked Pexels; **not run live**. Sprint 4 Task 8/R5 had not built this on `main`.
**Answer to report 16 ("bug or limitation?")**: a limitation of the stock path (first Pexels result for a query, cannot depict a specific person), to be closed by Sprint 4 Task 8/R4 (AI stills for real people) — not a defect in this task. Reports 14/15 still need the plan diff of `f020ef30` / `652491ea` to confirm F5.

## Needs the founder (not done here)
1. **R0**: `cd /var/www/7AI && git log -1 --oneline` on the VPS, re-test all 24 reports on the live app, then `bugs.updateTriage` each (owner session or ops token). Proposed `area` from code reading: reports 1-6 `BE`; 7-9 `BE`+`FE`; 10 `APP`; 11 `FE`/`BE`; 12-13 `BE`; 14-16 `BE`; 17-18 `APP`+`BE`; 19 `BE`; 20 `APP`; the four feedback items: set an area, leave `open`.
2. **R1 step 6** (raise `agent_quotas` to 40 and clear the override `7d2482ee…`) — still needs the founder; note that with this branch the pool is weekly, so $40/week is generous. Re-run the diagnostic SQL after the deploy to confirm.
3. **R1 step 7 check**: run the SQL in the task on `usage_events` to confirm the `gpt-image-1.5` rows are failures, and read the failing attempt's `output`/`lastError` for the image error; check `AI_VISUALS_STUB` on the VPS (R2 / report 6).
4. **R5 reports 12/13**, **R6 steps 1**, **R7** (ffprobe a stuttering draft; compare `/runs/:id/video` with the R2 presigned URL), **R8** (`SELECT name, "defaultVoice" FROM channels;` and set per-channel voices), **R9** (hand to UI/UX; set `area: APP`, stay `open`).
5. Deploy order: ship the server first. The app falls back to the old fields (`weekSpendUsd ?? totalSpendUsd`) so an older server doesn't break the Dashboard, but `dashboard.gates` simply won't show until the server has it. The app changes are JS-only (`FE`): OTA via `eas update --branch preview`, no APK.

## Left open and why
R0 triage, R2 (rest), R5 (12/13), R6 (steps 1/3 verification), R7, R8 and R9 all need preview data, the VPS or a device. The PR stays **draft** and the `STATUS.md` row is `In Progress — action needed`; the protocol's "mark ready" step waits until those are closed.

## Deviations
- `isBudgetAvailable` kept as a wrapper (as specified); `loadChannelBudgetView` was added so the gate and Dashboard share the same ceilings.
- Dashboard `totalSpendUsd` stays lifetime (still the basis of cost-per-video); the weekly figure is a new field rather than a changed one.
- No schema change.
