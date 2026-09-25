# Bugs Task 1: First Device Test — Login Unreachable, Wrong Host Default, Stale Build, Empty Channel Picker

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** This task follows that
template's shape, with one difference stated in `docs/execution/bugs/STATUS.md`: it uses its own track
identifier, **`BUGS`** (branch `BUGS_FE`, commits `BUGS_TASK1_FE: ...`), not a `SPRINT[N]` or
`FRONTEND` branch — a production-bug fix should not ride on the same branch as in-flight sprint scope.

**HIGH PRIORITY — PRODUCTION ISSUE.** Found by the founder on the app's first real physical-device
test (3 screenshots: New Brief, Queue, Dashboard screens), not from planned QA. R1 below is a hard
blocker: until it's fixed, the founder cannot sign in on a real device at all, which means nothing else
in this app can be verified on-device either.

**Objective**: fix the 4 real, code-confirmed problems blocking the founder's first on-device test of
7fe (`D:\Study Material\7AI-frontend`) — an Android cleartext-traffic block, a login screen that
defaults to the wrong host for a physical device, an installed app built from months-stale code, and a
channel picker that renders nothing instead of a loading/empty state.
**Duration**: 3-4 hours (mostly config + small, targeted UI/logic changes; no schema work).
**Depends On**: nothing in this repo — this is the first item in the `bugs/` track. Assumes the founder
takes a fresh `eas build` from 7fe (`D:\Study Material\7AI-frontend`) after R1-R2 land, since R1/R2
can only be verified against a build that actually contains the fix.
**Owning Component**: Mobile App (Expo/React Native) — `app/app.json` build config, `app/login.tsx`,
`app/app/(app)/new-brief.tsx`.
**Success Criteria**: on a real Android device, on the same LAN as the dev machine, the founder can (1)
load the login screen, request and verify a magic link against a `http://<LAN-ip>:<port>` API URL with
no cleartext error, (2) see a clear loading/empty/populated state on the New Brief channel picker in
every case, and (3) confirm which app (old stale build vs. new 7fe build) is actually installed.

## Task Requirement

### R1 — Android cleartext-traffic block (root blocker)

**Where**: `app/app.json` (7fe) — confirmed by direct read: `plugins` is
`["expo-router", "expo-status-bar", "expo-secure-store", "expo-video", "expo-web-browser", "expo-notifications"]`,
no `expo-build-properties` entry. A grep for `usesCleartextTraffic`/`networkSecurityConfig`/
`build-properties` across every staged file from this checkout this session returned zero matches —
no native Android network-security exception exists anywhere in the app. Android's default policy from
API 28 onward blocks all non-HTTPS network traffic at the OS level, and this app's *only* supported
mode right now is `http://` — `login.tsx`'s own default value and placeholder are both plain `http://`
URLs (there is no HTTPS path at all for a locally-run API). On a packaged, installed APK (not a dev
client, which can have a looser policy), every `fetch()`/tRPC call this app makes is silently blocked
before it leaves the device.

**Fix**:
1. `npx expo install expo-build-properties` in `app/` (not currently a dependency).
2. Add the plugin to `app.json`'s `plugins` array:
   ```json
   ["expo-build-properties", { "android": { "usesCleartextTraffic": true } }]
   ```
   This is a deliberate, narrow exception (cleartext only) appropriate to this app's own stated design
   — a single-operator "lock on the door" tool (`lib/auth.tsx`'s own comment) talking to a local-network
   API, not a general security downgrade for a public-facing app.
3. Rebuild: `eas build --platform android --profile preview` from 7fe.

**Verify**: real device, real network. `adb logcat` filtered for `CLEARTEXT` shows no blocked-request
entries when the app calls `POST /auth/request-link` or `GET /auth/verify` against a `http://` URL; the
request actually reaches the dev machine (confirm via the studio server's own request log).

### R2 — Login screen defaults to `localhost`, which is wrong on a physical device

**Where**: `app/login.tsx` line 27:
```ts
const [apiUrl, setApiUrlField] = useState(storedApiUrl ?? 'http://localhost:4000');
```
confirmed by direct read. This is not only something the founder typed — it's the screen's own
hardcoded fallback whenever no API URL is stored yet (every fresh install, or after a SecureStore
clear). On a real device, `localhost` resolves to the phone itself, never the dev machine, so every
request fails independent of R1. The only hint that a LAN IP is needed is the field's placeholder
(`http://192.168.1.10:4000`, line 88), which disappears the moment anything is typed and is easy to
miss since the default already looks like a plausible, "working" value.

**Fix**:
1. Change the fallback on line 27 from `'http://localhost:4000'` to `''` — force a deliberate entry on
   first use instead of a default that looks correct but cannot work on-device.
2. Add a persistent (not placeholder-only) hint under the API base URL field, e.g.:
   `"Use your computer's LAN IP (e.g. 192.168.1.23:4000) — this device can't reach your computer's own localhost."`

**Verify**: on a device with no stored API URL (fresh install or cleared SecureStore), the field opens
empty with the hint visible; `localhost` is no longer the value a first-time user sees pre-filled.

### R3 — Installed app was built from a stale checkout, not 7fe

**Where**: comparing the currently-installed build's source, `D:\Study Material\7AI\app` (package
`com.neeraj_1002.sevenaistudio`), against the current 7fe checkout, `D:\Study Material\7AI-frontend\app`
(package `com.sevenai.studio`) — both confirmed by direct read of each checkout's `app.json`. Two real,
confirmed divergences:
- `app/(app)/index.tsx`: the old checkout has no Sign out / Notifications / Channels row (grep-confirmed
  absent — only a bare "View Dashboard →" link exists); 7fe's has all three (Sprint 3 Task 3's own
  additions), confirmed by direct read.
- `lib/auth.tsx` / `login.tsx`: the old checkout implements the pre-Sprint-3 flow — a manually-pasted
  shared token via a single `signIn(token, apiUrl)` call, no email step. 7fe implements the real Sprint 3
  Task 1 magic-link flow (`requestMagicLink` / `verifyMagicLinkToken` / `completeSignIn` in
  `lib/auth-api.ts` and `lib/auth.tsx`), confirmed by direct read of both.

The installed app is running code from before Sprint 3 started. This alone explains "can't get back to
a sign-in screen to try again" — whatever sign-in screen the installed build shows (if it shows one at
all) is a different, older screen than the one that now exists in 7fe's source.

**Additional risk flagged for the next build**: the two checkouts declare **different Android package
IDs** (`com.neeraj_1002.sevenaistudio` vs. `com.sevenai.studio`, confirmed above). Android treats a
different `package` as a different app — a fresh build from 7fe will install **alongside** the current
app, not replace it. Expect two "7AI Studio" icons after the next install; the old one should be
uninstalled by hand once the new build is confirmed working, since no build step can do that
automatically.

**Fix**: process, not code — always run `eas build` from 7fe (`D:\Study Material\7AI-frontend`), and
run `git status` / `git log -1` in 7fe immediately before building to confirm the intended commit is
what's about to ship. No code change for this item itself.

**Verify**: after the next build + install, the installed app shows the Sign out / Notifications /
Channels row and the real magic-link login screen described above. The founder manually checks whether
the old app (`com.neeraj_1002.sevenaistudio`) is still present as a separate icon and removes it if so.

### R4 — New Brief's channel picker has no loading/empty state

**Where**: `app/app/(app)/new-brief.tsx` lines 44-58 renders `channels.map(...)` directly and nothing
else. `useChannels()` (`lib/channel-context.tsx` line 43) already exposes `isLoading` on its context
value, but `new-brief.tsx` never destructures or reads it (confirmed by direct read of both files). So
three very different situations — the channel list is still loading, it failed to load (e.g. blocked
entirely by R1's cleartext issue), or the tenant genuinely has zero channels configured — all render
identically: a blank space where the channel chips should be, with no indication of which one it is or
what to do next. This is exactly the blank "Channel" field visible in the founder's New Brief
screenshot.

**Fix**: destructure `isLoading` from `useChannels()` in `new-brief.tsx` and render one of three states
in place of the bare `channels.map(...)`:
- `isLoading` → a loading indicator.
- `!isLoading && channels.length === 0` → a real empty-state message ("No channels set up yet") with a
  link to the channel setup screen (`/channels`).
- otherwise → the existing chip list, unchanged.

**Verify**: with the API unreachable (reproducing R1/R2's failure before they're fixed, or by pointing
at a dead URL), the screen shows a clear "can't load channels" state instead of a silent blank; with a
tenant that has zero channels, it shows the "no channels yet" message instead of nothing.

## Schema Impact
None — every item here is client-side config, UI state, or process, not data model.

## Business Logic / State Transition
No new control flow. R4 adds a UI-only loading/empty branch around an existing query's already-exposed
`isLoading` flag; nothing about how channels, runs, or auth state transition changes.

## Implementation

### Files to Modify
- `app/app.json` — add the `expo-build-properties` plugin entry (R1).
- `app/package.json` — add `expo-build-properties` as a dependency (via `npx expo install`, R1).
- `app/login.tsx` — change the `apiUrl` default and add the persistent LAN-IP hint (R2).
- `app/app/(app)/new-brief.tsx` — read `isLoading` from `useChannels()` and add the loading/empty
  branches around the channel-chip list (R4).

### Detailed Steps
1. R1: install `expo-build-properties`, add the plugin block to `app.json`, rebuild via EAS.
2. R2: edit `login.tsx`'s default state and add the hint `<Text>` under the API URL field.
3. R3: no code — confirm the next build is taken from 7fe on the intended commit; after install, verify
   the new app's presence and (if needed) manually remove the old stale-build app.
4. R4: edit `new-brief.tsx` to branch on `isLoading`/`channels.length` before rendering the chip list.

### Integration Points
- R1/R2 together are what make on-device sign-in possible at all — R2 alone still fails without R1
  (cleartext blocks the request regardless of which host is entered), and R1 alone still points at the
  wrong host by default. Both are needed before R3/R4 can be verified on a real device.
- R4 depends on `lib/channel-context.tsx`'s existing `isLoading` (already implemented, unused until this
  fix) — no changes needed to the context itself.

## Testing

### Test Commands
```bash
cd app
npm run build
npm run lint
```

### Expected Results
- TypeScript compilation: No errors.
- ESLint: No warnings.
- Real device: login completes end-to-end against a LAN IP with no cleartext error (R1/R2).
- Real device: New Brief shows a loading indicator, then either chips or a real empty-state message —
  never a silent blank (R4).

### How to Verify
1. `eas build --platform android --profile preview` from 7fe, install on the test device.
2. Confirm which app icon(s) are present; uninstall the stale build if the old one is still there (R3).
3. Open the app fresh (or clear SecureStore first) — confirm the API URL field is empty with the hint
   visible, not pre-filled with `localhost` (R2).
4. Enter the dev machine's real LAN IP and port, request a magic link, paste it back in, confirm sign-in
   succeeds with no `CLEARTEXT` entries in `adb logcat` (R1).
5. Open New Brief and confirm a loading state appears briefly, then either real channel chips or a
   real "no channels yet" message (R4).

## Report Template

Generate at: `docs/execution/bugs/reports/task1.md`

```markdown
# Bugs Task 1: First Device Test — Login Unreachable, Wrong Host Default, Stale Build, Empty Channel Picker

**Date**: YYYY-MM-DD
**Status**: Complete
**Files Created**: N
**Files Modified**: N
**Tests**: All Passing

## What Was Done
[Summary]

## Files Created/Modified
- Modified: [list]

## Schema Changes Applied
None.

## Test Results
[adb logcat excerpt confirming no CLEARTEXT block; screenshot or description of the fixed New Brief states]

## Deviations from Spec
[Any changes made during implementation, and why]

## Sign-Off
- Task Objective: Met
- Schema Impact: None
- Business Logic: No new control flow
- Tests: Passing
- Real device end-to-end sign-in: Confirmed
- Ready for Integration: Yes
```

After the report is written, upsert this task's row in `docs/execution/bugs/STATUS.md` (already
scaffolded with this task's row set to "Not started" — update it in place, same convention every other
`STATUS.md` in this repo uses).

## Additional Notes
- This report's 4 items were all found together during one founder testing session (3 screenshots:
  New Brief, Queue, Dashboard) and are grouped into one task doc because they block the same
  end-to-end flow (sign in → see the queue → create a brief), not because they share a root cause — R1
  and R3 are independent failures that happened to surface at the same time.
- More founder/device-tested hotfixes are expected to land in this `bugs/` folder as `task2.md`,
  `task3.md`, etc. — see `docs/execution/bugs/STATUS.md`.

## Known Issues / Future Improvements
- R2's fix (empty default + hint) still relies on the founder typing the right LAN IP by hand every
  time the API's address changes (e.g., switching Wi-Fi networks). A future improvement could probe
  common local addresses or remember the last N URLs tried — out of scope here, this task only removes
  the actively-wrong default.

## Links & References
- [TASK_TEMPLATE.md](../../templates/TASK_TEMPLATE.md)
- [KNOWN_ISSUES_AND_BLOCKERS.md](../../KNOWN_ISSUES_AND_BLOCKERS.md) — Windows `tsx watch` orphaned-process
  issue (separate from this report, surfaced in the same testing session as an `EADDRINUSE` on port 4000)
- `docs/execution/bugs/STATUS.md`
