# Sprint 3 Frontend Task 1: Real Sign-In (Magic Link)

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** Branch: `SPRINT3_FE`
(continuing the sprint-numbered frontend naming `sprint2/tasks/frontend-task1.md` introduced).

**Objective**: Replace the app's "paste the shared `API_AUTH_TOKEN`" login screen with a real
magic-link sign-in against Sprint 3 backend Task 1's session auth — the app currently has no concept
of "which user is signed in" at all, just one shared secret.
**Duration**: 5-7 hours
**Depends On**: Sprint 3 backend Task 1 (`sprint3/tasks/task1.md`) — hard dependency, this task has
no real endpoint to call without it. Should be this sprint's first frontend task, same reasoning
Task 1 was backend Sprint 3's first task.
**Owning Component**: `app/app/login.tsx`, `app/lib/auth.tsx`, `app/lib/storage.ts`,
`app/lib/trpc.ts`.
**Success Criteria**: (1) A real magic-link request from the app, followed by opening the real
resulting link, produces a working signed-in session — confirmed by a subsequent authenticated
request actually succeeding. (2) The founder's own existing account continues to work through this
new flow (no account left stranded on the old token-only path). (3) Signing out clears the session
and returns to a real login screen, not a stale authenticated state.

## Task Requirement

`app/app/login.tsx` and `app/lib/auth.tsx` (confirmed by reading both in full) implement exactly
what their own comments call "not a real login... just 'these two fields are non-empty' — the API
itself is what actually rejects a bad token." Sprint 3 backend Task 1 (J2) replaces that single
shared token with real per-user sessions (`POST /auth/request-link`, `GET /auth/verify`) — this task
is the app-side half of that change.

### FE6 — Email entry + magic-link request
**Where**: `login.tsx` currently has two fields, `apiUrl` and `token`, and a single `Connect` button
calling `signIn(token, apiUrl)` — no email field, no request/verify round trip, confirmed by reading
the file in full.

**Fix**: `apiUrl` stays (the app still needs to know which API to hit — unchanged). `token` is
replaced with an `email` field and a `Request link` button calling the new
`auth.requestLink({ email })` query/mutation (Sprint 3 backend Task 1's `POST /auth/request-link`,
exposed as a tRPC procedure the same way every other endpoint already is). Per that task's own
generic-response design ("if that email has an account, a link was sent"), the app shows the same
neutral confirmation regardless of whether the email was recognized — never a different message for
"unknown email," which would leak account existence.

Because Sprint 3 Task 1's own scope explicitly logs the link to the console/founder's Telegram
rather than sending real email this sprint (no email provider wired in yet — stated plainly in that
task's own Fix section), this screen also keeps a **manual token-paste fallback**: a second field,
"Paste your sign-in link or token," for the founder (and any tester without real email delivery yet)
to complete sign-in by pasting the value from the console/Telegram message — not a permanent design,
a direct accommodation of a gap the backend task itself already flagged as temporary, and worth
removing once real email delivery exists (noted in this task's own Known Issues, not silently kept
forever).

**Verify**: a real `auth.requestLink` call for the founder's seeded email produces the same neutral
confirmation message shown for the founder's account either way (test isn't distinguishable from the
app's response) — cross-checked against the real server log / Telegram message to confirm a real
link was actually generated.

### FE7 — Real deep-link verify + session storage
**Where**: `app/lib/storage.ts`/`auth.tsx` store a single flat `token` (the static
`API_AUTH_TOKEN`), attached as `Bearer ${token}` on every request (`lib/trpc.ts`'s
`createTrpcClient`, confirmed by reading it).

**Fix**: a real Expo deep link / universal link scheme (`app.json`'s existing scheme, extended if
needed) registers a route for the magic-link URL Sprint 3 backend Task 1 generates
(`GET /auth/verify?token=...`, called from the app rather than a browser — the app itself exchanges
the token by calling the backend, then stores the resulting **session** JWT, not the raw magic-link
token, which is single-use and would fail on a second app launch). `auth.tsx`'s `AuthState` gains
`userId`/`role` alongside `token` (now the session token) — `signIn` becomes `completeSignIn(session)`
called either from the deep-link handler or from FE6's manual-paste fallback, both converging on the
same real `GET /auth/verify` call and the same stored result. `storage.ts`'s existing web/SecureStore
split is unchanged — the session token is stored the same way the old static token was.

`trpc.ts`'s `createTrpcClient` is otherwise unchanged (`Bearer` header, same shape) — the session JWT
is a drop-in replacement for the old shared token from the transport's point of view; only how it's
obtained changes.

**Verify**: (1) a real magic link (from FE6's real request) opened via the deep-link path produces a
working session — a subsequent `channels.list` call succeeds and returns the real signed-in user's
tenant's channels, cross-checked against a direct Postgres read of which tenant that user belongs to.
(2) The manual-paste fallback produces an identical working session via the same verify call. (3) An
expired or already-used link/token is rejected with a real, visible error on this screen — not a
silent failure. (4) `signOut` clears the stored session and the app correctly redirects to `login.tsx`
on the next launch — re-verify this exact regression check, since `(app)/_layout.tsx`'s existing
`if (!token) return <Redirect href="/login" />` guard is untouched and must keep working with the new
session shape.

## Schema Impact
None on the frontend side. Consumes Sprint 3 backend Task 1's new `users`/`login_tokens` tables via
the API only.

## Business Logic / State Transition
None new — this task is a consumer of Sprint 3 backend Task 1's session-issuing flow, not a new
authorization decision.

## Testing
```bash
npm run build && npm run lint && npm run typecheck
npx expo start
```
Plus FE6/FE7's real magic-link round trip above — this task's bar is a real signed-in session from a
real link, not a mocked auth response.

## Documentation reconciliation
- Same sprint-scoped STATUS.md location `sprint2-fe-task1.md`/`task2.md` used, now under Sprint 3.
- `docs/design_doc/MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md`: note the real per-user sign-in
  flow (backend + frontend both) as picked up.

## Report Template
`execution/sprint3/reports/frontend-task1.md`, standard shape. State plainly whether the manual-paste
fallback or the real deep-link path (or both) was actually exercised live.
