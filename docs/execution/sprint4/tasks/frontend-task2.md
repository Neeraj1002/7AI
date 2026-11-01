# Sprint 4 Frontend Task 2 (NEXT 1): Run, Inbox and Queue Redesign + Sprint 4 Polish

**Written**: 2026-10-11 by the architect chat, from the UI designer's hand-off of the same day. **Status**: not started. Picked up by the UI/UX code agent from this folder.

**Read `docs/execution/templates/TASK_TEMPLATE.md`, `UI_UX_AGENT_PROTOCOL.md` and the Definition of Done in `docs/execution/ui-ux/tasks/task5.md` before starting.** Hard rules apply: never push or merge to `main`, commit only to a branch you created, one worktree per session, record every branch in `docs/execution/sprint4/STATUS.md` (archived, see docs/ARCHIVE_INDEX.md) the moment it exists. This file states only this task's specifics. Rules shared by Frontend Tasks 2, 3 and 4 are in the "Shared rules" section below and are not repeated in Tasks 3 and 4.

**Objective**: replace the built Run, Inbox and Queue screens with the redesigned layouts and apply the Sprint 4 polish to the Gate 1 and Gate 2 cards. Frontend only; no backend change is needed to start or finish.
**Owning Component**: `app/` only. **Role**: `FE`, JS-only, OTA-eligible (fingerprint must match `main`).
**Depends On**: Frontend PR #53 (`SPRINT4_FE_E1`) merged. Nothing else. Four small backend additions (Sprint 4 Task 12, `task12.md`) improve the screens (table "Data the screens want"); each has a defined fallback, so none of them blocks this task.
**Branches** (two, independent, build in either order, each cut from fresh `origin/main` in its own worktree): `SPRINT4_FE_N1_RUN` (R1, R2, R5, R6: everything on the Run screen) and `SPRINT4_FE_N1_LISTS` (R3, R4: Inbox and Queue). One commit per requirement, `SPRINT4_FE_N1_RUN: R2 ...`.
**Duration**: 3 to 4 days.
**Success Criteria**: (1) every board listed in R1 to R6 has a phone screenshot beside it, taken on the founder's OnePlus after the OTA; (2) nothing outside the outlined parts of a board changed; (3) `tsc`, `expo lint` and the app tests (`cd studio && npx vitest run --root ../app`) pass; (4) no `package.json`, lockfile, `app.json` or native change.

## Design source (read-only)

Locked canvas "7AI Studio — Visual Directions": https://claude.ai/artifact/WUXyvHqAfazmsDNEBMnagG

- **Read-only.** Read boards from the link. Never edit, comment on, move or republish anything on it. Only the UI designer changes it, after the founder approves.
- Read the note at the top, "How to read this canvas", first.
- Do **not** use the "Future Screens" canvas (https://claude.ai/artifact/87DhbRqbeRmXi4qMfsLqHV) as a source. It holds ideas only.
- BUILT rows 1 to 6 are what the app shows today. Never change those boards and never build from them again.
- A NEXT board names the BUILT board it replaces. **Build only the outlined parts**: blue outline = new element, green outline = UX fix. Anything not outlined must already match the app. If it does not, write it in the report and leave it alone.
- Board data (names, numbers, format names) is sample data. Use real data.

## Shared rules (apply to Frontend Tasks 2, 3 and 4)

1. **Order is strict across the three tasks**: Task 2 (NEXT 1), then Task 3 (NEXT 2), then Task 4 (NEXT 3). Later boards draw on top of the earlier version of the same screen, so no screen is built twice. Inside one task the branches are independent.
2. **Never fake data.** If a field is not on `main`, use the fallback in the table of that task, or hide the element, and say which in the report. Never build against an unmerged backend branch.
3. **No second copy of backend rules.** Thresholds and targets shown in the app come from the backend response. If a number is not in the response, show the label and the measured value without a target.
4. **Copy**: use the strings on the boards. Where this doc gives a string, this doc wins over the board. Dynamic parts are written `{like this}`.
5. **Accessibility and size**: every tap target at least 44 px; at font scale 1.3 and above, or width below 340 px, settings tiles go to one column; Run tabs stay on one line.
6. **Loading, error and offline screens**: reuse the existing ones ("Can't reach the server", pull to refresh). No new design.
7. **Phone screenshot beside each board** is the Definition of Done. Code built but hidden behind a flag is reported "Built — hidden (flag X off)", never "Done".
8. **Report**: `docs/execution/sprint4/reports/frontend-task2.md`, one section per requirement, added as each PR lands. Send the founder a one-line status. Do not edit `STATUS.md` or `PENDING.md` beyond your own branch row; the architect owns them.

## R0. Read the code first

The architect could not read the app code from the chat. Before changing anything, open the real files and put a short table in the report: for each BUILT board this task replaces, whether the app matches it (**matches** or **differs: what**). Also find and name: the helper that turns an error into a plain sentence, the "Why didn't it work?" tag code, the `ClampedText` component (UI/UX task 5), the status-chip component, and the notification and `runs.list` queries the Inbox and Queue use today. Do not change differences; list them.

## Data the screens want (all optional, all with a fallback)

| Item | On `main` today | If missing, do this | Wanted from |
|---|---|---|---|
| B2 per-row quality flag | Yes. `runs.get` top-level `qualityMetrics.rows.<row> = { warn: boolean, message: string \| null }`; row keys `loudness, truePeak, videoCodec, videoProfile, pixelFormat, audioSampleRate, audioBitrate, longestShot, shotCount, captions`; a row is absent (not `false`) when not applicable (PR #64) | n/a. Colour a row amber only from `warn`. Never match message text to colour. | done |
| B3 settings the run actually used (voice, visuals, music, length, format) | No. `creationOptions` holds only what the user picked. | Tile shows the picked value, or "Channel default" when nothing was picked. Never invent "Onyx (default)". When `resolvedOptions` appears (`{ voice, visualSource, music, targetSeconds, videoKind, formatKey }`, each with `label` and `from: 'run' \| 'format' \| 'profile' \| 'channel' \| 'default'`), show the label, adding "(default)" when `from` is `channel` or `default`. | Task 12 R1 |
| B4 Gate 1 decision after Gate 2 | No. `lastGateDecision` holds only the latest gate. | Step history shows "Gate 1 · Done" with no "by you" wording. When `gateDecisions` (oldest first, each `{ gate, outcome, decidedBy: 'user' \| 'auto', … }`) appears, show "Approved by you", "Edited and approved", "Auto-approved". | Task 12 R2 |
| B5 spend per run | No (tenant `runs.get` has no cost). | Drop the sentence "Spent on this run: $x." from the Ended card. When `spentUsd` (number, USD) appears, show it. | Task 12 R3 |
| Targets for quality labels | No | See R6. When `qualityMetrics.spec` appears, print targets from it. | Task 12 R6 |

Build every element so it appears the moment the field is present (feature-detect the field; no flag, no second PR).

## R1. Run screen layout

Board **"Run screen — replaces BUILT 'Run detail' (published state) …"** (`R10Run`), replacing the built "Run detail" and "After Gate 2 — Published to YouTube" boards.

1. **Title first.** Until the run is published show the run's topic (the same `runTopic` line the Queue uses today). After publishing show the YouTube title. If the YouTube title is not on `runs.get`, keep the topic and report the gap.
2. **Status chip**: Gate 1 · approve script / Gate 2 · approve video / In progress / Needs attention / Published / Cancelled / Rejected / Failed.
3. **Settings tiles**: voice, visuals, music, length, format (see B3 in the table). One column below 340 px or at font scale 1.3 and above.
4. **Tabs**: Brief / Script / Video on one line. Long texts use `ClampedText` with "Show full brief" / "Show full script" / "Read full review" and "Show less".
5. **Step history with grouped attempts**, from the existing stage rows. A step done on a later attempt reads "Done on attempt 2 · attempt 1 failed" with an "{n} attempts ▼" pill that expands the attempts. Repeated failures read "Video made · failed {n} times · last: {plain reason}". The plain reason comes from the existing error-wording helper (R0). The raw error appears only behind the link "Technical details ›".
6. **Gate decisions in the history** use the B4 fallback rule.
7. **"Why didn't it work?" tags** (today's post-hoc tag): the backend keeps no fixed vocabulary, so the app owns the list. Map the tag keys the app sends today to plain labels. Any other stored value is shown as stored, capitalised. Do not add new tag choices.
8. "Run again", "Retry" and "Cancel" keep their built behaviour and flags.

## R2. Run states

Board **"Run screen — states on the new layout: Gate 1, Gate 2, In progress, Needs attention, Ended"** (`N1RunStates`; use the dashed state buttons on the board to see each state), replacing the built boards "Run detail — Gate 1", "Run detail — Gate 2", "Run — needs attention: Retry / Cancel" and "Ended — Rejected / Cancelled / Failed → Run again".

- **Needs attention.** Title "What went wrong". Text "{step} failed {n} times: {plain reason}." Helper "Retry runs this step again. Cancel stops the run; nothing is published." Link "Technical details ›".
- **Ended.** Title "You cancelled this run" / "You rejected this video" / "This run stopped" (from `endReason`: cancelled / rejected / failed or channel deleted). Text "Nothing was published." plus "Spent on this run: $x." only when B5 exists.
- **In progress.** Progress bar from `runs.progress`. `runs.progress` returns `{ stage, attemptNo }` and no percentage (Sprint 3 Task 11 left `pct` out on purpose), so show the stage name and attempt with an indeterminate bar. **Drop the "About 3 minutes left" text**; the backend gives no time estimate.
- **Gate 1 and Gate 2** keep the standard action bar from R5.

## R3. Inbox

Board **"Inbox — replaces BUILT Inbox · one card per run with step timeline"** (`R10Inbox`).

- Group notifications by run in the app (`threadKey` = run id). One card per run with a step timeline; sections "Needs you" and "Earlier". Step words: Approved / Waiting for you / Cancelled by you / Published. Button: "Review video" or "Review script".
- **Data**: reuse the `runs.list` data the Queue already loads (shared cache). Do **not** call `runs.get` once per card. A notification whose run is not in the loaded lists shows its title and button without a timeline. If R0 shows a batch fetch is needed, stop and ask the architect; do not add one call per card.
- The "Video · {n} min" chip is added next to the run title in Frontend Task 4, not here.
- Empty: "Nothing needs you right now." (same wording as the Queue's empty line).

## R4. Queue

Board **"Queue — replaces BUILT 'Queue + In progress' · search, channel filter, recent runs"** (`R10Queue`).

- Sections as drawn; "Recent runs" and "See all runs →". "See all runs" opens the existing "Ended runs" list (`runs.list` for `completed` and `failed`, 20 at a time with "Show more", built in the closure work). No new paging.
- Search placeholder "Search runs by topic". Search filters the runs already loaded; it does not call the backend.
- Channel filter as drawn.
- Nothing waiting: "✓ Nothing waiting on you · nothing in progress".
- Search with no results: "No runs match “{text}”." and a "Clear search" button.

## R5. Gate 1 polish

Board **"Gate 1 — replaces BUILT row 6 'Gate 1 — repeat-topic…' · real review clamp, Script card, standard action bar, 'Open that run ›'"** (`N_S4RunGate1Review`). Replaces the built "Gate 1 — repeat-topic, factual concerns, style violations, sources" board. Build only: the Script card, the real clamp on review text (`ClampedText` at the real text length), the standard action bar, and the repeat-topic link "Open that run ›" (opens the earlier run).

## R6. Gate 2 quality polish

Board **"Gate 2 quality — replaces BUILT row 6 'Gate 2 — quality checks' · plain labels + targets"** (`N_S4RunGate2Quality`). Replaces the built "Gate 2 — quality checks" board.

| Label | Source row | Target text |
|---|---|---|
| Volume | `loudness` | "target −14" |
| Loudest moment | `truePeak` | "−1.0 or lower" |
| Picture | resolution and fps | "1080×1920 · 30 fps" |
| Longest shot | `longestShot` | "4 s or less" |
| Captions | `captions` | Shorts only |

Rules:
- **Targets are app text only if the response carries them** (Shared rule 3). The numbers in the third column are today's Shorts values from the board. Read the real thresholds from the stage output; if they are not there, show the label and the measured value only, and report it. Sprint 4 Task 12 R6 adds `qualityMetrics.spec` and removes this gap.
- Rows with no label above (`videoCodec`, `videoProfile`, `pixelFormat`, `audioSampleRate`, `audioBitrate`, `shotCount`) go under one collapsed link "Technical details ›". The link gets an amber dot when any of them has `warn: true`.
- Row icons: green ✓ inside spec, red ✕ hard failure (already blocks the run server-side), amber ! from `warn: true`. Colour from the flag only.
- Card hidden when `qualityMetrics` is absent (older runs). The long-video variant (Length row, other targets) is Frontend Task 4.

## Verify

Per board: phone screenshot beside it (Definition of Done). Real API checks: Inbox and Queue open without extra per-card calls (state the network call count in the report); a Needs-attention run shows the plain reason with the raw error only behind "Technical details ›"; a run with two attempts shows the grouped pill; a Gate 2 run with `qualityMetrics` colours rows from `warn` only; Queue search filters without a network call.

## Report

`docs/execution/sprint4/reports/frontend-task2.md`: the R0 table first, then one section per requirement with the screenshot reference, then "Differences found, not changed" and "Fallbacks in use" (which rows of the Data table were missing).
