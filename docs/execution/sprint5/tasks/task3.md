# Sprint 5 Task 3: Match Still-Scene Planning to the Renderer and Narration

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow (branch/commit/PR steps for this task), the `STATUS.md` update this task must make, and the section structure this file follows. This file states only this task's specifics — the template governs everything else, so don't skip it.

**Binding execution workflow:** read [WORKFLOW](../WORKFLOW.md). Use `task3` under Task 1's recorded shared Sprint 5 root, starting from current main including #90, and create this task's separate draft PR. Sprint 4 closure, latest-main integration/conflict resolution and passing acceptance precede ready-for-review. Preserve original dependency/ownership gates; shared root does not permit shared Git state.

**Objective**: Plan renderable still compositions and preserve an explicit, verifiable mapping from each narration span to its actual visual asset.
**Duration**: 1–2 days plus rendered mapping check.
**Depends On**: Reliability gate R; reuse Task 1's shared root/current main including #90 and its #89 baseline. Coordinate production wording with the outstanding SR owner. Task 4's evidence module can develop concurrently after R; shared integrations are sequenced. Per-task PR readiness also requires Sprint 4 closure.
**Owning Component**: Still scene/plan contract, narration alignment, video-review production assumptions. Not fixed-slot/cardinality recovery or factual-rule implementation.
**Success Criteria**: (1) still workflows no longer instruct physical video motion or unsupported providers; (2) scene purpose/span/identity are explicit; (3) repeated narration phrases and fallback mappings are visible and tested; (4) valid legacy plans remain readable; (5) actual assets can be traced to timed scenes.
**Priority / status**: P1; blocked on R and SR wording agreement; #89 release prerequisite is satisfied. Only reading/fixture preparation can start earlier.

## Task Requirement

### Evidence, inference and proposal

**Verified—repository:** [plan-long.ts](../../../../studio/src/agents/video-generation/plan-long.ts) requests moving clips, continuous physical motion, active camera work and Hunyuan/Runway prompts, although [long-form.ts](../../../../studio/src/agents/video-generation/long-form.ts) requires `ai-stills`. [long-render.ts](../../../../studio/src/agents/video-generation/long-render.ts) animates stills with index-selected pan/zoom. [Video Intelligence](../../../../studio/src/agents/video-intelligence/index.ts) describes AI stills as moving clips and uses chapter-midpoint samples; [Script Review](../../../../studio/src/agents/script-review/index.ts) also assumes continuous generated clips. The current long scene shape is `chapterIndex, words, prompt`; `locateSceneStarts` matches only the first three normalized tokens, searches forward inside the chapter and interpolates misses. A moderation-refused image may be substituted with a neighboring image in long-form assembly. Counts, anchors, frame allocation and cache reuse already exist.

**Reported:** the prior audit inspected a historical Wilma sample with visible subject-appearance changes. This is one historical artifact, not a quality verdict on the newly deployed long-form pipeline.

**Inferred:** moving-action directions can waste prompt space and produce composition instructions unsupported by an image renderer. Mechanical anchor equality does not prove the image depicts the right beat; repeated three-token prefixes/interpolated misses can obscure alignment. No corpus frequency or measured improvement from a rewritten prompt is claimed.

**Proposed:** truthful still prompts, backwards-compatible scene purpose/span/identity and a persisted mapping to actual asset/timing. Reuse the existing planner fix's application-owned slots and finite recovery; do not duplicate it. A rendered check proves mapping/contract behavior; creative adoption remains Task 5's comparison.

### R1 — Describe supported production truthfully

Revise still-specific planner and Video Intelligence wording to describe composed images plus FFmpeg pan/zoom. Still prompts specify subject/action frozen at a meaningful instant, era/place when factual context supports them, framing, relationship to narration and safe crop space. Do not instruct continuous organic motion, tracking/drone traversal, provider-generated action or motion-model names. Camera composition can be described; renderer movement remains its supported policy.

Scope historical details to the narration/actual profile; remove universal history-only requirements from generic production descriptions. Keep existing safety constraints and permitted profile style. A still reconstruction cannot imply visual documentary evidence; purpose can state reconstruction. Do not mutate historical facts, approved narration or total slots. Preserve stock workflow differences rather than forbidding real stock motion.

Script Review's production-fit paragraph must describe still capability too, but the existing SR owner owns that file/rubric. Supply a focused wording/test patch for that owner or integrate after explicit handoff; do not independently rewrite scoring, SR-1–SR-9 or factual verification. Record ownership and patch landing in the report.

### R2 — Add minimal scene intent and identity using the existing slot contract

**#89 already assigns chapter-local scene IDs and exact narration spans in application code** and assembles the old public `longScenes` shape. Reuse/extract that same computation; do not write a second slot allocator or recover counts again. Persist global identity as `chapterIndex:slotIndex` and existing spans when the public plan lacks them. Add optional, versioned meaning metadata in existing plan JSON:

```typescript
type SceneMeaning = {
  sceneId: string; // application-owned, stable within this plan
  narrationSpan: { chapterIndex: number; startWord: number; endWordExclusive: number };
  purpose: 'context' | 'illustration' | 'explanation' | 'emphasis'
    | 'transition' | 'reconstruction' | 'unspecified';
};
```

Word spans are application-owned boundaries from the approved chapter text and existing slots. They cover narration in order without overlapping/extra slots. Purpose clarifies what the visual helps the viewer understand; it is not a factual validation result or a new renderer modality. If model-supplied purpose is used, add only a short enum to each existing fixed-property slot through the final planner schema, validate it and keep old records defaulting to unspecified. Never reintroduce a variable-length array as the count authority. No new model/call, richer moving-video output or per-channel setting.

Keep old `longScenes`, `words` and flattened `stillScenePrompts` readers compatible. Validate correspondence of ordered prompts to scene IDs. A changed prompt/meaning contract must have an explicit checkpoint fingerprint/version compatibility policy: new requests use the new contract; valid legacy assets are not blindly discarded or relabelled as semantically verified.

### R3 — Bind narration alignment and actual visual identity

Use the full normalized anchor and expected script span with a monotonic alignment inside the correct chapter. Prefer a script-word-to-transcript mapping when repeated phrases need disambiguation; do not use a global first-match or silently truncate to three tokens. Preserve measured audio timing and cumulative integer frames.

Return/persist alignment provenance for each scene: exact/aligned/fallback, matched transcript indices, planned narration span, actual start/end/frame interval, asset hash/path identity and whether the image was substituted. A missing anchor or uncertain transcript match is surfaced in artifacts/review context; it is not labelled exact. Keep bounded fallback for compatible legacy runs and an actionable warning; explicit impossible chapter/ordering mappings fail rather than assign an unrelated asset. Do not introduce an arbitrary new configurable confidence threshold.

Document the moderation substitution and its source scene. Preserve the existing safe generation behavior while making substituted relevance inspectable; do not infer that a neighbor is correct just because generation succeeded. The mapping becomes Task 5's repair interface and helps a reviewer specify a stable scene ID rather than a vague chapter note.

### Scope and non-goals

No script rewriting, factual verification, whole-scene semantic planner rewrite, adaptive count/pacing engine, new modality/provider, character-reference model feature, new UI or broad review-sampling redesign. No automatic new timing based solely on an aesthetic score. New intent is minimal metadata serving mapping/repair; proof that this alone improves creativity is outside this task.

### Acceptance Criteria

- [ ] AI-still planner/reviewer production descriptions match still + pan/zoom capability; stock contracts remain compatible.
- [ ] Exactly the existing requested slots survive #89's recovery/validation contract; no count/anchor fix is reimplemented.
- [ ] Each new scene has stable ID, ordered narration span and purpose (unknown is explicit for legacy).
- [ ] Tests disambiguate repeated prefixes, punctuation, chapter boundaries, missing/transcribed words and short anchors; fallback has explicit provenance.
- [ ] Actual asset order/hash and moderation substitutions agree with persisted timed scene mapping; no scene silently borrows another ID.
- [ ] Existing legacy plan/checkpoint readers and frame totals remain compatible; changed inputs invalidate only relevant fingerprints.
- [ ] One offline rendered fixture shows named asset appearing at its mapped narration interval; technical QC passes and no creative-retention claim is made.

## Schema Impact

No Prisma migration. Add compatible metadata to existing plan/artifact JSON; default old records safely and version changed hashing/validation. [SCHEMA](../SCHEMA.md) covers ownership. Task 2 alone owns database migration; Task 3 owns the scene JSON contract consumed by Task 5.

## Business Logic / State Transition

No new pipeline statuses/gates. Correct scene mapping precedes rendering; invalid placement is actionable stage failure. Existing counts, measured narration, finite planner repair and review remain. [BUSINESS_LOGIC](../BUSINESS_LOGIC.md) defines fallback provenance and identity semantics.

### Security and operational considerations

No new route or authorization boundary. Bind mapping/assets to the current run and approved plan; never accept arbitrary filesystem paths from model output. Export scene content only through existing authenticated artifact paths; default diagnostics expose hashes/IDs, not prompts or narration. Preserve existing safety constraints, licensed fixture provenance and cancellation/budget checks. Run offline render acceptance without starting the service/resuming unrelated runs.

## Implementation

**Owned after planner release:** `studio/src/agents/video-generation/plan-long.ts` meaning/prompt additions only, `plan.ts` compatible long scene metadata, `long-render.ts` alignment/mapping, `long-form.ts` mapping integration, related tests; `studio/src/agents/video-intelligence/index.ts` still-production wording/context and prompt regression tests. Proposed new pure helper `studio/src/agents/video-generation/scene-alignment.ts` and tests can contain reusable mapping logic; avoid a second render orchestrator.

**Shared integration:** coordinate any `state-machine.ts` artifact-field wiring after Task 2; Task 4 owns evidence call sites. `script-review/index.ts` production-fit wording lands through the existing SR owner. Do not edit generic retry, provider/failure metadata or migrations. Supply a frozen scene/mapping schema to Task 5 before it starts.

Steps: verify merged planner slots; freeze compatible metadata; replace false still directions; implement full/span alignment and provenance; persist actual asset mapping; wire review context; test legacy/repeated-phrase cases; run offline render/QC; report actual boundaries.

## Testing

Run Studio build/lint/typecheck and focused `src/agents/video-generation/plan-long.test.ts`, `src/agents/video-generation/plan.test.ts`, `src/agents/video-generation/long-render.test.ts`, `src/agents/video-generation/index.test.ts`, `src/agents/video-generation/long-narration.test.ts`, `src/agents/video-intelligence/long-form-quality.test.ts`, plus new alignment/compatibility tests. These existing files were verified. Prior audit's long-form-quality prompt assertion failed; fix the production contract/meaningful expectations together, not just the asserted phrase.

Fixtures include the reported incident chapter/span counts without inventing missing response tails; repeated first-three words with different following words; repeated complete anchors at different script positions; ASR omissions; out-of-order chapter/asset IDs; substitution; legacy no-metadata plan; changed span/prompt fingerprints. Mock LLM/image calls. For a short local render, use licensed/generated-beforehand fixture images and existing narration/timing, inspect frames around actual boundaries and run existing quality measurement. No application startup, paid calls, publication or preview server restart.

## Report Template

Create `docs/execution/sprint5/reports/task3.md`: final planner prerequisite SHA/PR, production-fit ownership handoff, scene schema/version compatibility, exact/fallback statistics for fixtures, scene→asset→frame examples, rendered mapping evidence, tests and residual semantic limitations. Update only own STATUS row; coordinate BUSINESS_LOGIC delta. Mark creative improvement unproven until Task 5 compares outputs.

## Definition of Done

Acceptance and legacy/interaction tests pass; truthful still contract and inspectable mapping integrated; Task 5 receives frozen schema/examples; SR production wording patch is landed or explicitly recorded as a remaining dependency. No overlapping planner/reviewer edits, paid runs or new settings. Report/draft PR reviewable with actual merge/deploy status separated.

## Additional Notes — Git, Uncertainties and Approval

Proposed `SPRINT5_TASK3_BE`, dedicated worktree from fresh main containing #89 after R; record actual branch immediately, self-created branch commits, draft PR, founder merge. Do not use the other planner session's worktree. Source preparation is allowed before R; feature implementation is not. New provider/model/workflow/database proposals need separate evidence/review. Mechanical mapping does not certify factual depiction.

## Links & References

- [Task 9 contract/report](../../sprint4/reports/task9.md), [quality/report](../../sprint4/reports/task10.md), [render spec](../../../../studio/src/agents/video-generation/quality-spec.ts), [image generation](../../../../studio/src/ai-visuals/client.ts).
- [Task 1](task1.md), [Task 4](task4.md), [Task 5](task5.md), [ownership matrix](../STATUS.md).
