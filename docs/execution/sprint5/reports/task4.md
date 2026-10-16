# Sprint 5 Task 4: Shared factual evidence inputs

**Date:** 2026-10-16
**Status:** Blocked on reliability gate R and existing Script Review consumer agreement; fixture preparation only
**Branch/worktree:** `SPRINT5_TASK4_BE`, `D:\Study Material\7AI-SPRINT5\task4`
**Draft PR:** [#94](https://github.com/Neeraj1002/7AI/pull/94)

## Prerequisite and ownership reconciliation

- Branched from `origin/main` at `5b04a7a`, containing #90/#89. Applied only Task 1's verified planning-document bootstrap `578ba530100638548a4a49af57efcb14e7962227` as local cherry-pick `368fcff`. No Task 1/2/3 application commits were copied.
- [Task 1 PR #91](https://github.com/Neeraj1002/7AI/pull/91) and [Task 2 PR #92](https://github.com/Neeraj1002/7AI/pull/92) were open, draft and unmerged on this date. Task 2's checks have not been integrated, so gate R is closed. Sprint 4 owner closure is also outstanding for PR readiness.
- `docs/review_tuning/SCRIPT_REVIEW_MISSES.md` names Neeraj as its log owner. `docs/execution/sprint4/PENDING.md` lists a backend agent for SR-1–SR-9 and says its independent task doc was still to be written. No current SR-1–SR-9 implementation branch, task spec, or open PR was identified in local branch names or visible GitHub PRs. The actual implementer, retrieval scope, and evidence consumer/output interface remain unconfirmed. No reviewer file was edited.
- The 2026-10-11 Task 9 decision remains founder-supplied facts with no pipeline web search. Correction-source links in the miss log are not evidence that those pages were approved as original run inputs.

## Prepared fixture and validation

Added `studio/src/content-evidence/fixtures/sr-pre-gate.json`: seven labelled recorded cases (all six miss-log cases plus Sprint 4 Task 9's reported extra fact) and three synthetic contract cases for a brief-supported control, a citation-only URL, and malicious source instructions. Every recorded excerpt was checked against its source document. Cases whose full original brief or reviewer output is absent say so explicitly. The Task 9 case cannot stand alone as a full reviewer evaluation because the original brief is unavailable in its report.

Validation: JSON parsed; seven recorded and three synthetic cases present; every quoted recorded brief/script excerpt found in the named local source. No model, packet, writer/reviewer, pipeline or render tests were run. There was no API spend.

## Work remaining after prerequisites

Agree the existing SR owner's consumer/output interface and reuse any packet parity already implemented there. After gate R, freeze the bounded packet and effective-policy contract, implement canonical hashing and writer/reviewer parity, preserve stored inputs across retries and legacy runs, wire shared stage state after Task 3's integration order, and provide Task 5's factual-baseline fingerprint. Then run the specified focused tests, build/lint/typecheck and separate contract results from any authorised model accuracy evaluation. Do not claim SR rule completion or factual accuracy from fixture validation.

**Schema migration:** None. **Production writes, retrieval, paid evaluation, publish, deploy:** None.
