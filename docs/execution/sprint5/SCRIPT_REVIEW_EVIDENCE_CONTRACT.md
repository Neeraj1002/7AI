# Task 4: Script Review Evidence Consumer v1

**Prepared:** 2026-10-16. **Status:** owner-adopted according to the owner's update and Task 4's report; application implementation was absent at inspection. The [Task 4 dependency-base direction](TASK4_DEPENDENCY_BASE.md) now permits implementation/test against #91/#92 before merge. It does not declare gate R globally satisfied, SR rules complete or release acceptance passed. This planning chat has not changed another task's worktree, PR or application code.

## Evidence and planning correction

**Verified locally:** Task 4's report and checkout have only pre-gate evidence fixtures. `ReviewScriptParams` accepts `briefText` but no packet/sources/fact-policy input. `ScriptReviewResult` is `{ output, llm }`; the existing output schema already has score/notes, hook fields, production-fit flags, factual concerns, style violations and optional chapter notes. The miss log records cases/rules, not a TypeScript consumer interface or an identified enhancement branch.

**Reported by Task 4/owner:** PRs #91/#92/#93 address diagnostics, publishing and scene fixtures, respectively; none supplies the consumer. Gate R remains unsatisfied according to Task 4's report. These are dated reported PR/gate findings, not a fresh live-status verification by this planning chat.

**Inference:** waiting for an unidentified SR implementation to define the input creates a planning dependency with no accountable producer. It does not establish that a new fact-checker is needed.

**Adopted resolution:** Task 4 owns the minimal additive consumer adapter below. The owner now permits implementation against the tested dependency base before merge; final main/reliability/release gates still apply. SR-1–SR-9 remains separate. Task 4 completion does not depend on those future rules or claim they shipped. Recheck file ownership; coordinate any new overlapping branch instead of duplicating it.

## Input contract

Use the Task 4 `EvidencePacket` proposal in `studio/src/content-evidence/packet.ts`, with its schema/builder as the one authority. Add an optional `evidence?: EvidencePacket` to both `GenerateScriptParams` and `ReviewScriptParams`. No parallel `sources`/`factPolicy` interface is added to ReviewScriptParams alongside the packet.

```typescript
type EvidencePacket = {
  version: 1;
  briefText: string;
  factPolicy: 'brief-only' | 'brief-plus-common';
  sources: Array<{
    id: string;
    citation: string;
    status: 'citation-only' | 'approved-excerpt';
    excerpt?: string;
  }>;
  hash: string;
};
// Additive fields on the existing parameter types:
// GenerateScriptParams.evidence?: EvidencePacket
// ReviewScriptParams.evidence?: EvidencePacket
```

For this sprint's existing producer, all run `sources` become **citation-only/unfetched**. An approved-excerpt producer is not currently identified; do not create one, expose a new input setting or admit model/fetched text as approved evidence. The union reserves compatibility with a separately approved producer; its excerpt branch is unavailable until such a producer is explicitly agreed.

Build one validated immutable packet from run-owned inputs before generation. Effective policy is facts-only (`brief-only`) for long-form and the resolved explicit policy for Shorts. Preserve original factual wording/hedges, source order and citation strings. Canonical serialization has fixed/recursively stable object-key ordering, preserves array order and hashes the version/content/policy/provenance, excluding `hash` itself and timestamps. Do not rewrite citation/brief text during hashing. Recompute/validate hashes locally before either paid call; never trust a model-echoed hash.

When `evidence` exists, its brief/policy/source values are authoritative for both calls. Optional legacy `briefText`, `sources` or `factPolicy` arguments may be absent or match the packet; a conflicting duplicate is a pre-call validation error, not silently resolved using whichever prompt line appears last. No fallback to the channel's newer factual inputs for review.

When the packet is absent, retain the existing legacy call behavior and label missing snapshot provenance in orchestration. Do not retroactively certify old outputs. Legacy reconstruction must use actually stored generation inputs; if effective policy/source content cannot be recovered, report that limit instead of inventing a historical packet.

## Consumer behavior and output compatibility

Task 4 owns one shared evidence-to-prompt renderer used by writer and reviewer. Both receive identical factual text, effective policy, source availability and packet version/hash context; task-specific script/length/style instructions remain outside that common block. Treat evidence as delimited untrusted data, not instructions to override the system.

For packet-enabled calls, make only the minimum instruction changes needed to consume the packet consistently:

- Facts-only means no added factual detail beyond supplied permitted text. A citation-only URL supplies no fetched factual text.
- `brief-plus-common` permits the already-selected common-knowledge policy; it does not make that knowledge or URL content independently verified.
- No network retrieval, extra model/agent/call, claim-extraction service, source-truth badge or new scoring threshold.
- Adapt contradictory legacy factual-context wording when necessary for the packet; do not implement the full SR-1–SR-9 rubric, scoring caps, source research or production-fit rewrite here.

**Keep `ScriptReviewOutputSchema` and `{ output, llm }` compatible.** Use existing `factualConcerns`, `notes` and other fields for the reviewer response. Packet consumption is not a verified fact-check. No requirement for an LLM to return hash/provenance/claim-verification fields. Existing thresholds, retries, Gate 1 behavior and human approval remain unchanged.

Application-assembled metadata, not model output, records the evidence snapshot/reference: generation and review stage inputs carry `evidence`; their outputs may carry an optional `evidenceRef: { version: 1, hash: string }`. The review loads the packet from the corresponding completed generation attempt's stored input and checks the output reference if present. Both references must agree. These additive stored fields must be parsed compatibly; old records remain readable. A changed evidence/approved-script fingerprint invalidates downstream visual-only repair eligibility through Task 5's existing dependency contract.

## Ownership and gates

Under the owner's adopted agreement, Task 4 owns `content-evidence/packet.ts`, shared evidence rendering/validation, writer inputs and the **minimal evidence-only adapter** in `script-review/index.ts` and its tests. This replaces the earlier blanket requirement that an unidentified SR owner must supply that adapter. It does not assign all reviewer rules to Task 4 or declare Neeraj the code implementer merely because he owns the miss log.

Shared generation/review wiring can now be implemented/tested on the authorized #91/#92 composite; Task 3's production-fit/scene ownership and shared integration coordination still apply. Existing SR rules/scoring/accuracy remain separate. No edits to PRs #91–#93 or their worktrees/contracts. Task 4 changes stay in draft #94; its agent owns the temporary dependency branch. This planning chat performs no branch/PR mutations.

The [owner-authorized Task 3 wording/development agreement](TASK3_DEVELOPMENT_AGREEMENT.md) makes shared-file ownership explicit: Task 3 owns production-capability paragraphs/helper/tests; Task 4 owns the optional evidence parameter/common evidence block/minimal policy adapter. Task 4 can build its separate evidence module in parallel, then integrate the selected Task 3 wording revision as a declared dependency without rewriting it. Full factual rules/scoring remain outside both narrow adapters.

**Development:** Task 4 can implement and test this adapter now using the [authorized dependency-base workflow](TASK4_DEPENDENCY_BASE.md), without waiting for an unidentified SR rules branch or dependency merges. **Release:** #94 stays draft until dependencies land, final main integration/acceptance and Sprint 4 closure pass. It reports both states separately.

## Acceptance and reporting

Task 4's technical acceptance covers:

1. Identical validated packet/hash/effective-policy blocks in writer and reviewer requests for Shorts and long-form.
2. Citation-only availability, no approved excerpts without an agreed producer, preserved hedges/source order, local hash verification and rejection of conflicting legacy parameters before paid calls.
3. Stored generation snapshot reused on retry/restart/review; changed channel defaults cannot substitute new evidence; missing legacy inputs remain explicit.
4. Existing reviewer output, result shape, score threshold/retry/gates and packet-absent legacy compatibility.
5. Evidence-as-data rendering and bounded authenticated storage/logging. Unit tests validate the request contract, not a model's universal resistance to prompt injection.
6. Task 5's stale evidence/script fingerprint rejection. No migration, live mutation, paid evaluation or extra model call.

Reuse Task 4's prepared six-case/Task 9 fixtures as evaluation material with their stated missing-input limits. Mocked parity/schema tests establish technical integration only. Full SR accuracy/scoring rules and any paid evaluation remain explicitly outstanding; they do not prevent this adapter's technical definition of done.

The Task 4 agent records adoption/ownership in its **own** report, updates its task spec/status on its branch to match the adopted contract, then reports gate R separately. Do not claim “consumer agreed” simply because this proposed document exists; use the owner's actual adoption instruction. No new Sprint 5 task or duplicate reviewer enhancement is created.
