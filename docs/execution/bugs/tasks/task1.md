# Bugs Task 1: First Device Test — Login Unreachable, Wrong Host Default, Stale Build, Empty Channel Picker

**Read `docs/execution/templates/TASK_TEMPLATE.md` and `docs/execution/bugs/HOTFIXER_AGENT_PROTOCOL.md`
in full before starting.** This task follows the template's shape, with the bug track's own conventions:
track identifier **`BUGS`**, and — as of the protocol's 2026-09-25 revision — a per-item **role**
(`BE`/`FE`/`APP`) that decides which branch each fix goes on. See Task Requirement below for each item's
role.

**STATUS UPDATE (2026-09-25, updated twice) — re-read this before doing anything else.** A prior
hot-fixer session implemented all 4 items below and verified them via
`npm run build`/`lint`/`typecheck`, but on a throwaway worktree (`D:\Study Material\7AI-bugs-fe`) that
was never merged — no report from that session was ever committed anywhere durable. Since then:
- **First correction**: direct inspection found R1 (cleartext plugin) live on `main`, but R2 (login
  default) and R4 (channel-picker states) still only sitting as uncommitted edits in 7fe's working tree
  — not on `main` yet.
- **Second correction, current as of this note**: the founder then committed and pushed R2 and R4
  directly from 7fe to `main` as well (a deliberate founder action — the no-direct-push-to-`main` rule
  in the protocol binds hot-fixer/agent sessions, not the founder). **Re-verified by direct read**:
  `D:\Study Material\7AI\app\app\login.tsx` now has the LAN-IP hint text, and
  `D:\Study Material\7AI\app\app\(app)\new-brief.tsx` now destructures `channelsLoading` and branches on
  it — both files are byte-identical between the main checkout and 7fe (same size, mtimes ~11 minutes
  apart, consistent with commit-then-pull). **All 3 code items (R1, R2, R4) are confirmed on `main`.**
  No `BUGS_FE` branch was created or needed for this — skip the branch/commit steps entirely.
- **R3 has no code fix by design** (process only) — still applies as written below.

**What's actually left to do**:
1. Confirm R1/R2/R4 are still on `main` (`git log` / direct read of `app.json`, `login.tsx`,
   `new-brief.tsx`) — this task doc has now been wrong about this twice already (first said R2/R4 were
   missing, they'd already landed by the time that was re-checked), so verify fresh rather than trusting
   this note.
2. R3 remains process-only — confirm the next `eas build` really is taken from 7fe on the intended
   commit; no code change.
3. **Write the real report** at `docs/execution/bugs/reports/task1.md` — this has never actually been
   written to this repo or the Project; only a draft existed on the abandoned, unmerged
   `7AI-bugs-fe`/`BUGS_FE` worktree from the first hot-fixer session. Use the Report Template below,
   reflecting what's actually true now: all 4 items done, R1/R2/R4 all landed via direct founder pushes
   to `main` (not through this protocol's normal branch/PR flow — note that plainly in the report rather
   than implying a `BUGS_*` branch was used), R3 process-only. Do not copy the old draft's framing
   verbatim — its worktree-naming deviation and "still uncommitted" framing are no longer the current
   story.
4. Update `STATUS.md`'s row to `Code complete, on main — real-device verification pending`, `Branch`
   column: `— (founder pushed directly to main)`.
5. **Real on-device verification is still founder-action-pending regardless** — nothing above replaces
   an actual physical-device pass (login, build/install, channel picker). Say so plainly in the report.
6. Update this task's `STATUS.md` row to reflect the real state once done.
7. **Real on-device verification is still founder-action-pending either way** — nothing above replaces
   an actual physical-device pass. Say so plainly in the report, same as every other task doc's bar.

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

### R1 — Android cleartext-traffic block (root blocker) — role: `APP` — **already shipped, on `main`**

**Where**: `app/app.json` (7fe) — confirmed by direct read: `plugins` was
`["expo-router", "expo-status-bar", "expo-secure-store", "expo-video", "expo-web-browser", "expo-notifications"]`,
no `expo-build-properties` entry. Android's default policy from API 28 onward blocks all non-HTTPS
network traffic at the OS level, and this app's *only* supported mode right now is `http://`.

**Fix — done**:
1. `npx expo install expo-build-properties` in `app/` — run by the founder directly.
2. Plugin added to `app.json`'s `plugins` array:
   ```json
   ["expo-build-properties", { "android": { "usesCleartextTraffic": true } }]
   ```
   Confirmed present on `main` by direct read.
3. Rebuild: `eas build --platform android --profile preview` from 7fe — **not yet done**; bundle this
   into the same build as Bugs Task 2 (both are `APP`-role changes, so per the protocol's "one native
   build for everything currently pending" principle, one rebuild should cover both).

**Verify**: real device, real network. `adb logcat` filtered for `CLEARTEXT` shows no blocked-request
entries when the app calls `POST /auth/request-link` or `GET /auth/verify` against a `http://` URL; the
request actually reaches the dev machine (confirm via the studio server's own request log). **Still
founder-action-pending** — no device access from any chat session.

### R2 — Login screen defaults to `localhost`, which is wrong on a physical device — role: `FE` — **done, on `main`**

**Where**: `app/login.tsx` line 27 was:
```ts
const [apiUrl, setApiUrlField] = useState(storedApiUrl ?? 'http://localhost:4000');
```
On a real device, `localhost` resolves to the phone itself, never the dev machine, so every request
fails independent of R1.

**Fix — done, confirmed on `main` by direct read**:
1. Fallback changed from `'http://localhost:4000'` to `''` — force a deliberate entry on first use.
2. Persistent hint added under the API base URL field:
   `"Use your computer's LAN IP (e.g. 192.168.1.23:4000) — this device can't reach your computer's own localhost."`
   Confirmed present in `D:\Study Material\7AI\app\app\login.tsx` as of this note — pushed directly to
   `main` by the founder from 7fe, no `BUGS_FE` branch involved.

**Verify**: on a device with no stored API URL (fresh install or cleared SecureStore), the field opens
empty with the hint visible; `localhost` is no longer the value a first-time user sees pre-filled.
Code-level correctness confirmed by direct read; real on-device confirmation is still
founder-action-pending.

### R3 — Installed app was built from a stale checkout, not 7fe — role: process (no branch)

**Where**: comparing the currently-installed build's source, `D:\Study Material\7AI\app` (package
`com.neeraj_1002.sevenaistudio`), against the current 7fe checkout, `D:\Study Material\7AI-frontend\app`
(package `com.sevenai.studio`) — both confirmed by direct read of each checkout's `app.json`. Two real,
confirmed divergences:
- `app/(app)/index.tsx`: the old checkout has no Sign out / Notifications / Channels row; 7fe's has all
  three (Sprint 3 Task 3's own additions).
- `lib/auth.tsx` / `login.tsx`: the old checkout implements the pre-Sprint-3 flow — a manually-pasted
  shared token, no email step. 7fe implements the real Sprint 3 Task 1 magic-link flow.

The installed app is running code from before Sprint 3 started.

**Additional risk flagged for the next build**: the two checkouts declare **different Android package
IDs** (`com.neeraj_1002.sevenaistudio` vs. `com.sevenai.studio`). A fresh build from 7fe will install
**alongside** the current app, not replace it. Expect two "7AI Studio" icons after the next install; the
old one should be uninstalled by hand once the new build is confirmed working.

**Fix**: process, not code — always run `eas build` from 7fe (`D:\Study Material\7AI-frontend`), and
run `git status` / `git log -1` in 7fe immediately before building to confirm the intended commit is
what's about to ship. No code change for this item itself.

**Verify**: after the next build + install, the installed app shows the Sign out / Notifications /
Channels row and the real magic-link login screen described above. The founder manually checks whether
the old app (`com.neeraj_1002.sevenaistudio`) is still present as a separate icon and removes it if so.

### R4 — New Brief's channel picker has no loading/empty state — role: `FE` — **done, on `main`**

**Where**: `app/app/(app)/new-brief.tsx` rendered `channels.map(...)` directly and nothing else.
`useChannels()` (`lib/channel-context.tsx`) already exposes `isLoading` on its context value, but
`new-brief.tsx` never destructured or read it. So three very different situations — still loading,
failed to load (e.g. blocked by R1's cleartext issue), or genuinely zero channels — all rendered
identically: a blank space.

**Fix — done, confirmed on `main` by direct read**: destructures `isLoading` (aliased `channelsLoading`)
from `useChannels()` and renders one of three states:
- `channelsLoading` → a loading indicator.
- `!channelsLoading && channels.length === 0` → a real empty-state message ("No channels set up yet.")
  with a link to `/channels`.
- otherwise → the existing chip list, unchanged.
Confirmed present in `D:\Study Material\7AI\app\app\(app)\new-brief.tsx` as of this note — pushed
directly to `main` by the founder from 7fe, alongside R2, no `BUGS_FE` branch involved.

**Verify**: with the API unreachable, the screen shows a clear "can't load channels" state instead of a
silent blank; with a tenant that has zero channels, it shows the "no channels yet" message. Founder-
action-pending on-device; code-level correctness can be confirmed by direct read now.

## Schema Impact
None — every item here is client-side config, UI state, or process, not data model.

## Business Logic / State Transition
No new control flow. R4 adds a UI-only loading/empty branch around an existing query's already-exposed
`isLoading` flag; nothing about how channels, runs, or auth state transition changes.

## Implementation

### Files to Modify
- `app/app.json` — `expo-build-properties` plugin entry (R1) — **done, on `main`**.
- `app/package.json` / `package-lock.json` — `expo-build-properties` dependency (R1) — **done, on
  `main`**.
- `app/login.tsx` — `apiUrl` default + persistent LAN-IP hint (R2) — **done, on `main`**.
- `app/app/(app)/new-brief.tsx` — `isLoading`/empty-state branching (R4) — **done, on `main`**.

All 4 code items landed on `main` via two direct founder pushes (R1 first, then R2/R4 together) rather
than through this protocol's normal `BUGS_*` branch/PR flow — note that plainly in the report rather
than implying a bugs-track branch was used for any of it.

### Detailed Steps
1. R1/R2/R4: confirm all three are actually on `main` (direct read) — do not re-implement.
2. R3: no code — confirm the next build is taken from 7fe on the intended commit; after install, verify
   the new app's presence and (if needed) manually remove the old stale-build app.
3. Write the report — this is the only real remaining work item. Update `STATUS.md`'s row and `Branch`
   column (`— (founder pushed directly to main)`).

## Testing

### Test Commands
```bash
cd app
npm run build
npm run lint
npm run typecheck
```

### Expected Results
- TypeScript compilation: No errors.
- ESLint: No warnings.
- Real device: login completes end-to-end against a LAN IP with no cleartext error (R1/R2).
- Real device: New Brief shows a loading indicator, then either chips or a real empty-state message —
  never a silent blank (R4).

### How to Verify
1. `eas build --platform android --profile preview` from 7fe (bundle with Bugs Task 2 per its own
   "last native build for a while" note), install on the test device.
2. Confirm which app icon(s) are present; uninstall the stale build if the old one is still there (R3).
3. Open the app fresh (or clear SecureStore first) — confirm the API URL field is empty with the hint
   visible, not pre-filled with `localhost` (R2).
4. Enter the dev machine's real LAN IP and port, request a magic link, paste it back in, confirm sign-in
   succeeds with no `CLEARTEXT` entries in `adb logcat` (R1).
5. Open New Brief and confirm a loading state appears briefly, then either real channel chips or a
   real "no channels yet" message (R4).

## Report Template

Generate at: `docs/execution/bugs/reports/task1.md` — **this file does not exist yet anywhere durable;
write it for real this time**, following this repo's standard report shape (see any sprint task's report
for the pattern), including an explicit per-item role/status table (R1 `APP`/done-on-main,
R2 `FE`/done-on-main, R3 process/no-code, R4 `FE`/done-on-main — note all three code items landed via
direct founder pushes, not a `BUGS_*` branch/PR) and an explicit, honest statement that real on-device
verification is still founder-action-pending.

## Additional Notes
- This report's 4 items were all found together during one founder testing session (3 screenshots:
  New Brief, Queue, Dashboard) and are grouped into one task doc because they block the same
  end-to-end flow (sign in → see the queue → create a brief), not because they share a root cause.
- The role split (`BE`/`FE`/`APP`) was introduced after this task was first written — R1's `APP` label
  and R2/R4's `FE` label are applied retroactively; nothing about the fixes themselves changed.
- More founder/device-tested hotfixes are expected to land in this `bugs/` folder — see
  `docs/execution/bugs/STATUS.md`.

## Known Issues / Future Improvements
- R2's fix (empty default + hint) still relies on the founder typing the right LAN IP by hand every
  time the API's address changes (e.g., switching Wi-Fi networks). Out of scope here.

## Links & References
- [TASK_TEMPLATE.md](../../templates/TASK_TEMPLATE.md)
- [HOTFIXER_AGENT_PROTOCOL.md](../HOTFIXER_AGENT_PROTOCOL.md) — Track Roles section
- [KNOWN_ISSUES_AND_BLOCKERS.md](../../KNOWN_ISSUES_AND_BLOCKERS.md)
- `docs/execution/bugs/tasks/task2.md` — the bundled native rebuild this task's R1 should ship with
- `docs/execution/bugs/STATUS.md`
