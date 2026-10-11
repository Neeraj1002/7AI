# Sprint 4: what is still pending

**Written: 2026-10-11.** One page for the frontend agent and the founder. The architect owns it. Task and report docs stay as they are; this page only lists what is left.

## Order of work

1. The backend agent resolves conflicts on PR #49 (all 8 backend tasks). The founder merges it.
2. The frontend agent then finishes everything in the same PR #53 (branch `SPRINT4_FE_E1`). No separate PR.
3. A small backend change adds a per-row warning flag to the quality checks (see "Backend: still to do").
4. Deploy: only after the Sprint 3 Approve test passes. Take a `pg_dump` backup first, because PR #49 runs 2 migrations on the preview database.

## Frontend: what to build, and what the backend now gives you

Wait for PR #49 to be on `main`, then merge `main` into `SPRINT4_FE_E1`. Do not fake any data.

| Frontend item | Needs from the backend (PR #49) |
|---|---|
| E1 Gate 2 Quality checks card (already built) | `qualityMetrics` (Task 8, already on `main`) |
| E2 to E5 (see `frontend-task1.md`) | Channel profiles (`channels.createProfileVersion`, `listProfileVersions`, `getActiveProfile`), formats (`channels.listFormats`, `runs.create` `formatKey`), script side (`runs.get` returns `scriptReview` with concerns, violations, sources), approver identity (`review_logs.approvedByUserId`) |
| E6 repeat-topic warning | `runs.get` returns `scriptReview.repeatTopic` (change B16, stored on the intake stage output) |
| Comparison screen (`compare.tsx`) | `dashboard.comparison` API |

**Update 2026-10-11 (founder decision): formats a channel offers. Where this conflicts with `frontend-task1.md` E4 or E5, this page wins.**
- Content profile screen (E5): a new "Formats" section with a checkbox list of all formats, grouped under "Shorts" and "Video", data from `channels.listFormats()` (no `channelId`). Helper text "Pick 2 to 4 formats this channel uses." Saved as `offeredFormatKeys: string[]` in the profile through `channels.createProfileVersion`. Nothing selected is allowed.
- New brief format picker (E4): the "two recent formats" chips and the "More formats" sheet of all 9 are replaced. The chips row is **Freeform (default)** plus the channel's offered formats that match the chosen Type, from `channels.listFormats({ channelId, videoKind })`. If the channel offers none for that Type, only Freeform shows. Picking a format still replaces the placeholder, shows its structure and disables Length with the format's length; Freeform still sends no `formatKey`.
- Needs Sprint 4 Task 9 R1b on `main` first.

Rules for the app: no `package.json`, lockfile, `app.json` or native changes. Run `tsc`, `expo lint`, and the app tests with `cd studio && npx vitest run --root ../app`. Do not match warning text to colour rows.

## Frontend: still open on E1

- Longest single shot row: stays green until the backend flag below exists. Then colour it from the flag (amber when flagged).
- Founder: publish the OTA with `eas update --branch preview`, then check Gate 2 on run `75f69faa…` or `dc2062a2…` on the tenant account and place the screenshot beside the board. E1 is Done only after that.

## Backend: still to do

| Item | State |
|---|---|
| Conflicts on PR #49 | Backend agent merges `origin/main`, keeps the Approve-screen fix (PR #63 cancel guard) and the Task 12 behaviour, runs tsc, eslint and the full tests. |
| Per-row warning flag for quality checks (longest shot first) | New. Small separate change after PR #49 merges. Thresholds stay in the backend. Prompt to be written by the architect. |
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

## Founder items carried over from Task 8

Image-cost budget ceilings; the 5-images-per-minute limit. (Real licensed music beds are already added.)
