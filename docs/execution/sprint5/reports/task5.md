# Sprint 5 Task 5: One-scene visual repair and continuity comparison

**Date:** 2026-10-17
**Status:** Isolated implementation and synthetic mechanics trial complete; draft, not release accepted
**Worktree/branch:** `D:\Study Material\7AI-SPRINT5\task5`, `SPRINT5_TASK5_BE`
**Development base:** fetched main `5b04a7a`; own Task 1–4 integration merge `9111b821575e5ac3a74d1e023b3d21cc00b27a38`, including Task 4 `f1582ac` and Task 3 `81561e6`/wording `7c6ef3c`

## Implemented behavior

The long-form video reviewer may return one optional structured visual defect. Only a scene ID and timestamp matching a frame actually sampled from Task 3's rendered scene map can select repair. Factual, narration, timing, vague, unmapped, duplicate, moderation-substituted and unknown-scene requests do not qualify. Shorts retain their prior reviewer prompt and output path.

The preflight in `visual-repair.ts` requires a completed long AI-stills baseline and the same Task 4 evidence/approved-script fingerprint and resolved voice. It validates the stable plan/mapping IDs, prompt and frame allocation, render profile, baseline video, mixed audio, subtitles, transcript and every scene image. Paths must resolve under the run's known data area; image hashes, dimensions and decodability are checked. It writes a version-1 intent that binds the factual, plan, mapping, voice, render, timing, audio and subtitle fingerprints. An ineligible request records an actionable reason in the new stage input and follows the existing bounded full-generation path.

An eligible stage persists intent before replacement work. The optional cached still validator rejects corrupt images; new provider image files are written to a temporary sibling and renamed. The replacement's content hash is checkpointed in an atomic local receipt and in stage output. A restart reuses an accepted replacement; a refusal leaves the defect unresolved. Rendering preserves scene order, frame counts, narration, transcript, SRT, mixed audio and unaffected image identities. Task 3's image-byte chapter signature reuses unaffected chapter segments, while the selected chapter, final mux and preview are rebuilt. A changed repaired output enters a new video review/Gate 2 path; stale review or Gate 2 approval is rejected before publishing. Existing spend, cancellation, archive and attempt limits remain the controlling boundaries. No new setting, model, agent, status or database migration was added.

## Offline paired render and observed result

No suitable approved licensed production long-form continuity baseline was available in this task worktree. The controlled fixture uses FFmpeg-generated local images and fixed synthetic audio: A has a red first scene and a blue second scene; B changes only the second scene to a red composition with a white rectangle. This represents a color-continuity defect, not a person, historical era or real narration. The criteria were identity/color consistency, fit to the spoken beat, artifact/composition regression and distraction. The color continuity is visibly better in B across the cut; the new white rectangle is itself a composition change. Narration fit and production creative benefit cannot be judged from a tone-only synthetic fixture. **Creative adoption: inconclusive; defer a production-content claim.** No audience or retention claim is made.

Playable local outputs and evidence are under `studio/data/task5-comparison-final/` (ignored by Git):

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

Studio build, lint and typecheck passed. The final affected suite passed **106 tests across 12 files**, including Task 3's real FFmpeg scene render and the stale-approval guard. The final synthetic A/B and preview render used installed local FFmpeg/ffprobe, no application startup, shared database, provider or upload. The acceptance tracker cases map as follows: RPR-01–04 mechanics have local/test evidence; RPR-05 refusal has a mocked unresolved result; RPR-06 has a mocked stale-approval guard and local preview but no phone/sandbox end-to-end; RPR-07 has a synthetic inconclusive comparison; RPR-08 has mocked guard and existing cap-path evidence, without production execution. The tracker itself remains `NOT_RUN` where its specified full conditions have not been executed.

## Remaining release conditions

Merge dependency PRs #91–#94, integrate final main/Sprint 4 fixes, confirm a Task 5-only diff and rerun affected checks. Complete reliability and owner-confirmed Sprint 4 closure, full RPR-01–08 acceptance where applicable, a suitable approved long-form baseline and editorial judgment, then decide whether creative adoption is warranted. A real paid replacement, production retry, service restart, upload or deployment needs its separate concrete authorization. Keep the PR draft until those checks pass.
