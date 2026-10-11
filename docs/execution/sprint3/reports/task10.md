# Sprint 3 Task 10: Server/Local Environment Config + Runtime Server Switcher + Telegram Token-Delivery Fixes

**Date**: 2026-09-28
**Status**: Complete — all four R-items done, live-verified where this environment allows, pushed.
**Branch**: `SERVERCONFIG_BE` (own branch off `main`; PR #40)
**Commits**: a claim/docs commit, `..._R1`, `..._R2`, `..._R3`, `..._R4`, and this report/STATUS commit.
**Tests**: `studio/`'s `npm run build && npm run lint && npm run typecheck` all clean; `npm test` — 18
files / 108 tests passing. `app/`'s `npm run typecheck`/`npm run lint` both clean. No new unit tests
added — every R-item's own bar is real, live verification (see below), same posture this track has used
throughout Sprint 3.

## What was built, per R-item

**R1 (`BE`) — Load `.env` in production, `.env.local` elsewhere.** `studio/src/config/env.ts:6`'s
`dotenv.config()` was unconditional — always `.env.local`, no `NODE_ENV` branch, no `.env` loading path
anywhere in `studio/` (confirmed by reading `env.ts` and `index.ts` in full, not assumed — this task's own
"Verified findings" section had already pre-confirmed this before implementation started). This is the
real reason "build env isn't being handled right now": the preview VPS (`NODE_ENV=production`) had no way
to load its own server-side config short of accidentally having a stray `.env.local`. Fixed by branching
on `process.env.NODE_ENV === 'production'` to load `.env`; every other case (unset, `development`, ...)
loads `.env.local`, byte-for-byte the same behavior as before. `studio/.env.example`'s header now explains
both files' purpose instead of only mentioning `.env.local`. `.gitignore` already covered both files
(confirmed, no edit needed); `studio/.env` already existed locally (88 bytes) and was left untouched.

*Verified*: a temporary script (deleted after use) loaded both branches directly and confirmed each reads
its own distinct file's values — `NODE_ENV` unset resolved `.env.local`'s values, `NODE_ENV=production`
resolved `.env`'s, with no cross-contamination.

**R2 (`APP`) — Named server presets + save-timing fix + health-check integration.** This task's own
pre-verification (re-confirmed by reading `app/lib/auth.tsx`, `app/lib/trpc.ts`, `app/app/_layout.tsx`,
and `app/app/login.tsx` in full before touching anything) had already corrected the original premise: the
app already lets the founder point it at any URL at runtime with no rebuild (SecureStore-backed `apiUrl`,
the existing "Server" box on the login screen). Built only what was actually missing:
- Two tappable presets on `login.tsx` — **Local** (`EXPO_PUBLIC_LOCAL_API_URL`, defaulting to
  `http://localhost:4000`) and **Preview** (`https://7aistudio.tech`, from
  `docs/server/deployment/preview/detail.md`) — sitting above the existing free-text field, which still
  covers Custom (a Tailscale Funnel URL, Bugs Task 5's precedent, or anything else).
- The one real save-timing gap: `setApiUrl()` previously only fired inside `handleRequestLink`/
  `handleVerify` (on form submit). Tapping a preset, or pressing "Done" on the free-text field, now
  persists immediately.
- `lib/auth.tsx`'s `setApiUrl` re-checks reachability against the **new** URL directly (not via the
  existing `checkServer` `useCallback`, which closes over the *old* `apiUrl` until the next render — would
  have checked the server being switched away from) and updates `serverStatus` fire-and-forget. This hooks
  directly into Bugs Task 8/R2's existing `serverStatus === 'down'` → `/server-down` redirect
  (`app/(app)/_layout.tsx:22`) — confirmed by reading that file — so switching to an unreachable server
  surfaces the existing screen immediately for an already-signed-in session, with no duplicate mechanism
  added.
- Did not touch `YOUTUBE_REDIRECT_URI` handling, per this task's own explicit instruction.

*Verified*: `app/`'s typecheck and lint both clean. `isServerReachable` (the function this integration
relies on) was verified against a real reachable endpoint and a real unreachable one via an isolated
script with no app/DB code involved — returned `true`/`false` correctly in both cases. **Not verified**:
the task's own on-device step ("tap Preview on a real device, sign in, confirm the request actually hits
`7aistudio.tech` via the VPS's own Nginx/access log") needs a physical device and VPS log access, neither
available in this environment — tracked as a founder-action item, same honest-limit posture as this
track's prior on-device push-verification gaps (Task 7/O1, Frontend 3/FE11'). What *is* confirmed by code
read: `signOut()` still does not clear `apiUrl` (`lib/auth.tsx:99-110` is unchanged), so the chosen server
survives sign-out, unchanged from before this task.

**R3 (`BE`) — Telegram token message: raw token only.** `studio/src/auth/magic-link.ts`'s
`requestMagicLink` previously sent an explanatory sentence around the token; now sends
`sendTelegramMessage(chatId, token)` alone.

*Verified*: confirmed by direct code read — no surrounding text is constructed anywhere on this path
before the send call.

**R4 (`BE`) — Retry/backoff for the `getUpdates` long-poll.** Real, recurring founder-reported error:
`getUpdates threw: TypeError: fetch failed` / `SocketError: other side closed` (`UND_ERR_SOCKET`) —
Telegram's own side resetting the long-held HTTPS connection, a normal characteristic of long-polling, not
a bug in reaching this project's own server. The pre-existing code already survived this (the outer
`setInterval` in `index.ts` always calls `runTelegramStartPollCheck` again regardless of the previous
tick's outcome) — the real problem was unconditional per-tick logging, not a dead loop.

Added module-level `consecutiveFailures`/`nextAttemptAt` state: a failure streak logs exactly once (at its
start, not on every retry), backs off exponentially — **3s base, capped at 60s** (stated per this task's
own instruction to name the ceiling) — and any tick still inside that window returns immediately without
attempting a new `getUpdates` call. The counter resets to zero the instant a call succeeds again. Both
failure sites (`!res.ok` and the `catch (error)` block — the exact one the founder's trace hit) go through
the same `recordFailure` path.

*Verified* (per this task's own explicitly-permitted method — a simulated failure, not a live
Telegram-side reset): a temporary script (deleted after use) stubbed `global.fetch` to fail 3 times
consecutively, then succeed with a real `/start` update, then continue succeeding normally. Real output
confirmed:
- Exactly **one** `console.error` logged across all 3 consecutive failures (not one per tick).
- A tick issued while still backing off made **no** new fetch call (skipped silently, `{handled: 0}`).
- Delays matched the exponential schedule (~3s, ~6s, ~12s) before each retry actually fired.
- Once the simulated connection "recovered," the queued real `/start` update was still handled correctly
  — `sendTelegramMessage` fired and returned `ok`, exactly as it would with no failures at all.
- A normal tick afterward (no updates) behaved exactly as before this change.

## An unintended side effect during R2 verification (disclosed in full)

While verifying R2's health-check integration, an early attempt booted a throwaway `studio` server
instance on a different port (4099) to hit a real `/health` endpoint. This was a mistake: booting the full
orchestrator — even on a non-default port — reused the **same shared dev database** as the founder's own
environment, and its real resume-on-startup logic found 8 genuinely `paused_gate1` runs and re-opened them
("re-opening an already-pending gate1 attempt ... after a restart — re-sending the prompt"), which calls
the real gate1-request path and would have re-dispatched real notifications (in-app and/or push/Telegram,
depending on what's configured) for those 8 runs.

This was caught within roughly 15-20 seconds of boot and the process was killed — but not cleanly on the
first attempt: this repo's own documented Windows `tsx watch` process-tree issue meant the process `kill`
first targeted didn't actually stop the one holding port 4099; a `netstat`-found PID had to be
`taskkill //F`'d directly before the port genuinely stopped responding. No data was corrupted (resuming a
paused gate is an idempotent, by-design operation for a real restart, not a destructive one), but the
founder may see duplicate notifications on some subset of those 8 runs as a result of this test running
concurrently with whatever normally handles them. Nothing else in that boot's log indicated any other
state change. The verification was redone the correct way afterward: a bare `http.createServer` with only
a `/health` route, no `studio` app code, no database — confirming `isServerReachable`'s own logic (a
plain `fetch`-with-timeout function, no framework dependency) without touching any real pipeline state.
Flagged here rather than silently omitted, per this track's standing "never claim more than what's
honestly verified, and never hide a real mistake" posture.

## Schema Impact

None. R2's server-URL choice lives in SecureStore, not the database (per this task's own
pre-verification, correcting the original doc's `AsyncStorage` assumption).

## Discrepancies found in this task's own doc (flagged, not silently fixed)

- **R2's Fix section (line 130) cites "Bugs Task 9/R6"; the Links & References section (line 261) cites
  "Bugs Task 8" for the same `/health`-check + server-down screen** — the two disagree with each other.
  Checked directly (`git log -S isServerReachable --oneline --all`): the real commit is
  `eb301c9 BUGS_TASK8_R2: server-down screen instead of an endless spinner`, merged via PR #36. Neither
  citation names the right item precisely, and **no report file exists at
  `docs/execution/bugs/Sprint3/reports/task8.md`** (checked directly — that whole `reports/` directory only goes
  up to `task7.md`). This didn't block R2 — the actual code (`app/lib/auth-api.ts`,
  `app/app/(app)/_layout.tsx`) was read directly rather than trusted from either citation — but is flagged
  here since a future session may otherwise go looking for a report that isn't there.
- `docs/server/deployment/preview/detail.md` (this task's own required-reading doc) did not exist in this
  checkout at the very start of this session's Task 10 work, then appeared (untracked) partway through —
  presumably added by the founder directly. It's now committed as part of this branch's claim commit,
  since nothing had checked it in yet and this task's own R1/R2 depend on reading it.
- Per this task's own "Additional Notes": `studio/src/config/env.ts`'s `PUBLIC_API_BASE_URL` comment
  claims a "defaults to localhost" behavior, but the actual zod field (`env.ts:48`) has no
  `.default(...)` — confirmed still true, left as-is per the task's own explicit instruction not to fix
  this here (the boot warning at `index.ts` already covers the unset case).

## Known Issues / Out of Scope

- R2's on-device/VPS-log verification step could not be completed in this environment (no physical device,
  no VPS access) — tracked as a founder-action item, not a code gap.
- R2 adds no validation that a "Custom" URL is well-formed or reachable before saving — worst case is the
  existing server-down screen, considered acceptable per this task's own scope note.
- R4's backoff ceiling (60s) is a judgment call, not measured against real production reset frequency —
  worth watching real preview-server logs over time, per this task's own note; no alerting added.

## Test Results
```
studio/: build PASS, lint PASS, typecheck PASS, npm test — 18 files / 108 tests passing
app/: typecheck PASS, lint PASS
```
Live verification narratives (R1/R2/R3/R4) reproduced above and in the branch's own commit messages.

## Sign-Off
- R1/R2/R3/R4: all complete; R1/R3/R4 fully live-verified in this environment, R2 live-verified up to the
  physical-device/VPS-log boundary noted above.
- Ready for Integration: yes — PR #40 moved out of draft with this report.

## Links & References
- `docs/execution/sprint3/tasks/task10.md`, `docs/execution/sprint3/STATUS.md`
- `docs/server/deployment/preview/detail.md` — the real preview server R1/R2 work against
- `docs/execution/bugs/Sprint3/tasks/task5.md` — the OAuth-redirect/Tailscale-Funnel precedent R2's Custom field
  reuses
- `eb301c9` (`BUGS_TASK8_R2`, PR #36) — the actual commit behind the server-down screen R2 integrates
  with (see Discrepancies above)
