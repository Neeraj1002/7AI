# Sprint 5 Business Logic Delta — Task 2 Draft Implementation

Planning changed no production transition. Task 2 is now implemented on a draft branch only; the remaining task sections still describe proposed interaction boundaries. Production behavior changes only after reviewed integration and rollout.

## Reliability gate and ownership

The [status index](STATUS.md) defines gate R. Task 1 diagnostics and Task 2 publishing can start in parallel on fresh main containing merged/deployed #89; they own different Admin-reader versus publishing-writer boundaries. Tasks 3/4 implement features after R; shared integration is sequenced. Task 5 follows both. #89 already implements finite content recovery, batching/cardinality, legacy eligibility and per-call metadata; do not duplicate them. SR enhancement owns factual/scoring rules.

**Owner workflow update:** [WORKFLOW](WORKFLOW.md) is binding. Task 1 first establishes the one shared Sprint 5 root/common planning packet; other agents reuse task worktrees underneath. Baseline main includes #90's legacy hash compatibility. Each task has its own draft PR. Owner Sprint 4 test/fix/carryover closure is a separate ready-for-review gate; it changes no runtime state or retry eligibility. Integrate closure fixes/latest main, resolve conflicts and rerun affected checks before marking each PR ready.

No new top-level `PipelineRun` or `PipelineStage` enum is proposed. Existing `needs_attention`, Gate 1, Gate 2, budgets, tenant ownership and cancellation remain the outer workflow. No task makes global auto-approval mandatory or silently changes channel gate toggles.

## Task 1: diagnostic reads

Queries do not modify business state. Explicit content views still write the existing access audit before returning content. The diagnostic client permits only existing read operations/content views and fixed run IDs; it cannot retry/approve/force/resume/generate. A failed audit write returns no content. Missing metadata is typed absence, not zero. Persisted truncation is permanent evidence loss, not an excuse for generation or SQL that cannot restore it.

## Task 2: upload recovery — implemented on the draft branch

The existing channel, run-status, sanctioned-script, generated-file and Gate 2 checks remain entry preconditions. Before upload, a run-row transaction imports prior publishing IDs across attempt statuses, rejects conflicting or unverified legacy attempts, compares the approved file SHA-256/size and Gate 2/metadata identity, and claims one owner token with a revision and renewable lease. A metadata-only failure marked before any session is safe to retry. Unsupported receipt versions fail closed. The Retry API and startup/runner reach this same claim.

The provider now initiates a resumable YouTube session, encrypts and saves its URI before streaming bytes, queries the session's confirmed offset, and sends only the remaining range. A response lost after final bytes is reconciled against that same URI; a query that cannot establish the outcome parks the receipt as ambiguous. An expired owner can continue only the stored session. Heartbeat failure aborts the active request where supported. A late known video ID is recorded even if its original owner lost the lease; a failed ID write stops follow-ups and blocks a fresh insertion.

Internal phases are prepared, session_ready, uploading, uploaded, followups, complete and ambiguous. The first known ID is saved to the run receipt and stage checkpoint before R2 final copy, thumbnail or captions. R2's fixed key can be retried; interrupted thumbnail/caption starts become uncertain and are not repeated. Completion advances publishing to analytics through the existing transaction. The ten-minute stall reports active, known-upload or unresolved state instead of promising a safe retry. The run-level receipt, session and token remain absent from domain run projections and Admin structure.

This is local/draft behavior, not a production claim. A previous-version worker still running during rollout would ignore this ownership protocol; drain/reconcile it before deployment. Google may leave a final provider outcome unknowable after session expiry, so ambiguity still requires a human decision.

## Task 3: scene interpretation and timing

Application-owned scene IDs/spans preserve order and chapter membership. The model supplies a still composition for each existing slot, not moving footage. FFmpeg owns supported pan/zoom. Purpose metadata explains the visual's role without allocating extra slots. Reuse #89's count/batch/checkpoint/recovery contract.

New timing inputs include narration word-span identity and complete anchor context; matching must stay within the chapter and progress monotonically. Repeated prefixes are tested explicitly. Legacy fallback/interpolation is surfaced with provenance; it is never labelled exact alignment. Persistent mapping binds each scene ID/span to the actual image and timed interval, including moderation substitution. Changed relevant inputs invalidate incompatible plan/checkpoint/render fingerprints, not unrelated assets by default.

## Task 4: shared evidence

Writer and reviewer receive the same immutable packet version/hash, raw brief, permitted factual policy and explicitly supplied evidence. A source URL/citation without content is marked unfetched, not verified fact. New factual corrections must be reviewed at Gate 1 through the existing SR-owned rule/output path. A changed factual packet/approved script invalidates dependent outputs; Task 5 must reject visual-only repair if narration/evidence no longer match the approved baseline.

No autonomous retrieval, search agent, new model or research approval bypass is introduced. Existing SR work may integrate a separately approved retrieval policy; Task 4 adapts to its agreed packet contract rather than independently building a second verifier.

## Task 5: bounded visual repair and experiment

Only scene-specific visual defects qualify. A structured repair references existing stable IDs, baseline plan/evidence/script/voice fingerprints, changed prompt or licensed replacement asset, and reason. Reject invalid IDs, stale fingerprints, missing/corrupt assets or changed factual narration; use the existing full generation path when dependency safety cannot be established. Keep budgets, cancellation, manual/automatic limits and Gate 2 semantics; a repair is not an unlimited new retry counter.

Narration, transcript, captions, unaffected image identities and unaffected chapter segments are reused when valid. Changed scenes regenerate only their required images; affected chapter video and final mux/preview are rebuilt and technically re-reviewed. Content hash, not just a file path or nonzero size, establishes replacement identity. A repair receipt/checkpoint is durable before work continues, so restart does not lose its baseline or paid assets. No publishable approval is inherited by the variant.

The Task 5 implementation accepts at most one reviewer defect with a scene ID and timestamp that match a sampled frame in Task 3's scene map. It requires a completed long AI-stills baseline, Task 4's matching factual fingerprint, unchanged resolved voice/render/frame plan, intact approved local assets and a fresh review of that baseline. Eligible repair persists an intent in the next video-stage input and an atomic local receipt before replacement; a checkpointed replacement is validated and reused after restart. Task 3's image-byte chapter signature rebuilds only the selected chapter, then the final and preview are regenerated. If eligibility fails, the existing bounded full-generation path runs with an explicit unavailability reason in stage input. A repaired output must pass its own video review and matching Gate 2 approval before publishing; old approval paths are refused. The local synthetic trial proves mechanics, not production creative benefit or full release acceptance.

The first experiment changes one recurring-subject scene for visual continuity. Baseline and variant keep narration, script, music, timing, export profile and other visuals fixed. A paired rendered comparison plus asset/call counts determines whether improvement is supported. Technical correctness is a gate; human editorial assessment is separate. An inconclusive or worse result is a valid experiment outcome, not permission to add more modalities/models/settings.
