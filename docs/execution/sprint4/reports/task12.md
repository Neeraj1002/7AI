# Sprint 4 Task 12: Run Screen Data (Backend)

**Date**: 2026-10-13
**Status**: PR A complete (R1, R2, R3). PR B (R4, R6) in progress. R5 skipped: covered by Task 10 (PR #72).
**Branch / worktree (PR A)**: `SPRINT4_TASK12A_BE`, `D:/Study Material/7AI-SPRINT4_TASK12A_BE`
**Tests**: all passing (664 passed, 49 skipped before the last two edits; `tsc` and `eslint` clean)

## R0. What the task assumed, against the real code

| "What exists" line | Verdict | What is really there |
|---|---|---|
| `runs.get.creationOptions` holds only what the user picked | **Confirmed, with one exception** | `runs.create` stores voice, visualSource, audioLayer, sources, formatKey. It also stores `targetDurationSec` and `videoKind: 'long'` for a long run **even when the user did not pick a length** (the resolved 600 s), plus `maxCostUsd` (Task 9). So `creationOptions.targetDurationSec` is not proof the user picked a length. `from` is computed from the request, not from this field. With every default, `creationOptions` was `undefined`; it now always holds at least `resolvedOptions`. |
| The resolver already decides the final values and where each came from | **Half wrong** | `resolveChannelConfig` (`channel-profile/resolve.ts`) decides the values, but returns no provenance. `from` is computed by the new `buildResolvedOptions`, which calls the resolver for the values and works out `from` from the same precedence (run, then format for length, then profile, then channel legacy voice, then default). |
| "the resolver already runs then" (at run start) | **Wrong place** | The resolver runs per stage and in `getRunDetail` (`loadResolvedConfig`), not once at run start. `createRun` only snapshots `profileVersionId`. Nothing is written at start, so `resolvedOptions` is written in `runs.create` (and `runs.rerun`). |
| `options.list` has labels | **Half wrong** | It returns voices with labels, but visual sources and mood tags as bare keys. Voice labels reuse `TTS_VOICES`; mood is the bare key (as `options.list` shows it); visual source labels are new ("Stock footage", "AI images"). **Founder/FE to confirm the visual-source wording.** |
| `lastGateDecision` returns only the latest gate | **Confirmed** | `deriveLastGateDecision` takes the last completed `gate1`/`gate2` stage with an `output.outcome`. Unchanged. |
| An auto-passed gate may leave no stage row | **Wrong: it does leave one** | `state-machine.ts` creates and completes a real `gate1` (script review, score >= threshold, Gate 1 off) or `gate2` (verdict pass, Gate 2 off) row with the same output shape as a human approval (`outcome: 'approve'`, Gate 2 adds `privacyStatus`), plus an `agent: 'system'`, `verdict: 'auto-approve'` review log on that stage. `decidedBy: 'auto'` is read from that review log. No need to read the channel setting, which could have changed since. |
| The admin module sums `usage_events.costUsd` per run for admins only | **Confirmed, and a helper already exists** | `sumUsageCostForRun(runId)` (added in Task 9 for the spend limit) sums every row for the run. Reused. |
| Task 9 R7 gives a run a `maxCostUsd` | **Confirmed** | Stored in `creationOptions.maxCostUsd` for a long run only. |
| `chapterWarning` (R5): no field says a chapter list was dropped | **Wrong: Task 10 added it** | `runs.get` returns `chapterWarning` (`long-form/run-fields.ts`), taken from the `video_review` stage output where the state machine writes it, using the same `buildChapterList` rule as publishing. **R5 skipped.** |
| `runs.progress` returns `{ stage, attemptNo }` | PR B | |
| `QUALITY_SPEC` / `qualityMetrics.rows` / long profile | PR B | |

## R1. `resolvedOptions`

Where: `runs.create` builds it with `buildResolvedOptions` (`run-pipeline/resolved-options.ts`) and stores it in `creationOptions.resolvedOptions` (added to `CreationOptionsSchema`). `runs.rerun` drops the source's copy and recomputes it against the channel's current profile (a long run's stored length counts as a pick only if the source said `from: 'run'`). No migration. `runs.get` returns it only when stored.

Real rows on the dev database (rows created through the same builder and the repository, never started, deleted afterwards; `runs.get` read back):

```
defaults      voice {alloy, Alloy, default}  visualSource {auto, Auto, default}  music {Auto, default}  targetSeconds {45, default}  short  formatKey null
onyx+ai+mood  voice {onyx, Onyx, run}        visualSource {ai-stills, AI images, run}  music {none, run}  targetSeconds {45, default}
format        formatKey countdown            targetSeconds {45, format}
```

Not done: three full pipeline runs. Writing happens in `runs.create`, which starts the pipeline and spends money; I did not start three paid runs for a field that is written before any stage runs. The values come from the resolver the pipeline uses, so they cannot differ from it, but nobody has compared them with a finished run's output.

## R2. `gateDecisions`

One entry per completed gate stage attempt, oldest first, same normalising as `lastGateDecision` (shared helper), plus `decidedBy`. A revise or reject followed by a new attempt shows both entries (the spec said "one entry per gate that was decided"; I read that as per decision, since collapsing them would hide the revise).

Real run `b3109735-f42d-4076-ae60-f9e0cb5b1ccf` on the dev database:

```json
"gateDecisions": [
  { "gate": 1, "outcome": "approve", "decidedAt": "2026-09-08T06:30:09.331Z", "decidedBy": "user" },
  { "gate": 2, "outcome": "reject", "reason": "dry-run test rejection reason", "decidedAt": "2026-09-08T07:00:03.650Z", "decidedBy": "user" },
  { "gate": 2, "outcome": "revise", "notes": "Please brighten the background and re-render.", "decidedAt": "2026-09-08T07:01:59.160Z", "decidedBy": "user" }
],
"lastGateDecision": { "gate": 2, "outcome": "revise", "notes": "...", "decidedAt": "2026-09-08T07:01:59.160Z" }
```

`lastGateDecision` is identical to before. **No run in the dev database has an auto-approve review log**, so `decidedBy: 'auto'` is covered by unit tests only, not by a real run.

## R3. `spentUsd` and `maxCostUsd`

`runs.get` returns `spentUsd` (always, 0 when nothing was booked) rounded to 4 decimals, and `maxCostUsd` when the run has one. Cross-check, run `6a51ed42-...` and two others:

```sql
select r.id, count(u.id) rows, coalesce(sum(u."costUsd"),0) from pipeline_runs r
join usage_events u on u."pipelineRunId" = r.id where r.id = '<run id>' group by r.id;
```

| run | SQL rows | SQL sum | `spentUsd` |
|---|---|---|---|
| b3109735-... | 8 | 0.0801 | 0.0801 |
| d7578b28-... | 5 | 0.0468 | 0.0468 |
| 6a51ed42-... | 16 | 0.1940 | 0.194 |

These runs span several attempts (revise, retry). `maxCostUsd` was checked in tests only; no real long run with a limit was read.

## Older runs (success criterion 2)

A run created before this change returns `runs.get` unchanged except for the new `spentUsd` (always present, as the spec types it as `number`). `resolvedOptions`, `maxCostUsd` are absent. **`gateDecisions` is present on older runs that decided a gate**, because it is derived from existing rows at read time; it is absent only if no gate was decided. That is additive and correct, but it is not "absent" for every old run.

## Tests added

- `run-pipeline/resolved-options.test.ts` (4): defaults, run picks, profile/channel/format sources, long run.
- `api/routers/runs.run-screen-data.test.ts` (9): older run unchanged; `spentUsd` rounding and `maxCostUsd`; `resolvedOptions` stored by `runs.create` (defaults, picks, long default length says `default`, format) and returned by `runs.get`; `deriveGateDecisions` (order, auto vs user, revise kept, pending skipped, absent); `lastGateDecision` still the latest only.
- `runs.long-form.test.ts`: its helper now ignores `resolvedOptions` so the existing "creates no creationOptions / stores only X" assertions still check what they meant to.

## Deviations and questions

- `resolvedOptions` is written in `runs.create`/`rerun`, not "when the run starts" (nothing at run start resolves it; see R0).
- Visual-source labels ("Stock footage", "AI images") are new wording; confirm with the app.
- When nothing decides the visual source or music, the value is `auto` / label `Auto` (the planner chooses later); the entry does not later learn what the planner picked.
- Schema: none. `SCHEMA.md` unchanged. `BUSINESS_LOGIC.md` updated.
