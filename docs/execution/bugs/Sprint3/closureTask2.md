# Bugs Sprint 3 Closure, Part 2: Re-test and Triage the Open Reports on the Real Build

> **Status note, 2026-10-11**: the code items (P5, P8, P9, P10) are merged in PR #57 and were phone-verified on 2026-10-10 and 2026-10-11 (`reports/closure2-phone-verification.md`). The rest of this task (P2 the 24-report triage, P3 reports 12-15, P4 leftovers, P5's live proof, P6 the docs sync, the agent's report `reports/closure2.md`) is carried into **Bugs Task 12 as C1-C7 and D1** (`tasks/task12.md`). Work them from there; this file stays the reference for what each P-item means.

**Read `docs/execution/bugs/HOTFIXER_AGENT_PROTOCOL.md`, `docs/execution/templates/TASK_TEMPLATE.md` and
`docs/execution/bugs/Sprint3/closureTask.md` in full before starting.** This is the second half of the closure
pass. Part 1 (`closureTask.md`, branch `Sprint3_CLOSURE`, PR #48) fixed the budget gate and the dashboard and
inbox items. This part is the rest of that task's list: the 24-report triage, reports 12-15, and the leftovers
(reports 6, 17-20 and the image-cost rows). It is **not** numbered as a task, for the same reason part 1 isn't.

**Objective**: every one of the 24 reports on the preview server ends with a final status and an `area`, set
through `bugs.updateTriage`, backed by evidence from a **real run on the build that is actually deployed**.
Code is written only for a defect that still reproduces after that build is live, and never for something
already built by another PR (see "Already built elsewhere"). Confirmed items built directly here, without a re-test gate: the failed-render usage rows (P5),
the abrupt video ending (P8), finding finished runs in the app (P9) and two small UI polish items (P10). The Inbox
status chip (P7) was already fixed in PR #56 and is verify-only here.

**Branch**: `Sprint3_CLOSURE2`, cut from a fresh `origin/main` **after PR #48 and PR #56 are merged and deployed**, in the
bugs worktree (`D:\Study Material\7AI-bugs`). One draft PR, ready only when the report is complete.

**Duration**: P1 ~0.5h (founder), P2 ~2h hot-fixer plus ~2-3h founder testing, P3 ~2h, P4 ~1h, P5 ~2h, P6 ~1h,
P7 ~0.5h (verify only), P8 ~1.5h, P9 ~2.5h, P10 ~0.5h.

**Depends On**: PR #48 (part 1) and PR #56 (Inbox labels, reminder text, restart dedupe) merged and deployed to
preview. Already merged: PR #46 (Sprint 4 Task 8, render quality), PR #47 (Sprint 3 Task 13, debug bundles),
PR #52 (Bugs Task 10, cancel and push) and PR #55 (Bugs Task 11, script JSON and failure accounting). PR #54
(audio beds) should also be on `main`: confirm before P1. Sprint 4's other tasks are in progress on other branches.

**Success Criteria**: (1) all 24 reports have a status and an `area`, each with evidence (a run ID, a bundle
file, a screenshot or recording, or a SQL result the founder pasted). (2) Reports 12-15 are each answered
explicitly: fixed by which merged change, still reproduces (and fixed here), or by design. (3) No code in this
task duplicates anything listed under "Already built elsewhere". (4) Gate cards in the Inbox are labelled by gate and show their outcome once resolved (built in PR #56, verified
here, P7). (5) A rendered video ends with a short tail instead of stopping on the last spoken word (P8). (6) A
cancelled, failed, rejected or completed run can be found and opened from the app, and its Details list read (P9).
(7) A failed video render books the real cost it incurred, not `unknown` (P5).

---

## What this task is, in plain words

You tested the preview app on 2026-09-28 and later, and the app saved 24 bug reports. Every one is still
`open` with no `area`, so the bug table says nothing about what is real. "Triage" means going through each
report, checking whether it still happens on the build that is running now, and marking it: fixed (and by which
change), still broken, by design, or just feedback. Many were reported before the render-quality work (PR #46)
and the budget fix (PR #48) existed, so a lot of them are expected to be already fixed. Writing code for a bug
that is already gone is the main risk. That is why this part is **test first, code only if it still
reproduces**.

Reports 12-15 are two groups. **Reports 12 and 13**: after approving at Gate 2, right before publishing, the
Run screen's values reset and then come back, and the Queue briefly shows the run on "brief" before it
disappears; report 13 also asks "is the data dirty?". **Reports 14 and 15**: after "revise" at Gate 2 the new
video looks the same as the old one (the same stock footage and voiceover).

## Carried over from part 1 (founder phone tests, 2026-10-08)

| Part 1 check | Result | Where it goes |
|---|---|---|
| Dashboard (weekly spend, per-channel ceilings, success rate, per-gate card) | Pass. Numbers reconcile across Underdogs, Not In Your Textbook and All channels. One label to fix: "per published video" is lifetime spend, shown beside a weekly figure (fixed in PR #56). | Verify the new label in P2 (7, 8, 9). |
| Inbox labels | **Failed**: every gate card still said "Approval needed". Cause found in PR #56: a literal backspace character inside a regex in `notifications.tsx`. | Fixed in PR #56. P7 is verify-only. |
| Budget refusal text | Pass: "Account spend limit reached: $1.18 used of $0.01 this week. Resets Monday 00:00 UTC. (at script generation)", shown on the Run screen and in "What went wrong", with the skipped stage in Details. | The tap on "Retry this step" on a refused run was not captured: repeat it in P2. |
| Run Details labels | Seen: `done` and `skipped (not run)`. Not seen: the red `FAILED` label. | Deferred to P2 row 11, after P9 (failed runs cannot be found in the app today). |
| Cancel a refused run | The founder cancelled it and could not find it anywhere afterwards. | P9. |
| Details list names | `gate1` and `gate2` print raw, unlike the other stages. | P10. |

The weekly budget of tenant `d0617c67-...` was set to $0.01 for the refusal test and must be back at 40
(`SELECT "budgetCeilingUsd" FROM agent_quotas WHERE "tenantId" = 'd0617c67-b7bd-47b1-9501-d316d2d66a15';`).
Any later ceiling test restores it straight afterwards.

## Already built elsewhere (do NOT rebuild; call it, test it, or close the report against it)

| Report(s) | Already built by | What to do here |
|---|---|---|
| 14, 15, 16 (same footage, same clip) | **PR #46 / Sprint 4 Task 8, R4 and R5**: planner defaults to `ai-stills`; stock path is a shot list of several distinct clips with no looping; used clip IDs are skipped. | Re-test on the deployed build. The open question is whether a **revise attempt** avoids the clips of the **previous attempt**; Task 8's report doesn't say, so check it. If it doesn't, the fix is a small change to Task 8's `stock-shotlist.ts` path with a test, and the report says so. If PR #48 contains its own clip-skip (closure R6), keep only the part that Task 8 does not cover. |
| 17, 18 (stutter) | **PR #46 / Task 8, R3**: constant 30 fps, `+faststart`. PR #47 / Sprint 3 Task 12: presigned R2 URL for draft playback. | Re-test on the phone over both paths. Build nothing unless it still stutters after both. |
| 19 (no music, same voice) | **PR #46 / Task 8, R1**: loudness, sidechain-ducked music bed. PR #54 replaced the synthetic beds with five YouTube Audio Library tracks, normalised to -18 LUFS (test render -14.1 LUFS, -1.5 dBTP). Voice variety is channel config (`defaultVoice`). | Re-test the loudness and that the music is audible under the voice on a real run. Check `SELECT name, "defaultVoice" FROM channels;` and tell the founder to set voices. No code. |
| 6 ("AI images don't work") and the `gpt-image-1.5` / `unknown` cost rows | **PR #46 / Task 8**: image rate-limit waiting, moderation-blocked stills skipped, `video-generation` cost now includes the stills (about $0.158 to $0.257 per attempt). | Re-test, then check the new `usage_events` rows for the image step are non-zero. Code only if rows are still `$0` or `unknown/unknown` after a real run. |
| Evidence for 12-16 without VPS access | **PR #47 / Task 13**: `runs.getAttemptBundle` and `hasR2Bundle` (plan, transcript, ffmpeg args, clips). | Use it as the first source of evidence. Needs R2 configured on the VPS (P1). |
| Quality numbers at Gate 2 | PR #46 / Task 8, R7 (`qualityMetrics`). | Read them; do not recompute. |
| Compare-channels API, profiles, formats, script-review fields, approver identity, packaging | Sprint 4 Tasks 7, 1, 6, 2, 4, 5 (**in progress, not merged**) and Sprint 4 Frontend 1 items E1-E6 (`docs/execution/sprint4/tasks/frontend-task1.md`). | Touch none of it. |
| Cancel-run bug (a stalled run can't be cancelled) and push notifications never arriving | **Bugs Task 10**, merged as PR #52 (`docs/execution/bugs/Sprint3/tasks/task10.md`, branch `BUGS_TASK10_CANCEL_PUSH`). | Do not build either here. Test cancel (a running run and a stalled one) and push after the founder has installed the new APK, and record any symptom against Task 10. |
| Script generation failing on a quoted brief; failure-path usage rows for intake, script generation, script review, video planning, metadata and video review | **PR #55 / Bugs Task 11**: structured output, `stopReason` check, retry, and `stage-failure.ts` booking real usage on a rejected reply. Verified on preview 2026-10-08 (run `c3a0175c`, straight-quote brief, first attempt, no `unknown` rows). | Do not rebuild. **Not covered**: the `video_generation` failure path (see P5). |
| Inbox labels, reminder text, restart duplicates, "per published video" label | **PR #56 / `BUGS_CLOSURE_INBOX`**. | Verify only (P7). |
| Admin module (bug list, budget view, run inspector) | `docs/execution/admin/` (not started). | Don't build admin screens. |

## Rules for work that overlaps merged or in-flight PRs

1. First action: `git fetch origin`, then read `docs/execution/sprint4/reports/task8.md`,
   `docs/execution/sprint3/reports/task13.md`, `docs/execution/sprint4/STATUS.md` and `gh pr list`. Re-read the
   table above against what is really on `main`.
2. Before changing any file, run `git log origin/main -- <file>`. If PR #46 or #47 changed it, read that change
   first and call the helper that exists; never write a second one. Shared files to treat with care:
   `run-pipeline/state-machine.ts`, `agents/video-generation/*`, `ai-visuals/client.ts`,
   `dashboard.repository.ts`, `notifications.tsx`.
3. An item that a merged PR already fixed is **closed with evidence from a real run on the deployed build**, not
   with code. The report says which PR fixed it.
4. A genuine defect in code from #46 or #47 gets a minimal fix with a test and a note in the report that it
   changes merged code. No refactors.
5. If your change touches a file that an open Sprint 4 PR also changes, keep it additive, and stop and ask the
   founder if it conflicts.
6. Handle merged PRs gracefully in code too: if a field or function from #46 or #47 is missing on an older run
   (for example no `qualityMetrics` or no R2 bundle), the app and API must degrade quietly, not throw.

## P1 (Founder) - Put the real build on preview

1. After #48 and #56 merge, the deploy runs (or `/var/www/7AI/deploy.sh` as the `deploy` user). Check
   `git log -1 --oneline` in `/var/www/7AI` equals the merge commit, `pm2 status` shows `sevenai` online, and
   `npx prisma migrate status` shows nothing pending.
2. Task 13 R1 checks (Task 13's report says they were never run): `grep -o '^R2_[A-Z_]*' studio/.env`
   (names only, never the values), `NODE_ENV=production`, then one real run, then call `runs.getAttemptBundle`
   on it.
3. Confirm the stub flags are off: `AI_VISUALS_STUB`, `MEDIA_STUB`, `STOCK_FOOTAGE_STUB` should be `false` or
   absent on the VPS.
4. PR #54 replaced the synthetic music beds. Confirm the five track files and the manifest are in
   `/var/www/7AI/studio/data/audio-beds/` (or under `DATA_DIR`) on the VPS, and that `sevenai` was restarted
   after they landed.
5. Paste the commit, the R2 variable names and the stub-flag values into the report.

## P2 (Founder tests, hot-fixer records) - Triage all 24

For each report: run the scenario on the preview app, classify it as `still reproduces`, `no longer reproduces`
(say which merged change fixed it, or "unknown"), `by design`, `cannot reproduce - need data` or `feedback`,
and set `area` (`BE` / `FE` / `APP`) and `status` through `bugs.updateTriage` (`BUG_REPORT_STATUSES` in
`bug-report.repository.ts`). Never edit `bug_reports` by SQL, and never connect to `sevenai_preview` directly:
the founder runs any SQL and pastes the result.

Work in this order, one scenario per group, and use one real run to answer several reports where possible:

| Reports | Scenario | Evidence |
|---|---|---|
| 1-5 (budget) | Start a run on Underdogs; it passes the budget gate. Part 1 verified the refusal text on the phone on 2026-10-08. The tap on "Retry this step" on a refused run was never captured: repeat the ceiling test once (set the weekly budget to 0.01, start a run, tap Retry, expect the same explanation and no new attempt), then restore it to 40. | run ID, screenshot |
| 6, 14, 15, 16 | One `ai-stills` run to Gate 2, then one forced `stock-footage` run to Gate 2, then **revise twice** with a clear note. | run IDs, `runs.getAttemptBundle` plan and clip IDs per attempt, a screenshot of the footage of each attempt |
| 7, 8, 9 | Dashboard overall and per channel. | screenshot and `SELECT status, count(*) FROM pipeline_runs GROUP BY status;` |
| 10 | Inbox with one pending gate 1, one pending gate 2, one resolved. **Known defect, fixed in PR #56** (see P7): verify only. | screenshot |
| 11 | Open a run with a failed attempt; check the Details list. Part 1 already showed `done` and `skipped (not run)`; the red `FAILED` label is the part still unseen. The founder deferred this from part 1 because failed and cancelled runs cannot be found in the app (P9): run it after P9, or with run `248fae8a` (failed `script_generation` attempt 1) if it can be opened. | screenshot, stage rows |
| 12, 13 | Approve at Gate 2 with the Run screen open and the Queue visible, on a screen recording. | recording; stage rows afterwards |
| 17, 18 | Watch the same Gate 2 draft 3 times (wifi and mobile data), note where it stutters. | device, notes |
| 19 | Loudness and music audible; `SELECT name, "defaultVoice" FROM channels;`; set a different voice per channel and compare. | notes |
| 20 | Nothing to test: `area: APP`, leave `open`, hand to the UI/UX track. | - |
| Four feedback reports | `area` only, leave `open`. | - |

## P3 - Reports 12 to 15, in detail

1. **12 and 13**: Sprint 3 Task 11/R1 changed publishing on approval, so these may already be fixed. Re-test
   first. If they still reproduce, capture `runs.get` and `runs.list` once a second across the approval (about
   30 s, starting before the tap) and answer whether the backend briefly reports an earlier `currentStage` or
   `status`, or the app is showing a stale cache. Report 13's "is the data dirty?" is answered from the run's
   stage rows and status history. Fix only the part that is wrong (backend or app), with a test.
2. **14 and 15**: fetch the bundle for attempt N and N+1 (`runs.getAttemptBundle`), diff `plan.json` (query,
   scene prompts, pacing notes) and compare the clip IDs. Record: did the revise note change the plan? Did the
   clips change? If the plan changed but the clips are the same, see the table above (cross-attempt skip).
3. Answer in the report, in one sentence each: why it looked identical, and what now prevents it.

## P4 - Leftovers (R7, R8, R9 of part 1)

Folded into P2: re-test stutter (17, 18) and loudness, music and voice (19); R9 (20) is a one-line hand-off.
Code is written only if the P2 re-test still reproduces after P1, and then under the rules above.

## P5 - Spend rows: image cost and the failed-render gap

**Evidence already in (founder SQL, 2026-10-08):** the six `gpt-image-1.5` rows recorded at $0 are all from
2026-09-28, none since. A real run after Task 8 (`c3a0175c`, 14 stills) booked its `video-generation` row at
$0.2001, of which $0.182 is the stills (`aiVisualsCostUsd`, $0.013 each), and no row in that run is `unknown`.
So the success path records image cost correctly and the old $0 rows are closed as pre-Task 8. Record that in
the report, and confirm the $0.013 per still against the provider's published price for the size and quality the
pipeline asks for, because the weekly budget gate uses it.

**Still open: the failed-render path.** `generateVideo` throws without per-call usage, so when a render fails
after TTS, Whisper or image calls were already paid, the catch in `state-machine.ts` books provider and model
`unknown` with no cost, and it repeats on every Retry. Bugs Task 11 fixed this exact pattern for the LLM stages
(`run-pipeline/stage-failure.ts`: `llmUsageContext`, `failureUsageFields`, `failureUsageEvents`). Do the same
here: have `generateVideo` attach what it already spent (TTS characters and cost, transcription seconds and
cost, stills made and cost) to the error it throws, and have the catch book one `video-generation` usage event
with the real provider, model and cost. Reuse Task 11's helpers; do not write a second mechanism. Tests: a mocked
failure after TTS, and one after image generation. A live check is only possible when a real render fails; when
one does, the founder pastes:
```sql
SELECT "createdAt", model, "costUsd", metadata FROM usage_events
 WHERE model = 'gpt-image-1.5' OR provider = 'unknown' ORDER BY "createdAt" DESC LIMIT 10;
```
Mark stubbed calls so a stub run is never mistaken for a real one. Commit `BUGS_CLOSURE2_P5: book real spend on a failed render`.

## P6 - Bring the repo's bug docs up to date

The bugs worktree and fresh worktrees carry older copies of the bug docs. The Project copies are the latest.
The founder attaches them (or the agent reads them from the Project); **do not rewrite them from memory**.
Commit them to this branch as one commit, replacing the repo copies:
- `docs/execution/bugs/HOTFIXER_AGENT_PROTOCOL.md`: the repo copy lacks the "Bug lifecycle: triage and
  closure" section, the triage-pass kickoff and the `Sprint3/` paths. Before replacing it, `git diff` the repo
  copy against the Project copy and keep any genuinely newer edit the hot-fixer made itself.
- `docs/execution/bugs/Sprint3/closureTask.md` (the repo copy still says the branch is `BUGS_CLOSURE`; the real
  branch is `Sprint3_CLOSURE`, and its overlap table is stale) and `docs/execution/bugs/Sprint3/closureTask2.md`
  (the repo copy is a draft written without this file).
- `docs/execution/bugs/STATUS.md`: make sure the repo copy has correct rows for Bugs Task 10 (PR #52, merged),
  Bugs Task 11 (PR #55, merged), closure part 1 (PR #48, merged) and PR #56. Change status text only, from the
  merged reports; do not rewrite the file.

## P7 (FE) - Inbox: resolved gate cards still say "Approval needed" (built in PR #56, verify only)

**Status (2026-10-08): built in PR #56 (`BUGS_CLOSURE_INBOX`). Do not rebuild.** The root cause was a literal
backspace character where `\b` belongs in a regex in `notifications.tsx`, so the gate pattern never matched and
every card fell back to "Approval needed". The labels are now "Script approval" and "Video approval" on pending
gate cards, and "<label> · <decision>" once resolved. In this task P7 is the check below only; the rest of
this section is the original spec, kept for reference. If a label is still wrong on the deployed build, record it
against PR #56 and fix it minimally.

**Seen on the phone (founder, 2026-10-07)**: every gate card in the Inbox carries the red "Approval needed"
chip, including ones that read "Resolved 9m ago" (for example "Gate 2 — Not In Your Notebook"). UI/UX Task 3
R5 only clamped the card body to 3 lines and added "Open run →"; the chip is still picked from the
notification's kind (an approval request), never from whether the gate was answered. Confirmed defect, so it
is fixed here directly (no re-test gate). App only, JS-only, OTA-eligible.

1. Read `app/app/(app)/(tabs)/notifications.tsx` (shared file, rule 2: `git log origin/main` first) and find
   where the chip and the "Resolved" time come from.
2. **Pending** gate card (the gate is still waiting): chip "Approval needed", accent colours (`accentSoft` /
   `accent`), inline gate actions as today.
3. **Resolved** gate card: chip shows the outcome, from the run's `lastGateDecision` (`runs.get`, Sprint 3
   Task 11 / PR #42) when its `gate` matches the card's gate:
   - `approve` → "Approved" (ok colours `#E2F5E8` / `#146C3A`)
   - `edit` → "Edited & approved" (ok colours)
   - `revise` → "Sent back" (neutral `surface2` / `muted`)
   - `reject` → "Rejected" (ink background, white text)
   - unknown, still loading or decision for the other gate → "Resolved" (neutral)
   Hide the inline gate actions; keep "Open run →".
4. Don't add a `runs.get` per card if the Inbox query already carries the resolution; if it doesn't, fetch
   lazily per visible resolved card and cache by run id (TanStack Query), never block the list on it.
5. Non-gate notifications (published, needs attention, etc.) are unchanged.
6. No backend change. If the resolved state can't be read on the client at all, stop and tell the founder
   rather than adding a backend field here.

**Verify**: the P2 report 10 scenario (one pending Gate 1, one pending Gate 2, one resolved) after the OTA —
only the two pending cards say "Approval needed"; the resolved one shows its outcome. Screenshot in the report.
Commit `BUGS_CLOSURE2_P7: inbox chip reflects resolved gate`.

## P8 (BE) - Give the video a short ending

**Seen by the founder (2026-10-08)**: the video cuts the instant the narration stops, so every ending feels
abrupt. This is a polish item, not one of the 24 reports, and it is confirmed, so it is built directly (no
re-test gate). Backend only, no app change. It touches PR #46's render path (`agents/video-generation/*`,
`QUALITY_SPEC`), so the rules above apply: `git log origin/main -- <file>` first, and call the helpers that
already exist.

1. **A short tail after the last spoken word.** Default **0.7 seconds**, held in one named constant (for
   example `END_TAIL_SECONDS`) next to the other render constants, so tuning it later is a one-line change.
   Keep it well under a second: a Short must not hold a still image for several seconds. If the founder wants
   a different length after listening, only the constant changes.
2. **During the tail** the final image stays on screen and the last caption stays until the video ends. The
   voice has already finished, so the only thing to fade is the music bed: fade it out across the tail. With
   `audioLayer: none` the tail is plain silence.
3. **No fade to black and no outro card.** Shorts loop automatically, and a dark or branded ending breaks
   the loop and costs retention. The tail exists to remove the hard cut, not to add an ending screen.
4. **Interactions to check, and answer each in the report:**
   - **Longest single shot** (spec: 4 s or less, a soft warning above it). If the tail makes the last shot
     longer than 4 s, spread it across the last two shots, or hold the previous frame; say which was chosen.
   - **Loudness** (target -14 LUFS, tolerance 3): the tail adds near-silence. Confirm integrated loudness and
     true peak stay in spec on a normal 45-second script.
   - **Length**: the video is longer by the tail. Recheck `targetDurationSec`, the caption end times and any
     maximum-length check.
   - **Transcription and captions**: Whisper timestamps must not change. The tail is added to the video
     timeline only, never to the audio sent for transcription.
5. **`qualityMetrics` describes the finished file**, so its duration includes the tail.
6. **Tests**: the render plan's total length equals audio length plus the tail; the bed fade is applied only
   when a bed exists; with the constant set to 0 the output is identical to today's. Do not rewrite PR #46's
   existing render tests; add alongside them.

**Verify**: one real `ai-stills` run and one forced stock-footage run, each to Gate 2. Play the last two
seconds on the phone. Read each run's `qualityMetrics` (`integratedLufs`, `truePeakDb`, `longestShotSeconds`,
`softWarnings`): nothing new out of spec, or each change explained. The founder judges by ear whether the
ending feels natural, and only the constant is tuned if not.
Commit `BUGS_CLOSURE2_P8: short tail after the last spoken word`.

## P9 (APP, BE only if unavoidable) - Finding a finished run in the app

**Seen by the founder (2026-10-08)**: they cancelled a run that the budget gate had refused, then could not find
it anywhere in the app. Inbox cards for different runs look almost identical (same chip and channel name), so
failed or old runs cannot be told apart. Part 1's Details check could not be run for the same reason.

1. **First, find out and write down** how a cancelled, failed, rejected or completed run can be reached today.
   Read `app/app/(app)/(tabs)/queue.tsx`, `channel/[id].tsx`, `dashboard.tsx` and the statuses each passes to
   `runs.list`. The report says plainly which screen lists which ended status, and where none does.
2. **Then add the smallest change that makes every run reachable**: an "Ended" section in the Queue, or a run
   list on the channel screen, whichever the existing code supports with the least change. Newest first, 20 at a
   time. Each row shows the brief's **Topic line** (not the whole brief), the channel, a status chip (Completed,
   Needs attention, Failed, Cancelled, Rejected at Gate 1 or 2) and the date. Tapping a row opens the run. No
   backend change unless step 1 shows `runs.list` cannot return ended runs; then only an additive status filter.
3. **Inbox and list cards show the run's Topic line**, so two runs on the same channel can be told apart.
4. If this needs a design decision beyond a plain list (filters, search, grouping), **stop and tell the
   founder**: the UI/UX track designs it, do not invent a screen here.

**Verify**: cancel a run, then find it from the app, open it and read its Details list; do the same for a failed
and a rejected run. Screenshots. Commit `BUGS_CLOSURE2_P9: ended runs can be found and opened`.

## P10 (APP) - Two small polish items

1. The Details list prints `gate1` and `gate2` raw while the other stages read "script generation" and so on.
   Print "gate 1" and "gate 2".
2. Optional, only if it is a few lines: on a run whose latest stage was skipped for budget, "Retry this step" is the
   primary button although a retry cannot work until the limit is raised or the week resets. Keep `runs.retry`'s
   explanation behaviour, and show the button disabled with "Available when the limit is raised or on Monday".
   If it takes more than a few lines, skip it and say so in the report.

**Verify**: screenshots of both. Commit `BUGS_CLOSURE2_P10: polish run Details and budget Retry`.

## Schema Impact

None expected. If any item needs a migration, stop and ask.

## Testing

```bash
npm run build && npm run lint && npm run typecheck
npx vitest run
cd app && npm run typecheck && npm run lint   # P7
```
Plus each re-test above on the live preview app. Unit tests for any code that is written. P7 ships with
`eas update --branch preview` (fingerprint must match `main`).

## Report Template

`docs/execution/bugs/Sprint3/reports/closure2.md`. Include: the deployed commit and the P1 checks; a table of all
24 reports (classification, `area`, status, evidence, which PR fixed it); the explicit answers for 12, 13, 14, 15,
16 ("bug or limitation?") and 13 ("is the data dirty?"); the P5 query result; P7 before/after Inbox
screenshots; the P8 last-two-seconds check and `qualityMetrics` for one `ai-stills` and one stock run; the P9 answer to "where can each ended run be found today" with before and after screenshots; the P5 per-still price check and the failed-render usage test; every file touched that PR #46 or #47 had changed, and why; what is left open and why.

## Git Workflow

One branch, **`Sprint3_CLOSURE2`**, off a fresh `origin/main` in `D:\Study Material\7AI-bugs` (`git fetch origin
&& git checkout main && git pull` first, the protocol's checkout rule). Record it in
`docs/execution/bugs/STATUS.md` before the first commit (a new row). One commit per item
(`BUGS_CLOSURE2_P<X>: ...`, P1 and P2 produce no commit of their own beyond the report), draft PR after the first push, the report plus STATUS row in the closing commit
(`BUGS_CLOSURE2_REPORT: ...`), then `gh pr ready`. Never push or merge to `main`; never commit to a branch this
task didn't create. Verification is on the live preview app, never a direct connection to `sevenai_preview`.

## Links & References
- `docs/execution/bugs/Sprint3/closureTask.md` (part 1, PR #48)
- `docs/execution/bugs/Sprint3/tasks/task10.md` (Bugs Task 10: cancel-run and push, a separate task)
- `docs/execution/ui-ux/tasks/task3.md` R5 (where the Inbox card was last changed)
- `docs/execution/sprint4/reports/task8.md` (PR #46) and `docs/execution/sprint3/reports/task13.md` (PR #47)
- `docs/execution/sprint4/STATUS.md`, `docs/server/usefulcmds.md`
- `docs/execution/admin/ADMIN_MODULE_DESIGN.md` (the admin run inspector will replace most of the SQL here later)
