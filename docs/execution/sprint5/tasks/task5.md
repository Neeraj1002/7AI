# Sprint 5 Task 5: Repair One Visual Scene Safely and Prove the Rendered Improvement

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow (branch/commit/PR steps for this task), the `STATUS.md` update this task must make, and the section structure this file follows. This file states only this task's specifics — the template governs everything else, so don't skip it.

**Binding execution workflow:** read [WORKFLOW](../WORKFLOW.md). Use `task5` under Task 1's recorded shared Sprint 5 root, current main including #90, and this task's separate draft PR. Prerequisites, owner-confirmed Sprint 4 closure, latest-main conflict resolution and acceptance must pass before ready-for-review. A carried bug is not marked fixed until the repair is verified.

**Objective**: Correct a scene-specific visual defect while preserving valid production assets, then compare one continuity repair with its rendered baseline.
**Duration**: 2–3 days after prerequisites; paid asset generation is not authorized by the specification.
**Depends On**: Tasks 3/4 stable scene/mapping and evidence fingerprints for development; their merges, reliability gate R and Sprint 4 closure remain release conditions. The owner authorized isolated Task 5 implementation on 2026-10-17 against the Task 1–4 dependency integration. Integrates last in video generation/review call sites.
**Owning Component**: Bounded visual-repair orchestration/receipt, reuse/integrity integration and one offline rendered comparison. Not generic factual verification, script repair, upload recovery or new production modalities.
**Success Criteria**: (1) only eligible named visual scenes change; (2) unaffected narration/images/chapter segments remain valid and reused; (3) restart retains repair intent/paid assets; (4) changed final/preview re-enter review/Gate 2; (5) a controlled rendered comparison documents improved, worse or inconclusive continuity with cost/reuse evidence.
**Priority / status**: P1; implemented in isolated `SPRINT5_TASK5_BE` draft work. Synthetic mechanics comparison completed; production creative acceptance and release conditions remain. This is the only creative experiment in the planned sprint.

## Task Requirement

### Evidence, inference and proposal

**Verified—repository:** Sprint 4 [Task 10 R7](../../sprint4/tasks/task10.md) proposed optional flagged-scene regeneration; [report](../../sprint4/reports/task10.md) says it was **not built**. [State machine](../../../../studio/src/run-pipeline/state-machine.ts) feeds broad `fixNotes` into replanning. [Image cache](../../../../studio/src/ai-visuals/cache.ts) hashes model/size/quality/final prompt and currently treats nonzero file size as a hit. [Long narration](../../../../studio/src/agents/video-generation/long-narration.ts) caches per chunk; [chapter rendering](../../../../studio/src/agents/video-generation/long-render.ts) hashes image paths/frames/profile and atomically renames finished chapters. [Long assembly](../../../../studio/src/agents/video-generation/long-form.ts) calls those modules and substitutes neighboring images on provider refusal. Terminal cleanup removes work caches; needs-attention generally preserves them.

**Reported/observed previously:** audit contact sheet of a historical Wilma short showed changes in recurring-subject appearance. No recent long-form continuity corpus was reviewed, and no current naturalness/retention improvement is claimed.

**Inferred:** broad replanning can change unrelated prompts and lose cache hits. Existing caches are useful building blocks, but file presence/path identity alone does not establish validity after replacement/crash. A visual-only correction can preserve narration safely when scene timing, facts, voice and export profile are unchanged.

**Proposed:** a narrow structured scene-repair path and one paired continuity comparison. The same implementation proves both cost/reliability benefit and possible creative benefit; no separate graphic or sound engine is required.

### R1 — Eligibility and minimal structured repair contract

Use Task 3's stable IDs and actual scene→span→asset map, and Task 4's evidence/approved-script fingerprint. Repair input references baseline run/attempt/plan version, script/evidence/voice/render/timing fingerprints, selected scene IDs and a visual reason. Scope is one or a bounded small set of existing scenes, never extra slots or a new full plan.

Add optional structured visual defects to the existing video-review output: scene ID, defect kind (`visual_mismatch`, `continuity`, `composition` or `artifact`), reason and required visual constraints. Resolve sampled timestamps to Task 3's map; unlocated/vague chapter notes cannot automatically identify a scene. Allow the local controlled harness to submit the same structured request explicitly; a new app screen is unnecessary for this sprint. Do not build a second reviewer or add calls/models. Changes to the existing video reviewer are sequentially owned by this task after Task 3.

Reject unknown/duplicate IDs, stale baseline, changed script/evidence/voice, uncertain factual correction, missing approved output, incompatible timing or corrupt/unverifiable assets. Return actionable reason and use the existing full generation/review path when safe reuse cannot be established. This task does not implement script/TTS/caption/factual edits; those require Gate 1 and a future full dependency contract.

### R2 — Reuse existing assets and rebuild only affected outputs

Preserve ordered plan/scene IDs, spans and duration. Change only selected scene prompts or an approved licensed replacement asset. Keep final style/model/size/quality in the existing image cache key. No reference-image/model API capability is presumed. A correction may use repeated subject/era/composition constraints already supported by the prompt; its success is measured, not guaranteed.

Record and verify image content hashes/decodability, expected dimensions and provenance. Write generated/replacement files through a temp file plus atomic rename before accepting a cache entry; empty/truncated/corrupt files are misses. Introduce only integrity checks needed for this path, not a new universal storage/billing platform. Bind chapter signatures to image content identity as well as frame/profile dependency; replacing content at the same path must invalidate the affected chapter.

Reuse narration/transcript/SRT/mixed audio when their verified fingerprints match; affected chapter video and final mux/preview are rebuilt. Unaffected chapter segment identities remain unchanged. Frame totals, chapter boundaries and subtitle timing stay fixed. A moderation refusal cannot silently count as successful repair: record substitution and leave defect unresolved or escalate; never claim a repaired scene merely because a neighboring image renders.

### R3 — Durable intent, cost, limits and review

Persist repair intent/baseline fingerprints/selected IDs/status before any paid image call. Checkpoint accepted replacements and their asset hashes after safe writes so restart resumes missing repair work instead of recomputing a plan. Book returned paid calls through existing metering hooks; cached work costs zero new provider calls. Document the unavoidable crash window after provider response before durable recording, without claiming exactly-once billing.

Use existing before-call weekly/per-run budget guards, cancellation/archive checks and manual/automatic regeneration limits. Repair is part of an existing revision attempt, not a fresh unlimited retry allowance. Do not edit generic retry-cap policy or the planner's legacy allowance. No silent budget increase/configuration toggle. If caches are absent after terminal cleanup, reject reuse and state the reason; do not delete baseline files to force a test.

Measure the completed repaired file using existing QC, recreate preview/subtitles references as needed, then use the existing video-review/Gate 2 path. Previous approval cannot approve the changed video automatically. Preserve current configured gate semantics; no bypass. Publishing remains Task 2's receipt boundary, and no publication is part of this task's experiment.

### R4 — One controlled rendered continuity experiment

Choose a previously approved, licensed local baseline with a recurring subject and a documented scene-level continuity defect. Prefer an existing long-form fixture because the repair path is long-form; the historical Wilma short illustrates a possible problem but does not prove this long-form path works. If no suitable real baseline exists, run a clearly labelled synthetic continuity fixture to validate mechanics; creative benefit on production content remains pending.

Freeze script/evidence, narration/transcript/audio mix, all timing/frames, export profile and unaffected assets. Produce baseline A and variant B changing exactly one selected scene's continuity prompt/asset through the repair contract. Use approved already-generated/locally available assets and mocked provider by default. Real generation requires separate bounded spend/run approval; never create a paid “baseline” just to have something to compare.

Render complete comparable clips/files, inspect the changed interval with surrounding cuts and listen to the fixed audio. Provide playable A/B files/contact sheets, technical metrics, exact artifact hashes, call counts/cache hits, actual incremental cost and variant's repair receipt. Randomize/hide A/B labels for editorial scoring where practical; note if reviewer knows the variant. One founder/editor may judge; do not imply statistical audience proof from one evaluator.

Proposed editorial criteria (freeze before viewing): recurring-subject identity/era consistency, fit to the spoken beat, visible artifact/composition regressions and perceived distraction. Adoption requires no factual/technical regression, a clearly better continuity judgment on the changed span, and verified preservation of unaffected production assets. Worse/inconclusive comparison is a valid result: report it and defer expanding to graphics, SFX, adaptive pacing or new models. No retention uplift claim without actual audience data.

### Scope and non-goals

Visual-only repair plus the single continuity trial. Excludes broad component dependency engine, script/audio repair, maps/graphics/SFX production, automated learning, new model/reference workflow, new profile/category setting, app/native changes, full-cache redesign or paid/public experiments. Task 4/existing SR own factual validation; Task 2 owns upload identity; Task 3 owns scene identity/timing contract.

### Acceptance Criteria

- [ ] Structured visual defects resolve to stable baseline scene IDs; vague/unmapped or factual defects cannot automatically repair.
- [ ] Only selected prompt/asset changes; valid unchanged images, narration/transcript/SRT/audio and unaffected chapter segments are reused with hash/call evidence.
- [ ] Same-path changed bytes invalidate affected renders; corrupted/incomplete cached images are rejected; safe completed files survive restart.
- [ ] Stale evidence/script/voice/timing baseline rejects visual-only repair; moderation substitution is explicit and does not falsely clear the defect.
- [ ] Restart after intent/replacement/render boundaries resumes missing work with existing budgets/cancellation/caps; no duplicate whole-plan generation.
- [ ] Repaired final/preview pass existing technical QC and re-enter review/Gate 2; no approval/publication bypass.
- [ ] One controlled rendered A/B has frozen inputs, actual artifacts, editorial outcome, cost/reuse measures and honest limitations; negative/inconclusive outcome is permitted.

## Schema Impact

No Prisma migration. Versioned bounded repair receipt/fingerprints in existing video-stage Json and local work artifact manifest. Keep payload bounds and legacy optional fields; do not add a new top-level status or task-wide image/source table. Task 2's server-internal receipt stays separate. See [SCHEMA](../SCHEMA.md).

## Business Logic / State Transition

See [BUSINESS_LOGIC](../BUSINESS_LOGIC.md): eligible visual-only revision preserves baseline dependencies; uncertain/changed narration falls back to existing regeneration/Gate 1 as appropriate. Review/Gate 2 sees the new rendered output, not stale approval. Existing regeneration and spend caps still apply. Intent/assets are checkpointed; publishing is never called by the comparison harness.

### Security and operational considerations

Repair intent stays run/tenant scoped through existing authorized revision paths; the offline harness adds no production endpoint. Resolve asset paths from the validated baseline/known work directory, never model-supplied or arbitrary external paths. Preserve licensed provenance and authenticated artifact access. Keep prompts/evidence/private media out of default diagnostic exports. Local crash tests isolate the fixture process/database and never restart the preview service or awaken unrelated runs.

## Implementation

**Proposed new files:** `studio/src/run-pipeline/visual-repair.ts` plus focused tests; a pure repair receipt/eligibility helper; `studio/scripts/compare-visual-repair.ts` for isolated local artifacts. Keep scripts disconnected from service startup/background resumption and production credentials.

**Owned integration after prerequisites:** long visual generation/assembly and chapter reuse in `studio/src/agents/video-generation/long-form.ts`, `long-render.ts`; required atomic writes/integrity in `studio/src/ai-visuals/client.ts`/`cache.ts`; existing video-review structured defect schema after Task 3; narrow revision/repair slices in `state-machine.ts` and stage JSON. Do not reallocate scenes or independently modify the fixed-slot planner, factual reviewer, schema, generic retries or upload recovery. Task 4 exports evidence fingerprint; Task 3 exports stable scene mapping; consume those once.

Detailed steps: freeze baseline/repair interface; eligibility tests; derive affected outputs; validate/cache replacements; durable intent and metering/restart integration; rebuild affected chapter/final/preview; technical+human review; run one paired experiment; report whether adoption is supported. Document integration with existing generation fallback before routing any actual review failure to repair.

## Testing

Run Studio build/lint/typecheck and existing `src/agents/video-generation/long-render.test.ts`, `src/agents/video-generation/long-narration.test.ts`, `src/ai-visuals/client.test.ts`, `src/ai-visuals/cache.test.ts`, `src/run-pipeline/state-machine.plan-recovery.test.ts`, `src/run-pipeline/state-machine.video-fallback.test.ts`, video quality tests and new repair/cost/restart cases. These existing paths were verified. New tests assert call counts/hashes, not only output shape.

Use mock image/LLM/TTS providers, real local FFmpeg for a small fixture and a named sandbox only for persistence tests. Cover one changed scene, multiple unchanged chapters, same-path changed asset, corrupt cache, metadata/file crash, missing terminal cache, wrong scene ID, mismatched evidence/voice, cancelled/archive/budget stop, provider refusal/substitution, restart after receipt/asset/chapter writes and invalidated preview/QC. Use the integrated Task 3 mapping and Task 4 fingerprint in interaction tests. No paid calls, live uploads or full application resume loop.

Rendered acceptance records exact ffprobe/QC results, narration/visual alignment, A/B paths and editorial outcome. A contact sheet alone cannot establish timing, audio or final edit quality; inspect the rendered span/video. Baseline/variant files are task outputs in the implementation worktree, not production replacements.

## Report Template

Create `docs/execution/sprint5/reports/task5.md`: eligibility/repair schema, actual baseline provenance, unchanged/changed dependency hashes, call/cache/spend table, fault/restart results, technical QC, playable A/B artifacts, editorial scores/comments, adoption/defer decision and residual production evidence gaps. Update own STATUS row and actual logic delta through integration owner. A completed experiment is not a confirmed audience improvement or deployment.

## Definition of Done

Safe repair path and interaction tests integrated; valid asset preservation shown; one rendered comparison completed with a documented positive/negative/inconclusive outcome; no silent new settings/models/agents or paid/public side effects. If only a synthetic baseline is available, mark mechanics verified and production creative benefit still pending rather than declaring complete creative proof.

## Additional Notes — Git, Uncertainties and Approval

Actual `SPRINT5_TASK5_BE`, worktree `D:\Study Material\7AI-SPRINT5\task5`, began from fetched main and merged completed Task 1–4 draft revisions into its own branch for development. Draft PR targets an isolated dependency base so its diff is Task 5-only. Do not alter other agents' scratch/worktrees or server untracked files. Founder merge/auto-deployment remains a separate boundary.

Unknown: suitable current baseline, current asset integrity, practical recurrence of continuity defects and actual editorial benefit. The offline experiment may proceed under ordinary task authorization once dependencies land; new paid replacement, production retry, service restart or public upload requires a concrete run/channel/spend/visibility approval. No model/API migration belongs here. Retain valid assets safely; if safety cannot be proven, report why reuse is unavailable.

## Links & References

- [Scene map prerequisite](task3.md), [evidence prerequisite](task4.md), [reliability gate/ownership](../STATUS.md), [existing preview](../../../../studio/src/long-form/preview.ts), [QC](../../../../studio/src/agents/video-intelligence/quality-metrics.ts).
- [Historic measured render report](../../sprint4/reports/task8.md), [actual image cache boundary](../../../../studio/src/ai-visuals/client.ts), [audit continuity/reuse findings](../../../audits/2026-10-14/7AI-STUDIO-AUDIT.md).
