# Bugs Task 2: Bundle All Remaining Native-Config Changes + Finish OTA Update Support

**Date**: 2026-09-26
**Status**: Code complete — real build/on-device/OTA verification pending (founder action needed)
**Files Created**: 1 (this report)
**Files Modified**: 1 (`app/app.json`) + `docs/execution/bugs/STATUS.md`
**Tests**: `npm run build`/`lint`/`typecheck` all passing. Real build, install, and OTA proof not
performed — see below.

## What Was Done

### R1 — Audit for every other pending native-config change

Cross-referenced every source the task doc named:

- **`app/app.json`'s `plugins` vs. `app/package.json`'s dependencies**: every Expo package that needs a
  config-plugin entry already has one (`expo-router`, `expo-status-bar`, `expo-secure-store`,
  `expo-video`, `expo-web-browser`, `expo-notifications`, `expo-build-properties`). `expo-updates` does
  not require a `plugins` array entry — it configures via the top-level `updates`/`runtimeVersion` keys,
  not a config plugin. No native module in `package.json` (`react-native-svg`,
  `react-native-safe-area-context`, `react-native-screens`, `react-native-gifted-charts`,
  `@expo/metro-runtime`) requires a plugin entry either — none of them need permissions or native config
  beyond autolinking.
- **`docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md`**: read in full. Confirmed — as the task doc predicted
  — it has zero open items describing a pending *mobile app native config* gap. Every open item is
  backend/pipeline (Windows process handling, YouTube OAuth scopes/quota, push-delivery verification,
  CORS). Nothing to bundle from this source.
- **Sprint 3 frontend work** (`expo-secure-store`, `expo-notifications`): both already present in
  `app.json`'s `plugins` array as of this task's starting point — nothing half-configured found.
- **Bugs Task 1**: confirmed R1 (cleartext/`expo-build-properties`) is the only native change that task
  introduced — R2/R4 are both pure JS/logic changes, correctly tagged `FE` in `STATUS.md`.
- **`git log -p` on the "Add EAS build configuration for Android" commit (`2d3ecde`)** — this is the one
  real correction to the task doc's own assumption. The task doc guessed `expo-updates`/
  `runtimeVersion`/`updates` "most likely landed as scaffolding from" this commit. **Direct read shows
  that's wrong**: `2d3ecde` only added `android.package` to `app.json` and created `app/eas.json` (build
  profiles) — it never touched `expo-updates`, `runtimeVersion`, or `updates`. Those three actually
  landed later, in commit `947d81d` ("Update app configuration and enhance loading states in
  NewBriefScreen and LoginForm") — the same founder commit that also carried Task 1's R1 cleartext fix
  and R2/R4's login/new-brief changes, bundled together. The task doc's *conclusion* still holds (this
  was scaffolding, not a deliberate OTA setup — `947d81d`'s own commit message doesn't mention OTA at
  all), just attributed to the wrong commit. Flagging this since the task doc explicitly asked to
  "confirm... before assuming" rather than trust its own summary.

**Conclusion**: no other pending native-config change found. Nothing beyond R2 below needed bundling into
this build.

### R2 — Finish configuring `expo-updates`

Confirmed `expo-updates@~57.0.23` is already installed (no reinstall performed, per the task doc's
correction) and compatible with the installed `expo@~57.0.21` SDK (both are SDK 57).

Changes to `app/app.json`:
```json
"runtimeVersion": {
  "policy": "fingerprint"   // was "appVersion"
},
"updates": {
  "url": "https://u.expo.dev/d0c7c763-2b09-443c-95ba-70f4e1811c67",
  "checkAutomatically": "ON_LOAD"   // new — was unset (implicit SDK default)
}
```

**`runtimeVersion` decision**: switched to `"fingerprint"`, per the task doc's own recommendation.
Rationale (same as the task doc's): this project is mid-way through consecutive native rebuilds (Task 1's
cleartext plugin, now this task) while `"version"` has stayed a static `"1.0.0"` throughout — under
`"appVersion"`, two installs with genuinely different native config could both report the same runtime
version and be told they're OTA-compatible when they're not. `"fingerprint"` derives the runtime version
from actual native config/dependencies instead, closing that gap. No reason surfaced during this audit to
keep `"appVersion"` instead.

**`checkAutomatically`**: set explicitly to `"ON_LOAD"` (check for updates every time the app opens),
rather than relying on whatever the installed `expo-updates` version's default is — matches the task
doc's stated rationale (active daily testing).

**`updates.url` / `extra.eas.projectId` match**: confirmed — both reference the same project ID
(`d0c7c763-2b09-443c-95ba-70f4e1811c67`). No change needed, no `eas update:configure` re-run performed
(nothing was broken).

### R3 — Document the shipping boundary

Added to `docs/execution/bugs/STATUS.md` (new section, "Shipping boundary — read this before deciding
whether a fix needs a rebuild"): from this point forward, a JS/React-Native-logic-only change ships via
`eas update --branch preview` with no rebuild; only a genuinely native change needs a full `eas build`,
and the next person who finds one should check for other pending native changes to bundle in, same as
this task did.

## Bundled native changes in this build
For a founder skimming this report — everything in this build that requires a fresh install rather than
an OTA update:
1. **Task 1's R1** — `expo-build-properties` + `usesCleartextTraffic` (already on `main`, included here
   for completeness since it's part of "why the next build needs a fresh install").
2. **This task's R2** — `runtimeVersion.policy` changed to `"fingerprint"`, `updates.checkAutomatically`
   set to `"ON_LOAD"` (both are native-level config; a `runtimeVersion`/`updates` change is explicitly
   called out as `APP`-role in the protocol, even though it doesn't add a dependency or permission).

No other native change was found pending (see R1's audit above) — this is intended to be the last
native-only rebuild needed for a while, per the task's own objective.

## Schema Changes Applied
None.

## Test Results
```
$ npm run build   (expo export --platform web)
Exported: dist                                                        → PASS, no errors

$ npm run lint    (expo lint)
(no output — no warnings/errors)                                      → PASS

$ npm run typecheck   (tsc --noEmit, app/ + referenced studio/ types)
(no output — no errors)                                               → PASS

$ npx expo config --type public   (resolved config sanity check)
runtimeVersion: { policy: 'fingerprint' }
updates: { url: '...', checkAutomatically: 'ON_LOAD' }                → confirmed resolved correctly
```
No real `eas build`, no install, no OTA publish/fetch cycle performed — see **Founder verification steps
for OTA** below.

## Founder verification steps for OTA (real, not "should work")

This is the one piece of this task that genuinely cannot be verified from this environment (no `adb`/
`eas` device session, same gap as Task 1). Exact steps:

1. Merge/rebase this branch (`BUGS_APP_b2`) so 7fe (or whichever checkout builds) has both Task 1's R1
   and this task's R2 changes.
2. `cd app && eas build --platform android --profile preview` — this is versionCode **2** (confirmed via
   `eas build:version:get --platform android` before creating this branch, which returned the current
   value **1**).
3. Install the resulting APK on the test device (uninstall any older build first if package/signing
   differs — same caution as Task 1's R3).
4. Open the app once to confirm it launches normally (basic native-config sanity check).
5. Make one trivial, low-risk JS-only text change (e.g. a label tweak) **on this same runtime
   fingerprint** — do not add any native config in this test change.
6. `eas update --branch preview --message "OTA test"` to publish it.
7. Close and reopen the already-installed app (no reinstall, no new APK) — because `checkAutomatically`
   is `"ON_LOAD"`, it should check for and apply the update on that open.
8. Confirm the trivial change is visible in the running app, and that no new APK/download was involved.

If step 8 fails (update doesn't apply), the most likely causes to check first: the test device's build
was not actually taken from the fingerprint this update was published against (a native-config mismatch
would make `expo-updates` correctly refuse the update, not a bug), or the `preview` channel in
`app/eas.json` doesn't match the branch used for `eas update`.

## Deviations from Spec

1. **R1's `git log -p` correction**: the task doc guessed `expo-updates`/`runtimeVersion`/`updates`
   landed via commit `2d3ecde`; direct read shows they actually landed via `947d81d`. Documented above —
   this doesn't change any fix, just corrects the paper trail per the task doc's own "confirm, don't
   assume" instruction.
2. **Worktree**: this task's commit is on the newly created `D:\Study Material\7AI-bugs` (not a rename of
   `7AI-bugs-fe`, which is locked by an OS-level issue) — see `STATUS.md`'s checkout-location note and
   `reports/task1.md`'s own note on the same problem.
3. No functional deviation from the task doc's R2 Fix steps — `runtimeVersion: "fingerprint"` and
   `checkAutomatically: "ON_LOAD"` are exactly what was specified as the recommendation.

## Sign-Off
- Task Objective: Met for (1) and (2)'s code — the audit is real and documented, `expo-updates` is fully
  configured. **Not met** for (3) — the real, live OTA proof — that's founder-action-pending.
- Schema Impact: None
- Business Logic: No new control flow
- Tests: Build/lint/typecheck passing
- Real device install + OTA proof: **Not confirmed** — see Founder verification steps above.
- Ready for Integration: Code yes; full task sign-off no, pending the founder's build + OTA test.

## Known Issues / Future Improvements
- None new. The shipping-boundary statement in `STATUS.md` (R3) is the durable answer to "does my next
  fix need a rebuild" going forward.

## Links & References
- [TASK_TEMPLATE.md](../../templates/TASK_TEMPLATE.md)
- [HOTFIXER_AGENT_PROTOCOL.md](../HOTFIXER_AGENT_PROTOCOL.md)
- [KNOWN_ISSUES_AND_BLOCKERS.md](../../KNOWN_ISSUES_AND_BLOCKERS.md)
- `docs/execution/bugs/tasks/task1.md` and `docs/execution/bugs/reports/task1.md`
- `docs/execution/bugs/STATUS.md`
