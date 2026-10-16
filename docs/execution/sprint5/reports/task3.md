# Sprint 5 Task 3: Still-scene contract and alignment

**Date:** 2026-10-16
**Status:** Implemented and locally tested on the isolated dependency composite; draft PR #93 remains open. Final main/Sprint 4 integration and release checks remain.
**Branch/worktree:** `SPRINT5_TASK3_BE`, `D:\Study Material\7AI-SPRINT5\task3`
**Draft PR:** [#93](https://github.com/Neeraj1002/7AI/pull/93)

## Authorization, ownership and tested base

The owner authorized isolated Task 3 development against #91/#92 and assigned this branch the narrow Script Review production-capability wording before Task 4's evidence adapter. This replaces the earlier pre-merge development/wording blockers; no SR-1–SR-9 scoring or factual-review rule was changed. The wording commit is **`7c6ef3c`** (`SPRINT5_TASK3_BE: Describe still-render capability truthfully`), so Task 4 can select that revision while preserving its paragraphs and tests.

The dependency composite `SPRINT5_TASK3_DEPS` is **`96d543fb5783724d442a059a61c9aede0c3fd9d4`**, from main **`5b04a7a`**, #91 **`cd0036a06cd7b61d2c0a4bcb8e31cc7ad1b98f9b`** and #92 **`b08925ecdbd87de730e0372315060107bc61150f`**. It was merged into Task 3 at `e2172f6`. Three planning-document conflicts were resolved on the composite, retaining each task's current status row. The checks below ran on this branch/composite; neither dependency PR was edited. #93 targets the dependency-only composite so its diff is Task 3 work.

## Frozen scene and mapping interface for Task 5

New long plans keep `longScenes: [{chapterIndex, words, prompt}]` and ordered `stillScenePrompts`. They add optional `sceneMeanings: {version: 1, scenes: [{sceneId, narrationSpan: {chapterIndex, startWord, endWordExclusive}, purpose}]}`. IDs are `chapterIndex:slotIndex`; IDs and nonoverlapping, covering spans come from the existing fixed-slot allocator, not model text. The model supplies only a validated purpose enum. New planner requests use contract version **4**. Valid version 2/3 fixed-slot checkpoints retain paid prompts and receive `purpose: unspecified`; legacy plans without meaning metadata remain readable. Changed narration, style, review notes, count or model invalidate the planner fingerprint; approved chapter span/anchor mismatch fails before narration or image spend.

Long renders persist `<attempt>.scene-mapping.json` in the existing small attempt bundle. Each row records scene ID, chapter, planned narration span and purpose (or null/`unspecified` for legacy), full anchor, raw/styled prompt SHA-256, alignment kind (`exact`, `aligned`, `fallback`), matched transcript word index, warning, actual seconds and cumulative frame interval, actual image path/SHA-256, source scene ID and substitution flag. This is a mapping/provenance record, **not** a claim that a borrowed or generated image is factually or semantically correct. The chapter segment cache signature now includes the actual image hash, so a changed image at the same path is rerendered.

Alignment uses a chapter-scoped script/transcript word map to disambiguate repeated full anchors, with a bounded span search for ASR omissions. Legacy anchors use full normalized text in their chapter. Unmatched scenes interpolate between known boundaries with an explicit warning; impossible chapter order, scene IDs or spans fail. The renderer retains measured narration timing, chapter boundaries, one-second spacing and cumulative integer frame allocation.

The still planner, Script Review production-fit text and Video Intelligence now describe generated still compositions with supported FFmpeg pan/zoom. Shorts retain licensed stock motion or stills. Reconstruction is described as illustration, not documentary evidence. Existing safety, JSON output, duration, scoring and factual-review constraints remain.

## Executed evidence

- Six synthetic fixture cases produced **10 exact, 1 aligned, 0 fallback** mappings in the declared valid examples. A deliberately missing legacy anchor produced an additional **fallback** with an interpolation warning. Repeated three-word prefixes and repeated complete anchors mapped to their later script positions; punctuation/ASR omission was not labelled exact. Synthetic fixtures are not production transcripts.
- Moderation-substitution test retained target `0:1`, recorded source `0:0`, shared the source file's SHA-256 and mapped frame interval `[30,270)`. A same-path image-content change invalidated the chapter render cache.
- A separate **real local FFmpeg** test rendered two synthetic 1920×1080/30 fps chapter images with local audio, joined and muxed 60 frames, inspected a frame before and after the 1.0-second chapter boundary, and confirmed the expected red/blue assets. Existing quality measurement reported H.264, yuv420p, 1920×1080, 30 fps, audio present and two shots; codec and audio-rate rows passed. The synthetic 2-second duration is deliberately below the production long-form minimum, so that duration gate was excluded from this small technical check.
- Focused planner/alignment/render/Script Review/Video Intelligence/bundle tests: **71 passed across 7 files**; remaining plan/index/narration compatibility tests: **19 passed across 3 files**. Additional post-edit planner/alignment and cache tests: **33** and **23** passed respectively. Studio build, lint and typecheck passed. All provider calls in tests were mocked; no application startup, paid call, real run retry, database write, upload, publication or deployment occurred.

## Remaining release boundary

Refresh changed #91/#92 heads if needed, then after they land integrate final main and Sprint 4 fixes, retarget #93 to main, verify its Task 3-only diff and rerun affected checks. Owner-confirmed Sprint 4 closure and final reliability/release acceptance still precede ready-for-review. Task 4 must integrate its evidence adapter after preserving the wording commit. Task 5 can consume the version-1 mapping above; a demonstrated creative or retention improvement is still unproven and belongs to Task 5's rendered comparison.

**Schema migration:** none. **Production effects:** none.
