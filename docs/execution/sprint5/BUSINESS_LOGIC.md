# Sprint 5 Business Logic Delta — Proposed, Not Implemented

No production transition changed during planning. Current state-machine/status rules remain authoritative until reviewed implementations land. This page specifies interaction boundaries for the five tasks; implementation reports replace proposals with actual deltas.

## Reliability gate and ownership

The [status index](STATUS.md) defines gate R. Task 1 diagnostics and Task 2 publishing can start in parallel on fresh main containing merged/deployed #89; they own different Admin-reader versus publishing-writer boundaries. Tasks 3/4 implement features after R; shared integration is sequenced. Task 5 follows both. #89 already implements finite content recovery, batching/cardinality, legacy eligibility and per-call metadata; do not duplicate them. SR enhancement owns factual/scoring rules.

**Owner workflow update:** [WORKFLOW](WORKFLOW.md) is binding. Task 1 first establishes the one shared Sprint 5 root/common planning packet; other agents reuse task worktrees underneath. Baseline main includes #90's legacy hash compatibility. Each task has its own draft PR. Owner Sprint 4 test/fix/carryover closure is a separate ready-for-review gate; it changes no runtime state or retry eligibility. Integrate closure fixes/latest main, resolve conflicts and rerun affected checks before marking each PR ready.

No new top-level `PipelineRun` or `PipelineStage` enum is proposed. Existing `needs_attention`, Gate 1, Gate 2, budgets, tenant ownership and cancellation remain the outer workflow. No task makes global auto-approval mandatory or silently changes channel gate toggles.

## Task 1: diagnostic reads

Queries do not modify business state. Explicit content views still write the existing access audit before returning content. The diagnostic client permits only existing read operations/content views and fixed run IDs; it cannot retry/approve/force/resume/generate. A failed audit write returns no content. Missing metadata is typed absence, not zero. Persisted truncation is permanent evidence loss, not an excuse for generation or SQL that cannot restore it.

## Task 2: upload recovery

Preconditions: active channel; authorized running/retry action; a completed sanctioned script, valid completed generation and appropriate Gate 2 approval; current approved artifact/metadata fingerprints. Atomic acquisition serializes publishers at the run-level receipt. No SQL transaction spans provider I/O.

Proposed internal phases:

`prepared → session_ready → uploading → uploaded → followups → complete`.

Session URI is persisted before file bytes are sent; observed video ID is persisted immediately before R2/thumbnail/captions. Any uncertain completion or receipt-write failure routes to `ambiguous`/existing `needs_attention`; an unresolved upload cannot initiate another insertion. A prepared session that is provably never used may be replaced through the documented safe rule; a lost/expired session after possible final-byte submission is not proof of absence. Same-session status reconciliation precedes continuation. Known ID from an older failed attempt prevents re-upload.

Lease expiry grants permission to reconcile a persisted session, not to start a competing upload. A timed-out worker must stop/abort where supported and lose write ownership; its late observations still require durable reconciliation. Epoch fencing alone cannot fence YouTube's external side effect. Task 2 tests slow original calls, duplicate Retry invocations and separate worker processes. The UI/API never promises “no duplicate risk” merely because a timeout elapsed.

Completion uses the known receipt and records follow-up outcomes without re-uploading. Thumbnail/caption/R2 failure preserves current best-effort semantics; an uncertain caption insertion is recorded and not blindly repeated. Do not identify a video solely by title. Legacy uncertainty requires an explicit reconciliation decision; do not grant a broad new Admin force action.

## Task 3: scene interpretation and timing

Application-owned scene IDs/spans preserve order and chapter membership. The model supplies a still composition for each existing slot, not moving footage. FFmpeg owns supported pan/zoom. Purpose metadata explains the visual's role without allocating extra slots. Reuse #89's count/batch/checkpoint/recovery contract.

New timing inputs include narration word-span identity and complete anchor context; matching must stay within the chapter and progress monotonically. Repeated prefixes are tested explicitly. Legacy fallback/interpolation is surfaced with provenance; it is never labelled exact alignment. Persistent mapping binds each scene ID/span to the actual image and timed interval, including moderation substitution. Changed relevant inputs invalidate incompatible plan/checkpoint/render fingerprints, not unrelated assets by default.

## Task 4: shared evidence

Writer and reviewer receive the same immutable packet version/hash, raw brief, permitted factual policy and explicitly supplied evidence. A source URL/citation without content is marked unfetched, not verified fact. New factual corrections must be reviewed at Gate 1 through the existing SR-owned rule/output path. A changed factual packet/approved script invalidates dependent outputs; Task 5 must reject visual-only repair if narration/evidence no longer match the approved baseline.

No autonomous retrieval, search agent, new model or research approval bypass is introduced. Existing SR work may integrate a separately approved retrieval policy; Task 4 adapts to its agreed packet contract rather than independently building a second verifier.

## Task 5: bounded visual repair and experiment

Only scene-specific visual defects qualify. A structured repair references existing stable IDs, baseline plan/evidence/script/voice fingerprints, changed prompt or licensed replacement asset, and reason. Reject invalid IDs, stale fingerprints, missing/corrupt assets or changed factual narration; use the existing full generation path when dependency safety cannot be established. Keep budgets, cancellation, manual/automatic limits and Gate 2 semantics; a repair is not an unlimited new retry counter.

Narration, transcript, captions, unaffected image identities and unaffected chapter segments are reused when valid. Changed scenes regenerate only their required images; affected chapter video and final mux/preview are rebuilt and technically re-reviewed. Content hash, not just a file path or nonzero size, establishes replacement identity. A repair receipt/checkpoint is durable before work continues, so restart does not lose its baseline or paid assets. No publishable approval is inherited by the variant.

The first experiment changes one recurring-subject scene for visual continuity. Baseline and variant keep narration, script, music, timing, export profile and other visuals fixed. A paired rendered comparison plus asset/call counts determines whether improvement is supported. Technical correctness is a gate; human editorial assessment is separate. An inconclusive or worse result is a valid experiment outcome, not permission to add more modalities/models/settings.
