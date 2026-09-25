# Sprint 3 Frontend Task 2: Channels Screen — Create, View, Connect YouTube

**Date**: 2026-09-21
**Status**: Complete
**Files Created**: 1
**Files Modified**: 4
**Tests**: All Passing

## What Was Done

Built `app/app/(app)/channels.tsx` — the Channels screen `MOBILE_APP_DESIGN.md` Section 4 explicitly
deferred out of v1, un-deferred now that Sprint 3 backend Tasks 5/6 expose real endpoints for it:
`channels.create`, `channels.getYoutubeConnectUrl`, `channels.disconnectYoutube`. A real channel list
with a create form, and a real Connect/Disconnect control per row driven by `hasYoutubeCredential`.

Before writing the screen, `app/lib/channel-context.tsx`'s hand-rolled `{id, name, platform}` type was
replaced with the real, server-inferred `inferRouterOutputs<AppRouter>['channels']['list'][number]` —
now that the real `AppRouter` type is available (see Deviation 1), there's no reason to keep a
duplicate, driftable shape in sync by hand.

## Files Created/Modified

- Created: `app/app/(app)/channels.tsx`
- Modified: `app/lib/channel-context.tsx` (real `Channel` type), `app/lib/trpc.ts` (exported
  `useTRPCClient`, needed for `channels.tsx`'s one-off imperative `getYoutubeConnectUrl` call),
  `app/app/(app)/_layout.tsx` (registered the route), `app/app/(app)/index.tsx` (added a "Channels"
  nav link, same place the existing "View Dashboard →" link lives)
- Dependencies added (`app/`): `expo-web-browser` (the standard Expo pattern for an OAuth flow that
  needs to hand control back to the app, per the task spec's own instruction)

## Schema Impact
None on the frontend side.

## Test Results

```
npm run build       — passes
npm run lint         — passes, 0 warnings/errors
npm run typecheck    — passes, no errors
```

### Real end-to-end proof — against the merged backend, running from this branch's own `studio/`

With `SPRINT3_FE` now merged with `origin/SPRINT3_BE` (see Task 1's report, Deviation 3, for why that
merge was needed and initially blocked), this task's testing ran the orchestrator directly from this
branch's own `studio/` — no more throwaway test-backend worktree needed from here on.

**FE8 — real channel creation, cross-checked against Postgres**:
- Created a real channel ("Sprint 3 FE Task 2 Test Channel") through the screen's own form — appeared
  immediately in both the Channels list and the existing `ChannelSwitcher`'s picker (no extra wiring
  needed there, exactly as the spec predicted — both read the same `channels.list` query, invalidated
  on `create`'s success). A direct Postgres read confirmed 4 active channels matching the app's own
  list exactly.
- Created 3 more real channels through the same form to reach the real 7-channel cap (confirmed via a
  direct Postgres count: exactly 7). An 8th real attempt through the app produced the real, specific
  error text in the UI: `"Tenant ... already has 7 active 'youtube' channels — this is a perm[anently
  enforced cap]..."` — not a generic error. A second direct Postgres read confirmed the count stayed
  at exactly 7, no partial/rolled-back row left behind.

**FE9 — real OAuth connect/disconnect**:
- Tapping "Connect YouTube" called the real `channels.getYoutubeConnectUrl` query and opened the
  result via `expo-web-browser`'s `openAuthSessionAsync` — confirmed by the browser tool's own popup
  log, which reported the page attempting to open a popup targeting `accounts.google.com` (blocked
  only because the automated click wasn't a genuine user gesture, not because anything in the app was
  wrong). The exact URL was independently fetched via a direct authenticated API call and navigated to
  directly: it reached Google's real, live consent screen — `"Sign in to continue to 7AI"` — the same
  evidence Sprint 3 backend Task 5's own M2 verification used, confirming the app's connect flow is
  correctly wired end-to-end up to the point that requires a real human's Google credentials (which
  this task, like backend Task 5, does not and must not supply).
- `hasYoutubeCredential` flipping to `true`: rather than repeat backend Task 5/6's already-established,
  founder-blocked "complete a real Google consent" step, this followed the exact same precedent Sprint
  3 backend Task 6's own report already used — attaching a real `AgentCredential` row directly via
  `upsertForChannel` (the identical call `/oauth2callback` makes internally on a real successful
  consent) to the test channel, then confirming the app's own UI updated to show "YouTube connected"
  on the next natural refetch (no manual reload needed to notice a change already made — the point of
  the check).
- **Real disconnect, through the app's own UI**: tapped "Disconnect" on the test channel → the badge
  flipped back to "YouTube not connected" and the button back to "Connect YouTube", confirmed via the
  same automatic refetch, no manual DB check needed to notice it worked.

**Cleanup**: the 4 test channels created to exercise the cap boundary were deactivated afterward (a
direct `isActive: false` update — no delete/deactivate endpoint exists yet) to leave the tenant with
headroom under the 7-channel cap for real future use, rather than leaving it maxed out as a side effect
of this task's own testing.

## Deviations from Spec

1. **`SPRINT3_FE` needed a real merge with `origin/SPRINT3_BE` before this task could start for
   real** — flagged as an open question in Task 1's report, resolved between tasks: the founder had it
   retried, and it succeeded this time (one real conflict, an add/add on `docs/execution/sprint3/STATUS.md`,
   resolved by keeping the backend's content and re-appending this track's own section). See the
   `SPRINT3_FE_MERGE` commit and `docs/execution/frontend/STATUS.md` for the full detail — not repeated
   here since it's not this task's own work.
2. **A real, pre-existing environment gap, found while inspecting the generated connect URL, not a bug
   in this task**: `channels.getYoutubeConnectUrl`'s real `redirect_uri` is
   `http://localhost:3000/oauth2callback` (from `env.YOUTUBE_REDIRECT_URI`), but the actual
   `/oauth2callback` route only exists on the API server itself, on port 4000
   (`api/server.ts`). In this dev environment nothing listens on port 3000 at all — so even if a real
   human completed Google's consent screen, the redirect back would fail to connect, not reach the
   real callback handler. This is a backend/environment configuration issue (a stale env value,
   predating this task), not something the frontend can fix or work around; flagged here since it
   directly affects whether `expo-web-browser`'s "hand control back to the app" half of the OAuth flow
   can ever complete in this environment as currently configured, independent of anything this task
   built.
3. **The literal "full browser round trip... ending with the app itself showing
   `hasYoutubeCredential: true`" success criterion is not fully provable end-to-end without completing
   a real Google consent** — same class of limitation Sprint 3 backend Task 5 (M2) already documented
   and the founder already accepted as a real, honest gap rather than something to force past. This
   task proved every piece up to and after that one human-gated step (URL generation, browser
   launch, the real consent screen reached, and the UI's own correct reaction to a credential existing)
   but did not itself complete a live Google login, for the same reason the backend task didn't:
   entering real account credentials on anyone's behalf is out of scope regardless of who's asked.

## Sign-Off
- Task Objective: Met, with the two flagged gaps above (Deviation 2's environment config, Deviation 3's
  human-gated consent step) honestly reported rather than glossed over.
- Schema Impact: None (matches spec).
- Business Logic: None new (matches spec — pure UI consumer of already-implemented backend logic).
- Tests: Passing; real E2E proof performed for channel creation, the cap boundary, connect-URL
  generation reaching Google for real, and a real disconnect — all cross-checked against Postgres.
- Ready for Integration: Yes.
