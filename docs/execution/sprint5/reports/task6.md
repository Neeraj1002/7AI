# Sprint 5 Task 6: Script Review SR-1 to SR-9

Implementation prepared; R5 acceptance failed on SPRINT5_TASK6_BE, own worktree D:\Study Material\7AI-SPRINT5\task6. Fresh main baseline 6852fa5. Task 4 #94 and Sprint 4 long-form review #93 are merged. Owner workflow: combined Sprint 4-5 acceptance after Task 5; no Sprint 4 closure or live-upload hold. No merge/deployment performed.

## R0: inspected assumptions

| Architect assumption | Confirmed or wrong; actual contract |
| --- | --- |
| score, factualConcerns, violations, sources | Wrong: score/notes, hookScore/hookNotes, videoGenFit, factualConcerns, styleGuideViolations (default []), optional chapterNotes. No sources, violations or general-concerns field in reviewer schema. |
| Findings fit existing fields | Confirmed: SR-1/7/8/9 factualConcerns, SR-2 styleGuideViolations, advisory SR-3/4/5 notes; SR-6 cap explanation notes. Gate 1 already renders these. No schema/app/migration needed. |
| Threshold 7, three automatic retries, exhausted to Gate 1 | Confirmed in state-machine; preserved, including Gate 1 disabled fallback and passing-score auto-approval. |
| Writer already receives all reviewer concerns | Wrong: writer already consumes latest auto-reject rationale via fixNotes, but that rationale contained only notes after earlier removal of duplicated Gate 1 lists. R4 adds lists only to auto-reject rationale. |
| Evidence packet policy and unfetched URLs | Confirmed: long packet must be brief-only, Shorts use resolved policy; citation-only URLs contain no factual text. Approved-excerpt producer remains unavailable. The existing legacy brief fallback is retained for compatibility; no second input path added. |

## R1: same reviewer, nine rules

Both prompts receive SR-1 through SR-9 with literal claim/constraint checking, conversion conventions, legal maxima/attribution and brief-grounded invention checks. Explicit brief requirements override generic hook preferences. Long chapter criteria, production-fit rubric and +/-20% length rule remain. Shorts-only 2.5-second sentence guidance; long filler adds no fact, tension or payoff. Existing purpose/model/output token limits retained; no retrieval.

## R2: pure candidate checks

Number/year/spelled-number normalization, absent capitalized names, unsupported absolutes, sentence-overlap hedge comparisons, missing quoted etymology terms, ambiguous conversion clauses and lowercase unmatched-detail clauses produce bounded candidate hints for confirmation/dismissal. They never cap by themselves, including derived arithmetic. Exact quoted first/last passages (including multi-sentence passages) and exact hedge requirements are literal SR-2 checks. Hint precision and limitations recorded below after evaluation.

## R3: code calibration

SR-1 and brief-only SR-9 cap at 6; SR-2/7/8 and other SR-9 cap at 8; advisory SR-3/4/5 never introduce a code cap. Lower model scores remain lower. Existing untagged factual/style concerns retain conservative caps. Notes show the cap reason. See BUSINESS_LOGIC.md for the table.

## R4: retry handoff

Only auto-reject rationale gains the exact factual/brief concern strings. Existing generation-stage fixNotes and writer injection are reused. Tests exercise actual review-stage logging, next generation-stage forwarding, third retry, fourth review to Gate 1 with arrays, and passing score 7 with Gate 1 off. No retry/budget/state changes.

## R5 results: acceptance failed

The final source-matched pass attempted all 11 fixtures three times: **32 valid reviews, 1 malformed-JSON response**. It used the unchanged existing Anthropic claude-haiku-4-5 reviewer, one call per review, existing output limits and no production/media/publishing calls. Evidence: [sr-evaluation-results.json](../../../../studio/src/content-evidence/fixtures/sr-evaluation-results.json), final input/source hash `6eff5b08a5cf711b1189f66f768ca2a30b992f0640b587c9b126da0090a273ab`.

| Fixture | Scores, repetitions 1 / 2 / 3 | Valid reviews |
| --- | --- | --- |
| SR-case-1 | 6 / 6 / 6 | 3/3 |
| SR-case-2 | 8 / 8 / 8 | 3/3 |
| SR-case-3 | 6 / 8 / 8 | 3/3 |
| SR-case-4 | 6 / 6 / 6 | 3/3 |
| SR-case-5 | 5 / 4 / 5 | 3/3 |
| SR-case-6 | 6 / 6 / 6 | 3/3 |
| S4-task9-long | 6 / 8 / JSON failure | 2/3 |
| clean-short | 8 / 6 / 9 | 3/3 |
| appendix-A-clean | 9 / 9 / 9 | 3/3 |
| appendix-A-dropped-hedge | 6 / 6 / 6 | 3/3 |
| appendix-A-invented-details | 5 / 6 / 5 | 3/3 |

The following is a **strict recorded-miss audit**, not merely counting SR tags. A correctly placed SR tag must identify the named miss; a different claim, a passed check, a differently classified issue or invalid JSON does not pass. Advisory counts inspect the corresponding SR note segment. SR-6 records the final cap outcome, with separate mocked tests proving enforcement against a high model score. These representative per-rule counts do not imply the remaining misses in a case were detected.

| Rule | Recorded miss / outcome audited | Correct detection |
| --- | --- | --- |
| SR-1 | SR-case-1: Soldiers earning salarium misstates an etymology | 0/3 |
| SR-2 | SR-case-1: Missing salary key term | 3/3 |
| SR-3 | SR-case-1: Neat tale filler | 3/3 |
| SR-4 | SR-case-1: Coins, minted denarii spoken ambiguity | 0/3 |
| SR-5 | SR-case-1: Latin/denarii pronunciation risk | 1/3 |
| SR-6 | SR-case-6: Final score respects brief-only cap (calibration outcome, not recall) | 3/3 |
| SR-7 | SR-case-2: Money convention stated as intrinsic coin value | 0/3 |
| SR-8 | SR-case-2: None of it worked drops largely; mortality hedge lost | 0/3 |
| SR-9 | SR-case-6: Torn loose / hungry families inventions | 3/3 |

Additional failures: Task 9's actual sold-for-scrap claim was flagged in 1/3 attempts; its ongoing-research assertion was not flagged in either valid response, and the third response was invalid JSON. The latest reviewer still returned no factual/brief concerns for Case 2's unhedged None of it worked or coin-value conversions in all three attempts. Its advice sometimes reclassified a lost hedge as spoken clarity. Appendix A's introduced 1922/badges/loyalty payload was flagged as SR-1 and/or SR-9 and held below 7 in 3/3; its dropped-hedge variant also stayed below 7 in 3/3. The long Appendix control passed at 9 in 3/3 with no blocking finding. The Short compatibility control had a false spelling constraint in 1/3 (fifty versus 50); it was blocked below 7 in another 1/3 despite empty factual/style arrays. A third control response passed at 9. Thus control reliability and complete recorded-miss recall are **not satisfied**. Earlier tuning also allowed Task 9 or the invented Appendix payload to score 9; the prior-run scores remain in the artifact.

**Hint confirmation ratio:** 1/540 (0.19%). This is the requested model-explicit-confirmations / total-presented ratio, including the failed attempt's deterministically reconstructed hint count. Only one response explicitly referenced a candidate ID, for the actual invented Appendix detail. Unreferenced hints may have been ignored, dismissed or silently used; this is not independently established factual precision. New lexical cues remain noisy candidates, never verdicts; exact-string SR-2 mismatches alone are deterministic.

**Cost:** final pass metered $0.263414. The complete campaign (four transparent debugging/evaluation rounds; 130 attempts, 128 valid responses, two failures) recorded **$0.905817** at the existing registry pricing. One first-round failed call's returned usage was not retained; its full worst-case **$0.031893** reservation remains charged. Conservative total **$0.937710**, below the single **$3** ceiling. No unknown spend was zeroed, no production generation was retried, and no budget was changed. The second failure's returned usage was retained. No further paid tuning was performed after the final pass.

## Validation, integration and deviations

- Tested implementation commit: `0f123389c0681f77023fae036ffec928bab5f779`; current main re-fetched as `6852fa584af2b078ffee5578db0bc7eaa9c54bd6`. No main changes/conflicts to integrate. #94 and #93 prerequisites are merged. Own branch/worktree only; PR [#105](https://github.com/Neeraj1002/7AI/pull/105) remains draft and conflict-free.
- Build, typecheck and lint: passed. Full stable-source Studio suite: **991 passed, 9 skipped; 133 files passed, 1 skipped**. Focused reviewer/evidence/fixtures/retry checks: **52 passed**. The nine skipped tests are the guarded publishing-recovery concurrency/sandbox tests requiring Task 2's specifically named database and opt-in; they were not claimed as passed.
- Local verification used the dedicated localhost `sevenai_sprint5_task6_20261018_test` database with all 23 existing migrations applied. No new migration, production database write, model change, setting, threshold, retry limit, Gate 1 screen, writer logic or publishing behavior change.
- The pre-existing budget assertion was reproduced on an unchanged detached main checkout. The owner explicitly approved a fixture-only scope extension: two inert credential-existence records and cleanup. This repaired the test prerequisite without changing runtime budgets. Initial environment/test-key and in-flight-edit failures were corrected; only the stable-source result above is a passing full-suite claim.
- Miss-log cases 1-2 use original full briefs/scripts. Cases 3-6 lack original full briefs and are explicitly labelled synthetic reconstructions from the log's summaries/corrections; their results cannot certify complete historical replay accuracy. Task 9 uses its actual full development-run brief/script recovered read-only from the specifically documented localhost run. No past production script was edited and no external retrieval was performed.
- The owner performs a real Gate 1 readback after approved merge/deployment as part of the combined Sprint 4-5 acceptance pass after Task 5. Sprint 4 closure and a live upload are not readiness prerequisites. Neither is the reason this PR is draft.

**Remaining blocker:** R5 fails: the real reviewer misses required SR-1/4/5/7/8 findings, returns false control findings/one control rejection, and produced malformed JSON. Code caps only constrain confirmed findings; they cannot repair model false negatives without violating the candidate-only contract. Further reviewer work and a successful three-repeat acceptance pass are required before marking ready. No merge or deployment performed.

Founder status: **NOT READY - PR #105 is draft; code checks pass, real-model R5 acceptance fails. Not merged, not deployed.**
