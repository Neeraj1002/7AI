# Admin Sprint 1 FE Task 1: The Admin Section in the App

**Date**: 2026-10-06
**Status**: Complete — founder actions pending
**Branch**: `admin_sprint1_fe`, commits `ADMIN_SPRINT1_TASK1_FE_R*` (draft PR [#51](https://github.com/Neeraj1002/7AI/pull/51), marked ready by the closing step)
**Files Created**: 22 (21 in `app/`, this report)  **Files Modified**: 2 (`channels.tsx`, STATUS row)  **Tests**: no FE test runner exists in `app/`; `npx tsc --noEmit` and `npm run lint` clean; every item verified by hand against the BE sandbox fixture (see Evidence)

## What Was Done

Everything in `fe/task1.md` R1 to R8, and nothing outside it. JS-only: no new dependency, native module, permission or `app.json` change (`app/package.json` untouched). Nothing under `studio/` was edited.

- **R1** `lib/use-admin.ts` (`useIsAdmin` from `admin.whoami`, error means "not an Admin"), `admin/_layout.tsx` (redirect for non-Admins, "Admin access ended" state), Admin row above Sign out in `channels.tsx` (the only edit to an existing file).
- **R2** shared components (`AdminScreen`, `StatCard`, `Chip`, `Banner`, `SectionHeader`, `LoadingView`, `EmptyView`, `ErrorView`, `format.ts`, `status.ts`) and the Overview: stat cards, "Open now", decision queue with the three deep links, System card (own query), navigation tiles.
- **R3** Tenants list and tenant detail: budget panel with the weekly-window label and every server warning as a `Banner`, channels, users, recent runs.
- **R4** Usage: Week / Agent / Run / Gaps chips, tenant filter, `?tab=gaps` deep link.
- **R5** Bugs: filters from `admin.bugs.options()`, chip triage (only the changed field), read-only note, **Open run**.
- **R6** Audit log: cursor paging with a Load more button, actor labels, expandable before/after.
- **R8** Run inspector: structure from one `admin.runs.get`; content only through per-tap `admin.runs.content` mutations.
- **R7** polish: roles and labels on every pressable, first-failure FORBIDDEN handling, the full walk-through below.

Commit order: R1, R2, R3, R4, R5, R6, R8, R7 (R7's pass needs R8 in place). Each pushed after its commit.

## Files Created/Modified

Created: `app/app/(app)/admin/{_layout,index,tenants,usage,bugs,audit}.tsx`, `admin/tenant/[id].tsx`, `admin/run/[id].tsx`; `app/components/admin/{ActionButton,AdminScreen,Banner,Chip,ContentBlock,EmptyView,ErrorView,LoadingView,SectionHeader,StatCard}.tsx`, `format.ts`, `status.ts`; `app/lib/use-admin.ts`; this report.
Modified: `app/app/(app)/(tabs)/channels.tsx` (+16 lines: import, hook call, Admin row, two styles), `sprint1/STATUS.md` (FE row only).

## Schema Changes Applied

None (frontend only).

## Evidence

Environment: a sandbox database **I created and will drop** (`sevenai_admin_fe_sandbox`, migrated and seeded with `scripts/seed-admin-fixture.ts`), a local server on port 4310 from `studio/` of this worktree, the Expo web build of `app/` in a 375x812 viewport, and the app's Server URL set to `http://localhost:4310`. Sign-in used the magic link the server printed (`[auth] magic link for ...`) for `founder@fixture.test` (Admin) and `owner-b@fixture.test` (Account owner). `sevenai_preview`, `sevenai_dev` and `https://7aistudio.tech` were never contacted.

**Screenshots could not be captured**: the Browser pane was hidden for the whole session, so every screenshot call timed out. The walkthrough below is therefore a description of each screen taken from the rendered page text and accessibility tree (what an on-screen read shows), not images. Please look at the phone checks under Founder Actions for the visual pass.

### R1 gate
- Owner session (`owner-b`): the Channels tab shows channels and Account only, **no Admin row**; loading `/admin` and `/admin/run/<id>` redirected to `/` (final path `/`).
- Admin session: the Channels tab has an **Admin** button (chevron row above Sign out); tapping it opened `/admin`.
- Revoke: `set-platform-admin.ts founder@fixture.test --revoke` while the Usage screen was open; the next admin query (switching to the Agent chip) turned the screen into **"Admin access ended — Your Admin access was removed. Nothing here can be shown any more."** with a "Back to the app" button. A fresh load of `/admin/run/<id>` as the now non-Admin redirected to `/`. The flag was re-granted afterwards.

### R2 Overview (fixture)
Stat cards: Tenants 4 (4 users), Active channels 4 (2 archived), Runs this week 7, Spend this week $5.55 ($10.55 all time). Open now: Gate 1 waiting 1, Gate 2 waiting 2, Needs attention 2 (the stale one plus a run left at attention by the sandbox server), Running 0. Decision queue, in order: high "needed attention for 48 hours" (A), high "$2.50 spent this week of the $2.00 weekly budget" (C), high "Underdogs has a $0.00 weekly share" (A), medium "YouTube connection last saved 8 days ago" (A), medium "waited 24 hours at Gate 2" (A), medium "3 usage rows recorded $0 from a paid provider", low "4 bug reports have no area". Nothing for healthy tenant B. System card: Commit `bd3f942`, Environment development, Uptime, chips "Media stub: on" (amber) with the note "Stub mode: no real media or provider calls", the other flags off. Navigation tiles: Tenants, Usage, Bugs, Audit log.
Not observed: the System card's final error state. I forced `admin.system.info` to fail (rewriting just that call's batch result in the page), and the Overview stayed fully rendered, but React Query pauses its retries in a hidden page, so the card never reached its "Couldn't load system info" state during the test. The query is separate from `admin.overview`, so a failure cannot blank the rest; the error view itself was not seen. Also not tested: an empty database.

### R3 Tenants
List (sorted as the server returns): C (2 warnings, "$2.50 of $2.00 weekly budget"), B (no chip, "$1.75 of $20.00"), A (3 warnings, "$1.30 of $2.00"), the migration's own tenant. Detail for tenant A: window label "This week (resets Monday 00:00 UTC)"; pool $2.00, gate-counted $1.30, reserved by overrides $2.00, remaining $0.0000; three warning banners with the server's text verbatim (`override_reserves_whole_pool`: "Channel limits use the whole $2.00 weekly budget, leaving 1 channel(s) without their own limit at $0.00; every run on them is refused.", the Underdogs zero-share message, and the `below_guide` text); Fixture Notebook "OK" ceiling $2.00 override $2.00; Fixture Underdogs "Zero share" ceiling **$0.0000**; inactive sample channels. Channels: "Connected, saved 8d ago" for Notebook (amber chip), "Not connected" for Underdogs, "No metrics yet". Users: founder shown as "Account owner" with an "Admin" badge. Recent runs show status chips, stage, cost and the needs-attention run's error. An unknown tenant id shows **"Tenant not found"** with Back. The exhausted-pool tenant (C) was seen in the list with its 2 warnings; its detail screen was not opened separately.

### R4 Usage
Server totals agree: `byWeek` and `byAgent` both sum to $10.5475. Agent tab: "Last 30 days · total $10.55", rows with call counts and cost-share percentages (script-generation $6.65, 63.0%). Choosing tenant B filtered the total to $1.75, equal to the tenants list. Gaps tab (opened by `?tab=gaps`): the explanation line, then the planted `openai / gpt-image-1.5` (chips `note`, `promptCount`, `stillCount`) and `unknown / unknown` groups, and the other `$0` groups. The Week bars and the Run tab were rendered but not inspected beyond that.

### R5 Bugs
Eight fixture reports render with type, priority, status, area (or "Untriaged"), screen context and description. The awaiting-verification report shows its **Note** ("Fixed in PR 99; verify on preview") and the status chip reads **"Awaiting verification"**. The report whose context is `/run/<fixture run id>` shows **Open run**, which opened `/admin/run/e0000001-...` (confirmed). Triage on "Fixture bug report 1": tapping area **BE** then status **Awaiting verification** each updated the card after the refetch, and the audit log has exactly one `bug.triage` row per tap with the right before/after (`{"area":null,...,"status":"open"}` -> `{"area":"BE",...}` -> `{"status":"awaiting_verification"}`). With `admin.bugs.updateTriage` forced to return an error, the area stayed "Untriaged" and an inline error banner appeared. A report with an unknown full run id ("Run not found") was not exercised: the fixture has none, and its short-prefix report returns `runId: null`.

### R6 Audit log
Newest first, with the grant/revoke script rows (`by script`), `run.content_view` (`by You`) and `bug.triage` (`by You`). I inserted **120 throwaway rows** (`fixture.bulk`, sandbox only; the seed script itself writes no audit rows) to test paging: first page 50, Load more gave 100, then 122, and all 120 bulk rows were present once each (no duplicates); the button disappears at the end. Expanding a row shows the timestamp and plain monospaced Before / After JSON.

### R8 Run inspector (the three-attempt run)
All sections came from one `admin.runs.get`. Header: tenant (tappable), channel, "Waiting at Gate 2", created/updated, short id, creation option keys. Stages: gate1, gate2, intake, script generation, script review, video generation attempts 1/2/3 (attempt 2 **Skipped** with "Account spend limit reached: $2.00 used of $2.00 this week. Resets Monday 00:00 UTC."), video review with the **Quality** list (fps 30, width 1080, hasAudio Yes, truePeakDb -1.6, ...). Cost: total $1.30, 4 events, 2 `$0` events, the amber warning line, and `$0` chips on the `gpt-image-1.5` and `stock-search` rows with their metadata key chips. Gates: Gate 1 Approve. Debug bundle: "Bundle available for attempts 1, 3". Show content section with the audit notice and Brief / Bundle manifest buttons.
Network log: `admin.runs.get` on load and **no** `admin.runs.content` request; after two **Show content: Brief** taps there were exactly two `POST admin.runs.content`, the brief text appeared, and the audit log has two `run.content_view` rows (`{"kind":"brief"}`, actor the founder's session). Reloading the screen showed no content and a "Show content: Brief" button again; localStorage held only the six `sevenai.*` session keys. An unknown run id shows **"Run not found"** with Back. Non-Admin session: redirected (R1). Not tested: stage-output and bundle-manifest taps, and **Open file** (the sandbox has no R2 storage, so the server answers "not available"); the 200 KB truncation notice; in-app navigation away from and back to the screen (I reloaded the page instead, which also discards state; the mutation uses `gcTime: 0`).

### R7
`npx tsc --noEmit` and `npm run lint` in `app/` were clean before every push (output below). A scripted check confirmed every `<Pressable>` under `admin/` and `components/admin/` carries `accessibilityRole`; chips and the Admin row are 44pt high, `ActionButton` 48pt. Status is always conveyed by text as well as colour. Theming uses `lib/theme` only (the app has no dark mode of its own).

## Test Results

```
cd app && npx tsc --noEmit   -> no output (clean), run before each of the 8 pushes
cd app && npm run lint       -> expo lint, no warnings or errors
git fetch origin && git merge origin/main -> "Already up to date" (main had not moved since the BE merge, so no channels.tsx conflict)
```

## Deviations from Spec

Where the BE code differs from `fe/task1.md` I followed the code (per the BE report):
1. `admin.runs.content` is called as a **mutation** (`mutationOptions`, `gcTime: 0`), per tap only, state held in the component.
2. No `decidedByUserId` on gates (decision and time only); `profileVersionId` is not rendered.
3. Bug status values come from `admin.bugs.options()`, never hard-coded; `awaiting_verification` is labelled "Awaiting verification".
4. `admin.whoami` returns `{ platformAdmin, userId }`, not `isAdmin`; `useIsAdmin` maps it.

Other deviations:
5. Added one component not in the file list, `components/admin/ActionButton.tsx`: the shared `SecondaryButton`/`PrimaryButton` set no `accessibilityRole`, which R7 requires, and changing them is outside this task.
6. `admin.bugs.list` returns no tenant field, so cards do not show one. "Untriaged" in the area filter is applied on the client (the server cannot filter on a null area).
7. Copying the full run id on long-press uses the browser clipboard on web and the share sheet on a phone (no clipboard module is installed, and none may be added).
8. The layout reacts to the **first** FORBIDDEN failure (not only after the app's global retries finish), so "Admin access ended" appears at once.
9. R7 was committed after R8 (it verifies R8).
10. The BE STATUS row said "Done — action needed" (founder steps pending), not plain "Done"; the code and report were all in `main`, so I proceeded.
11. Tested in the Expo **web** build, not on a phone; Metro had to be run in watch mode (CI mode does not pick up new route files).

## Founder Actions

1. Merge this PR ([#51](https://github.com/Neeraj1002/7AI/pull/51)); the BE PR is already merged.
2. Confirm the BE report's founder steps were done: migrations applied on the VPS, and `npx tsx scripts/set-platform-admin.ts neeraj100296@gmail.com` run (without it your account sees no Admin row).
3. Publish the OTA: `eas update --branch preview` (JS-only, no new APK).
4. On the phone, sign in as yourself: the Admin row appears in Channels; compare Tenants and Budget for `d0617c67-...` with the SQL results from 2026-10-05 (expect the `override_reserves_whole_pool` banner and Underdogs at $0.0000); check the System card's commit against `git log -1 --oneline` on the VPS; triage one bug (try Awaiting verification) and confirm it in the Audit log; open the run behind a real bug report, tap Show content once, and confirm the `run.content_view` row appears. Also look at every screen once, since I could not capture screenshots, and try **Open file** on a real bundle (not exercised in the sandbox).

## Sign-Off
- Task Objective: Met
- Schema Impact: none (frontend only)
- Business Logic: matches BUSINESS_LOGIC.md (content is a mutation; both triage routes audited)
- Security rules (section 7): all met (server decides admin status and re-checks every call; no tenant content outside the explicit Show content tap; nothing persisted; no secrets handled)
- Ready for Integration: Yes (after the founder actions above)
