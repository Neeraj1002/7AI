# Sprint 5 Task 4: Shared factual evidence inputs

**Date:** 2026-10-16
**Status:** Implemented, integrated with current main and ready for review. Combined Sprint 4–5 acceptance follows Task 5 and is not a prerequisite.
**Branch/worktree:** `SPRINT5_TASK4_BE`, `D:\Study Material\7AI-SPRINT5\task4`
**Historical dependency base (retired; #94 retargeted to main after #91/#92/#93 merged):** `SPRINT5_TASK4_DEPS` at `d38a71a064a41bc57a74367a07c9da27fce4760e`

## Evidence and dependency reconciliation

The owner adopted [evidence-consumer v1](../SCRIPT_REVIEW_EVIDENCE_CONTRACT.md), assigned Task 4 the minimal evidence-only Script Review adapter, and explicitly authorized development before gate R. Dependencies #91/#92/#93 have merged; no gate R or Sprint 4 closure hold remains. SR-1–SR-9 scoring/rule work and any approved-excerpt producer remain separate. The [miss log](../../../review_tuning/SCRIPT_REVIEW_MISSES.md) is evaluation material, not a consumer interface. The earlier report that #93 contained only fixtures described an older head and is obsolete.

Fetched `origin/main` `5b04a7a22b31a8c6562100c72bc157beccd91e62`, #91 `cd0036a06cd7b61d2c0a4bcb8e31cc7ad1b98f9b`, #92 `b08925ecdbd87de730e0372315060107bc61150f`, and #93 `81561e6683e23d86d04fde334aeb3bf62bd8b130`. Inspected ancestry: #93 contains both dependency heads through its own base; its production wording commit is `7c6ef3c`, followed by scene/alignment/mapping commit `81561e6`. Merged #93 once into a new Task 4-only dependency worktree/branch, producing composite `d38a71a`. Typecheck passed on that base. Merged the base into existing Task 4 work without dropping Task 4 commits (`620b413`). No #91–#93 branch, PR or worktree was modified.

Five planning-file conflicts were resolved: `BUSINESS_LOGIC.md`, `SCHEMA.md` and `tasks/task3.md` took the implemented dependency version; `tasks/task4.md` retained the adopted Task 4 consumer direction; `STATUS.md` took the dependency version and updated Task 4's row. #94 was retargeted to `SPRINT5_TASK4_DEPS` and its diff inspected for Task 4-only changes.

## Implemented contract

- `content-evidence/packet.ts` builds a bounded version-1 packet from the existing run brief, effective policy and source citations. Canonical recursively sorted-key SHA-256 hashing preserves source order and original text. Parsing validates the hash and unique IDs and deep-freezes the packet. The reserved approved-excerpt shape is rejected because no authorized producer exists. Citation URLs are explicitly unfetched and supply no factual text.
- Writer and reviewer accept optional `evidence?: EvidencePacket`. Both render the same delimited factual block and reject conflicting duplicate legacy inputs before a model call. Long-form uses `brief-only`; Shorts retain the resolved policy. Existing calls without packets and the review result/schema, scoring, retry and Gate 1 behavior remain compatible. Task 3's production wording, scene contracts and mapping code were preserved.
- Generation stores the packet and provenance in stage input and a matching output reference. Retries/restarts reuse the prior stored packet, rather than current defaults. Review loads the corresponding completed generation input and checks any output reference. Pre-v1 attempts use only actually stored values and mark incomplete provenance when policy/source content is missing; no historical packet is invented.
- The exported `factualBaseline` binds evidence hash to the Gate 1 sanctioned script SHA-256; `assertVisualRepairBaseline` rejects stale evidence or script. Video-generation stage input records this optional fingerprint for Task 5, which must add its own voice, timing, asset and scene eligibility checks.

## Validation and limits

Focused packet, consumer, snapshot and stage tests covered writer/reviewer parity, effective policy, citation-only handling, tampering, conflicting duplicates, retry/restart reuse after changed defaults, legacy gaps, evidence rendered as data, stale fingerprint rejection, and old reviewer output compatibility. Mocked provider and repository fixtures were used; no paid calls or shared-data application boot occurred. The six recorded SR misses, Task 9 excerpt and synthetic controls remain labelled in `studio/src/content-evidence/fixtures/sr-pre-gate.json`; missing original context is marked.

`npm.cmd run typecheck`, `npm.cmd run build` and `npm.cmd run lint` passed in the Task 4 worktree. Focused evidence/stage tests passed (21 tests). A broader affected suite initially had two old structured-usage fixtures lacking a required stored brief; after fixture correction those two tests passed. The other 15 suites in that run passed (123 tests). 

No Prisma migration, retrieval, approved-excerpt producer, new setting, production write, publication, deployment or paid evaluation was performed. 

## Final integration (2026-10-18)

Main `3962a6b` (includes merged #91/#92/#93/#96) was integrated in `review/pr94-merge-ready`; #94 retargeted from `SPRINT5_TASK4_DEPS` to `main`. Conflicts: `STATUS.md` and `state-machine.long-planning.test.ts` (kept Task 4 version, which already asserts v4 `purpose` and `sceneMeanings`). The diff against main is Task 4 only (17 files). Task 3 wording, scene mapping and compatibility are untouched.

**Checks on this revision:** `agents`, `run-pipeline`, `storage` and `content-evidence` suites: 470 passed, 3 failed. The 3 are `quality-spec-row.test.ts` (target tolerance 60 vs 120), which fail identically on unmodified main and are outside Task 4. The real-FFmpeg `scene-render.integration.test.ts` was rerun on this revision using the existing `ffmpeg` on PATH (the default `FFMPEG_PATH`) and passed 1/1; the earlier ENOENT came from a worktree environment without that executable. Build, lint and typecheck pass. Dummy `DATABASE_URL`; no database, paid call, upload or deployment.

**Scope:** evidence-only. No SR-1–SR-9 rules, retrieval, models or settings added. **Task 5 interface:** exported `factualBaseline` (evidence hash bound to the Gate 1 sanctioned script SHA-256) and `assertVisualRepairBaseline` in `content-evidence/packet.ts`; video-generation stage input records the optional fingerprint. Task 5 must add its own voice, timing, asset and scene eligibility checks.
