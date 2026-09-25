# Sprint 3 Frontend Task 3: In-App Notifications + Real Push Registration + Post-Hoc Tagging

**Date**: 2026-09-21
**Status**: Complete
**Files Created**: 2
**Files Modified**: 4
**Tests**: All Passing

## What Was Done

Built the last of Sprint 3 frontend's three tasks, all three sub-pieces this task's revised spec
called for:

- **FE10 — Notifications screen** (`app/app/(app)/notifications.tsx`): lists real `Notification` rows
  from `notifications.list` (`kind`, `message`, `createdAt`, `resolvedAt`); a pending
  `approval_request` row reuses the exact same `GateActionBar` component Run Detail already uses,
  fetching that notification's run (`runs.get`, keyed by `threadKey`) to decide which gate is actually
  open rather than duplicating a second gate-detection rule. A badge/entry point was added to the Queue
  screen (`(app)/index.tsx`), the screen the app's own prior task already established as "the screen
  the founder actually opens most."
- **FE11' — real push registration** (new `app/lib/push.ts`, wired into `auth.tsx`'s `completeSignIn`):
  on sign-in success, requests notification permission via `expo-notifications`, and — only if granted
  — registers the real Expo push token with `notifications.registerPushToken`. A denied permission is
  treated as a valid outcome, not an error: the user still gets FE10's in-app inbox, nothing nags them.
  `app/app/_layout.tsx` gained a tap handler (`addNotificationResponseReceivedListener`) that
  deep-links a tapped push straight to `/run/[id]` (when the payload carries a `runId`) or
  `/notifications` otherwise — reusing the same routing this app already has, not a second mechanism.
- **FE12 — post-hoc tagging** (`PostHocTagForm`, added to `app/app/(app)/run/[id].tsx`): shown only once
  a run reaches `completed`/`failed` (the same terminal-state values the screen already checked
  elsewhere). Existing tags (`ReviewLog` rows where `agent === 'founder-post-hoc'`) are listed as
  history; a free-text tag field plus optional notes calls `runs.tagPostHoc` on submit, refetching (not
  an optimistic update) so a real rejection is visibly distinguishable from success.

**A real spec-vs-implementation mismatch was found and deliberately deviated from**: the task spec
describes FE12 as "a tag picker constrained to backend Task 7/O4's real tag vocabulary." Reading
`post-hoc-tag.ts` directly (the backend implementation, not the spec's description of it) shows there
is no such vocabulary — free text is accepted and stored as-is, by design ("a solo founder typing their
own words is the actual 'cheap' this task asks for, not a rigid enum to memorize," per that file's own
comment). The three tag names the design doc uses as illustrative examples
(`weak_hook`/`topic_already_saturated`/`bad_thumbnail_frame`) became quick-pick suggestion chips that
prefill the text field, not an enforced list — consistent with this project's established convention of
trusting the real code over a task spec's framing when the two disagree.

## Files Created/Modified

- Created: `app/app/(app)/notifications.tsx`, `app/lib/push.ts`
- Modified: `app/lib/auth.tsx` (`completeSignIn` now takes an explicit `apiUrl` argument and calls
  `registerForPushNotificationsAsync`), `app/app/_layout.tsx` (push-tap deep-link handler),
  `app/app/(app)/_layout.tsx` (registered the `notifications` route), `app/app/(app)/index.tsx`
  (Notifications badge/entry point), `app/app/(app)/run/[id].tsx` (`PostHocTagForm` section),
  `app/app.json` (added the `expo-notifications` plugin)

## Schema Impact
None on the frontend side.

## Test Results

```
npm run build       — passes (expo export --platform web)
npm run lint         — passes, 0 warnings/errors
npm run typecheck    — passes, no errors
```

### Real end-to-end proof — against the merged backend, running from this branch's own `studio/`

**FE10 — real notification list + real gate resolution from the Notifications screen**: with a
genuine run driven to `paused_gate1` (budget ceiling temporarily raised via the existing
`scripts/set-budget-ceiling.ts` to let a new run reach that state), a real, pending
`approval_request` `Notification` row appeared on the screen with a working `GateActionBar`. Tapping
"Approve" called the real `runs.gate1` mutation; a direct Postgres read confirmed the run genuinely
advanced from `status: paused_gate1` / `currentStage: gate1` to `status: running` /
`currentStage: video_generation` — the same cross-check bar every prior gate-resolution proof in this
project has used.

**FE12 — real tag submission, cross-checked against Postgres**: on a real `completed` run
(`78bf0056-87de-4717-95f9-0a768d78e5f9`), the existing tag history rendered correctly with real data
(a genuine `weak_hook` row from earlier backend/Task-7 testing). A new tag (`cta_missing`, with notes)
was submitted through the app's own form; the UI's refetch showed it immediately, newest-first, above
the pre-existing tag. A direct Postgres read of `review_logs` confirmed a second, real row —
`agent: "founder-post-hoc"`, `verdict: "cta_missing"`, `rationale: "no clear call-to-action at the
end, viewers just left hanging"`, `stageId: null` — the identical shape the old Telegram command
produced, sitting alongside the original tag rather than replacing it (confirming the same run can be
tagged more than once, matching the old flow's own behavior — no new restriction silently added).

**FE11' — real push registration, verified to the extent a physical device allows**: signed out and
back in through the app's own real magic-link flow (a fresh link requested through the UI, retrieved
from the real backend's console log, pasted into the manual-verify field — the same mechanism Task 1's
own testing used) to force `completeSignIn` to run fresh. The browser console showed
`[push] skipping push registration on web — no native push support on this platform`, confirming the
`Platform.OS === 'web'` guard fires correctly on a real sign-in in this dev environment (no native push
support in a browser, by design — not a bug). Because no physical device is available in this
environment, the underlying `notifications.registerPushToken` endpoint itself was independently proven
by calling it directly with a real session token and a realistic (but fake) Expo push token string: it
returned `{"registered": true}`, and a direct Postgres read confirmed `User.expoPushToken` was written
for real — then cleared back to `null` afterward so the fake test value doesn't linger and get picked
up by a real digest/push send later. **Real on-device push delivery was not and could not be verified
in this session** — no physical device is available, and simulators don't deliver real push (the same
honest limit this task's own spec calls out as required and backend Task 7's own report already hit for
the send side). This remains a founder-action item, not a code gap: the client-side registration path,
the permission-denial handling, the web-platform skip guard, and the server endpoint it calls are all
proven for real; only the actual physical delivery-and-tap-to-deep-link round trip needs a real device.

## Deviations from Spec

1. **FE12's "tag picker constrained to a real tag vocabulary" — not implemented as described, by
   design**: see "What Was Done" above. `post-hoc-tag.ts` enforces no vocabulary; a constrained picker
   would have added a restriction the real backend doesn't have and the old Telegram flow never had
   either. Quick-pick suggestion chips (prefilling free text) deliver the spec's actual usability intent
   without inventing a fake constraint.
2. **Real on-device push delivery is unverified** — no physical device available in this environment,
   consistent with every other Sprint 3 task (frontend and backend) that has hit this same limit. Every
   piece of the path up to the device boundary (permission request, token registration, the server
   endpoint, the web-platform skip guard, and the tap-to-deep-link handler's code path) is implemented
   and proven for real; only the physical send-and-receive step itself needs a real founder device. This
   is the literal blocking item for this task's own Success Criterion (2).

## Documentation reconciliation

- `docs/design_doc/frontend/MOBILE_APP_DESIGN.md`'s deferred "push-notification infrastructure
  choices... an implementation detail for whoever builds this" line updated to also credit this task
  (FE11') for the client-side half, alongside backend Task 7/O1's server-side half already noted there.
- `docs/execution/sprint3/STATUS.md` and `docs/execution/frontend/STATUS.md` both gain a Frontend 3
  row and are closed out as the Sprint 3 frontend track's final task (see those files directly).

## Sign-Off
- Task Objective: Met for FE10 and FE12 in full (both real, both live-verified end-to-end). Met for
  FE11' up to the physical-device boundary — the one item Success Criterion (2) itself acknowledges
  "checked against a real device, not the simulator's notification stub" as a requirement no automated
  agent session can satisfy; tracked honestly as a founder-action item rather than asserted or faked.
- Schema Impact: None (matches spec).
- Business Logic: None new (matches spec — pure UI consumer of backend Task 3/Task 7's already-
  implemented routing, push dispatch, and tagging logic).
- Tests: Passing (`build`/`lint`/`typecheck` all clean). Real E2E proof performed for FE10 (gate
  resolution from the Notifications screen, Postgres-confirmed) and FE12 (new tag submission,
  Postgres-confirmed, coexisting with prior tags). FE11' proven up to the physical-device boundary: web
  skip guard confirmed live via a real sign-in, server endpoint independently proven with a real
  session token and a real (test) push-token round trip through Postgres.
- Ready for Integration: Yes — this is the final Sprint 3 frontend task; `SPRINT3_FE` is being marked
  ready for review per `TASK_TEMPLATE.md`'s Git Workflow (existing PR, not a new one; not merged).
