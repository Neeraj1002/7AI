# Admin Sprint 1 FE Task 1: The Admin Section in the App — Overview, Tenants, Budget View, Usage, Bugs, Run Inspector, Audit Log

**Read `docs/execution/admin/ADMIN_TASK_TEMPLATE.md` and `docs/execution/admin/ADMIN_MODULE_DESIGN.md` in
full before starting.** Branch: `admin_sprint1_fe`, **created by this task from a fresh `origin/main`, after the BE Task 1 PR
(`admin_sprint1_be`) has been merged** (see the template's sections 2 and 4).

**Objective**: add an Admin section to the Expo app, visible only to the platform Admin, that shows the
cross-tenant data BE Task 1 exposes (overview and decision queue, tenants, budget with warnings, usage and cost
gaps, bug reports with triage and a link to the run behind each report, a run inspector, audit log), so the
founder stops running SQL on the VPS.

**Duration**: R1 ~1.5h, R2 ~3h (includes the System card), R3 ~3h, R4 ~1.5h, R5 ~2.5h, R6 ~1h, R7 ~1.5h, R8 ~3h. ~17.5h.

**Depends On**: **BE Task 1 complete and merged to `main`** (`sprint1/STATUS.md` BE row `Done` or `Done — action
needed`, its PR merged by the founder). This task cannot start before that; if the founder explicitly asks for an
earlier start, the branch is cut from `admin_sprint1_be` instead and the base is recorded in `STATUS.md`.

**Owning Component**: the Expo app (`app/`): new `app/app/(app)/admin/` route group, new
`app/components/admin/`, one small edit to `app/app/(app)/(tabs)/channels.tsx`.

**Success Criteria**:
1. An Account owner who is not an Admin sees **no** Admin entry anywhere, and deep-linking to an admin route
   redirects them away.
2. An Admin sees an Admin entry and can reach all seven screens (Overview, Tenants/tenant detail, Usage, Bugs,
   Run inspector, Audit log); every screen has loading, empty and error states.
3. The tenant detail shows the budget panel including the F9 case (an override reserving the whole pool, the
   other channel at a `$0` share) with the server's warning text, and labels the window
   as weekly with its reset time (`windowKind` is always `weekly` after closure PR #48), and shows the stored weekly
   budget, each channel's effective ceiling, and the `below_guide` / `override_starves_others` notices.
4. Bug triage from the app changes a report's status/area/priority through `admin.bugs.updateTriage`, including
   the new status **Awaiting verification**, and the change shows in the audit log screen. A report's triage
   note (set by the hot-fixer through the ops token) is shown on its card, and a report that points at a run has
   an **Open run** button.
5. JS-only: no new native dependency, permission or `app.json` change (Role `FE`, ships by OTA).
6. The run inspector (`admin/run/[id].tsx`) shows a run's stages, errors, quality metrics, cost rows (with the
   `$0` ones marked) and debug-bundle availability from `admin.runs.get`, with no tenant content. Tenant
   content appears only after an explicit **Show content** tap, which calls `admin.runs.content` (and is
   logged by the server).

---

## Verified findings (2026-10-06, read from `D:\Study Material\7AI\app`, a local checkout; re-check against `main` once BE Task 1 is merged)

- **Navigation.** `app/app/(app)/(tabs)/_layout.tsx` builds a custom bottom bar with four tabs: `index`
  (Queue), `notifications` (Inbox), `dashboard` (Dashboard), `channels` (Channels). **Do not add a fifth
  tab.** Group routes sit beside `(tabs)` (for example `run/[id].tsx`, `channel/[id].tsx`, `new-brief.tsx`).
- **Where account actions live.** The **Sign out** row is in `app/(app)/(tabs)/channels.tsx` (around the
  `signOutOpen` state), using `useAuth()` from `lib/auth.tsx`. The Admin entry goes next to it.
- **Data layer.** Screens use `useTRPC()` from `lib/trpc` with `@tanstack/react-query`
  (`useQuery(trpc.dashboard.cost.queryOptions(input))`), refresh by
  `queryClient.invalidateQueries({ queryKey: trpc.dashboard.pathKey() })`. The types come from the server's
  `AppRouter`, so BE Task 1's procedures are typed automatically once the branch is checked out.
- **Styling.** Design tokens `color`, `font`, `radius`, `space` come from `lib/theme`. Reuse them; no new
  design system, no new styling library.
- **Phone first.** Tables do not fit. Use cards and drill-down, not wide tables.
- **A tenant-scoped screen can't be reused for admin.** `run/[id].tsx` calls `runs.get`, which returns
  `FORBIDDEN` for another tenant's run. Admin screens must **not** link into it; they open the admin run
  inspector `admin/run/[id].tsx` (R8, `admin.runs.get`) instead.
- **Dev login.** `app/login.tsx` supports a "Server URL + pasted link or token" flow. The local server prints the
  magic link to its console (`[auth] magic link for <email>: ...`) when asked via `POST /auth/request-link`, so
  a fixture user can sign in against a local sandbox server without Telegram.
- **No text inputs are needed in this task.** Triage uses chips; the triage note is **shown, not edited**, in
  the app (the hot-fixer writes it through the ops token, and an in-app note editor waits for the keyboard
  handling in Admin Sprint 2), so the known keyboard-overlap issue does not arise. Do not add inputs.

## Founder decisions already made — don't reopen

- The Admin section lives **inside the existing app**, behind the Account tab area, not a separate console.
- Admin is shown only when the **server** says so (`admin.whoami`); every admin call is re-checked on the server.
- **Read-only** except bug triage. No budget editing, run actions, or tenant creation yet (Admin Sprint 2).
- Money is shown in **USD** only here (the INR display is a separate task on the Dashboard).
- **DA-6:** Admin screens show structure by default. Tenant content (briefs, stage outputs, bundle files) is
  fetched only through an explicit **Show content** tap that calls `admin.runs.content`; the server writes an
  audit row for each view. Never prefetch it, never cache it beyond the screen, and never show it in a list.
- Only two roles exist: Admin and Account owner. Do not build anything for `approver`.

## Roles and permissions

| Screen / action | Admin | Account owner |
|---|---|---|
| Admin entry in Channels tab | visible | **not rendered** |
| Any `admin/*` route | usable | immediate redirect to `/` |
| Bug triage chips | usable | n/a |
| Run inspector (`admin/run/[id]`) and its **Show content** buttons | usable (each content view is logged) | immediate redirect to `/` |
| System card on the Overview | usable | n/a |

---

### R1 (Role: `FE`) — Gate the section and add the entry point

**Where**: new `app/app/(app)/admin/_layout.tsx`; edit `app/app/(app)/(tabs)/channels.tsx`; new hook
`app/lib/use-admin.ts`.

**Fix**:
1. `useIsAdmin()` in `lib/use-admin.ts`: `useQuery(trpc.admin.whoami.queryOptions())` returning
   `{ isAdmin: boolean, isLoading: boolean }`; cache for the session, `staleTime` a few minutes; an error means
   `isAdmin = false`.
2. In `channels.tsx`, above the **Sign out** row, render an **Admin** row (icon, label, chevron) **only** when
   `isAdmin === true`; it navigates to `/admin`. Render nothing while loading.
3. `admin/_layout.tsx`: a Stack. While `whoami` loads show the standard loading view; if `isAdmin` is false,
   `<Redirect href="/" />`. A `FORBIDDEN` from any later admin query shows an "Admin access ended" state with a
   button back to `/`, instead of a raw error.

**Verify**: sign in as a fixture Account owner (not an Admin): the Channels tab has no Admin row, and opening
`/admin` redirects to `/` (screenshot of both). Sign in as the fixture Admin: the row appears and opens the
section. Revoke the flag with `scripts/set-platform-admin.ts --revoke`, pull to refresh an admin screen: the
"Admin access ended" state appears.

---

### R2 (Role: `FE`) — Admin shell and the Overview screen

**Where**: new `app/app/(app)/admin/index.tsx`; new shared components in `app/components/admin/`.

**Fix**:
1. Shared components (small, in `components/admin/`): `AdminScreen` (safe-area container, title, back button,
   pull-to-refresh), `StatCard` (label, value, optional sub-label), `Chip`, `Banner` (info / warning / error),
   `SectionHeader`, `LoadingView`, `EmptyView`, `ErrorView` (message + Retry), and `format.ts` with
   `fmtUsd(n)` (`>= $1` two decimals, else four, so `$0.7285` matches the SQL the founder already knows),
   `fmtAgo(date)` ("3h ago", "2d ago"), `fmtDate(date)`. Reuse `lib/theme` tokens.
2. `admin/index.tsx` calls `admin.overview` and shows, top to bottom:
   - four stat cards: tenants, active channels, runs this week, spend this week (with all-time as the
     sub-label);
   - an **"Open now"** row: gate 1 waiting, gate 2 waiting, needs attention, running (counts);
   - the **Decision queue**: one card per item with a severity chip (high / medium / low), the message, the
     tenant name, and "since" as `fmtAgo`. Tapping an item with a `tenantId` opens that tenant's detail
     (R3); `bug_untriaged` opens Bugs (R5); `cost_gap` opens Usage with the Gaps tab (R4). An empty queue
     shows "Nothing needs a decision";
   - a **System** card from `admin.system.info`: the deployed commit (short hash, or "unknown"), `nodeEnv`,
     uptime as `fmtAgo`-style text, and the config flags as small on/off chips (`mediaStub`, `stockFootageStub`,
     `aiVisualsStub`, `r2Configured`, `openaiConfigured`, `youtubeOauthConfigured`) with a plain word as well as
     a colour. A stub flag that is **on** gets an amber chip and a one-line note, "Stub mode: no real media or
     provider calls". This card replaces `git log -1` and `.env` checks on the VPS; its failure must not blank
     the rest of the Overview;
   - navigation tiles: **Tenants**, **Usage**, **Bugs**, **Audit log**.
3. Pull-to-refresh invalidates the `admin` query keys.

**Verify** (against the BE fixture): the cards match the fixture's counts; the decision queue shows the planted
problems (the override-equals-pool tenant, the exhausted pool, the 8-day-old credential, the stale gate and
needs-attention runs, untriaged bugs, `$0` cost rows) and nothing for the healthy tenant; pull-to-refresh
updates after the fixture is changed; an empty database shows zeros and the empty-queue message; the System card
shows the sandbox's commit and flags (with stubs on in the fixture) and, with `admin.system.info` forced to fail,
the rest of the Overview still renders.

---

### R3 (Role: `FE`) — Tenants list and tenant detail with the budget panel

**Where**: new `app/app/(app)/admin/tenants.tsx` and `admin/tenant/[id].tsx`.

**Fix**:
1. **List** (`admin.tenants.list`): one card per tenant: name, owner email(s), channels active, runs this
   week, spend this week vs pool ceiling, and a red/amber count chip for `warningCount`. Sorted as the server
   returns. Tap opens the detail.
2. **Detail** (`admin.tenants.get` + `admin.budget.get` for the same `tenantId`, loaded in parallel; one
   failing does not blank the other). Sections:
   - **Budget panel**: the pool ceiling, `gateSpentUsd`, `spentThisWeekUsd`, and a **window label** "This week (resets
     Monday 00:00 UTC)" built from `weekStartUtc` / `resetsAtUtc` (the weekly window is what the gate enforces; if
     `windowKind` is ever not `weekly`, show it plainly rather than assuming). Then one row per channel: name, effective ceiling, spent, a status
     chip (`ok` / `at_limit` / `zero_share` / `inactive`), and the override if set. Show **every warning as a
     `Banner` with the server's `message` text**, and never hide a warning behind a collapsed section.
   - **Channels**: name, active/archived, voice, privacy default, YouTube connection state ("Connected, saved
     3d ago" / "Not connected"; amber when `credentialAgeDays >= 6`), last analytics snapshot ("Last metrics 5h
     ago" / "No metrics yet").
   - **Users**: email, role (`owner` shown as "Account owner"), Admin badge if `isPlatformAdmin`.
   - **Recent runs**: status chip, stage, channel, cost, `fmtAgo`, and the truncated `lastError` in a single
     collapsible line. Tapping a run opens the **admin run inspector** (`admin/run/[id]`, R8). **Never link to
     `run/[id]`** (it is tenant-scoped).
3. A tenant with no quota shows the `no_quota` banner and an empty budget table, not an error.

**Verify**: the fixture's F9 tenant shows the `override_reserves_whole_pool` banner and the second channel at
`zero_share` with a `$0.0000` ceiling; the exhausted tenant shows `pool_exhausted` and `at_limit`; the healthy
tenant shows no banners; the 8-day-old credential is amber; the window label reads "This week (resets Monday ...)";
a three-channel tenant on a $40 budget shows the `below_guide` notice; a tenant id that does not exist shows a clean "Tenant not found" view.

---

### R4 (Role: `FE`) — Usage screen

**Where**: new `app/app/(app)/admin/usage.tsx`.

**Fix**: a segmented control with four tabs (use `Chip`s, no new dependency), each its own query:
- **Week** (`admin.usage.byWeek`): a simple list of weeks with a proportional horizontal bar (a plain `View`
  with a computed width; no chart library) and the amount.
- **Agent** (`admin.usage.byAgent`): agent, provider/model, calls, cost, with the cost share as a percent of
  the total. Sorted as the server returns.
- **Run** (`admin.usage.byRun`): run id (first 8 characters), tenant/channel, status, event count, cost.
- **Gaps** (`admin.usage.gaps`): groups whose cost is `$0`: agent, provider, model, event count, first/last
  seen, and the metadata **key names** as small chips; a one-line explanation at the top: "These calls recorded
  $0. If they should have cost something, spend is under-counted." The deep link from the overview selects this
  tab.
An optional tenant filter chip row (All + each tenant from `admin.tenants.list`) applies to Week/Agent/Run.

**Verify**: Agent totals equal Week totals for the same window on the fixture; Gaps lists the planted
`gpt-image-1.5` and `unknown/unknown` groups; changing the tenant filter changes the numbers; empty data shows
the empty state.

---

### R5 (Role: `FE`) — Bugs screen with triage

**Where**: new `app/app/(app)/admin/bugs.tsx`.

**Fix**:
1. `admin.bugs.list` with filter chips: status (all / open / other statuses from the server enum), type
   (bug / feedback), area (BE / FE / APP / untriaged). The enum values come from `admin.bugs.options()`. Cards show: short id (first 8), type, tester priority
   chip, logged time, tenant if the server provides it, the screen/run context fields the report has, the
   description (clamped to 4 lines, tap to expand) and, when the server returns one, the **triage note** (shown
   under the description, labelled "Note", read-only). The status chip for `awaiting_verification` reads
   **Awaiting verification**. When the report has `run` (the server resolved a run id from its context), show an
   **Open run** button that opens `admin/run/<runId>` (R8); when the context names a run the server could not
   find (`runId` set, `run` null), show "Run not found" as plain text and no button.
2. **Triage**: in an expanded card, three chip rows, **status**, **area**, **priority**, taken from
   `admin.bugs.options()` (the server's `BUG_REPORT_*` enums; do not hard-code a second copy that can drift). Tapping a chip
   calls `admin.bugs.updateTriage` with just the changed field, shows a pending state on that chip, then
   invalidates the list; a failure shows an inline error and reverts the chip.
3. No free-text input anywhere on this screen (the note is displayed only; Admin Sprint 2 adds an editor).

**Verify**: triage the fixture's untriaged report: the chip updates after the refetch, the row appears in the
audit log (R6) with `bug.triage` and the right before/after, and the overview's `bug_untriaged` count drops by
one. Set the fixture's other report to **Awaiting verification** with a chip tap: the chip reads "Awaiting
verification" and the audit row shows the status change. The fixture's `awaiting_verification` report shows its
note; the report whose context is `/run/<fixture run id>` shows **Open run** and opens R8's screen; one with an
unknown run id shows "Run not found". With the mutation forced to fail (stop the server), the chip reverts and
an inline error shows.

---

### R6 (Role: `FE`) — Audit log screen

**Where**: new `app/app/(app)/admin/audit.tsx`.

**Fix**: `admin.audit.list` with cursor paging ("Load more" button at the end, not infinite scroll). Each row:
action, target type and short id, actor ("You" when `actorUserId` equals the `userId` from `admin.whoami`,
otherwise `actorEmail`, otherwise `ops token` / `script` from `actorKind`), `tenantName` if present, `fmtAgo`, and a tap-to-expand
before/after view as plain monospaced `before` / `after` JSON with long values truncated. Optional action
filter chips built from the actions present in the first page.

**Verify**: after R5's triage and the script that grants the flag, both appear newest first; "Load more" pages
through the 120 fixture rows without duplicates; an empty log shows the empty state.

---

### R8 (Role: `FE`) — Run inspector screen

**Where**: new `app/app/(app)/admin/run/[id].tsx`; small additions in `app/components/admin/`.

**Fix**: the screen calls `admin.runs.get({ runId })` and shows, top to bottom:
1. **Header card**: tenant name (tap opens that tenant's detail), channel, status chip, current stage, created
   and updated as `fmtAgo`, the run id (first 8 characters; a long-press copies the full id), and the
   `lastError` (already truncated by the server) in a `Banner` when present. `creationOptionKeys` as small
   chips (key names only).
2. **Stages**: one card per `(stageName, attemptNumber)` in order: status chip, attempt number, duration from
   `startedAt` / `finishedAt` (blank when null), the `reason` line when present (this is where a budget-skipped
   stage explains itself), and `outputKeys` as small chips. When `qualityMetrics` is not null, show it as a
   short two-column list of key and value with a "Quality" header; booleans as Yes/No. Older runs without
   metrics show no Quality section (no error, no empty box).
3. **Cost**: totals row (`costUsd` via `fmtUsd`, events, `zeroCostEvents`) and one row per usage entry: agent,
   provider/model, cost, time. A `zeroCost` row gets an amber "$0" chip and the same one-line explanation as
   the Usage screen's Gaps tab. `metadataKeys` as chips on expand.
4. **Review gates**: gate 1 / gate 2, decision, time. No rationale text exists in this response; do not add a
   field for it.
5. **Debug bundle**: "Bundle available for attempt(s) 1, 2" or "No debug bundle for this run".
6. **Show content** (DA-6): a section with one button per kind the run can have: **Brief**, **Stage output**
   (per stage card), **Bundle manifest**, and per-file **Open file** inside the manifest view. Each tap calls
   `admin.runs.content` for exactly that kind. Before the first tap show a one-line notice: "Viewing tenant
   content is recorded in the audit log." Show text in a monospaced, scrollable block (the server caps it and
   says when it truncated; show that notice). `bundle_file` returns a short-lived URL: open it with the
   platform's link opener (`Linking.openURL`), do not download it into the app and do not store it. Content is
   held in component state only: leaving the screen drops it, and nothing is written to `AsyncStorage` or the
   query cache's persisted store.
7. Errors: `NOT_FOUND` shows a clean "Run not found" view with a back button; a failed `content` call shows an
   inline error on that block only (including the case where the server refused because the audit write
   failed); `FORBIDDEN` follows the section-wide "Admin access ended" handling.

**Verify** (sandbox fixture; the run with three attempts): all sections render from one `admin.runs.get`
response and the screen's network log shows **no** `admin.runs.content` call until a button is tapped; the
budget-skipped stage shows its reason; the quality metrics render for the new-format run and are absent for the
old-format run; the `$0` usage rows are marked; tapping **Brief** shows text and the audit log screen then lists
one `run.content_view` row with `kind: brief`; tapping it twice lists two rows; leaving and returning to the
screen shows no content until tapped again; an unknown run id shows "Run not found"; **Open run** from the
bug-report card (R5) and from a tenant's recent runs (R3) both land here; an owner session cannot reach it.

---

### R7 (Role: `FE`) — Polish, accessibility, and the full pass

**Fix**:
1. Every screen: pull-to-refresh, loading, empty and error states (`ErrorView` with Retry) in place; no
   screen blanks on a partial failure.
2. Touch targets at least 44pt, `accessibilityRole`/`accessibilityLabel` on every pressable and chip, status
   conveyed by text as well as colour.
3. Dark/light follows what the app already does through `lib/theme`; no new theming.
4. Run `npx tsc --noEmit` and `npm run lint` in `app/`; fix everything introduced by this task.
5. A complete walk-through recorded as screenshots (see Report): owner session (no entry), Admin session (all
   seven screens), the System card, the F9 budget panel, a triage including Awaiting verification, a run
   inspector with and without content shown, the audit rows (including `run.content_view`), the revoked-access
   state.

**Verify**: type check and lint pass; the walkthrough covers every Success Criterion.

---

## Schema Impact

No schema changes (frontend only).

## Business Logic / State Transition

No new control flow. The app only displays server data and calls one write (`admin.bugs.updateTriage`); the
one extra read, `admin.runs.content`, is user-initiated per tap and logged by the server (DA-6).
Hiding the Admin entry is a convenience; **the server re-checks every call**, so no screen state is trusted.

### Failure Modes & Handling
- `FORBIDDEN` on any admin call (flag revoked mid-session): show "Admin access ended" and route home.
- Network error / server down: `ErrorView` with Retry on that screen only; the existing "Can't reach the
  server" handling in `lib/auth.tsx` is unchanged and still wins.
- A partial failure (budget loads, tenant detail does not): show what loaded, an inline error for the rest.

## Implementation

### Files to Create
- `app/app/(app)/admin/_layout.tsx`, `index.tsx`, `tenants.tsx`, `tenant/[id].tsx`, `usage.tsx`, `bugs.tsx`,
  `run/[id].tsx`, `audit.tsx`
- `app/components/admin/` (`AdminScreen`, `StatCard`, `Chip`, `Banner`, `SectionHeader`, `LoadingView`,
  `EmptyView`, `ErrorView`, `format.ts`)
- `app/lib/use-admin.ts`

### Files to Modify
- `app/app/(app)/(tabs)/channels.tsx` (the Admin row above Sign out; nothing else)

### Key Code Patterns
```tsx
// data: same pattern as the dashboard
const trpc = useTRPC();
const overview = useQuery(trpc.admin.overview.queryOptions());
// refresh
queryClient.invalidateQueries({ queryKey: trpc.admin.pathKey() });
```

### Integration Points
- Consumes BE Task 1's procedures through `AppRouter`. If a procedure's output differs from
  `sprint1/be/task1.md`, **fix the app to the code**, note it in the report, and tell the founder; do not edit
  the server in this task.

## Testing

```bash
cd app
npx tsc --noEmit
npm run lint
```
Plus the walk-through in R7. For live data, start the server from `studio/` against the **sandbox** database
seeded by `scripts/seed-admin-fixture.ts`, point the app's Server URL at it (the login screen's "Server URL"
field), request a link for the fixture Admin's email (`POST /auth/request-link`), copy the magic link from the
server console, and paste it into the login screen. Repeat for a fixture Account owner. **Never point the app
at `sevenai_preview` for this task.**

## Report Template

`docs/execution/admin/report/sprint1/fe/task1.md`, using the template's section 9, with the Evidence section
holding the R7 screenshots (or precise descriptions of each), and a **Founder Actions** section:
1. Merge this PR (the BE PR is already merged).
2. Confirm the BE report's founder steps were done (migration applied, `set-platform-admin.ts` run).
3. Publish the OTA: `eas update --branch preview` (JS-only, no new APK).
4. On the phone, sign in as yourself: the Admin row appears in Channels; compare Tenants and Budget for
   `d0617c67-...` with the SQL results from 2026-10-05; check the System card's commit against `git log -1
   --oneline` on the VPS; triage one bug (try Awaiting verification) and confirm it in the Audit log; open the
   run behind a real bug report, then tap Show content once and confirm the `run.content_view` row appears.

## Additional Notes

- After the closing commit is pushed, run `gh pr ready` on this branch's PR. Do not merge and do not push to
  `main`.
- Keep screens small and flat; a later sprint adds write actions to some of these (budget edit, run actions),
  so leave room for an actions section on the tenant detail without building it.

## Known Issues / Future Improvements

- No charts library; the weekly spend uses simple bars. A real chart can come later if it earns its place.
- The run inspector is read-only and is reached from a bug report or a tenant's recent runs; there is no
  cross-tenant run list or search yet (Admin Sprint 2, together with run force actions).
- INR display of spend is a separate Dashboard task and is not part of Admin.
- The triage note is displayed but not editable in the app; add an editor (and a `reason` field) in Sprint 2
  with proper keyboard handling. Until then the hot-fixer sets notes through the ops token.

## Links & References
- `docs/execution/admin/sprint1/be/task1.md` (the API this screen set consumes)
- `docs/execution/admin/ADMIN_MODULE_DESIGN.md`, `ADMIN_TASK_TEMPLATE.md`
- `docs/execution/ui-ux/UI_UX_AGENT_PROTOCOL.md` (design conventions the app already follows)

## Git Workflow

Per `ADMIN_TASK_TEMPLATE.md` section 4. Work from `D:\Study Material\7AI-frontend`. First, confirm BE Task 1 is
`Done` in `sprint1/STATUS.md` **and its PR is merged**, then `git fetch origin && git checkout main && git pull`
(a clean tree, `HEAD` equal to `origin/main`, with BE Task 1's `studio/` changes present), and `git checkout -b
admin_sprint1_fe`; record the branch in `STATUS.md` at once and claim this task's row as `In Progress`. One commit
per item `ADMIN_SPRINT1_TASK1_FE_R<X>: ...` (R1 to R8), push after each; open the draft PR after the first push
(`admin_sprint1_fe: The Admin Section in the App`); then `ADMIN_SPRINT1_TASK1_FE_REPORT: The Admin Section in the
App` with the report and the STATUS row, push, and `gh pr ready`. Never merge, never push to `main`, never open
a second PR.
