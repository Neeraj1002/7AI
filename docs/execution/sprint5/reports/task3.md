# Sprint 5 Task 3: Still-scene contract and alignment

**Date:** 2026-10-15
**Status:** Blocked on reliability gate R and Script Review wording ownership; fixture preparation only
**Branch/worktree:** `SPRINT5_TASK3_BE`, `D:\Study Material\7AI-SPRINT5\task3`

## Prerequisite and ownership record

- Started from `origin/main` at `5b04a7a` (merged #90, including #89's planner contract). Applied only Task 1's verified planning-document bootstrap `578ba530100638548a4a49af57efcb14e7962227` as local cherry-pick `0dea655`; no Task 1 or Task 2 application commit was incorporated.
- Task 1 [draft PR #91](https://github.com/Neeraj1002/7AI/pull/91) and Task 2 [draft PR #92](https://github.com/Neeraj1002/7AI/pull/92) were open and unmerged when checked. Task 2 publishing fault/concurrency checks are not integrated, so [STATUS.md](../STATUS.md)'s gate R remains closed.
- The existing Script Review owner has not handed off `script-review/index.ts` production-fit wording. No reviewer rubric, factual rule, or scoring file was edited.
- Sprint 4 owner closure, latest-main integration, and acceptance remain separate readiness gates.

## Prepared fixture

Added `studio/src/agents/video-generation/fixtures/scene-alignment-pre-gate.json`. It contains synthetic narration/transcript words for repeated three-word prefixes, repeated complete anchors, an ASR omission with punctuation, short anchors in adjacent chapters, a legacy plan without meaning metadata, and moderation substitution source/target identity. Its assertions mark uncertainty and the distinction between timed scene identity and actual borrowed asset. It contains no historical response tail, production transcript, licensed media, or invented measured timing.

The JSON parsed and each declared scene span was checked against its chapter word count. No application or rendering tests were run because feature implementation is barred until gate R opens.

## Implementation remaining after gate R

Reuse #89's slot/span computation; define compatible versioned meaning and checkpoint policy; correct still-production prompts and Video Intelligence wording; agree Script Review wording with its owner; implement chapter-local narration alignment with provenance; persist actual asset and frame mapping including substitutions; run focused, legacy, build/lint/typecheck, and offline rendered mapping/QC checks. Report fixture exact/aligned/fallback statistics and scene-to-asset/frame evidence only after those checks execute. Creative improvement remains unproven until Task 5 comparison.

**Schema changes:** None. **Production writes, paid calls, publish, deploy:** None.
