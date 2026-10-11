# Sprint 4 Task 4: ReviewLog Approver Identity (Editor Attribution Plumbing)

**Date**: 2026-10-07
**Status**: Complete
**Branch**: `sprint4_be`
**Tests**: All passing (214 tests); `tsc`, lint, build clean.

This task exists so Task 5's `{editor}` credit can be built from real data instead of deferred. Task 5
consumes `findGate1ApproverForRun` directly (see `reports/task5.md`).

## What Was Done

- Migration `20261007085716_sprint4_review_log_approver`: `review_logs.approvedByUserId uuid NULL`, FK to
  `users` `ON DELETE SET NULL`. Applied to `sevenai_dev`. No backfill (older rows honestly have no approver).
- Types and repository: `ReviewLog.approvedByUserId` / `CreateReviewLogInput.approvedByUserId`, passed
  through `insertReviewLog` and `toDomainReviewLog`. New `findGate1ApproverForRun(runId)` returns the user
  (id, name, email) of the latest human `approve`/`edit` row on that run's `gate1` stage, or `null`.
  (No existing `user.repository` join helper was needed: a single Prisma `include`.)
- Pending approvals: the reply and the user travel as one `ApprovalReply = { reply, userId }` through
  `getOrCreatePendingApproval`, `resolvePendingApproval(threadKey, { reply, userId })`, the
  `NotificationChannel` interface, `in-app-channel`, `push-channel` and the composite channel.
- Gates: `Gate1Outcome` / `Gate2Outcome` = the pure parsed decision plus `approvedByUserId`;
  `parseGateReply` / `parseGate2Reply` are unchanged in behaviour (they now return `GateDecision` /
  `Gate2Decision`), `requestGate1Decision` / `requestGate2Decision` attach the id.
- `state-machine.ts`: all five human `insertReviewLog` sites write `approvedByUserId`.
- `runs.gate1` / `runs.gate2` pass `ctx.userId`; `scripts/dry-run.ts` passes `userId: null` explicitly.

## Test Results

New unit tests: pending approvals carry reply+user as one unit, keep `null` for ops, and the first
resolution wins; the parser stays user-agnostic. Existing gate1/gate2 assertions untouched.

Live on `sevenai_dev` through the real router and the real `runGate1Stage` / `runGate2Stage` (throwaway
tenant, user, channel, runs; deleted, leftovers 0), checked by reading `review_logs` directly:

| Case | Resolved by | `approvedByUserId` |
|---|---|---|
| gate1 approve / reject / edit | signed-in user | the user's id (all three) |
| gate1 approve | ops ctx (`userId: null`) | `null`, no error |
| gate2 approve / revise / reject | signed-in user | the user's id (all three) |

`findGate1ApproverForRun` returned `{ userId, name: 'ZZ Editor', email }` for the user-approved run and
`null` for the ops-approved one.

## Deviations from Spec

- Two callers the doc did not list also resolve a gate: `runs.cancel` and `channels.archive` (both resolve
  a pending gate with a synthetic `reject ...`). They now pass the acting user's `ctx.userId`, so those
  system rejects are attributed to whoever cancelled or archived. Only a reject, never an approve.
- `scripts/dry-run.ts` was updated and type-checked but not run (it writes to the shared dev DB).
- Synthetic auto-approve rows (`agent: 'system'`) correctly have no approver.

## Sign-Off

- Task Objective: Met
- Schema Impact: Matches `SCHEMA.md` (updated)
- Business Logic: No change to any gate outcome; `BUSINESS_LOGIC.md` notes the identity flow
- Tests: Passing
- Ready for Integration: Yes
