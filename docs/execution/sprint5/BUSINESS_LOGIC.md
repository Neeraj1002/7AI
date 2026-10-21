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


## Task 8: acceptance-run fixes (backend)

**Preflight (before spend).** `preflightGate` runs at the start of intake, before video generation and before publishing. A failed check parks the run in Needs attention with a plain message naming the setting, writes **no stage row** (so the attempt count and the two regenerations are untouched), and records `creationOptions.preflightBlock`. A Retry that passes clears it; a Retry after a block is free of the manual retry limit. `PREFLIGHT_DISABLED=1` turns it off (tests, stubbed dry runs).

| Check | Stage(s) | Setting to change | Where it was validated before |
|---|---|---|---|
| Voice is known and its speech model accepts it | intake, video generation | Voice | at run create (name only), then the provider's 400 after money was spent (E1) |
| Anthropic and OpenAI accept a paid call (1-token / 1-character probe, cached 10 min on success) | intake (Anthropic), video generation (OpenAI, Anthropic) | Provider account limit or API key | never; found at review (E4) |
| The chosen music mood exists and has licensed tracks present on disk (the bed loops, so a short track is not an error) | video generation | Music | at the first ffmpeg step |
| YouTube is connected and not flagged for reconnect | intake, publishing | YouTube connection | at upload |
| The next step fits the per-video spend limit | intake, video generation (long-form) | Spend limit | after the call that passed it |
| Scene plan against the shot-length limit | inside video generation, before pictures (R3) | none: repaired automatically | after the render, at Video Review |

**Error classes.** `provider_capacity` (workspace limit, 400 "credit balance is too low", OpenAI `insufficient_quota`), `rate_limit_exhausted`, `provider_auth` (401/403), `spend_limit` (our own limit), transient network (retried), and content or quality failures. The first four leave a `recovery` record on the failed stage with the provider's own message; the run waits in Needs attention, keeps everything made so far, uses no regeneration, and Retry reruns only the blocked step (for Video Review: the review of the existing file). Only content and quality failures count as a failed review and may regenerate.

**Retry allowance (D1).** Automatic regeneration may spend up to 2 x the estimate (`creationOptions.retryAllowanceUsd`; default spend limit is the allowance rounded up to $0.50). When a failed review would start another attempt and the spend has reached the allowance, the run pauses ("Automatic retry allowance used: ...") instead; Retry lifts the allowance to the spend limit. The spend limit itself is checked before a picture that would pass it.

**Review failure does not rebuild the video.** The scene timeline is built from the plan and the narration timing before any picture; scenes over the shot limit are retimed (free) and a chapter with too few scenes gets exactly the missing scenes. A Video Review failure with reason code `shot_length` or `narration_gap` reuses the previous plan, so every picture and narration chunk comes from the run's cache. Other failures plan again as before.

**Pictures.** Every picture prompt carries the no-marks rule (no text, logos, brand names, invented figures, branded packaging, or unstated decay imagery) unless the brief itself asks for logos or on-screen text. Each picture is checked once before the render on the cheap vision tier (about $0.012 per 2-minute video); a failing picture is made again once, a second failure is flagged (`flaggedStills`) for Video Review and Gate 2, never looped on.

**Attempt outcomes and cost.** `runs.get` returns `stageSummaries` (outcome, reason, cost per stage row), `videoAttempts` (per video attempt: `completed`, `failed_review` with reason code and text, `blocked`, `failed_error`, `cancelled`, `running`) and `cost` (`attemptsUsd + otherStagesUsd + unattributedUsd = spentUsd`).

**Length.** The script word count is planned from the narrating voice's measured pace (latest finished video with that voice; 155 words per minute without one). `forecastLength` judges the approved text against the target (10% tolerance, floor 80%).

**Publishing metadata.** Figures in the generated title, description and tags must appear in the approved script or the brief, and a figure the script hedges keeps a hedge; one regeneration, then the publish is held back.

**Changing settings while a run waits (R13).** `runs.updateSettings` is allowed in Needs attention and at either gate. Voice, music and pictures can change until the video is made; after that the server refuses with the way forward (Revise at Gate 2). YouTube visibility can change until the video is on YouTube (only private when Gate 2 is off); max spend always, through the same rule as Retry. The new options are validated with run creation's messages and the preflight, then written once, together with the Retry when asked. Visibility lives in `creationOptions.privacyStatus` (Gate 2 writes its own choice there); every change is kept in `creationOptions.settingsChanges`.
