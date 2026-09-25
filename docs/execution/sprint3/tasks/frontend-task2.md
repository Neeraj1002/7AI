# Sprint 3 Frontend Task 2: Channels Screen — Create, View, Connect YouTube

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** Branch: `SPRINT3_FE`.

**Objective**: Build the Channels screen `MOBILE_APP_DESIGN.md` Section 4 explicitly deferred out of
v1 ("channel creation/settings management... stays a backend/config-file concern for now") — Sprint 3
backend Tasks 5 and 6 are exactly what un-defers it: real channel creation and a real per-channel
YouTube OAuth connect/disconnect flow both now exist as real endpoints with nothing in the app to
reach them.
**Duration**: 6-8 hours
**Depends On**: Sprint 3 backend Task 1 (session auth — `sprint3-fe-task1.md` should land first in
this app), Task 5 (`AgentCredential` + connect flow), Task 6 (`channels.create` +
`hasYoutubeCredential`).
**Owning Component**: New screen, `app/app/(app)/channels.tsx`; extends
`app/lib/channel-context.tsx`, `app/components/ChannelSwitcher.tsx`.
**Success Criteria**: (1) A real second channel is created from the app and appears in both the new
Channels screen and the existing `ChannelSwitcher`. (2) A real OAuth connect flow, started from the
app, ends with that channel showing `hasYoutubeCredential: true` in the app — no manual DB check
needed to confirm it worked. (3) A real disconnect and a real 8th-channel rejection both surface a
clear, real error in the app, not a crash or a silent no-op.

## Task Requirement

### FE8 — A real Channels list + create form
**Where**: `app/lib/channel-context.tsx` already calls `trpc.channels.list.queryOptions()`
(confirmed by reading it) and is consumed by `ChannelSwitcher.tsx` — but nothing in the app lets a
user create a channel; `channels.list`'s current response shape (per `channel-context.tsx`'s own
`Channel` type: `{ id, name, platform }`) doesn't yet include `hasYoutubeCredential` (Sprint 3 backend
Task 6/N2 adds it server-side — confirm it's actually landed before this task assumes the field is
present).

**Fix**: a new screen, `app/app/(app)/channels.tsx`, added to `(app)/_layout.tsx`'s `Stack` (same
pattern as `dashboard`/`new-brief`, confirmed from reading `_layout.tsx`) — a real list (reusing
`channels.list`, now typed with the extended `hasYoutubeCredential` field once Task 6/N2 lands) plus
a "Create channel" form (name, niche description, platform fixed to `youtube` for now — no other
platform exists) calling the new `channels.create` mutation (Sprint 3 backend Task 6/N1). A real
7-channel-cap rejection (`ChannelCapExceededError`'s message, surfaced as a structured tRPC error per
that task) is shown via the same `setError(err.message)` pattern `new-brief.tsx`/`login.tsx` already
use — no new error-handling pattern invented for this one case.

`ChannelSwitcher.tsx` needs no change — it already re-renders from the same `channels.list` query
this screen also uses (shared via `ChannelProvider`'s `useQuery`), so a newly created channel appears
there automatically once the query is invalidated on `channels.create`'s success (standard
`queryClient.invalidateQueries` pattern, same as every other mutation in this app).

**Verify**: (1) a real second and third channel created through this screen appear in both the
Channels list and `ChannelSwitcher`'s picker, cross-checked against a direct Postgres read. (2) A
real attempt at an 8th channel shows the real cap-exceeded message in the app, not a generic error.

### FE9 — Connect / Disconnect YouTube per channel
**Where**: Sprint 3 backend Task 5 (M2) exposes `GET /channels/:id/youtube/connect` (a browser
redirect URL) and `DELETE /channels/:id/youtube/connection` — nothing in the app today opens an
external OAuth flow at all (every existing screen only ever talks to the tRPC API directly).

**Fix**: each channel row in FE8's list shows a real connection badge (`hasYoutubeCredential`) and a
"Connect YouTube" button when false, or "Disconnect" when true. "Connect" opens the real connect URL
via `expo-web-browser`'s `openAuthSessionAsync` — the standard Expo pattern for an OAuth flow that
needs to return control to the app afterward (matches the deep-link mechanism FE7/`sprint3-fe-task1.md`
already introduces for magic-link verification; reuse the same redirect-handling approach rather than
inventing a second one). On return, the screen refetches `channels.list` to pick up the real,
now-`true` `hasYoutubeCredential` value — it does not optimistically assume success, since the OAuth
flow can be cancelled or fail on Google's side. "Disconnect" calls the real `DELETE` mutation directly
(no external browser needed) and refetches the same way.

**Verify**: a real, live OAuth connect for a real second test channel — the full browser round trip
via `openAuthSessionAsync`, ending with the app itself showing `hasYoutubeCredential: true` for that
channel without a manual refresh or DB check being necessary to notice it worked. A real disconnect
afterward flips it back to `false` in the app, confirmed the same way.

## Schema Impact
None on the frontend side.

## Business Logic / State Transition
None new — this task is a UI consumer of Sprint 3 backend Tasks 5/6's already-implemented cap
enforcement and credential-status logic.

## Testing
```bash
npm run build && npm run lint && npm run typecheck
npx expo start
```
Plus FE8/FE9's real channel-creation and real OAuth-connect verification above — this task's bar is
a real second test channel actually connected through the app's own UI, not a mocked redirect.

## Documentation reconciliation
- Same sprint-scoped STATUS.md location as `sprint3-fe-task1.md`, this task's row.
- `docs/design_doc/frontend/MOBILE_APP_DESIGN.md`: note Section 4's explicit "channel creation/
  settings management... explicitly out of v1" line as picked up by this task — the doc's own
  framing already anticipated this would come later, once the backend supported it.

## Report Template
`execution/sprint3/reports/frontend-task2.md`, standard shape.
