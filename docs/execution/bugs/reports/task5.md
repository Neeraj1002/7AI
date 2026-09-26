# Bugs Task 5: YouTube Connect Fails — OAuth redirect_uri Resolves to a Private IP

**Date**: 2026-09-27
**Status**: Code complete. Live-checked against Google's real authorization endpoint. Two founder steps remain.
**Files Created**: 3 (`studio/src/config/redirect-uri-guard.ts`, its test, this report; plus `tasks/task5.md`)
**Files Modified**: `studio/src/index.ts`, `studio/.env.example`, `docs/execution/bugs/STATUS.md`
**Tests**: `tsc --noEmit`, `eslint`, and a new 3-case vitest suite for the guard all pass.

## Where `redirect_uri` actually comes from (task's step 1)

The task expected it might be derived from `PUBLIC_API_BASE_URL`. **It is not.** By direct read,
`studio/src/manage-channels/youtube-oauth-connect.ts` builds its `OAuth2Client` with
`env.YOUTUBE_REDIRECT_URI`, a dedicated var that already exists in `config/env.ts` and is already the only
source (the same var is used by the three other YouTube clients). `PUBLIC_API_BASE_URL` is read only by
`magic-link.ts`. So no code separation was needed — the two were already independent.

The private IP came from the **value** of `YOUTUBE_REDIRECT_URI` itself: the `.env.local` in
`D:\Study Material\7AI-bugs\studio` had it set to `http://192.168.0.101:4001/oauth2callback` (likely copied
from the phone-reachable base URL by hand). The other two checkouts' `.env.local` files had
`http://localhost:3000/oauth2callback` — the older port mismatch already known from Sprint 3 Task 5.

## What changed

- `redirect-uri-guard.ts`: `isPrivateIpRedirectHost()` — true for 10/8, 172.16/12, 192.168/16 hosts; false
  for `localhost`, `127.x`, public hosts, and unparseable input. Unit-tested.
- `index.ts`: boot-time `console.warn` (`[boot] YOUTUBE_REDIRECT_URI resolves to a private IP — Google will
  reject this at OAuth time; ...`), placed next to the existing `PUBLIC_API_BASE_URL` warning.
- `.env.example`: documents that `YOUTUBE_REDIRECT_URI` must be localhost or a public HTTPS domain, must be
  registered in Google Cloud Console, is unrelated to `PUBLIC_API_BASE_URL`, and now defaults to the API
  port (`4000`) where `/oauth2callback` actually lives instead of `3000`.
- **Local config**: changed the one `YOUTUBE_REDIRECT_URI` line in the bugs worktree's gitignored
  `.env.local` to `http://localhost:4001/oauth2callback` (only that line was touched; not committed). The
  checkout you actually run the server from may have its own value — check it.

## Live verification

Built the real auth URL via `buildYoutubeConnectUrl` and requested it from Google (no browser, nothing
persisted, no DB):
```
redirect_uri: http://localhost:4001/oauth2callback   | guard fires: false
google: 302 -> https://accounts.google.com/v3/signin/identifier ...      (proceeds to sign-in)

redirect_uri: http://192.168.0.101:4001/oauth2callback | guard fires: true
google: 302 -> https://accounts.google.com/signin/oauth/error?authError=...invalid_request... (rejected)
```
That reproduces the founder's failure with the old value and shows the new value passes that check. This
proves Google no longer rejects the redirect URI **shape**. It does **not** prove the full connect works: I
did not complete a real consent, and Google only checks that the URI is *registered* on the OAuth client
after sign-in.

I did not boot the full server to demo the warning line: this branch is on a newer `main` whose migration
(`20260926143250_channels_default_privacy_and_updated_at`) is not applied to the shared dev DB, and I didn't
want to run against it or contend with the running server's Telegram polling. The guard function is
unit-tested and the boot line is a direct call to it.

## Founder actions

1. **Register `http://localhost:4001/oauth2callback`** (whatever port you run the API on) as an authorized
   redirect URI on the OAuth client in Google Cloud Console (APIs & Services → Credentials). I cannot see
   the Console, so I don't know whether it is already there from Sprint 3 Task 5's setup; if it isn't,
   consent will fail with `redirect_uri_mismatch` after sign-in.
2. Set `YOUTUBE_REDIRECT_URI` in the `.env.local` of the checkout you run the server from, restart, retry
   the connect flow, and confirm the consent screen.
3. **Decision for you**: `localhost` is not reachable from the phone's own browser. If consent must be
   completed on the phone, you need a public HTTPS tunnel (e.g. ngrok) registered as an additional
   redirect URI and used as `YOUTUBE_REDIRECT_URI` for that session; otherwise complete the connect from
   the desktop machine. Not built, per the task.
4. Separate from this task: the dev DB is missing `main`'s newest migration
   (`channels_default_privacy_and_updated_at`); `npx prisma migrate deploy` before running current `main`.

## Deviations from Spec
- No env-var separation code was needed (already separate) — reported above instead.
- Saved the task text as `tasks/task5.md`, since no task doc existed.

## Sign-Off
- Guard + docs: done and tested. Google's rejection of the LAN URI reproduced and cleared for localhost.
- Real connect end to end: **not confirmed** — needs the Console registration and your consent.
