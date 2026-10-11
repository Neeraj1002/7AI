# 7AI: where things stand

**Last updated: 2026-10-11.** This is the one page to read. Only the architect edits it, through a pull request. Details live in the linked task and report docs; those are written once and then left alone.

Every item has a plain name first and its code in brackets, for example "Check Task 13 bundles (F4)".

## Sprint 3: closed

Task 12 server (PR #58) and app (PR #59) are merged and live on preview. The Approve-screen fix (PR #63) is merged, deployed and verified on the phone (stepper, "Publishing" chip, no Cancel, ends on Published). The 24-report triage is recorded on preview and in `execution/bugs/Sprint3/reports/closure2.md` (PR #65, merged): 24 reports closed as fixed, 4 feedback reports left open with area APP. The 24 failed runs are 18 cancelled and 6 rejected, none real failures.

## Your to-do (only you can do these)

| # | What | How | When |
|---|---|---|---|
| 1 | Merge the docs PR | It brings `STATUS.md`, `sprint4/PENDING.md` and the long-form tasks 9 and 10 into `main`. Then pull `main`. | Now |
| 2 | Add longer music tracks | 2 to 3 tracks for each of the five moods, each 4 minutes or longer, cleared for monetised public use, normalised to -18 LUFS, added to the music list through your usual PR. | Today or tomorrow |
| 3 | Deploy the Sprint 4 server | PR #49 (all 8 Sprint 4 backend tasks) and PR #64 (quality-check row flags), both merged. The backup `~/sevenai_preview_before_pr49.dump` is already taken. Then check `pm2 restarts=N` stays steady. | After merging |
| 4 | Publish the app update | After PR #53 is finished and merged: `npx expo-updates fingerprint:generate --platform android` from a clean `main`, compare, then `eas update --branch preview`. | After PR #53 |
| 5 | Check Gate 2 quality card on the phone | Run `75f69faa…` or `dc2062a2…` on the tenant account, put the screenshot beside the board. Frontend item E1 is Done only then. | After #4 |
| 6 | Phone screenshots still missing | Cold start, cursor colour, "Decision sent", "Cancelling...", Gate 1 clamp. OnePlus screenshots for UI/UX tasks 3 to 6 (F5). | When you have time |
| 7 | Receipts check | Paste the receipts SQL from the Task 12 report (F8). | When you have time |
| 8 | Reconnect YouTube channels | Weekly (testing-mode tokens expire in 7 days). Also once after Sprint 4 Task 10 merges, because subtitle upload needs a wider Google permission. | Weekly |
| 9 | Triage the 5 newest bug reports | They arrived after the closure run and stay open for Sprint 4. | When you have time |

## In review

| Item | State |
|---|---|
| Frontend PR #53 (branch `SPRINT4_FE_E1`) | Gate 2 quality card built, awaiting device check. The agent finishes the remaining Sprint 4 screens (E2 to E6) in this same PR now that PR #49 is merged. |
| Docs PR (this page, `PENDING.md`, tasks 9 and 10) | Waiting for the docs agent. |
| Archive of old doc folders (DOCS_ARCHIVE) | Separate PR by another agent; status unknown. |

## Next work (Sprint 4, in order)

1. Sprint 4 backend Tasks 1 to 8: merged (PR #49 and PR #46); deploy and verification pending (to-do #3).
2. Frontend: finish E1 to E6 in PR #53, now including the "formats each channel offers" change (see `execution/sprint4/PENDING.md`).
3. Long-form video (16:9, 2 to 15 minutes, published publicly on real channels):
   1. Image-model spike (R1 of `execution/bugs/Sprint3/tasks/hardening-gpt-image-migration.md`): landscape size, price, rate limit.
   2. Task 9, Long-Form Foundation (`execution/sprint4/tasks/task9.md`): `videoKind`, chaptered script, narration, landscape stills with disk cache, 1920x1080 render, cost estimate and per-video spend limit, formats each channel offers. Ends with a 2-minute test render.
   3. Task 10, Quality, Preview and Publishing (`execution/sprint4/tasks/task10.md`): long-form review and quality profile, 720p preview copy, chapter timestamps, subtitle upload, long-form analytics.
   4. App screens: the UI designer's boards first ("under review"), then the build.
4. Script Review rules SR-1 to SR-9 (no claims outside the brief, no stronger hedges, no 9 or 10 with a fact issue): small separate task, to be written.
5. Moved here from Task 12: tester-facing bug type and priority chips; per-channel colour setting; two small items (R10.3, R10.10); the YouTube thumbnail 403; add the app tests to CI.

Details: `execution/sprint4/STATUS.md`.

## Decisions waiting on you

| Decision | Note |
|---|---|
| Move the image model before it shuts down (`gpt-image-1.5`, shuts down 2026-12-01) | Target: merged and deployed by 2026-11-15. The spike (Next work 3.1) comes first; contact sheets need your approval of the new look. |
| Add a search-based fact check to Script Review | Open. Long-form does not use web search: facts come from your brief. |
| An "abandon this run" button for stuck gates | Not built. Only if stuck gates become a real problem. |

## Accepted limits (not fixable by code)

- YouTube Testing mode: tokens expire every 7 days and there is a 100 test-user cap. You are not applying for Google production verification.
- Free stock libraries do not hold concrete footage for abstract topics.
- Subtitle upload will need the wider `youtube.force-ssl` permission (it can also delete videos; nothing in the app uses that).
- A very narrow upload-in-flight duplicate window (YouTube gives no idempotency key).
- Expo push delivery depends on Google and Expo; receipts can arrive late.

Full list with reasons: `execution/KNOWN_ISSUES_AND_BLOCKERS.md`, Section 7.

## Done recently

- Sprint 3 closed (see above), including the Approve-screen fix (PR #63) and the 24-report triage (PR #65).
- Sprint 4 backend Tasks 1 to 7 merged (PR #49); Task 8 merged (PR #46); quality-check row flags merged (PR #64), so the frontend agent can colour the "Longest single shot" row from `qualityMetrics.rows.longestShot.warn`.
- Bugs Task 7 (bug triage columns): closed. Task 13 (per-attempt debug bundles in R2): live on preview.
- Done by you: public API base URL (F1), tenant ceiling 40 and usage SQL (F2), bug report columns (F3), Task 13 bundles (F4), YouTube connect and redirect (F7).

## Where things are

- `STATUS.md` (this page): the live picture.
- `execution/sprint3`, `execution/sprint4`, `execution/bugs`, `execution/ui-ux`: tasks and reports. A task doc is written once; after it closes, only the report and this page change. `execution/sprint4/PENDING.md` lists what is left in Sprint 4 and wins where it differs from `frontend-task1.md`.
- `execution/KNOWN_ISSUES_AND_BLOCKERS.md`: long-form history of issues and why.
- `execution/week1` to `week5`, `execution/sprint2`, `execution/frontend`, `execution/admin/sprint1`: frozen history. Do not update.

## Rules

1. Docs change only through a pull request to `main`. The Project copy is refreshed from `main` afterwards.
2. Agents write only their own task report and send a one-line status; the architect updates this page.
3. When an item closes, move it to "Done recently" and drop it from the to-do.
