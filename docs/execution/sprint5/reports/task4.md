# Sprint 5 Task 4: Shared factual evidence inputs

**Date:** 2026-10-16
**Status:** Consumer v1 direction adopted; feature implementation blocked on reliability gate R; fixtures and documentation only
**Branch/worktree:** `SPRINT5_TASK4_BE`, `D:\Study Material\7AI-SPRINT5\task4`
**Draft PR:** [#94](https://github.com/Neeraj1002/7AI/pull/94)

## Prerequisite and ownership reconciliation

- Branched from `origin/main` at `5b04a7a`, containing #90/#89. Applied only Task 1's verified planning-document bootstrap `578ba530100638548a4a49af57efcb14e7962227` as local cherry-pick `368fcff`. No Task 1/2/3 application commits were copied.
- [Task 1 PR #91](https://github.com/Neeraj1002/7AI/pull/91) and [Task 2 PR #92](https://github.com/Neeraj1002/7AI/pull/92) were open, draft and unmerged on this date. Task 2's checks have not been integrated, so gate R is closed. Sprint 4 owner closure is also outstanding for PR readiness.
- `docs/review_tuning/SCRIPT_REVIEW_MISSES.md` names Neeraj as its log owner and records six cases plus proposed SR-1–SR-9 rules. `docs/execution/sprint4/PENDING.md` lists a backend agent for that separate enhancement. The miss log is evaluation/rule material; it does not define the code consumer interface or identify an implementation branch.
- At the owner's direction, draft PRs #91, #92 and #93 were inspected read-only. #91 changes planner diagnostics, #92 changes publishing (its shared `state-machine.ts` diff is publishing-only), and #93 contains Task 3 scene fixtures. None edits `script-review/index.ts`, adds a source/fact-policy/packet argument to `ReviewScriptParams`, or supplies an SR-1–SR-9 consumer contract. Current `ReviewScriptParams` accepts `briefText` but no sources, fact policy or evidence packet. No active SR implementation PR was found. At that inspection, the actual SR implementer, retrieval scope and consumer/output interface were unconfirmed; no PR #91–#93 or reviewer file was changed. The owner subsequently supplied the consumer v1 direction described below; SR rule ownership and any retrieval producer remain separate.
- The 2026-10-11 Task 9 decision remains founder-supplied facts with no pipeline web search. Correction-source links in the miss log are not evidence that those pages were approved as original run inputs.

## Adopted consumer v1 boundary

The owner forwarded the Task 4 Script Review Evidence Consumer v1 direction on 2026-10-16. It assigns Task 4 the minimal optional `evidence?: EvidencePacket` adapter in both writer and reviewer parameters, a single shared factual prompt block, application-built stage input snapshots/references and compatibility validation. Task 4 may edit `script-review/index.ts` for that evidence-only adapter after gate R, following a fresh ownership check. The existing `ScriptReviewOutputSchema`, `{ output, llm }` result, thresholds and Gate 1 behavior stay compatible. SR-1–SR-9 rules, scoring, retrieval and model accuracy evaluation remain outside this adapter. This adopted direction resolves the missing consumer definition; it does not establish that an SR rule branch exists or that gate R is open.

No application code changed in this pre-gate update. PRs #91–#93 were not edited; all documentation changes are on Task 4 draft PR #94.

## Prepared fixture and validation

Added `studio/src/content-evidence/fixtures/sr-pre-gate.json`: seven labelled recorded cases (all six miss-log cases plus Sprint 4 Task 9's reported extra fact) and three synthetic contract cases for a brief-supported control, a citation-only URL, and malicious source instructions. Every recorded excerpt was checked against its source document. Cases whose full original brief or reviewer output is absent say so explicitly. The Task 9 case cannot stand alone as a full reviewer evaluation because the original brief is unavailable in its report.

Validation: JSON parsed; seven recorded and three synthetic cases present; every quoted recorded brief/script excerpt found in the named local source. No model, packet, writer/reviewer, pipeline or render tests were run. There was no API spend.

## Work remaining after prerequisites

After gate R, recheck for overlapping SR work and implement the adopted bounded packet/effective-policy contract, canonical hashing, shared writer/reviewer rendering and minimal reviewer adapter. Preserve stored inputs across retries and legacy runs, wire shared stage state after Task 3's integration order, and provide Task 5's factual-baseline fingerprint. Then run the specified focused tests, build/lint/typecheck and separate contract results from any authorised model accuracy evaluation. Do not claim SR rule completion or factual accuracy from fixture validation.

**Schema migration:** None. **Production writes, retrieval, paid evaluation, publish, deploy:** None.
