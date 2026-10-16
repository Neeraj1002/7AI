# Sprint 5 Task 4: Supply Identical Factual Evidence to Writer and Reviewer

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow (branch/commit/PR steps for this task), the `STATUS.md` update this task must make, and the section structure this file follows. This file states only this task's specifics — the template governs everything else, so don't skip it.

**Binding execution workflow:** read [WORKFLOW](../WORKFLOW.md). Use `task4` under Task 1's recorded shared Sprint 5 root, current main including #90, and this task's separate draft PR. Keep draft until owner-confirmed Sprint 4 closure and latest-main conflict/acceptance checks pass. Any carried reviewer item retains its existing ownership; do not duplicate it to close Sprint 4.

**Objective**: Give script generation and the existing reviewer enhancement one immutable factual-input packet, preserving policy and provenance through retries and approval.
**Duration**: 1–2 days after gate R; SR rule implementation is separate outstanding work.
**Depends On**: Reliability gate R for feature implementation. The owner supplied and adopted the minimal evidence-consumer v1 direction on 2026-10-16; SR-1–SR-9 rule work remains separate. Task 3's separate modules can develop concurrently; sequence shared state-machine edits afterward.
**Owning Component**: Evidence preparation/snapshot, shared evidence rendering, writer inputs, a minimal evidence-only Script Review adapter, script generation/review call-site plumbing and packet parity tests. The separate SR enhancement retains reviewer rules, factual verdict rubric and any separately approved retrieval work.
**Success Criteria**: (1) writer/reviewer receive the same packet/hash for both video types; (2) source URLs alone are clearly unfetched; (3) existing factual policy and approved corrections are preserved; (4) regression cases measure the outstanding reviewer against the shared evidence without building another verifier.
**Priority / status**: P1; consumer v1 direction adopted, feature implementation blocked on R. The separate SR rule enhancement remains outstanding.

## Task Requirement

### Evidence and duplication boundary

**Verified—repository:** [generateScript/buildUserMessage](../../../../studio/src/agents/script-generation/index.ts) accepts `sources` but appends them only for long-form. [ReviewScriptParams/buildUserMessage](../../../../studio/src/agents/script-review/index.ts) receives raw brief but no sources or fact policy. [State machine](../../../../studio/src/run-pipeline/state-machine.ts) already loads profile/raw brief and persists stage inputs. [CreationOptionsSchema](../../../../studio/src/types/pipeline.types.ts) holds explicit sources; [Gate 1 API](../../../../studio/src/api/routers/runs.ts) exposes concerns/sources. The current reviewer explicitly calls itself a plausibility check and [LLM client](../../../../studio/src/llm/client.ts) has no retrieval tools.

**Reported:** Sprint 4 Task 9's real run added facts beyond the brief and received 8/10 without concerns. [Six-case miss log](../../../review_tuning/SCRIPT_REVIEW_MISSES.md) supplies SR-1–SR-9 examples. [Pending lane D](../../sprint4/PENDING.md) is existing outstanding reviewer enhancement; [Task 10](../../sprint4/tasks/task10.md) excludes those rules. Owner reports that enhancement as the only undeployed Sprint 4 item. No separate enhancement spec/report or open PR was found during planning; absence of those records is not proof no private work exists.

**Inferred:** a reviewer with different evidence cannot reliably determine whether a claim was permitted by the writer's inputs. A displayed URL is not fetched source text. Identical inputs are necessary for grounding but do not by themselves make a reviewer accurate.

**Proposed:** one minimal evidence packet and parity/invalidation contract. The existing SR enhancement owns rule tuning, claim concerns, scoring calibration and factual evaluation. Do not create another fact-check agent, retrieval service or SR-1–SR-9 task.

### R1 — Reconcile outstanding factual work before implementation

The owner supplied the additive evidence-consumer v1 direction on 2026-10-16: Task 4 owns the minimal evidence-only adapter in `script-review/index.ts` after gate R, while SR-1–SR-9 rules, scoring and accuracy evaluation remain the separate outstanding enhancement. Recheck active branches/files before editing; if new SR work overlaps the adapter, coordinate the small patch and reuse any implemented parity. The miss log owns examples/rules, not a TypeScript interface or an identified implementation branch. Record the actual owner/reuse boundary in this task's report.

The recorded Sprint 4 Task 9 decision is founder-supplied facts with no pipeline web search. Do not override it because a search-grounded pass appears in an older wish list. Retrieval, if separately authorized in existing SR work, must supply the same approved excerpts to both consumers and preserve provenance. This task introduces no retrieval permission or provider setting.

### R2 — Freeze one bounded evidence packet

Proposed module `studio/src/content-evidence/packet.ts` contains a pure, versioned schema/builder:

```typescript
type EvidencePacket = {
  version: 1;
  briefText: string;
  factPolicy: 'brief-only' | 'brief-plus-common';
  sources: Array<{ id: string; citation: string;
    status: 'citation-only' | 'approved-excerpt'; excerpt?: string }>;
  hash: string; // canonical content/policy/provenance, no timestamps
};
```

Build from already-approved run inputs; do not silently convert fetched material, model claims or arbitrary URLs into approved excerpts. Default existing `sources` strings to citation-only, explicitly unfetched. For the current product, brief is the factual text available. The approved-excerpt union branch is unavailable for this sprint's existing producer; enable it only if a separately approved producer is identified. Do not add a UI/settings surface.

Honor long-form's existing facts-only restriction and Shorts' resolved fact policy; both consumers receive the same *effective* policy, not conflicting long prompt/default policy labels. Keep meaningful hedges, units, conversions, required terms and disputed attribution intact. Source instructions are untrusted evidence, not commands. Bound existing input lengths/entries using current API limits; any extra excerpt limit is an internal testable bound agreed with the consumer, not a new exposed setting. Canonical serialization uses fixed, recursively stable object-key ordering, preserves source array order and original brief/citation text, and hashes version/content/policy/provenance without `hash` or timestamps. Recompute and validate locally before either paid call; model-echoed hashes are never trusted. A content hash represents equality of inputs, not truth.

### R2a — Adopted minimal consumer v1

Add optional `evidence?: EvidencePacket` to both `GenerateScriptParams` and `ReviewScriptParams`. Do not add parallel `sources` or `factPolicy` fields to the reviewer. When evidence exists, its brief, effective policy and source provenance are authoritative for both calls. Existing optional writer arguments may be absent or match; conflicting duplicates fail validation before a paid call. Without evidence, legacy call behavior stays intact and orchestration labels missing provenance rather than certifying it.

Use one shared evidence-to-prompt renderer so the writer and reviewer receive an identical, delimited factual block containing the packet version/hash, original brief text, effective policy, source order and availability. Treat that block as untrusted data. Facts-only permits no added detail beyond supplied permitted text; `brief-plus-common` retains the selected common-knowledge policy without claiming independent verification. A citation-only URL contains no fetched factual text. Keep task-specific script, style, length and review instructions outside the shared block. Make only the minimum factual-context wording changes needed to remove contradictions; leave SR-1–SR-9 rules, scoring, thresholds and production-fit rewriting to their existing owners.

Keep `ScriptReviewOutputSchema` and `reviewScript`'s `{ output, llm }` result compatible. No model-returned hash, provenance or claim-verification fields are required. Generation/review stage inputs carry the application-built packet; outputs may carry optional `evidenceRef: { version: 1, hash: string }`. Review loads the packet from the corresponding completed generation attempt's stored input and checks any output reference for agreement. Parse old records compatibly.

### R3 — Snapshot and consume through retries/review

Store/reuse the packet version/hash in existing generation/review stage input/output Json. Use the exact same canonical packet for both calls, including Shorts. Preserve old runs without packet metadata via a labelled legacy reconstruction from their actually stored generation inputs; do not substitute the channel's new active profile into the original factual snapshot. If historical effective policy/source content is missing, record it, not a fake verified packet.

Writer message uses the packet's available factual text and policy; reviewer input receives identical content via the agreed consumer interface. Existing Gate 1 concerns/source display remains the user-facing path; avoid a second generic warning block or a new product flow. Never hide uncertainty by declaring every linked claim verified.

On regeneration, unchanged evidence keeps its hash; changed approved brief/policy/excerpt yields a new hash and invalidates dependent script/review results. Corrections that change factual narration require existing Gate 1 review/approval, then downstream invalidation. Pure visual repair cannot reuse approvals after factual/script changes; export this fingerprint/eligibility check to Task 5. Existing profile/resolved-config, budgets, finite retries and tenant controls remain.

### R4 — Evaluate shared evidence with the existing SR enhancement

Prepare a labelled fixture set from the six recorded misses and Task 9's reported inventions, preserving authentic available excerpts and marking unavailable claims rather than researching new historical facts in this task. Include supported control passages, hedge-drop, invented vivid detail, monetary-convention wording, required-term omission, source-only URL and malicious evidence instructions.

Parity tests assert both consumer requests carry identical packet/version/effective policy. The separate SR enhancement owns rule/output acceptance: unsupported claims/hedge changes, score calibration and supported-control false positives are evaluated under its own rubric. Task 4 unit tests establish packet/request parity and compatibility, not the model's factual accuracy. Model evaluation is non-deterministic and reported separately from unit tests; an approved bounded live evaluation is optional and requires explicit spend authorization. Do not claim a stub can demonstrate factual accuracy.

### Scope and non-goals

Includes packet parity, policy/provenance, snapshot/retry integration and reusable evaluation fixtures. Excludes writing SR-1–SR-9 twice, independent claim extraction/retrieval/verifier, new model/agent/settings, edits to historical production scripts, research facts not supplied, new source tables, full script/audio repair engine or new Gate 1 UI.

### Acceptance Criteria

- [ ] Owner-adopted consumer v1 is implemented after gate R; current SR work is rechecked and overlapping parity is reused.
- [ ] Shorts and long writer/reviewer receive identical immutable packet/effective policy/hash; source-only URLs are unfetched.
- [ ] Retry/restart/legacy behavior preserves actual inputs and flags unreconstructable history; no active-profile substitution.
- [ ] Evidence changes invalidate affected script/review/downstream eligibility; pure visual repair rejects stale factual baseline.
- [ ] Six-case/Task 9 fixtures and supported controls are available to the existing SR owner with provenance and measurable outputs.
- [ ] No extra verifier/search/setting/UI or paid call is introduced implicitly; tenant/content exposure stays scoped.
- [ ] Existing reviewer output/result/thresholds and packet-absent legacy calls remain compatible; the separate SR rule/accuracy enhancement is reported as outstanding when unfinished.

## Schema Impact

No Prisma migration. Versioned packet/hash in existing stage Json only; no new sources table/creation setting. [SCHEMA](../SCHEMA.md) and the adopted consumer v1 contract control additive fields. Sensitive factual inputs remain within existing authenticated run content.

## Business Logic / State Transition

No new statuses or extra gate. Shared evidence enters existing generation/review; factual changes return through Gate 1 and invalidate downstream results. Unknown/unfetched evidence is explicit. [BUSINESS_LOGIC](../BUSINESS_LOGIC.md) supplies Task 5's baseline restriction.

### Security and operational considerations

The packet contains tenant content. Keep it in existing authenticated run/stage storage; default logs/diagnostics contain only version/hash/availability, not brief text, private citations or source-query secrets. No network fetching is added. Treat evidence instructions as untrusted data and test injection resistance at the input-contract level. Existing run/gate tenant authorization remains; no cross-tenant reusable packet cache. Sandbox tests use no production credentials or global startup.

## Implementation

**Owned after R:** `studio/src/content-evidence/packet.ts`, one shared evidence renderer and parity tests; `studio/src/agents/script-generation/index.ts`/`long-form.ts` evidence-only inputs and messages; the minimal evidence-only adapter in `studio/src/agents/script-review/index.ts` and its tests. Task 3 retains production-fit wording/scene ownership; SR-1–SR-9 scoring/rules remain separate.

**Shared, after R and integration order:** script generation/review sections of `state-machine.ts` and minimal packet metadata in existing stage contracts. Recheck current ownership before the small reviewer adapter edit; coordinate if an SR branch appears. Do not edit another task's worktree/PR or implement reviewer rules.

Steps after R: recheck SR ownership and overlap; implement adopted packet/effective policy and pure hashing tests; add shared rendering and writer/minimal reviewer consumption; wire stage snapshot/review after Task 3 shared changes; export factual-baseline fingerprint for Task 5; validate legacy/parity/output contracts; document evidence limits.

## Testing

Run Studio build/lint/typecheck and focused `src/agents/script-generation/index.test.ts`, `src/agents/script-generation/long-form.test.ts`, `src/agents/script-review/index.test.ts`, `src/api/routers/runs-script-review.test.ts`, `src/run-pipeline/state-machine.script-generation.test.ts`, plus new packet/parity/invalidation tests. Verify files exist in the actual execution checkout. Providers mocked for contract tests; no global pipeline startup.

Cover source-only URL, none/empty sources, forbidden additional fields, evidence-instruction injection, long effective policy, legacy metadata missing, packet changed versus unchanged, profile change mid-run, retry with preserved packet, reviewer call omission, factual concern display compatibility and Task 5 rejection on changed script/evidence. Contract tests compare requests, not model answers. SR's accuracy evaluation reports flagged misses and false positives, actual model/inputs/cost and limitations when authorized; no promise of universal factual correctness.

## Report Template

Create `docs/execution/sprint5/reports/task4.md`: actual SR owner/spec/PR and reuse boundary, packet schema/effective-policy decisions, request equality evidence, fixture provenance, integration/accuracy results clearly separated, actual cost if any, limitations and downstream invalidation examples. Update own STATUS row and actual BUSINESS_LOGIC delta only; global pending status is reconciled by integration owner.

## Definition of Done

Adopted packet parity and minimal reviewer adapter are integrated after R; technical acceptance tests pass; existing output/result and legacy behavior remain compatible; Task 5 receives a stable fingerprint/eligibility output. Report SR-1–SR-9 rule completion and any model accuracy evaluation separately; neither is claimed by this task.

## Additional Notes — Git, Uncertainties and Approval

Actual branch `SPRINT5_TASK4_BE`, worktree `D:\Study Material\7AI-SPRINT5\task4`, draft PR #94 from main `5b04a7a`; pre-gate work contains only fixtures and documentation. Feature implementation waits for R. No main merge/push. Coordinate shared source after Task 3; planning grants no deployment. The minimal consumer ownership is assigned to Task 4 by the 2026-10-16 owner direction; SR rule ownership and any retrieval producer remain separate. New retrieval infrastructure, factual-source producer, workflow/migration, paid evaluation or historical data change needs a concrete reviewed scope; they are not implied by this task. Server untracked files and existing planner retry policy remain outside ownership.

## Links & References

- [Sprint 4 script-side report](../../sprint4/reports/task2.md), [long-form report](../../sprint4/reports/task9.md), [facts-only decision](../../sprint4/tasks/task9.md), [review misses](../../../review_tuning/SCRIPT_REVIEW_MISSES.md).
- [Profile policy schema](../../../../studio/src/channel-profile/schema.ts), [resolved config](../../../../studio/src/run-pipeline/resolved-config.ts), [Task 3](task3.md), [Task 5](task5.md), [current-state reconciliation](../STATUS.md).
