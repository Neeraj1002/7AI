# Sprint 3 Frontend Task 3: In-App Notifications + Real Push Registration + Post-Hoc Tagging

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** Branch: `SPRINT3_FE`.

> **Revision note**: this replaces the earlier version of this task, which paired the Notifications
> screen (FE10, unchanged below) with a "Link Telegram" flow (FE11). Telegram has been retired as an
> application dependency entirely (see backend Task 7/O) — FE11 is dropped and replaced with FE11'
> (real Expo push token registration) and FE12 (a post-hoc tagging form), both consumers of backend
> Task 7's real endpoints.

**Objective**: Give the app a real Notifications screen (the in-app channel Sprint 3 backend Task 3
makes the default notification path), register the device for real push notifications so a gate
opened while the app isn't in the foreground is actually noticed (backend Task 7/O1), and add the
one remaining Telegram-only flow's real in-app equivalent — post-hoc tagging a completed run
(backend Task 7/O4).
**Duration**: 6-8 hours
**Depends On**: Sprint 3 backend Task 1 (session auth) and Task 3 (in-app channel +
`notifications.list`), and backend Task 7/O1 (`notifications.registerPushToken`) and O4
(`runs.tagPostHoc`). Natural last frontend task of the sprint.
**Owning Component**: New screen, `app/app/(app)/notifications.tsx`; push registration wired into
`app/lib/auth.tsx`'s sign-in flow (or a small new `app/lib/push.ts`); a new tagging form on
`app/app/(app)/run/[id].tsx`.
**Success Criteria**: (1) A real gate opened for the signed-in user shows up as a real notification
in the app and can be resolved from that screen using the exact same gate controls Run Detail already
has. (2) A real device, signed in through the app, receives a real push notification for a gate
opened while the app is backgrounded or closed — checked against a real device, not the simulator's
notification stub. (3) A real post-hoc tag submitted from a completed run's Run Detail screen produces
the same real DB row the old Telegram command used to.

## Task Requirement

### FE10 — Notifications screen
**Where**: nothing in the app today polls or displays anything from the notification layer — every
prior screen only ever reads `runs`/`channels`/`dashboard` data. Sprint 3 backend Task 3 (K2) adds a
real `notifications` table and a `notifications.list` query scoped to `ctx.userId`.

**Fix**: a new screen, `app/app/(app)/notifications.tsx`, added to `(app)/_layout.tsx`'s `Stack`, with
a badge/entry point from the Queue screen (`(app)/index.tsx` — confirmed as the app's home/most-opened
screen per Frontend Track Task 2's own framing, "the screen the founder actually opens most") so a
pending notification is visible without navigating away first. The screen lists real `Notification`
rows (`kind`, `message`, `createdAt`, `resolvedAt`) and, for a row with `kind: 'approval_request'` and
`resolvedAt: null`, reuses the **exact same `GateActionBar` component** Run Detail already uses
(`app/components/GateActionBar.tsx`, confirmed reusable — it takes only a label and three callbacks,
no run-detail-specific state) wired to the same `runs.gate1`/`gate2` mutations, rather than
duplicating gate-resolution logic in a second place. Resolving from here and resolving from Run
Detail are the same underlying `resolvePendingApproval` call — whichever the user taps first is what
actually resolves the gate.

**Verify**: a real gate opened for the signed-in test user produces a real notification row visible on
this screen; resolving it via this screen's own `GateActionBar` actually advances the real
`PipelineRun` in Postgres — cross-checked the same way every prior gate-resolution proof in this
project has been (a direct Postgres read of `currentStage`/`status` after the tap).

### FE11' — Real push notification registration
**Where**: nothing in the app requests notification permission or holds an Expo push token; backend
Task 7/O1 adds `notifications.registerPushToken` and a real `ExpoPushChannel` that only fires for a
user with `User.expoPushToken` set — today that's nobody.

**Fix**: on sign-in success (`auth.tsx`'s `completeSignIn`, from Sprint 3 frontend Task 1), request
notification permission via `expo-notifications`' `requestPermissionsAsync()`, and — only if
granted — call `getExpoPushTokenAsync()` and send the real token to `notifications.registerPushToken`.
A denied permission is a real, valid outcome (not an error state) — the user still gets everything
FE10's in-app inbox provides, they just don't get pushed to; the app doesn't nag them to reconsider
beyond the OS's own re-prompt rules. Tapping a real push notification (payload carries the
notification/run id, per backend Task 7/O1's design) deep-links straight into the relevant screen —
Run Detail for an `approval_request`, the Notifications screen otherwise — reusing the same deep-link
handling Sprint 3 frontend Task 1 (FE7) already introduced for magic-link verification, not a second
mechanism.

**Verify**: a real permission grant on a real device produces a real `expoPushToken` row, confirmed
by a direct Postgres read. A real gate opened for that user with the app killed produces a real push
on the real device; tapping it opens the app directly to that gate's Run Detail screen, not just the
app's default launch screen.

### FE12 — Post-hoc tagging on a completed run
**Where**: backend Task 7/O4 adds `runs.tagPostHoc({ runId, tag, notes? })`, replacing the Telegram-
only `tag <runId> <word> [notes]` command — nothing in the app today lets a user attach a quality tag
to a completed run; Run Detail (`app/app/(app)/run/[id].tsx`, confirmed by reading it) only ever shows
gate sections and run status.

**Fix**: a small form section on Run Detail, shown only once a run has reached a terminal state
(`completed`/`failed`, matching whatever real status values `run/[id].tsx` already checks for its
existing terminal-state UI, not a new status vocabulary) — a tag picker constrained to backend Task
7/O4's real tag vocabulary (read from wherever `post-hoc-tag.ts`'s validation defines it, don't
hand-copy a possibly-stale list) plus an optional notes field, calling `runs.tagPostHoc` on submit.
Shows the real submitted tag afterward (refetch, same pattern as every other mutation in this app) —
not an optimistic placeholder, since a validation rejection from the real endpoint needs to be visibly
different from success.

**Verify**: a real tag submitted through this form produces the identical DB row shape the old
Telegram command used to (backend Task 7/O4's own verification bar) — cross-checked via a direct
Postgres read, and confirmed the same run can't be double-tagged in a way the old flow didn't also
allow (match existing behavior, don't silently add a new restriction that wasn't asked for).

## Schema Impact
None on the frontend side.

## Business Logic / State Transition
None new — FE10 and FE12 are UI consumers of backend Task 3/Task 7's already-implemented routing and
tagging logic; FE11' is a UI consumer of backend Task 7/O1's push dispatch, not a new authorization or
resolution decision.

## Testing
```bash
npm run build && npm run lint && npm run typecheck
npx expo start
```
Plus FE10/FE11'/FE12's real gate-resolution-from-notifications, real device push, and real post-hoc
tagging verification above.

## Documentation reconciliation
- Same sprint-scoped STATUS.md location as `sprint3-fe-task1.md`/`task2.md`, this task's row — and,
  since this is Sprint 3 frontend's last task, close out that STATUS.md the same way Frontend Track
  Task 3's report closed the original three-task track.
- `docs/design_doc/frontend/MOBILE_APP_DESIGN.md`: its own "push-notification infrastructure
  choices... an implementation detail for whoever builds this" line — this task (paired with backend
  Task 7/O1) is what actually closes it, not a deferred follow-up note anymore.

## Report Template
`execution/sprint3/reports/frontend-task3.md`, standard shape. State plainly whether the real push
was verified on a real physical device (required — simulators don't deliver real push) and mark the
`SPRINT3_FE` PR ready for review per `TASK_TEMPLATE.md`'s Git Workflow — don't merge.
