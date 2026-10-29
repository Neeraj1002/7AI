# Sprint 6 Task 1, Gate 2 package screens (Frontend)

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting** (Hard rules 1 to 9, Key Principle 11: nothing channel-specific in code), then `app/AGENTS.md` (Expo has changed: read the versioned docs it names before writing code). Use your own worktree off fresh `main` under `D:\Study Material\7AI-SPRINT6`, branch `SPRINT6_TASK1_GATE2_FE`, worktree `task1gate2fe`, one PR. Do not edit `STATUS.md`, `PLAN.md` or any doc except your own report; give branch, worktree and PR in your first reply and at the top of the report (Hard rule 7).

**Keep replies and tool output short: one-line status messages; only the report is long.**

**Revision**: r1, 2026-10-30. **Written**: 2026-10-30 by the architect chat, at the founder's request. **Status**: not started. **Priority**: P2 (Sprint 6 Task 1, R5 and R6, app side). **Duration**: about 3 days.

**Objective**: build the designer's approved Gate 2 package screens in the app: the swipe cards, the Short card, the quiet YouTube link and chosen row, the Edit title screen, the no-package screen, the making screen and the after-publishing card. The server decides everything that matters (limits, title checks, what is live); the app only formats it. Work against fixtures behind a flag until the backend item (Task 1 PR C, R11) merges.

## Sources (read all three first)

1. **The designer's boards**: canvas row "NEXT 4" (Visual Directions): https://claude.ai/artifact/WUXyvHqAfazmsDNEBMnagG. Five boards: Gate 2 packages (Video and Short), Edit title, No honest package, Making packages, After publishing. They sit on the NEXT 1 Gate 2 layout as a new section under the Video review card; Visibility, Reject, Revise and Approve stay as built. The canvas is read-only. If you cannot open it, say so in your first reply and stop; do not guess a design.
2. **The contract**: `docs/execution/sprint6/contracts/task1-gate2-packaging.md` (r2). Exact procedures and fields. Where the boards and the contract differ, the contract wins; tell the architect.
3. **What the app already has** (a first pass built in Task 1 PR A, before the designer's screens existed): `app/components/PackageCards.tsx`, `app/lib/packaging.ts` and their use in `app/app/(app)/run/[id].tsx` (packaging query, `PackageCards`, `PublishedThumbnailCard`). Reuse its helpers (`pictureLink`, `downloadLink`, `durationChip`, `useAuthedImageSource`, the title counter) where they fit; replace the layout.

## R0. Read first (table in the report, at most 12 lines)

Confirm against the real code: which of the three sources' claims are true, where `runs.packaging` is used today, what the run screen does at `paused_gate2` and after publishing, how `flags` in `app/lib/feature-flags.ts` works (its header says: hidden entirely while false, never shown-but-disabled, flip in a one-line follow-up after the backend merges). Say what you did not verify. Say which fields in the contract the current `AppRouter` types do not have yet (the backend adds them in PR C, R11).

## R1. Gate 2 packages, Video (swipe cards)

A new section under the Video review card. Per package a card: the picture (`imageUrls.feed` or `full`), the title, the channel, a duration chip drawn by the card from `videoSeconds` (never part of the file), "Viewers will ask" with the question, an "Answered at" chip (from `answeredAtParts`, falling back to the `answeredAt` string), "Why this works" (from the server's checks text), a solid **Choose this one** / **Chosen** button, **Download image**, **Edit title**. Dots and "Package n of N". A card from round two carries a "second round" tag (`round: 2`). One picture size per card; the signed link needs no header (`pictureLink` already handles both).

## R2. Gate 2 packages, Short

One card, no swipe, no "Package n of 2": first frame beside the title and hook line (`firstFrameUrl`, `hookLine`; `imageUrls` is null for a Short). Download frame instead of Download image. (Decision 30 Oct: a Short has one package, the brief's hook and first picture; no pick before render. Changes come through Revise.)

## R3. Choosing, the quiet link, Approve

- **Choose** calls `runs.choosePackage({ runId, packageId })`; the card turns to "Chosen". The app always sends the choice explicitly.
- Under the cards, one quiet link: **Keep YouTube's suggested thumbnail** (Short: **Use the script's own title and hook**), which chooses `'youtube-suggested'`. When chosen, a grey "Using ... Change" row. A status line in the bottom bar shows the current choice.
- **Approve with nothing chosen** asks first: "Use YouTube's suggested thumbnail?" (the server publishes with YouTube's suggestion and a model-written title in that case).
- Approve, choose and edit are **not shown while the packages are being made** (see R6). In the edge case (`pending`: paused at Gate 2 with no packages) Approve works as today.

## R4. Edit title

A screen from **Edit title**: a text field, a live counter against **`titleLimit` from the server (never a literal 100; the limit is per channel)**, and the server's check on every pause in typing (debounced; `runs.checkPackageTitle({ runId, packageId, title })`). Show each `problem.message` as the server wrote it; highlight `problem.text` in the field when there is one; list `supportedFigures` as suggestions. **Save is blocked until `ok`.** The app does no rules of its own. Save calls `runs.choosePackage({ runId, packageId, editedTitle })`, which **also chooses that package** (the card turns to "Chosen" with a small "title edited" note). Choosing another package or YouTube's suggestion drops the edit.

## R5. No package

A screen in the same section for `status` `weak_gap`, `none_passed`, `skipped` (the spend limit left no room) and `failed`: the server's `reason`, and for `none_passed` the dropped packages with their `reasons`. After a failed second round it says plainly that nothing passed. The only way forward is Approve with YouTube's suggestion (it asks as in R3). **No "Try new packages" button** (decision 29 Oct: one automatic extra round only).

## R6. Making

While `making` is true (the packages are made before Gate 2 opens): skeleton cards and the cost card with `packagingCostUsd` next to the existing estimate and limit; poll like the existing query. No per-package drawing or checking progress (not in v1). A second round shows "second round" on the screen (`round: 2`).

## R7. After publishing

From `runs.get.thumbnail` (contract B4). `source: 'package'`: when `live`, **no banner**, only a "Live on YouTube" tag on the chosen thumbnail; when `not_applied`, an amber card with YouTube's `reasonText`, a solid **Download image**, the thumbnail greyed and tagged "Not on YouTube"; `pending`: a neutral "Applying" tag. `status: 'not_set'` (`source: 'youtube-suggested'`): one plain grey line, "YouTube chose the thumbnail", no tag, no amber, no download. `source: 'frame-grab'`: today's existing behaviour, no download. **The app never shows a custom thumbnail as live unless the status is `live`.** The designer's boards use sample reason text and do not show the frame-grab case: the real reason arrives from the backend; do not hard-code any sentence.

## R8. Flag, fixtures, tests, sweep

- A flag in `app/lib/feature-flags.ts` (name it `gate2PackageScreens`, comment as the file asks), **false until the backend (Task 1 PR C, R11) is merged and deployed**. While false, today's first-pass cards stay as they are; the new section is hidden entirely, never shown-but-disabled. The flip is a one-line follow-up PR that also deletes the first-pass components and replaces any hand-written type with the real `AppRouter` types.
- Fixtures typed from the contract, one per state: making, ready (Video, three and one package), Short, round two, weak gap, none passed, skipped, failed, edit-title problems (unsupported figure, too long, empty), thumbnail `live`, `not_applied`, `pending`, `not_set`, frame-grab. A dev-only way to see each state on the phone without a run (follow the app's existing convention; if there is none, a test-only screen behind `__DEV__`).
- Unit tests in `app/lib` for every pure helper (counter, labels, status mapping, the Approve-with-nothing rule). `npm run typecheck`, `npm run lint` and the app tests (`npx vitest run --root ../app` from `studio`) pass.
- Same-cause sweep (Hard rule 9): no server rule or limit copied into the app (no 100, no word lists, no figure checks); no channel-specific literal (STATUS rule 4); every place the old first-pass cards are used.

## NOT in this task

The backend (PR C, R11, owned by the backend agent); `runs.remakePackages` and a "Try new packages" button; per-package making progress; the zoom screen and "Try applying again" (dropped by the founder); any channel or profile field; a 9:16 thumbnail; a pick before render for a Short.

## Founder decisions already made (do not reopen)

One package chosen per video; no channel settings or per-channel options anywhere; Shorts show title, hook line and first frame, no 16:9 image; the duration chip is drawn by the card; success shows no banner; one automatic extra round only; thumbnail files stay local; no in-video disclaimer.

## Schema Impact

None (app only).

## Business Logic / State Transition

None in the app. The states and rules are the server's; see the contract.

## Testing

Fixtures and unit tests as in R8. One real run on dev after the backend merges and the flag is flipped (the founder checks one Video with packages, one with none, one Short, one publish) is the backend agent's and the architect's step, not this PR's. Screenshots the founder will take afterwards, list them in the report: the swipe cards, the Short card, Edit title with a problem, no package, making, after publishing (live and not applied).

## Report

`docs/execution/sprint6/reports/task1-gate2-fe.md`: R0 table, what was built per item, flag state, fixtures list, test and lint results, same-cause sweep, deviations from the boards or the contract, hard-rule statuses, and one line for PLAN.md.

## Definition of Done

All R items behind the flag with fixtures; tests, type check and lint pass; no mirrored server rule; the report written; PR ready; Hard rule 8 closing runs after the flip PR merges.

## Links & References

`sprint6/contracts/task1-gate2-packaging.md` · `sprint6/tasks/task1.md` (R5, R6, R10, R11) · `sprint6/reports/task1.md` · `app/components/PackageCards.tsx` · `app/lib/packaging.ts` · `app/lib/feature-flags.ts` · designer canvas row NEXT 4.

## Revision log

- r1, 2026-10-30: first issue, from the designer's boards (NEXT 4), the merged contract r2 and the code on `main` after Task 1 PR A and B.
