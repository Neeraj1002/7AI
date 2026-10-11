# Bugs Task 4: Third Device-Test Round — Bug-Report Redirect Has No Fallback, Login Screen Missing Auth Guard, Magic-Link Base URL & Telegram Delivery Observability

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting — including its Hard rules
and the checkout-location note in `STATUS.md`.**

**Objective**: Close out what real-device testing of Task 3's own fixes turned up: R2's bug-report
redirect has no fallback when the OS doesn't intercept it cleanly (confirmed: lands on Expo Router's own
"Unmatched Route" screen), a real navigation gap on the login screen that makes an intact session look
logged-out, and a magic link whose own text is unusable from a phone plus a Telegram delivery path whose
outcome is currently unobservable either way.

**Note on scope**: the keyboard-overlap item (Task 3's original R4) is **removed from this task** — the
founder is redesigning the login/token-entry screen through the dedicated UI/UX track rather than
patching the current layout, so keyboard handling will be addressed as part of that redesign instead of
here. See the founder/BA chat's findings, handed off separately to that track, for what's currently
implemented and what's wrong with it.

**Duration**: R1 ~1h, R2 ~0.5h, R3 ~0.5h, R4 ~1h (logging only).

**Depends On**: Bugs Task 3 (this task is a direct correction/continuation of that task's R2 and R5 —
R1 and R3 there are unaffected and stay as shipped; R4 there is superseded by the UI/UX track's own
redesign work, not by anything in this task).

**Owning Component**: `app/app/login.tsx`, `app/components/ReportBugButton.tsx`, a new
`app/app/bugs-submitted.tsx`, `studio/src/auth/magic-link.ts`, `studio/src/auth/telegram-token-delivery.ts`,
`studio/src/config/env.ts`.

**Success Criteria**:
1. Submitting a bug report never lands on an "Unmatched Route" screen, regardless of which browser/Custom
   Tabs handler the OS picks for `openAuthSessionAsync`.
2. Navigating to `/login` while a valid session already exists immediately redirects to the authenticated
   area instead of rendering the login form.
3. The magic-link text (console line and any Telegram message) contains a URL actually reachable from a
   phone, never `localhost`.
4. A single test of "request a link with a Telegram Chat ID filled in" produces an unambiguous,
   on-the-record answer via the server console about whether the send was attempted and whether it
   succeeded — no more silent gap between "never tried" and "tried and worked."

## Task Requirement

Founder real-device testing of Task 3's own fixes surfaced these issues, all confirmed by direct code
read against `main` (not assumption).

---

### R1 (Role: `FE`) — Bug-report success redirect has no fallback route

**Where**: `app/components/ReportBugButton.tsx` uses `WebBrowser.openAuthSessionAsync(url,
'sevenai://bugs-submitted')`. No route file exists anywhere under `app/app/` that matches
`bugs-submitted` — confirmed by a full listing of the app's route tree. `openAuthSessionAsync` is
designed to intercept a redirect to its return URL before it becomes a real deep link, but that
interception isn't guaranteed on Android (varies by which Custom Tabs implementation the OS picks).
Confirmed live: a real submit landed on Expo Router's own "Unmatched Route" screen ("Go back" /
"sitemap") instead of closing cleanly.

**Fix**: Add `app/app/bugs-submitted.tsx` as a real, minimal route — a safety net, not a replacement for
the happy path. On mount, it should immediately `router.back()` (or `router.replace` to a sane default)
and can show the same confirmation `ReportBugButton.tsx`'s happy path already shows. No change needed to
`ReportBugButton.tsx` itself — `openAuthSessionAsync`'s normal interception stays the primary path; this
route only catches the case where that interception doesn't fire.

**Success vs. failure — this fallback route is only ever reachable via the success path.**
`bug-report-page.ts`'s own client script only navigates to `sevenai://bugs-submitted` inside its `.then()`
after a successful POST; its `.catch()` (a failed submit) just updates the on-page status text and
deliberately leaves the browser open, per Task 3/R2's own design, so a real failure stays visible for the
tester to read and retry rather than being silently dismissed. There is no failure-path redirect, so
there's nothing for a fallback route to catch on that side — `app/bugs-submitted.tsx` exists purely to
handle a success redirect that the OS didn't intercept cleanly, not to add failure handling.

**Verify**: real device, submit a bug report multiple times; confirm "route not found" never appears,
regardless of which app the OS's URI resolution happens to pick.

---

### R2 (Role: `FE`) — `login.tsx` has no "already signed in" guard

**Where**: `LoginScreen` in `login.tsx` only checks `authLoading` before rendering the login form — it
never checks `useAuth().token`. `(app)/_layout.tsx` has the mirror-image guard (`if (!token) return
<Redirect href="/login" />`), but nothing does the reverse. Confirmed live: after the bug-report
redirect's failed interception (R1 above) landed on an unmatched route, tapping "Go back" popped to
`/login` — and because of this missing guard, the app just rendered the login form and looked logged out,
even though the session was fully intact (confirmed: force-quitting and reopening showed the founder
still signed in).

**Fix**: In `LoginScreen`, after the `authLoading` check, add: `if (token) return <Redirect href="/" />;`
(`token` from `useAuth()`, `Redirect` from `expo-router`). This makes any accidental navigation to
`/login` while already authenticated self-correct immediately, regardless of what specifically causes
that navigation in the future — not just this one bug-report scenario.

**Verify**: while signed in, force navigation to `/login` (e.g. `router.push('/login')` in a debug
build, or repeat R1's original trigger once R1 is also fixed) and confirm it immediately bounces back to
the authenticated home screen instead of showing the login form.

---

### R3 (Role: `BE`, config) — Magic-link text points at `localhost`, unusable from a phone

**Where**: `magic-link.ts`'s `buildBaseUrl()` falls back to `http://localhost:${env.API_PORT}` when
`PUBLIC_API_BASE_URL` isn't set. Confirmed live: a real request produced a link (and would produce the
same text in a Telegram message) pointing at `localhost:4001` — meaningless from a phone, same class of
issue as Bugs Task 1/R2's `apiUrl` default, this time on the server's own output.

**Fix**:
1. Set `PUBLIC_API_BASE_URL` in the server's real `.env.local` to the machine's real LAN IP — an ops/founder
   action, not a code change; document the requirement in `studio/.env.example` if it isn't already
   explained there.
2. Add a boot-time warning so this is never silently wrong again: `if (!env.PUBLIC_API_BASE_URL)
   console.warn('[boot] PUBLIC_API_BASE_URL not set — magic-link text will show localhost, unusable from
   a phone')`.

**Verify**: restart the server with `PUBLIC_API_BASE_URL` set, request a link, confirm the printed (and,
if a chat id is on file, Telegram-texted) URL uses the real LAN IP, not `localhost`.

---

### R4 (Role: `BE`, server console only — no client-facing change) — Telegram delivery outcome is unobservable

**Where**: `magic-link.ts`'s `requestMagicLink` and `telegram-token-delivery.ts`'s `sendTelegramMessage`
— a successful send and a never-attempted send (no `chatId` resolved) both currently produce **zero**
console output; only an explicit failure logs anything. Confirmed live: a real test round couldn't
distinguish "the app never sent a Chat ID" from "it sent fine and the failure is on Telegram's side"
without guessing across multiple round trips.

**Deliberately server-console-only** — this flow has a no-enumeration design running through it (the same
neutral response regardless of whether an email/chat-id is valid or on file); adding a client-visible
Telegram-outcome signal would be a new, narrower leak of that same kind. The founder already has direct
access to the server console while testing, so console-only logging fully resolves the practical problem
without touching the API's response contract.

**Fix**:
1. In `requestMagicLink`, log whether a `telegramChatId` arrived on the request at all:
   `console.log(\`[auth] telegramChatId on request: ${params.telegramChatId ? 'present' : 'none'}\`)`.
2. Log the resolved `chatId`'s presence right before attempting a send:
   `console.log(\`[auth] telegram chat id resolved for ${user.email}: ${chatId ? 'yes' : 'no — console
   fallback only'}\`)`.
3. In `sendTelegramMessage`, log the boolean result explicitly on the success path too, not just
   failures — reuse the value already being returned, don't add a second code path:
   `console.log(\`[telegram-token-delivery] sendMessage to ${chatId}: ${ok ? 'ok' : 'failed'}\`)`.

**Verify**: request a link with a Telegram Chat ID filled in; confirm the console now shows a complete,
unambiguous trail (received → resolved → sent ok/failed) with no gap left to guess at. This closes out
Task 3's own R5 — once this logging is in place and one real test confirms which state it's actually in
(delivered, or a specific named failure), update this task's own report with that final answer rather
than leaving Telegram's status open-ended again.

---

## Schema Impact
None.

## Testing
```bash
npm run build && npm run lint && npm run typecheck
```
Plus each item's own **Verify** section above — R1 and R4 specifically need a real device/real console
check, not just passing type checks.

## Report Template
Same structure as `reports/task1.md`/`reports/task2.md` — state plainly, per item, whether it's confirmed
fixed by direct testing or still founder-verification-pending. R4 in particular should state the actual
observed outcome (delivered successfully, or the specific failure the new logging revealed), not just
"logging added."

## Links & References
- [TASK_TEMPLATE.md](../../templates/TASK_TEMPLATE.md)
- [HOTFIXER_AGENT_PROTOCOL.md](../HOTFIXER_AGENT_PROTOCOL.md)
- `docs/execution/bugs/STATUS.md`
- `docs/execution/bugs/Sprint3/tasks/task3.md` — R2 and R5 there are what this task corrects/completes. R4
  there (keyboard overlap) is out of scope here — see the UI/UX track instead.
