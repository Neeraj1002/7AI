# Sprint 5 Task 1: Planner Reconciliation and Repeatable Run Diagnostics

**Date**: 2026-10-15 (IST; work started 2026-10-14)
**Status**: Ready for review under the revised owner workflow. Production diagnostics readback and the Task 2 publishing-summary adapter remain pending; neither requires a Sprint 4 closure hold on this diagnostics PR. One combined Sprint 4–5 acceptance pass follows Task 5.
**Owner / branch**: Codex / `SPRINT5_TASK1_BE`
**Worktree**: `D:\Study Material\7AI-SPRINT5\task1`
**2026-10-18 readiness worktree / branch**: `D:\Study Material\7AI\.worktrees\pr91-merge-ready` / `review/pr91-merge-ready`; created for this session from the fetched PR head. The original task checkout was not edited. The reviewed commit is fast-forwarded to #91's existing `SPRINT5_TASK1_BE` head without rewriting history.
**Shared root / setup owner**: `D:\Study Material\7AI-SPRINT5` / this Task 1 session
**PR**: [#91](https://github.com/Neeraj1002/7AI/pull/91)
**Files created / modified after bootstrap**: 11 / 3
**Tests**: Latest readiness rerun: 107 tests passed, 16 files, zero skipped; build/lint/typecheck passed. Original 87-test evidence is retained below.

## What Was Done

Added `planner_diagnostics` to the existing audited `admin.runs.content` mutation, a bounded one-attempt repository reader and an explicit safe projection. Added a fixed-route TypeScript/SuperJSON client, executable inspector and operator runbook. Repaired the existing Admin structure projection to select and return the stored `profileVersionId`.

Preserved #89/#90's planner, hash compatibility, checkpoints, metadata writers, retry allowance and budget behavior. Eligibility inspection calls the existing validator read-only, with original persisted chapter object ordering, and never consumes eligibility. No new route, schema, migration, planner implementation, UI, credentials or production action was introduced.

## Bootstrap and Source Revision

The first commit is the documentation-only [578ba530100638548a4a49af57efcb14e7962227](https://github.com/Neeraj1002/7AI/commit/578ba530100638548a4a49af57efcb14e7962227): all nine Sprint 5 planning documents plus the referenced existing audit Markdown, absent from main. Ownership/root/path were recorded immediately. The staged list contained those ten Markdown files only. It was pushed and draft #91 opened before Task 1 diagnostics/application work began. Application/report/own-row changes are a subsequent commit in that same PR. The original shared planning checkout and its unrelated untracked files were not committed, switched or edited.

Source base and latest fetched main: `5b04a7a22b31a8c6562100c72bc157beccd91e62` (#90), including `b0cfa6b4969842d73d975e47b64640f18307feab` (#89). Tested implementation tree is based on bootstrap HEAD `578ba530100638548a4a49af57efcb14e7962227`; its resulting implementation commit is recorded in the PR after commit. Dependencies use an isolated worktree junction only after identical lockfile hashes were verified; the ignored local environment was copied without printing or changing the original.

## Verified Live Evidence and Release Provenance

Approved host: `https://7aistudio.tech`. Run: `dbf432ff-4d67-4cf7-a143-73d8c7553cc7`.

At **2026-10-14 23:13:33 IST** (`17:43:33Z`), system reported production commit `5b04a7a`, boot `2026-10-14T16:35:46.101Z` (22:05:46 IST). Attempt 5 was budget-stopped; attempt 6 was already running. This session only read state and did not start that attempt, retry, raise a limit or generate media.

At **2026-10-15 13:14:33 IST** (`07:44:33Z`), the actual new CLI read the same revision/boot. Attempt 6 had **completed video generation**; the run was **needs_attention / video_review**. A completed review stage does not establish a passing review or completed pipeline. Gate 2 approval, publishing and successful end-to-end recovery remain unverified.

The [successful #90 deployment workflow](https://github.com/Neeraj1002/7AI/actions/runs/38599321937) started at `2026-10-14T16:35:06Z`, after #90's merge and before the reported boot. The [#89 workflow](https://github.com/Neeraj1002/7AI/actions/runs/38589216108) also succeeded. These corroborate deployment, but `resolveCommit()` still prefers `GIT_COMMIT` or caches checkout HEAD on its first read. It is not immutable compiled-artifact provenance or proof of the revision of each historical attempt. System-info source was reused unchanged.

### All observed video attempts

Times below are UTC on 2026-10-14; chapter indices in diagnostics are zero-based. Historical chapter numbering below is human-readable, starting at one.

| Attempt | Start / finish UTC | Verified outcome | Available evidence / limit |
|---|---|---|---|
| 1 | 04:20:46.987 / 04:21:50.387 | Chapter 1 output cap, 8,192 tokens | No checkpoint key in structure; historical SHA unknown |
| 2 | 04:23:29.061 / 04:26:29.988 | Chapter 3 output cap, 8,192 tokens | No checkpoint key in structure; historical SHA unknown |
| 3 | 09:56:05.699 / 09:59:10.013 | Normal-stop count rejection: first 14, final 13, requested 12 | Audited failed-content view: both stops `stop`, final reply length 8,962, persisted truncation true; checkpoint/recovery keys present |
| 4 | 10:01:46.063 / 10:03:08.882 | Normal-stop count rejection: first 13, final 13, requested 12 | Both stops `stop`, final reply length 8,777, persisted truncation true; checkpoint/recovery keys present |
| 5 | 16:47:22.658 / 16:58:06.247 | Spend limit: $1.50 used of $1.50 | Structure exposes checkpoint, recovery, complete recovery-plan and still-progress keys; old failed-content projection hides their values |
| 6 | 17:21:04.976 / 17:49:32.072 | Video generation completed; downstream run needs attention at video review | Completed-stage view contains a 96-scene plan; manifest exists for attempt 6. No claim of final acceptance/publishing |

Approved Gate 1 chapter word counts were read in exact stored order: **326 / 284 / 281 / 288**. No chapters were sorted/reconstructed. The first live snapshot's planner usage timestamps correspond to **1 / 3 / 5 / 2 / 6 / 0** events in video attempts 1–6 respectively; the old structure route does not return stage IDs, so this is temporal correlation, not independently exposed row-level linkage. New diagnostics query both run ID and selected stage ID. Attempt 5's six rounded planner costs sum to $0.2306. The later structure snapshot totals **128 usage events**, two zero-cost events, approximately **$1.9598** across the run. This is booked usage, not a bill/integrity guarantee.

### Stored plan and manifest readback

At `2026-10-15T07:47:13Z`, explicit `--content production_plan --attempt 6` returned a stored **96-scene** plan summary without prompts/narration. Attempt 6's completed output does not expose the earlier checkpoint/input-hash/progress fields: those summary values remain null. That absence must not erase the independently observed keys retained on failed attempt 5.

At `2026-10-15T07:47:14Z`, explicit `--content bundle_manifest --attempt 6` returned the manifest created `2026-10-14T17:50:37.486Z`:

| Manifest-listed file | Bytes |
|---|---:|
| `transcript.json` | 97,818 |
| `plan.json` | 139,253 |
| `ffmpeg-args.json` | 1,748 |
| `script.txt` | 7,499 |

Only manifest-listed names establish these bundle file flags. No local path, storage key, signed download URL, narration or prompt was exported. Long-form bundles intentionally omit full video/audio/stills; this manifest is not a filesystem/cache-integrity inventory. Before completion, the earlier missing bundle was expected and did not prove missing persisted planning work.

### Reported and inferred evidence

The prior investigation reports 27 accepted scenes in attempts 3/4, matching hash `813c20a235e4c512828fce049e0955c87e5686ddfcc1f4c53bd0c45ea4889438`, three used manual video retries and null older recovery markers. These exact stored checkpoint/counter values remain **reported**, not returned by the deployed failed-content projection. Earlier historical model rationale, request IDs and complete raw reply tails were not generally persisted.

[PR #89](https://github.com/Neeraj1002/7AI/pull/89) supplies strict slots, targeted correction/splitting, checkpoint carry-forward, atomic one-use eligibility and per-call diagnostics. [PR #90](https://github.com/Neeraj1002/7AI/pull/90) preserves stored chapter property order after validation for legacy hash compatibility. Their release reports of 110 / 54 focused tests are **reported historical results**, not rerun here; Task 1 did not rerun or reimplement the planner owner's incident/restart tests.

Inference: historical partial reuse plus later count rejection differs from an output cap, ordinary manual cap or spend limit. Attempt 5 advanced beyond planning; attempt 6 subsequently completed generation. None of this supports saying “no recovery” or attributing old count failures to a failed new #89/#90 planner. Full run recovery remains unverified at video review.

## Exact Diagnostic Operations

All live requests used the existing approved local ops credential without printing it, HTTPS only, no redirects, 12-second request timeout and bounded response bytes. The client sends the repository's existing SuperJSON input/result envelope.

- `GET /trpc/admin.system.info`.
- `GET /trpc/admin.runs.get` with only `{ runId }` in the serialized `input` query parameter.
- `POST /trpc/admin.runs.content`: `{ runId, kind: 'planner_diagnostics', attemptNumber? }` (new, audited on this implementation).
- Explicit existing content reads: `stage_output` for Gate 1 approved content or video-generation attempts 3/4/5/6; `bundle_manifest` for this run/attempt. Only the existing normal access audit is written.

**Deployment boundary:** the live CLI's new `planner_diagnostics` POST returned **HTTP 400** against #90 because that input kind is not deployed. The CLI retained system/structure/explicit existing-content summaries, reported diagnostics unavailable and exited **2**. It did not invent metadata, silently fall back to SQL or retry an action. The rejected new kind fails old input validation before a content audit; successful/attempted existing valid content views retain their existing audit behavior. New API live readback requires separately authorized merge/deployment, then the same command; this task did not deploy.

## API Contract, Bounds and Safety

The version-1 response adds observed/source timestamps, nullable token counters, a selected-attempt envelope, existing-rule recovery booleans and stored-progress provenance to the proposed shape. Unknown complete-plan presence and legacy values are null. The current deployed revision describes the diagnostic process, not a historical attempt. No brief/input/output body or new unrestricted content was added to `admin.runs.get`.

- One run UUID; one named/latest `video_generation` attempt. Single-row lookups and a usage query scoped by **run + stage + planner agent**, ordered by timestamp/id, `take: 101` (100 returned plus truncation sentinel).
- At most 200 checkpoint keys/IDs; malformed/over-limit maps yield null accepted counts and explicit reasons. The projection does not traverse scene values; eligibility evaluation reuses the release validator internally. IDs use fixed numeric chapter/offset grammar.
- Explicit mapping of all 12 final `LongPlanningCallMetadata` fields; unknowns null. Hashes require 64 hex characters; model/provider labels at most 100 characters. Validation errors are reconstructed from safe grammar, bounded by fixed messages/counts; arbitrary Zod/provider/private text is omitted. All emitted diagnostic strings are below the 300-character ceiling.
- Every missing failure field and incomplete call metadata has an explicit reason. Persisted truncation is distinct from response truncation. First reply lengths/truncation are never inferred from missing historical raw text.
- Existing Admin authorization and **audit-before-read/return** remain. Audit failure returns the existing fixed internal error, without diagnostic content. Unknown runs and invalid parameters keep existing contracts; a valid attempted missing-attempt view is audited.
- Fixed server projection preserves safe token **counts**, unlike the generic token-name redactor. Raw replies/tails, provider bodies, prompts/narration, headers, session URIs, encrypted payloads and owner tokens are excluded. No eligibility, retry counter, budget or pipeline write is performed.
- Server content stays structured JSON under the existing 200 KiB content cap. CLI response cap is 256 KiB per operation, final export cap 200 KiB; larger exports omit named sections with explicit status, never cut JSON.

### Availability matrix

| Evidence | Current deployed #90 | Task 1 implementation | Reason / limit |
|---|---|---|---|
| Current revision/boot, all attempts/status/times | Verified live | Existing reads reused | Checkout-cache/historical revision limits remain |
| Approved chapter order/counts | Verified live through explicit audited Gate 1 view | Explicit script content mode | Private text omitted by default |
| First/final count failures and final truncation | Verified live for 3/4 | Fixed grammar/numeric fields | Lost full tails/first lengths cannot be restored |
| Failed-attempt checkpoint hash/count/version | Keys visible; exact values not exposed | Bounded read, verified in named sandbox | Production new-kind readback pending deployment |
| Complete plan | Attempt 6 stored 96-scene plan verified live | Explicit production-plan summary; diagnostic presence markers | Presence does not prove restoration or integrity |
| Attempt 5 complete-plan/progress | Persisted keys visible; values hidden | Bounded diagnostics | Not “not persisted”; readback pending deployment |
| One-use used/eligible state, manual retry count, current spend limit | Not exposed by old Admin structure | Nullable values; existing validator read-only | No allowance consumed; current state may differ from history |
| Planner metadata / tokens | #89 field names visible; values hidden | Explicit 12-field mapping and nullable token counts | Legacy metadata stays missing |
| Bundle-listed files | Attempt 6 verified live | Explicit manifest summary | No inferred assets outside manifest |
| Historical immutable revisions/full replies | Unavailable | Explicit missing reasons | No generation can recreate historical proof |
| Task 2 publishing summary | Not yet integrated | Deferred adapter | No Task 2 implementation/summary export exists on fetched main |

## Files Created/Modified

Created: `studio/src/api/planner-diagnostics.ts`, `studio/src/api/inspect-run-client.ts`, `studio/scripts/inspect-run.ts`, `studio/src/models/repositories/admin-planner-diagnostics.repository.ts`, six focused test files (projection, client, content/file loading, router, router integration and repository), and this report/runbook.

Modified: `studio/src/api/routers/admin/runs.ts`, `studio/src/models/repositories/admin-runs.repository.ts`, and only Task 1's owned Sprint 5 status/root/bootstrap details. Planner/retry/state-machine writers, system-info and deployment workflows were not changed.

## Schema Changes Applied

No new schema/migration. For testing only, created **local** `sevenai_sprint5_task1_20261015_test`, applied the repository's 22 existing migrations and ran providers as stubs/mocks. Existing dev/production databases were not used for test writes. Sandbox test fixtures clean up their rows; the named test database remains available for repeat verification. No credentials/users were provisioned.

## Test Results

Required checks from this task's own `studio`:

```text
npm run build      PASS
npm run lint       PASS (0 warnings)
npm run typecheck  PASS

Focused Vitest, named local sandbox:
Test Files  11 passed (11)
Tests       87 passed (87), 0 skipped
```

Suite includes `runs.failed-content.test.ts`, `runs.test.ts`, `admin/system.test.ts`, `admin-auth.test.ts`, `system-info.test.ts`, plus all six new projection/client/content/router/repository test files. Earlier runs without a sandbox skipped ten existing DB tests; those skips are superseded by the fully executed sandbox result above. Synthetic/partial fixtures are labelled and do not reconstruct production tails.

Coverage verifies non-Admin denial and flagged Admin acceptance; audit failure/no content in unit and real database transactions; selected/latest attempts; bounded database calls; cross-attempt/run usage exclusion; real profile ID projection; 100 calls/200 IDs/byte limits; old/null fields; every metadata field; forbidden nested payloads; approved host/method/procedure scope; redirects; timeout; HTTP 401/403 stop; old-API 400; credential-file size; explicit-only content; filename traversal/overwrite protection; and sanitized structured exports. A long-string sanitizer timeout found during verification was fixed by bounding the email pattern; the large-content regression now passes.

## 2026-10-18 Integration and Readiness Verification

Fetched main and #91 head from GitHub: main `5b04a7a22b31a8c6562100c72bc157beccd91e62`, PR implementation `cd0036a06cd7b61d2c0a4bcb8e31cc7ad1b98f9b`. Main is already an ancestor of the PR head (`git merge-base --is-ancestor` exit 0); no merge or conflict resolution was necessary. GitHub reported OPEN/draft, MERGEABLE/CLEAN, no review comments and no CI checks. This readiness commit changes documentation only. Planner/agents/state-machine, retry/recovery repositories and Prisma schema match main exactly.

The first rerun exposed a shared generated-client mismatch: the existing `node_modules` client contained #92's unmerged `publishingRecovery` field. It yielded 105 passes and two database-test failures, not an application regression. Isolated `@prisma/client` and `.prisma/client` in this worktree, regenerated from this branch's unchanged schema, and reran all checks. No shared generated client or database schema was changed. Only the existing localhost `sevenai_sprint5_task1_20261015_test` was used, with stub flags and no copied provider credentials.

Final schema-matched results on the unchanged implementation above plus this documentation update:

```text
npm.cmd run build      PASS
npm.cmd run lint       PASS (0 warnings)
npm.cmd run typecheck  PASS
Vitest                16 files passed; 107 tests passed; 0 skipped
git diff --check      PASS
```

Vitest reran the original 11-file diagnostic/Admin selection (87 tests) plus `legacy-planner-recovery`, `state-machine.long-planning`, `state-machine.plan-recovery`, `pipeline-run.repository.planner-recovery` and `pipeline-stage.repository.recovery` (20 tests). Providers remained mocked/stubbed; no service/startup/resume worker ran.

The owner removed Sprint 4 closure as a prerequisite and directed one combined Sprint 4–5 acceptance pass after Task 5. #91 is prepared for ready-for-review with the technical checks above. Remaining: post-deployment revision/boot and selected-attempt diagnostic readback using this runbook; Task 1's safe publishing-summary Admin adapter after #92 lands, explicitly nonblocking here; combined acceptance after Task 5. This session did not merge, deploy, retry production generation or change budgets.

## Operator Runbook

1. Work in `D:\Study Material\7AI-SPRINT5\task1\studio` (or the subsequently reviewed checkout). Use the existing Admin session/ops credential in secure environment `INSPECT_RUN_TOKEN` / `API_AUTH_TOKEN`, or `INSPECT_RUN_TOKEN_FILE` pointing to an existing owner-private file containing only that credential. Never paste a secret into chat or pass it as a CLI flag. The client creates no credentials. If unavailable, use the existing Admin run inspector and explicit content-view tap.
2. Default summary, latest video-generation attempt:

   ```powershell
   npx tsx scripts/inspect-run.ts --base-url https://7aistudio.tech --run dbf432ff-4d67-4cf7-a143-73d8c7553cc7
   ```

   For this local ignored environment, Node's existing env-file support was exercised without printing its values:

   ```powershell
   node --env-file=.env.local --import tsx scripts/inspect-run.ts --run dbf432ff-4d67-4cf7-a143-73d8c7553cc7 --attempt 5
   ```
3. Explicit optional views (one per invocation): `--content approved_script` reads Gate 1 approved content; `--content production_plan --attempt 6` emits only stored plan/checkpoint/progress summaries; `--content bundle_manifest --attempt 6` emits listed known filenames/types/sizes. These use the existing audited content mutation. Script mode intentionally includes sanitized approved narration; default mode never includes it. No arbitrary stage, file, procedure, run ID list or raw-reply option exists. Full bundle inspection stays in the existing UI.
4. Optional `--export run-diagnostics.json` writes the same sanitized JSON as stdout, using exclusive creation (existing files are never overwritten). Only a local basename ending `.json` is accepted; choose an owner-private current directory. POSIX mode is `0600`; Windows relies on the containing directory's ACL. Full briefs, tenant/channel names, emails, headers, raw replies and signed URL queries are omitted by default. No export is committed by this task.
5. Exit **0** means requested operations succeeded; **2** means a partial/unavailable/truncated-by-export report has explicit status; **1** means local invocation/credential/export failure. Inspect `status`, `missing`, `truncated`, `observedAt` and source timestamps/hashes. A returned null is unknown, not zero/false. An empty call list can indicate plan reuse, not “no work.” A null checkpoint on completed attempt 6 does not erase attempt 5's retained work.
6. Only `https://7aistudio.tech` is approved in this client. Host/port/path/userinfo/query/fragment changes, redirects, command-line token values and action/procedure overrides are rejected. Additional hosts require a reviewed allowlist change. The fixed operations cannot retry/force/cancel/approve/generate or change budgets. Each request has a 12-second deadline and byte cap; failures do not trigger SQL or a state transition.
7. After a separately authorized deployment of this PR, repeat the attempt-5 command to read its checkpoint/hash/counter/recovery/spend details; compare with the reported baseline, preserving the difference between source, live and reported values. Repeat latest/attempt-6 views for current state. Do not retry generation or restart production to obtain missing evidence.
8. For tests, select the existing dedicated **local** `sevenai_sprint5_task1_20261015_test` through a secure `DATABASE_URL` environment, with stub flags, then run the focused Vitest list above. Tests guard `_sandbox` / `_test` names. Do not count a skipped DB test as a pass or point them at dev/preview/production. The test run loads no pipeline startup/resume worker.

## Deviations, Remaining Work and Sign-Off

- Nullable tokens and complete-plan presence honor the task's “unknown is null” rule; the proposed response's non-null token/boolean types were not used to fabricate historical values. Source timestamps, recovery booleans/provenance and progress hints are additive. No artifact existence is inferred from user-supplied paths.
- New reader is in `admin-planner-diagnostics.repository.ts`, called only by the existing audited route. A safe explicit stored-plan summary mode also works against the older deployed content API; the default new diagnostic kind correctly reports unavailable until deployment.
- **R4 pending until #92 lands:** consume Task 2's server-only safe publishing summary through a Task 1-owned Admin adapter. No receipt/session schema was guessed or exposed. This follow-up does not block this diagnostics PR; integration remains separately tracked.
- **Production acceptance pending:** new-kind checkpoint/counter/eligibility readback after authorized deployment. Current #90 HTTP 400 is recorded, not claimed as live feature success. No production restart, retry, limit change, paid provider call, upload, deployment or merge was performed by this task.
- **Revised readiness workflow:** Sprint 4 closure is no longer a prerequisite for #91. Check current main, resolve integration conflicts and rerun affected checks before marking ready. One combined Sprint 4–5 acceptance pass follows Task 5. Founder review/merge and deployment remain separate.

Task objective: bounded planner diagnostics/client implemented and verified locally; source/live/reported evidence reconciled. Schema: unchanged application contract. Business logic: existing content audit only. Tests: passing as above. Production diagnostic deployment, Task 2 adapter and end-to-end recovered-video acceptance remain open, explicitly separated from code completion.
