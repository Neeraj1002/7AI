# Sprint 5 Schema Delta — Task 2 Draft Implementation

Task 2 adds one nullable server-only receipt column on its draft branch. It has been applied only to a named local sandbox, not production. Current tables remain defined by `studio/src/models/schema.prisma` and earlier sprint deltas.

## Task ownership

Task 2 is the sole Sprint 5 migration owner. Tasks 1, 3, 4 and 5 use existing Json/artifact storage and propose no Prisma migration. #89 already implements JSON retry-remediation fields; Sprint 5 does not duplicate them or reset counters. Future work starts from fresh main containing that release.

Latest integrated baseline is merged #91 (`3b0ee91`), including #89/#90. Hash-order compatibility uses existing storage and adds no migration; do not replace it with another legacy-hash scheme. The revised [WORKFLOW](WORKFLOW.md) requires current-main integration, affected checks and concrete rollout preparation before #92 readiness; Sprint 4 closure and a real YouTube upload are not prerequisites. Task 2 reconciles migration ordering; other agents cannot create competing schema deltas.

## Task 2 additive field in the draft branch

**Implemented locally; production application requires owner review:** one nullable, server-internal `PipelineRun.publishingRecovery Json?` field. The durable receipt belongs to the run rather than a transient publishing attempt, so it survives failed attempts and is atomically claimed across manual retry/startup/stall workers. Local implementation requires task authorization; production migration/rollout requires concrete review. No new top-level pipeline or stage status is proposed.

The implemented version-1 JSON record contains:

- `version`, `revision` (monotonic CAS value), `phase` (`prepared`, `session_ready`, `uploading`, `uploaded`, `followups`, `complete`, `ambiguous`).
- `channelId`, source-file content hash/byte length, approved metadata hash and Gate 2 identity/fingerprint, tying an upload to the exact approved output.
- Current owner token, monotonically increasing ownership epoch, revision, and lease/heartbeat timestamps. A row lock serializes updates; epoch/owner checks fence writes. Lease expiry only permits recovery of the same stored session.
- An AES-GCM-encrypted resumable session URI (using the existing credential key), confirmed uploaded-byte offset, session creation time and upload-started flag. The server-only record also retains exact metadata and the chapter-list decision for restart. Never emit URI, owner token or ciphertext through tenant/Admin projections or logs.
- `youtubeVideoId` and immutable upload receipt fields once observed, with receipt timestamp. A late successful response must be durably reconciled, not discarded into a new insertion attempt.
- Follow-up states for final artifact copy, thumbnail and captions: pending, started, succeeded, failed or uncertain as applicable. Existing best-effort policy remains.

Exact validation types live in Task 2's publishing-recovery module, not duplicated as full database DDL here. Any additional column/table requires evidence and a reviewed revision to this page; other task agents must not create parallel upload receipts.

## Migration and compatibility

Task 2 added studio/src/models/migrations/20261015000000_sprint5_publishing_recovery/migration.sql from main 5b04a7a, which contains the merged planner lane. It adds nullable JSONB PipelineRun.publishingRecovery without backfill. Migrate-deploy applied in the named local sandbox and a second deploy found no pending migrations. No production migration, preview reset or backfill was run.

Server-only repository methods read/update the field under a run-row lock/compare-and-swap, with no transaction held across an HTTP call. The existing `toDomainRun()` explicitly selects public domain fields; preserve that boundary. Add negative exposure tests for run detail, list, Admin content, errors and bundles. The existing encryption utility may be reused through a purpose-scoped wrapper using the current key; a new secret setting is not presumed necessary.

For legacy runs: import an unambiguous existing YouTube ID from any relevant attempt into the receipt before any insertion. Conflicting IDs or a previously started upload with no verifiable outcome become `ambiguous`; never infer “not uploaded” from a missing ID. No bulk data rewrite is proposed. Founder review, backup, schema/code compatibility and deployment authorization precede application. Schema rollback must not discard upload/session evidence or re-enable unsafe legacy insertion.

## JSON and file contracts without migrations

- Task 1 derives bounded safe summaries from existing run/stage/usage rows, including #89's per-call metadata; it does not add another planner persistence writer.
- Task 3 adds backwards-compatible scene identity/purpose/span metadata to existing plan JSON and records alignment decisions. Legacy plans get deterministic identity; no narration rewrite or slot-count change.
- Task 4 stores one versioned evidence packet/hash in existing generation/review stage input/output. No fetched-source table or research infrastructure.
- Task 5 stores a bounded visual repair receipt/asset fingerprints in existing video-stage JSON and deterministic work artifacts. No generic dependency database, new status enum or image-reference setting.
