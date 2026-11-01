Links to removed docs: see docs/ARCHIVE_INDEX.md (tag docs-archive-2026-10-26).

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

**⚠️ Environment change, 2026-09-28: verify against preview, not local dev, by default.** The founder's
testing has moved to the preview deployment (`https://7aistudio.tech`, database `sevenai_preview` on the
VPS) — this is now where a hot-fixer's real, live verification step targets, replacing `sevenai_dev`.
Code edits/commits/branches/PRs are unchanged (still the local checkout, still `main`'s existing
auto-deploy ships the fix); only *where a fix gets reproduced and confirmed* changes. Full detail:
`HOTFIXER_AGENT_PROTOCOL.md`'s own **Environment** section. **Never connect a local checkout directly to
`sevenai_preview`** — verification means exercising the live app/API from outside, the same way the
founder would, never a direct DB read/write from here (see `docs/server/usefulcmds.md`'s own "never run"
list for the VPS side of this rule).

**⚠️ Branch-name collision — read this before creating any new `BUGS_TASK<N>` branch.** Task 8 below
(the 2026-09-27 pipeline-run bug-fix pass, now merged) was dispatched ad hoc, without a task doc, and the
hot-fixer picked the branch name `BUGS_TASK7` on its own — not realizing doc Task 7 (Bug-Report Triage
Fields, row below, still not started, no branch yet) already owns that identifier. **PR
[#33](https://github.com/Neeraj1002/7AI/pull/33) is real Task 8 work and has merged to `main`, but its
git branch and commit prefixes are literally `BUGS_TASK7`/`BUGS_TASK7_R<X>`** — left as-is, not renamed.
**Task 7's real branch name is now settled: `BUGS_LOG_2`** — not `BUGS_TASK7` (taken, merged) and not
the earlier placeholder `BUGS_TASK7_TRIAGE`. Chosen deliberately outside the `BUGS_TASK<N>` numbering so
it can't collide with a future task number the way `BUGS_TASK7`/`BUGS_TASK8` already have. This is
recorded in `Sprint3/tasks/task7.md`'s own Git Workflow section — that's the source of truth if this note and
the task doc ever disagree.
**A second, related deviation (not a collision — no conflict, just worth knowing)**: the follow-up build
closing out Task 8's two open "Needs founder" items landed on its own second branch, `BUGS_TASK8`,
rather than reusing `BUGS_TASK7` — so **doc Task 8 spans two branches/PRs**: `BUGS_TASK7` (PR #33,
merged) and `BUGS_TASK8` (PR #36, merged 2026-09-28) — a deviation from this track's usual
one-branch-per-release rule, caused by the same original collision cascading forward. `BUGS_TASK8` is
**not** a separate doc task — match by PR number (#33 vs #36), not branch-name digit, if in doubt. The
real **Task 9** is a distinct, separate batch of bugs (see the note at the bottom of the table) — don't
confuse the two.

**⚠️ The tester's real dev server may not be what a hot-fixer's own live-verification tests against.**
Discovered during Task 9: the app's actual dev server is a long-running instance started via VS Code's
debugger (cwd = repo root), separate from the short-lived ad-hoc servers a hot-fixer starts in its own
worktree to verify a fix — both write to the same shared `sevenai_dev` DB. A fix "live-verified" against
a hot-fixer's own server is not automatically proven against the server the tester's app is actually
talking to, for anything cwd/path-sensitive (see Task 9's R1 below, which was exactly this). API-logic
fixes aren't affected by this distinction. **This warning is now secondary** to the environment-change
note above (verification has moved to preview by default) — it still applies if any work genuinely stays
on local dev.

**Current state, 2026-10-11 (read this first; the paragraphs below are history).**
Sprint 3 is being closed by **one task, Bugs Task 12** (`Sprint3/tasks/task12.md`), dispatched to a hot-fixer on 2026-10-11 (branches `BUGS_TASK12` for the backend and `BUGS_TASK12_APP` for the app). It folds in everything the founder found on the preview server and the phone on 2026-10-10 and 2026-10-11, the closure part 2 leftovers, the tech-debt list and the open Sprint 3 items; the task doc ends with a Sprint 3 exit checklist.
PR #56 and PR #57 (`Sprint3_CLOSURE2`) are merged and deployed (server at `690d2b1`, 19 migrations, stub flags off). Verified on the phone and in SQL on 2026-10-10 and 2026-10-11: Inbox labels, Ended runs (chips, Show more, topic lines), the "gate 1/gate 2" labels in Details, the red FAILED label, the end tail (about 1 s by ear), the Dashboard "all time" label, the restart-duplicate check (no duplicate Inbox card after a restart), Retry on a budget-refused run (refuses again), the "Can't reach the server" screen, delete channel (soft archive, history kept), the New brief unconnected-channel hint and picker copy, and the Queue "In progress" section. PRs for Bugs Tasks 4 and 5 are merged (founder, 2026-10-11).
**Found 2026-10-10/11 (all in Task 12)**: Revise then Retry at Gate 2 after the regeneration cap leaves a zombie run (R5), and a `pm2 restart` then put the preview server into a restart loop with a Gate 2 push on every boot (stopped with `pm2 stop`, closed by hand in SQL); Gate 1 pushes never reach the phone and Expo's receipts show `DeveloperError` for the tenant user (R6); the Dashboard counted cancelled runs (16 of 42) and rejections (5) as failed (R3); the watermark upload fails on the phone (R12); "YouTube connected" is shown for expired tokens (R13); about 19 small UI items (R14).
**Founder decisions, 2026-10-10/11**: one AI-stills attempt after the stock cap; manual Retry and Revise capped at 3; cancelled runs leave the failed count and rejections are labelled "rejected"; new-tenant default budget $10 a week split equally across YouTube-connected channels; thumbnail 403 and Bugs Task 7's tester chips move to Sprint 4; the keyboard-overlap item is accepted as done; Underdogs captions off is intended. The `gpt-image-1.5` deadline (2026-12-01) is unchanged and is its own task (`Sprint3/tasks/hardening-gpt-image-migration.md` (archived, see docs/ARCHIVE_INDEX.md)).
**Still open**: everything in Task 12, the 24-report triage (C1-C7), the OAuth Testing-mode 7-day expiry (not fixable by code; accepted by the founder 2026-10-11: weekly reconnect, production verification out of scope, F7 done) and the doc sync (D1).

**State as of 2026-10-08 (history; superseded by the 2026-10-11 paragraph above).**
Bugs Task 10 (cancel and push, PR #52) and Bugs Task 11 (script JSON and failure accounting, PR #55) are
merged. Task 11 is also deployed and verified on preview: run `c3a0175c`, a straight-quote brief, passed
script generation on the first attempt with one `script-generation` row and no `unknown` rows. Closure
part 1 (PR #48) is merged and deployed; its phone checks passed for the Dashboard and the budget refusal
text, and failed for the Inbox labels, which PR #56 (`BUGS_CLOSURE_INBOX`, merged at `aee3175`) fixes once
the server is deployed and the OTA is published. Closure part 2 is in progress: draft PR #57
(`Sprint3_CLOSURE2`) holds the code items (P5 failed-render spend, P8 video end tail, P9 ended runs
findable, P10 polish). Founder decision 2026-10-08: merge #57's code first, then run the 24-report triage as
a follow-up on the deployed build. **Deadline item:** `gpt-image-1.5`, the model behind the default
`ai-stills` path, shuts down on 2026-12-01; see `Sprint3/tasks/hardening-gpt-image-migration.md` (archived, see docs/ARCHIVE_INDEX.md).

**Folder status (as of 2026-09-28)**: 9 items logged. **PRs #36 (Task 8's R5/R6) and #37 (Task 9) both merged to `main`
(founder-confirmed, 2026-09-28).** Post-merge founder verification still pending for both: restart the
real dev server, publish the OTA, re-answer runs `3e120e13`/`e162acec` at Gate 2, and device-check the
new UI (R5 connect-hint, R6 "Can't reach the server", Task 9 R3 button lock + "Published" card). Task 1
and Task 2 are code-complete, founder-side real-device
verification still pending. **Task 3's code is on `main`** (R1-R5) — its own report doc was previously
listed here as outstanding; the hot-fixer session working Task 4 reports finding `Sprint3/reports/task3.md`
already exists on `main` (not written retroactively by that session — found already present). **Not
independently re-verified from this chat** (no live git access from here) — flagged as reported, not
re-confirmed; correct on sight if a future session finds otherwise.
**Task 4's code is committed and pushed** to `BUGS_TASK4`, draft PR
[#25](https://github.com/Neeraj1002/7AI/pull/25) — build/lint/typecheck pass on both `app/` and
`studio/`. **R4 is now real-confirmed**: a genuine live request with a real, `/start`-ed Telegram chat
id produced `[telegram-token-delivery] sendMessage to 8641987627: ok` — actual delivery succeeds, not
just the logging trail. This closes out Task 3's original R5 for real. R1 (bug-report fallback route)
and R2 (login auth-guard redirect) still need a real-device check. **R3 is still open**: that same live
boot log still shows `[boot] PUBLIC_API_BASE_URL not set — magic-link text will show localhost,
unusable from a phone` — the env var is still unset in the real `.env.local`; the boot-warning code
itself works, but the actual fix (setting the var) is still a founder action.
**A real, disclosed deviation, not authorized in advance**: the hot-fixer session found Task 3's
`telegramChatId` migration had never actually been applied to the shared `sevenai_dev` dev database
(so `requestMagicLink` would fail there), and ran `prisma migrate deploy` against it directly to fix
that — a live write to a shared resource that wasn't asked for, even though it's a single nullable
column add. The dev server has since been restarted and is running against the current schema (confirmed
by the same live boot log — `15 migrations found`, `Database schema is up to date!` from a separate
`prisma migrate status` check).
**The keyboard-overlap item (Task 3's original R4) remains out of this track** — moved to the UI/UX
track as part of a full login-screen redesign.
**Task 5 is now code-complete on both R1 and R2, live-verified against Google's real endpoint** — R1's
own investigation found the task doc's original root-cause guess was wrong: `redirect_uri` was never
derived from `PUBLIC_API_BASE_URL`; the OAuth connect flow already had its own dedicated
`YOUTUBE_REDIRECT_URI` variable, and the private IP was simply that variable's misconfigured value in
`.env.local`. Fixed via a new boot-time private-IP guard, an `.env.example` correction, and the
`.env.local` value itself. **R2 adds real, built-out phone-testing support via Tailscale Funnel**
(chosen over ngrok for its stable `*.ts.net` hostname) — Google Console registration steps, a guard-test
case confirming `*.ts.net` hosts correctly pass the private-IP check, and a live Google check showing a
`*.ts.net` redirect_uri produces `redirect_uri_mismatch` (expected — unregistered, not rejected) rather
than the old private-IP error. **Critical finding, 2026-09-27**: the OAuth client actually in use was
type **"Desktop app"**, which has no redirect-URI field at all and can never accept a non-loopback URI —
the real fix is a new **"Web application"**-type client. **Done 2026-09-28 (founder-confirmed)**: a Web
application OAuth client now exists and `.env.local`'s `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET` point
to it. Every previously-connected channel still needs to reconnect/re-consent (old tokens were bound to
the Desktop client). Full detail: Task 5's row below.
**Task 6 is done and merged.** Bugs Task 3/R3's script-review auto-retry mechanism (threshold 7, cap 3)
was already confirmed live on `main` and working as designed. This task fed the prior `auto-reject`
review's rationale into the next `script_generation` attempt as `fixNotes` (R1), and made a retry-attempt
budget refusal route to `paused_gate1` consistent with the cap-reached case (R2) — both live-verified.
Merged to `main` via `BUGS_TASK6` / PR [#31](https://github.com/Neeraj1002/7AI/pull/31) on 2026-09-27.
**Task 7 is a founder-requested enhancement to the bug-report tool itself**, not a founder-found app bug
— the current `bug_reports` table has no way to see submitted reports without a direct DB query
(`listBugReports()` exists but was never wired to a route), and no type/priority/area classification at
all. Needs a schema migration, so per `HOTFIXER_AGENT_PROTOCOL.md`'s own guardrail this required a real
task doc + founder decision before a hot-fixer builds it. **Still not started — nothing has blocked it,
it simply hasn't been dispatched to a hot-fixer yet.** Its branch is `BUGS_LOG_2` (see the note above);
its task doc was refreshed 2026-09-27 with two real findings from Tasks 8/9 worth building with in mind:
`updateBugReportStatus` is proven working from repeated real use, and Postgres UUID columns don't
support prefix matching, which affects how R1's list endpoint should handle short-id lookups.
**Task 8 spans two PRs, both merged.** An urgent, ad-hoc pass (no task doc filed first — dispatched
directly to minimize turnaround and token spend) triaging real bug reports testers logged through the app,
prioritizing the 5 most recent pipeline-run-related ones. Fixed four real, load-bearing bugs in
**PR #33 (merged)**: stage failures were silently swallowing their real error behind a generic "failed
after 3 retries" message (R1); a run resumed after a server restart never actually kept moving — nothing
drove it forward (R2, the most consequential fix — a real run sat `running` indefinitely until the next
restart); there was no way for a tester to retry or cancel a `needs_attention` run from the app at all
(R3, new `runs.retry`/`runs.cancel` + UI); and the Queue/Run screens never refetched, so new runs or
state changes were invisible without a manual refresh (R4, polling-based, not push — a working fix, not
an ideal architecture). Live-verified against the dev DB for R1-R3; app UI for R3/R4 was typechecked
only, not rendered, before merge (worktree's `app/node_modules` was incomplete) — **founder should still
click through Retry/Cancel in the live app to be sure**, since that specific gap was never closed
pre-merge. Merged to `main` via the (misleadingly named — see the collision warning above) `BUGS_TASK7`
branch, PR [#33](https://github.com/Neeraj1002/7AI/pull/33), 2026-09-27.
**Two real product decisions surfaced by PR #33 were decided by the founder (2026-09-27) and built as a
follow-up, `BUGS_TASK8` branch, PR [#36](https://github.com/Neeraj1002/7AI/pull/36) (merged
2026-09-28)**: **R5** — block starting a run on a channel with no YouTube link (`1a6510b5`, decided: yes,
block it) — `runs.create` now refuses an unlinked channel and New Brief shows a connect-hint; live-verified
the refusal, the linked-channel success path deliberately untested (would start a real, paid run). **R6**
— the "server down → app hangs forever" gap (`6fc6b6d6`, `auth.tsx` go-ahead given: "Do it") — added a
10s request timeout, no-retry on a down classification, an `/health` launch check, and a new "Can't reach
the server" screen; live-verified dead-port/unreachable-host/bad-token detection all classify correctly.
**Neither R5 nor R6's UI has been seen on a device yet** — typechecked/linted only; PR #36 is merged, so
the remaining step is the OTA (JS-only) plus a real device check.
One bug report (keyboard-covers-textarea, `5ffdd70c`) couldn't be matched to an actual screen — the
report cites the Queue screen, which has no textarea. **Founder is personally checking (2026-09-27)**
whether this is already fixed incidentally; status pending confirmation. Full detail at
`Sprint3/reports/task8.md`.
**Task 9 is a second pipeline bug-fix pass — merged (`BUGS_TASK9`, PR #37, founder-confirmed
2026-09-28).** Six new reports found; four high-priority pipeline ones fixed, one (`7894d971`) checked and
left alone as by-design, one (`7b8f1adc`, design feedback) skipped per the founder's own instruction.
**R1 finally root-caused `2e3b0078`** (Task 8 could only capture-and-log it, not fix it): VS Code's
debugger launches the server with the repo root as cwd instead of `studio/`, so the audio-bed data
folder resolves to the wrong path and ffmpeg fails silently — see the environment-finding warning above,
which this bug is the reason for. **R2 fixes `178b6fdf`** (a gate decision transaction timing out at
Prisma's 5s default left the run stuck at the gate with nothing listening) by auto-reopening the gate on
a failed save and raising the timeout to 20s — real-reproduced via a forced row-lock timeout. **R3 fixes
`dfcc3cfe`** (gate buttons stayed clickable after a decision was already sent) **and `c13da242`** (no
post-publish confirmation) with button-locking plus a new "Published to YouTube" card — typechecked/
linted only, not clicked through. **R4 fixes `18a5e2f5`** (Retry on a regen-capped run just re-reviewed
the same video) so Retry now starts a genuinely new attempt — live-verified via a real `runs.retry` call.
**Founder action, post-merge**: restart the real dev server (see the warning above) — `3e120e13` and
`e162acec` stay stuck at Gate 2 until then, and will need re-answering after.
Full detail at `Sprint3/reports/task9.md`.
**Last updated**: 2026-10-11 (Task 12 rewritten as the single Sprint 3 closing task and its row replaced; new current-state paragraph; Tasks 4, 5 and 7 notes). Before that: 2026-10-10 (Closure part 2 row after PR #57 merged and the phone verification).

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

**Worth flagging separately**: the bugs worktree's own local copy of this file has repeatedly lagged
behind this project doc — at various points missing a task entirely, with older wording for earlier
tasks throughout. This is structurally expected: each hot-fixer branch/worktree only has whatever was on
`main` at the time it was checked out. This project doc, not any single branch's working copy, is the
reconciled source of truth across tracks — when reconciling a hot-fixer's local copy back into this doc,
pull only the genuinely new content rather than overwriting this doc wholesale with a possibly-stale
local snapshot.

| Task | Name | Status | Owner | Branch | Notes |
|---|---|---|---|---|---|
| 1 | First Device Test — Login Unreachable, Wrong Host Default, Stale Build, Empty Channel Picker | Done — action needed | **Founder** (real-device verification only) | `BUGS_TASK1_REPORT` | R1/R2/R4 confirmed on `main`. Report at `Sprint3/reports/task1.md` (archived, see docs/ARCHIVE_INDEX.md). Only real on-device verification remains. |
| 2 | Bundle All Remaining Native-Config Changes + Finish OTA Update Support | Done — action needed | **Founder** (build + real device/OTA verification only) | `BUGS_APP_b2` | `expo-updates` fully configured. Report at `Sprint3/reports/task2.md`. Real build + on-device install + one real OTA proof are founder-action-pending. |
| 3 | Second Device Test — Cross-Tenant Data Leak, Bug-Report Tool Broken, Script-Review Gate Not Enforced, Keyboard Overlap, Magic-Link Delivery via Telegram | Code landed on `main` — **R5 (Telegram delivery) now real-confirmed via Task 4**, **R3 (script-review gate) now confirmed live via Task 6's investigation** | — | (landed via pre-existing branches, not retroactively renamed) | Full detail at `Sprint3/tasks/task3.md` (archived, see docs/ARCHIVE_INDEX.md). R1/R3 confirmed solid by direct read. **R2 and R5 had real gaps once retested live — closed by Task 4**: R5 (Telegram delivery) is now confirmed working end-to-end with a real chat id (see Task 4's row). **R4 (keyboard overlap) is out of scope for this track going forward** — moved to the UI/UX track. **Own report**: previously logged here as outstanding; the Task-4 hot-fixer session reports `Sprint3/reports/task3.md` already exists on `main` — relayed, not independently re-verified from this chat. **2026-10-11 (founder):** the keyboard overlap (R4, report `5ffdd70c`) still shows up now and then on the device but is not annoying; marked done. A new report will be logged if it needs polishing. |
| 4 | Third Device Test — Bug-Report Redirect Missing Fallback Route, Login Screen Missing Auth Guard, Magic-Link Base URL & Telegram Delivery Observability | **Merged (PR #25, founder-confirmed 2026-10-11).** The login-screen and redirect checks are covered by the 2026-10-10/11 phone tests (Sign in capture still open, Task 12 F6); `PUBLIC_API_BASE_URL` is **still not set on the VPS** (Task 12 F1) | **Founder** (device tests for R1/R2, set `PUBLIC_API_BASE_URL`) | `BUGS_TASK4` — draft PR [#25](https://github.com/Neeraj1002/7AI/pull/25) | Full detail at `Sprint3/tasks/task4.md`, report at `Sprint3/reports/task4.md`. All 4 items (R1-R4) committed, one commit each plus a report commit; build/lint/typecheck pass on `app/` and `studio/`. **R4: real-confirmed** — a live request with a genuine, `/start`-ed Telegram chat id (`8641987627`) produced `sendMessage to 8641987627: ok`; delivery actually works, closing Task 3's own R5 for real. R1 (`bugs-submitted.tsx` fallback route) and R2 (`login.tsx` already-signed-in redirect) are still unverified on a real device. **R3 still open**: the same live boot log still shows the `PUBLIC_API_BASE_URL not set` warning — the env var itself hasn't been set in the real `.env.local` yet; that one line is the only thing left blocking R3. The earlier `prisma migrate deploy`/dev-server-restart/client-regen concerns are resolved — the dev server is confirmed running against the current, up-to-date schema. PR left as a **draft**, not marked ready — review before flipping it. **2026-10-11:** PR merge confirmed by the founder; the boot warning `[boot] PUBLIC_API_BASE_URL not set` is still printed on every start of the preview server. |
| 5 | YouTube Connect Fails — OAuth `redirect_uri` Resolves to a Private IP | **Merged (PR #29, founder-confirmed 2026-10-11).** The Web application OAuth client is in use and channels connect and publish through `https://7aistudio.tech/oauth2callback`. Open, not fixable by code: Testing-mode tokens expire every 7 days (Task 12 R13 "Reconnect needed", F7 production verification) | **Founder** (confirm both redirect URIs registered on the new client, `prisma migrate deploy`, re-consent every channel) | `BUGS_TASK5` — draft PR [#29](https://github.com/Neeraj1002/7AI/pull/29) | Real, live-found: connecting `7aistudiochannel@gmail.com` produced a real Google `400`, `device_id and device_name are required for private IP: http://192.168.0.101:4001/oauth2callback` — Google's OAuth server rejects any redirect_uri host that's a private/LAN IP. **R1's investigation corrected the task's original root-cause guess**: `redirect_uri` was never derived from `PUBLIC_API_BASE_URL` — `youtube-oauth-connect.ts` already read its own dedicated `YOUTUBE_REDIRECT_URI` variable; the private IP was simply that variable's own misconfigured value in `.env.local`. Fixed: a new `redirect-uri-guard.ts` boot-time warning (fires on any `10/8`/`172.16/12`/`192.168/16` host), an `.env.example` correction (must be `localhost` or a public HTTPS domain; default port corrected 3000→4000), and the bugs worktree's own `.env.local` value changed to `http://localhost:4001/oauth2callback`. **R2 built out real phone-testing support via Tailscale Funnel** (chosen over ngrok for a stable `*.ts.net` hostname that survives restarts): setup steps documented, a guard-test case confirming `*.ts.net` hosts pass the private-IP check cleanly, and a live Google check showing a placeholder `*.ts.net` URI produces `redirect_uri_mismatch` — the correct, expected response for an unregistered-but-valid hostname. **Independently reproduced live against the founder's real Funnel hostname on 2026-09-27** (`https://fcg-thinkpad.tail2f1641.ts.net/oauth2callback`) — same `redirect_uri_mismatch`, confirming the setup itself is correct. **Critical finding, 2026-09-27** (from a separate, later investigation of a persisting error): the OAuth client in use was Client ID type **"Desktop app"**, which Google Cloud Console never shows an "Authorized redirect URIs" field for at all — Desktop clients are restricted by Google to loopback-only redirects (`127.0.0.1`/`localhost`) and can never accept a non-loopback URI, registered or not. The real fix is a new **"Web application"**-type OAuth client (which does support arbitrary HTTPS redirect URIs). **Done 2026-09-28 (founder-confirmed)**: the Web application client has been created and `.env.local`'s `YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET` now point to it. **Every already-connected channel's stored refresh token is bound to the old Desktop client and must reconnect/re-consent**, regardless of the already-known 7-day Testing-mode token expiry. Not yet reflected in `Sprint3/tasks/task5.md`/`Sprint3/reports/task5.md` themselves. **Still to verify**: both redirect URIs (`http://localhost:4001/oauth2callback`, `https://fcg-thinkpad.tail2f1641.ts.net/oauth2callback`) registered on the new client; `prisma migrate deploy` on the dev DB; a full end-to-end consent through to a working connected channel via the new client (desktop and phone); the boot warning firing on a real server boot. Full detail at `Sprint3/tasks/task5.md`, report at `Sprint3/reports/task5.md`. Originally logged in `KNOWN_ISSUES_AND_BLOCKERS.md` §1 (2026-09-28). **2026-10-11:** see `KNOWN_ISSUES_AND_BLOCKERS.md` Section 1 (status block) and Section 7. |
| 6 | Script Review Auto-Retry Loop Has No Feedback | **Done — merged** | — | `BUGS_TASK6` (PR [#31](https://github.com/Neeraj1002/7AI/pull/31)) | Report at `Sprint3/reports/task6.md`. Both items live-verified against an isolated sandbox DB: R1's actual constructed retry prompt was intercepted and shown to contain the real reviewer rationale (not just "the parameter was passed"); R2's retry-budget-refusal now reaches `paused_gate1` with the exact note appended, first-attempt refusal unaffected. `npm test` 108/108 passing. Merged to `main` 2026-09-27. **This clears Sprint 3 Task 9/R2's dependency — that task is now unblocked, see `sprint3/tasks/task9.md` (archived, see docs/ARCHIVE_INDEX.md)/`sprint3/STATUS.md` (archived, see docs/ARCHIVE_INDEX.md).** |
| 7 | Bug-Report Triage Fields (Type, Priority, Area) + a Real List/Update Endpoint | **Not started as a task; closed as superseded** by `bugs.updateTriage` (Task 12 R9). The founder pasted `\d bug_reports` on 2026-10-11: `area`, `priority`, `reportType` and `triageNote` exist on preview, so R1 and R3 are closed. The repo docs still need the hot-fixer's update. R2, the tester-facing type and priority chips, moves to Sprint 4 (founder, 2026-10-11) | — | `BUGS_LOG_2` — deliberately outside the `BUGS_TASK<N>` numbering, chosen after `BUGS_TASK7`/`BUGS_TASK8` both went to Task 8's work instead | Founder-requested, not founder-found: today there's no way to list submitted bug reports without a direct DB query (`listBugReports()` was written but never wired to a route), and no bug/feedback, priority, or BE/FE/APP classification at all. R1: a real list + triage-update endpoint (owner-gated), the actually-blocking gap — now noted to account for Postgres UUID columns not supporting prefix matching (found the hard way in Task 9). R2: schema adds `reportType` ('bug'\|'feedback', required) and `priority` (3-chip, required only for bugs) as a fast, tester-facing 2-tap addition to the existing one-textarea submission page — deliberately not more than that, to avoid adding friction for a tester mid-frustration. R3: schema adds `area` ('BE'\|'FE'\|'APP') — deliberately **not** tester-facing, set only during triage via R1's update endpoint, mirroring how every task doc in this repo already tags its own `R#` items by role. Needs a migration, so per `HOTFIXER_AGENT_PROTOCOL.md`'s own guardrail this shipped as a real task doc with the founder decision recorded in it, not picked up ad-hoc. Nothing in `bug_reports` has changed since this task was first written — the schema plan is still accurate and unblocked, it just hasn't been dispatched. Full detail at `Sprint3/tasks/task7.md`. |
| 8 | Urgent Pipeline-Run Bug-Fix Pass (15 open reports triaged, top 5 pipeline-run bugs prioritized) + Follow-Up (R5/R6) | **Done — PR #33 and PR #36 both merged; device check pending** | **Founder** (OTA + device check of R3/R5/R6 UI) | `BUGS_TASK7` (PR [#33](https://github.com/Neeraj1002/7AI/pull/33), merged 2026-09-27) + `BUGS_TASK8` (PR [#36](https://github.com/Neeraj1002/7AI/pull/36), merged 2026-09-28) — **both branches belong to Task 8, see the deviation note above; neither digit matches the other** | Ad-hoc dispatch (no task doc filed first, to save time/tokens on an urgent pass) — triaged all 15 open `bug_reports` rows via direct DB query (no list endpoint exists yet — see Task 7). Prioritized and fixed the 5 most recent pipeline-run-related reports (spanning runs `cdc65ae4`, `3e120e13`, `e162acec`): **R1** — stage failures were swallowing their real error behind a generic "failed after 3 retries" message in `failStageAndEscalate`; now the real cause is captured and logged. **R2, the most consequential fix** — after a server restart, a resumed/reopened gate1 approval never actually drove the run forward (`runGate1Stage` was called directly instead of through the pipeline runner loop); a run could sit `status: running` indefinitely. Live-verified: after the fix, run `cdc65ae4` autonomously cycled through `video_review` → regen attempts → landed at the video-review regen cap (`needs_attention`, a normal quality outcome), entirely on its own after a restart. **R3** — there was no way for a tester to retry or cancel a `needs_attention` run at all (the error was hidden behind a collapsed "Details" toggle, no actions existed); added `runs.retry`/`runs.cancel` (retry rejects archived channels) plus an app error card with Retry/Cancel buttons. Live-verified over the API: retry re-entered the budget gate and correctly returned to `needs_attention`; cancel set the run to `failed`; wrong-status/other-tenant/archived-channel calls all correctly rejected. Also fixed a broken word-count regex for the Run screen's approximate script length. **R4** — the Queue only showed gate/needs-attention runs and never refetched, so new runs were invisible without a manual refresh; added 15s Queue polling and 5s Run-detail polling while a run is in progress (polling, not push — a working fix, not architecturally ideal). **App UI for R3/R4 was typechecked only, not rendered, at PR #33's merge time** (worktree's `app/node_modules` was incomplete) — **founder should click through Retry/Cancel in the live app**, since that gap was never actually closed before merge. **Two bugs diagnosed but not fixed in PR #33, decided by the founder (2026-09-27) and built as R5/R6 in PR #36 (merged 2026-09-28)**: **R5** (`1a6510b5`) — a channel with no YouTube link could still start and complete a full run, only failing at publishing; **decided: block it** — `runs.create` now refuses an unlinked channel, New Brief shows a connect-hint and disables Create Run; live-verified the refusal (linked-channel success path deliberately untested — would start a real, paid run). **R6** (`6fc6b6d6`) — "server down → app loads forever"; **founder go-ahead given ("Do it")** to touch `auth.tsx` — added a 10s request timeout, no-retry on a down classification, an `/health` launch check, and a new "Can't reach the server" screen (Try again/Sign out); live-verified dead-port (17ms), unreachable-host (10s timeout), and bad-token-not-misclassified-as-down. **Neither R5 nor R6's UI has been seen on a device yet** — typechecked/linted only; ships via OTA. **One report, status pending founder's own check**: `5ffdd70c`, a keyboard-covers-textarea complaint, cites the Queue screen, which has no textarea — couldn't be matched to a real screen; **founder is personally checking (2026-09-27)** whether it's already fixed incidentally. **7 of the 15 open reports were the founder's own test/verification rows** — no action needed, can be closed. **Bug-report DB status**: 8 rows marked `fixed` via `updateBugReportStatus` (6 from PR #33, plus `1a6510b5`/`6fc6b6d6` from PR #36 — now merged, so these match `main`; live for testers once the real server restarts and the OTA ships). **Real dev-DB side effects, disclosed**: `3e120e13`/`e162acec` had video generation re-run during diagnosis and are now waiting at Gate 2; `cdc65ae4` ended at the video-review regen cap; run `90e2b9a3` was cancelled and run `9d43eada` failed as "Channel deleted" (its channel was archived) as part of live-verifying R3; every gate reopened during restarts re-sent the founder real Telegram prompts/reminders. **Environment limit hit**: minting a session token for tenant `9190494a` was blocked by the permission classifier, so R3's Retry/Cancel could only be tested over HTTP against the default/ops-token tenant, not the actual affected tenant. Full detail at `Sprint3/reports/task8.md`. |
| 9 | Second Pipeline Bug-Fix Pass (6 new reports; 4 high-priority pipeline fixed) | **Done — PR #37 merged (2026-09-28); server restart + R3 device check pending** | **Founder** (restart real dev server, re-answer `3e120e13`/`e162acec`, OTA + device check R3) | `BUGS_TASK9` — PR [#37](https://github.com/Neeraj1002/7AI/pull/37), merged, no naming collision | Found while investigating why two founder-approved Gate 2 runs (`3e120e13`, `e162acec`) stayed stuck at `paused_gate2` — surfaced the real-dev-server environment finding at the top of this file. **R1** — finally root-caused `2e3b0078` (Task 8 only improved its logging): the debugger-launched server's cwd = repo root, not `studio/`, so the audio-bed data folder resolved to `7AI/data` instead of `studio/data`, and ffmpeg silently failed 3× against missing files. Fixed by resolving `data/`/`.env.local` relative to the studio package, not cwd. Verified via typecheck/lint/108 tests plus a direct before/after audio-bed path resolution check (no full live ffmpeg run completed — live tests were blocked by budget gates / no suitable run to retry). **R2** — fixes `178b6fdf`: a gate decision transaction timing out past Prisma's 5s default left the run stuck at the gate with no listener (likely also explains the original `f7db3cf5`). Fixed by auto-reopening the gate on a failed decision-save and raising the transaction timeout to 20s. **Real-reproduced**: forced a P2028 via a held row lock on a test-tenant run, confirmed the gate reopened and a second Approve succeeded. **R3** — fixes `dfcc3cfe` (Approve stayed clickable after a decision was sent, causing a "not currently pending" error on `3e120e13`) and `c13da242` (no post-publish confirmation UI) together: gate buttons now lock/hide after a decision, replaced by a "Decision sent" card with an "Answer again" fallback; Run screen adds a "Published to YouTube" card (title, visibility, link). **Not verified**: typecheck/lint only, never clicked through. **R4** — fixes `18a5e2f5`: Retry on a regen-capped run was re-reviewing the same video and re-hitting the cap; now starts a genuinely new attempt. **Live-verified** via a real `runs.retry` call on a test-tenant run at the cap. **Not fixed**: `7b8f1adc` (design feedback, skipped per founder instruction) and `7894d971` (raw system names in the Details disclosure — confirmed by-design per `ui-ux/tasks/task1.md` item E3, correctly left alone). **Bug-report DB status**: the 4 new pipeline reports marked `fixed` — now merged to `main`; live for testers once the real server restarts. **Founder action, post-merge**: restart the real dev server to un-stick `3e120e13`/`e162acec` at Gate 2, then re-answer both. Full detail at `Sprint3/reports/task9.md`. |
| Closure (part 1) | Sprint 3 Closure, part 1: budget refusals + weekly window + D4 budget model, dashboard counts, inbox labels, run Details labels, stock-clip skip across revise attempts, stub boot warning | Done - merged (PR #48 and PR #56) | **Founder** (deploy the server, then `eas update --branch preview`; re-check the Inbox labels on the phone) | `Sprint3_CLOSURE` (PR #48; the task doc says `BUGS_CLOSURE`, name kept because already pushed) | **Done**: R1 incl. 5b/D4 (`MIN_CHANNEL_SHARE_USD = 5` confirmed), R3, R4, R5 report 11, R6 step 2 (in Task 8's `stock-shotlist.ts`), R2 boot warning. Verified on an isolated sandbox DB + 187 unit tests; app changes typecheck-only. **Moved to closure part 2** (`Sprint3/closureTask2.md` (archived, see docs/ARCHIVE_INDEX.md), draft): R0 triage of all 24 reports and R2 rest/report 6 (need preview + `bugs.updateTriage`), R1 step 7 image-cost rows (overlaps Task 8), R3 repro of reports 7-9, R5 reports 12-13, R6 reports 14-15, R7, R8, R9, Appendix A. Removed as duplicate of #46/#47: stock-clip skip in the Pexels client, failed-attempt spend/stub marker. Task doc `Sprint3/closureTask.md` (archived, see docs/ARCHIVE_INDEX.md), report `Sprint3/reports/closure.md` (archived, see docs/ARCHIVE_INDEX.md). | **Follow-up (branch `BUGS_CLOSURE_INBOX`, draft PR):** Inbox gate labels never rendered because R4's regex held a literal backspace instead of `\b` (an app bug; the server message was fine) - fixed; gate reminders name the channel and brief line instead of the run id; a restart re-send reuses the open Inbox card instead of duplicating it; the Dashboard "per published video" line says it is all-time. Ships by OTA (app) plus a server deploy. See the new section in `Sprint3/reports/closure.md` (archived, see docs/ARCHIVE_INDEX.md). |
| Closure (part 2) | Sprint 3 Closure, part 2: re-test and triage the 24 open reports on the real build; P5 failed-render spend, P8 end tail, P9 ended runs findable, P10 polish (P7 verify-only) | Code items merged (PR #57), deployed and phone-verified 2026-10-10. The 24-report triage (P2-P4), P6 and the agent's report **carry into Bugs Task 12 (C1-C7, D1)** | Agent (P5, P8, P9, P10, P6); **Founder** (merge #57, P1 deploy checks, P2 device triage, P6 docs) | `Sprint3_CLOSURE2` | Task doc `Sprint3/closureTask2.md` (archived, see docs/ARCHIVE_INDEX.md). Test-first: no code for a report until it reproduces on the deployed build. Founder verification record, open items and new findings: `Sprint3/reports/closure2-phone-verification.md` (archived, see docs/ARCHIVE_INDEX.md) (2026-10-10). |
| Deadline | gpt-image-1.5 Shutdown (2026-12-01): Move Still Generation to a Supported Image Model | Not started - task note written 2026-10-08 | — | not yet cut | Not a numbered bug task; deadline-driven. OpenAI's deprecation list shuts `gpt-image-1.5` down on 2026-12-01 (announced 2026-06-02), with `gpt-image-2.5-sunburst` / `gpt-image-2.5-flare` as replacements. The default `ai-stills` path calls it. Open blockers: the new models' per-image price at 1024x1536 is not published (token-based billing), image-size support is not documented on the model page, and the look of the stills must be re-approved. Full detail at `Sprint3/tasks/hardening-gpt-image-migration.md` (archived, see docs/ARCHIVE_INDEX.md). |
| 10 | Cancel Run That Never Stops + Push Notifications That Never Arrive | Done - merged (PR #52, 2026-10-07). Cancel verified on the phone (cancelled runs end as Cancelled); the "Cancelling..." capture and the push checks are open (Task 12 F6, R6, F8) | **Founder** (new APK build and reinstall, then device checks of cancel and push) | `BUGS_TASK10_CANCEL_PUSH` — PR [#52](https://github.com/Neeraj1002/7AI/pull/52) (the name `BUGS_TASK10` was already used and merged as PR #39, an unrelated pass; commit prefixes stay `BUGS_TASK10_R<X>`) | **Done**: R1 (cancel ends a run no loop is driving; idempotent; `cancelRequested`; publish guard; a cancelled run can't be resurrected), R2 (cancel result, server-driven "Cancelling…", Queue chip), R3 (Expo receipts, dead-token clearing), R4 (register on every launch, Android channel, foreground banner, Push status line), R5 (`google-services.json` + `googleServicesFile`). FCM V1 key already uploaded to EAS by the founder (2026-10-06). Verified on a sandbox DB + 261 unit tests; app changes typecheck/lint only, never run on a device. **Needs founder**: merge + deploy, `eas build -p android --profile preview` (new APK, reinstall; it also carries `expo-image-picker` from UIEnhancement-3), then `eas update --branch preview`, the push-token SQL and device checks, the cancel checks. Report at `Sprint3/reports/task10.md`. |
| 11 | Script-Generation JSON Failure + Failure-Path Usage Accounting | Done - merged (PR #55), deployed, verified on preview 2026-10-08 | — (the interim no-straight-quotes playbook rule is already out of the channel doc) | `BUGS_TASK11_SCRIPT_JSON` — PR [#55](https://github.com/Neeraj1002/7AI/pull/55) (commit prefixes `BUGS_TASK11_R<X>`; see the report for how early commits map to the founder numbering) | **Done** (all BE, backend deploy only), cause confirmed by the founder: straight quotes in the model JSON. R1 diagnostics, R2 accounting (real spend booked when a reply is rejected; same fix in intake, script review, planning, metadata; video review now books spend), R3 structured output as the primary fix (usage still reaches usage_events; one plain-text fallback only on a provider 4xx about the schema), R4 cap raised to 4096, a length stop fails with a clear cut-off message, curly-quote prompt line, R5 fallback (mechanical repair + one retry with the error fed back). Verified on mocks only, no live run; whether the provider accepts the schema is unproven. Report at `Sprint3/reports/task11.md`. |
| 12 | Sprint 3 Closing Task: stock fallback, Retry/Revise safety, crash-loop guard, dashboard counts, push, default budget, polish | In Progress (code pushed 2026-10-11: draft PR #58 for `BUGS_TASK12`, no PR yet for `BUGS_TASK12_APP`; unit tests only, nothing run on preview, a sandbox database or a phone; architect review and merge conditions in the task doc, "Task 12 hot-fixer report"; full task doc written 2026-10-11) | Agent (BE, APP); **Founder** (F1-F10 checklist) | `BUGS_TASK12` (BE), `BUGS_TASK12_APP` (APP) | Task doc `Sprint3/tasks/task12.md`; report `Sprint3/reports/task12.md`; commit prefixes `BUGS_TASK12_R<X>`. **The one task that closes Sprint 3.** BE: R1 AI-stills attempt after the stock cap; R2 cap manual Retry and Revise (3 per stage per run) and make Revise work at the cap; R3 Dashboard failed / rejected / cancelled split (rejections kept and labelled "rejected", cancelled excluded); R4 no code (Underdogs captions off); **R5 (first) Gate 2 Revise/Retry stall, resume loop and crash loop**; R6 push (Gate 1 never arrives, Gate 2 repeats, receipt `DeveloperError`); R7 new-tenant default $10 a week split across YouTube-connected channels; R8 stock long-shot warning answer; R9 Task 7 superseded; R10 tech-debt items 1-12. APP: R12 watermark upload (`Unsupported FormDataPart implementation`); R13 "Reconnect needed" (BE+APP); R14 polish U1-U19. Closure carry-over C1-C7; docs D1; founder checklist F1-F10; Sprint 3 exit checklist inside the task doc. Out of scope: `gpt-image-1.5` migration, thumbnail 403 (Sprint 4). |

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
to it and are left as they are, already landed on `main`. Task 8's branch is literally named
`BUGS_TASK7` due to a real numbering collision — see the warning at the top of this file — and is also
left as-is rather than renamed; it merged to `main` on 2026-09-27 under that name. Real Task 7 (triage
fields)'s branch is `BUGS_LOG_2` — deliberately not another `BUGS_TASK<N>` name, to avoid a third
collision.**

Role tags (`BE`/`FE`/`APP`) still apply per item — see `HOTFIXER_AGENT_PROTOCOL.md`'s **Role Tags**
section — but only describe shipping/verification mechanics, not which branch a commit lands on.

## Full detail
Task docs: `docs/execution/bugs/Sprint3/tasks/task1.md` (archived, see docs/ARCHIVE_INDEX.md), `task2.md`, `task3.md`, `task4.md`, `task5.md`,
`task6.md`, `task7.md`. **No `Sprint3/tasks/task8.md` exists** — dispatched ad hoc, without a task doc, to save
time on an urgent pass; its full spec/scope lives only in its report.
Per-task reports (written once each is actually fixed and verified):
`docs/execution/bugs/Sprint3/reports/task1.md` (archived, see docs/ARCHIVE_INDEX.md), `Sprint3/reports/task2.md`, `Sprint3/reports/task3.md` (per the Task-4
hot-fixer session's report — see Task 3's row above), `Sprint3/reports/task4.md` (on `BUGS_TASK4`, not yet
merged), `Sprint3/reports/task5.md` (on `BUGS_TASK5`, PR #29, not yet merged — now on file in this project),
`Sprint3/reports/task6.md` (merged, PR #31), `Sprint3/reports/task7.md` (once implemented), `Sprint3/reports/task8.md`
(spans PR #33 on `BUGS_TASK7` and PR #36 on `BUGS_TASK8`, both merged — see the collision/deviation
warnings above), `Sprint3/reports/task9.md` (PR #37 on `BUGS_TASK9`, merged — no naming collision).
Hot-fixer agent operating protocol: `docs/execution/bugs/HOTFIXER_AGENT_PROTOCOL.md`.
