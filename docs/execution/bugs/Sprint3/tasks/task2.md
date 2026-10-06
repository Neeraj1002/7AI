# Bugs Task 2: Bundle All Remaining Native-Config Changes + Finish OTA Update Support

**Role: `APP`** (see `HOTFIXER_AGENT_PROTOCOL.md`'s Track Roles section) — every item in this task
touches native config (`app.json`'s `plugins`/`runtimeVersion`/`updates`), so it can only ship via a
fresh `eas build`, never OTA. **Branch: `BUGS_APP_b<N>`**, where `<N>` is `eas build:version:get
--platform android`'s current value **+ 1** (this repo's `eas.json` sets `appVersionSource: "remote"`,
so the real version code lives on EAS's servers, not in `app.json` — run the command, don't guess).
Confirm the exact value before naming the branch; state it in the report.

**Read `docs/execution/templates/TASK_TEMPLATE.md` and `docs/execution/bugs/HOTFIXER_AGENT_PROTOCOL.md`
in full before starting.** Use the shared worktree `D:\Study Material\7AI-bugs` (create it fresh from
`origin/main` if it doesn't exist yet at that exact path — see the protocol's Coordination §4; a
previous task mistakenly created `D:\Study Material\7AI-bugs-fe` instead, scoped by branch suffix. If
that folder still exists, do not add a third worktree — reuse it by renaming, or delete it and create
`7AI-bugs` fresh, founder's call if ambiguous). Bugs Task 1's R2/R4 (`BUGS_FE`, committed separately per
that task's own update) are a different role and branch — don't mix them into this one.

**`origin/main` is confirmed current and stable to branch from right now** — the founder just committed
and pushed Bugs Task 1's `expo-build-properties`/cleartext fix (`app/app.json`, `app/package.json`,
`app/package-lock.json`) directly (a deliberate founder action, not a hot-fixer push — see the
protocol's new no-direct-push-to-`main` rule, added specifically because a previous hot-fixer session
violated it while resolving a merge conflict; GitHub branch protection on `main` is being added as a
backstop). Confirm with `git log -1 origin/main` before branching, but don't expect a stale tip.

**HIGH PRIORITY — PRODUCTION ISSUE.** Two real, related problems, both about the same underlying pain:
build → download → install → test is slow and expensive, and the founder cannot tolerate the app
crashing or being hard to fix while actually trying to evaluate the business (whether individual
channels/formats are worth continuing). Bundling both into one task is deliberate — problem 2's own
setup (`expo-updates`) is itself a native change, so doing it in the same build as problem 1 means this
is the *last* native-only rebuild needed for a while, not two separate expensive cycles.

**Objective**: (1) find and ship every currently-pending native-config change in one bundled build, so
no second native rebuild is immediately needed after this one; (2) stand up real OTA update support
(`expo-updates`) so that future JS/asset-only fixes — most bug fixes — ship without a new APK build,
download, or reinstall at all.
**Duration**: 2-3 hours (shorter than originally scoped — `expo-updates` turned out to already be
installed with a `updates.url` in place; remaining work is the audit, the `runtimeVersion`/
`checkAutomatically` decisions, and one real build+publish+fetch verification cycle).
**Depends On**: Bugs Task 1 (already landed on `main` — `expo-build-properties`/cleartext).
**Owning Component**: Mobile App (Expo/React Native) — `app/app.json`, `app/package.json`, EAS Update
configuration.
**Success Criteria**: (1) a documented, real audit confirms no other pending native-config change is
left unbundled — or every one found is fixed in this same task; (2) `expo-updates` (already installed)
is fully configured — a deliberate `runtimeVersion` policy and an explicit `checkAutomatically` setting,
not the half-configured state found at the start of this task; (3) **real, live proof** that a JS-only
change published via `eas update --branch preview` reaches an already-installed build without a new
APK — not "should work."

## Task Requirement

### R1 — Audit for every other pending native-config change, fix all of them here

**Where**: this needs a real audit, not a guess — cross-reference all of the following before
concluding nothing else is pending:
- `app/app.json`'s `plugins` array against every Expo/native package actually listed in
  `app/package.json`'s dependencies — confirm each one that needs a config plugin has it (e.g. a
  package requiring a permission, an entitlement, or native config beyond its bare JS import).
- `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md` — read it in full; as of this task's writing it has
  no open items describing a pending *mobile app native config* gap (its open items are backend/pipeline
  concerns — Windows process handling, a Telegram poller conflict, a YouTube OAuth scope, etc.), but
  confirm this is still true rather than trusting this task doc's own summary of it.
- `docs/execution/sprint3/tasks/frontend-task*.md` and their reports — Sprint 3's frontend work (magic
  link, channel switcher, push notifications) already shipped native config (`expo-secure-store`,
  `expo-notifications` are both already in `app.json`'s plugins as of this task) — confirm nothing from
  that work was left half-configured.
- `docs/execution/bugs/tasks/task1.md` and its report — confirm R1 (cleartext) is the *only* native
  change that task introduced, so nothing from it is still outstanding.
- `git log -p` for the earlier "Add EAS build configuration for Android" commit (the one that added
  `app/eas.json` and, per R2's finding below, appears to have also added `expo-updates` and an `updates`
  block to `app.json`) — confirm exactly what that commit touched, in case it left something else
  half-configured the way it did with `runtimeVersion`/`checkAutomatically`.

**Fix**: implement everything genuinely found, in this same task/commit — do not defer a second pending
native change to a later task if one turns up; the entire point of this task is bundling.

**Verify**: list every native-level change bundled into this build in the report (including R2's
`expo-updates` addition below, which is itself native) — a founder reading the report should see the
complete list of "why this build needs a fresh install" reasons in one place.

### R2 — Finish configuring `expo-updates` (OTA support for future JS/asset-only fixes)

**Where — corrected 2026-09-25, re-check before starting**: earlier drafts of this task assumed
`expo-updates` wasn't installed at all. Direct read of the current `main`/7fe checkout shows that's no
longer true — `app/package.json` already lists `"expo-updates": "~57.0.23"`, and `app/app.json` already
has:
```json
"runtimeVersion": { "policy": "appVersion" },
"updates": { "url": "https://u.expo.dev/d0c7c763-2b09-443c-95ba-70f4e1811c67" }
```
matching `extra.eas.projectId`. This most likely landed as scaffolding from the earlier "Add EAS build
configuration for Android" commit, not from any deliberate OTA setup — **confirm this via `git log -p`
on `app/app.json` before assuming**, since if it's wrong, the audit below still needs doing properly.
What's genuinely still missing: `updates.checkAutomatically` isn't set at all (so it's on whatever
`expo-updates`'s own default is — don't assume, check the installed version's docs), and the
`runtimeVersion` policy is `"appVersion"` (tied to the static `"version": "1.0.0"` in both `app.json`
and `package.json`) rather than `"fingerprint"`.

**Fix**:
1. ~~`npx expo install expo-updates`~~ — already installed, skip. Confirm the installed version
   (`~57.0.23` as of this note) is still current and compatible with the installed `expo` SDK version
   before touching anything else.
2. Decide `runtimeVersion` policy and implement it. Recommendation: switch to `"policy": "fingerprint"`
   — it derives the runtime version automatically from actual native config/dependencies, which matters
   *specifically* because this project is mid-way through several native rebuilds in quick succession
   (R1's cleartext plugin, this task's own audit findings) while `"version"` has stayed a static
   `"1.0.0"` the whole time. Under `"appVersion"`, two installs with genuinely different native config
   but the same `"1.0.0"` string could both be told they're eligible for the same OTA update, which is
   exactly the kind of mismatch `"fingerprint"` exists to prevent. If you find a concrete reason
   `"appVersion"` is actually fine here (e.g. the founder commits to manually bumping `version` on every
   native change from now on), say so in the report and justify keeping it — don't silently leave it as
   `"appVersion"` just because it's already there.
3. Set `updates.checkAutomatically: "ON_LOAD"` explicitly (don't rely on the installed version's
   default, whatever it is) — the app should check for a new update every time it's opened, given this
   is still active daily testing.
4. Confirm `updates.url` (already present) still matches `extra.eas.projectId` (already present) — no
   change expected here, just a confirmation, not a re-run of `eas update:configure` unless something's
   actually broken.

**Verify — real, not "should work"**: after this native build is built and installed on the founder's
device (founder action, same as Task 1), publish one real, trivial, JS-only test change (e.g. a
one-line text tweak somewhere low-risk) via `eas update --branch preview`, and confirm the
already-installed app picks it up on its next open — **without a new APK build or reinstall**. This is
the one piece of this task that can't be verified from this environment (no device here either, same
gap as Task 1) — write the exact steps the founder should run to perform this check themselves, and
mark this verification step explicitly as founder-action-pending in the report, the same honest posture
Task 1's report already used for its own device-verification gap.

### R3 — Document the "last native build for a while" boundary

**Where**: `docs/execution/bugs/STATUS.md` and this task's own report.

**Fix**: add a clear, short statement: from this build forward, a JS/React-Native-logic-only change
(most bug fixes — same shape as Bugs Task 1's own R2/R4) ships via `eas update --branch preview`, no
rebuild or reinstall needed. Only a genuinely native change (a new native dependency, a new permission,
an `app.json` plugin addition) requires another full build — and per R1's bundling principle, the next
person who finds one should check whether *anything else* pending can be bundled into that same build
too, rather than shipping native rebuilds one at a time.

**Verify**: the statement is present and unambiguous — a founder skimming `STATUS.md` should be able to
tell, for any future fix, whether it needs OTA or a rebuild.

## Schema Impact
None.

## Business Logic / State Transition
None new — this is client-side native/build configuration, not application logic.

## Implementation

### Files to Create
- `docs/execution/bugs/reports/task2.md` (this task's report).

### Files to Modify
- `app/app.json` — `runtimeVersion.policy` (decide fingerprint vs. appVersion), `updates.checkAutomatically`,
  plus whatever R1's audit finds. **Not** `expo-updates`'s presence in `package.json` — already there.
- `docs/execution/bugs/STATUS.md` — this task's row, plus R3's boundary statement.

### Detailed Steps
1. R1's audit first — do not start R2 until the audit is actually done and documented, since the whole
   point is bundling everything into one build. Include the `git log -p` cross-check on the EAS-config
   commit called out in R1 above.
2. R2 — finish configuring `expo-updates` per the corrected Fix steps (no install needed).
3. Run the Testing section's commands.
4. Write the report, including the full bundled-changes list (R1's requirement) and the exact
   founder-run verification steps for R2's OTA proof.
5. Commit (code + report + `STATUS.md`), push to `BUGS_APP_b<N>` (see the role/branch note at the top —
   confirm `<N>` via `eas build:version:get` first), open/update the draft PR — never push to `main`
   directly, per the protocol's hard rule.

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
- `app.json` validates as well-formed JSON with a real `runtimeVersion` policy and `updates` block.

### How to Verify
Same posture as Bugs Task 1: everything above is verifiable from this environment. Real on-device
confirmation (the app installs, doesn't crash, and — for R2 — actually receives a real OTA update) is
founder-action-pending, same honest framing, not asserted as done.

## Report Template

Generate at: `docs/execution/bugs/reports/task2.md`, standard shape (see Task 1's report for the
pattern this repo uses), with an explicit **Bundled native changes** list (R1) and an explicit
**Founder verification steps for OTA** section (R2) — both called out clearly enough that a founder
skimming the report knows exactly what to do next.

## Additional Notes
- This task exists specifically to end the "every fix needs a rebuild" cycle going forward — R1 closes
  out everything currently pending in one shot, R2 makes sure most *future* fixes never need this cycle
  again.
- If R1's audit turns up something ambiguous (unsure whether it's truly native or could be handled some
  other way), default to asking the founder rather than guessing — same as every other guardrail in this
  track.

## Links & References
- [TASK_TEMPLATE.md](../../templates/TASK_TEMPLATE.md)
- [HOTFIXER_AGENT_PROTOCOL.md](../HOTFIXER_AGENT_PROTOCOL.md)
- [KNOWN_ISSUES_AND_BLOCKERS.md](../../KNOWN_ISSUES_AND_BLOCKERS.md)
- `docs/execution/bugs/tasks/task1.md` and `docs/execution/bugs/reports/task1.md`
- `docs/execution/bugs/STATUS.md`
