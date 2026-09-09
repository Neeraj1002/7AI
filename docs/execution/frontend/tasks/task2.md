# Frontend Track Task 2: App Scaffold + Core Screens (Queue, Run Detail, New Brief, Channel Switcher)

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow (branch/commit/PR steps for this task), the `STATUS.md` update this task must make, and the section structure this file follows. This file states only this task's specifics — the template governs everything else, so don't skip it.

**Objective**: Stand up the Expo/React Native app and build the four core screens from `docs/design_doc/frontend/MOBILE_APP_DESIGN.md` Section 4, wired to Task 1's real API — not mocked data.
**Duration**: 6–8 hours
**Depends On**: Task 1 (API layer) must be complete and running — this task has nothing real to render otherwise.
**Owning Component**: New — a sibling app package (proposed path: `app/`, alongside `studio/` at the repo root; confirm this doesn't collide with anything already there before creating it).
**Success Criteria**: A real gate decision, submitted by tapping a button in the running app (Expo Go on a real phone or simulator), provably advances a real `PipelineRun` in Postgres — the same proof Task 1 required, now from the actual UI instead of curl.

## Task Requirement

Build exactly the screens `MOBILE_APP_DESIGN.md` Section 4 specifies — Queue, Run Detail, New Brief, Channel switcher — and nothing beyond that scope (Dashboard is Task 3, deliberately separate). Keep the UI minimal per the founder's own instruction ("keep the UI minimal but designed for scaling") — favor plain lists and forms over custom visual design in this pass; polish is not the goal yet, provable correctness against real data is.

### Context
`docs/design_doc/frontend/MOBILE_APP_DESIGN.md` Sections 2 (framework decision — Expo/React Native, already made) and 4 (screen structure, already scoped). `docs/execution/frontend/tasks/task1.md` (the API this screen set consumes).

### Acceptance Criteria
- [ ] Expo project scaffolded (TypeScript template, Expo Router for navigation) as its own package, not nested inside `studio/`.
- [ ] `API_AUTH_TOKEN` stored via Expo SecureStore, entered once (a simple settings/login screen holding just the token and the API base URL — this is the "lock on the door" `MOBILE_APP_DESIGN.md` Section 3 describes, not a real auth system).
- [ ] tRPC client wired against Task 1's API, sharing the server's route types directly (no hand-written response types, no duplicated Zod schemas — if the API and app live in the same repo/workspace, import the types directly; if that's not practical, say so in the report and document the fallback).
- [ ] **Queue screen**: lists runs in `paused_gate1`, `paused_gate2`, or `needs_attention`, across channels, pulling from `GET /runs` with the right filter.
- [ ] **Run Detail screen** — one screen, sectioned by whichever gate is currently active (confirmed design, see `docs/design_doc/frontend/MOBILE_APP_DESIGN.md` Section 4): brief + stage history always shown; below that, a Script Review section (script text + Script Review's score/notes) while paused at Gate 1, or a Video Review section (real video playback + Video Intelligence's verdict) while paused at Gate 2 — never both at once. A gate already passed collapses to a read-only summary rather than disappearing.
  - Video playback uses `expo-video` against the new `GET /runs/:id/video` endpoint, with the `API_AUTH_TOKEN` attached as a header on the video source (confirm `expo-video`'s current API for custom headers — it has changed across SDK versions, check against whatever Expo SDK version this task scaffolds with). Confirm real seeking/scrubbing works, not just playback from the start — this is what proves the API's Range support (Task 1) actually works end to end.
  - Both sections use the same three-action pattern: **Approve**, **Reject** (with a reason field), **Edit/Revise** (opens a feedback sheet). At Gate 1 the sheet offers editing the script text directly *or* leaving notes for regeneration; at Gate 2, notes only. All three call `POST /runs/:id/gate1` or `/gate2` and reflect the result by refetching and showing the run's new state — not just a success toast.
- [ ] **New Brief screen**: a form (channel picker + brief text) that calls `POST /runs` and navigates to the new run's detail screen on success.
- [ ] **Channel switcher**: present and wired to `GET /channels` from day one, even with only one channel active — per `MOBILE_APP_DESIGN.md` Section 4's explicit instruction that this should be a data change later, not a UI rewrite.
- [ ] Explicitly out of scope for this task, per the design doc: channel creation/settings UI, any multi-user auth/roles, push notifications. Don't build placeholders for these — just don't build them.
- [ ] Real end-to-end proof: from the running app, submit a brief, wait for (or trigger) a gate, resolve it by tapping the app's own controls, and confirm in Postgres that the run advanced.

## Schema Impact
None.

## Business Logic / State Transition
None new — this is a consumer of Task 1's API, not a new business-logic surface.

### Reference
`docs/execution/frontend/tasks/task1.md`, `docs/design_doc/frontend/MOBILE_APP_DESIGN.md` Section 4.

## Implementation

### Detailed Steps
1. Confirm Task 1's API is running and reachable before starting — this task is blocked without it, don't build against mocks and swap later.
2. Scaffold the Expo project (`npx create-expo-app` with the TypeScript template, add Expo Router).
3. Build the token/API-URL entry screen and SecureStore wiring first — every other screen depends on being authenticated.
4. Wire the tRPC client.
5. Build Queue, then Run Detail (the most complex screen — build the gate controls last, after the read-only detail view works), then New Brief, then the channel switcher.
6. Run the real end-to-end proof from the app itself.
7. Update `docs/execution/frontend/STATUS.md` with this task's row.

## Testing

### Test Commands
```bash
npm run build
npm run lint
npm run typecheck
npx expo start   # manual verification via Expo Go or a simulator — no automated UI test suite expected at this stage
```

### Expected Results
- The app launches, accepts a token, and successfully lists real runs from Task 1's API.
- A gate resolved from the app is reflected in Postgres exactly as Task 1's own API-level proof was.

### How to Verify
1. Run all test commands above.
2. Walk through the real end-to-end proof manually: New Brief → wait for a gate → resolve it from Run Detail → confirm the run's `currentStage` advanced in Postgres.
3. Confirm the channel switcher renders (even trivially, with one channel) and doesn't error with zero or one channels.

## Additional Notes
No new external credentials — this task only needs Task 1's `API_AUTH_TOKEN` and a reachable API URL (localhost/LAN address during development is fine; a real deployment target for the API is not this task's concern).

## Links & References
- [docs/design_doc/frontend/MOBILE_APP_DESIGN.md](../../../design_doc/frontend/MOBILE_APP_DESIGN.md) — Sections 2, 4
- [docs/execution/frontend/tasks/task1.md](task1.md) — the API this task consumes
- [docs/execution/frontend/tasks/task3.md](task3.md) — the Dashboard screen, deliberately built separately
- [docs/execution/frontend/BUSINESS_LOGIC.md](../BUSINESS_LOGIC.md)
