# Sprint 4 Frontend Task 2 — Report (NEXT 1: Run, Inbox and Queue redesign + Sprint 4 polish)

**Status: Built, awaiting founder device verification. Not "Done".** Definition of Done needs a phone screenshot beside each board, taken on the founder's OnePlus after the OTA. No screenshot exists: this session had no device and the app was not run against a backend, so nothing below was seen on a screen. Every requirement is reported "Built — awaiting screenshot".

**Branches** (both cut from `origin/main`, 2026-10-12, JS-only, OTA-eligible):

| Branch | Requirements | Commits (one per requirement) |
|---|---|---|
| `SPRINT4_FE_N1_RUN` | R1, R2, R5, R6 | `R1`, `R2`, `R5`, `R6` |
| `SPRINT4_FE_N1_LISTS` | R3, R4 | `R3`, `R4` |

Both branches are rebased on `main` and have a PR open. They are independent; `LISTS` carries its own copy of the small `StatusChip` "error" kind (same lines as `RUN`, so they merge without conflict). This report is on the `RUN` branch and covers both.

**Checks run (each branch)**
- `cd app && npx tsc --noEmit`: no errors in `app/`. Two errors remain in `studio/src/storage/r2-client.ts` (`@aws-sdk/*` not installed in this worktree). Not from this change.
- `npx expo lint`: clean.
- `cd studio && npx vitest run --root ../app`: `RUN` 41 passed, `LISTS` 38 passed (the app's tests plus the new ones).
- `git diff origin/main` shows no change to `package.json`, `package-lock.json`, `app.json`, `eas.json` or native code, so the fingerprint matches `main`.

## R0 — Does the app match the BUILT boards? (read before changing anything)

| BUILT board this task replaces | Result |
|---|---|
| Run detail (published state) / After Gate 2 — Published to YouTube | **differs**: status chip, a 3-line brief as the header, the stepper inside a card, a "Published to YouTube" card. No settings tiles, no tabs, no grouped step history. |
| Run detail — Gate 1 | **differs**: brief header, a separate Script card, no tabs/tiles. |
| Run detail — Gate 2 | **differs**: video + review in one card with the player, quality card under it. |
| Run — needs attention: Retry / Cancel | **differs**: "What went wrong" card with an icon tile, the stage in brackets, "Technical details" as a toggle. Retry / Cancel bar matches. |
| Ended — Rejected / Cancelled / Failed → Run again | **differs**: a chip plus a sentence. "Run again" and "Edit brief & run again" match. |
| Gate 1 — repeat-topic, factual concerns, style violations, sources | **differs**: the whole banner was tappable but had no "Open that run ›" line; Gate 1 action bar was one row (Reject, Edit, Approve). The three review cards match. |
| Gate 2 — quality checks | **differs**: labels were Loudness / True peak / Resolution · frame rate / Longest single shot, with LUFS and dBTP units. |
| Inbox, one card per gate | **differs**: one card per notification, each with an inline Gate action bar. |
| Queue + In progress | **differs**: no search, no channel filter, an "Ended runs" toggle at the foot, a second "New brief" button in the empty state. |

**What the app already had, by name**
- Error to plain sentence: `humanizeRunError` in `app/lib/run-labels.ts` (ordered pattern table; one line to add a backend message).
- "Why didn't it work?" tag: `PostHocTagForm` in `app/app/(app)/run/[id].tsx` (calls `runs.tagPostHoc`; stored as a `ReviewLog` with `agent: 'founder-post-hoc'`). Keys the app sends: `weak_hook`, `topic_already_saturated`, `bad_thumbnail_frame`, plus free text.
- `ClampedText`: `app/components/ClampedText.tsx` (clamps to N lines, toggle shown only when the real line count is higher).
- Status chip: `app/components/StatusChip.tsx` with `statusChipKind`, `runStatusLabel`, `queueChip`, `endedChip` in `run-labels.ts`.
- Queries: Inbox used `notifications.list`, plus a `runs.get` per card (topic, resolved decision, pending gate bar; same query key, so one fetch per distinct run). Queue used `runs.list` with the five active statuses (15 s poll), and `runs.list` for `completed` + `failed` once "Ended runs" was opened.

## R1 — Run screen layout (`SPRINT4_FE_N1_RUN`)

Built — awaiting screenshot (board `R10Run`). Flags: none involved.

1. **Title first.** The run's topic (`runTopic`, as the Queue uses); once published, the YouTube title. The YouTube title is on `runs.get` already (the `publishing` stage output, `metadata.title`), so no gap.
2. **Status chip**: Gate 1 · approve script / Gate 2 · approve video / In progress / Needs attention / Published / Cancelled / Rejected / Failed (`runChip`). Published adds "{Privacy} · uploaded {ago}" beside it.
3. **Settings tiles** (`RunSettingsTiles`): Type · length, Visuals, Voice, Music, plus a "Format: …" line. One column below 340 px or at font scale 1.3+. Length reads `videoKind` and `targetSeconds` from `runs.get`. See "Fallbacks in use" for the rest.
4. **Tabs** Brief / Script / Video (`RunTabs`), one line, 44 px tall. Clamps use `ClampedText` with "Show full brief" / "Show full script" / "Read full review" / "Show less". Default tab follows the state: Video at Gate 2, Script at Gate 1 / in progress / needs attention, Brief when ended or published.
5. **Step history** (`StepHistory`, `buildStepHistory`): built from the existing stage rows. A step done on a later attempt reads "Done on attempt 2 · attempt 1 failed" with an "{n} attempts ▼" pill that expands the attempts. Repeated failures read "Video made · failed {n} times · last: {plain reason}" (plain reason from `humanizeRunError`). The raw error appears only behind "Technical details ›" on a failed attempt.
6. **Gate decisions** in the history follow the B4 fallback ("Done", no "by you") until `gateDecisions` exists.
7. **Tags**: the app now owns the list (`POST_HOC_TAGS` → "Weak hook", "Topic already saturated", "Bad thumbnail frame"). Any other stored value is shown capitalised, with underscores as spaces. No new choices. The block is a collapsed "Why didn't it work? · optional tags" row; free text still works.
8. Run again / Retry / Cancel: unchanged.

Slim stepper (seven 4 px bars) replaces the dot stepper, per the board.

## R2 — Run states (`SPRINT4_FE_N1_RUN`)

Built — awaiting screenshot (board `N1RunStates`, five states).
- **Needs attention**: "What went wrong" / "{step} failed {n} times: {plain reason}." / "Retry runs this step again. Cancel stops the run; nothing is published." / "Technical details ›" (raw `lastError` only behind it). The run-specific retry-limit sentence (stock footage vs AI stills) is kept as one extra line under the helper.
- **Ended**: "You cancelled this run" / "You rejected this script|video" / "This run stopped", then "Nothing was published." The rejection reason, or the plain failure reason, is kept as a second line. "Spent on this run: $x." is dropped (see B5).
- **In progress**: dark card with the stage name from `runs.progress`, an indeterminate bar, and "Attempt {n} · This screen updates on its own." No time estimate.
- **Gate 1 / Gate 2**: standard action bar (R5). Gate 2 shows "Video review" with verdict and the quality checks in one card above the tabs; the Video tab holds the player.
- Existing dark cards (decision sent, uploading, making the video again) are unchanged.

## R3 — Inbox (`SPRINT4_FE_N1_LISTS`)

Built — awaiting screenshot (board `R10Inbox`).
- Notifications are grouped by run in the app (`threadKey`), one card per run, sections "Needs you" and "Earlier", header "{n} needs you". Timeline words: Approved / Waiting for you / Cancelled by you / Published (plus "Rejected by you", "Failed", "In progress", "Needs attention" where a run is in those states). Button "Review video" / "Review script" on Needs-you cards, "Open run →" on Earlier cards.
- **Data**: the card's timeline is derived from the `runs.list` row (status, current stage, last error, completed time) and the group's own notification times. The Inbox calls the same two `runs.list` queries as the Queue (same inputs, one shared cache entry each). There is no `runs.get` per card. A notification whose run is not in the loaded lists shows its title and button without a timeline.
- **Network calls**, from reading the code (not measured on a device): opening the Inbox issues 3 queries (`notifications.list`, `runs.list` active, `runs.list` ended), whatever the number of cards. The old Inbox added a `runs.get` for each distinct run.
- Empty: "Nothing needs you right now."
- **Behaviour change to confirm**: the Inbox no longer carries the inline Approve / Reject / Edit bar. The decision is made on the Run screen (the button opens it). The board shows only the button.
- The "Video · {n} min" chip is not built (Frontend Task 4).

## R4 — Queue (`SPRINT4_FE_N1_LISTS`)

Built — awaiting screenshot (board `R10Queue`).
- Search "Search runs by topic" and a channel filter row. Search matches the topic line and the brief of the runs already loaded; typing triggers no query (no query depends on the text). Pull to refresh kept (through a new optional `refreshControl` on `FormScreen`, since the search field makes this a form screen).
- Sections Waiting on you / Needs attention / In progress appear only when they have runs. "Recent runs" with All / Published / Cancelled / Failed chips and compact rows; "See all runs →" opens the existing Ended runs list inline, 20 at a time with "Show more" (no new paging).
- All clear: "✓ Nothing waiting on you · nothing in progress". Search with no match: "No runs match “{text}”." and "Clear search". The second "New brief" button is gone; the floating one stays and hides while the search field has focus.
- Rejected runs show under All only. "Completed" is now worded "Published", and "Failed" uses the red-on-pink chip, as the board says.
- Cost: the ended-runs query now runs when the Queue opens (it fed only the opened section before). It is the same query the Inbox uses.

## R5 — Gate 1 polish (`SPRINT4_FE_N1_RUN`)

Built — awaiting screenshot (board `N_S4RunGate1Review`).
- Script card: the Script tab (default at Gate 1), with "~N words · ~S s". The old standalone card is removed so the script is not shown twice.
- Real clamp: review text and script use `ClampedText` at their real length ("Read full review", "Show full script").
- Standard action bar: Reject and Edit side by side, "Approve script" full width. The Inbox no longer uses it, so the old mid-word break (U6) cannot return. Gate 2 already had this shape.
- Repeat-topic banner: text plus an "Open that run ›" line; the whole banner (at least 44 px) opens the earlier run.

## R6 — Gate 2 quality polish (`SPRINT4_FE_N1_RUN`)

Built — awaiting screenshot (board `N_S4RunGate2Quality`).
- Labels: Volume, Loudest moment, Picture, Longest shot, Captions. No LUFS / dBTP units. Captions reads On / Not detected / Not checked.
- Rows with no plain label (`videoCodec`, `videoProfile`, `pixelFormat`, `audioSampleRate`, `audioBitrate`, `shotCount`) sit behind one collapsed "Technical details ›" link, with an amber dot when any has `warn: true`. A row appears only if the server sends it.
- Icons and colours come from the `warn` flag only; the red ✕ is kept only for "No audio" (as built). Card hidden when `qualityMetrics` is absent.
- **Targets are not printed**: see Fallbacks. A warned row still shows the server's own message, which names its target.

## Differences found, not changed (not outlined on the boards, and not matching the app)

- Published board: the **Performance** card (views / likes) does not exist in the app. Left alone; the existing one-line hint stays.
- Published board: Video tab shows a player ("Play here"). The app only loads the video at Gate 2, so outside Gate 2 the Video tab shows the review result, not a player. I did not check whether the video endpoint serves older runs.
- Gate 2 board: the visibility row is a collapsed "YouTube visibility · Private ▾". The app has the three-way control; left alone.
- Gate 1 / Gate 2 boards show "8/10 · passed". The response carries no pass flag, so only "8/10" is shown (Shared rule 3).
- "Draft video · 42 s": no duration in the response, so omitted.
- States board puts "{channel} · {ago}" beside the chip; the app keeps it in the header subtitle, which the boards do not outline.
- The run chip keeps "Publishing" while the upload is in flight (not in the R1 list; kept as built).
- The collapsed **Details** toggle (last error, "Switched to AI stills…", raw stage rows) is not on any board; kept, so no information is lost.
- Inbox: the board's Published row shows the privacy word ("Unlisted"). The list row has no privacy, so it reads "Published".
- The video-review step is not its own row in the board's step history; its failed attempts remain visible in Details.

## Fallbacks in use — updated after #53, #73 and #74 landed on main

Rebased onto `main`. Every field now comes from the real response (shapes from `task12.md`):

| Item | State | What the app does |
|---|---|---|
| B2 per-row quality flag | on `main` | Colour from `warn` only. |
| B3 `resolvedOptions` | **wired** | Voice, visuals and music tiles show the resolved label, plus "(default)" when `from` is `channel` or `default`. Length uses `targetSeconds.value`. Format line: the key made readable, "Freeform" when `formatKey` is null (the response has no format label). The old "Channel default" fallback now shows only on runs that predate the field. |
| B4 `gateDecisions` | **wired** | "Approved by you" / "Edited and approved" / "Auto-approved" / "Rejected by you". Runs that predate the field keep "Done". |
| B5 `spentUsd` | **wired** | Ended card shows "Spent on this run: $x." |
| `maxCostUsd` | **wired** | In-progress card adds "Stops at $X." when the run has a limit. |
| `qualityMetrics.spec` | **wired** | Targets print under each value: "target −14", "−1 or lower", "1080×1920 · 30 fps", "4 s or less", "on" (captions, when expected). Without `spec` no target is printed. The long-video Length row stays in Frontend Task 4. |

## Decisions for the founder

1. Inbox: kept as the board shows it (button opens the Run screen; no inline approve/reject) — confirmed by the founder.
2. Rejected runs only appear under "All" in Recent runs (the board has four chips).
3. The Queue now fetches ended runs on open.

## Needs the founder

OTA, then phone screenshots next to each board: R10Run, the five N1RunStates, R10Inbox, R10Queue, N_S4RunGate1Review, N_S4RunGate2Quality. Real-API checks from the Verify list I could not run: a Needs-attention run showing the plain reason with the raw error only behind the link; a run with two attempts showing the grouped pill; a Gate 2 run colouring rows from `warn` only; Queue search filtering with no network call (true by construction: no query takes the search text).
