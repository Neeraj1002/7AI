# Sprint 5 Task 1: Reconcile the Deployed Planner and Make Run Diagnostics Repeatable

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow (branch/commit/PR steps for this task), the `STATUS.md` update this task must make, and the section structure this file follows. This file states only this task's specifics — the template governs everything else, so don't skip it.

**Binding execution workflow:** read [WORKFLOW](../WORKFLOW.md). **This first task agent creates the one shared `D:\Study Material\7AI-SPRINT5` root**, records it and the common planning baseline, then works in its `task1` worktree underneath. Other task agents reuse that root with their own worktrees. This task has its own draft PR; mark it ready only after owner-confirmed Sprint 4 closure, latest-main integration, resolved conflicts and passing checks. These owner instructions override the template's generic per-track PR/readiness timing.

**Mandatory first action after setup:** commit all nine Sprint 5 planning documents in a separate **documentation-only first commit**, include the referenced audit Markdown if missing from main, push that baseline and open this task's draft PR. **Then proceed with Task 1.** Keep application changes in subsequent commits on the same task branch/PR. Record the real bootstrap SHA as [WORKFLOW](../WORKFLOW.md) specifies; do not commit from this shared planning checkout or include unrelated untracked files.

**Objective**: Establish the failed run's actual deployed lifecycle and expose the already-persisted evidence through a bounded, approved Admin diagnostic workflow.
**Duration**: 1–2 days; production reconciliation time depends on the existing planner release, not new paid generation.
**Depends On**: Fresh main containing merged #90 (and #89); established metadata is reusable. First establish the shared Sprint 5 root/planning packet for all agents. Task 2's safe publishing adapter follows Task 2, without blocking the planner diagnostic deliverable. PR readiness waits for the Sprint 4 closure gate.
**Owning Component**: Admin run projections, one diagnostic client and runbook. Not planner/count/retry implementation.
**Success Criteria**: (1) Evidence separates deployed revision, cap failures, count failures and retained work; (2) an authorized operator retrieves available run-scoped summaries without new manual SQL; (3) no secrets/raw failed replies or unapproved actions are exposed; (4) missing evidence has explicit reasons.
**Priority / status**: P0; not started. Planning already collected the live baseline below; reuse it and re-query only when state/release changes justify it.

## Task Requirement

### Context and user impact

The owner needs to know why recovery did not finish an eight-minute run. Diagnosing it by repeatedly inventing SQL obscures what the product already exposes. A response that hides a persisted checkpoint is different from a checkpoint that was never saved. This task makes that distinction and supplies evidence for the already-owned fix.

### Evidence and current implementation

**Verified—live, 2026-10-14:** earlier reads reported #88 then #89 with four historical attempts. The latest read reports **#90 `5b04a7a`**, production, boot **22:05:46 IST**. The run now has **attempt 5**, 22:17:22–22:28:06 IST, failed at its reported **$1.50 spend limit**, still needs-attention/video-generation and no listed bundle. This chat did not start/retry/raise its limit. Earlier attempts 1/2 hit 8,192 tokens; attempts 3/4 had normal-stop count failures (14→13 and 13→13 for 12 requested), truncated reply lengths 8,962/8,777 and approved chapter word counts 326/284/281/288. Keep these failure classes separate. [STATUS](../STATUS.md) retains each snapshot.

**Verified—repository:** [Admin routes](../../../../studio/src/api/routers/admin/runs.ts) offer `get` and audited `content`; [repository](../../../../studio/src/models/repositories/admin-runs.repository.ts) strips raw failed replies/newer fields and hardcodes profile ID null. [System info](../../../../studio/src/api/system-info.ts) exposes revision/boot with checkout-cache provenance limits. The untouched planning tree matches #88; **read-only Git-object inspection of #89** confirms strict slots, targeted correction/splitting, checkpoint carry-forward, atomic legacy eligibility and new call metadata. Its [merged decision](https://github.com/Neeraj1002/7AI/blob/b0cfa6b4969842d73d975e47b64640f18307feab/docs/decisions/long-form-planner-recovery.md) documents the contract. Preserve that code; do not diagnose the old recorded failure as failed new recovery.

**Reported:** existing planner investigation records 27 accepted scenes with matching hashes in attempts 3/4, three used manual retries and null recovery markers. Full historical reply tails are missing. #89's release report records 110 focused tests plus typecheck/build/lint passing with mocked providers/DB; those were not rerun here. Worktree reports are supporting history; canonical release is the merged commit, not copied worktree files.

**Verified—#90 source / reported tests:** [PR #90](https://github.com/Neeraj1002/7AI/pull/90) preserves original stored chapter-object property order after shape validation, instead of hashing Zod-reconstructed order. Read-only Git inspection confirms this precise legacy compatibility fix. The release reports 54 focused tests/build/lint/typecheck passing; not rerun in planning. Reuse it; no new hash/count/allowance task.

**Inferred:** the historical count error and generic correction explain earlier failed completion; #90 addressed a separate hash-order eligibility block. The fifth attempt proves the case is no longer only the earlier disabled Retry, but a budget stop does not prove complete planning/rendering or every retained asset. Historical metadata/model rationale and early SHAs remain limited.

**Proposed:** consume #89/#90 and budget recovery; extend the existing audited diagnostics/client to expose current retained work and distinct failure/eligibility/spend context. No duplicate count/hash/checkpoint/allowance implementation. No paid retry or limit increase through this task; completed video recovery remains unverified.

### R1 — Reconcile the actual release and failure lifecycle first

1. Read/setup as needed, establish the shared root/own worktree, **commit/push the complete documentation baseline first and open the Task 1 draft PR** as [WORKFLOW](../WORKFLOW.md) requires. Only then start task diagnostics/implementation. Record actual ownership/SHA; do not copy another task's application changes.
2. Query `admin.system.info` using an already-approved credential. Resolve its hash to the actual GitHub merge/source tree. Corroborate boot/build revision using existing deployment records if accessible; do not deploy or restart to obtain it. State when the endpoint's checkout fallback limits certainty.
3. Enumerate all actual attempts with timestamps, error class, internal correction result, accepted scene count/hash and usage correlation where available. Use exact approved chapter ordering. Distinguish early cap failure, later count failure, partial reuse, eligibility and ordinary cap. Do not assert “no recovery” when reuse occurred.
4. Read stored approved chapter/plan artifacts through existing content/bundle views. Before a full plan exists, a missing bundle is expected; a new artifact service is unnecessary. Confirm what could not be persisted/restored.
5. Reconcile #89/#90 and the latest budget-stopped attempt against history/reported tests. Do not implement slots, hash compatibility, allowances, checkpoints, metadata writers or cap-display fixes again. Inspect retained evidence without consuming eligibility or changing budget; missing proof is not obtained by triggering Retry.

### R2 — One small extension to the existing audited API

Add a `planner_diagnostics` kind to `admin.runs.content`, retaining the existing audit-before-return/auth/error contract. Require run UUID; select one named video-generation attempt or the latest. No new independent route, SQL language, arbitrary table selector or raw-reply access.

Proposed version-1 response:

```typescript
type PlannerDiagnostics = {
  version: 1;
  runId: string;
  attemptNumber: number;
  deployed: { commit: string | null; bootedAt: string; provenance: string };
  run: { videoKind: string | null; targetSeconds: number | null;
    profileVersionId: string | null; manualVideoRetries: number | null;
    maxCostUsd: number | null };
  failure: Record<string, string | number | boolean | null>; // fixed allowlist only
  checkpoint: { availability: string; inputHash: string | null;
    contractVersion: number | null; acceptedSceneCount: number | null;
    sceneIds: string[]; completePlanPresent: boolean };
  calls: Array<{ stageId: string; provider: string; model: string;
    inputTokens: number; outputTokens: number; costUsd: number;
    metadata: Record<string, string | number | boolean | null> }>;
  missing: Array<{ field: string; reason: string }>;
  truncated: boolean;
};
```

This is a proposed adapter shape, not a claim that every field exists for historical rows. Map the final #89 `LongPlanningCallMetadata` fields (`contractVersion`, `chapterIndex`, `sceneOffset`, `sceneCount`, `requestKind`, `requestHash`, `maxTokens`, `reusedSceneCount`, `finishReason`, `validationOutcome`, bounded validation error, recovery strategy) explicitly. Allowlisted failure keys include first/final stop/parse/length/truncation and chapter/range/version; no rawReply/firstRawReply/provider bodies. Expose existing one-use eligibility/used state as bounded booleans with provenance, never consume it. Read checkpoint keys/count/hash, not prompts/narration. Missing legacy metadata stays missing. Safe artifact flags derive only from manifest-listed files, never user-supplied paths.

Bound one attempt to at most 100 planner usage rows, 200 scene IDs, fixed string lengths and the existing 200 KiB content cap; return explicit truncation/missing reasons. Bound database queries before serializing. Use null for unknown values rather than false/zero. Audit successful and attempted content reads as the existing route does; if audit fails, no data leaves. Repair `getRunStructureForAdmin`'s hardcoded profile null using the existing selected column. Do not turn `admin.runs.get` into an unrestricted content endpoint.

### R3 — Repeatable client and operator runbook

Create a proposed `studio/scripts/inspect-run.ts` using the repository's existing TypeScript runtime and tRPC/SuperJSON wire contract. Accept an approved HTTPS base URL, UUID and optional attempt; load an existing Admin/ops credential from a local secure environment/file, never command-line token text. Default to system + structure + bounded diagnostics; require an explicit content-view choice for approved script/bundle content. No arbitrary procedure argument.

Hardcode permitted GET queries and the audited content-view POST. Reject retries, force actions, gates, cancellation, generation, redirects, non-approved host changes, path traversal and unrelated run IDs. Enforce request timeouts/byte limits and sanitizer before console/export. Default export omits full briefs, email addresses, tenant names, raw replies, headers and signed URL query strings. Surface status/truncation and preserve source timestamps/hashes. A UI tap remains the fallback if credentials are unavailable; do not create credentials or ask for pasted secrets.

### R4 — Integrate safe publication evidence later

Consume Task 2's server-only **safe summary** once it lands: phase, known-ID presence, unresolved outcome, fingerprint match, follow-up statuses and safe lease-active flag. Exclude owner token, encrypted payload/session URI and arbitrary errors. This adapter change belongs to Task 1; Task 2 must not independently edit Admin routes. Task 1 can complete its planner deliverable before this small integration; report the latter separately.

### Scope and non-goals

Includes evidence reconciliation, Admin projections, client/runbook and tests. Excludes planner/retry implementation, granting the legacy recovery allowance, modifying failed production rows, provisioning credentials, live paid recovery, new Admin UI, general SQL or diagnostic infrastructure. Manual SELECT is a last fallback for existing evidence still unavailable through an approved path; no fresh SQL ritual for each run.

### Acceptance Criteria

- [ ] First commit contains only the complete approved planning packet (plus the referenced audit Markdown if required); it is pushed in this task's draft PR before task work. Its real SHA is recorded and subsequent implementation commits are separate.
- [ ] Report identifies actual deployed/current PR revision, historical provenance limits and each attempt's distinct cause.
- [ ] Current failed run's checkpoint/hash/counter/recovery availability is obtainable through the existing API extension or explicitly marked absent/not persisted; do not mark code-complete evidence as live until authorized deployment/readback.
- [ ] First/final counts and truncation match retained evidence; missing tails/request metadata are never fabricated.
- [ ] Client produces a sanitized, bounded run-scoped bundle using existing auth and route; repeated runs require no new SQL or endpoint.
- [ ] Non-Admin forbidden, audit-failure no-content, output bounds and absence-of-secret/raw-reply tests pass.
- [ ] Existing Admin structure/content and old records remain compatible; no planner source ownership overlap.

## Schema Impact

No Prisma schema changes or migrations. Read existing run/stage/usage Json and #89's persisted metadata. No second planner metadata writer. [SCHEMA](../SCHEMA.md) records the boundary.

## Business Logic / State Transition

No pipeline transitions. Diagnostic content views have only the existing audit side effect. Unavailable auth/API/artifact does not retry or alter the run. [BUSINESS_LOGIC](../BUSINESS_LOGIC.md) specifies fail-closed reads.

## Implementation

**Existing files to own:** `studio/src/api/routers/admin/runs.ts`, `studio/src/models/repositories/admin-runs.repository.ts` (or a new audited read helper called by it), their focused tests. `studio/src/api/system-info.ts` is reuse-only unless provenance evidence proves an independently necessary change; no deploy workflow modifications here.

**Proposed new files:** `studio/src/api/planner-diagnostics.ts` (bounded contract/serializer), `studio/scripts/inspect-run.ts`, client/sanitizer tests in the established test layout, `docs/execution/sprint5/reports/task1.md` and a task-owned diagnostic runbook in that report. These are proposed locations, not existing files.

**Shared integration:** consume final planner metadata; never edit `plan-long.ts`, `state-machine.ts`, `stage-failure.ts`, manual retry or generic repository recovery writes. Task 2 owns receipt persistence; Task 1 owns only its Admin adapter. No app changes required.

## Testing

From the task's own `studio` worktree, run `npm run build`, `npm run lint`, `npm run typecheck`, then focused Vitest coverage for `src/api/routers/admin/runs.failed-content.test.ts`, `src/api/routers/admin/runs.test.ts`, `src/api/routers/admin/system.test.ts`, `src/api/admin-auth.test.ts` and new projection/client tests. DB-backed tests use only a named sandbox/test database and must not be silently counted as passed when skipped. Mock transport; assert allowlisted methods/routes, max bytes, timeout, redirect rejection, 401/403 behavior, null/old fields and all forbidden payload keys, including nested/session values.

Authorized live acceptance after implementation/deploy reads the specified run and compares safe summaries with retained baseline; no production restart/generation. A provider's missing full reply cannot be repaired by a test fixture: reconstructed fixtures must be labelled synthetic/partial. Existing planner owner supplies incident and restart test results; this task references rather than reruns/reimplements the fix.

## Report Template

Create `docs/execution/sprint5/reports/task1.md` following the main template. Include verified source/live versus reported evidence; exact calls/methods and revision; sanitizer/bounds/auth results; availability matrix; links to actual planner PR/tests; deployed versus historical provenance limits; and whether Task 2 summary integration is complete. Never include credentials/full private content. A missing access path is a specific blocked item, not a fictitious completed production diagnosis.

## Definition of Done

Acceptance passes; bounded API/client integrated; source/deployment claims labelled correctly; report and own STATUS row updated; no duplicate #89 work. Diagnostic readback is separate from code completion. Keep successful recovery of the parked run explicitly unverified unless separately authorized and observed; never make it a hidden diagnostic side effect.

## Additional Notes — Dependencies, Git and Approval

Use proposed `SPRINT5_TASK1_BE` only if not owned, from fresh `origin/main` containing #90 in the shared root's `task1` worktree. Record actual root/branch/path and docs-only baseline. Commit owned code/report/row; separate draft PR, no main push/merge. After owner closes Sprint 4, integrate its fixes/latest main in this checkout, resolve conflicts and rerun acceptance before marking this PR ready. Planning created no branch/root. Coordinate existing Admin design, not a new track.

Existing authorized read credentials may be used without asking for their plaintext. New auth infrastructure, raw-reply exposure, workflow/deployment changes or live server actions require a concrete reviewed exception; they are outside this task. Lost tails and historical SHAs remain known uncertainties. Founder review precedes merge/auto-deploy; do not touch server `data`/`deploy.sh` or unrelated worktrees.

## Links & References

- [Admin run inspector](../../../../app/app/(app)/admin/run/[id].tsx), [Admin auth](../../../../studio/src/api/admin-auth.ts), [request identity](../../../../studio/src/auth/request-identity.ts), [Admin design](../../admin/ADMIN_MODULE_DESIGN.md).
- [Bounded planner decision](../../../decisions/LONG_FORM_PLANNER_BATCHES.md), [manual eligibility](../../../../studio/src/run-pipeline/manual-retries.ts), [full-plan reuse](../../../../studio/src/run-pipeline/long-plan-checkpoint.ts).
- [Task matrix and full live baseline](../STATUS.md), [Task 2](task2.md).
