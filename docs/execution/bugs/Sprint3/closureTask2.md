# Bugs Sprint 3 Closure, Part 2

> **Provenance**: the founder said `closureTask2.md` was attached to the 2026-10-06 instruction, but no file
> came through to the hot-fixer. This is a **draft assembled from the scope decision** (what PR #48 does not
> ship). It is not the founder's text; replace it with theirs if it differs. Source of every item:
> [`closureTask.md`](closureTask.md) (read that for the full wording of each item and the report table).

**Read `docs/execution/bugs/HOTFIXER_AGENT_PROTOCOL.md` and `docs/execution/templates/TASK_TEMPLATE.md` first.**

**Objective**: finish what PR #48 (`Sprint3_CLOSURE`, closure part 1) deliberately left out, mostly work that
needs the live preview app, the VPS database or a device.

**Depends on**: PR #48 merged and deployed (server first, then the OTA app update). Re-run the R1 diagnostic SQL
after deploy.

**Branch**: new `BUGS_CLOSURE_2` off a fresh `origin/main`. **Not** `Sprint3_CLOSURE`.

## Items (from `closureTask.md`, unchanged unless noted)

| Item | What | Why it was not in #48 |
|---|---|---|
| R0 | Founder records the preview commit, re-tests all 24 reports on the live app, and every report gets `area` + `status` via `bugs.updateTriage` (never SQL). | Needs the live preview app and an owner session / ops token; the hot-fixer must not touch `sevenai_preview`. |
| R2 (rest) | Root cause of each run whose cause was not budget, and report 6 ("AI images not work"). Check `AI_VISUALS_STUB` on the VPS, the OpenAI key's image-model access, and the run's image `usage_events`. Hypothesis from reading the code: the 6 `$0` `gpt-image-1.5` rows were **failed** image generations (a failure row carries the error context's provider/model at `$0`), not stub calls. | Needs preview rows (`usage_events.metadata`, stage `output`/`lastError`). |
| R1 step 7 | Make recorded spend accurate: the `$0` image and `unknown/unknown` rows. Finding to build on: `generateVideo` pays for TTS + transcription (~$0.031) before the visuals step, and a failed attempt then recorded `$0`, repeated on every retry, so the gate under-counts failing attempts. A first implementation (attach the spent cost to the thrown error and record it with `metadata.failed`; warn on unknown provider/model; mark stub renders) was written on `Sprint3_CLOSURE` and **removed** before merge because Sprint 4 Task 8 rewrote `generateVideo` and records still costs itself; re-do it on top of Task 8's code. | Image-cost recording moved here by the founder; overlaps Task 8's changes. |
| R3 step 1, 3 | Reproduce reports 7/8 with the raw `dashboard.operational` JSON next to a screenshot; re-test report 9 (F4) and close it with evidence if it no longer reproduces. | Needs preview data. |
| R5 reports 12-13 | Re-test the Gate 2 approval / publishing flicker (Task 11/R1 changed that path). If it reproduces, capture `runs.get` / `runs.list` a second apart. Answer "is the data dirty?" from the stage rows. | Needs a live run through Gate 2. |
| R6 reports 14-15 | Diff the plans and the stock source ids of consecutive attempts for runs `f020ef30` / `652491ea`. Report 16 is answered in the part-1 report (limitation of the stock path). | Needs preview data. |
| R7 | Gate 2 playback stutter (reports 17-18): separate the file from the delivery (`ffprobe` a stuttering draft; compare `/runs/:id/video` with the R2 presigned URL; check `use-video-source.ts`). Likely covered by Task 8's 30 fps / `+faststart`; re-test first. | Needs a device and a real draft. |
| R8 | Music and voice (report 19): music is covered by Task 8; check `SELECT name, "defaultVoice" FROM channels;` and set a different voice per channel. | Founder configuration + listening test. |
| R9 | Bug-icon colour (report 20): hand to UI/UX, `area: APP`, leave `open`. | Not this track's time. |
| Appendix A | Set `area` on the four feedback reports and leave them `open`. | Part of the triage pass. |
| Follow-up | Show `budgetDilutionWarning` / the effective ceiling per channel in the app (the server returns it on `channels.create` and exposes `effectiveCeilingUsd` in `dashboard.cost`); admin budget screen (Admin Sprint 2). | The app does not render the `budgetWarning` field yet. |

## Verification bar

Everything in part 2 is verified on the live preview app (or a device), never by connecting to `sevenai_preview`
directly; where data is needed the founder runs the SQL and pastes it.
