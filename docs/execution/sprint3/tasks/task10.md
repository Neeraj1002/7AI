# Sprint 3 Task 10: Server/Local Environment Config + Runtime Server Switcher + Telegram Token-Delivery Fixes

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git
Workflow, the `STATUS.md` update this task must make, and the section structure this file follows.

**Note on why this is a Sprint 3 task, not Sprint 4**: same reasoning as Tasks 8 and 9 — Sprint 4
(`docs/execution/sprint4/`) is a separate, larger, already-in-progress initiative (channel
profiles/formats/content-quality configurability) with its own Tasks 1-7. This task is unrelated
infra/config work the founder wants done now, filed as a fourth Sprint 3 reopen on its own branch so
it's never mistaken for real Sprint 3/4 feature work in `git log`/the PR list.

**Read `docs/server/deployment/preview/detail.md` before starting R1.** A real preview deployment now
exists — Hostinger VPS, `https://7aistudio.tech`, `NODE_ENV=production`, its own `sevenai_preview`
database, auto-deploy on merge to `main`. **It's freshly created: clean, no login yet, empty DB.** This
task is what should make the app actually usable against it, alongside local dev — read that doc's
environment-configuration section (§6) before touching anything, so R1's fix is consistent with how that
server is actually already configured, not a guess.

**Objective**: the app should run against either the local dev backend or the deployed preview server,
switchable from the phone at runtime, with no rebuild required — plus two small, real Telegram
token-delivery fixes found along the way.

---

## Verified findings (2026-09-27 — confirmed by reading the actual code on `D:\Study Material\7AI`, not assumed)

Per the founder's standing rule ("never make assumption — always recheck the current code, even on the
slightest doubt"), both R1 and R2 below were re-scoped against what the code actually does before this
revision, not against the original hypotheses. Do not re-litigate these as open questions — they're
confirmed, cite the line numbers below if verifying independently.

**R1's root cause is confirmed, not a hypothesis.** `studio/src/config/env.ts:6`:
```ts
dotenv.config({ path: path.join(STUDIO_ROOT, '.env.local') });
```
This is unconditional — no `NODE_ENV` branch, no `.env` loading path at all, anywhere in `studio/`
(confirmed by reading `env.ts` in full and `studio/src/index.ts` in full — `index.ts:78` only logs
`env.NODE_ENV`, it never branches env-loading on it). Today, in every environment including the preview
VPS, only `.env.local` is ever read. Two things the original task doc assumed still needed doing are
**already true** — don't redo them, just confirm on the actual PR:
- `.env` is already git-ignored: repo-root `.gitignore:7-9` covers `.env`, `.env.local`, and
  `.env.*.local`.
- `studio/.env.example` already exists (3715 bytes) — needs updating for the new `.env` convention, not
  creating from scratch.
- A `studio/.env` file already sits locally (88 bytes) — currently dead weight, since nothing loads it
  yet. Read it before overwriting/deleting anything in it.

**R2's premise was wrong — the app already has a working runtime server switch, no rebuild needed.**
Confirmed by reading `app/lib/auth.tsx`, `app/lib/trpc.ts`, `app/app/_layout.tsx`, and `app/app/login.tsx`
in full:
- `apiUrl` is persisted via Expo **SecureStore** (not AsyncStorage — the original doc's assumption was
  wrong), key `sevenai.apiBaseUrl`, in `lib/auth.tsx:8`. Set via `setApiUrl()`, `lib/auth.tsx:79-82`.
- The login screen (`app/login.tsx:117-145`) already has a "Server" box: current value shown, a
  Change/Done toggle, and a free-text URL field — functionally already what R2's presets idea was meant
  to enable, minus named presets.
- The tRPC client is rebuilt from the stored `apiUrl` any time it changes: `app/_layout.tsx:65-68`,
  `createTrpcClient(apiUrl ?? 'http://localhost:4000', token ?? '')` — the `localhost:4000` fallback only
  ever applies pre-first-set (fresh install), it is not something you're locked into after that.
- `signOut()` (`lib/auth.tsx:99-110`) does **not** clear the stored `apiUrl` — switching servers survives
  logout by default, which is actually convenient for the founder's stated workflow (sign out of preview,
  land on login still pointed at preview, tap Change, type local's LAN IP, sign in against local).
- The one real gap: saving the URL only happens inside `handleRequestLink`/`handleVerify`
  (`login.tsx:74`, `:96`) — i.e. only on form submit, not on typing/toggling "Done" alone. Minor, but
  real UX friction worth fixing.

**Net effect: R2 is not "build a server-URL switcher" — that exists today.** R2's real, remaining scope
is convenience: named presets ("Local" / "Preview" / "Custom") instead of always hand-typing a full URL,
and wiring the switch into Bugs Task 9/R6's health-check so a bad switch surfaces the server-down screen
immediately. This is a smaller task than originally scoped — see the revised R2 below.

**Duration**: R1 ~1-1.5h (root cause already found; this is now a known, scoped fix — read the finding
above, don't re-diagnose), R2 ~1h (presets + health-check wiring only, not building the switch itself),
R3 ~0.5h, R4 ~1-1.5h. ~4-4.5h total (down from the original ~5-6h estimate, since R1/R2 no longer include
open-ended diagnosis).

**Depends On**: Bugs Task 4/R3 (the existing `PUBLIC_API_BASE_URL` boot warning this task supersedes as
a hard requirement, not removes), Bugs Task 5 (the `YOUTUBE_REDIRECT_URI`/Tailscale-Funnel precedent for
phone-reachable URLs — same underlying problem this task solves more generally), Bugs Task 8/9's R6 (the
`/health`-check + "Can't reach the server" screen R2 must integrate with, not duplicate),
`docs/server/deployment/preview/detail.md` (the real preview server this task must work against).

**Owning Component**: `studio/src/config/env.ts` (env loading), `app/lib/auth.tsx` and `app/lib/storage.ts`
(SecureStore-backed `apiUrl` — not AsyncStorage), `app/app/login.tsx` (the existing Server box UI, to be
extended with presets), `studio/src/auth/telegram-token-delivery.ts`.

---

### R1 (Role: `BE`) — Fix server vs. local environment config; load `.env` in production

**Root cause (confirmed, see Verified findings above)**: `studio/src/config/env.ts:6` unconditionally
loads `.env.local` via `dotenv.config({ path: path.join(STUDIO_ROOT, '.env.local') })` — no `NODE_ENV`
branch exists anywhere in `studio/`. This is why "build env isn't being handled" — the preview VPS today
would only pick up config from `.env.local` (if one happens to exist there) or nothing at all, never from
`.env`.

**Fix**:
1. In `studio/src/config/env.ts`, branch the `dotenv.config()` call on `NODE_ENV`: when
   `NODE_ENV === 'production'` (matching how the preview VPS actually runs it — confirm against
   `docs/server/deployment/preview/detail.md` §6/§9), load `.env`; otherwise (local dev, no `NODE_ENV` or
   anything else) load `.env.local` exactly as today, unchanged.
2. `.gitignore` already covers `.env` (repo-root `.gitignore:7`) — just confirm with `git status` after
   creating a local `.env`, no `.gitignore` edit needed.
3. `studio/.env.example` already exists — update it to document both files' purpose (local vs. server)
   rather than creating a new one.
4. A `studio/.env` file already exists locally (88 bytes) — read its current contents before touching it;
   don't overwrite founder-entered values blind.

**Verify**: start the app's backend locally with no `NODE_ENV` set and confirm it reads `.env.local`
(unchanged behavior — regression-check this explicitly). Start it with `NODE_ENV=production` and a real
`.env` file present and confirm it reads that instead, not `.env.local`.

---

### R2 (Role: `APP`) — Named server presets + health-check integration (the runtime switch itself already works)

**Correction to the original scope**: the app already lets the founder point it at any URL at runtime,
no rebuild — the "Server" box on the login screen (`app/login.tsx:117-145`), backed by SecureStore
(`lib/auth.tsx`). Do not rebuild this. R2 is now scoped to what's actually missing:

**Fix**:
1. On the existing "Server" box (`app/login.tsx`), add two tappable presets above the free-text field —
   "Local" (the build-time default from R1's finding — `http://localhost:4000` today, LAN-IP-reachable
   value once R1's env docs make that concrete) and "Preview" (`https://7aistudio.tech`, per
   `docs/server/deployment/preview/detail.md`) — tapping one fills the text field with that value; the
   existing free-text field remains for "Custom" (Tailscale Funnel URL from Bugs Task 5, or anything
   else) — no new persistence mechanism needed, it still flows through the existing `setApiUrl()` call.
2. Fix the save-timing gap: currently `setApiUrl()` only fires inside `handleRequestLink`/`handleVerify`
   (on form submit) — persist it immediately when a preset is tapped or when "Done" is pressed, so the
   founder doesn't have to submit the login form just to lock in a server choice.
3. **Integrate with Bugs Task 9/R6's existing server-down detection, don't duplicate it** — when the
   stored URL changes, re-run the `/health` check against the new URL immediately, so switching to an
   unreachable server surfaces the existing "Can't reach the server" screen right away.
4. Do **not** touch YouTube OAuth's `redirect_uri` handling as part of this — that's the backend's own
   `YOUTUBE_REDIRECT_URI` env var (Bugs Task 5's territory), unrelated to which API host the app itself
   talks to.

**Verify**: on a real device, tap the "Preview" preset (no rebuild), sign in, and confirm a real API call
hits `7aistudio.tech` (check the VPS's own Nginx/access log, not just that the app didn't error). Switch
to "Local," confirm it reconnects to the local backend. Confirm `signOut()` still leaves the chosen server
in place (per `lib/auth.tsx:99-110`, it doesn't clear `apiUrl` today) unless this task deliberately
changes that — state which behavior was kept in the report.

---

### R3 (Role: `BE`) — Telegram token message: send just the token

**Current state**: the login-token Telegram message includes explanatory text around the token (e.g.
"here's your token, use it to log in") — the founder wants to be able to copy-paste it directly, so it
should be just the token, nothing else.

**Fix**: locate the message-composition code in `studio/src/auth/telegram-token-delivery.ts` (or
wherever the `sendMessage` call for token delivery actually builds its text) and change the message body
to be the raw token string alone — no surrounding sentence, no formatting that would need to be edited
out before pasting.

**Verify**: trigger one real magic-link/token delivery and confirm the actual Telegram message received
is exactly the token, character for character — copy it directly into the app's login field and confirm
it works.

---

### R4 (Role: `BE`) — Fix the recurring `getUpdates` crash in the Telegram start-poll loop

**Real error, recurring, from the founder directly**:

```text
[telegram-token-delivery] getUpdates threw: TypeError: fetch failed
    at node:internal/deps/undici/undici:15845:13
    at async runTelegramStartPollCheck (D:\Study Material\7AI-UI\studio\src\auth\telegram-token-delivery.ts:81:17) {
  [cause]: SocketError: other side closed
      at TLSSocket.onHttpSocketEnd (...client-h1.js:959:22)
      ...
    code: 'UND_ERR_SOCKET',
    socket: { localAddress: '192.168.0.101', ..., remoteAddress: '149.154.166.110', remotePort: 443, ... }
  }
}
```

**Note on where this trace is from, before assuming it's the new preview VPS**: the file path in this
trace (`D:\Study Material\7AI-UI\studio\...`) is a local Windows worktree, not the Hostinger VPS (which
would show a Linux path like `/var/www/7AI/studio/...`) — confirm which server(s) this actually recurs
on (check logs on both, don't assume) before scoping the fix to one environment. `149.154.166.110` is a
real Telegram API address — this is the long-poll `getUpdates` connection to Telegram itself getting
reset by the remote side, not a bug in reaching our own server.

**Root cause, likely**: `runTelegramStartPollCheck`'s long-held HTTPS connection to Telegram's
`getUpdates` endpoint is periodically reset by Telegram's side (a known characteristic of long-polling
over HTTPS, more common on less stable networks) — a normal, transient condition that the current code
doesn't handle: one reset throws and isn't recovered from gracefully.

**Fix**: wrap the `getUpdates` call with retry/backoff so a transient `UND_ERR_SOCKET`/fetch-failure
doesn't kill the poll loop or spam the log unbounded — log it once (not on every retry), back off briefly,
and resume polling automatically. Don't let the backoff turn into a busy-loop or a silent permanent stop
if the resets are frequent — pick a sane cap/ceiling and say what it is in the report.

**Verify**: confirm by code read that the loop now recovers from a forced/simulated socket error instead
of dying (a local test double or a deliberately-broken URL, implementer's choice, is fine here — this
doesn't need a live Telegram-side reset to verify the recovery path). Confirm normal operation is
unaffected — a real `/start` sent to the bot is still picked up and still triggers delivery correctly
after this change.

---

## Schema Impact

No schema changes. R2's server-URL choice lives in the app's SecureStore (not the database, and not
AsyncStorage — corrected from the original doc).

## Business Logic / State Transition

No new pipeline control flow. R2 adds presets on top of an already-working client configuration
mechanism — not a state-machine change. R4 makes an existing background poll loop resilient to a
transient network failure — no new state, just a retry around an existing one.

## Testing

```bash
npm run build && npm run lint && npm run typecheck
```

Plus each R-item's own Verify section above — R1 and R2 specifically need a real environment switch (not
just passing type checks), and R4's fix should be demonstrated recovering from a forced failure, not just
read as "looks right."

## Report Template

Generate at `docs/execution/sprint3/reports/task10.md`, same shape as `reports/task9.md`. Since R1/R2's
root causes are now pre-verified in this doc, the report should confirm the fix matches what's described
above (or state precisely where it diverged and why) rather than re-deriving the diagnosis from scratch.

## Additional Notes

- This task's R2 makes Bugs Task 4/R3's `PUBLIC_API_BASE_URL`-must-be-set boot warning no longer a hard
  blocker for phone usability (a runtime switch already covers that gap, confirmed) — but don't remove
  that boot warning, it's still a useful signal for the build-time default's own correctness.
- Bugs Task 5's Tailscale Funnel setup remains valid and useful — R2's "Custom URL" field is exactly
  where a Funnel hostname goes, this task doesn't replace that approach, it adds presets alongside it.
- `studio/src/config/env.ts`'s `PUBLIC_API_BASE_URL` field comment claims a "defaults to localhost"
  behavior, but the actual zod schema (`env.ts:48`) has no `.default(...)` — it's `undefined` if unset,
  not a localhost string. This is a doc/code mismatch noticed while verifying R1, not itself in scope for
  this task — flag it in the report rather than silently fixing it, since it may be intentional
  (the boot warning at `index.ts:89-93` already covers the unset case).

## Known Issues / Future Improvements

- R2 doesn't add any validation that a "Custom URL" is actually well-formed or reachable before saving
  it — worst case is just the existing server-down screen showing until the user fixes or reverts it,
  considered acceptable for this task's scope.
- R4's backoff strategy, once implemented, is worth watching in real preview-server logs for a while to
  confirm the reset frequency is actually low — this task doesn't add alerting for "resets happening
  unusually often," just resilience to individual ones.

## Links & References
- [TASK_TEMPLATE.md](../../templates/TASK_TEMPLATE.md)
- `docs/execution/sprint3/STATUS.md`
- `docs/server/deployment/preview/detail.md` — the real preview server R1/R2 must work against
- `docs/execution/bugs/tasks/task4.md` — R3, the original `PUBLIC_API_BASE_URL` gap this task addresses
  more generally
- `docs/execution/bugs/tasks/task5.md` — the OAuth-redirect/Tailscale-Funnel precedent for
  phone-reachable URLs
- `docs/execution/bugs/reports/task8.md` — R6, the `/health`-check + server-down screen R2 must
  integrate with, not duplicate
- `docs/execution/bugs/STATUS.md` — the real-dev-server environment-finding warning at the top of that
  file, directly relevant to why this task exists

## Git Workflow

This task runs on its own branch, same posture as Tasks 8 and 9.

1. `git checkout main && git pull` from `D:\Study Material\7AI`.
2. `git checkout -b SERVERCONFIG_BE`. Record this exact name in `docs/execution/sprint3/STATUS.md`'s new
   Task 10 row immediately — before the first commit.
3. One commit per R-item: `SERVERCONFIG_TASK10_BE_R<X>: [what it does]`.
4. After R1's first commit is pushed, open the PR as a draft:
   `gh pr create --draft --title "SERVERCONFIG_BE: Server/Local Env Config + Runtime Server Switcher + Telegram Fixes" --body "Tracking PR for Task 10. Live status: docs/execution/sprint3/STATUS.md (Task 10). Do not merge until marked ready for review."`
5. After R4 lands and is pushed, write the report and this task's `STATUS.md` row update, commit them
   together, then `gh pr ready`.
6. **Never push or merge to `main` directly** and **never commit to a branch this task didn't create** —
   same as every other track.
