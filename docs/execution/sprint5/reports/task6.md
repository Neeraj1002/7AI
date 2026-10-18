# Sprint 5 Task 6: Script Review SR-1 to SR-9

Implementation prepared; R5 acceptance failed on SPRINT5_TASK6_BE, own worktree D:\Study Material\7AI-SPRINT5\task6. Fresh main baseline 6852fa5. Task 4 #94 and Sprint 4 long-form review #93 are merged. Owner workflow: combined Sprint 4-5 acceptance after Task 5; no Sprint 4 closure or live-upload hold. No merge/deployment performed.

The R0-R5 sections below preserve the initial 2026-10-18 implementation and four-round history. The 2026-10-19 owner revision at the end supersedes candidate-only numeric handling and the original token caps.

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
- Evaluation runner summary logging was corrected after the evidence commit; full lint was repeated successfully and its no-opt-in guard exited before any API call. These summary/report changes do not alter the tested runtime reviewer or the evaluation input hash.
- Local verification used the dedicated localhost `sevenai_sprint5_task6_20261018_test` database with all 23 existing migrations applied. No new migration, production database write, model change, setting, threshold, retry limit, Gate 1 screen, writer logic or publishing behavior change.
- The pre-existing budget assertion was reproduced on an unchanged detached main checkout. The owner explicitly approved a fixture-only scope extension: two inert credential-existence records and cleanup. This repaired the test prerequisite without changing runtime budgets. Initial environment/test-key and in-flight-edit failures were corrected; only the stable-source result above is a passing full-suite claim.
- Miss-log cases 1-2 use original full briefs/scripts. Cases 3-6 lack original full briefs and are explicitly labelled synthetic reconstructions from the log's summaries/corrections; their results cannot certify complete historical replay accuracy. Task 9 uses its actual full development-run brief/script recovered read-only from the specifically documented localhost run. No past production script was edited and no external retrieval was performed.
- The owner performs a real Gate 1 readback after approved merge/deployment as part of the combined Sprint 4-5 acceptance pass after Task 5. Sprint 4 closure and a live upload are not readiness prerequisites. Neither is the reason this PR is draft.

**Historical remaining blocker (2026-10-18):** R5 fails: the real reviewer misses required SR-1/4/5/7/8 findings, returns false control findings/one control rejection, and produced malformed JSON. Code caps only constrain confirmed findings; they cannot repair model false negatives without violating the candidate-only contract. Further reviewer work and a successful three-repeat acceptance pass are required before marking ready. No merge or deployment performed.

Historical founder status (2026-10-18): **NOT READY - PR #105 is draft; code checks pass, real-model R5 acceptance fails. Not merged, not deployed.**

## Owner revision checkpoint (2026-10-19)

Build, typecheck, lint and the complete offline suite passed before the single additional comparison round: 1020 tests passed, 9 skipped. Historical post-calibration outputs were frozen truthfully as snapshots; original provider text/stop reasons were never retained and cannot be reconstructed. The new harness retains exact provider text, returned model, stop reason, reasoning usage and cost, with durable reservations against the cumulative $3 ceiling.

The new native structured-output path uses higher caps and one format retry; two invalid replies fail without a score, and both calls are metered. The owner-authorized unmatched-number and dropped-numeric-hedge checks are code verdicts; names, soft cases and derived arithmetic stay hints. Production routing remains Haiku 4.5. The one Haiku/Sonnet comparison stopped after 53 valid reviews and two unmetered provider failures; 11 Sonnet cases were not attempted. Conservative campaign charge is $1.999582 including every unresolved reservation. No second comparison round is authorized or run. Detailed retained results and the offline audit follow below. Current status remains NOT READY.

## Revised comparison: actual results (2026-10-19)

**NOT READY.** Production Haiku still misses SR-1/4/5/7/8 in the representative cases. Sonnet detects those cases but its clean-control acceptance is incomplete. PR #105 remains draft. Current main is 6852fa5, already integrated and conflict-free. Combined Sprint 4-5 owner acceptance follows Task 5; neither Sprint 4 closure nor a live upload is a hold.

The evaluated implementation is commit `0cc37a97f9e814035d069314566e2587f313c1ed`; its pre-call offline proof and evaluated source hash are retained in [sr-comparison-results.json](../../../../studio/src/content-evidence/fixtures/sr-comparison-results.json), alongside every returned response text, model identity, usage, stop reason, cost, calibrated output and failure reservation. [sr-offline-replays.json](../../../../studio/src/content-evidence/fixtures/sr-offline-replays.json) preserves 33 historical snapshots, explicitly marked post-calibration rather than raw provider output. Original historical wire text and stop reasons are unavailable; the old malformed JSON cannot be attributed to hidden reasoning retrospectively.

The fixed additional round planned 11 fixtures x 3 repeats x 2 models. It completed **53 valid reviews**, then stopped both streams on two unmetered provider failures: Haiku Appendix A invented-details repeat 3, and Sonnet clean-Short repeat 1. **11 further Sonnet reviews were not attempted.** Those failures have no score and never count as clean. Their retained exception class is NonTransientStageError; detailed provider status/message was not retained, so the cause is unknown. A subsequent free read-only model-list request returned HTTP 200; that does not establish generation availability. No generation retry, second tuning round, upload, production generation or budget change followed.

All 53 retained replies ended with raw `end_turn` / normalized `stop`; none required a format retry or reached the output cap. Sonnet reported 21,976 reasoning tokens across 21 valid reviews, already included in billed output tokens. Haiku returned no separate reasoning-token count. The offline tests cover truncated yet parseable JSON and two invalid replies: higher caps, native schema output, exactly one format retry, fail-closed behavior and metering of both calls. No claim is made that the old errors had the same cause.

### Per-rule detection

Each cell counts the specific named problem in three fixed repeats, not merely presence of a rule tag or a low score. Raw-model and calibrated counts are identical for these representative problems. SR-6 is a final score-cap outcome, not model recall.

| Rule and specific problem | Haiku 4.5 | Sonnet 5.5 |
| --- | --- | --- |
| SR-1: case 1, soldiers earned salarium | 0/3 | 3/3 |
| SR-2: case 1, required salary absent | 3/3 | 3/3 |
| SR-3: case 1, neat tale filler | 3/3 | 3/3 |
| SR-4: case 1, coins / minted denarii ambiguity | 0/3 | 3/3 |
| SR-5: case 1, salarium / denarii pronunciation | 0/3 | 3/3 |
| SR-6: case 6, final score at most 6 | 3/3 | 3/3 |
| SR-7: case 2, convention becomes intrinsic coin value | 0/3 | 3/3 |
| SR-8: case 2, largely / mostly lost | 0/3 | 3/3 |
| SR-9: case 6, torn loose or hungry families invented | 3/3 | 3/3 |

Task 9 claim detection anywhere in factualConcerns (SR-1 or SR-9): **sold for scrap 3/3 vs 3/3; research still happening inside it 1/3 vs 3/3** (Haiku vs Sonnet). Haiku often mislabeled unsupported additions SR-1. It also falsely challenged supported or interpretive wording; a low overall score does not establish correct detection of every invention. Sonnet's additional semantic findings likewise remain subject to owner precision review; the table is detection, not a precision claim.

| Fixture | Haiku scores, repeats 1/2/3 | Sonnet scores, repeats 1/2/3 |
| --- | --- | --- |
| SR-case-1 | 6 / 6 / 6 | 5 / 5 / 5 |
| SR-case-2 | 8 / 8 / 8 | 5 / 5 / 5 |
| SR-case-3 | 8 / 8 / 7 | 5 / 5 / 5 |
| SR-case-4 | 6 / 6 / 6 | 5 / 4 / 5 |
| SR-case-5 | 5 / 6 / 5 | 3 / 4 / 3 |
| SR-case-6 | 6 / 6 / 6 | 5 / 5 / 5 |
| S4-task9-long | 4 / 4 / 4 | 5 / 5.5 / 5 |
| clean-short | 8 / 8 / 8 | FAIL / not attempted / not attempted |
| appendix-A-clean | 9 / 9 / 9 | not attempted / not attempted / not attempted |
| appendix-A-dropped-hedge | 8 / 6 / 5 | not attempted / not attempted / not attempted |
| appendix-A-invented-details | 3 / 3 / FAIL | not attempted / not attempted / not attempted |

The two new code verdicts are independently tested against falsely clean model outputs. Currency/number normalization covers digits, number words, decimal millions, dollar/cents forms and historical shilling/pence forms. New unmatched values are SR-1; matching brief numbers with a hedge but no hedge word in the script sentence are SR-8. Names, nonnumeric hedges, semantic currency conventions and soft cases remain hints/model checks. Derived arithmetic is a hint, not an automatic factual verdict. Numeric value matching is lexical and does not establish referent identity; ambiguous hedged/unhedged repeated values stay soft.

### Offline correction after the recorded round

Audit identified a deterministic false flag on case 4: **"A master carpenter's wage was capped at three pence a day, the official maximum."** The limit is preserved. The final offline-only correction recognizes capped/maximum/minimum/ceiling limit words and normalizes per day with a day. The evaluated paid outputs above are immutable and are not presented as a new paid acceptance pass. All **53 actual replies** are replayed through the corrected code with an injected completion, making **zero provider calls**, checking that scores never rise and clean controls have no blocking arrays. Dedicated regression tests also keep a genuinely dropped at-most hedge failing. The final code differs from evaluated commit 0cc37a9 by this narrow compatibility correction; no further paid test is implied.

### Appendix B: Clean control

The control remains exactly **"A bridge opened in 1901. It carried 50 workers."** The brief supports both facts, spells fifty, and requires only the opening sentence verbatim. The flagged line is **"It carried 50 workers."** It is a supported checkable assertion, not an interpretive claim. The owner's conditional replacement rule therefore does not apply; the original is retained rather than relabeled borderline to hide the miss.

Historical repeat 1 flagged: **SR-2: Brief requires 'fifty' (spelled); script uses '50' (numeral). Restore: 'It carried fifty workers.'** Historical repeat 2 had no concern arrays but scored 6, incorrectly treating the nine-word, five-second control as too short and lacking tension; repeat 3 scored 9. The current prompt defines a concern as a checkable number/name/date/event/cause/concrete detail and supplies five assertion examples and five transition/rhetorical examples. It also explicitly handles short requested durations.

In the new round, Haiku raw repeat 2 again flagged: **SR-2: Brief requires 'fifty workers' (spelled); script uses '50' (numeral). Restore: 'It carried fifty workers.'** Raw repeat 1 had no array findings; repeat 3 mentioned a minor formatting issue in notes but explicitly said it passes. Numeric equivalence removes the repeat-2 spelling-only array finding, without raising the model score. Result: **raw false blocking-array flags 1/3; final false blocking-array flags 0/3; final scores 8/8/8, no rejection**. Explicit spelling constraints and exact first/last wording still fail when violated. The Appendix A clean control has no raw or final blocking-array flags in 3/3 Haiku repeats, scores 9/9/9. **Sonnet control false flags are unknown: its first control call failed, the remaining control repeats were not attempted.** Unknown is not reported as zero.

### Cost and routing

Production script-review still resolves to `claude-haiku-4-5`, with returned identity `claude-haiku-4-5-20251001`. The comparison returned `claude-sonnet-5-5`. The old Lego review's actual stored model could not be found in available local records; its $0.0049 cost alone does not establish its identity. Sonnet is exposed only through an explicit evaluation seam, not production rerouting.

| Model | Valid / failed / not attempted | Metered total | Mean per valid review (range) | Unmetered failure reservation |
| --- | --- | --- | --- | --- |
| claude-haiku-4-5 | 32 / 1 / 0 | $0.253416 | $0.007919 ($0.004765-$0.012853) | $0.088256 |
| claude-sonnet-5-5 | 21 / 1 / 11 | $0.620958 | $0.029569 ($0.025204-$0.033854) | $0.099242 |

Means cover successful reviews only; failed calls are not treated as free and are charged in full at their reserved upper bound. New metered spend **$0.874374**, new unresolved reservations **$0.187498**. Historical metered **$0.905817** plus historical unresolved reservation **$0.031893** remain unchanged. **Known metered total $1.780191; total unresolved reservations $0.219391; conservative cumulative total $1.999582 / $3**. Costs are computed from returned tokens at registry rates, not an independently reconciled provider invoice. Sonnet input $2/M and output $10/M match the [official model documentation](https://platform.claude.com/docs/en/models/sonnet-5-5/overview); reasoning is counted inside output once.

**Final validation:** build, typecheck and lint exit 0; full suite **1076 passed, 9 skipped** (137 passed files, one skipped). Focused Script Review suite **109 passed**, including all 53 actual response replays, with zero provider calls. The isolated local test database was used; no production data. No schema migration, production configuration, route, budget, threshold, generation retry counter or Gate 1 behavior changes. Existing advisory SR-3/4/5 and planner behavior remain. Read-only provider metadata check only; no merge, deployment or upload.

## Final sign-off (2026-10-19)

- Task objective / R5 acceptance: not met; remain draft. Haiku misses SR-1/4/5/7/8, and Sonnet control precision remains unknown after the provider stop.
- Schema: unchanged; no migration. Business logic updated for the owner-approved numeric verdicts and bounded format retry.
- Offline checks: build/typecheck/lint pass, 1076 tests pass, 9 skipped; 109 focused tests include 53 actual raw-response replays. Post-replay source hash: `ef378bccc936c72fdfa6e45ee1fe5da7dfdfebe751e19d54a185e8e25683019f`.
- Integration: current main 6852fa584af2b078ffee5578db0bc7eaa9c54bd6 already included, no conflicts. Neither Sprint 4 closure nor a live upload blocks readiness.
- Spend: $1.999582 conservative cumulative including all unknown-cost reservations; no additional model round.
- Merge/deploy: not performed. Following eventual approved merge/deploy, owner checks Gate 1 readback during the combined Sprint 4-5 acceptance pass after Task 5.

Founder status: **NOT READY - [PR #105](https://github.com/Neeraj1002/7AI/pull/105) remains draft; offline checks pass, reviewer acceptance incomplete/failed.**
