# 7AI: where things stand

**Last updated: 2026-10-11.** This is the one page to read. Only the architect edits it, through a pull request. Details live in the linked task and report docs; those are written once and then left alone.

Every item has a plain name first and its code in brackets, for example "Check Task 13 bundles (F4)".

## Your to-do (only you can do these)

| # | What | How | When |
|---|---|---|---|
| 1 | Merge the docs PR | Review "Docs: Sprint 3 closure sync" and merge it. Then pull `main` into your checkout. | Now |
| 2 | Get Task 12 server PR #58 ready | The hot-fixer must do four things first: 7-day stale-gate limit, fix the dilution warning, run the full test suite, update the Task 7 note. Then mark it ready and merge. | After the hot-fixer's follow-up |
| 3 | Check the allowed web origins before deploying | `CORS_ALLOWED_ORIGINS` must list every admin web screen or web build you use. The native app is not affected. | Before deploy |
| 4 | Deploy the server | Server first, then the app update. | After #3 |
| 5 | Prove the crash-loop fix on preview (R5) | Reject a run, hit the regeneration cap, press Revise, press Retry, then `pm2 restart sevenai`. In the log look for `[resume-repair]`, `[exit]`, `[fatal]` and exactly one Gate 1 push. | After deploy |
| 6 | Raise the app PR | Branch `BUGS_TASK12_APP` has no PR yet. Merge it only after the server deploy. | After #4 |
| 7 | Publish the app update | Run `npx expo-updates fingerprint:generate --platform android` from a normal checkout and compare with the installed build. Then `eas update --branch preview`. Fully close and reopen the app. | After #6 |
| 8 | Phone checks | Cold start; cursor colour; watermark persistence; "Decision sent"; "Cancelling..."; Gate 1 long-text clamp; Sign in; "Reconnect needed". Take OnePlus screenshots for UI/UX tasks 3 to 6. | After #7 |
| 9 | Push check | Gate 1 push arrives, Gate 2 pushes once, a restart sends nothing new. Paste the receipts SQL from the Task 12 report. | After #4 |
| 10 | Reconnect YouTube channels | Weekly. Testing-mode tokens expire after 7 days. Accepted. | Weekly |
| 11 | Triage the 24 open bug reports (C1 to C3, C5, C7) | Re-test on the real build with your phone and record each verdict. Needs the closure agent. | When you have time |

Done by you: PUBLIC_API_BASE_URL set (F1); tenant ceiling 40 and usage SQL (F2); `bug_reports` columns (F3); Task 13 bundles are live on preview (F4); YouTube connect and redirect URI (F7).

## In review

| Item | State |
|---|---|
| Task 12 server fixes (PR #58, draft) | Code complete, unit tests only. Not run against a real database or phone. |
| Task 12 app fixes (`BUGS_TASK12_APP`) | Code complete, no PR. |
| Docs sync | New PR from a clean branch off `main`. |

## What Task 12 changed (to verify live)

Revise no longer counts against the automatic regeneration cap; Retry restarts the failed stage; gates always wait for a human; a boot repairs a gate left "running" (R5). Gate push de-duplication, 30-minute window (R6). New-tenant default is $10 a week, split equally across YouTube-connected channels (R7). Stale gates (older than 7 days) reopen without a push. "Reconnect needed" shows when a token expires (R13). A "failed" label and the rejected / cancelled / failed states show on the Dashboard.

## Next work (Sprint 4, in order)

1. Render Quality Floor (Task 8): merged (PR #46), verification pending.
2. Channel x Format Comparison Dashboard (Task 7).
3. Channel Profile Model (Task 1), then Script-Side (Task 2), Visual-Side (Task 3), Format Library (Task 6), Channel Profile screen (Frontend 1), Approver Identity (Task 4), Packaging From Profile (Task 5).
4. Moved here from Task 12: tester-facing bug type and priority chips (Bugs Task 7 R2); per-channel colour setting; two small items left from Task 12 (R10.3, R10.10); the YouTube thumbnail 403.

Details: `execution/sprint4/STATUS.md`.

## Decisions waiting on you

| Decision | Note |
|---|---|
| Move the image model before it shuts down (`gpt-image-1.5`, shuts down 2026-12-01) | Target: merged and deployed by 2026-11-15. See `execution/bugs/Sprint3/tasks/hardening-gpt-image-migration.md`. |
| Add a search-based fact check to Script Review | Proposed for Sprint 4. Product decision. |
| An "abandon this run" button for stuck gates | Not built. Only if stuck gates become a real problem. |
| Why Gate 1 pushes did not arrive in the last test | Unknown. The receipts SQL (to-do #9) will tell. |

## Accepted limits (not fixable by code)

- YouTube Testing mode: tokens expire every 7 days and there is a 100 test-user cap. You are not applying for Google production verification.
- Free stock libraries do not hold concrete footage for abstract topics.
- The broader `youtube` scope would be needed to delete uploaded videos.
- A very narrow upload-in-flight duplicate window (YouTube gives no idempotency key).
- Expo push delivery depends on Google and Expo; receipts can arrive late.

Full list with reasons: `execution/KNOWN_ISSUES_AND_BLOCKERS.md`, Section 7.

## Done recently

- Bugs Task 7 (bug triage columns): closed, already covered by `bugs.updateTriage`. Tester chips moved to Sprint 4.
- Task 13 (per-attempt debug bundles in R2): live on preview.
- Sprint 3 closure parts 1 and 2: code verified.

## Where things are

- `STATUS.md` (this page): the live picture.
- `execution/sprint3`, `execution/sprint4`, `execution/bugs`, `execution/ui-ux`: tasks and reports. A task doc is written once; after it closes, only the report and this page change.
- `execution/KNOWN_ISSUES_AND_BLOCKERS.md`: long-form history of issues and why.
- `execution/week1` to `week5`, `execution/sprint2`, `execution/frontend`, `execution/admin/sprint1`: frozen history. Do not update.

## Rules

1. Docs change only through a pull request to `main`. The Project copy is refreshed from `main` afterwards.
2. Agents write only their own task report and send a one-line status; the architect updates this page.
3. When an item closes, move it to "Done recently" and drop it from the to-do.
