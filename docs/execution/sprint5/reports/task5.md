# Sprint 5 Task 5: One-scene visual repair and continuity comparison

**Date:** 2026-10-17
**Status:** Implemented, integrated with current main (Tasks 1–4 merged) and ready for review; creative adoption inconclusive. Combined Sprint 4–5 acceptance follows and is not a prerequisite.
**Worktree/branch:** `D:\Study Material\7AI-SPRINT5\task5`, `SPRINT5_TASK5_BE`
**Development base:** fetched main `5b04a7a`; own Task 1–4 integration merge `9111b821575e5ac3a74d1e023b3d21cc00b27a38`, including Task 4 `f1582ac` and Task 3 `81561e6`/wording `7c6ef3c`
**Tested implementation commits:** `76c966b`, style-eligibility fix `0aee9e4`, recovery hardening `9b43843cda5b14e14c90f7c868e316169d903a34`, chapter-cache integrity `7f352b9265e85cab2196abb8e8c81ac8cd7f0895` (draft PR [#95](https://github.com/Neeraj1002/7AI/pull/95), base `SPRINT5_TASK5_DEPS` at `9111b82`)

## Implemented behavior

The long-form video reviewer may return one optional structured visual defect. Only a scene ID and timestamp matching a frame actually sampled from Task 3's rendered scene map can select repair. Factual, narration, timing, vague, unmapped, duplicate, moderation-substituted and unknown-scene requests do not qualify. Shorts retain their prior reviewer prompt and output path.

The preflight in `visual-repair.ts` requires a completed long AI-stills baseline and the same Task 4 evidence/approved-script fingerprint and resolved voice. It validates the stable plan/mapping IDs, original and styled prompt hashes, frame allocation, render profile, baseline video, mixed audio, subtitles, transcript and every scene image. Paths must resolve under the run's known data area; image hashes, dimensions and decodability are checked. It writes a version-1 intent that binds the factual, plan, mapping, voice, render, timing, audio and subtitle fingerprints. An ineligible request records an actionable reason in the new stage input and follows the existing bounded full-generation path.

An eligible stage persists intent before replacement work. The optional cached still validator rejects corrupt images; new provider image files are written to a temporary sibling and renamed. The replacement's content hash is checkpointed in an atomic local receipt and in stage output. A restart reuses an accepted replacement; a refusal leaves the defect unresolved. Rendering preserves scene order, frame counts, narration, transcript, SRT, mixed audio and unaffected image identities. Task 3's image-byte chapter signature reuses unaffected chapter segments, while the selected chapter, final mux and preview are rebuilt. A changed repaired output enters a new video review/Gate 2 path; stale review or Gate 2 approval is rejected before publishing. Existing spend, cancellation, archive and attempt limits remain the controlling boundaries. No new setting, model, agent, status or database migration was added.

Follow-up hardening binds baseline video and transcript byte hashes into the receipt alongside audio, subtitles, mapping and images. Immediately before replacement, the repair compares every reused file to that preflight snapshot, including images at unchanged paths. Receipt recovery now treats only a missing file as fresh intent; malformed or incompatible stored receipts fail closed. Baseline comparisons use structural equality, so JSON key order cannot suppress reuse of a valid checkpoint. Mock tests verify these failure points occur before the replacement callback.

The unchanged chapter cache is now checked before replacement: the expected segment path comes from the same Task 3 image-content/frame/profile signature used by the renderer; each segment must exist, match the expected dimensions and frame total, and decode successfully. Its byte hash is bound into the baseline receipt and checked again before and after rendering. A missing or corrupt segment makes visual-only reuse unavailable, so the existing bounded full-generation path remains the fallback. The local FFmpeg fault trial replaced a nonempty chapter with undecodable bytes, verified rejection, restored the original and completed the paired render. The unchanged chapter and A/B hashes in the table below stayed identical; no extra provider call was made.

## Offline paired render and observed result

No suitable approved licensed production long-form continuity baseline was available in this task worktree. The controlled fixture uses FFmpeg-generated local images and fixed synthetic audio: A has a red first scene and a blue second scene; B changes only the second scene to a red composition with a white rectangle. This represents a color-continuity defect, not a person, historical era or real narration. The criteria were identity/color consistency, fit to the spoken beat, artifact/composition regression and distraction. The color continuity is visibly better in B across the cut; the new white rectangle is itself a composition change. Narration fit and production creative benefit cannot be judged from a tone-only synthetic fixture. **Creative adoption: inconclusive; defer a production-content claim.** No audience or retention claim is made.

Playable local outputs and evidence are under `studio/data/task5-comparison-final2/` (ignored by Git):

- A: `synthetic-continuity/1.mp4`; B: `synthetic-continuity/2.mp4`.
- Gate 2-style local previews: `synthetic-continuity/1.preview.mp4` and `2.preview.mp4`.
- Version-1 receipt: `synthetic-continuity/work/repair-2.json`; hashes and measurements: `comparison-summary.json`.

| Measured item | A baseline | B repair |
| --- | --- | --- |
| Final SHA-256 | `15c6e25a24e61e2d4fd384b921175c774d112a06961b3902a7084d9e508bd027` | `324ec5138ab661ba2f5f275df19af5be2b7cb0252c55b7556f394346076bdfe4` |
| Preview SHA-256 | `a8691feb716124c5e717bb7f1af64ff3d48ed41c9fb64b2953422c2966e03785` | `54970b78d69da41b98255c193e68b4fb24da009faedd0fc4c56b8b982e04f837` |
| QC | H.264, yuv420p, 1920×1080, 30 fps, audio, 2 shots | Same |
| Frames | 120 | 120 |

The first chapter segment was reused with SHA-256 `5d74e44ba3396d74eece2582d308f23105d5fb7d16a1a26c56040b309f5de90f`; two different chapter-1 segment names show selected-chapter invalidation. Mixed audio SHA-256 was `3daf12c067a7e37fe306975f1f25a5ea12d6dc2e4e4bfb7aa55a926062f88478` and SRT SHA-256 `58a312d3ab928f9c1ef9c0f7ff9ae1ef6a62a4aff38c32f93a76512cc4ab6c5a` throughout. Both muxed files decoded to the same audio-stream SHA-256 `1b1bd1b49e24c25ab98b16d70b6edaeba70f6d1fa3d2d98f49022b7776690c6f`. The local replacement callback ran once; a simulated restart after checkpoint/chapter render ran it zero additional times and reproduced the same final hash. Provider calls: **0**; incremental provider cost: **$0.000000**. The fixture is 4 seconds, so it does not satisfy the production long-form minimum-duration gate; that gate was excluded from this small technical comparison.

## Checks, fault boundaries and acceptance mapping

Mocked tests cover packet/script and voice staleness, frame-count mismatch, wrong/mismatched scene ID/timestamp, missing/corrupt baseline, escaped path, receipt mismatch, provider refusal, budget/cancellation guard before replacement, cache validation/atomic write, repair routing, carried replacement after failed attempt and stale Gate 2 publish guard. The Task 3 same-path changed-image chapter-signature regression remains in the affected suite. A provider response followed by a process death before callback/checkpoint can still incur one paid call without a durable replacement receipt; no exactly-once billing is claimed.

Studio build, lint and typecheck passed, including after the final style-fingerprint check. The affected suite passed **106 tests across 12 files**, including Task 3's real FFmpeg scene render and the stale-approval guard; the final style change passed **8 focused tests across 2 files**. The final synthetic A/B and preview render used installed local FFmpeg/ffprobe, no application startup, shared database, provider or upload. The acceptance tracker cases map as follows: RPR-01–04 mechanics have local/test evidence; RPR-05 refusal has a mocked unresolved result; RPR-06 has a mocked stale-approval guard and local preview but no phone/sandbox end-to-end; RPR-07 has a synthetic inconclusive comparison; RPR-08 has mocked guard and existing cap-path evidence, without production execution. The tracker itself remains `NOT_RUN` where its specified full conditions have not been executed.

At `9b43843`, build, lint, typecheck and **98 tests across 10 affected files** passed; the isolated synthetic A/B and preview render passed again with the same artifact hashes above. These tests include corrupt-receipt rejection, baseline mutation before spend and carried-checkpoint recovery. An additional unchanged dependency test file, `quality-spec-row.test.ts`, has three failing duration assertions: it expects a 20% window while the integrated source uses the shared 10% `LONG_LENGTH_TOLERANCE`. The source and that test are unchanged from dependency base `9111b82`; this conflict needs resolution by the quality-policy owner during integration. It does not invalidate the passing Task 5 checks, but the full requested regression set is not green.

At `7f352b9`, build, lint, typecheck and **99 tests across 10 affected files** passed. The offline FFmpeg A/B render, including the corrupt nonempty chapter fault, passed; `corruptChapterRejected` is `true` in `comparison-summary.json`. Baseline, variant and unchanged-chapter hashes, frame counts, previews and zero paid-call result remained as recorded above. The unchanged `quality-spec-row.test.ts` duration mismatch remains an integration test failure.

## Final integration (2026-10-18)

Main `02b500e` (#91–#94 and #96 merged) was integrated in `review/pr95-merge-ready`; #95 retargeted from `SPRINT5_TASK5_DEPS` to `main`. Only `STATUS.md` conflicted. The diff against main is Task 5 only (17 files), consuming Task 3 scene mapping and Task 4 `factualBaseline`/`assertVisualRepairBaseline` as merged.

**Checks on this revision:** `agents`, `run-pipeline`, `storage`, `content-evidence` and `ai-visuals` suites: 509 passed, 3 failed. The 3 are `quality-spec-row.test.ts` (duration tolerance 60 vs 120), which also fail on unmodified main and in Task 3/4 verification; they are in code Task 5 does not change and need the quality-policy owner. Build, lint and typecheck pass. The suite includes Task 3 real FFmpeg scene render and the stale-approval publish guard. The synthetic A/B script (`scripts/compare-visual-repair.ts`) was rerun on this revision with local FFmpeg: baseline, variant, preview, unchanged-chapter, audio and SRT hashes are identical to those above, 120 frames each, replacement callback once, 0 after simulated restart, corrupt-chapter rejected, 0 paid calls, $0.000000. A/B result remains **synthetic and inconclusive** for creative adoption (continuity better across the cut; narration fit and production benefit not judgeable). Dummy `DATABASE_URL`; no database, provider, upload, deployment or paid call.

**RPR mapping:** RPR-01–05 and RPR-08 have mocked/local evidence listed above; RPR-06 has the mocked stale-approval guard but no phone/sandbox pass; RPR-07 is the synthetic inconclusive comparison. The tracker keeps `NOT_RUN` until founder execution on a candidate; none is claimed PASS here.

## Remaining

Combined founder Sprint 4–5 acceptance (RPR-01–08 on a deployed candidate, an approved licensed long-form baseline and editorial judgment for RPR-07). Real paid replacement, production retry, restart, upload or deployment need separate authorization. A provider response followed by process death before checkpoint can still bill one call; no exactly-once claim.
