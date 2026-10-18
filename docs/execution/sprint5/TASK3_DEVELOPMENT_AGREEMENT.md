# Task 3: Development Base and Production-Wording Ownership

**Owner-authorized:** 2026-10-16. The owner explicitly instructed this chat to “Unblock the existing Task 3 agent.” This agreement is the operative development direction for that agent and draft #93; no further adoption or unidentified Script Review owner's approval is required for its narrow scope. It resolves development sequencing and production-wording ownership. It does not certify implementation or tests, satisfy release gate R, or authorize production effects. Delivery to the existing agent is tracked separately; this document alone is not proof that a message was sent.

## Evidence and remaining work

**Verified locally:** Task 3's report records synthetic fixtures only; its scene fixture is provenance-labelled. The inspected planner still instructs moving Runway/Hunyuan-style clips even though long-form assembly uses stills. Script Review's long-form production-fit paragraph makes the same claim. Video Intelligence describes moving clips and samples chapter frames; the renderer cannot supply generated physical motion from an image. None of these facts establishes a measured improvement from a fix yet.

**Verified—GitHub, 2026-10-16:** #93 is open/draft on `SPRINT5_TASK3_BE`, head `1030aede07cf6d66e3a569458e3a52ee2a136b4e`, with planning documents, its report and synthetic scene fixtures. #91/#92 are open, heads `cd0036a06cd7b61d2c0a4bcb8e31cc7ad1b98f9b` and `b08925ecdbd87de730e0372315060107bc61150f`; #94 remains an open draft. Refresh actual revisions before development.

**Inference:** a restriction based solely on dependency merge status unnecessarily prevents isolated implementation and rendered testing. Requiring wording approval from an unidentified SR implementation introduces an ownership gap. These are planning constraints, not evidence Task 3 code is unsafe or complete.

**Development direction:** implement Task 3 first against an isolated current-main + #91/#92 dependency composite, and keep #93 draft. Task 3 owns the narrowly defined production-description wording below. Task 4 owns its evidence adapter and can develop its pure evidence module separately; integrate shared Script Review changes in the explicit order below. Full SR-1–SR-9 rules/scoring/retrieval stay separate.

## Dependency-base workflow

Use the mechanics in [the Task 4 dependency-base workflow](TASK4_DEPENDENCY_BASE.md), substituting Task 3/#93:

1. Preserve the current Task 3 branch/fixtures/report. In the shared Sprint 5 root, use its own agent-created dependency worktree/branch (proposed `task3-deps` / `SPRINT5_TASK3_DEPS`) from latest origin/main; merge the fetched #91/#92 heads into it. Do not modify dependency branches or another task checkout.
2. Record main, dependency and composite SHAs; resolve and test actual integration conflicts. Push only the Task 3 agent-owned integration base, then merge that base into its existing task branch. No reset/force-push to discard another session's work.
3. Retarget draft #93 to this dependency-only base so its changed-files view contains Task 3 work. No extra umbrella task PR. Implement code and offline acceptance against the composite, with no paid/provider/production effects.
4. If dependencies change, refresh the composite and rerun affected tests. Completion is stated against exact tested revisions, with final release integration still pending.
5. After #91/#92 land, integrate final main and Sprint 4 fixes, resolve differences, retarget #93 to main and confirm its final diff contains only Task 3. Owner-confirmed Sprint 4 closure, final reliability acceptance and task checks still precede ready-for-review. Founder merge/deployment remains separate.

This changes Task 3's pre-merge **development** permission only. Keep its existing counts/checkpoints/recovery, safety, compatibility, timing, scope and evidence requirements. Do not use an integration base as an approval to deploy unmerged publishing/schema changes or start the real application on shared data.

## Script Review production-wording agreement

Task 3 owns only the descriptions that tell Script Review what the renderer can produce, plus their focused tests. It may implement these directly in its own branch; there is no requirement to wait for an unidentified SR agent to supply a paragraph.

For the long-form `videoGenFit` paragraph, use this capability contract (equivalent precise wording is allowed):

> Production uses TTS narration, an ordered sequence of generated still images animated with supported FFmpeg pan/zoom, and an SRT subtitle artifact. Judge whether the implied visual beats can be represented by still compositions and supported transitions. Continuous physical action, generated tracking/drone movement, lip sync or motion-model footage is not supplied by this workflow. Evaluate pacing against the supplied narration and production constraints, without requiring every illustration to contain generated motion.

For Shorts, describe the supported alternatives truthfully: licensed stock footage or generated still images with supported animation, TTS and captions when enabled. Do not remove legitimate stock motion. No new visual-source setting is required; preserve actual source selection and existing duration limits.

The wording change must:

- Remove Runway/Hunyuan and generated-continuous-video claims from the still path, including analogous planner/Video Intelligence descriptions.
- Preserve safety rules, output JSON keys/types, factual-review instructions, scoring/retry thresholds, duration rules and gate behavior. Production-fit flags remain the existing fields.
- Avoid universal history-only assumptions for generic source capability, while retaining era accuracy when the approved narration calls for it.
- Distinguish a still reconstruction from documentary source evidence; technical producibility does not establish factual accuracy.
- Be tested as a meaningful production contract, not by changing an assertion solely to match old false wording.

Task 3 may isolate reusable production-description strings in a small pure helper if that reduces shared edits. It must not create a new agent/model/call or configurable production system merely to share a paragraph.

## Task 3 before Task 4 in the shared reviewer file

1. In #93, make the production-wording change a small identifiable commit with focused prompt-contract tests; record its SHA in Task 3's report. Then finish Task 3's scene identity/alignment/render work in separate commits under the same task PR.
2. Task 4's evidence module/hash/request tests can proceed independently. Its `script-review/index.ts` integration preserves Task 3's production paragraphs/helper and changes only evidence input/rendering/minimal policy adaptation. It does not rewrite the production capability contract or factual/scoring rubric.
3. To test Task 4 with completed Task 3 changes before #93 merges, the Task 4 agent updates its own dependency base to include the selected #93 revision, or explicitly stacks #94 on the appropriate Task 3 branch. Record/refresh that additional dependency and check the Task 4-only diff. Do not silently copy Task 3 code into #94 as independent Task 4 work or change #93 from another checkout.
4. If the shared file already has active evidence changes, resolve the narrow production/evidence hunk integration on the owning branches, preserving both contracts. Alignment/planner/renderer work need not wait on that file. No broad reviewer ownership or open-ended SR agreement blocks Task 3.

This planning document changes no PR or branch. The existing Task 3 agent imports the authorized direction into its own spec/report/PR scope and records the instruction. This planning chat may send that direction to the correctly identified Task 3 chat under the owner's explicit authorization; it does not take over implementation.

## Task 3 acceptance remains substantive

Finish the existing task, not just its permission change: reuse #89/#90's slots/spans and recovery; add compatible scene meaning/identity; align full anchors/script spans within the correct chapter; report exact/aligned/fallback provenance; bind actual assets/frame intervals and substitutions; retain valid legacy plans/checkpoints and relevant cache invalidation. Preserve narration and integer frame totals.

Run focused planner/alignment/render/video-review compatibility tests plus Studio build/lint/typecheck against the actual dependency composite. Use the prepared synthetic repeated-prefix/repeated-anchor/ASR/chapter/legacy/substitution fixtures as regression inputs, not as proof the implementation already works.

Perform at least one small **real local FFmpeg render** with approved existing/local synthetic assets and fixture narration/timing, inspect frames around the mapped boundaries and run existing technical QC. No application boot, paid generation, live run retry, shared database mutation or publishing. Record executed test/render results and actual failures; do not infer successful audio/timing/mapping from JSON validation or a contact sheet alone. Editorial/retention improvement remains Task 5's later comparison.

## Reporting and scope

Task 3's agent updates only its own report/branch and draft #93: instruction adopted, wording/scene interfaces, tested dependency SHAs, mapping/provenance statistics, actual render/QC evidence and remaining release conditions. No new numbered task, duplicate planner fix, SR rules project or production deployment. If the owner instead asks this planning chat to take over implementation, establish a branch/PR ownership handoff first rather than writing into another active agent's worktree.
