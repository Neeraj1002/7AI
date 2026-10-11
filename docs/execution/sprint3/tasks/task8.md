# Sprint 3 Task 8: UI Enhancement 1 — Backend Requirements (Gate 2 Visibility, Channel Edit, Channel Archive)

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git
Workflow (branch/commit/PR steps for this task), the `STATUS.md` update this task must make, and the
section structure this file follows. This file states only this task's specifics — the template
governs everything else, so don't skip it.

**Note on why this is a Sprint 3 task, not Sprint 4**: Sprint 4 (`docs/execution/sprint4/`) is a
separate, larger, not-yet-started initiative (channel profiles/formats/content-quality
configurability). This task is small, narrowly scoped backend work that exists purely to unblock three
feature-flagged controls in the UI/UX track's "UI Enhancement 1" frontend build
(`docs/execution/ui-ux/tasks/task1.md`, branch `UIUX_ENH1_FE`) — mixing it into Sprint 4 would blur two
unrelated initiatives. It's filed as a Sprint 3 follow-on (Sprint 3 was already reopened once before,
for Task 7) rather than opening a new sprint for three small mutations, but it runs on its **own branch**
(see Git Workflow below), not `SPRINT3_BE` or `SPRINT4_BE`, so it's unambiguous in `git log`/the PR list
that this is UI-Enhancement-1-driven work, not a real Sprint 3 or Sprint 4 change.

**Objective**: Add the three backend capabilities the UI/UX track's "UI Enhancement 1" screens need
before their feature flags can be switched on: a per-run/per-channel Gate 2 visibility choice, a
channel-edit mutation, and a channel-archive (soft-delete) mutation — plus an optional, low-priority
session-email exposure.

**Duration**: R1 ~2h (migration + resolver wiring + gate2 input), R2 ~1.5h, R3 ~3h (the race-safety and
cancellation work is the bulk of this), R4 ~0.5h (optional).

**Depends On**: Sprint 3 Task 2 (K1, `canResolveGate`/ownership), Task 5 (M1, `agent_credentials`),
Task 6 (N1/N2, `channels` router shape); Week 5 Task 5 (D2, Gate 2 privacy-status plumbing — this task
completes what that one left half-wired, see R1).

**Owning Component**: `studio/src/api/routers/channels.ts`, `studio/src/api/routers/runs.ts`,
`studio/src/models/schema.prisma` (`Channel`), `studio/src/models/repositories/channel.repository.ts`,
`studio/src/run-pipeline/pipeline-runner.ts`, `studio/src/run-pipeline/resume-on-startup.ts`,
`studio/src/run-pipeline/state-machine.ts` (`runPublishingStage`), optionally a new
`studio/src/api/routers/auth.ts`.

**Success Criteria**:
1. `runs.gate2`'s `approve` action accepts an optional privacy choice; omitting it uses the channel's
   own configured default, not a hardcoded `'private'`.
2. `channels.update` lets the owner change a channel's name/niche/default privacy without a direct DB
   edit, rejecting archived channels and non-owners the same way `connect`/`disconnect` already do.
3. `channels.archive` cleanly retires a channel — no orphaned credential, no run that keeps going and
   uploads after its channel was archived, no run left permanently stuck waiting on a gate that will
   never resolve, no background process left indefinitely erroring against it (R3.10) — while existing
   run/dashboard history for it stays fully readable.
4. (Optional) The signed-in user's email is available to the app without a direct DB read.

## Task Requirement

The UI/UX track's "UI Enhancement 1" document (2026-09-26, addressed to this chat as "the system
architect") specifies the product decisions below as already made — this task doesn't reopen them. Every
"current state" claim in that document was checked directly against `main` (not assumed) before writing
this task; two corrections and one new finding came out of that check — flagged inline at R1 and R2.

Suggested build order: **R1 → R2 → R3**. R4 is optional and independent of the other three.

---

### R1 (Role: `BE`) — Gate 2 approval accepts a privacy choice; channel gets its own default

**Founder decision (not open for reconsideration)**: Gate 2 visibility defaults per-channel, chosen at
approval time, same as the existing approve/reject/revise choice.

**Current state, confirmed by direct read**:
- `agents/gate2/index.ts`'s `parseGate2Reply` **already** matches `approve public|unlisted|private`
  (case-insensitive, exact match) and resolves to `Gate2Outcome = { type: 'approve', privacyStatus }`.
  `state-machine.ts`'s `runGate2Stage` already threads that `privacyStatus` all the way through —
  into the `gate2` stage's own output, the `ReviewLog`, and `runPublishingStage`'s `uploadVideo` call.
  **This half of Week 5 Task 5 (D2) is real and correct today — nothing here needs touching.**
- The actual gap is narrower than "the pipeline doesn't support privacy choice": `api/routers/runs.ts`'s
  `gate2` mutation's Zod input only has `z.object({ runId, action: z.literal('approve') })` for the
  approve case — no `privacyStatus` field anywhere in the discriminated union — and its handler hardcodes
  `replyText = 'approve'` for that branch (`runs.ts` lines ~182–193). So every app approval today produces
  a bare `"approve"` reply, which `parseGate2Reply` resolves to `DEFAULT_PRIVACY_STATUS` (`'private'`) —
  confirmed this is exactly why every upload from the app has been private so far.
- `Channel` has no per-channel default today. `schema.prisma`'s `Channel` model has no
  `defaultPrivacyStatus` field; `channels.list`/`channels.get` return whatever `toDomainChannel` maps,
  which has no such field either.

**Fix**:
1. **Migration**: add `Channel.defaultPrivacyStatus` — `VARCHAR(20) NOT NULL DEFAULT 'private'`, with a
   `CHECK` constraint against the same three values as `PrivacyStatusSchema`
   (`agents/publishing/types.ts`), matching this schema's established VARCHAR+CHECK convention (see
   `schema.prisma`'s own header comment) rather than a native Postgres enum.
2. `channel.repository.ts`: add `defaultPrivacyStatus` to `toDomainChannel`'s mapping and to the
   `Channel` type in `types/channel.types.ts`. `channels.list`/`channels.get` need no other change —
   they already return the full mapped `Channel`.
3. `api/routers/runs.ts`'s `gate2` input: add an optional `privacyStatus: PrivacyStatusSchema.optional()`
   to the `action: z.literal('approve')` branch. In the handler, when present, build the reply text as
   `` `approve ${input.privacyStatus}` `` (matching `parseGate2Reply`'s own `APPROVE_WITH_PRIVACY` regex
   exactly); when absent, look up the channel (already fetched by `assertGateOwnership`'s own
   `findChannelById` call — reuse that channel object rather than a second lookup) and send
   `` `approve ${channel.defaultPrivacyStatus}` `` instead of a bare `'approve'`, so the channel's own
   default is what's actually applied even without `parseGate2Reply`'s own bare-`'approve'` fallback to
   `DEFAULT_PRIVACY_STATUS` needing to fire.
4. `channels.update` (R2) is what actually lets the founder set this field per channel — R1 only adds the
   column, the default, and the read/apply path.

**Verify**: a real run reaching a pending Gate 2, resolved via `runs.gate2` with no `privacyStatus` —
confirm (via a direct Postgres read of the `gate2` stage's `output` or a real upload) the channel's own
`defaultPrivacyStatus` was applied, not a hardcoded `'private'`. Then resolve a second run's Gate 2 with
an explicit `privacyStatus: 'unlisted'` and confirm that value wins over the channel default.

---

### R2 (Role: `BE`) — `channels.update`

**Founder decision (not open for reconsideration)**: channels need to be editable in place — name,
niche, default privacy — without a direct DB edit.

**Current state, confirmed by direct read**: `channels.ts` router has `list`/`get`/`create`/
`getYoutubeConnectUrl`/`disconnectYoutube` — no `update`. `channel.repository.ts` has no update/patch
function either (only `insertChannel`).

**A claim in the UI/UX doc this task corrects, not just confirms**: the doc says "the UI tells users
[editing the niche] doesn't [affect runs already in progress]." Checked directly against
`state-machine.ts`: **every stage function re-reads the channel fresh from the DB at the moment that
stage actually executes** (`runScriptReviewStage`, `runPublishingStage`, and every other stage all open
with their own `findChannelById(run.channelId)` — there is no channel-fields snapshot taken at run
creation). So a niche/style-guide edit **does** affect any stage of any in-progress run that hasn't
executed yet at the moment of the edit — only stages that already ran and recorded their input are
unaffected. **This is the opposite of what the UI currently tells users**, and is worth the founder's
attention (a wording fix, or a real snapshot mechanism, is a product call, not something this task
decides) — flagging it here rather than silently building `channels.update` in a way that matches the
UI copy's incorrect claim.

**Fix**:
1. `channel.repository.ts`: add `updateChannel(id, patch: { name?, nicheDescription?, styleGuide?,
   defaultPrivacyStatus? })`, same partial-patch shape as `pipeline-run.repository.ts`'s
   `updatePipelineRun` (spread only defined keys into the Prisma `data` object).
2. `channels.ts` router: add
   ```ts
   update: publicProcedure
     .input(z.object({
       channelId: z.string().uuid(),
       name: z.string().min(1).optional(),
       nicheDescription: z.string().min(1).optional(),
       defaultPrivacyStatus: PrivacyStatusSchema.optional(),
     }))
     .mutation(async ({ input, ctx }) => { ... })
   ```
   Same ownership check as `disconnectYoutube`/`getYoutubeConnectUrl` (`canResolveGate(ctx, channel)`,
   `NOT_FOUND` if the channel doesn't exist or belongs to another tenant). **Reject archived channels**:
   `if (!channel.isActive) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Channel ... is archived' })`
   before applying the patch. Return `withHasYoutubeCredential(updated)`, same response shape `get`/`list`
   already use.
3. **Worth a one-line fix while touching this model**: `Channel.updatedAt` in `schema.prisma` is
   `@default(now())` with no `@updatedAt` attribute — Prisma will not bump it automatically on this new
   `update` call. Add `@updatedAt` in the same migration as R1's column add, so `channels.update` actually
   produces a meaningful `updatedAt` rather than a value frozen at creation forever.

**Verify**: update a real channel's `nicheDescription`/`defaultPrivacyStatus` via the mutation, confirm
via `channels.get` the new values round-trip and `updatedAt` advances. Attempt the same mutation against
an archived channel (once R3 exists) and confirm a clean `BAD_REQUEST`, not a silent no-op or a 500.

---

### R3 (Role: `BE`) — `channels.archive` (soft delete)

**Founder decisions (not open for reconsideration)**: archiving a channel cancels its in-progress runs
(logged `"Channel deleted"`), removes its YouTube connection, and needs no restore/un-archive path —
history stays but the channel stops being usable.

**Current state, confirmed by direct read**: `Channel.isActive` exists and `listActiveChannelsByTenant`/
`createChannelWithCapCheck`'s 7-channel cap already both filter on it — nothing today ever sets it to
`false`. `agent-credential.repository.ts`'s `deleteForChannel` already exists and is already called by
`disconnectYoutube` — directly reusable, not new. `pipeline-run.repository.ts`'s `listRuns` already
accepts a `channelId` + `statuses[]` filter (used by `runs.list`) — directly reusable to find a channel's
in-progress runs. `notifications/pending-approvals.ts`'s `resolvePendingApproval(threadKey, reply)` is
the *only* way a pending gate gets released today (it resolves the in-memory promise
`requestGate1Decision`/`requestGate2Decision` is blocked on) — there is no separate "cancel a pending
gate" primitive, and none needs to be built: feeding it a `'reject <reason>'` reply routes through
`state-machine.ts`'s existing reject handling, which already sets `status: 'failed'` and a `lastError`.

**A real gap found while checking "make sure a run that's mid-stage stops and never uploads"**:
`run-pipeline/pipeline-runner.ts`'s live `runPipelineToNextGate` loop (the one driving a run through
script/video/gate1/gate2 right after `runs.create`) only ever advances through `gate2` — its `switch`
has no case for `'publishing'`/`'analytics'`, so **live requests never actually drive publishing today**;
`runPublishingStage`/`runAnalyticsStage` are only ever invoked by `resume-on-startup.ts`'s
`STAGE_RESUMERS` map, i.e. on the orchestrator's next process restart after Gate 2 approval. This is a
pre-existing structural gap, unrelated to archiving, and not this task's job to fix — but it does mean
the single most important choke point for "never uploads" is **inside `runPublishingStage` itself**
(every real and future path to an upload passes through it), not the live loop.

**Fix**:
1. `agent-credential.repository.ts`: no change needed — `deleteForChannel` already does what's required.
2. `channel.repository.ts`: add an `archiveChannel(id)` that sets `isActive: false` (can reuse
   `updateChannel` from R2 with an `isActive` patch key, or a dedicated function — either is fine as long
   as it's one Prisma call).
3. `channels.ts` router: add
   ```ts
   archive: publicProcedure
     .input(z.object({ channelId: z.string().uuid() }))
     .mutation(async ({ input, ctx }) => { ... })
   ```
   Same ownership check as `update`/`disconnectYoutube`. **Idempotent**: if `channel.isActive` is already
   `false`, return success without redoing the cancellation sweep below (don't fail on a second call).
   Steps, in order, inside one handler (doesn't need to be one DB transaction — each step is independently
   safe to redo, which is exactly why idempotency matters more here than atomicity):
   - `archiveChannel(channel.id)` (`isActive = false`).
   - `deleteForChannel(channel.id)` (existing function, reused as-is).
   - `listRuns({ channelId: channel.id, statuses: ['pending', 'running', 'paused_gate1', 'paused_gate2'] })`,
     then for each: if `hasPendingApproval(run.id)` (i.e. it's genuinely sitting at a gate right now),
     call `resolvePendingApproval(run.id, 'reject Channel deleted')` — this routes through the existing
     Gate 1/2 reject path and sets `status: 'failed'`. **Note the resulting `lastError` text will be
     `"Rejected at Gate 1: Channel deleted"` / `"Rejected at Gate 2: Channel deleted"`** (the existing
     reject handler's own template, not a bare `"Channel deleted"` string) — functionally equivalent and
     still clearly greppable; call this out in the report rather than adding a special-cased lastError
     format just for this one path. For any run in `pending`/`running` with **no** pending approval (i.e.
     mid-automated-stage, not sitting at a gate), call `updatePipelineRun(run.id, { status: 'failed',
     lastError: 'Channel deleted' })` directly — this is the literal-string case, since there's no
     reject-path template involved.
4. **The actual "never uploads" guarantee**: in `state-machine.ts`'s `runPublishingStage`, immediately
   after the existing `const channel = await findChannelById(run.channelId); if (!channel) { throw ... }`
   (line ~1063), add: `if (!channel.isActive) { throw new Error(\`Channel ${channel.id} is archived —
   refusing to publish PipelineRun ${runId}\`); }` — before any metadata generation or upload call. Since
   every real path to an upload (today's resume-driven path, and any future live-driven path) calls this
   function, this one check is what actually makes "never uploads" true, independent of whichever driver
   reaches it.
5. **Defense in depth for the automated stages** (script/video generation, not just publishing): in
   `pipeline-runner.ts`'s `runPipelineToNextGate` loop, before each `case` calls its stage function, add a
   fresh `findChannelById`+`isActive` check and, if archived, stop the loop and mark the run `failed` the
   same way (`lastError: 'Channel deleted'`) instead of continuing to burn LLM/TTS/video-gen spend on a
   channel that's already been torn down. This narrows a real but lower-severity race (archiving while a
   run is actively mid-flight in the *live* loop, between gate2's own checks) — not the "never uploads"
   guarantee itself, which R3.4 already covers unconditionally.
6. `runs.ts`'s `create`: after the existing not-found/tenant-ownership checks, add
   `if (!channel.isActive) throw new TRPCError({ code: 'BAD_REQUEST', message: `Channel ${input.channelId}
   is archived` })`.
7. `channels.ts`'s `getYoutubeConnectUrl`: same archived-channel guard as `create`/`update` above —
   reconnecting YouTube to a channel that's about to have its credential deleted (or already did) makes no
   sense.
8. **No restore path** — per the founder's decision, `archive` is one-directional; don't build an
   `unarchive`/`restore` mutation.
9. **History stays readable** — confirm (don't just assume) that `runs.list`/`runs.get`/the dashboard
   routers don't filter on `channel.isActive` anywhere; they should keep returning an archived channel's
   past runs/stats exactly as before. `listActiveChannelsByTenant` (used by `channels.list`, the channel
   *switcher*) is correctly channel-scoped and unaffected — don't accidentally reuse it anywhere history
   needs to still show the archived channel.
10. **Performance Analytics polling on archived channels** — a real gap found by direct code read while
    implementing R3 (not part of the original founder decision, but a direct consequence of it): the
    performance-analytics module's periodic poll (`runPeriodicPoll`) lists every completed run with a
    published video regardless of `channel.isActive`. Once step 2 above deletes an archived channel's
    credential, every subsequent poll tick still attempts that channel's videos, gets a "no connected
    YouTube account" error, and logs it — indefinitely, for every archived channel, forever. **Fix**: add
    a filter (in `runPeriodicPoll` itself or in the query/list it iterates over) that skips any run whose
    channel is archived (`channel.isActive === false`), the same guard steps 4/6/7 above already apply at
    their own call sites. This isn't optional cleanup — without it, archiving a channel (the one-way,
    no-restore action this mutation implements) guarantees indefinite log noise starting the moment it's
    first used for real, which undercuts the "cleanly retires a channel" success criterion this whole R3
    exists to satisfy.

**Verify**: archive a real channel with a genuinely pending Gate 2 approval — confirm the run flips to
`failed` with the expected `lastError`, the Telegram/push-equivalent gate message's own `await` resolves
(doesn't hang), the channel's `agent_credentials` row is gone, and a second `channels.archive` call on the
same channel succeeds as a no-op rather than erroring. Confirm `runs.create`/`channels.update`/
`getYoutubeConnectUrl` all reject that channel afterward, and that its historical runs still show up in
`runs.list`/the dashboard exactly as before. Confirm the next performance-analytics poll tick after
archiving produces no "no connected YouTube account" (or equivalent) error for that channel's videos —
the archived-channel filter (step 10) genuinely stops the poll from touching it, not just that the error
happens to go unnoticed.

---

### R4 (Role: `BE`, optional/low-priority) — Session email

**Founder decision**: optional — "Signed in as {email}" in the app, nothing more.

**Current state, confirmed by direct read**: the signed-in `Session`/`SessionTokenPayload`
(`auth/types.ts`) is `{ userId, tenantId, role }` — no email. The tRPC `Context` (`api/trpc.ts`) mirrors
that exactly. There is no `auth` tRPC router today — `/auth/request-link` and `/auth/verify` are plain
REST routes on `api/server.ts`, not tRPC procedures. `user.repository.ts` already has `findUserById`.

**Fix (the lower-risk of two options — chosen deliberately)**: add a new `auth` tRPC router with a single
`me` query: `ctx.userId ? (await findUserById(ctx.userId))?.email ?? null : null`, returned as `{ email }`.
Register it in `router.ts` alongside `channels`/`runs`/`dashboard`. **Don't** embed email into the
`SessionTokenPayload`/JWT itself — that would require a token-shape version bump and wouldn't retroactively
apply to already-issued session tokens still in use; a plain query keyed off the already-trusted
`ctx.userId` needs no schema/token change at all.

**Verify**: a real signed-in session's `auth.me` call returns that user's real email; the ops-token
fallback path (`ctx.userId === null`) returns `{ email: null }` rather than throwing.

---

## Schema Impact

### Tables Modified
- `channels` — new column `default_privacy_status VARCHAR(20) NOT NULL DEFAULT 'private'` with a CHECK
  constraint against `('private', 'unlisted', 'public')` (R1); `updated_at` gains Prisma's `@updatedAt`
  behavior (no column-shape change, just future writes actually bumping it) (R2).

### Migration File
- One new Prisma migration covering both of the above (`..._channels_default_privacy_and_updated_at` or
  similar) — no backfill needed beyond the column default itself (every existing row gets `'private'`,
  which matches today's de facto behavior exactly, so this migration is safe to run against the live DB
  with no observable behavior change until R1/R2's application code ships alongside it).

### Reference
Full field-level `Channel` definition lives in `schema.prisma` directly (no per-sprint `SCHEMA.md` exists
for this small a change) — see the model's own comments for the surrounding fields.

## Business Logic / State Transition

### What this task implements
- Gate 2 approval's privacy resolution order becomes: explicit per-approval choice (R1) → channel's
  `defaultPrivacyStatus` (R1/R2) → `DEFAULT_PRIVACY_STATUS` (`'private'`, only ever reached for a
  pre-R1 `gate2` stage row or a channel that somehow predates the migration's backfill — shouldn't happen
  in practice since the migration backfills every row).
- Archiving a channel (`isActive: true → false`) is a one-way transition (R3) that fans out into: its
  `agent_credentials` row deleted, every `pending`/`running`/`paused_gate1`/`paused_gate2` `PipelineRun`
  on it force-transitioned to `failed`, and every future stage-execution/creation/reconnect attempt
  against it rejected — while every already-`completed`/`failed` `PipelineRun` and all dashboard
  aggregates for it are left untouched.

### Preconditions
- R1/R2: the channel row and (for R1) a pending or resolvable Gate 2 attempt already exist.
- R3: the channel row exists and the caller passes `canResolveGate`'s ownership check.

### Postconditions
- R3, after `channels.archive` returns: `channel.isActive === false`, no `agent_credentials` row for it,
  no `PipelineRun` on it left in `pending`/`running`/`paused_gate1`/`paused_gate2`, and no in-memory
  pending-approval promise left dangling for any of its runs (every one that had one was resolved, not
  abandoned — an abandoned promise would leave `requestGate1Decision`/`requestGate2Decision`'s own
  `await` hanging forever inside `runPipelineToNextGate`'s process).

### Failure Modes & Handling
- A crash partway through `channels.archive`'s sweep (e.g. after `deleteForChannel` but before every run
  is cancelled) is safe to recover from by simply calling `channels.archive` again — every step is
  independently idempotent (R3's own idempotency note above), so this task deliberately doesn't need a
  DB transaction wrapping the whole sweep.
- A `runPublishingStage` invocation racing an archive that lands after its own `channel.isActive` check
  already passed but before the upload call completes is not fully closed by this task (closing it
  completely would need a re-check immediately before the actual `uploadVideo` call, or a DB-level lock)
  — flag this as a known, narrow residual race in the report rather than silently treating R3.4's
  top-of-function check as airtight; it removes the vast majority of the real-world exposure (the window
  between the check and the actual upload call is short, and archiving is a rare, deliberate founder
  action) without claiming a guarantee this task doesn't actually build.

### Reference
No `BUSINESS_LOGIC.md` exists for this ad hoc Sprint 3 follow-on task (same posture as the 2026-09-22
tenant-check hardening entry) — this section is the full reference.

## Testing

```bash
npm run build && npm run lint && npm run typecheck
```

Plus each R-item's own **Verify** section above — R1 and R3 specifically need a real pending-gate/
real-channel test, not just passing type checks.

## Report Template

Generate at `docs/execution/sprint3/reports/task8.md`, same shape as `reports/task7.md`/
`reports/hardening-tenant-check.md` — state plainly, per R-item, what was actually built and what was
verified live vs. left as a known residual gap (R3's publish-race note above, in particular, should be
stated honestly rather than rounded up to "fully race-safe").

## Additional Notes

- The UI/UX track's own "UI Enhancement 1" screens are feature-flagged on these three backend
  capabilities — R1/R2/R3 landing (in that order) is what lets `UIUX_ENH1_FE` flip its flags, not a
  separate coordination step.
- R2's nicheDescription-affects-in-progress-runs finding (above) is a founder-facing product question,
  not a code defect — raised here, not resolved here.

## Known Issues / Future Improvements
- `pipeline-runner.ts` not driving `publishing`/`analytics` in the live request path (found while
  researching R3) is a pre-existing structural gap, out of scope for this task — worth its own
  investigation later (why a run sits at `currentStage: 'publishing'` until the next process restart
  today, and whether that's intentional or an oversight from whichever task last touched this file).
- R3's narrow publish-time race (see Failure Modes above) is a known, accepted residual gap, not silently
  fixed — a real fix would need a check immediately adjacent to the `uploadVideo` call itself or a
  DB-level advisory lock, judged not worth the complexity for a rare, deliberate archive action.
- **Not a residual gap** (listed here only to avoid confusion with the two items above, which remain
  open): the Performance Analytics archived-channel polling gap (R3.10) is fixed by this task, not
  deferred — unlike `pipeline-runner.ts`'s live-loop gap, which is real, adjacent, and still open.

## Links & References
- [TASK_TEMPLATE.md](../../templates/TASK_TEMPLATE.md)
- `docs/execution/sprint3/STATUS.md`
- [ui-ux/tasks/task1.md](../../ui-ux/tasks/task1.md) — the frontend work this unblocks
- `docs/execution/week5/BUSINESS_LOGIC.md` — Week 5 Task 5 (D2)'s original Gate 2 privacy-status design,
  which R1 completes the wiring for

## Git Workflow

This task runs on its **own branch**, distinct from `SPRINT3_BE`/`SPRINT4_BE` and from the bugs/UI-UX
tracks' own conventions — see the header note above for why.

1. `git checkout main && git pull` from `D:\Study Material\7AI` (the main checkout — this is backend
   work, same checkout location Sprint 3/4 backend tasks already use per `TASK_TEMPLATE.md`'s "Where task
   docs and work happen").
2. `git checkout -b UIENHANCEMENT1_BE`. Record this exact name in `docs/execution/sprint3/STATUS.md`'s
   new Task 8 row immediately (Hard rule 3) — before the first commit, not after.
3. One commit per R-item: `UIENHANCEMENT1_TASK8_BE_R<X>: [what it does]` (e.g.
   `UIENHANCEMENT1_TASK8_BE_R1: Gate 2 privacy input + Channel.defaultPrivacyStatus`). R3's item 10
   (the performance-analytics archived-channel polling fix, added after R3's initial commit once it was
   found) gets its own follow-up commit rather than being squashed in:
   `UIENHANCEMENT1_TASK8_BE_R3b: skip archived channels in performance-analytics polling`.
4. After R1's first commit is pushed, open the PR as a draft:
   `gh pr create --draft --title "UIENHANCEMENT1_BE: Gate 2 Visibility, Channel Edit, Channel Archive" --body "Tracking PR for UI Enhancement 1's backend requirements. Live status: docs/execution/sprint3/STATUS.md (Task 8). Do not merge until marked ready for review."`
5. After R3 (or R4, if done) — this task's last item — lands and is pushed, write the report and this
   task's `STATUS.md` row update, commit them together with the code, then `gh pr ready` to mark the PR
   ready for review.
6. **Never push or merge to `main` directly** (Hard rule 1) and **never commit to a branch this task
   didn't create** (Hard rule 2) — same as every other track.
