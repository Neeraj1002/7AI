# Bugs Task 5: YouTube Connect Fails — OAuth redirect_uri Resolves to a Private IP

**Read `docs/execution/bugs/HOTFIXER_AGENT_PROTOCOL.md` and `docs/execution/templates/TASK_TEMPLATE.md` before starting.** One `BUGS_TASK5` branch, one PR.

**Founder-reported, live**: connecting YouTube for `7aistudiochannel@gmail.com` via the in-app connect flow
(Sprint 3 Task 5/M2) produced a Google `400`: `device_id and device_name are required for private IP:
http://192.168.0.101:4001/oauth2callback`.

**Root cause**: Google's OAuth server refuses a `redirect_uri` whose host is a private/LAN IP (RFC1918).
It accepts only `localhost`/`127.0.0.1` or a verified public domain. The "device_id/device_name" wording is
Google's generic message for a disallowed redirect_uri shape — those are NOT parameters to add (they belong
to an unrelated device-pairing flow). Do not build "private IP callback support." The only fix is to stop
using a private IP as the redirect base. It is irrelevant which device starts the flow; what matters is the
redirect host Google validates.

**Out of scope**: no OAuth scope change, no auth/session/token logic change, no schema migration. If
investigation needs one, stop and flag it.

## R1 (Role: `BE`) — Give the OAuth connect flow its own, Google-legal redirect base

1. Confirm by direct read whether `YOUTUBE_REDIRECT_URI` exists and is used, or `redirect_uri` is derived
   from `PUBLIC_API_BASE_URL` / hardcoded. State which in the report.
2. Ensure `redirect_uri` is driven by its own env var, never `PUBLIC_API_BASE_URL` (opposite constraints).
3. Set/confirm the real `.env.local` value `http://localhost:4001/oauth2callback`; it must also be
   registered as an authorized redirect URI on the OAuth client in Google Cloud Console (founder action —
   flag it, and check whether it was already registered originally).
4. Boot-time guard: if `YOUTUBE_REDIRECT_URI`'s host is RFC1918 private, log
   `[boot] YOUTUBE_REDIRECT_URI resolves to a private IP — Google will reject this at OAuth time; use
   localhost for local testing or a real public domain` (`localhost`/`127.0.0.0/8` allowed).

**Verify**: a real connect attempt via `http://localhost:4001/oauth2callback` reaches Google's actual consent
flow (not another `400`); guard fires for a private IP and stays silent for `localhost`/public domains.
If the phone itself must complete consent, `localhost` is unreachable there — the real option is a public
HTTPS tunnel (e.g. ngrok) registered in Google Cloud Console and used as `YOUTUBE_REDIRECT_URI`. That is a
founder decision; do not build it unprompted.

## R2 (Role: `BE`, docs/verification only) — Phone testing via Tailscale Funnel

`localhost` isn't reachable from the phone's browser, and a raw LAN IP is rejected by Google. A Tailscale
Funnel URL is a real public HTTPS DNS name (`*.ts.net`), which Google accepts, and its hostname is stable
across restarts (unlike ngrok's free tier), so the Console registration is one-time. Founder-side steps —
manual, not scripted:

1. Install Tailscale on the machine running the studio server and sign in (one-time).
2. Enable Funnel for the tailnet in the Tailscale admin console if not already on (may depend on plan tier).
3. Run `tailscale funnel 4001` — it prints a stable `https://<machine-name>.<tailnet>.ts.net` URL.
4. Set `YOUTUBE_REDIRECT_URI=https://<that-hostname>/oauth2callback` in `.env.local` and restart the server.
5. Register that exact URL as an additional authorized redirect URI in Google Cloud Console, alongside the
   `localhost` one from R1 (an OAuth client can hold multiple redirect URIs).

**Verify (done in code)**: the boot guard must not flag a `*.ts.net` host (it matches only literal RFC1918
IPv4 addresses; covered by a test), and Google must accept the `*.ts.net` redirect_uri shape without a `400`
(same live-check technique as R1, no consent needed).

## Testing
`npm run build && npm run lint && npm run typecheck`, plus R1's real-connect verification.

## Links & References
- [HOTFIXER_AGENT_PROTOCOL.md](../HOTFIXER_AGENT_PROTOCOL.md)
- [TASK_TEMPLATE.md](../../templates/TASK_TEMPLATE.md)
- `docs/execution/bugs/STATUS.md`
- `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md` §1
- `docs/execution/sprint3/tasks/task5.md`
