# Sprint 4 Task 4: ReviewLog Approver Identity — Editor Attribution Plumbing

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** Branch: `SPRINT4_BE`.

**Objective**: Thread the real signed-in user who resolves a gate through to the `ReviewLog` row it
produces. This is the prerequisite Task 5's `{editor}`/`{sources}` packaging fields need to be real —
built here as its own task, not skipped: nothing in this sprint gets deferred just because it depends
on something else unbuilt — the dependency gets built first, as its own task, and the thing that needed
it ships for real in the next one.
**Duration**: 3-5 hours
**Depends On**: none new — built on Sprint 3 Task 1's real session auth (`ctx.userId`), already live.
**Owning Component**: `studio/src/types/review-log.types.ts`,
`studio/src/models/repositories/review-log.repository.ts`, `studio/src/notifications/pending-approvals.ts`,
`studio/src/notifications/channel.ts` (+ each `NotificationChannel` implementation),
`studio/src/agents/gate1/index.ts`, `studio/src/agents/gate2/index.ts`,
`studio/src/run-pipeline/state-machine.ts`, `studio/src/api/routers/runs.ts`.
**Success Criteria**: (1) A real gate1/gate2 resolution made through the app by a real signed-in user
produces a `ReviewLog` row whose `approvedByUserId` matches that user's real id — confirmed by a direct
Postgres read, not just trusting the code path. (2) A gate resolved via the `API_AUTH_TOKEN` ops
fallback (`ctx.userId: null` — `scripts/dry-run.ts` and similar tooling) produces a row with
`approvedByUserId: null`, not an error and not a wrong id. (3) Every existing gate1/gate2/post-hoc-tag
test still passes — this is pure plumbing, no behavior change to the gate outcomes themselves.

## Task Requirement

### R16 (new) — `ReviewLog.approvedByUserId` + threading the real approver through

**Where**: confirmed by reading the current code end to end. `ReviewLog`/`CreateReviewLogInput`
(`types/review-log.types.ts`) have no user-identity field at all — only `agent: string` (always the
literal `'human'` for a gate decision). The real approving user's id (`ctx.userId`, resolved from the
session at the API edge in `api/routers/runs.ts`'s `gate1`/`gate2` mutations, type
`string | null` per `api/trpc.ts`'s `Context`) is available exactly where
`resolvePendingApproval(input.runId, replyText)` is called — but `resolvePendingApproval`'s own
signature (`notifications/pending-approvals.ts`) only carries a `reply: string` through its
`Promise<string>`, and `NotificationChannel.requestApproval()` only returns `{ reply }`. By the time
`state-machine.ts`'s `runGate1Stage`/`runGate2Stage` call `insertReviewLog` (five real call sites —
gate1's reject branch and its combined edit/approve branch; gate2's reject, approve, and revise
branches), the user id has already been dropped several layers back.

**Fix**:
1. **Schema**: `ReviewLog.approvedByUserId String? @db.Uuid` (nullable — the ops-token path's
   `ctx.userId` is legitimately `null`, same posture `Channel.ownerUserId` already uses), with a
   `@relation(fields: [approvedByUserId], references: [id])` to `User`, `onDelete: SetNull` (a deleted
   user's history shouldn't cascade-delete their old approvals). One migration.
2. **Types**: `ReviewLog`/`CreateReviewLogInput` gain `approvedByUserId: string | null` /
   `approvedByUserId?: string | null`.
3. **Repository**: `review-log.repository.ts`'s `insertReviewLog`/`toDomainReviewLog` pass the field
   through both directions. Also add `findGate1ApproverForRun(pipelineRunId): Promise<{ userId: string;
   name: string | null; email: string } | null>` — the latest `agent: 'human'` review log for the run's
   `gate1` stage, joined to `User` for `name`/`email` (check whether a `user.repository.ts` already
   exists with a reusable `findById`/join helper before writing a new one — Task 5 consumes this
   directly).
4. **Pending-approval plumbing**: `pending-approvals.ts`'s `PendingApproval`/`getOrCreatePendingApproval`/
   `resolvePendingApproval` change from `Promise<string>`/`reply: string` to one structured shape,
   `{ reply: string; userId: string | null }` — carried as a single unit rather than a second,
   separately-threaded parameter that could drift out of sync with which reply it belongs to.
5. **`NotificationChannel.requestApproval`**: return shape becomes `{ reply: string; userId: string |
   null }` in `notifications/channel.ts`'s interface and every implementation (`in-app-channel.ts`,
   `push-channel.ts` — read both before changing).
6. **`agents/gate1/index.ts` / `agents/gate2/index.ts`**: `Gate1Outcome`/`Gate2Outcome`'s variants each
   gain `approvedByUserId: string | null`. `parseGateReply`/`parseGate2Reply` stay pure string-parsing
   functions, unchanged signature — they don't need to know about users; `requestGate1Decision`/
   `requestGate2Decision` attach the `userId` from `channel.requestApproval`'s result onto whichever
   outcome the parser returned.
7. **`api/routers/runs.ts`**: `gate1`/`gate2` mutations call
   `resolvePendingApproval(input.runId, { reply: replyText, userId: ctx.userId })` instead of a bare
   string.
8. **`state-machine.ts`**: all five `insertReviewLog` call sites (gate1 reject, gate1 edit/approve,
   gate2 reject, gate2 approve, gate2 revise) pass `approvedByUserId: outcome.approvedByUserId`.
9. **`scripts/dry-run.ts`**: its simulated gate-resolution commands call `resolvePendingApproval`
   directly (not through `runs.ts`'s tRPC mutation) — update those call sites to the new signature,
   passing `userId: null` explicitly (ops/tooling path), not omitting the param.

**Verify**: a real signed-in session's real gate1 `approve` call → a direct Postgres read of the
resulting `ReviewLog` row shows `approvedByUserId` matching that session's real `userId`, not null and
not another user's id. Same for a real `reject`/`edit` outcome, and for gate2's `approve`/`reject`/
`revise`. A `scripts/dry-run.ts` simulated resolution → `approvedByUserId: null`, not an error.
`findGate1ApproverForRun` returns the correct user for a run with a real approved gate1, and `null` for
a run whose gate1 was resolved via the ops path. Existing gate1/gate2 test suites still pass unmodified
in their assertions about `verdict`/`rationale`/`editedOutput` — only the new field is additive.

## Schema Impact
New nullable column + FK: `review_logs.approved_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET
NULL`. No backfill needed — historical rows correctly have no known approver (they predate this field;
`null` is the honest value here, not a data-quality gap to paper over).

## Business Logic / State Transition
No new transitions, no change to any gate's approve/reject/edit/revise outcome logic — purely additive
identity capture alongside decisions that already happen exactly as they do today.

### Failure Modes & Handling
None of this plumbing can fail in a way that should block a gate resolution — `ctx.userId` is always
already resolved (or `null`, a valid value) before the mutation runs, so there's no new failure surface;
worst case is a `null` where a real id was expected, never a thrown error blocking the gate.

## Implementation

### Files to Modify
- `studio/src/models/schema.prisma` — `ReviewLog.approvedByUserId` + relation
- `studio/src/types/review-log.types.ts` — `approvedByUserId` on both types
- `studio/src/models/repositories/review-log.repository.ts` — pass-through + `findGate1ApproverForRun`
- `studio/src/notifications/pending-approvals.ts` — `{ reply, userId }` shape
- `studio/src/notifications/channel.ts` and its implementations (`in-app-channel.ts`,
  `push-channel.ts`) — `requestApproval`'s return shape
- `studio/src/agents/gate1/index.ts`, `studio/src/agents/gate2/index.ts` — outcome types + attaching
  `userId`
- `studio/src/run-pipeline/state-machine.ts` — all five `insertReviewLog` call sites
- `studio/src/api/routers/runs.ts` — `gate1`/`gate2` mutations pass `ctx.userId`
- `studio/scripts/dry-run.ts` — simulated gate-resolution commands, updated to the new signature

### Files to Create
- A new Prisma migration (`prisma migrate dev` names it) for `approvedByUserId`.

## Testing
```bash
npm run build && npm run lint && npx tsc --noEmit
npx prisma validate
npx vitest run review-log gate1 gate2 pending-approvals runs
```

## Report Template
`docs/execution/sprint4/reports/task4.md`. State plainly this task exists specifically so Task 5's
`{editor}`/`{sources}` packaging fields can be built for real instead of deferred — link the two
reports together.

## Links & References
- `sprint4/tasks/task5.md` — the real `{editor}`/`{sources}` feature this task unblocks.
- `types/review-log.types.ts`, `api/trpc.ts` (`Context.userId: string | null`),
  `api/routers/runs.ts` — the real gap and the real session-identity source this task threads through.
- `sprint3/reports/task2.md` (archived, see docs/ARCHIVE_INDEX.md) — `canResolveGate`'s own precedent for "the resolving user's identity is
  already available at this call site," which this task finally carries one layer further, into the
  audit row itself.
