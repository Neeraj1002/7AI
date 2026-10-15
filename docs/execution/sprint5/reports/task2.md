# Sprint 5 Task 2: Durable Publishing Receipts and Safe Upload Recovery

**Date:** 2026-10-15
**Status:** Draft implementation; production rollout and Sprint 4 integration gate pending
**Branch/worktree:** SPRINT5_TASK2_BE at D:\Study Material\7AI-SPRINT5\task2
**Base:** origin/main 5b04a7a22b31a8c6562100c72bc157beccd91e62 (#90), plus cherry-picked planning-only commit 578ba530100638548a4a49af57efcb14e7962227 as 52f3909. Task 1 application changes were not copied.
**Implementation commit:** 0649f8957b20026ab39478075fbdc4313efe24fd
**Draft PR:** https://github.com/Neeraj1002/7AI/pull/92
**Merge/deployment SHA:** none; the PR remains open and draft.

## What changed

- Added nullable, server-only PipelineRun.publishingRecovery JSONB through migration 20261015000000_sprint5_publishing_recovery. Version-1 receipt binds channel, approved file hash/size, Gate 2, metadata fingerprint and exact metadata; it records revision, owner epoch/token/lease, encrypted resumable session, confirmed offset, first video ID and follow-up states.
- Added run-row-locked claim, heartbeat, fenced mutations, legacy evidence import, safe late-ID observation and pure safe-summary projection. Consistent IDs from any attempt prevent insertion. Conflicting IDs, unverified legacy attempts and unsupported receipt versions fail closed.
- Replaced the application's whole-file multipart insertion with a resumable session request, durable encrypted URI, stream of provider-confirmed remaining bytes, and bounded same-session status reconciliation. The old multipart insertion function and public publishing export were removed.
- Moved the first ID receipt and stage checkpoint ahead of R2, cover and caption effects. Fixed-key R2 copies can retry; uncertain thumbnail/caption insertions are not repeated. Backend Retry consults the receipt, and the stall message states the observed recovery condition.
- Preserved the Gate 2 privacy/disclosure/kid/category/language metadata contract, long-form chapter metadata and existing caption messages. No Admin route or frontend screen was changed.

## Local verification

- Studio build, typecheck, ESLint and git diff --check passed.
- Focused publishing, retry, startup and planner regression suite: 11 files, 79 tests passed. This includes a local fake HTTP server proving one session, one streamed submission and a persisted URI before bytes, plus mocked partial-offset and lost-final-response cases.
- Named local sandbox sevenai_sprint5_task2_20261015_test: migration deploy applied; second deploy had no pending migrations. Nullable JSONB column read back. Real-connection integration suite: 9 tests passed for two racing callers, another process, encrypted session exclusion from tenant/Admin projections, failed legacy IDs/conflicts, expired-owner same-session claim, late ID explicitly pre-upload failed attempts, invalid receipt versions, atomic completion rollback, and a killed worker resumed through its persisted fake session. Fixtures were removed after each suite.
- No live YouTube request, production migration, service restart or public upload was performed.

## Fake-provider fault counts

| Injected boundary | Sessions initiated | Byte submissions | Confirmed video IDs | Result |
|---|---:|---:|---:|---|
| Session saved before stream (HTTP fake) | 1 | 1 | 1 | Success |
| Session persistence fails | 1 | 0 | 0 | No bytes sent |
| Saved session query fails/expired | 0 new | 0 | 0 | Unresolved, no insertion |
| Partial stream then confirmed offset | 0 new | 2 to same session | 1 | Remaining bytes resumed |
| Final response lost, status query succeeds | 0 new | 1 | 1 | Same-session ID recovered |
| Worker killed after session save, new process resumes (HTTP fake + sandbox) | 1 total | 1 | 1 | No second session |
| Two DB callers or second process | 0 provider calls | 0 | 0 | One owner; other busy |

These are fake/local counts, not measured YouTube production behavior.

## Contract and remaining review

Owner review is required for the JSON receipt, lease/reconciliation policy, migration/backup and mixed-version drain before any production schema or code rollout. The draft PR must integrate latest main and Sprint 4 closure fixes and rerun checks before ready-for-review. Production deployment/readback and any external smoke upload need separate explicit authorization.

The local tests cover core protocol, cross-process ownership and a process stop after session persistence before bytes. They do not prove provider exactly-once semantics, a killed worker in the middle of a real byte transfer, or every optional-effect response/write boundary. If a previous request is still in flight when its lease expires, the new worker only uses the same saved session; the abort/heartbeat narrows this window but cannot fence YouTube itself. An expired/unqueryable session after possible bytes remains ambiguous and blocks a new insertion.

## Sign-off

- Local implementation and focused checks: passed.
- Production migration and upload verification: pending owner decision.
- Sprint 4 closure/latest-main integration: pending.
