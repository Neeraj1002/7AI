# Sprint 4 Task 12: Run Screen Data (Backend)

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow, the Hard rules (one worktree per session, never push to `main`) and the report shape. This file states only this task's specifics. (Not to be confused with Sprint 3 Task 12, the Gate 2 / budget work, which is merged.)

**Written**: 2026-10-11 by the architect chat. **Status**: not started. **Branches**: `SPRINT4_TASK12A_BE` (PR A) and `SPRINT4_TASK12B_BE` (PR B), each in its own worktree off fresh `main`.

**Objective**: give the redesigned app screens (Frontend Tasks 2 and 4) the few fields they want and cannot read today: the settings a run really used, every gate's decision, spend per run, an image count while stills are generated, a chapter warning, and the quality targets. Every field is additive and optional, and an older run or a Short without it behaves exactly as today. The app already has a fallback for each, so **nothing waits for this task and this task waits for nothing**.
**Duration**: 1.5 to 2 days.
**Depends On**: nothing for PR A. PR B touches code that Sprint 4 Tasks 9 and 10 change; develop it now, merge it after Task 9 PR B and Task 10 are on `main`, and merge `main` into your branch before opening the PR.
**Owning Component**: `studio/src/api/routers/runs.ts` (`getRunDetail`, `progress`), the run-state helpers, the quality-metrics output.
**Success Criteria**: (1) a real run on the dev database returns each new field with correct values, cross-checked against Postgres; (2) a run made before this change returns `runs.get` unchanged (the new fields absent); (3) the app type-checks against the new response without edits to existing fields; (4) full tests, `tsc` and `eslint` pass.

## Delivery: two PRs, so nobody waits
- **PR A (`SPRINT4_TASK12A_BE`), independent, ship first:** R1, R2, R3. These read existing data; they do not touch Task 9 or 10 code.
- **PR B (`SPRINT4_TASK12B_BE`):** R4, R5, R6. They sit on Task 9's stills loop and Task 10's quality profile. Build now against `main`, rebase when those land. If a Task 10 item already provides what R5 or R6 asks for, say so in the report and skip it.

## R0. Read the code first

The architect could not read the code from the chat. Before changing anything, put a table in the report: each "What exists" line below, **confirmed** or **wrong (what is really there)**. Follow the real code. Files to open: `runs.ts` (`getRunDetail`, `deriveLastGateDecision`, `progress`), `state-machine.ts` (gate stages, auto-approval path), the resolver (`channel-profile/resolve.ts`), the `usage_events` repository, `QUALITY_SPEC` and the quality-metrics builder (Task 8, PR #64).

## R1. Settings the run actually used (`resolvedOptions`)

**What exists**: `runs.get.creationOptions` holds only what the user picked (voice, visual source and audio layer only when changed from the default). The resolver (Sprint 4 Task 1) already decides the final values and where each came from; they are not returned.
**Change**: `runs.get` returns, for runs started after this change, `resolvedOptions`, written once when the run starts (the resolver already runs then) into the run's existing options JSON; no migration. Each entry carries its value and where it came from:

```typescript
resolvedOptions?: {
  voice:        { key: string; label: string; from: 'run' | 'format' | 'profile' | 'channel' | 'default' };
  visualSource: { value: 'stock' | 'ai-stills' | string; label: string; from: ... };
  music:        { label: string; from: ... };        // mood or "Auto" result, as the app shows it
  targetSeconds:{ value: number; from: ... };
  videoKind:    'short' | 'long';
  formatKey:    string | null;                       // null = Freeform
}
```

Labels use the same wording as `options.list` so the app shows the same word in the picker and on the tile. Older runs: field absent. The app writes "(default)" itself when `from` is `channel` or `default`.
**Verify**: three real runs (all defaults; Onyx + AI images + a mood picked; a run with a `formatKey`), values checked against what the pipeline actually used.

## R2. Every gate's decision (`gateDecisions`)

**What exists**: `lastGateDecision` (Sprint 3 Task 11 B13) returns only the latest gate, so once Gate 2 is decided the app cannot show how Gate 1 went.
**Change**: `runs.get` also returns `gateDecisions`, oldest first, one entry per gate that was decided, using the same normalising as `deriveLastGateDecision`:

```typescript
gateDecisions?: { gate: 1 | 2; outcome: 'approve' | 'edit' | 'reject' | 'revise';
                  decidedBy: 'user' | 'auto'; privacyStatus?; reason?; notes?; decidedAt }[]
```

`decidedBy: 'auto'` when the channel's gate was off and the run passed it automatically (Sprint 2: Gate 1 off auto-approves scripts scoring 7 or more; Gate 2 off publishes Private). If R0 shows an auto-passed gate leaves no stage row, derive it from the channel setting recorded on the run and say how in the report. `lastGateDecision` stays exactly as it is.

## R3. Spend per run (`spentUsd`)

**What exists**: no cost is returned to the tenant app. The admin module sums `usage_events.costUsd` per run for admins only.
**Change**: `runs.get` returns `spentUsd: number`, the sum of that run's `usage_events` (all attempts), in USD, rounded to 4 decimals. Tenant-scoped like the rest of `runs.get`. Zero-cost rows count as zero. Also return `maxCostUsd` when the run has one (Task 9 R7), so the app can show "stops at $X".
**Verify**: a run with two attempts equals the SQL sum over `usage_events` for that run id.

## R4. Image count while stills generate (`runs.progress`)

**What exists**: `runs.progress({ runId })` returns `{ stage, attemptNo }`; `pct` was left out on purpose because a stage has no meaningful percentage.
**Change**: while the image stage runs, add optional `done` and `total`: stills finished (including stills served from Task 9's disk cache) and stills planned. Keep a counter on the stage row's existing output or metadata JSON, updated after each still or at most every 5 seconds; `progress` reads it. No new column. For every other stage the fields are absent. **No percentage.**
**Verify**: a real long run (2 minutes is enough) polled while generating shows `done` rising to `total`; a Short with AI stills also shows it.

## R5. Chapter warning (`chapterWarning`)

**What exists** (verify): Task 10 R4.1 publishes the description without a chapter list when YouTube's rules fail (first stamp at 00:00, at least 3 chapters, each at least 10 seconds) and "adds a warning to the Gate 2 message", but no field says so.
**Change**: expose the rule as one pure function used by both the publish step and `runs.get`. For a long run at Gate 2, `runs.get` returns `chapterWarning?: string` (plain sentence, for example "A chapter is shorter than 10 seconds"), present only when the rule fails. The Gate 2 screen shows "Chapters won't be added to the description: {chapterWarning}."

## R6. Quality targets and the Length row

**What exists**: `qualityMetrics.rows.<row> = { warn, message }` (PR #64). The app must not keep its own copy of the thresholds, so today it cannot print "target −14".
**Change**: `qualityMetrics` also returns `spec`, the numbers the checks used for this run (Shorts or long profile):

```typescript
spec?: { loudnessLufs: { target: number; tolerance: number }; truePeakMaxDb: number;
         longestShotMaxSec: number; resolution: { width: number; height: number }; fps: number;
         durationSec?: { target: number; tolerance: number } /* long only */ }
```

and, for a long run, a `rows.duration = { warn, message }` row (measured length against target, from Task 10 R2). Absent, not false, when not applicable (same rule as PR #64). Shorts get `spec` too; the other fields stay as they are.

## Schema Impact
None expected: everything lives in existing JSON or is computed at read time. If R0 shows otherwise, add one migration, sorted after `main`'s newest, and list it in the report. Update `BUSINESS_LOGIC.md` with the new fields.

## Report
`docs/execution/sprint4/reports/task12.md`: the R0 table first, then one section per requirement with the real response shown for a run, the cross-checking SQL, tests added, and anything skipped because Task 9 or 10 already covered it. One line to the founder when each PR is ready.
