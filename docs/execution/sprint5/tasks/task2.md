# Sprint 5 Task 2: Durable Publishing Receipts and Safe Upload Recovery

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow (branch/commit/PR steps for this task), the `STATUS.md` update this task must make, and the section structure this file follows. This file states only this task's specifics — the template governs everything else, so don't skip it.

**Binding execution workflow:** read [WORKFLOW](../WORKFLOW.md). Reuse the one Sprint 5 root established by Task 1; work in its separate `task2` worktree, with a separate draft PR. After owner-confirmed Sprint 4 closure, integrate latest main/closure fixes, resolve conflicts and rerun checks before marking this PR ready. Do not create another top-level Sprint 5 directory or switch another task's checkout.

**Objective**: Prevent a run from initiating another YouTube upload while an earlier upload is active, known successful or unresolved, and resume safe remaining work after a restart.
**Duration**: 3–4 days plus founder review of persistence/workflow contract and deployment verification.
**Depends On**: Task 1 establishes the shared Sprint 5 root/planning baseline; then Task 1 diagnostics and this task can run concurrently in separate task worktrees. Fresh main includes #90. Persistence/workflow review precedes production rollout; PR readiness waits for Sprint 4 closure/conflict gate.
**Owning Component**: Publishing provider boundary, durable run-level receipt/ownership, publishing slice of runner/retry/startup and the sole Sprint 5 migration.
**Success Criteria**: (1) upload session and ID are persisted at safe boundaries; (2) concurrent/late workers cannot initiate competing uploads; (3) unknown completion becomes actionable needs-attention, not blind insertion; (4) receipt survives failed attempts and restart; (5) follow-up failures never cause re-upload.
**Priority / status**: P0; not started. Production duplicate frequency is unknown.

## Task Requirement

### Problem, evidence and impact

**Verified—repository:** [runPublishingStage](../../../../studio/src/run-pipeline/state-machine.ts) receives `uploadResult` around line 1959, then handles final R2 copy, thumbnail and long subtitles before `recordStageProgress` around line 2063. Existing reuse around line 1853 accepts only a **running** publishing attempt with `youtubeVideoId`. [Stall guard](../../../../studio/src/run-pipeline/pipeline-runner.ts) races a 10-minute timer against an operation that continues afterward and tells the user it is safe to retry. [YouTube client](../../../../studio/src/agents/publishing/youtube-client.ts) buffers a multipart insertion and treats only provably pre-send connection failures as transient. [Startup](../../../../studio/src/run-pipeline/resume-on-startup.ts) resumes running publishing stages; [runs.retry](../../../../studio/src/api/routers/runs.ts) has no persisted cross-worker publishing claim. [failStage](../../../../studio/src/models/repositories/pipeline-stage.repository.ts) preserves progress, but changing status to failed defeats the current running-only reuse predicate.

**Verified—live/source reconciliation:** earlier runtime reported #88 then #89; latest runtime reports #90 `5b04a7a`. #90 changes only legacy planner hash validation/test and retains the publishing gap. Above line numbers refer to the #88 planning checkout and can shift in fresh main. No upload/failure/duplicate was induced by this planning chat.

**Inferred:** crash or DB failure after external success but before the late receipt can lose upload identity; Retry while a stalled request is still alive can compete; a known ID in a failed attempt may be bypassed. Conservative provider error mapping protects automatic insertion retries but does not by itself protect user retry/startup concurrency. These are concrete source-path risks, not claimed reproduced production duplicates.

**Proposed:** one durable run-level receipt, atomic publisher ownership, persisted resumable session and explicit unresolved-outcome handling. No general distributed workflow rewrite or “exactly once” provider guarantee.

### R1 — Define one upload identity and preserve legacy evidence

Use the proposed server-only `PipelineRun.publishingRecovery` record in [SCHEMA](../SCHEMA.md). Bind it to run/channel, exact approved rendered-file hash/size, sanctioned/Gate 2 identity and metadata fingerprint. It outlives individual stage attempts and has a monotonically versioned CAS revision. No receipt/claim in mutable `creationOptions` and no independent implementation in other tasks.

Before first insertion, inspect relevant legacy publishing outputs across statuses. A known consistent video ID prevents insertion and populates the receipt idempotently. Conflicting IDs or a started/failed/stalled legacy upload with no verifiable outcome park as ambiguous. Absence of a checkpoint is not proof that YouTube received nothing. No bulk backfill, title-based matching or counter reset.

### R2 — Atomic claim, reconciliation and late-worker behavior

Acquire/renew/release publisher ownership with a short database transaction/row lock or tested compare-and-swap on the run receipt. Use ownership epoch and revision, not an in-memory lock. Hold no DB transaction across provider/network/FFmpeg calls. `runs.retry`, runner and startup must route publishing through the same claim/reconciliation helper.

Only one owner sends upload bytes. A second caller gets current safe recovery status/conflict and does not dispatch upload work. A lease expiry permits reconciliation of the existing session, not a new insertion while an old side effect might complete. Epoch fencing alone cannot stop YouTube; combine abort/settlement handling with persisted same-session state and bounded reconciliation. Persist uncertain completion before allowing another workflow decision.

A late success must be durably recorded/reconciled for the original upload identity. If its owner lost the lease, reject arbitrary stale phase writes but retain the known ID as an observation that prevents new insertion. Never drop the ID simply because the worker is stale. Test original-success-after-timeout and receipt-write-failure explicitly.

### R3 — Persist the provider session before bytes, ID before follow-ups

Retain OAuth/client boundary and upload metadata validation. Implement a resumable transport in that boundary: initiate a session, **durably save its URI**, then stream the file to that same session. On interruption, query its acknowledged offset/completion before resuming. Persist the first known successful video ID and receipt fields immediately, before R2, thumbnail/captions, or stage completion. Do not perform optional work if receipt persistence failed.

The provider protocol supports session creation, status query and continuation; see [Google's resumable-upload guide](https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol), checked during planning. Use the provider response for confirmed offsets/completion; do not assume sent bytes were received. Avoid buffering the entire long file. Chunking/progress UI is not required: stream the remaining bytes with bounded I/O and timeout/abort support. Do not add a tunable per-channel chunk-size setting.

Unreachable before-send session creation may use existing bounded retry rules. A lost final response or an expired/invalid session after possible completion is not a license for blind reinsertion. Reconcile status when possible; otherwise record safe ambiguity and require an explicit human decision through existing workflow, without a new broad force endpoint. No exactly-once billing or remote idempotency claim is made.

### R4 — Follow-up receipts and restart behavior

Separate uploaded receipt from final-artifact copy, cover-frame and subtitle outcomes. Reuse metadata and known ID across restart. Preserve current best-effort semantics: thumbnail or caption rejection need not turn a successful upload into a failed insertion; existing caption messages/download links remain. Mark uncertain non-idempotent caption insertion without blindly repeating it. R2 copy may retry safely on its fixed key after checking ownership.

Completion joins receipt-backed publishing output and advances to analytics under the current transaction. A failed stage holding a known ID cannot upload again. Startup imports existing evidence before any provider effect; unresolved cases park explicitly. No production process restart is part of local acceptance.

### R5 — API/product compatibility and safe diagnostics

Replace the blanket stall message with truthful status: upload in progress, uploaded/follow-ups pending, or outcome unresolved. Backend Retry must enforce ownership/ambiguity even when the app is stale. Keep current top-level statuses, channel gate toggles, archived/cancelled guards, privacy/synthetic-media/compliance metadata, tenant/gate authorization, ordinary retry policy and chapter/subtitle behavior. The existing planner legacy-cap exception stays owned by its lane; do not alter it here.

Export a pure safe receipt summary for Task 1: phase, known-ID presence, ambiguity, relevant fingerprint match, safe ownership-active flag and follow-up states. Task 1 owns Admin integration. Keep encrypted session URI/owner tokens out of public domain run/stage outputs, generic errors, Admin content, bundles and logs. Existing UI messages may consume existing fields; no new frontend screen/settings/native changes are needed.

### Scope and non-goals

All upload identity/concurrency/receipt/restart responsibilities are one task so no two agents build incompatible publishing mechanisms. Excludes general job queues, fleet leases, provider quota redesign, new credential infrastructure, analytics redesign, public test upload, automatic ambiguity override, changing server-specific untracked files or a global retry policy.

### Acceptance Criteria

- [ ] Known ID saved before every optional follow-up; DB write failure after provider success blocks reinsertion and optional effects.
- [ ] Session is durable before bytes and reused after interruption/restart; mismatched approved artifact/metadata is rejected.
- [ ] Two concurrent Retry/runner/startup workers initiate at most one upload session with file submission; late/expired owner does not create another upload.
- [ ] Lost final response reconciles the same session; unreconcilable outcome parks and never blindly inserts.
- [ ] Running, failed and legacy attempts with known IDs all prevent re-upload; conflicting legacy IDs are explicit.
- [ ] R2/thumbnail/caption/analytics failures never trigger another video insertion. Caption uncertainty is recorded without repeat side effect.
- [ ] Cancellation/archive/gate/compliance and existing Shorts/long publishing behavior remain compatible.
- [ ] Migration, exposure, process-restart and concurrency checks pass in isolated sandbox; live claims require separate authorization/readback.

## Schema Impact

One proposed additive nullable field, solely owned here; no new enum/table presumed. See [SCHEMA](../SCHEMA.md). Local implementation requires task authorization; founder review of the concrete persistence/workflow delta precedes production migration/application/rollout. Generate the next migration from integrated main containing #89. Check schema-first compatibility, migration tracking/reapplication and rollback preserving receipts. No preview migrations as tests.

## Business Logic / State Transition

See [BUSINESS_LOGIC](../BUSINESS_LOGIC.md). Preconditions remain active channel, valid approved output and authorized run. Internal receipt phases serialize effect/reconciliation. Known success transitions to follow-ups; uncertain completion routes to existing needs-attention. Expiry is never proof of external absence. No SQL transaction spans upload; receipt CAS guards ownership. All retry entry paths consume the same contract.

## Implementation

**Exclusive existing files:** publishing `index.ts`, `youtube-client.ts`, `types.ts`, stub/tests; publishing guard/stall/resume tests. **Proposed new files:** `studio/src/run-pipeline/publishing-recovery.ts`, `studio/src/models/repositories/publishing-recovery.repository.ts`, `studio/src/agents/publishing/resumable-upload.ts` and their focused tests.

**Shared files, sequenced:** publishing sections of `state-machine.ts`, `pipeline-runner.ts`, `resume-on-startup.ts`, publishing Retry slice in `api/routers/runs.ts`, schema/migration and repository integration. #89 is merged: retain its code/allowance and start from that baseline. This task owns Sprint 5 schema and does not edit evidence/scene contracts. A purpose-scoped wrapper can reuse [credential crypto](../../../../studio/src/models/credential-crypto.ts)/current key; no session-log secret or untested new setting.

Detailed sequence: freeze reviewable receipt contract; under task implementation authorization test isolated CAS/fake transport; add receipt-first persistence/legacy guards/follow-ups; fix stall/startup/retry; expose safe summary; test failure matrix; obtain concrete migration/workflow rollout approval. Keep one coherent draft PR/ownership contract; any split records ordering.

## Testing

Run Studio build/lint/typecheck and focused existing `src/agents/publishing/youtube-client.test.ts`, `src/run-pipeline/state-machine.publish-guard.test.ts`, `src/run-pipeline/resume-on-startup.test.ts`, `src/api/routers/runs.retry.test.ts`, plus new receipt/provider/stall/process tests. Preserve unrelated planner recovery tests at integration. Use a local fake YouTube HTTP server and a named sandbox database; neither application startup nor acceptance may resume live runs or use real OAuth upload.

Required fault matrix: before session request; after session response/before session DB write; after session persistence/before bytes; partial bytes; final bytes/lost response; provider success/before ID DB write; known ID/before each follow-up; follow-up response before status write; before completion; timeout with original worker still alive; two API callers; two processes; stale epoch; restart with running/failed old stage; conflicting/missing old evidence; session expiry; changed file hash; archive/cancel/gate failure. Count external session/file submissions and final fake video IDs; distinguish safe pre-send retries from unsafe repeat side effects. Do not mirror code with a single happy-path stub.

Database tests verify atomic compare-and-swap under real concurrent connections, nullable legacy rows, migration deployment tracking and strict exclusion from every public/Admin serialization. Process kill/restart runs only against the fake server/sandbox and the single fixture run. Deterministic safe-summary tests allow Task 1 adapter integration.

## Report Template

Write `docs/execution/sprint5/reports/task2.md`: actual migration/contract, approved boundary, failure matrix outcomes with upload counts, legacy policy, ignored/uncertain follow-ups, remaining remote limits, exact source/merge/deployment SHAs and authorization of any live verification. Update only own STATUS row; replace proposed SCHEMA/BUSINESS_LOGIC delta with actual implementation under integration ownership. Do not label local fake uploads as YouTube production verification.

## Definition of Done

Fault/concurrency/migration/exposure acceptance passes; no unresolved insertion path can blindly repeat; gates/metadata compatible; draft PR and report reviewable; shared integration checked with planner baseline and Task 1 adapter. Production deployment/readback and any external smoke upload are separate founder-authorized actions, explicitly pending until performed.

## Additional Notes — Git, Uncertainties and Approval

Proposed branch `SPRINT5_TASK2_BE`, one dedicated worktree from fresh integrated main; record actual ownership immediately, commit code/report/row together and open draft PR. No direct main push/merge. The main merge auto-deploys, so founder review must include migration/backup/runtime verification. No clean/reset or server `data`/`deploy.sh` changes.

Unknown: actual duplicate prevalence, current service topology and legacy remote upload outcomes. Design must be safe without assuming one process forever. New field/workflow, session-secret handling and legacy ambiguity decisions require concrete review; do not request broad authorization for public uploads. If a real provider test is needed, prepare exact run/channel/spend/visibility first and seek that separate approval. No new agent/model/settings are justified by this task.

For reviewed production rollout, inspect any already-running legacy publishers before deploying the new guard. Old workers do not obey the new receipt/epoch contract: they must be allowed to settle or handled through an explicitly approved drain/reconciliation plan. A schema-first deploy alone does not prove mixed-version upload safety. No automatic process kill/restart, visibility change or broad service pause is authorized by this specification.

## Links & References

- [Publishing boundary](../../../../studio/src/agents/publishing/index.ts), [upload types](../../../../studio/src/agents/publishing/types.ts), [publish guards](../../../../studio/src/run-pipeline/state-machine.publish-guard.test.ts), [schema](../../../../studio/src/models/schema.prisma).
- [Task 1](task1.md), [ownership and gate R](../STATUS.md), [audit R1/R6](../../../audits/2026-10-14/7AI-STUDIO-AUDIT.md).
