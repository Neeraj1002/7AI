# Frontend Track Task 2: App Scaffold + Core Screens (Queue, Run Detail, New Brief, Channel Switcher)

**Date**: 2026-09-09
**Status**: Complete
**Files Created**: 15
**Files Modified**: 2 (studio's CORS addition — see Deviations)
**Tests**: All Passing

## What Was Done

Scaffolded a new Expo/React Native TypeScript app at `app/` (sibling to `studio/`, Expo SDK 57, Expo Router for navigation), wired to Task 1's real tRPC API — no mocked data at any point. Built all four required screens (Queue, Run Detail, New Brief, Channel switcher) plus the token/API-URL entry screen the design doc calls for. `AppRouter`'s types are imported directly from `studio/src/api/router.ts` via a relative path — no hand-written response types, no duplicated Zod schemas, exactly as the acceptance criterion asks.

## Files Created/Modified

- Created: `app/` (new Expo package — `app.json`, `package.json`, `tsconfig.json`, `app/_layout.tsx`, `app/login.tsx`, `app/(app)/_layout.tsx`, `app/(app)/index.tsx` (Queue), `app/(app)/new-brief.tsx`, `app/(app)/run/[id].tsx` (Run Detail), `lib/auth.tsx`, `lib/storage.ts`, `lib/trpc.ts`, `lib/channel-context.tsx`, `lib/use-video-source.ts`, `components/ChannelSwitcher.tsx`, `components/GateActionBar.tsx`)
- Modified: `studio/src/api/server.ts` (added `@fastify/cors` — see Deviations), `docs/execution/frontend/STATUS.md`
- Dependencies added (`app/package.json`): `expo-router`, `expo-secure-store`, `expo-video`, `react-native-safe-area-context`, `react-native-screens`, `expo-linking`, `expo-constants`, `expo-status-bar`, `@trpc/client`, `@trpc/server` (runtime dep of `@trpc/client` itself, not just types), `@trpc/tanstack-react-query`, `@tanstack/react-query`, `superjson`, `react-native-web`, `react-dom`, `@expo/metro-runtime` (the last three for the web-preview testing path — see Deviations)

## Architecture Notes

- **Auth**: `lib/auth.tsx` holds `{ token, apiUrl }` in SecureStore (native) / `localStorage` (web dev only — SecureStore has no web implementation), entered once via `app/login.tsx`. `app/(app)/_layout.tsx` redirects to `/login` if unauthenticated.
- **tRPC client**: `lib/trpc.ts` creates a fresh `httpBatchLink`-based client (superjson transformer, matching the server) whenever the stored token/URL change, via `@trpc/tanstack-react-query`'s `createTRPCContext`. Screens call `useTRPC()` + `useQuery`/`useMutation` with `.queryOptions()`/`.mutationOptions()` — fully typed against the live server router, no codegen step.
- **Channel scoping**: `lib/channel-context.tsx` fetches `channels.list` once authenticated and holds the selected channel in memory, consumed by `ChannelSwitcher` (header) and `new-brief.tsx`. The Queue screen deliberately does **not** filter by it, per the task spec ("across channels").
- **Gate actions**: one shared `components/GateActionBar.tsx` (Approve / Reject+reason / Edit-or-Revise) used by both the Script Review and Video Review sections in Run Detail — the only difference between the two call sites is the label and which mutation/payload shape it feeds (`gate1`'s `editedScriptText` vs. `gate2`'s `notes`).
- **Video playback**: `lib/use-video-source.ts` builds an `expo-video` `VideoSource`. On a real device/simulator this attaches the `Authorization` header directly to the video request (`VideoSource.headers`, iOS/Android only per `expo-video`'s own types) — this is what would actually exercise the API's Range support end to end. On web (this session's only available testing surface — see Deviations) it instead fetches the video client-side with the header and hands the player a `blob:` URL, since `expo-video`'s web implementation doesn't support custom request headers.

## Test Results

```
npm run build       — passes (expo export --platform web; see Deviations)
npm run lint         — passes, 0 warnings after one fix (unused `View` import in login.tsx)
npm run typecheck    — passes, no errors
```

### Real end-to-end proof — via the actual running app, not curl

Ran through the Browser tool against `npx expo start --web` (see Deviations for why web, not a simulator), pointed at the real orchestrator/API on `localhost:4000`:

1. **Login**: entered the real `API_AUTH_TOKEN` and API URL → landed on Queue.
2. **Queue**: rendered real runs from `GET /runs` (statuses `paused_gate1`/`paused_gate2`/`needs_attention`) — the exact same fixture data Task 1's testing had already produced, confirmed against what Task 1's report shows.
3. **New Brief**: submitted "A short video about why sea otters hold hands while sleeping" against the real channel → `runs.create` fired, app navigated to `/run/9659488d-c6f0-427d-b966-5a9ec4c19081`, showed `RUNNING` / `intake · attempt 1 · running` immediately.
4. **Run Detail auto-progress**: reloaded a few seconds later — real script text, real Script Review score (8/10) and notes rendered in the Script Review section, `Approve`/`Reject`/`Edit / Revise` controls present.
5. **Gate 1 resolved from the app itself**: tapped **Approve** → `runs.gate1` mutation fired → screen refetched and showed `gate1 · attempt 1 · completed`, `currentStage` moved to `video_generation`, and the section collapsed to a read-only "Gate 1 (passed) — Outcome: approve" summary.
6. **Confirmed directly in Postgres** (not just via the app's own display):
   ```
   DIRECT POSTGRES: status= running currentStage= video_generation briefText= A short video about why sea otters hold hands while sleeping.
   ```
   This is the same proof Task 1's own API-level test produced, now performed by tapping the app's own controls end to end.
7. **Queue refreshed correctly**: navigating back to Queue showed the two new test runs (both eventually landed on `needs_attention` for reasons unrelated to gate resolution — see Deviations) sorted by recency, confirming the list view stays live/correct.
8. **Channel switcher**: rendered correctly with the single real channel ("Dry-run test channel") and did not error — satisfies the "zero or one channels" verification step (there is currently exactly one channel in the dev DB; the component's empty-state branch for zero channels was code-reviewed but not separately exercised, since creating a zero-channel state would require deleting the only real channel in a shared dev database).

## Deviations from Spec

1. **No Android/iOS simulator or physical device was available in this environment** (checked: no `adb`, no `emulator`, `$ANDROID_HOME` unset). The acceptance criteria's literal "Expo Go on a real phone or simulator" therefore couldn't be performed as specified. Instead, the app was run via `npx expo start --web` and driven through the actual Browser tool — a real build of the real React Native codebase (via `react-native-web`), hitting the real API, not a mock or a hand-simulated substitute. This is flagged as a genuine deviation, not glossed over: `expo-video`'s header-based video auth (the mechanism that would matter on a real device) specifically could not be exercised this way — see the Video Playback note below. If a physical device or simulator becomes available, re-running the same walkthrough via Expo Go is the natural way to close this gap; nothing about the app's code assumes web.
2. **CORS added to `studio/src/api/server.ts`** (`@fastify/cors`), not called for in Task 1's spec. Necessary specifically because of Deviation 1 — a browser enforces CORS/preflight for cross-origin requests; a native app does not. Registered before the auth hook, permissive origin (dev-only, single-operator, bearer-token-protected API — not a public one), and the auth hook now explicitly exempts `OPTIONS`. This has no effect on native app behavior and doesn't weaken the token check for any real request.
3. **Video playback (Gate 2 UI) wasn't exercised with a live, passing run.** Two real end-to-end attempts were made — one with a long brief (hit the 60-second Shorts duration cap Video Intelligence enforces), one with a deliberately short brief (produced a short-enough video but was rejected by Video Intelligence's multimodal review for confusing on-screen text) — both are genuine content-quality gates working as designed, not failures in this task's own code. Neither run reached `paused_gate2`, so the Run Detail screen's video section, the `expo-video` wiring, and the Gate 2 `GateActionBar` were verified by type-checking and code review but not by watching a real video actually play and scrub inside the running app. This mirrors Task 1's own Deviation 7 (Gate 2 wasn't independently proven there either, for the same underlying reason) and is flagged rather than claimed as done.
4. **`expo-video`'s web implementation doesn't support the `headers` option** (confirmed by reading its type definitions — the option is documented `@platform android`/`@platform ios` only). `lib/use-video-source.ts` works around this on web specifically by fetching the video client-side with the `Authorization` header and handing the player a `blob:` URL — real, working, but a different mechanism than what a native build actually uses (which attaches the header to the video request directly, the thing that would prove the API's Range support end to end from inside the app). Native code path is implemented and type-checks; only the web fallback was live-tested, for the reasons in Deviation 1.
5. **Zero-channel state for the channel switcher was reviewed, not live-tested** — see Test Results item 8.

## Sign-Off
- Task Objective: Met, with the two flagged gaps above (device/simulator testing, live Gate 2/video proof) honestly reported rather than claimed.
- Schema Impact: None (matches SCHEMA.md).
- Business Logic: None new (matches BUSINESS_LOGIC.md — this task consumes Task 1's API, introduces no new transitions).
- Tests: Passing (build/lint/typecheck); real E2E proof performed via the running app for Gate 1, not Gate 2.
- Ready for Integration: Yes — Task 3 (Dashboard) can build inside this same app shell.
