# Bugs Status: Founder/Device-Tested Production Issues

**Purpose**: not a sprint. This folder tracks real, founder-found bugs surfaced by actually running a
built app/API against real devices — as opposed to `sprint[N]/`, which tracks planned feature work.
Items land here when the founder hits something broken while testing, not when a task is scheduled in
advance. Expect this folder to keep growing as more hotfixes are found — each new report gets the next
`task[N].md`, this file gets a new row.

**This track can be worked by a dedicated chat.** A separate chat attached to this Project, linked to
the same computer, can act as an independent "hot fixer" against this folder specifically — see
[HOTFIXER_AGENT_PROTOCOL.md](HOTFIXER_AGENT_PROTOCOL.md) for its scope, the coordination rules that
keep it from colliding with sprint work or another concurrent bug-fixer chat, and a ready-to-paste
kickoff message.

**Folder status**: 4 items logged. Task 1 and Task 2 are code-complete, founder-side real-device
verification still pending. **Task 3 is fully landed on `main`, code and report both** — corrected below:
an earlier draft of this note claimed its report was "still outstanding," but direct read of `origin/main`
confirms `reports/task3.md` merged along with the code via PR #21, same as `telegram-token-delivery.ts`
merged via PR #18. That earlier claim was itself a symptom of the exact "verify against a stale
worktree branch, not `main`" mistake the checkout-location note below now warns about. **Task 4 is new**
— real-device retesting of Task 3's own R2/R5 fixes found that the bug-report success redirect has no
fallback when the OS doesn't intercept it cleanly (lands on an "Unmatched Route" screen), the login
screen has no guard against showing itself while already signed in (making an intact session look
logged out), the magic-link text itself points at `localhost` (unusable from a phone), and Telegram
delivery's outcome was completely unobservable from the console either way. Full detail at
`tasks/task4.md`. **The keyboard-overlap item (Task 3's original R4) has been pulled out of this track
entirely** — the founder is redesigning the login/token-entry screen through the dedicated UI/UX track,
so keyboard handling is being addressed as part of that redesign rather than patched here.
**Last updated**: 2026-09-27 (Task 4 started; Task 3's report-outstanding claim corrected — it was
already merged).

**Shipping boundary — read this before deciding whether a fix needs a rebuild.** `expo-updates` is fully
configured (`runtimeVersion.policy: "fingerprint"`, `updates.checkAutomatically: "ON_LOAD"`). A
**JS/React-Native-logic-only** change (no new native dependency, no new permission, no `app.json` plugin,
nothing in `android`/`ios`) ships via `eas update --branch preview`, **no new APK, no reinstall**. Only a
genuinely **native** change needs another full `eas build` — check for other pending native changes to
bundle into the same build first. This is a per-**item** shipping characteristic (see each `R#`'s own
role tag), not a branch-determining one.

**Checkout location — read this before touching anything.** This track's shared worktree is
`D:\Study Material\7AI-bugs`. **Before starting any new task on it, fetch and reset to a fresh
`origin/main`** (`git fetch origin && git checkout main && git pull`) rather than building on top of
whatever branch happens to already be checked out there — confirmed the hard way while investigating
Task 4: the worktree was left on a branch that predated Task 3's real backend work (missing
`telegram-token-delivery.ts` entirely), which briefly looked like Task 3 had never been implemented at
all, when in fact the real code was already on `main`. Always verify against `main` directly, not against
whatever this worktree's last-checked-out branch happens to show. `D:\Study Material\7AI-frontend` no
longer exists (deleted) — `main` is now the only reference checkout for "what's actually current."

| Task | Name | Status | Owner | Branch | Notes |
|---|---|---|---|---|---|
| 1 | First Device Test — Login Unreachable, Wrong Host Default, Stale Build, Empty Channel Picker | Done — action needed | **Founder** (real-device verification only) | `BUGS_TASK1_REPORT` | R1/R2/R4 confirmed on `main`. Report at `reports/task1.md`. Only real on-device verification remains. |
| 2 | Bundle All Remaining Native-Config Changes + Finish OTA Update Support | Done — action needed | **Founder** (build + real device/OTA verification only) | `BUGS_APP_b2` | `expo-updates` fully configured. Report at `reports/task2.md`. Real build + on-device install + one real OTA proof are founder-action-pending. |
| 3 | Second Device Test — Cross-Tenant Data Leak, Bug-Report Tool Broken, Script-Review Gate Not Enforced, Keyboard Overlap, Magic-Link Delivery via Telegram | Done — action needed (code + report both on `main`) | **Founder** (real-device/dev-DB-migration/Telegram-bot verification) | (landed via pre-existing branches `BUGS_BE`/`BUGS_FE_TASK3`/`BUGS_TASK3_REPORT`, not retroactively renamed) | Full detail at `tasks/task3.md`, report at `reports/task3.md` — both confirmed merged to `main` by direct read (PRs #18/#19/#21). R1/R3 confirmed solid. **R2 and R5 turned out to have real gaps once retested live — see Task 4**, which corrects/completes them rather than reopening this task. **R4 (keyboard overlap) is out of scope for this track going forward** — moved to the UI/UX track. |
| 4 | Third Device Test — Bug-Report Redirect Missing Fallback Route, Login Screen Missing Auth Guard, Magic-Link Base URL & Telegram Delivery Observability | Done — action needed | **Founder** (real-device pass for R1/R2; set `PUBLIC_API_BASE_URL`; one real Telegram test with a `/start`-ed chat id; restart server + `prisma generate`) | `BUGS_TASK4` (PR #25) | Report at `reports/task4.md`. R3 boot warning and R4 logging trail confirmed live against the real dev DB and Telegram API (fabricated chat id → real `400 chat not found`, fully logged). Real delivery to a genuine chat id is still unconfirmed. **Note: I applied Task 3's pending `telegramChatId` migration to the shared dev DB during verification — unrequested, disclosed in the report.** Full detail at `tasks/task4.md`. One branch, one commit per `R#` item (`BUGS_TASK4_R<X>: ...`), one PR for the whole release. R4 is server-console-only logging by design — no client-facing/API response change, to preserve this flow's existing no-enumeration posture. Keyboard overlap is deliberately **not** in this task — see the UI/UX track instead. |
| 5 | YouTube Connect Fails — OAuth redirect_uri Resolves to a Private IP | Done — action needed | **Founder** (Tailscale Funnel setup; register redirect URI(s) in Google Cloud Console; set `.env.local`; real consent; tunnel decision) | `BUGS_TASK5` (PR #29) | Report at `reports/task5.md`. `redirect_uri` was already its own env var (`YOUTUBE_REDIRECT_URI`); the private IP was that var's value, not derived from `PUBLIC_API_BASE_URL`. Added boot guard + docs; R2 (Tailscale Funnel docs, guard test, live Google check: ts.net gives redirect_uri_mismatch until registered, not a private-IP error) done. Verified against Google that the LAN URI is rejected and localhost passes the URI-shape check; full connect unconfirmed. |
| 6 | Script Review Auto-Retry Loop Has No Feedback | Done — ready for review | — | `BUGS_TASK6` (PR #31) | Report at `reports/task6.md`. Both items live-verified against an isolated sandbox DB: R1's actual constructed retry prompt was intercepted and shown to contain the real reviewer rationale (not just "the parameter was passed"); R2's retry-budget-refusal now reaches `paused_gate1` with the exact note appended, first-attempt refusal unaffected. `npm test` 108/108 passing. **Sprint 3 Task 9/R2 is waiting on this branch merging to `main` first — please prioritize.** |
| 7 | Bug-Report Triage Fields (Type, Priority, Area) + a Real List/Update Endpoint | Done — action needed | **Founder** (deploy the migration to the shared dev DB before merge) | `BUGS_LOG_2` (PR #38) — **not** `BUGS_TASK7` (already taken by Task 8's ad-hoc pipeline-bug-fix pass, before this task was ever picked up — a real branch-naming collision, not a numbering error) | Report at `reports/task7.md`. All three items confirmed live end to end against an isolated sandbox DB and a real server process: real bug/feedback submissions, a real 401 (no auth), a real 403 FORBIDDEN (a genuine approver-role session, not just a missing token), a real 200 with correct fields via the ops token, a real triage-update confirmed by re-listing, and `idPrefix` filtering. List/update implemented as tRPC (not REST) since `/bugs*` is deliberately auth-exempt for the no-auth submission path — a REST list route there would have inherited that exemption and leaked every report. |

## Naming and branch convention
Same per-task-doc git discipline as every other track in this repo (see `docs/execution/templates/TASK_TEMPLATE.md`
§ Git Workflow), with its own track identifier: **`BUGS`**. **One branch per release** (a "release" = one
numbered Bugs Task), not a branch per role:

- **`BUGS_TASK<N>`** — the one branch for release (Bugs Task) `<N>`'s entire scope, every item, every
  role. One commit per `R#` item (`BUGS_TASK<N>_R<X>: ...`), plus one closing commit for the report and
  this file's own upsert (`BUGS_TASK<N>_REPORT: ...`). One PR for the whole release.

Distinct from any `SPRINT[N]_BE`/`_FE` or `FRONTEND_FE` branch, and from `UIUX_FE`/`UIUX_APP_b<N>` (the
UI/UX track's own convention). See `HOTFIXER_AGENT_PROTOCOL.md`'s **Release & Branch Model** section for
the full rule. **Task 1 and Task 2's existing branches (`BUGS_TASK1_REPORT`, `BUGS_APP_b2`) predate this
convention and are not retroactively renamed; Task 3's actual branches/PRs also predate strict adherence
to it and are left as they are, already landed on `main`.**

Role tags (`BE`/`FE`/`APP`) still apply per item — see `HOTFIXER_AGENT_PROTOCOL.md`'s **Role Tags**
section — but only describe shipping/verification mechanics, not which branch a commit lands on.

## Full detail
Task docs: `docs/execution/bugs/tasks/task1.md`, `task2.md`, `task3.md`, `task4.md`, `task5.md`, `task6.md`, `task7.md`.
Per-task reports (written once each is actually fixed and verified):
`docs/execution/bugs/reports/task1.md`, `reports/task2.md`, `reports/task3.md`, `reports/task4.md`,
`reports/task5.md`, `reports/task6.md`, `reports/task7.md`.
Hot-fixer agent operating protocol: `docs/execution/bugs/HOTFIXER_AGENT_PROTOCOL.md`.
