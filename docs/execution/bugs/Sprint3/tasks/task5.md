# Bugs Task 5: YouTube Connect Fails — OAuth redirect_uri Resolves to a Private IP

**Read `docs/execution/bugs/HOTFIXER_AGENT_PROTOCOL.md` in full before starting** — this is a bugs-track
task, one `BUGS_TASK5` branch, one PR, per that protocol's Release & Branch Model. `TASK_TEMPLATE.md`
still governs the shape of the work itself.

**Founder-reported, live**: attempting to connect YouTube for `7aistudiochannel@gmail.com` via the real
in-app connect flow (Sprint 3 Task 5/M2) produced a real Google `400`:
`device_id and device_name are required for private IP: http://192.168.0.101:4001/oauth2callback`.

**Root cause (confirmed against known OAuth behavior, not yet against this session's exact current
code — confirm by direct read as R1's first step)**: Google's OAuth authorization server refuses a
`redirect_uri` whose host is a private/LAN IP address (RFC1918 — `192.168.0.101` is in that range). It
only accepts `localhost`/`127.0.0.1` or a verified public domain. The "device_id/device_name" wording is
Google's generic message for "this redirect_uri shape isn't allowed" — it is not inviting those
parameters to be added; there is no code-level workaround that satisfies Google with a private IP still
in the URL.

**A wrong turn already proposed once — do NOT build this**: a suggested "fix" framed the ask as *"enable
private IP callback URLs and supply the required `device_id`/`device_name` parameters Google is asking
for."* This does not exist as a buildable option for this OAuth client. `device_id`/`device_name` are not
extra parameters of the standard web/installed-app OAuth 2.0 authorization-code flow this YouTube
connect uses (the one with `youtube.upload`/`youtube.readonly` scopes) — they belong to an unrelated
Google flow (limited-input/device-pairing style, e.g. Nest/Smart Device Management local-network device
linking) for a differently-registered OAuth client type. There is no server-side setting, request
parameter, or app-side code change that makes Google's authorization server accept a private IP in
`redirect_uri` — confirmed against Google's own OAuth 2.0 policy docs (HTTPS-or-`localhost` only) and
against multiple unrelated projects that hit this exact error message (a Home Assistant Nest integration,
a GoCD OAuth plugin) — every real fix in every case was to stop pointing `redirect_uri` at a raw private
IP, never to add parameters. It also doesn't matter which device (the Android APK vs. a desktop browser)
initiates the connect flow — Google redirects back to wherever the **backend's** `/oauth2callback` route
is reachable, and that reachability is what has to satisfy Google's rule, regardless of what device
started the browser session. **The only real fix is R1 below**: stop using a private IP as the redirect
base, full stop — not supporting it with extra parameters.

**Why this happened now, not before — corrected 2026-09-28 by direct code read (R1 complete)**: the
task's original hypothesis here was wrong and is kept below only as a record of what was suspected before
verification. **What's actually true, confirmed by direct read of `youtube-oauth-connect.ts`**: the
OAuth connect flow already read its own dedicated `YOUTUBE_REDIRECT_URI` env var — it was never derived
from or coupled to `PUBLIC_API_BASE_URL`. The two were already cleanly separated in code. The real,
mundane cause was simply that `YOUTUBE_REDIRECT_URI`'s own value, in the `.env.local` this instance ran
against, was itself set to the LAN IP (`http://192.168.0.101:4001/oauth2callback`) — a plain
misconfiguration of an already-independent variable, not an architectural coupling that needed fixing.
The original (superseded) hypothesis is preserved verbatim below for the record:

> `PUBLIC_API_BASE_URL` was deliberately set to the LAN IP (`http://192.168.0.101:4001`) so the
> Telegram/magic-link text stays reachable from a phone (Bugs Task 4/R3's whole point). That's correct
> for a link a phone opens directly — there's no third-party server-side validation of that URL. It is
> very likely (confirm by direct read) that `channels.getYoutubeConnectUrl`'s `redirect_uri` is built
> from that same `PUBLIC_API_BASE_URL` value (or a similarly-derived one), which breaks OAuth
> specifically, since Google itself validates the redirect_uri host server-side.

Sprint 3 Task 5's own known-issue note already flagged a related mismatch here (`redirect_uri` pointing
at port 3000 while `/oauth2callback` only exists on port 4000) — this task is the real, live-blocking
descendant of that same underlying gap, but the gap was a misconfigured value, not a missing separation.

**Out of scope per the protocol's own guardrails — do not attempt**: this task does not add or change
any OAuth scope, does not touch auth/session/token logic, and needs no schema migration. If investigation
turns up something that does require one of those, stop and flag it rather than proceeding.

---

### R1 (Role: `BE`) — Give the OAuth connect flow its own, Google-legal redirect base

**Status: done, live-verified against Google's real endpoint — see "Resolution" section below.**

**Where**: `studio/src/manage-channels/youtube-oauth-connect.ts` (confirmed by direct read — not
`channels.ts` as originally guessed) already reads its own `YOUTUBE_REDIRECT_URI` env var (from
`config/env.ts`; the same var is shared by all three other YouTube clients).

**Fix** (as originally planned; step 1's outcome changed what step 2 needed):
1. ~~Confirm by direct read whether a dedicated `YOUTUBE_REDIRECT_URI` env var already exists and is
   actually used, or whether `redirect_uri` is derived from `PUBLIC_API_BASE_URL` (or hardcoded).~~
   **Confirmed: the dedicated env var already existed and was already in use.** No code-level
   separation was needed. (`PUBLIC_API_BASE_URL` is read only by `magic-link.ts` — genuinely unrelated.)
2. ~~Ensure the OAuth connect flow's `redirect_uri` is driven by its own env var...~~ **Not needed** —
   already true. Only the variable's *value* needed fixing (done in the target `.env.local`; see below).
3. Set/confirm the real `.env.local` value: `http://localhost:4001/oauth2callback` for local testing —
   **done** for the bugs worktree's own `.env.local` (the other two checkouts' `.env.local` files had
   `http://localhost:3000/oauth2callback` — the older port mismatch already known from Sprint 3 Task 5).
   This value still needs registering as an authorized redirect URI on the OAuth client in Google Cloud
   Console — **a founder action, not yet confirmed done** (see "Yours to do" below).
4. **Boot-time guard, matching this repo's established pattern** — **done**: `redirect-uri-guard.ts`
   (new module, `isPrivateIpRedirectHost()` — true for `10/8`, `172.16/12`, `192.168/16` hosts; false for
   `localhost`, `127.x`, public hosts and DNS names, and unparseable input) plus a `[boot]` warning in
   `index.ts`, placed next to the existing `PUBLIC_API_BASE_URL` warning.

**Verify**: real check against Google's actual endpoint — **done, see "Resolution" below**. The boot
warning line itself firing on a live server boot was **not** exercised (the hot-fixer intentionally
avoided booting the full server against the shared dev DB — see "Resolution" for why).

**If testing from the Android APK specifically requires completing consent on the phone itself** (not
the desktop machine running the server): `localhost` won't be reachable from the phone's own browser.
**This is now R2 below** — a Tailscale Funnel is the chosen, built-out path (not ngrok); see that
section for the real setup steps and live-check results.

---

### R2 (Role: `BE`, docs/verification only) — Phone testing via Tailscale Funnel

**Status: done — documentation, guard-test coverage, and a live Google check are complete; the actual
Tailscale account/Funnel setup and Google Console registration remain founder actions, same posture as
R1's Console registration.** Nothing here is scripted or automated — there's no code path that could do
Tailscale's own account setup or invoke `tailscale funnel` on your behalf.

**Why Tailscale over ngrok**: `localhost` isn't reachable from the phone's own browser, and a raw LAN IP
is rejected by Google (R1). A Tailscale Funnel URL is a real public HTTPS DNS name (`*.ts.net`), which
Google accepts, and — unlike ngrok's free tier — its hostname is **stable across restarts**, so the
Google Console registration only has to be done once, not re-done every time the tunnel restarts.

**Founder-side setup steps** (manual, not built — nothing to verify here beyond what's below):
1. Install Tailscale on the machine running the studio server and sign in (one-time).
2. Enable Funnel for the tailnet in the Tailscale admin console if not already on (may depend on plan tier).
3. Run `tailscale funnel 4001` — it prints a stable `https://<machine-name>.<tailnet>.ts.net` URL.
4. Set `YOUTUBE_REDIRECT_URI=https://<that-hostname>/oauth2callback` in `.env.local` and restart the server.
5. Register that **exact** URL as an additional authorized redirect URI in Google Cloud Console, alongside
   the `localhost` one from R1 (an OAuth client can hold multiple redirect URIs — you don't have to choose
   only one).

**What's actually built and verified**:
- The boot guard was extended with a 4th test case confirming it does **not** flag a `*.ts.net` host (it
  matches only literal RFC1918 IPv4 addresses, so a DNS name correctly passes through silently). 4/4 guard
  tests pass.
- `.env.example` has a one-line Funnel pointer.
- **Live check directly against Google**, using a placeholder hostname (`my-machine.tail1a2b3c.ts.net`,
  since the hot-fixer session doesn't have your real one):
  ```
  ts.net    -> redirect_uri_mismatch                                  (shape accepted; just not registered)
  LAN IP    -> invalid_request: device_id and device_name are required for private IP
  localhost -> proceeds to sign-in (no error)
  ```
  So Google does **not** reject the `*.ts.net` shape the way it rejects a private IP — the mismatch is
  the expected, correct response for a hostname that simply isn't registered yet on the OAuth client, and
  should clear once your real Funnel URL is added to Console (step 5 above). This does not by itself prove
  your real hostname will complete a full consent end to end — only an actual consent will.

**Real-world confirmation, 2026-09-27**: this predicted behavior has since been independently confirmed
against your actual Funnel hostname — with `YOUTUBE_REDIRECT_URI` set to your real
`https://fcg-thinkpad.tail2f1641.ts.net/oauth2callback`, the connect flow reached Google and was rejected
with exactly `redirect_uri_mismatch`, not the old private-IP `400`. That's the expected R2 outcome, not a
new bug — it means the Funnel/env-var setup (steps 1-4) is working correctly, and the one remaining gap is
step 5: registering that exact URL in Google Cloud Console.

---

## Resolution — what was actually built and verified (2026-09-28, R1; 2026-09-27, R2)

Reported directly by the hot-fixer session that worked this task (report now on file at
`docs/execution/bugs/Sprint3/reports/task5.md`):

- **Boot guard**: `redirect-uri-guard.ts` (`isPrivateIpRedirectHost()`, 4-case unit test including the
  `*.ts.net` non-match case added for R2) plus a `[boot]` warning in `index.ts` when the resolved
  `YOUTUBE_REDIRECT_URI` host is a `10/8`, `172.16/12`, or `192.168/16` address.
- **`.env.example`**: now documents that the value must be `localhost` or a public HTTPS domain (a
  Tailscale Funnel URL included), defaults to port 4000 (the API port) instead of the previous, wrong
  3000, and has a one-line Funnel pointer for R2.
- **`.env.local` (bugs worktree only)**: `YOUTUBE_REDIRECT_URI` changed to
  `http://localhost:4001/oauth2callback` for R1's own verification. Gitignored, so not in the PR —
  **whichever checkout the server actually runs from needs its own correct value applied** (now the real
  Tailscale hostname, per the founder's own live test on 2026-09-27).
- **Docs**: this task doc and `docs/execution/bugs/Sprint3/reports/task5.md` were written by the hot-fixer
  session; this file's own correction/merge pass (this section and R1/R2 above) reconciles the task doc's
  original, unverified hypothesis and folds in R2's Tailscale work, which the hot-fixer session built and
  reported separately from R1.
- **Live check directly against Google's real OAuth endpoint** (no browser, no DB), for both R1 and R2:
  the old LAN URI redirected to Google's real `invalid_request` error page, reproducing the founder's
  original failure exactly. The `localhost:4001` URI redirected to Google's normal sign-in page. A
  placeholder `*.ts.net` URI produced `redirect_uri_mismatch` — the correct, expected response for an
  unregistered-but-otherwise-valid hostname, not a rejection of the shape itself. **This exact
  `redirect_uri_mismatch` result was independently reproduced against the founder's real Funnel hostname
  on 2026-09-27** (see R2 above) — confirming the prediction held in practice, not just in the hot-fixer's
  own placeholder test.
- **Not done, deliberately**: the full server was not booted against the shared dev DB to see the boot
  warning line fire for real — `main`'s newest migration (`channels_default_privacy_and_updated_at`,
  from Sprint 3 Task 8) isn't applied there yet, and the hot-fixer chose not to run it or compete with
  the running server's own Telegram polling. A real end-to-end consent (actually clicking through
  Google's sign-in and landing back on a real, working connected channel) also hasn't been completed —
  this is now the single largest remaining gap, blocked only on the Google Console registration step.
- **Branch/PR**: `BUGS_TASK5`, draft PR
  [#29](https://github.com/Neeraj1002/7AI/pull/29) — **still a draft, not merged, not marked ready.** R1
  and R2 are both reported as committed to this same branch (per the hot-fixer's own report); **not
  independently re-confirmed from this chat** (no live git access from here) — correct on sight if a
  future session finds otherwise.

**Yours to do (founder actions — none of these can be done from a hot-fixer session)**:
1. **Register your real Tailscale Funnel URL** —
   `https://fcg-thinkpad.tail2f1641.ts.net/oauth2callback` — as an authorized redirect URI in Google Cloud
   Console, alongside (not instead of) `http://localhost:4001/oauth2callback` from R1. This is now the
   confirmed, live-blocking step — it's the exact cause of the `redirect_uri_mismatch` hit on 2026-09-27.
2. Restart the server (with whichever `.env.local` value — Tailscale hostname or `localhost` — matches
   how you're testing that session) and run a real consent through to completion.
3. ~~Decide whether an ngrok-style HTTPS tunnel is needed for phone-based testing~~ — **decided and
   built**: Tailscale Funnel (R2 above), not ngrok. Nothing further to decide here.
4. Run `prisma migrate deploy` on the dev DB before running current `main` — `main` has a newer
   migration (`channels_default_privacy_and_updated_at`, Sprint 3 Task 8) not yet applied there.

---

## Testing

```bash
npm run build && npm run lint && npm run typecheck
```

Plus R1's own real-connect verification above (4/4 `redirect-uri-guard` unit tests, including the R2
`*.ts.net` case) — a real reach of Google's consent screen, not just a passing type check. **Both done and
confirmed** per the "Resolution" section; full end-to-end consent completion is still outstanding,
pending the Google Console registration in "Yours to do" #1.

## Report Template

Generate at `docs/execution/bugs/Sprint3/reports/task5.md`, same shape as `reports/task4.md` — state plainly
what the actual pre-fix `redirect_uri` source was (env-var-derived, hardcoded, or something else), what
changed, and whether the Google Console redirect-URI registration was already correct or needed a
founder update. **Written and now on file in the project** — see "Resolution" above for the summary.

## Links & References
- [HOTFIXER_AGENT_PROTOCOL.md](../HOTFIXER_AGENT_PROTOCOL.md)
- [TASK_TEMPLATE.md](../../templates/TASK_TEMPLATE.md)
- `docs/execution/bugs/STATUS.md`
- `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md` §1 — the live-found instance of this issue, logged
  2026-09-28
- `docs/execution/sprint3/tasks/task5.md` — the original OAuth connect flow this task is fixing a real
  gap in
- PR [#29](https://github.com/Neeraj1002/7AI/pull/29) — draft, `BUGS_TASK5`
- `docs/execution/bugs/Sprint3/reports/task5.md` — the hot-fixer's own written report, now on file

## Git Workflow

Per `HOTFIXER_AGENT_PROTOCOL.md`'s Release & Branch Model — one `BUGS_TASK5` branch, one PR, for this
entire release (R1 and R2 both).

1. From the shared bugs worktree (`D:\Study Material\7AI-bugs`): `git fetch origin && git checkout main
   && git pull` before starting — do not build on whatever branch happens to already be checked out.
2. `git checkout -b BUGS_TASK5`. Record this exact name in `docs/execution/bugs/STATUS.md`'s new Task 5
   row immediately, before the first commit. **Done.**
3. One commit for R1: `BUGS_TASK5_R1: separate OAuth redirect_uri from PUBLIC_API_BASE_URL + boot-time
   private-IP guard`. **Done** (commit message kept as originally planned even though R1's investigation
   found no actual separation was needed — the guard and env-file fixes are the real content of the
   commit). A second commit for R2 (Tailscale Funnel docs + guard-test coverage + live check) reported
   done by the hot-fixer session — **not independently re-confirmed from this chat**.
4. Open the PR as a draft the moment the branch is created — **done**,
   [#29](https://github.com/Neeraj1002/7AI/pull/29).
5. Once R1 and R2 are both verified live end to end (full real consent, not just the URI-shape check),
   write/update the report and this task's `STATUS.md` row, commit (`BUGS_TASK5_REPORT: ...`), push, then
   `gh pr ready`. **Report and STATUS row done; PR not yet marked ready** — full end-to-end consent
   completion (a founder action, now blocked specifically on the Google Console registration in
   "Yours to do" #1) is the natural gate before flipping it, though that's a judgment call for whoever
   reviews the PR next, not a hard rule.
6. **Never push or merge to `main` directly** and **never commit to a branch this task didn't create** —
   same as every other track.
