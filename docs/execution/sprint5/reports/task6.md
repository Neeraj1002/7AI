# Sprint 5 Task 6: Script Review SR-1 to SR-9

Code preparation in progress on SPRINT5_TASK6_BE, own worktree D:\Study Material\7AI-SPRINT5\task6. Fresh main baseline 6852fa5. Task 4 #94 and Sprint 4 long-form review #93 are merged. Owner workflow: combined Sprint 4-5 acceptance after Task 5; no Sprint 4 closure or live-upload hold. No merge/deployment performed.

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

## R5: fixture evaluation and validation

Pending completion. Evaluation runner is explicit opt-in, fixture-only and uses the existing script-review purpose/model. Persistent ledger reserves worst-case byte/token spend before each call and counts unknown/interrupted spend conservatively within the shared $3 ceiling. It never imports DB runners, media producers or publishing workers. Original six miss-log scripts retained. Cases 1-2 have full briefs; cases 3-6 are synthetic reconstructions from recorded summaries/corrections. Task 9 originally had only reported claim excerpts. Its actual full brief and completed script were subsequently recovered read-only from the explicitly documented localhost sevenai_dev run d88d50b8-ad08-48c0-8725-d312b20aeba8; the final fixture uses that real development replay. No production database was accessed. Appendix A has clean, dropped-hedge and invented-number/detail variants; clean Short tests numerical spelling compatibility. No production data or uploads.

Final source checks: build, typecheck and lint passed; full Studio suite 991 passed, 9 skipped (133 files passed, 1 skipped). Focused reviewer/evidence/retry checks: 52 passed. The budget fixture failure was reproduced on unchanged main 6852fa5; the owner explicitly approved adding two inert sandbox credential records and cleanup, bringing the full suite to green without changing runtime budgets. Final R5 replay results and costs are still being recorded; readiness remains pending because the real model has demonstrated missed recorded claims and a malformed-JSON attempt.

Founder status: implementation and fixture evaluation in progress; not yet ready, not merged, not deployed.
