# Sprint 5 Task 2: Durable Publishing Receipts and Safe Upload Recovery

**Date:** 2026-10-15
**Status:** Current-main integration and local checks complete; draft pending the server backup/key/worker-handoff preparation results. Sprint 4 closure and a real YouTube upload are not prerequisites.
**Branch/worktree:** SPRINT5_TASK2_BE at D:\Study Material\7AI-SPRINT5\task2
**2026-10-18 preparation branch/worktree:** `review/pr92-merge-ready` at `D:\Study Material\7AI\.worktrees\pr92-merge-ready`; created by this session from fetched #92 head `b08925ecdbd87de730e0372315060107bc61150f`. The original task checkout was not edited.
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

Owner review remains required for the JSON receipt, lease/reconciliation policy and actual rollout procedure. Under the revised owner workflow, #92 does not wait for Sprint 4 closure or a real YouTube upload: one combined Sprint 4–5 acceptance pass follows Task 5. Current-main integration, affected checks and concrete backup/key/worker-handoff preparation precede readiness. Production deployment/readback is separate; no live smoke upload is part of this preparation.

The local tests cover core protocol, cross-process ownership and a process stop after session persistence before bytes. They do not prove provider exactly-once semantics, a killed worker in the middle of a real byte transfer, or every optional-effect response/write boundary. If a previous request is still in flight when its lease expires, the new worker only uses the same saved session; the abort/heartbeat narrows this window but cannot fence YouTube itself. An expired/unqueryable session after possible bytes remains ambiguous and blocks a new insertion.

## 2026-10-18 integration and checks

Merged current `origin/main` at `3b0ee91989f3d04c315dbf61566b33e736f67e4f` (merged #91, including #89/#90) into this session's preparation branch. Application files merged cleanly. Five add/add planning conflicts were resolved: retained Task 2's implemented schema/business-logic descriptions; retained main's Task 1 specification and revised workflow; kept main's Task 1 status and Task 2's own row/ownership, updating that row for this preparation. No planner/retry algorithm or production publishing behavior was changed by the integration resolution.

Final affected Vitest rerun: **23 files passed, 168 tests passed, zero skipped**, including nine real-database publishing tests and all #91 diagnostic/Admin tests. Fake HTTP/provider tests cover persisted session before bytes, partial offset, lost final response, same-session restart, racing callers and another process. Initial failures were test-harness dependencies: mocked OAuth tests lacked local app-identity values, and fake-worker teardown could await an already signalled exit. OAuth identity is now synthetic inside the test; workers run directly via Node's tsx import and cleanup checks both exit and signal state before awaiting exit. The complete rerun passed without provider credentials or live calls.

Build, ESLint (zero warnings), typecheck and whitespace checks passed on the integrated tree. The operator helper additionally passes Node syntax checking; on this Windows workstation it refuses execution before any server operation. Its privileged Linux backup path cannot be claimed verified until the owner returns the actual terminal results.

Migration checks:

- Existing `sevenai_sprint5_task2_20261015_test`: deploy finds no pending migration; status up to date.
- Fresh isolated localhost `sevenai_pr92_migration_20261018_test`: all 22 current-main migrations applied, then a synthetic pre-#92 run/failed publishing-ID fixture was created. The 23rd Task 2 migration applied successfully; existing receipt stayed null; JSONB remained nullable; run status and failed-stage output/ID hash were preserved.
- Second migrate-deploy was idempotent; final status up to date; database/schema drift check empty; 23 completed migrations. This scratch fixture is retained, never restored over an existing database. No production migration was applied.

## Server rollout preparation

Direct noninteractive SSH as `deploy@187.127.185.46` returned `Permission denied (publickey,password)`. Local SSH inventory has no private key or agent. The owner confirmed deployment uses GitHub's `VPS_SSH_KEY_B64` secret and requested a single pinned command block for Hostinger's browser terminal. No new SSH credentials were created, no deployment workflow was triggered and no GitHub secret was retrieved.

Prepared [the concrete deployment/recovery runbook](../runbooks/task2-rollout.md) and `studio/scripts/prepare-publishing-rollout.mjs`. The helper creates a private pg_dump, checksum and complete isolated restore check; validates the existing effective encryption key and stored credentials without outputting them; reports running publishing work and actual PM2/deploy/Nginx/scheduler inventory. It never deploys, restarts, changes service/config/schema, calls YouTube or interrupts an upload. Source-only SELECTs and a new isolated restore database are distinct from application writes. The supplied block only fetches the reviewed source and runs this helper from a private temporary copy, leaving the deployed checkout unchanged.

**Outstanding blocker:** actual server backup/restore, existing-key and worker/deploy inventory results from the owner-run terminal block. The worker handoff is explicitly gate new requests → let old work finish → final verified backup → stop only proven-idle old workers → owner merge/deploy with no overlap → readback → reopen admission. A plain PM2 restart or lease expiry does not establish a drain. No maintenance gate, stop, deploy or restart was performed during preparation.

The owner's first terminal invocation returned to the prompt without JSON or the exit marker. That is not evidence of successful checks. The initial wrapper had an unguarded `command -v node` under `set -e`, which can exit silently when a noninteractive deploy login does not initialize nvm/PATH; the exact failed step was not recorded. The replacement wrapper reports each stage and always emits an exit marker, discovering the existing Node binary from the live PM2 daemon rather than relying on a login profile. The helper likewise invokes the existing PM2 CLI with explicit Node/PM2 paths, without starting another daemon. Server checks remain unverified until actual output is returned.

Task 1's publishing-summary Admin adapter remains pending until #92 lands and is nonblocking here. Full production acceptance is the combined Sprint 4–5 pass after Task 5; no real upload is needed to make #92 reviewable once rollout preparation is verified.

## Sign-off

- Local implementation and focused checks: passed.
- Current-main integration, local publishing/restart/concurrency checks and migration rehearsal: passed.
- Server backup/key/worker-handoff preparation: pending Hostinger-terminal results; keep #92 draft.
- Production migration/deployment/readback: future separately authorized rollout, not performed here. Real YouTube upload and Sprint 4 closure do not gate readiness.
