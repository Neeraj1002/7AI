# Sprint 4 Frontend Task 4 (NEXT 3): Long-Form Video in the App, report

**Date**: 2026-10-13. **Spec**: `tasks/frontend-task4.md`. **Role**: FE, JS-only (no `package.json`, lockfile, `app.json` or native change).
**Status**: code complete for R1 to R5 and R2 point 8; checked in the browser pane against a mock API. **The Definition of Done is not met yet**: no phone screenshots from the OnePlus, and the real 2-minute video (Success Criterion 2) was not made. See "Not done".

## Branches and PRs

All cut from fresh `origin/main` on 2026-10-13 (Tasks 9 PR A/B, 10, 11, 12 A/B and Frontend 2 and 3 are on `main`). One worktree, one branch after the other: `D:\Study Material\7AI-UI-N3`.

| Branch | Holds | Note |
|---|---|---|
| `SPRINT4_FE_N2B_FIELDS` (PR #79) | Small PR first: the Frontend 2 fallbacks replaced by the real Task 12 fields | Merge before `_RUN` (it is the base of that branch). |
| `SPRINT4_FE_N3_BRIEF` | R1 | This report lives here only, so the three PRs do not conflict on it. |
| `SPRINT4_FE_N3_RUN` | R2 (with point 8, "Raise the spend limit") and R5 (Compare; the task doc puts R5 on this branch) | Task doc updated in the R2 commit. |
| `SPRINT4_FE_N3_LISTS` | R3 and R4 | Shares `VideoChip.tsx` and `lib/long-video.ts` byte for byte with `_RUN`, so merging both gives no conflict. |

I re-cut `SPRINT4_FE_N3_BRIEF` once (it was first pushed stacked on `SPRINT4_FE_N2` before you said everything was merged) and force-pushed it with `--force-with-lease`; nobody else had committed to it.

## R0. Read the code first

Backend names, confirmed against `main` (`studio/src/api/routers/runs.ts`, `dashboard.ts`, `long-form/run-fields.ts`):

| Item in the task | On `main` | Result |
|---|---|---|
| `runs.create` `videoKind`, `targetDurationSec`, `maxCostUsd` | yes; `maxCostUsd` on a Short is `BAD_REQUEST`; stock footage on a long video is `BAD_REQUEST` | matches |
| `runs.estimateCost({ channelId, videoKind, targetDurationSec, options? })` | yes; returns the four numbers; throws `BAD_REQUEST` "No weekly budget is configured for this account" | matches. It takes no `formatKey`, so with a format the app asks for the format's own `targetSeconds`. |
| `channels.listFormats({ channelId, videoKind })` | yes | matches |
| `runs.get` input | `{ id }` (not `runId`) | differs: name only |
| `runs.get` `videoKind`, `targetSeconds`, `chapters`, `previewUrl`, `videoUrl`, `subtitlesUrl`, `subtitlesUploaded`, `subtitlesMessage`, `scriptEditText`, `spentUsd`, `maxCostUsd`, `resolvedOptions`, `gateDecisions`, `qualityMetrics.spec`, `rows.duration` | yes | matches |
| `runs.get.chapterWarning` | sent at runtime (Task 10), **but not in the declared response type** (`LongFormRunFields` omits it) | differs: read through `chapterWarningOf()` in `server-extras.ts`. Suggest adding it to the type. |
| `runs.progress({ runId })` `{ stage, attemptNo }` plus `{ done, total }` while stills are made | yes | matches |
| `runs.retry({ runId, maxCostUsd? })` | yes; `BAD_REQUEST` for a Short or above `LONGFORM_MAX_RUN_USD_LIMIT` | matches |
| `dashboard.comparison({ videoKind? })` | yes; per-row `videoKind` | matches. **Totals carry views, likes, comments only: no average view duration or percentage viewed**, so the Videos view shows only what exists (nothing invented). |
| Media links | `previewUrl` / `videoUrl` / `subtitlesUrl` are signed storage links when R2 is configured, otherwise relative `/runs/:id/preview` paths that need the session token | handled by `mediaLink()` (signed links get no Authorization header; API paths get the base URL and the token). **Limit**: the `.srt` row opens the link with `Linking.openURL`, which cannot send a header, so on a server without R2 the download would be refused. Fine for production (R2 on). |

Boards against the app (each BUILT board this task replaces or builds on):

| Board | Result |
|---|---|
| New brief, Shorts (`LFBriefShorts`) | **differs**: the board lists Options as Voice, Visuals, Music, Length and has a sticky Create bar; the app (Frontend 3) has Length first and Create inline, and keeps the Sources section the board does not draw. Not changed for Shorts. For Video I followed the board's order (Voice, Visuals, Music, Length, cost). |
| New brief, Video / errors / with format | matches after R1 (see R1). |
| Run, `N3RunLongStates` | **differs**: the board's Review card reads "8/10 · passed"; the app's Gate 1 review card is the Frontend 2 version (score bar). Not outlined, left alone. Board "Music: Calm (default)": the app shows the server's label "Calm" exactly (founder rule), no "(default)". |
| Queue, `N3QueueLong` | **differs**: the board's stage line ends "· 18m"; the app keeps its own meta line (stage, channel, started). Only the chip and the image count were added, as the board's note says. |
| Compare, `N_S4Compare` | **differs**: column headers are upper case in the app (`FORMAT / VIDEOS / AVG VIEWS`), "Format / Videos / Avg views" on the board. Not outlined, left alone. |
| Inbox | not drawn; chip added as the task says. |

## R1. New brief: Type, Length, cost (`SPRINT4_FE_N3_BRIEF`)

New: `lib/long-brief.ts` (rules and copy), `components/DropdownField.tsx`, `components/CostBlock.tsx`, `lib/use-debounced-value.ts`; `new-brief.tsx` edited; `PrimaryButton` got an optional `labelStyle`.

- **Type** is the first dropdown after Channel (Shorts | Video) with the two helpers from the spec. Changing Type refetches `listFormats` with the new `videoKind` and clears a chosen format.
- **Shorts unchanged** apart from the Type field: no cost block, no max-spend field. Checked: the mock logged `create` input `{"channelId":"…","briefText":"30 sec on why octopuses have three hearts"}`, no `videoKind`, no `maxCostUsd`, and no `estimateCost` call. Unit test `a Short adds nothing to the request body` covers it too.
- **Video**: Visuals locked to "AI images" with "Stock footage isn't available for videos." (no `visualSource` is sent). Length dropdown 5 / 10 / 15 / Custom plus a minutes field (2 to 15 whole minutes, "Enter 2 to 15 minutes."), sent as minutes x 60. With a format the control is disabled and reads "Length: 10 min (from format). Pick Freeform to choose your own."; no `targetDurationSec` is sent then (the server takes it from the format).
- **Cost block**: `runs.estimateCost` is asked once 500 ms after Type, Length, format or channel stop changing ("Estimating…" meanwhile, Create waits). Normal card, weekly-budget card ("Not enough weekly budget"), Max spend (follows the suggestion until edited, then stays and is re-validated: "Must be at least $2.10, the estimate for one attempt."), estimate failed ("Couldn't estimate the cost. Try again." + Retry; Create stays disabled for Video).
- **Create run** is grey with "Fix the items in red to continue." when anything is red.
- **Server errors** show under their field in the server's words (spend limit under Max spend, weekly budget under the cost card, length under Length), otherwise above Create run. Where an error goes is chosen by `placeServerError()`; the words are never rewritten. Note: this is the one place text is matched, only to pick the position (the backend gives no field name on `BAD_REQUEST`).
- Extra: "Edit brief & run again" on a long run now passes `videoKind=long` (R2 commit) so it opens as a Video, not a Short.
- Tests: `lib/long-brief.test.ts` (8 tests).

Screenshots (web renders at 390 px, beside the boards): `frontend-task4/r1-brief-shorts.jpg` (LFBriefShorts), `r1-brief-video-valid.jpg` (LFBriefVideo), `r1-brief-video-length-error.jpg`, `r1-brief-video-errors.jpg` (LFBriefVideoErrors: weekly budget + max spend), `r1-brief-video-estimate-failed.jpg`, `r1-brief-video-server-error.jpg`, `r1-brief-video-format.jpg` (LFBriefVideoFormat). The mock logged a Video create of `{"videoKind":"long","targetDurationSec":720,"maxCostUsd":4}` for 12 min and $4.00.

## R2. Run screen: long-video states (`SPRINT4_FE_N3_RUN`)

New: `VideoChip`, `LongPreview`, `SubtitlesCard`, `RaiseLimitSheet`, `lib/long-video.ts`; `run/[id].tsx`, `RunStateCards`, `GateActionBar`, `quality-checks.ts`, `use-video-source.ts` edited.

1. **Chip** "Video · {n} min" under the run title (same component as Queue and Inbox).
2. **Gate 1 chapters**: Script tab shows "~words · ~n min · n chapters" and chapter blocks (first two, then "Show full script"). Edit opens the existing sheet with `scriptEditText` (`## Title` lines). A server rejection stays inside the sheet and the sheet stays open (mock rejected a 2-chapter edit with the real wording shape). Screenshots: `r2-gate1-chapters.jpg`, `r2-gate1-edit-rejected.jpg`.
3. **Gate 2 landscape**: 16:9 player on `previewUrl` only (the full `videoUrl` is never loaded), chapter list with times under it (tap seeks). Load failure: "The preview couldn't load. Try again." + Retry (re-fetches); Approve and Reject stay in the action bar. Chapter warning: amber "Chapters won't be added to the description: {chapterWarning}." Screenshots: `r2-gate2-landscape-player.jpg`, `r2-gate2-preview-failed.jpg`, `r2-gate2-quality-long.jpg`.
4. **Quality card, long**: Picture 1920×1080 · 30 fps, Longest shot, and the **Length** row (`rows.duration`, "10:02 / target 10:00") only when the server sends it; no Captions row (the server omits it). Targets come from `qualityMetrics.spec`. While checking I fixed a rounding bug in my own earlier code: the longest-shot target was rounded to whole seconds ("8 s or less" for 7.5); it now reads "up to 7.5 s" as on the board (also changes Shorts wording from "4 s or less" to "up to 4 s").
5. **In progress**: "Generating images {done} of {total}" with a real bar when `runs.progress` sends counts, else "Generating images…" with the indeterminate bar (no percentage); the 25 to 45 minute note under it; no time estimate. Screenshot: `r2-in-progress-count.jpg`. The fallback was confirmed with the mock switched to no counts.
6. **Published**: Subtitles card with "✓ Uploaded" / "! Not uploaded"; the server's `subtitlesMessage` exactly as sent; the "↓ Subtitles (.srt)" row for every long video. No "Reconnect to upload" button (see below). The Video tab opens by default on a published long run and plays the preview. Screenshot: `r2-published-subtitles-failed.jpg`.
7. Tiles and tabs untouched (Frontend 2 rules still hold).
8. **Raise the spend limit** (added to the task doc in the same commit): a long run in `needs_attention` with `spentUsd >= maxCostUsd` (both present) opens the sheet instead of retrying; title, text, empty money field (must be above `spentUsd`), "Continue" calls `runs.retry({ runId, maxCostUsd })`, "Cancel run" opens the existing cancel confirmation; a server error shows under the field in its words. Detected from the two numbers only. `spentUsd` of 0 is "Nothing booked for this run." (never "$0 spent"), and 0 can never trigger the sheet. No prefill (I did not call `runs.estimateCost` for one). Checked: sheet opens; a rejection ("The spend limit cannot be more than $10.00 per video") showed under the field; Continue sent `retry` with `maxCostUsd`; the sheet closed on success; **a Short's Retry sent `{"runId":…}` only and opened no sheet**. Screenshots: `r2-raise-spend-limit-sheet.jpg`, `r2-raise-spend-limit-server-error.jpg`, `r2-short-retry-unchanged.jpg`.
- Also: `resolvedOptions` labels show exactly as sent, no "(default)" suffix. This reverses the Frontend 2 B3 wording and was done in PR #79 (`SPRINT4_FE_N2B_FIELDS`).
- Tests: `lib/long-video.test.ts` (6), a Length-row test in `quality-checks.test.ts`.

## R3. Queue (`SPRINT4_FE_N3_LISTS`)

Long rows carry the black chip in every section (waiting, needs attention, in progress, recent); an in-progress long row shows "Generating images {done} of {total}" and a bar that follows the count (one `runs.progress` call per long in-progress row, polled with the Queue; Shorts rows make none). Without a count it keeps the normal stage line. Search and channel filters are untouched. Chip data comes from the row's `creationOptions` (`lib/run-video.ts`, tested). Screenshot: `r3-queue-long-row.jpg`.

## R4. Inbox

Same chip next to the run title on Inbox cards for long runs, nothing else. Screenshot: `r4-inbox-chip.jpg`.

## R5. Compare (`SPRINT4_FE_N3_RUN`)

Shorts / Videos switch above the channel cards; `dashboard.comparison({ videoKind })` is called with the chosen kind, so the two are never mixed. Videos shows views, avg per video and videos (and the format rows) because that is all the response carries. Empty state "No published videos yet" as built. Screenshots: `r5-compare-shorts.jpg`, `r5-compare-videos.jpg`.

## Differences found, not changed

- Board option order and sticky Create bar on New brief (Shorts), Sources section not drawn (see R0).
- Board "Reconnect to upload" button on the Published board: **left out** (founder decision 2026-10-11).
- Board's "(default)" suffix on Music/Voice tiles: not shown, labels exactly as the server sends them.
- Queue stage line has no "· 18m"; Compare headers upper case; Gate 1 review card wording (see R0).
- `chapterWarning` missing from the declared `runs.get` type; `dashboard.comparison` has no long-form watch metrics; `.srt` link needs R2 (see R0).
- `studio` `tsc` in the shared `node_modules` reports two missing modules (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, added by Task 10); that is the checkout's `node_modules`, not the app. The app itself type-checks clean.

## Fallbacks in use

| Optional field | State on `main` | In use? |
|---|---|---|
| `runs.progress` `{ done, total }` | present | no (fallback only if absent: "Generating images…" + indeterminate bar, checked with the mock) |
| `chapterWarning` | present at runtime, absent from the type | read defensively; hidden when absent |
| `qualityMetrics.rows.duration` | present for long | Length row hidden when absent (tested) |
| `qualityMetrics.spec` | present | targets shown; label and value only if absent |
| `maxCostUsd` / `spentUsd` | present | **plain Retry whenever either is missing** (tested: `needsHigherLimit`) |
| Long-form watch metrics on Compare | **not in the response** | none shown |

## Not done

- **Phone screenshots from the OnePlus after the OTA** (the Definition of Done). Everything above is a web render at 390 px in the Browser pane against a throw-away mock tRPC server kept outside the repo. The mock proves the app's behaviour and the wire payloads, not the server's.
- **Success Criterion 2**: one real 2-minute video created from the app on the phone-verified channel (needs the founder's facts brief and a real run), with the estimate shown, the final cost, and whether Gate 2 played the preview. **Measured estimate versus actual cost: not measured.** The numbers on the screenshots ($2.10, $2.52) are the mock's.
- Real-device behaviour of `expo-video` (the preview player's `error` status and chapter seeking were exercised on web only; on web, load failure is detected by a 20 s timeout because the file is fetched first).

## Test results

```
cd app: npx tsc --noEmit        -> only the 2 @aws-sdk errors above (studio node_modules), none in app code
cd app: npx expo lint           -> clean
cd studio && npx vitest run --root ../app -> all pass on each branch (BRIEF 71 tests, RUN 70, LISTS 71; each branch holds only its own tests)
```
