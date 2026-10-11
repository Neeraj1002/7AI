# Bugs Task 3: Second Device-Test Round — Tenant Data Leak, Bug-Report Tool, Script-Review Gate, Keyboard Overlap, Magic-Link Delivery

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting — including its Hard rules
and the checkout-location note in `STATUS.md`.**

**Objective**: Close a second round of founder-found issues, surfaced while testing the app for real,
in priority order — starting with a confirmed cross-tenant authorization gap that's more urgent than
its original report order, because the founder is about to stand up a second, real production tenant
(`7aistudiochannel@gmail.com`) alongside the existing test tenant (`neeraj100296@gmail.com`).
**Duration**: R1 ~2-3h, R2 ~2h, R3 ~3-4h, R4 ~2-3h (audit + fix), R5 ~3-4h (bot setup + send + `/start`
long-poll + login-screen field). R6 is a design note, not a build item this round.
**Depends On**: Bugs Task 1 + 2 (both code-complete, founder-verification pending — this task doesn't
block on that verification, it's independent follow-on work found during the same testing pass).
**Owning Component**: `studio/src/api/routers/runs.ts`, `studio/src/models/repositories/pipeline-run.repository.ts`,
`app/components/ReportBugButton.tsx` (currently only in the `7AI-frontend` checkout — see R2's own
worktree note), `studio/src/api/bug-report-page.ts`, `studio/src/agents/script-review/`,
`studio/src/agents/gate1/`, `studio/src/run-pipeline/state-machine.ts`, `studio/src/auth/magic-link.ts`,
a new `studio/src/auth/telegram-token-delivery.ts`, `app/app/login.tsx`.
**Success Criteria**: (1) A signed-in user on one tenant can never see or open another tenant's runs,
confirmed with two real tenants, not just code review. (2) A real bug report, submitted from a real
device, is confirmed in `bug_reports` afterward, with clear on-screen success/failure feedback and the
in-app browser closing itself. (3) A script scoring below 7 never reaches Gate 1 — it's sent back for a
fresh script-generation attempt automatically, and this loop is bounded (see R3's own note on retry
limits). (4) No text input on any screen is covered by the on-screen keyboard when focused. (5) A magic
link's token arrives via Telegram (after a one-time `/start` chat-id handshake), with the plain console
token line kept as a fallback — mobile sign-in never requires manually editing a URL.

## Task Requirement

Founder real-device testing surfaced six issues in one pass (paraphrased from the founder's own report,
verbatim details preserved per-item below). Ranked by real severity, not report order — R1 was reported
third but is the most severe (a live cross-tenant data exposure, worse now than when first written,
given a second real tenant is about to go live), and the founder agreed to reorder around it.

---

### R1 (Role: `BE`) — Queue screen and run-detail leak every tenant's runs to every signed-in user

**Where**: confirmed by direct code read, not assumption.

- `studio/src/api/routers/runs.ts`'s `list` procedure (backs the Queue screen, "GET /runs — Queue
  screen (Task 2)"): `.query(async ({ input }) => { return listRuns(input); })` — takes `input` only,
  never touches `ctx` at all. No tenant filter reaches the query.
- `studio/src/models/repositories/pipeline-run.repository.ts`'s `listRuns(params)` — signature is
  `{ statuses?, stage?, channelId? }`, **no `tenantId` parameter exists at all**. Its Prisma `where`
  clause only ever filters by status/stage/channelId, all client-suppliable, none tenant-scoped. This
  queries every `PipelineRun` row in the database, across every tenant, unconditionally.
- `runs.ts`'s `get` procedure (backs the run-detail screen): `getRunDetail(id)` calls
  `findPipelineRunById(id)` — no ownership/tenant check at all, unlike `create` (which explicitly checks
  `channel.tenantId !== ctx.tenantId` — Sprint 3 Hardening, see that code's own comment) and
  `assertGateOwnership` (used by `gate1`/`gate2`/`tagPostHoc`). `list`/`get` were missed by that
  hardening pass entirely — confirmed by reading all four procedures side by side in the same file.

This is a real, live authorization gap, not a display quirk: any signed-in user, on any tenant, can
currently see and open **every** run from **every** tenant, including brief text, script content, and
review logs — confirmed exactly matching the founder's report ("the queue screen is displaying all the
runs from development tenant in Prod tenant, if I click on any it takes me to that run screen").

**Fix**:
1. `listRuns(params)` gains a required `tenantId: string` parameter, added to its `where` clause
   (`{ tenantId, ...(existing filters) }`). Every call site updates — `runs.ts`'s `list` becomes
   `.query(async ({ input, ctx }) => listRuns({ ...input, tenantId: ctx.tenantId }))`. Audit every other
   caller of `listRuns` (`resume-on-startup.ts` and similar use `listRunsByStatus`, a different function
   — confirm neither that nor anything else calls the now-changed `listRuns` signature without a
   tenantId available in scope).
2. `getRunDetail(id)` (or the `get` procedure directly) gains a tenant check identical in shape to the
   `create` mutation's own: fetch the run, then `if (run.tenantId !== ctx.tenantId) throw new
   TRPCError({ code: 'FORBIDDEN', message: ... })` before returning channel/stages/reviewLogs — same
   FORBIDDEN convention `assertGateOwnership` and `create` already use, not a new error shape.
3. Grep the whole `api/routers/` tree one more time for any other `publicProcedure` that reads a
   repository list/find function without threading `ctx.tenantId` through — this task's own audit found
   two, Sprint 3 Task 1 (J3)'s audit may not have covered `runs.list`/`runs.get` specifically since J3
   predates the Queue screen's dedicated `list` filter shape (frontend Task 2 added it after J3 shipped).

**Verify**: with the founder's two real tenants (`neeraj100296@gmail.com` test, `7aistudiochannel@gmail.com`
production, once created — see Founder's own pending decision on when to run `invite-tenant.ts`), create
a run under each, sign in as one, and confirm the Queue only ever lists that tenant's own runs, and
directly hitting the other tenant's run ID via `runs.get` returns FORBIDDEN, not the run.

---

### R2 (Role: `FE` + `BE`, no native change) — Bug-report tool: submit does nothing, no feedback, browser never closes

**Where**: `app/components/ReportBugButton.tsx` — **only exists in the `7AI-frontend` checkout, not
`main`** (confirmed: not present anywhere under `D:\Study Material\7AI\app`, only under
`D:\Study Material\7AI-frontend\app\components\`) — flag this explicitly when branching, since it means
this checkout's own git history/branch point differs from the other FE work already merged to `main`.
Opens the report form via `WebBrowser.openBrowserAsync(url)` (`expo-web-browser`), a fire-and-forget
open with no return signal to the app. `studio/src/api/bug-report-page.ts` serves a bare, no-framework
HTML page whose inline `<script>` posts to `/bugs` and only updates a `#status` div's text on
success/failure — no auto-close, no scroll-into-view, and (founder-confirmed by direct retest) tapping
Submit sometimes produces **no visible change at all**, not even the button disabling — most likely the
on-screen keyboard covering the button/status area (see R4) or the page's inline script not yet attached
when the tap lands, though this needs live confirmation once R4's keyboard fix lands, since the two may
be the same root cause wearing two different symptoms.

**Fix**:
1. Switch `ReportBugButton.tsx` from `WebBrowser.openBrowserAsync(url)` to
   `WebBrowser.openAuthSessionAsync(url, returnUrl)`, where `returnUrl` is a deep link using the app's
   existing registered scheme (`app.json`'s top-level `"scheme": "sevenai"` — no new native scheme
   registration needed, confirmed already present). e.g. `sevenai://bugs-submitted`.
2. `bug-report-page.ts`'s success handler (`.then(function () { ... })` after a successful POST)
   redirects to that same URL (`window.location.href = 'sevenai://bugs-submitted'`) instead of just
   clearing the textarea — `openAuthSessionAsync` resolves and auto-closes the in-app browser the moment
   that redirect fires, giving the app a definite, unambiguous "done" signal instead of a status div the
   user has to notice themselves.
3. `ReportBugButton.tsx`'s `handlePress` awaits that promise and shows the app's own toast/confirmation
   (not the webview's) once it resolves — matches the deep-link handler pattern this app's own magic-link
   flow already uses (FE7, per `lib/auth-api.ts`'s comment), reusing an established pattern rather than
   inventing a new one.
4. On the failure path (fetch throws, or the server 400/500s), keep the browser open and the existing
   red error text — only the success path should redirect/close, so a real failure stays visible for the
   tester to read and retry, not silently dismissed.
5. Move `ReportBugButton.tsx` (and this whole fix) onto `main` in this same branch, alongside fixing it —
   don't leave it stranded in `7AI-frontend` a second time.

**Verify**: real device, real tap — confirm the in-app browser closes itself within ~1s of a successful
submit, the app shows its own confirmation, and the row appears in `bug_reports` (Prisma Studio or a
direct query) immediately after.

---

### R3 (Role: `BE`) — Script Review's score never blocks anything; Gate 1 reject doesn't regenerate

**Where**: confirmed by direct code read.

- `studio/src/agents/script-review/index.ts`'s own header comment states the current design plainly:
  "no auto-revision loop, a low score still reaches Gate 1 for the human to judge" — this is deliberate,
  not a bug, but it's not what the founder wants going forward (founder's own decision this round: "Auto-skip
  Gate 1 below 7").
- `studio/src/run-pipeline/state-machine.ts`'s gate1 handling (~line 494-518): a `reject` outcome sets
  `PipelineRun.status = 'failed'` and stops — there is no regeneration/retry path anywhere in this file
  for a rejected Gate 1. This matches the founder's report exactly ("I submitted a review of script and
  it never went through regeneration") — not a bug, since no such loop was ever built, but confirms the
  founder's expectation has no code behind it yet.

**Fix** (founder's decision: auto-skip Gate 1 below 7, auto-retry script generation):
1. After `reviewScript()` returns (in the script-generation/review stage runner, immediately after the
   review's `output.score` is available, before `requestGate1Decision` is ever called), branch on
   `output.score < 7`:
   - Below 7: do **not** call `requestGate1Decision` at all this attempt. Insert a `ReviewLog` row
     (`agent: 'script-review'`, `verdict: 'auto-reject'`, `rationale` = the review's own `notes`) so the
     low score and why are still visible in the run's history, then re-invoke `generateScript` for a
     fresh attempt (same shape as this file's existing stage-retry pattern — check
     `retry-with-backoff.ts`'s existing convention before inventing a new one).
   - At or above 7: unchanged — proceeds to `requestGate1Decision` exactly as today.
2. **Bound the loop** — this is the one real risk in this fix: an unbounded auto-retry against a niche
   that consistently scores low could loop forever, burning LLM cost with no human ever seeing it. Cap
   auto-retries at a small fixed number (recommend 3, matching this file's other retry-count
   conventions — confirm against `PipelineRun.retryCount`'s existing use before adding a second counter
   next to it) — on exceeding the cap, **do** send it to Gate 1 regardless of score, with the review
   notes and a clear "auto-retry limit reached" flag in the gate message, so a genuinely hard brief still
   reaches a human rather than failing silently forever.
3. `requestGate1Decision`'s own reject handling (still reachable via a human explicitly rejecting a
   ≥7-scoring script at Gate 1, or the capped-out case above) stays exactly as-is — `status: 'failed'`
   remains correct for a human's explicit reject; this task only changes what happens **before** a script
   reaches a human, not what a human's own reject means.

**Verify**: force a low-scoring script (a deliberately weak test brief, or a temporary score override in
a test), confirm it never reaches Gate 1, confirm a `ReviewLog` row records the auto-reject, confirm a
second real attempt fires automatically, and confirm the retry cap actually stops the loop and reaches
Gate 1 when hit.

---

### R4 (Role: audit first — may turn out `FE`, `APP`, or both) — Keyboard overlaps text inputs on every screen

**Where**: not yet isolated to a specific screen or cause — founder reports this "across all screens,"
which is broad enough to need a real audit before assuming one fix covers it. Two candidate causes,
not mutually exclusive:
1. Missing/inconsistent `KeyboardAvoidingView` (or an equivalent scroll-into-view pattern) around
   screens with a `TextInput` — a per-screen React Native fix, `FE` role, OTA-eligible.
2. `app.json` has no `android.softwareKeyboardLayoutMode` key set — Android's default
   `windowSoftInputMode` behavior can leave focused inputs behind the keyboard even with a correct RN
   layout. If this needs setting, it's a native config change — `APP` role, needs a rebuild, same
   bundling logic Task 2 already established (check for other pending native changes to bundle in
   before shipping a native-only rebuild for this alone).

**Fix**: audit every screen with a `TextInput` (`login.tsx`, `new-brief.tsx`, the bug-report page is a
web page not RN so out of scope here, any others found in the audit) for its current keyboard-handling
approach. Apply a consistent pattern across all of them — don't fix one screen ad hoc while leaving
others as they are, since the founder's report was "all screens," implying whatever's wrong is systemic,
not a single screen's local bug.

**Verify**: real device, every screen with a text field — focus each field, confirm it (and its
surrounding context, e.g. the field label and any validation text) stays visible above the keyboard.

---

### R5 (Role: `BE` + small `FE`, no native change) — Magic-link delivery: Telegram bot, with console-log fallback

**Where**: `studio/src/auth/magic-link.ts`'s `requestMagicLink` only ever `console.log`s the link, built
from `buildBaseUrl()` — `env.PUBLIC_API_BASE_URL ?? \`http://localhost:${env.API_PORT}\``, meaningless on
a phone if that env var isn't set to the founder's real LAN IP. No real delivery channel exists —
confirmed by re-checking the live `main` checkout: `notify-founder/` (which held a prior
`telegram-channel.ts`/Telegram chat-id linking flow) no longer exists at all — it was deliberately
removed in Sprint 3 Task 7/O2, specifically because a magic-link request happens before any session
exists, so the old per-user-linked-Telegram routing had no recipient to resolve. This isn't "turn it back
on," it's a small rebuild, scoped narrowly to this one flow.

Founder's decision this round: Telegram bot delivery (a Chat ID field on the login screen, right below
email), console-log token line kept as a zero-cost fallback regardless. `User.telegramChatId` — added in
the Sprint 3 Task 1 (J1) migration, reserved for exactly this kind of use, currently unused since the old
Telegram module was removed — is reused as-is, no schema migration needed.

**Fix**:
1. **Bot setup (founder action, not code)**: create a bot via Telegram's `@BotFather`, get a bot token.
   Add it as a new optional env var, `TELEGRAM_BOT_TOKEN` — optional by design (`env.ts`'s existing
   `.optional()` convention for things that gate a feature, not break startup if unset), so a checkout
   without it configured just falls through to console-only, same as today.
2. **Sending** — a small new module (e.g. `studio/src/auth/telegram-token-delivery.ts`), a single
   `fetch` call to `https://api.telegram.org/bot${token}/sendMessage` with `{ chat_id, text }` — no new
   npm dependency, Node's global `fetch` is already used elsewhere in this codebase. Called from
   `requestMagicLink` right alongside the existing console.log, never instead of it (console stays as the
   fallback per the founder's own call).
3. **Learning a Chat ID in the first place** — Telegram won't let a bot message someone who hasn't
   messaged it first. Needs a minimal `/start` handler: a small periodic long-poll against Telegram's
   `getUpdates` endpoint (same `setInterval`-against-an-external-source shape `src/index.ts`'s other
   background checkers already use — "cron + Postgres, no magic" — not a webhook, which would need a
   public HTTPS endpoint this LAN-testing setup doesn't have). On receiving `/start` from a chat, reply
   with that chat's numeric ID so the tester can copy it into the app.
4. `requestMagicLink` gains an optional `telegramChatId` param. When present on a request for a
   recognized email, upsert it onto that `User.telegramChatId` (overwrite if changed — keeps it
   self-healing rather than a one-time-only save) and send to it immediately. When the field is left
   blank on a later request, fall back to whatever's already stored on `user.telegramChatId`, if any —
   this is what makes "leave it blank after the first time" work, entirely server-side, no client lookup
   needed. Consistent with this flow's existing no-enumeration design: never add an endpoint that tells
   the client whether an email/chat-id is already on file — the server just silently does the right thing
   internally, exactly like `requestMagicLink`'s existing unrecognized-email handling already does.
5. `POST /auth/request-link` (`api/server.ts`) accepts the new optional `telegramChatId` field in its
   body and threads it through.
6. Login screen (`login.tsx`): a new, optional "Telegram Chat ID" field directly below the email field,
   sent along with the request. Purely a per-device convenience (not account lookup, to avoid the same
   enumeration concern above): the entered value is also saved locally via the existing
   `SecureStore`-backed `storage.ts` (same pattern already used for the remembered API URL) so this
   device pre-fills it automatically next time, without needing a server round trip to know it.

**Verify**: from a clean state, message the bot `/start`, confirm it replies with a chat ID; paste that
into the login screen alongside the founder's email and request a link; confirm the token arrives in
Telegram within a few seconds and still appears in the console log; request a second link with the Chat
ID field left blank and confirm it still arrives in Telegram (proving the server-side fallback to the
saved `telegramChatId` works, not just the first-time path).

---

### R6 — Not a build item this round: stale/pending runs overcrowding the queue (design note only)

Founder's own framing, preserved: cancelling one stale run's notification resolved *all* pending
notifications at once — founder explicitly says this is expected/by-design, not something to fix here.
The actual ask is forward-looking: pending/paused runs currently sit indefinitely with no archival or
"dormant" state, and as testing volume grows this will overcrowd the Queue (worsened further once R1's
fix means each tenant's queue is real and dedicated, no longer accidentally hidden by cross-tenant
clutter). No fix specified yet — flagging here so it isn't lost, revisit as a real task once R1-R5 land
and the founder has a chance to say what "dormant" should mean (auto-fail after N days? a separate
archived-but-visible state? something else?).

---

### R7 — Other bugs the founder noted but hasn't recalled/logged yet

Explicitly flagged by the founder as "there were other bugs that I forgot now, I'll use and log them" —
once R2 lands, the bug-report tool itself should be the founder's own logging path for these, rather than
relaying them through chat one at a time. No action here beyond noting the intent.

## Schema Impact
None for R1, R2, R4, R5. R3 adds no new table — reuses `ReviewLog` (already supports arbitrary
`agent`/`verdict`/`rationale` values, confirmed by its existing `'human'`/`'founder-post-hoc'` agent
values) with a new `agent: 'script-review'`, `verdict: 'auto-reject'` combination — no migration needed.

## Testing
```bash
npm run build && npm run lint && npm run typecheck
```
Plus each item's own **Verify** section above — several of these (R1's cross-tenant check, R2's real
device submit, R3's auto-retry loop, R4's keyboard behavior, R5's console output) need a real run, not
just passing type checks.

## Report Template
Same structure as `reports/task1.md`/`reports/task2.md` — state plainly, per item, whether it's
confirmed fixed by direct testing or still founder-verification-pending, and don't claim R1's fix is done
without an actual two-tenant cross-visibility test (this is the one item on this task where "the code
looks right" isn't sufficient sign-off, given what's at stake).

## Links & References
- [TASK_TEMPLATE.md](../../templates/TASK_TEMPLATE.md)
- [HOTFIXER_AGENT_PROTOCOL.md](../HOTFIXER_AGENT_PROTOCOL.md)
- `docs/execution/bugs/STATUS.md`
- `docs/execution/bugs/Sprint3/tasks/task1.md`, `docs/execution/bugs/Sprint3/tasks/task2.md`
