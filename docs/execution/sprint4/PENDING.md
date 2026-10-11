# Sprint 4: what is still pending

**Written: 2026-10-11, updated 2026-10-11 (app redesign tasks and Task 12 added).** One page for the frontend agent and the founder. The architect owns it. Task and report docs stay as they are; this page only lists what is left.

## Order of work: parallel lanes, nothing waits

All lanes start now. The only merge rule is Task 9 PR B before Task 10; everything else merges in any order, and whoever merges second merges `main` and resolves conflicts.

| Lane | Who | Work | Notes |
|---|---|---|---|
| A | Backend agent 1 | Task 9 PR A (API contract, small, ships first), then PR B (pipeline) | PR A gives everyone real types within hours |
| B | Backend agent 2 | Task 11: image model move | Owns model, price table, cost from usage. Task 9 owns the `size` plumbing. |
| C | Backend agent 3 | Task 10: quality, preview, publishing | Builds on Task 9's shapes with fixtures, merges after Task 9 PR B |
| D | Backend agent | Script Review rules SR-1 to SR-9 | Independent; task doc still to be written |
| E | Frontend agent | PR #53 (E1 to E6 as the row-6 boards show them; report in, ready to merge). Then, in this order: Frontend Task 2 (Run, Inbox, Queue redesign, `frontend-task2.md`), Frontend Task 3 (formats per channel, `frontend-task3.md`, needs Task 9 PR A), Frontend Task 4 (long-form in the app, `frontend-task4.md`, after Tasks 9 and 10 merge) | Order is fixed because later boards draw on the earlier version of the same screen. Each task has a fallback for every optional field, so none waits on the backend |
| F | UI designer | Boards are locked on the canvas (BUILT rows 1 to 6, NEXT 1 to 3). Next: record the 4 differences the app kept in PR #53 (seconds per still 1 to 10, text fields for category and language, fact policy as a two-option picker, format chips wrapping), with the founder's approval | |
| G | Backend agent 4 | Sprint 4 Task 12, Run Screen Data (`task12.md`): PR A (`resolvedOptions`, `gateDecisions`, `spentUsd`), PR B (image count, chapter warning, quality targets and Length row; merges after Tasks 9 and 10) | Independent; the app has a fallback for each field |

Deploy: PR #49 and PR #64 now. Later work deploys as it merges. Back up the database first for any deploy that includes a migration.

## Frontend: what to build, and what the backend now gives you

Wait for PR #49 to be on `main`, then merge `main` into `SPRINT4_FE_E1`. Do not fake any data.

| Frontend item | Needs from the backend (PR #49) |
|---|---|
| E1 Gate 2 Quality checks card (already built) | `qualityMetrics` (Task 8, already on `main`) |
| E2 to E5 (see `frontend-task1.md`) | Channel profiles (`channels.createProfileVersion`, `listProfileVersions`, `getActiveProfile`), formats (`channels.listFormats`, `runs.create` `formatKey`), script side (`runs.get` returns `scriptReview` with concerns, violations, sources), approver identity (`review_logs.approvedByUserId`) |
| E6 repeat-topic warning | `runs.get` returns `scriptReview.repeatTopic` (change B16, stored on the intake stage output) |
| Comparison screen (`compare.tsx`) | `dashboard.comparison` API |

**Update 2026-10-11 (founder decision): formats a channel offers. This is now Frontend Task 3 (`frontend-task3.md`), not part of PR #53.** PR #53 builds E4 and E5 as the row-6 boards show them (all 9 formats) and merges without waiting for Task 9 PR A. The notes below are the data contract; `frontend-task3.md` has the screens.
- Content profile screen (E5): a new "Formats" section with a checkbox list of all formats, grouped under "Shorts" and "Video", data from `channels.listFormats()` (no `channelId`). Helper text "Pick 2 to 4 formats this channel uses." Saved as `offeredFormatKeys: string[]` in the profile through `channels.createProfileVersion`. Nothing selected is allowed.
- New brief format picker (E4): the "two recent formats" chips and the "More formats" sheet of all 9 are replaced. The chips row is **Freeform (default)** plus the channel's offered formats that match the chosen Type, from `channels.listFormats({ channelId, videoKind })`. If the channel offers none for that Type, only Freeform shows. Picking a format still replaces the placeholder, shows its structure and disables Length with the format's length; Freeform still sends no `formatKey`.
- Needs Sprint 4 Task 9 PR A (it contains R1b) on `main`. PR A is small and ships first. Built in Frontend Task 3.

Rules for the app: no `package.json`, lockfile, `app.json` or native changes. Run `tsc`, `expo lint`, and the app tests with `cd studio && npx vitest run --root ../app`. Do not match warning text to colour rows.

## Frontend: app redesign after PR #53 (boards locked 2026-10-11)

Canvas "7AI Studio — Visual Directions": BUILT rows 1 to 6 are never changed; NEXT 1, 2, 3 are built strictly in that order. Tasks: `frontend-task2.md` (NEXT 1), `frontend-task3.md` (NEXT 2), `frontend-task4.md` (NEXT 3). Data the screens want but `main` lacks is in `task12.md`; until it lands the app uses the fallbacks written in each task.

## Frontend: still open on E1

- Longest single shot row: stays green until the backend flag below exists. Then colour it from the flag (amber when flagged).
- Founder: publish the OTA with `eas update --branch preview`, then check Gate 2 on run `75f69faa…` or `dc2062a2…` on the tenant account and place the screenshot beside the board. E1 is Done only after that.

## Backend: still to do

| Item | State |
|---|---|
| Conflicts on PR #49 | Backend agent merges `origin/main`, keeps the Approve-screen fix (PR #63 cancel guard) and the Task 12 behaviour, runs tsc, eslint and the full tests. |
| Per-row warning flag for quality checks (longest shot first) | Done (PR #64). |
| Run screen data: `resolvedOptions`, `gateDecisions`, `spentUsd`, image count, chapter warning, quality targets, Length row | Sprint 4 Task 12 (`task12.md`), two PRs. |
| Real end-to-end check of `runs.create` with a valid `formatKey` or `sources` | Not done: it starts the paid pipeline. Do one real run on preview after deploy. |
| Real YouTube upload check | Upload body was checked only against a mocked Google layer. |
| Script length check with `ffprobe` | Used word-count estimates only. Measure real audio length on preview. |
| Migrations on preview | 2 new migrations run at deploy. Nothing was run on the preview VPS yet. |
| Git-ignored render scratch from Task 3 in `studio/data/` | Founder deletes it. |

## Decisions made (2026-10-11)

- Scripts for channels with no profile aim for about 45 seconds. Accepted. A channel profile can override it.
- Every upload sends "not made for kids" (`selfDeclaredMadeForKids: false`). Before, the field was not sent. All current channels are not made for kids, so this is correct. A per-channel setting is a later Sprint 4 item.
- `AI_VISUALS_SAFETY_NEGATIVES_ENABLED` stays off. The image model mostly ignored it, and each trigger costs an extra regeneration.
- Review concerns are read from `scriptReview`, not from the ReviewLog rationale.
- Longest-shot colour comes from a backend per-row flag, not from the app.
- Each channel's Content profile lists the formats it offers (2 to 4 recommended). New brief shows those that match the chosen Type, plus Freeform. A channel with no list shows only Freeform. Backend: Task 9 R1b. App: E4 and E5 as updated above.

- Failed cost estimate on the long-video brief disables Create run (Frontend Task 4). Shorts are never blocked.
- No "Reconnect to upload" button for subtitles: the app shows the server's message and the .srt download. The founder reconnects the channel himself after Task 10 merges.
- PR #53 differences accepted: seconds per still 1 to 10 (schema), category and language as text fields, safety-negatives line hidden while the setting is off, fact policy as a two-option picker, format chips wrap.
- Progress for long videos shows an image count, never a percentage or time left (`runs.progress` has no percentage).

## Founder items carried over from Task 8

Image-cost budget ceilings; the 5-images-per-minute limit. (Real licensed music beds are already added.)
