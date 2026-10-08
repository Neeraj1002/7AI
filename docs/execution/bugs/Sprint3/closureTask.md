# Bugs Sprint 3 Closure: Triage and Fix the Open Preview-Server Bug Reports

**Read `docs/execution/bugs/HOTFIXER_AGENT_PROTOCOL.md` and `docs/execution/templates/TASK_TEMPLATE.md` in
full before starting.** This file lives in `docs/execution/bugs/Sprint3/`, next to the `tasks/` and
`reports/` folders of the Bugs Tasks 1-9 that closed out Sprint 3's device-testing phase. It is **not**
numbered `task10.md`, on purpose: it is one closure pass over a batch of reports, and its branch name
(below) stays outside the `BUGS_TASK<N>` numbering for the same reason `BUGS_LOG_2` did.

**Objective**: close out every bug report currently open on the preview server, in priority order. For
each one, either fix it, prove it was already fixed, or record that it is by design or a feature request,
and set its status and `area` through the new `bugs.updateTriage` endpoint so the bug-report table stops
being a pile of 24 untriaged rows.

**Duration**: R0 ~1.5h, R1 ~3.5-4.5h (includes the D4 budget-model step 5b), R2 ~1-2h (depends on R1's diagnosis), R3 ~2h, R4 ~1.5h, R5 ~2h, R6 ~1h,
R7 ~1.5h, R8 ~0.5h. ~14.5-17.5h, and a large part of it is diagnosis rather than code.

**Depends On**: nothing to start. The three founder decisions this task needed (D1-D3) were answered on
2026-10-05 and are recorded below. Coordinate with, and don't duplicate, Sprint 3 Task 13 (debug bundles,
a separate task that stays separate) and Sprint 4 Task 8 (render quality) — see "Overlap with other work".

**Owning Component**: Orchestrator (`run-pipeline/budget-gate.ts`, `state-machine.ts`), dashboard
repository (`models/repositories/dashboard.repository.ts`), `api/routers/runs.ts`, and the app screens
named per item (`dashboard.tsx`, `notifications.tsx`, `run/[id].tsx`, `channel/[id].tsx`).

**Success Criteria**: (1) every one of the 24 reports has a final status and an `area` set via
`bugs.updateTriage`, with the evidence recorded in the report. (2) The single biggest cause of "my run
won't finish" (R1) is no longer silent: a refused run says which limit it hit and how much was used, and
the limit is a weekly one that resets, and the tenant's weekly budget (a stored number, never derived from
the channel count) is what channel ceilings are carved out of (D4).
(3) Nothing is marked fixed on the strength of an old fix alone; each "already fixed" claim is re-tested
against the build that is actually running on the preview server.

---

## The reports (pulled 2026-10-05 from the preview server via `bugs.list`)

24 reports, all `status: open`, all `area: null` (nothing has been triaged). 20 are bugs: 14 tagged
**blocker** by the tester, 5 **annoying**, 1 **minor**. 4 are feedback (not bugs). Reports are listed in
this task's priority order. **Match a report by its logged time and description; the ID prefix is a
convenience** (one prefix could not be read reliably and is shown as "—").

| Order | Item | Report (ID prefix, logged UTC) | Tester priority | What the tester saw | Where |
|---|---|---|---|---|---|
| 1 | R1 | `ae06afc7`, 10-05 18:32 (run `f70fd874`) | blocker | "Which ceiling hit per channel or system's" | `/run/...` |
| 2 | R1 | `6b140a25`, 10-01 20:56 (run `03d8e483`) | blocker | "Its not making the video" | `/run/...` |
| 3 | R1 | `53775dbc`, 09-28 21:35 (run `7b452d7a`) | blocker | "I retired 10 times. Why the run is still failing. Find out" | `/run/...` |
| 4 | R1 | —, 09-28 20:39 (run `7b452d7a`) | blocker | "Why the run failed at video generation. What caused retry?" | `/run/...` |
| 5 | R1 | `614cf41c`, 09-28 22:04 (run `24b2d408`) | blocker | Same brief as a run that failed 10-11 times, in a different structure | `/run/...` |
| 6 | R2 | `274a09c6`, 09-28 20:09 (run `084d742c`) | annoying | "Ai images not work" | `/run/...` |
| 7 | R3 | `888b5ad7`, 09-28 21:38 | blocker | Success rate shows 5/5, but one run is in a failed state | `/dashboard` |
| 8 | R3 | `50c9385b`, 09-28 22:22 | blocker | "Total 16 runs showing only 17 in success" | `/dashboard` |
| 9 | R3 | `e3ef93db`, 09-28 23:14 | blocker | Channel shows 4 runs; the tester is sure there are more, same on the other channel | `/channel/...` |
| 10 | R4 | `f84e5d6d`, 09-28 22:27 | blocker | Every inbox card says "approval needed"; should show the current stage and stage-specific info | `/notifications` |
| 11 | R5 | `91915982`, 09-29 13:30 (run `652491ea`) | annoying | A failed attempt also shows a "completed" stage in Details | `/run/...` |
| 12 | R5 | `3a83d980`, 09-28 20:03 (run `ab2f8327`) | blocker | After Gate 2 approval, right before publishing, every stage value resets and then comes back | `/run/...` |
| 13 | R5 | `3b66cf38`, 09-28 17:20 (run `de27e320`) | annoying | After Gate approve and publishing, the Queue showed the run again on "brief" and it then disappeared. Is data dirty? | `/run/...` |
| 14 | R6 | `f3c7914b`, 09-28 21:30 (run `f020ef30`) | blocker | "I revised the video with review. There is no visible difference." | `/run/...` |
| 15 | R6 | `5acfa5fb`, 09-28 22:20 (run `652491ea`) | blocker | "Exact same UI footage as the 1st run." | `/run/...` |
| 16 | R6 | `8027fdf7`, 09-28 22:09 (run `b37d738a`) | blocker | Same stock image keeps playing; a Stallone script shows a man doing butterfly exercise in a gym. Bug or limitation? | `/run/...` |
| 17 | R7 | `6431d7b7`, 09-28 21:29 | annoying | At Gate 2 the video stuck at 17s, 22s and later for 2-3s; the second watch played fine | `/` |
| 18 | R7 | `6aa8314e`, 09-28 17:51 (run `c4c98aad`) | annoying | "Video quality really bad. It stucks every 2 secs" | `/run/...` |
| 19 | R8 | `eb33f5f2`, 09-28 22:17 | blocker | No background music audible in any video; nearly every video has the same female voice and tone | `/` |
| 20 | R9 | `0c97c8bc`, 09-28 12:01 | minor | "Bug icon to green was looking better" | `/channels` |
| — | Appendix A | `2947b8da` 20:30, `61ad1f75` 20:19, `1da9b7ac` 17:19, `2cd6d64d` 17:23 (all 09-28) | feedback | Video rating; upload my own character image; a screen for each agent's output; one inbox entry for both gates | various |

---

## Verified findings (2026-10-05, read from `D:\Study Material\7AI` — a local checkout, so re-check against `main` before building)

**F1 — The budget ceiling is a lifetime cap, not a per-period one, and the refusal message is generic.**
`isBudgetAvailable` (`run-pipeline/budget-gate.ts`) compares `AgentQuota.budgetCeilingUsd` with
`sumUsageCostForTenantPlatform` (`usage-event.repository.ts`), which is a plain `aggregate` over
`usage_events` with **no date filter**. `AgentQuota` has no period or reset column. So once a tenant's
cumulative spend passes its ceiling (new tenants default to $2.00 via `invite-tenant.ts`), every new run
and every Retry is refused at `script_generation`/`video_generation` for good, until someone raises the
number. The same holds per channel (`sumUsageCostForTenantChannelPlatform`). The refusal itself is
recorded as a `skipped` stage with the fixed text *"the pooled budget ceiling or this channel's own
effective ceiling would be exceeded"* (`state-machine.ts` ~L253), so the person never learns which ceiling,
what the number is, or what was spent. The app's Dashboard labels the same spend "Spend this period",
which suggests a period that doesn't exist. This is the strongest candidate for reports 1-5 and 6b140a25's
"it's not making the video": Bugs Task 8/R3's own live check noted that Retry re-enters the budget gate and
bounces straight back to `needs_attention`, which would look exactly like "I retried 10 times and it keeps
failing". **Confirmed in part by the preview data on 2026-10-05, with a different root cause than first assumed — see
"Preview diagnosis" below. The lifetime-cap behaviour is real, but the run-blocking cause in the founder's
tenant was F9, not the pool being full.**

**F2 — The inbox label is hard-coded.** `notifications.tsx` ~L48 renders `'Approval needed'` for every
`approval_request`, whatever the gate or stage, and whether or not it's already resolved. That is report
10, confirmed by reading the code.

**F3 — The Dashboard's success rate only counts runs with status `completed` or `failed`.**
`getOperationalDashboard` (`dashboard.repository.ts`) computes `rate = completed / (completed + failed)`.
A run in `needs_attention` is neither, so it is left out entirely, which can make "5 of 5 finished" read as
perfect while a run sits in a bad state. The "total runs" figure is a different query (every bucket of
`stageFunnel` summed), so the two numbers are built from different populations. A "16 total vs 17
success" display needs a reproduction (screenshot or the raw `dashboard.operational` JSON) before anyone
changes a query.

**F4 — Channel run count may already be fixed.** `channel/[id].tsx` ~L245 and `dashboard.tsx` ~L83 both now
carry a comment describing the same fix ("summing every bucket is the real total run count — filtering for
a single stage like 'intake' undercounts almost to zero", UI/UX R7). Report 9 was logged on 09-28, so it may
predate that fix. Re-test before touching code.

**F5 — A Gate 2 "revise" does reach the planner, but may not change the footage.** `state-machine.ts`
~L770-782 forwards the latest `revise` rationale as `fixNotes` into the next planning call. On the
stock-footage path the footage still comes from `searchStockFootage`, which takes Pexels' first result for
the query (Sprint 4 Task 8 evidence table). If the revised plan keeps the same query, the same clip comes
back, and the voiceover is the same, so the result looks identical. **Hypothesis for report 14 and 15; R6
confirms it by diffing the plans of two attempts.**

**F6 — The video route supports Range requests.** `api/video-route.ts` serves the file through
`@fastify/static`'s `sendFile`, which handles Range/206. So server-side streaming isn't an obvious cause of
the stutter reports, and a "second watch was fine" report points more to network, caching or how the app
fetches the video than to the file itself. Not verified on a device.

**F7 — The Run screen's Details list prints each stage's raw status.** `run/[id].tsx` ~L623 renders
`stageName · attempt N · status`. Whether a "failed attempt" ends up showing `completed` depends on what the
state machine wrote for that stage, which needs a real repro (R5).

**F8 — These reports were logged on the preview database, which started empty on 2026-09-28.** The `fixed`
marks that Bugs Tasks 8 and 9 wrote went to the dev database (`sevenai_dev`). None of them carries over, so
nothing here can be closed on the strength of "an earlier task fixed it". Re-test on preview.

---

## Preview diagnosis (2026-10-05, from SQL the founder ran on the VPS)

**F9 — A channel override equal to the whole pool leaves every other channel a $0 ceiling, silently.**
Tenant `d0617c67-...` has a pooled ceiling of **$2.00** and has spent **$1.2975** (65%), so the pool was
not full. But channel **Not In Your Notebook** has `budgetOverrideUsd = 2.00`. `computeChannelBudgetCeilings`
subtracts every override from the pool (`remainingPool = 2.00 - 2.00 = 0`) and splits that zero among the
channels without an override, so **Underdogs** (spent $0.7285) has an effective ceiling of $0.00 and is
refused on every run. The allocator's only warning (`onOverrideExceedsPool`) fires when overrides
*exceed* the pool, not when they equal it, so nothing is logged. The two `Sample channel` rows in that
tenant are inactive (`isActive = f`), so the gate ignores them. This is the best explanation of the
"retried 10 times, keeps failing" reports for that tenant.

| Tenant | Pooled ceiling | Spent (all time) | Channels (spent) |
|---|---|---|---|
| `d0617c67-...` | $2.00 | $1.2975 | Underdogs $0.7285 (no override), Not In Your Notebook $0.5690 (**override $2.00**), 2 inactive samples |
| `a25db916-...` | $2.00 | $0.8784 | MyAIPets $0.8784 (credential saved 2026-09-28, expired per the Testing-mode 7-day rule) |
| `913fee7d-...` and the MVP tenant `0000...0001` | $2.00 | $0.00 | none |

**F10 — Real cost per run is small; the voice step is the biggest line; image cost is not recorded.**
`usage_events` across all tenants: **$2.18 total, $2.17 of it in the week of 2026-09-28**. A run that did
real work averages about **$0.12**; the most expensive of the 20 most recent was **$0.26**. By agent:

| Agent / model | Calls | Cost |
|---|---|---|
| `video-generation`: `tts-1-hd` + `whisper-1` | 45 | **$1.4152** (about $0.031 per call, about 65% of all spend) |
| `video-intelligence-own-draft`: Haiku | 45 | $0.2668 |
| `script-generation`: Sonnet | 30 | $0.1929 |
| `video-production-planning`: Haiku | 58 | $0.1750 |
| `script-review`: Haiku | 30 | $0.0908 |
| `metadata-generation`, `intake`: Haiku | 39 | $0.0352 |
| `video-generation`: `gpt-image-1.5` | 6 | **$0.0000** |
| `video-generation` and `intake`: `unknown/unknown` | 33 | **$0.0000** |

The `gpt-image-1.5` rows and the `unknown` rows record **$0**. Either those calls are stubbed (which would
also explain report 6, "AI images not work"), or the cost table has no entry for the model. Either way **the
budget gate under-counts real spend**, and Sprint 4 Task 8's roughly 12 stills per attempt (about $0.16)
would be invisible to it. Settle this before Task 8's image-heavy path ships (R1 step 7).

**Budget sizing (founder asked for a number for 2 Shorts a day under a weekly window).** Today's pipeline is
about $0.25 per published Short including one retry, so about $3-4 a week. After Sprint 4 Task 8 (about
$0.20 per video attempt, 2-3 attempts) it is about $0.55 per Short, about $8 a week. The recommended ceiling
is **$20 per week per channel** (about 2.5x the post-Task 8 week), tuned after one real week of data. That figure is a guide for what to *grant* a tenant, not a formula the
code applies: the tenant's weekly budget is a stored number and its channels split it (D4).

---

## Founder decisions (answered 2026-10-05)

- **D1 — Budget window: WEEKLY.** The ceiling is spend since the start of the current week, not lifetime.
  Week boundary: **Monday 00:00 UTC** (05:30 IST) unless the founder says otherwise. It applies to the pool,
  to each channel's equal share, and to `budgetOverrideUsd` (an override becomes a weekly amount). The app
  shows "resets Monday". No schema change: a `createdAt >= weekStart` filter. The tenant's weekly budget is a stored
  value, not derived from the number of channels: see **D4** below, which supersedes this decision's earlier
  "pool = $20 x active channels" wording. Also fix the `invite-tenant.ts` log line, which says `$/day`.
- **D2 — `needs_attention` counts against the success rate.** Show finished, needs attention and failed.
- **D3 — Inbox: one entry per gate** (gate 1 and gate 2 each get their own entry, labelled by gate).
  **New requirement:** a **channel's** success rate is measured **per published video** (R3), and **each
  gate's resolution gets its own analytics** (approve / revise / reject counts and time to decision, per
  gate), shown separately from the channel's success rate.
- **D4 — Budget model (answered 2026-10-06): the tenant's budget decides each channel's ceiling, never the
  other way round.**
  1. The **tenant weekly budget** is one stored number (`AgentQuota.budgetCeilingUsd`), set by the founder
     today (SQL) and by the admin module's budget screen later (Admin Sprint 2). Adding, activating or
     deactivating a channel never changes it.
  2. **Default split:** each active channel's ceiling is the weekly budget divided equally by the number of
     active channels. $20 per week per channel (sizing above) is guidance for what to grant, not code.
  3. **Overrides are validated when saved, not just warned about:** a `budgetOverrideUsd` is refused if it is
     greater than the weekly budget, or if the overrides would leave any default-share channel below the
     minimum share (`MIN_CHANNEL_SHARE_USD = 5`, per week; **confirmed by the founder, 2026-10-06**).
  4. **Two checks on every gate decision:** the channel's spend this week against its ceiling, and the
     tenant's total spend this week against the weekly budget. The budget is the hard cap on the sum of all
     channels whatever the per-channel numbers say.
  5. **Visible dilution:** when a channel is added or activated, the effective ceilings of the others fall
     (a $40 budget over three channels is about $13 each, not $20). The app/admin screens show the effective
     ceiling per channel and flag it when the budget is below the $20-per-active-channel guide.
  6. **New tenants:** `scripts/invite-tenant.ts` takes an explicit weekly budget instead of the old `$2.00`
     default.
  Unused budget of an idle channel is **not** reallocated for now (strict equal split: simple and
  predictable); letting channels borrow unused budget, capped by the pool, is a later option.

### R0 (Role: `BE`, with the founder running the DB checks) — Re-test and classify every report first

**Why first**: reports 1-24 range from "never fixed" to "fixed three weeks ago", and nothing is triaged.
Spending hours on a bug the live build no longer has is the main risk in this task.

**Fix / steps**:
1. Founder records the commit the preview server is running: `cd /var/www/7AI && git log -1 --oneline`,
   and pastes it into the report.
2. For each report, re-test on the **live preview app** (the way the founder would), and classify it as
   one of: `still reproduces`, `no longer reproduces` (say which merged change fixed it, or "unknown"),
   `by design`, `cannot reproduce — need data`, `feedback`.
3. Set each row with `bugs.updateTriage` (owner session or ops token): `area` = `BE`/`FE`/`APP`, and
   `status` = the closest value the endpoint's enum allows (`BUG_REPORT_STATUSES` in
   `bug-report.repository.ts`). Never edit `bug_reports` by direct SQL.
4. The hot-fixer must **not** connect to `sevenai_preview` directly (protocol rule). Where a step below
   needs data, the founder runs the SQL on the VPS (`psql -h localhost -U sevenai -d sevenai_preview`) and
   pastes the result.

**Verify**: re-running `bugs.list` shows every report with an `area`, and none left in a state that
contradicts the report's classification.

---

### R1 (Role: `BE`, then the app's error text) — Budget refusals: confirm the cause, then make the message say which limit

**Covers**: reports 1-5 (the five runs `f70fd874`, `03d8e483`, `7b452d7a` (two reports), `24b2d408`).

**Fix**:
1. **Diagnosis: done on 2026-10-05 (see F9/F10); re-run only to confirm the fix.** For the record, the
   founder ran:
   ```sql
   -- tenant-wide ceiling vs lifetime spend
   SELECT q."tenantId", q."budgetCeilingUsd",
          (SELECT COALESCE(SUM(u."costUsd"), 0)
             FROM usage_events u JOIN channels c ON c.id = u."channelId"
            WHERE u."tenantId" = q."tenantId" AND c.platform = q.platform) AS spent_all_time
     FROM agent_quotas q;

   -- per-channel override vs spend
   SELECT c.id, c.name, c."tenantId", c."budgetOverrideUsd",
          (SELECT COALESCE(SUM(u."costUsd"), 0) FROM usage_events u WHERE u."channelId" = c.id) AS spent
     FROM channels c WHERE c."isActive";

   -- what actually stopped each run
   SELECT r.id, r.status, r."currentStage", r."lastError"
     FROM pipeline_runs r
    WHERE r.id::text LIKE ANY (ARRAY['f70fd874%','03d8e483%','7b452d7a%','24b2d408%']);

   SELECT s."pipelineRunId", s."stageName", s."attemptNumber", s.status, left(s.output::text, 300) AS output
     FROM pipeline_stages s
    WHERE s."pipelineRunId"::text LIKE ANY (ARRAY['f70fd874%','03d8e483%','7b452d7a%','24b2d408%'])
    ORDER BY s."pipelineRunId", s."attemptNumber";
   ```
   For each run, the report records one cause: `budget (pooled)`, `budget (channel)`, `override reserves the
   pool (F9)`, or `other` (and what). Runs whose cause is `other` go to R2.
2. **Make the refusal explain itself** (no behaviour change, safe regardless of D1). Add a `checkBudget()`
   in `budget-gate.ts` that returns `{ ok: true }` or
   `{ ok: false, scope: 'pool' | 'channel', spentUsd, ceilingUsd, channelId }`, and turn
   `isBudgetAvailable` into a thin wrapper around it so no other call site changes. Both call sites in
   `state-machine.ts` (`script_generation` ~L246, `video_generation` ~L811) use the structured result to
   write an exact `reason` on the skipped stage and on the run's `lastError`, for example:
   *"Account spend limit reached: $2.14 used of $2.00."* or
   *"Limit for channel "Underdogs" reached: $0.91 used of $0.90."* or, for F9,
   *"Channel "Underdogs" has a $0.00 share because another channel's override reserves the whole pool."*
   Each text also says when the week resets (D1).
3. **Stop offering a Retry that cannot work.** `runs.retry` on a run whose latest stage was skipped for
   budget should return the same explanation immediately (a `CONFLICT`/`BAD_REQUEST` with the numbers)
   rather than creating a new attempt that bounces. The app shows the message instead of a generic
   failure card. Confirm in `run/[id].tsx` that `humanizeRunError` shows the new text and doesn't
   swallow it.
4. **Per-channel visibility** (small): `dashboard.cost` already returns `budgetCeilingUsd`; add each
   channel's effective ceiling next to its `spendUsd` in `byChannel`, so the Dashboard can show both.
5. **Implement D1: the weekly window.** Add a single helper (for example `currentBudgetWindowStart()` in
   `budget-gate.ts`, Monday 00:00 UTC) and use it in `sumUsageCostForTenantPlatform` and
   `sumUsageCostForTenantChannelPlatform` (`createdAt >= windowStart`) and in `getCostDashboard`, so the
   gate and the Dashboard can never use different windows. Change the Dashboard label "Spend this period"
   to "Spend this week" and show "resets Monday". Unit-test the boundary (a Sunday 23:59 UTC event and a
   Monday 00:00 UTC event).
5a. **Fix the allocator (F9).** Log a warning when `remainingPool <= 0` while default-share channels exist
    (today it only warns when overrides exceed the pool). Validate on write: a channel override that would
    leave $0 for other active channels is refused, or at minimum warned about, with a message naming the
    channels affected. Reject a `budgetOverrideUsd` greater than the weekly pool.
5b. **Implement D4: the tenant budget decides the channel ceilings.** *Check first what the code does today:
    if closure R1 already shipped (PR #48, branch `Sprint3_CLOSURE`) with the pool derived from, or defaulted
    by, the channel count, this step is a follow-up change; if the stored pool is used as is, only items (b)-(e)
    are new.*
    a. The tenant weekly budget is read only from `AgentQuota.budgetCeilingUsd`; no code path computes it from
       the channel count.
    b. Add `MIN_CHANNEL_SHARE_USD = 5` (confirmed by the founder) to `budget-gate.ts`. Where overrides are
       written (find every writer of `Channel.budgetOverrideUsd`: a router, a script, or SQL helpers), reject an
       override that is greater than the weekly budget, or that leaves any other active default-share channel
       below `MIN_CHANNEL_SHARE_USD`. The error names the channels affected. Activating a channel is checked the
       same way (it dilutes the others) and returns a warning with the new effective ceilings; it does not block.
    c. `checkBudget()` makes both checks on every call (channel spend vs ceiling, tenant spend vs weekly
       budget) and returns `scope: 'pool' | 'channel'` accordingly (step 2 already has the `scope` field).
    d. `computeChannelBudgetCeilings` keeps its signature. Add the missing warning (step 5a) and never return
       a silent `$0` share: a default-share channel with `0` is a logged error naming the cause.
    e. `scripts/invite-tenant.ts` takes `--weekly-budget <usd>` (required), drops the `$2.00` default, and
       fixes the `$/day` text.
    **Verify**: unit tests for the allocator and the override validator: override equal to the weekly budget
    (rejected), override leaving the other channel below the floor (rejected), override that fits (accepted),
    one, two and three active channels splitting $40 equally, a channel with no budget row, and the Sunday and
    Monday boundary still correct. A gate test where channel A is under its ceiling but the tenant total is at
    the weekly budget (refused with `scope: 'pool'`).
6. **Founder action, independent of the code** (the hot-fixer doesn't run this). Remove the override that
   swallowed the pool and raise the pool so each active channel has room (given 2026-10-05; confirm it was
   applied by re-running the check):
   ```sql
   UPDATE channels SET "budgetOverrideUsd" = NULL WHERE id = '7d2482ee-eac5-448f-a764-a7402e1528e4';
   UPDATE agent_quotas SET "budgetCeilingUsd" = 40 WHERE "tenantId" = 'd0617c67-b7bd-47b1-9501-d316d2d66a15';
   ```
   (Two active channels x $20 is how 40 was chosen; the weekly budget is a stored number, not derived (D4), so if
   a third channel is activated the founder raises it by hand until the admin budget screen exists. Applied and
   checked by the founder on 2026-10-06: override is NULL, pool is 40.00.)
7. **Make recorded spend accurate before Sprint 4 Task 8 lands.** Find out why `gpt-image-1.5` and the
   `unknown/unknown` `video-generation` rows record `$0`: read their `metadata` (stub flag? missing price?)
   and the cost table in `media/registry.ts` or wherever per-call cost is computed. Record a real cost for
   image generation and for any provider missing from the table, and make an unknown model log a warning
   instead of silently costing $0. Mark stubbed calls so a stub run is never mistaken for a real one.
   Check with:
   ```sql
   SELECT "createdAt", model, "costUsd", metadata FROM usage_events
    WHERE model = 'gpt-image-1.5' OR provider = 'unknown' ORDER BY "createdAt" DESC LIMIT 10;
   ```

**Verify** (sandbox DB, never preview): set a ceiling equal to current spend → a new run refuses with the
exact "Account spend limit" text and numbers; an override equal to the pool makes the *other* channel's
refusal say so (F9) and logs the new warning; events from last week don't count against this week; a channel with a low `budgetOverrideUsd` refuses with the
channel text naming the channel; `runs.retry` on that run returns the explanation and creates no new stage
row; an under-limit channel still runs normally.

---

### R2 (Role: `BE`) — Failures that are not budget

**Covers**: any of R1's runs whose cause was `other`, plus report 6 (`274a09c6`, "AI images not work").

**Fix**: for each such run, read the recorded error (Bugs Task 8/R1 now keeps the real cause, so the
stage `output`/`lastError` should name it), reproduce it on the preview app, root-cause it, and fix. For
report 6 check, in this order: (0) the `$0.0000` `gpt-image-1.5` rows in F10 — if those calls were stubbed,
that is already the answer; (a) `AI_VISUALS_STUB` on the VPS — a stub produces 14-byte placeholder
PNGs, which a tester would describe as "AI images don't work"; (b) the OpenAI key's access to the image
model; (c) the run's `usage_events` rows for the image step (cost recorded means the call happened).
Report 5 (`24b2d408`) asks why one brief failed 10-11 times in one structure and not another — record
whether the structure changed the visual source, which tells whether the failure is plan-dependent.

**Verify**: one fresh preview run per fixed cause reaches `video_review` (or Gate 2) without the earlier
error. If a cause turns out to be configuration (a stub flag, a missing key), the fix is the setting plus
a loud boot warning like the R2 one Sprint 3 Task 13/R1 asks for, not code.

---

### R3 (Role: `BE` + `FE`) — Dashboard numbers that disagree

**Covers**: reports 7, 8, 9.

**Fix**:
1. Reproduce each with the raw `dashboard.operational` JSON next to a screenshot. Report 8 ("16 total, 17
   success") needs this before any query is changed: both numbers must come from the same filter
   (`channelId` present or absent) and the same population.
2. Apply D2: count `needs_attention` explicitly. Extend `successRate` to
   `{ completed, needsAttention, failed, rate }`, with `rate` over all stopped runs (`completed`,
   `needs_attention`, `failed`, and cancelled if that status exists), and show the extra number in the card
   ("5 finished · 1 needs attention"). Keep the existing fields so the app keeps working during the rollout.
2a. **Channel success rate is per published video (D3).** For a channel, `rate = published videos / runs that
    have stopped`, where a run counts as published only when its `publishing` stage completed and the run
    is `completed`; `needs_attention`, `failed` and cancelled runs count as not published. Expose it as
    `{ published, stopped, rate }` beside the overall figures. If the founder meant a different denominator,
    the report says so before the field name is frozen.
2b. **Per-gate analytics.** Add `dashboard.gates` (tenant- and channel-scoped like the other dashboard
    queries) returning, for gate 1 and gate 2 separately: approved, revised and rejected counts, and the
    median time from the gate opening to the decision. Source: `review_logs` and the gate stage rows. Shown
    in its own card, never folded into the channel's success rate.
3. Report 9: re-test per F4. If it no longer reproduces, close it with that evidence; don't change code.

**Verify**: a fixture tenant with a completed run, a failed run and a `needs_attention` run shows all three
counts, and the total equals their sum plus in-progress runs, for both "all channels" and a single
channel.

---

### R4 (Role: `APP`) — Inbox cards say what they are

**Covers**: report 10 (and the label half of feedback `2cd6d64d`).

**Fix**: `notifications.tsx`: label by what the notification is — `Script approval` (gate 1),
`Video approval` (gate 2), and, once resolved, the decision (`Approved`/`Rejected`/`Revision requested`).
Show the stage-specific line the tester asked for (for gate 1 the script title or first line; for gate 2
the video length and review result). Use the notification's own data first; add a field to the
notification payload only if something needed is missing, and then keep it additive. D3 is decided: **one inbox entry per gate**, so this item
also makes sure a run never shows one merged entry, and each entry links to its own gate and shows that
gate's own outcome. The per-gate analytics are R3 step 2b, not part of the inbox.

**Verify**: a pending gate 1, a pending gate 2 and a resolved one each show a different, correct label.

---

### R5 (Role: `BE` + `APP`) — Run detail and Queue show the true state

**Covers**: reports 11, 12, 13.

**Fix**:
1. Report 11: reproduce a failed attempt on the Run screen. Find out what the state machine wrote for the
   stage that failed (`failed`, or `completed` with an error inside its output) and make the Details list
   show the truth, with the failing stage visibly failed. Fix in whichever of the two places is wrong; if
   it's the label, humanize the status instead of printing the raw one.
2. Reports 12 and 13 (state flickers around Gate 2 approval and publishing): re-test first, since Sprint 3
   Task 11/R1 changed exactly this path (publishing is now driven in the live request, not after a
   restart). If it still reproduces, capture `runs.get` and `runs.list` responses a second apart across the
   approval to see whether the backend briefly reports an earlier `currentStage`/`status`, or whether the
   app is showing a stale cache. Report 13 also asks whether the data is dirty: answer it explicitly from the
   run's stage rows and `status` history.

**Verify**: drive one run through Gate 2 approval to `completed` on preview and record the polled
responses; no earlier stage appears after a later one.

---

### R6 (Role: `BE`) — "Revised, no visible difference", and repeated footage

**Covers**: reports 14, 15, 16. Heavy overlap with **Sprint 4 Task 8 (R4/R5)**; this item decides whether
anything is left for this task once that lands.

**Fix**:
1. Reproduce report 14 (run `f020ef30`): fetch the `video_generation` stage output of two consecutive
   attempts and diff `plan` (query, scene prompts, `pacingNotes`). Record whether the Gate 2 revise note
   changed the plan (F5), and whether the stock clip's source ID is the same in both attempts
   (`UsageEvent.metadata.sourceId`).
2. If the plan changed but the clip didn't: a revise attempt must not reuse a clip that attempt N-1 used.
   Pass the previous attempts' used source IDs into `searchStockFootage` so it skips them. **If Sprint 4
   Task 8/R5's "skip clip IDs already used" has been built by then, do not build this twice** — verify it
   covers revise attempts and close.
3. Reports 15 and 16 (the same footage across runs; a Stallone story showing a gym): this is the stock
   search limitation Sprint 4 Task 8 documents (first Pexels result; can't depict a specific person), and
   Task 8/R4 (AI stills for real people and events) is the fix. Answer the tester's question ("bug or
   limitation?") in the report: limitation of the stock path, closed by Task 8, not a defect in this task.

**Verify**: two revise attempts on a stock-footage run produce different clips; or the report points to the
merged Task 8 change and a live run that shows it.

---

### R7 (Role: `APP` + `BE`) — Gate 2 playback stutter

**Covers**: reports 17, 18. Likely overlap with **Sprint 4 Task 8/R3** (constant 30 fps, `+faststart`).

**Fix**: separate the two possible causes before changing anything.
1. **The file**: `ffprobe` a stuttering draft (fps, whether the frame rate varies, keyframe interval,
   bitrate, whether `moov` is at the front). The stock-footage evidence shows renders inherit a variable
   25-30 fps and no `+faststart`.
2. **The delivery**: play the same attempt through the app's authenticated `/runs/:id/video` path and
   through the R2 presigned URL from `runs.getVideoUrl` (Sprint 3 Task 12). Check how
   `use-video-source.ts` hands the file to the player (streamed with Range, or downloaded first). F6 says
   the server side handles Range, so look at the client and the network before the server.
3. If the file is the cause, close as covered by Sprint 4 Task 8/R3 and re-test after it lands. If the
   delivery is the cause, prefer the presigned R2 URL for Gate 2 playback when `hasR2Draft` is true, and
   keep the authenticated route as the fallback.

**Verify**: the same draft plays smoothly end to end, three times, on the tester's phone, over the path
that was fixed.

---

### R8 (Role: `BE` + Founder) — Music and voice

**Covers**: report 19.

**Fix**:
1. Music: the "no audible music" finding has a measured cause in Sprint 4 Task 8 (the beds are synthetic
   sine tones mixed at a very low weight, with no loudness stage). It is fixed there (R1) plus the
   founder's task of replacing the beds with real licensed tracks. Close this half as covered, and link it.
2. Voice: voice variety is configuration, not a defect — `channels.update` already takes `defaultVoice`
   and `options.list` lists the voices (Sprint 3 Task 9). Check which voice each channel has
   (`SELECT name, "defaultVoice" FROM channels;`). If they are all `null`, they all use
   `DEFAULT_TTS_VOICE`, which explains "the same voice". The founder then sets a different voice per
   channel in Channel settings. Say so in the report; no code unless the picker itself is broken.

**Verify**: two channels with different `defaultVoice` values produce audibly different voiceovers.

---

### R9 (Role: `APP`) — Minor UI

**Covers**: report 20 (`0c97c8bc`, bug icon colour). Hand to the UI/UX track as a one-line item; set
`area: APP` and leave the status `open` with a note. Do not spend this task's time on it.

---

## Appendix A — Feedback (not bugs; do not build in this task)

Set `area` and leave `open` until the founder decides. Suggested disposition:

| Report | Ask | Suggested disposition |
|---|---|---|
| `2947b8da` | A rating on videos | Product decision. A simple 1-5 score after publishing would give Performance Analytics and the future learning loop a human signal. Backlog. |
| `61ad1f75` | Upload my own character image | Needs a design (where it's used: stills, thumbnail, both) and has copyright/safety implications. Backlog, ties to Sprint 4's channel profile work. |
| `1da9b7ac` | A screen for each agent's output (script, its review, the internal draft video, video reviews, by stage) | Real value for debugging and trust. UI/UX task; the backend data already exists per stage, and Sprint 3 Task 12/13 make drafts and debug bundles retrievable. |
| `2cd6d64d` | One inbox entry containing both gate decisions | **Decided (D3): one entry per gate**, with per-gate analytics (R3 step 2b). R4 delivers the labels and the one-per-gate shape. Closed once R4 lands. |

## Overlap with other work (so nothing gets built twice)

| Other doc | What it covers here |
|---|---|
| Sprint 4 Task 8 (`sprint4/tasks/task8.md`) | **Merged to `main` as PR #46** (not yet run on the preview VPS). It already has audio mastering (loudnorm and a ducked bed), `.ass` captions, 30 fps and `+faststart`, planner default `ai-stills`, a stock shot list that skips used clip IDs, `QUALITY_SPEC` and `qualityMetrics` at the `video_review` stage, and moderation/429 handling in `ai-visuals`. **Do not rebuild any of it.** Merge `origin/main` into the closure branch, delete any closure code that duplicates these (the clip-skip and image-cost recording are the likely ones), and treat the items that depend on them as "verify on the deployed build", not "build". Its remaining Sprint 4 siblings (Tasks 7, 1, 2, 3, 6, 4, 5) are in progress: do not pre-build anything they own. |
| Sprint 3 Task 13 (`sprint3/tasks/task13.md`) | **Merged to `main` as PR #47.** It added per-attempt debug bundles in R2 (`runs.getAttemptBundle`, `hasR2Bundle`) and the production boot warning when R2 isn't configured, so R2/R6/R7's before-and-after checks can use bundles instead of VPS access. Do not add a second bundle path. Its VPS checks (deploy, `R2_*` keys present, `NODE_ENV=production`, one real run) are still founder actions, so until they are done treat `hasR2Bundle` on preview as unknown. |
| Cost dashboard changes (INR display, YouTube channel link) | The drafted "YouTube link + INR" task also edits the Dashboard's cost card. Land R1 steps 4-5 first or coordinate the two, so the card isn't changed twice. |
| Sprint 3 Task 11 (`sprint3/tasks/task11.md`) | The publish-on-approval fix that R5's state-flicker reports may already be resolved by. |
| Run-cancel fix (B15) and the YouTube-link/INR dashboard request | Separate drafted tasks, not part of this closure. |

## Schema Impact

None expected. D1's weekly window needs only a `createdAt` filter against a computed week start (Monday
00:00 UTC). A per-tenant week start or a stored period would be a new, separately-approved migration, not
part of this task.

## Business Logic / State Transition

No new states. R1 adds a reason to an existing `skipped` outcome and a pre-check in `runs.retry`. R3
extends a response shape additively.

### Failure Modes & Handling
- A refusal message that quotes a spend figure must never quote one the gate didn't use: take the numbers
  from the same query result that made the decision.
- `bugs.updateTriage` is the only way a report's status changes in this task; a failed call is retried,
  not worked around with SQL.

## Implementation

### Files to Modify (starting points, re-read before editing)
- `studio/src/run-pipeline/budget-gate.ts`, `state-machine.ts` — R1
- `studio/src/models/repositories/usage-event.repository.ts` — R1 step 5 (weekly window)
- `studio/src/media/registry.ts` (and wherever per-call cost is computed) — R1 step 7 (image and unknown-model cost)
- `studio/scripts/invite-tenant.ts` — required `--weekly-budget` instead of the $2.00 default, and the `$/day` log text (R1 step 5b)
- `studio/src/api/routers/runs.ts` — R1 step 3 (`retry`)
- `studio/src/models/repositories/dashboard.repository.ts` and `studio/src/types/dashboard.types.ts` — R1 step 4, R3
- `app/app/(app)/(tabs)/dashboard.tsx`, `notifications.tsx`, `run/[id].tsx`, `channel/[id].tsx` — R3-R5

## Testing

```bash
npm run build && npm run lint && npm run typecheck
npx vitest run
```

Plus each item's Verify section, run against a sandbox DB or the preview app, as the protocol says. Add
unit tests for `checkBudget`'s scope and numbers and for the extended `successRate`.

## Report Template

`docs/execution/bugs/Sprint3/reports/closure.md`. Include: the preview commit from R0; a table of all 24
reports with their final classification, `area`, status and evidence; R1's SQL results and the cause per
run (budget pooled / budget channel / other); the exact refusal texts produced; the answer to report 13's
"is the data dirty?" and report 16's "bug or limitation?"; and what is left open and why.

## Links & References
- `docs/execution/bugs/HOTFIXER_AGENT_PROTOCOL.md`, `docs/execution/bugs/STATUS.md`
- `docs/execution/bugs/Sprint3/tasks/task7.md` (the triage endpoint this task uses) and
  `docs/execution/bugs/Sprint3/reports/task8.md`, `task9.md` (earlier fixes; F8 explains why they don't
  carry over)
- `docs/execution/sprint4/tasks/task8.md`, `docs/execution/sprint3/tasks/task13.md`
- `docs/server/usefulcmds.md` (VPS and `psql` commands)
- `docs/execution/admin/ADMIN_MODULE_DESIGN.md` (the owner admin module: a screen for budgets, tenants and
  these diagnostics instead of raw SQL)

## Git Workflow

One branch, **`Sprint3_CLOSURE`** (PR #48; this file is `docs/execution/bugs/Sprint3/closureTask.md`), off a fresh `origin/main` in `D:\Study Material\7AI-bugs`
(`git fetch origin && git checkout main && git pull` first — the protocol's checkout rule). Record it in
`docs/execution/bugs/STATUS.md` before the first commit (a new row for this closure pass). **First commit
(`BUGS_CLOSURE_MOVE: ...`)**: the `tasks/` and `reports/` folders of Bugs Tasks 1-9 now live under
`docs/execution/bugs/Sprint3/` (`git mv docs/execution/bugs/tasks docs/execution/bugs/Sprint3/tasks`, and
the same for `reports`, if the checkout still has them at the old path), so update every link that points at
the old paths in `bugs/STATUS.md` and `HOTFIXER_AGENT_PROTOCOL.md` in the same commit. One commit per
item: `BUGS_CLOSURE_R<X>: ...` (keep whatever prefix the branch's earlier commits already use; do not rewrite history to rename it). Draft PR after R1, report plus STATUS row in the closing commit
(`BUGS_CLOSURE_REPORT: ...`), then `gh pr ready`. Never push or merge to `main`; never commit to a branch
this task didn't create. Verification is on the live preview app, never a direct connection to
`sevenai_preview`.
