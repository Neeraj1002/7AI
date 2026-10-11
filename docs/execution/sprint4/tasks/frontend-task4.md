# Sprint 4 Frontend Task 4 (NEXT 3): Long-Form Video in the App

**Written**: 2026-10-11 by the architect chat, from the UI designer's hand-off of the same day. **Status**: not started. Picked up by the UI/UX code agent from this folder.

**Read `docs/execution/templates/TASK_TEMPLATE.md`, `UI_UX_AGENT_PROTOCOL.md` and the Definition of Done first, then the "Design source (read-only)" and "Shared rules" sections of `frontend-task2.md`; they apply here unchanged.** Hard rules apply (never push or merge to `main`, one worktree per session, record every branch in `docs/execution/sprint4/STATUS.md` when created).

**Objective**: let the founder create, review and publish a long-form video (16:9, 2 to 15 minutes) from the app: the Type field and cost controls on New brief, chapters at Gate 1, a landscape preview at Gate 2, progress while it renders, subtitles on the published screen, and long videos in Queue, Inbox and Compare.
**Owning Component**: `app/` only. **Role**: `FE`, JS-only, OTA-eligible.
**Depends On**: Frontend Task 3 merged (strict order) and **Sprint 4 Tasks 9 (PR A and PR B) and 10 merged on `main`**. Check `docs/execution/sprint4/STATUS.md`. Build against real responses only. A few optional fields (table below, from Sprint 4 Task 12) have fallbacks so a missing one never blocks.
**Branches** (independent, each cut from fresh `origin/main` in its own worktree): `SPRINT4_FE_N3_BRIEF` (R1), `SPRINT4_FE_N3_RUN` (R2, R5), `SPRINT4_FE_N3_LISTS` (R3, R4). One commit per requirement.
**Duration**: 3 to 4 days.
**Success Criteria**: (1) a phone screenshot beside every board below; (2) one real 2-minute long video created from the app reaches Gate 2 and plays its preview on the phone (the founder supplies the facts brief; report the cost shown before and the actual cost after); (3) a Shorts run is unchanged (same request body as before: no `videoKind`, no `maxCostUsd`); (4) `tsc`, `expo lint` and app tests pass; no `package.json`, lockfile, `app.json` or native change.

**Design rule (founder, 2026-10-11): every long-form video is published publicly on a real channel.** Nothing in the UI may hide a quality warning, a budget stop or a subtitle failure.

## Data (Task 9 PR A/B, Task 10; verify names in R0)

| Need | Name |
|---|---|
| Create | `runs.create` gains `videoKind: 'long'`, `targetDurationSec` (whole minutes x 60, 120..900), optional `maxCostUsd`. For Shorts send none of these. |
| Estimate | `runs.estimateCost({ channelId, videoKind, targetDurationSec, options? })` → `{ estimateUsd, worstCaseUsd, suggestedMaxUsd, remainingWeeklyUsd }` |
| Formats | `channels.listFormats({ channelId, videoKind })` |
| Run | `runs.get`: `videoKind`, `targetSeconds`, `chapters` (`{ title, startSec }[]` once rendered; the script output has `{ title, text }[]`), `previewUrl`, `videoUrl`, `subtitlesUrl`, `subtitlesUploaded`, `subtitlesMessage?`. For a Short these fields are absent. |
| Progress | `runs.progress({ runId })` → `{ stage, attemptNo }` |
| Compare | `dashboard.comparison` with optional `videoKind` filter and per-row `videoKind` (Task 10 R6) |

Optional fields (build the element so it appears the moment the field is present; otherwise use the fallback):

| Item | If missing, do this |
|---|---|
| B1 image count: `runs.progress` gains `{ done, total }` for the image stage (Task 12 R4) | Show "Generating images…" with an indeterminate bar. There is no percentage in `runs.progress` today (Sprint 3 left `pct` out on purpose), so do not show one. |
| Chapter warning: `runs.get.chapterWarning?: string` (Task 12 R5) | Hide the amber line. Do not recompute the rule in the app. When present, the line reads "Chapters won't be added to the description: {chapterWarning}." |
| Length row: `qualityMetrics.rows.duration` for long videos (Task 12 R6) | Hide the Length row. |
| Quality targets: `qualityMetrics.spec` (Task 12 R6) | Label and measured value only (Frontend Task 2 R6). |

## R0. Read the code first

Table in the report: each BUILT board this task replaces or builds on, **matches** or **differs: what** (see Frontend Task 2 R0). Confirm the exact request and response names above against `main` and list any difference.

## R1. New brief: Type, Length, cost

Boards **"New brief — Type field added (Shorts) · base: NEXT 2 New brief"** (`LFBriefShorts`), **"New brief — Type: Video (valid)"** (`LFBriefVideo`), **"New brief — Video error states"** (`LFBriefVideoErrors`), **"New brief — Video with a format (Length disabled)"** (`LFBriefVideoFormat`). Base is the NEXT 2 version of New brief (Frontend Task 3).

1. **Type** is the first dropdown: Shorts | Video. Helper for Shorts: "Vertical 9:16, up to 60 seconds." For Video: "Landscape 16:9, 2 to 15 minutes. Takes 25 to 45 minutes to make." Changing Type refetches the format chips with the matching `videoKind` and resets a chosen format that does not match.
2. **Shorts: unchanged** except the Type field. No cost block, no max-spend field. The request body is exactly as before.
3. **Video: visuals** are AI images only; the Visuals control is locked with "Stock footage isn't available for videos."
4. **Video: Length**: a dropdown 5 / 10 / 15 min plus a free field for any whole number of minutes from 2 to 15. Helper: "Pick 5, 10 or 15 min, or type any whole number of minutes from 2 to 15." Error: "Enter 2 to 15 minutes." Sent as `targetDurationSec` = minutes x 60. With a format chosen the control is disabled: "Length: 10 min (from format). Pick Freeform to choose your own."
5. **Cost block (Video only).** Calls `runs.estimateCost` on every change of Type, Length, format or channel, at most once every 500 ms. While loading it shows "Estimating…" and Create waits.
   - Normal: "Estimated cost ${estimateUsd}". Helper: "Up to ${worstCaseUsd} if the video has to be made again. ${remainingWeeklyUsd} left this week for this channel."
   - **Max spend** field, default `suggestedMaxUsd`, editable. If the user has not edited it, it follows each new suggestion; once edited, it stays and is re-validated. Helper: "Suggested from the estimate. If the run reaches this, it stops and asks you." Error when below the estimate: "Must be at least ${estimateUsd}, the estimate for one attempt." Sent as `maxCostUsd`.
   - Weekly budget error (when `estimateUsd` is more than `remainingWeeklyUsd`): card titled "Not enough weekly budget", text "Estimated ${estimateUsd} for this video, ${remainingWeeklyUsd} left this week for this channel. Pick a shorter length or wait for next week's budget."
   - **Estimate fails**: "Couldn't estimate the cost. Try again." with a Retry button; **Create run stays disabled** for Video (founder decision 2026-10-11). Shorts are never blocked by this.
6. **Create run** is disabled (grey) whenever any field is red, with "Fix the items in red to continue." above it.
7. **Server errors**: a `BAD_REQUEST` from `runs.create` (for example "Video length must be a whole number of minutes from 2 to 15", the spend-limit message, or the weekly-budget message) shows under the field it belongs to, or above Create run when it belongs to none. Show the server's words.

## R2. Run screen: long-video states

Board **"Run screen — long video on the new layout: Gate 1 (chapters), Gate 2 (landscape), In progress, Published"** (`N3RunLongStates`; use the dashed state buttons). It sits on the Frontend Task 2 Run layout.

1. **Chip** "Video · {n} min" next to the run title (the same chip as the Queue row), from `videoKind` and `targetSeconds`.
2. **Gate 1 (chapters).** The script shows chapter blocks. **Edit** opens the sheet with chapters written as `## Title` lines followed by the chapter text (Task 9 R2.5). If the server rejects the edit (fewer than 3 chapters) show its message inside the edit sheet and keep the sheet open. No board exists for this sheet; reuse the built edit sheet.
3. **Gate 2 (landscape).** A 16:9 player plays `previewUrl` (the 720p copy). The full `videoUrl` is not played in the app. Preview does not load: "The preview couldn't load. Try again." with Retry; **Approve and Reject still work.** The chapter warning line is in the Data table (amber: "Chapters won't be added to the description: {reason}.").
4. **Gate 2 quality card, long variant** (Frontend Task 2 R6 layout): Picture "1920×1080 · 30 fps"; Longest shot "up to 1.5 × seconds per still"; a **Length** row ("target mm:ss") when the backend sends it; **no Captions row** (the row is absent for long runs). Targets only as the response carries them (Data table).
5. **In progress.** "Generating images {done} of {total}" when B1 exists, otherwise "Generating images…" with an indeterminate bar. Text under it: "Long videos take 25 to 45 minutes. You can leave the app; you'll get a notification at Gate 2." No time-left estimate.
6. **Published, with subtitles.** Chip "✓ Uploaded" when `subtitlesUploaded` is true, "! Not uploaded" when false. When false, show `subtitlesMessage` **exactly as the server sends it**. **Do not build a "Reconnect to upload" button**: founder decision 2026-10-11, the founder reconnects the channel himself once after Task 10 merges. If the board shows that button, leave it out and list it under "Differences found, not changed". The row "↓ Subtitles (.srt)" (from `subtitlesUrl`) is shown for every long-form video, uploaded or not.
7. Large text: tiles and tabs follow Shared rule 5.

## R3. Queue: long-video row

Board **"Queue — long-video row on the NEXT 1 Queue layout"** (`N3QueueLong`). Rows for long runs carry the chip "Video · {n} min" and, while in progress, the stage line from `runs.progress` (with the image count when it exists). Search and filters from Frontend Task 2 keep working on these rows.

## R4. Inbox: chip

Not drawn on any board. Add the same "Video · {n} min" chip next to the run title on Inbox cards for long runs. No other change.

## R5. Compare: Shorts / Videos switch

Board **"Compare — replaces BUILT row 6 Compare · Shorts / Videos switch"** (`N_S4Compare`), replacing "Compare channels × formats". A Shorts / Videos switch above the channel cards calls `dashboard.comparison` with the matching `videoKind`. Never mix Shorts and Video numbers in one figure. Video shows the long-form metrics the response carries (average view duration, average percentage viewed, and so on); show only fields that are present. Empty states as built ("No published videos yet").

## Verify

Phone screenshot beside each board. Real checks: create one 2-minute video from the app on the phone-verified channel (the founder supplies the facts brief) and record the estimate shown, the final cost, and whether Gate 2 played the preview; a request log or test showing a Shorts body without `videoKind` or `maxCostUsd`; each error string in R1 produced from a real or mocked response; a published video with a failed subtitle upload shows the server message and still offers the .srt download.

## Report

`docs/execution/sprint4/reports/frontend-task4.md`: R0 table, one section per requirement with screenshot reference, "Differences found, not changed", "Fallbacks in use" (which optional fields were missing), and the measured estimate versus actual cost.
