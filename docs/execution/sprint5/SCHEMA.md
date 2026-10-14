# Sprint 5 Schema Delta — Proposed, Not Applied

No schema or migration was changed during planning. This page describes only a proposed delta and its ownership; current tables remain defined by `studio/src/models/schema.prisma` and earlier sprint deltas.

## Task ownership

Task 2 is the sole Sprint 5 migration owner. Tasks 1, 3, 4 and 5 use existing Json/artifact storage and propose no Prisma migration. #89 already implements JSON retry-remediation fields; Sprint 5 does not duplicate them or reset counters. Future work starts from fresh main containing that release.

Latest baseline is #90 (`5b04a7a`) or a verified descendant. Its hash-order compatibility uses existing storage and adds no migration; do not replace it with another legacy-hash scheme. [WORKFLOW](WORKFLOW.md) requires per-task draft PRs and post-Sprint-4 closure conflict resolution. Task 2 reconciles any newer Sprint 4 migration ordering before ready-for-review; other agents cannot create competing schema deltas.

## Task 2 proposed additive field

**Proposal requiring review before application/rollout:** one nullable, server-internal `PipelineRun.publishingRecovery Json?` field. The durable receipt belongs to the run rather than a transient publishing attempt, so it survives failed attempts and is atomically claimed across manual retry/startup/stall workers. Local implementation requires task authorization; production migration/rollout requires concrete review. No new top-level pipeline or stage status is proposed.

Its version-1 logical record contains:

- `version`, `revision` (monotonic CAS value), `phase` (`prepared`, `session_ready`, `uploading`, `uploaded`, `followups`, `complete`, `ambiguous`).
- `channelId`, source-file content hash/byte length, approved metadata hash and Gate 2 identity/fingerprint, tying an upload to the exact approved output.
- Current owner token, monotonically increasing ownership epoch, lease/heartbeat timestamps. Epoch fencing protects database writes; lease expiry alone does not prove an old external upload stopped.
- An encrypted resumable session URI plus encryption version, confirmed uploaded-byte offset, session creation time. Never emit the URI, owner token or encryption payload through tenant/Admin content projections or logs.
- `youtubeVideoId` and immutable upload receipt fields once observed, with receipt timestamp. A late successful response must be durably reconciled, not discarded into a new insertion attempt.
- Follow-up statuses for final artifact copy, thumbnail and captions (`pending`, `succeeded`, `failed`, `uncertain` as applicable), safe failure classification and timestamps. Existing product policy on best-effort failures remains in Task 2.

Exact validation types live in Task 2's proposed publishing-recovery module, not duplicated as full database DDL here. Any additional column/table requires evidence and a reviewed revision to this page; other task agents must not create parallel upload receipts.

## Migration and compatibility

Task 2 creates the next additive Prisma migration from fresh integrated `main`, after the planner lane is merged. Choose its actual timestamp/name then; none is reserved or generated in planning. Nullable/no automatic backfill permits old records and rolling schema-first deployment. Test migrate-deploy on fresh and previously migrated sandbox databases and reapplication through Prisma's migration tracking. Never run `migrate dev`, reset or a backfill on preview.

Server-only repository methods read/update the field under a run-row lock/compare-and-swap, with no transaction held across an HTTP call. The existing `toDomainRun()` explicitly selects public domain fields; preserve that boundary. Add negative exposure tests for run detail, list, Admin content, errors and bundles. The existing encryption utility may be reused through a purpose-scoped wrapper using the current key; a new secret setting is not presumed necessary.

For legacy runs: import an unambiguous existing YouTube ID from any relevant attempt into the receipt before any insertion. Conflicting IDs or a previously started upload with no verifiable outcome become `ambiguous`; never infer “not uploaded” from a missing ID. No bulk data rewrite is proposed. Founder review, backup, schema/code compatibility and deployment authorization precede application. Schema rollback must not discard upload/session evidence or re-enable unsafe legacy insertion.

## JSON and file contracts without migrations

- Task 1 derives bounded safe summaries from existing run/stage/usage rows, including #89's per-call metadata; it does not add another planner persistence writer.
- Task 3 adds backwards-compatible scene identity/purpose/span metadata to existing plan JSON and records alignment decisions. Legacy plans get deterministic identity; no narration rewrite or slot-count change.
- Task 4 stores one versioned evidence packet/hash in existing generation/review stage input/output. No fetched-source table or research infrastructure.
- Task 5 stores a bounded visual repair receipt/asset fingerprints in existing video-stage JSON and deterministic work artifacts. No generic dependency database, new status enum or image-reference setting.
