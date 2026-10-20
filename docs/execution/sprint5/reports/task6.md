# Sprint 5 Task 6: Script Review SR-1 to SR-9

**Follow-up (post-merge live detection check, 2026-10-21):** branch `SPRINT5_TASK6_POSTMERGE_CHECK`, worktree `D:\Study Material\7AI-SPRINT5\task6-postmerge`, PR #110. Result: [passed](#post-merge-live-detection-check-2026-10-21); no code change.

**Current founder-approved control audit (2026-10-20): PR #105 remains draft. The revised D2 live acceptance stopped on Appendix A repeat 1 after two HTTP 200 replies; no valid scored review was accepted. The five approved fixture corrections and D2 audit ran through three Sonnet reviews each for $0.370290 of the new $0.60 cap. D4 controls have no factual/brief flags; Lego facts and Appendix A still receive disputed flags. The live run exposed advisory leakage into opaque rubric grades; a subsequent strict audit correction passes offline, but has not received another paid model pass. Known metered total $3.591379; $0.219391 historical reservations remain held; conservative total $3.810770. Acceptance remains open.**

Historical initial baseline: implementation prepared; R5 acceptance failed on SPRINT5_TASK6_BE, own worktree D:\Study Material\7AI-SPRINT5\task6. Fresh main baseline 6852fa5. Task 4 #94 and Sprint 4 long-form review #93 are merged. Owner workflow: combined Sprint 4-5 acceptance after Task 5; no Sprint 4 closure or live-upload hold. No merge/deployment performed.

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

## Round 3 pre-waiver checkpoint: failure evidence, Sonnet configuration and control preparation

### What can and cannot be established before spending

The two Round 2 failures occurred inside the provider-call wrapper before it returned an LLMResponse. The old harness retained only NonTransientStageError and the requested model/limit. It discarded the HTTP status, error body/type, request ID, stop reason and token usage. Those details cannot be reconstructed from a class name or the cost reservation. **Neither cut-off, workspace limit nor overload has been established.** The 53 successful calls ending with end_turn do not establish the cause of the two failures. There have been **zero new paid calls in Round 3**.

| Failed request | Requested model | Configured output limit (not tokens used) | HTTP / stopReason / actual tokens | Conservative unresolved charge |
| --- | --- | --- | --- | --- |
| Original historical failure | Haiku 4.5 | Not retained here | Unknown | $0.031893 |
| Round 2 Appendix A invented-details, repeat 3 | claude-haiku-4-5 | 8192 | All unknown | $0.088256 |
| Round 2 clean-short, repeat 1 | claude-sonnet-5-5 | 4096 | All unknown | $0.099242 |
| Total | | | | **$0.219391** |

These amounts are maximum input/output reservations recorded before each request, not measured invoices and not proof that the calls were billed that amount. They remain fully charged until returned usage or billing evidence reconciles them. Known metered total remains **$1.780191**; conservative total **$1.999582/$3**; remaining conservative allowance **$1.000418**. Nothing is reset or written off. The owner selected providing sanitized failure records; none were included in that selection. The missing records were requested again. The explicit before-spending evidence prerequisite remains open.

### Narrow implementation and offline preparation

The central typed registry now maps the script-review purpose to **claude-sonnet-5-5**, covering Shorts and long-form through the existing purpose resolution. No model is selected in the agent or by video length. Haiku's SR-1/4/5/7/8 misses justify the switch under D3 and the owner's Round 3 direction. Pricing is already present. This is branch configuration, not a deployment.

Because no cut-off has been established, the conditional larger-limit/reasoning-off change is **not asserted or applied**. Existing reviewer caps and its bounded format retry remain. LLM Registry Part A owns the general registry-limit/reasoning/retry solution; this task does not implement it. If the missing evidence establishes cut-off, the narrow reviewer-purpose configuration must be completed and checked before paid continuation.

Reviewer-evaluation-only failure diagnostics now preserve sanitized HTTP status, stop reason, actual input/output/reasoning counts when available, request ID and evidence-based category. They distinguish an unknown failure from a verified length stop, provider credit limit, workspace limit, overload or throttling without retaining keys, headers, response bodies or raw exception messages. Focused tests exercise redaction and prevent unknown usage from becoming zero. This does not introduce a shared LLM retry/failure policy. The archived Round 2 paid runner is explicitly disabled after archive, preventing a fresh checkout from restarting with its obsolete $0.937710 baseline.

The prompt now honors explicit DOCUMENTED/INFERRED/COMMENTARY-ONLY/IMAGINED boundaries. Allowed first-person thoughts, senses, gestures and properly tagged everyday speech by unnamed people are supported by the allowance. Numbers, names, dates, prices, factual speech and invented real-person quotations remain subject to factual review; modern terms alone are advisory. Imagined framing never exempts a new number from the code verdict. No blanket deterministic suppression of model concerns is added.

Eight clearly labelled synthetic fixtures add two Lego clean controls, two excerpt-based negative Lego scripts, and two D4 families (each allowed version plus an invented-number/factual-quote variant). The full historical Lego drafts and founder-edited 273-word script were unavailable; these fixtures are reconstructed from the architect's allowed facts and quoted passages, **not claimed as recovered original scripts**. Existing 53 raw replies continue to replay offline. Unit tests confirm code-level numeric/exact checks leave allowed controls uncapped, invented 777 still caps at 6 even with a falsely clean completion, and name/quotation findings remain model findings under brief-only. Mocked outcomes are not real-model acceptance.

### Per-control Round 3 result and continuation order

| Control | Configured/requested model | Round 3 actual score | Round 3 actual flags |
| --- | --- | --- | --- |
| clean-short | claude-sonnet-5-5 | Not run; prior repeat 1 failed | Unknown |
| Lego facts control (synthetic) | claude-sonnet-5-5 | Not run | Unknown |
| Lego rhetoric control (synthetic) | claude-sonnet-5-5 | Not run | Unknown |
| Appendix A clean | claude-sonnet-5-5 | Not run | Unknown |
| D4 imagined first person | claude-sonnet-5-5 | Not run | Unknown |
| D4 senses and tagged speech | claude-sonnet-5-5 | Not run | Unknown |

The exact **11 previously unattempted Sonnet reviews** remain: clean-short repeats 2/3; Appendix A clean repeats 1/2/3; Appendix A dropped hedge repeats 1/2/3; Appendix A invented details repeats 1/2/3. The prior failed control is separately retained as failed, not relabelled unattempted or clean. The requested new controls are additional to those 11. Preparation records controls-first ordering and the full cumulative baseline in [sr-round3-preparation.json](../../../../studio/src/content-evidence/fixtures/sr-round3-preparation.json). Any later actual request needs a durable worst-case reservation including all prior unresolved charges; stop before a request that could exceed $3. The paid continuation has not begun and no control is claimed to pass.

### Hard rules 5-7 and integration

Pulled main into the session's own branch/worktree. **One conflict:** add/add in task6.md. Resolution: copied the architect's complete latest source from D:\Study Material\7AI\docs\execution\sprint5\tasks\task6.md, without editing or hand-merging the task text. It is byte-identical to that source; no revision marker exists, so the actual diff governed synchronization. The state-machine integration merged automatically; its current-main TTS changes are preserved.

Removed this PR's previous STATUS.md and BUSINESS_LOGIC.md edits, preserving the current architect/main versions. The remaining docs diff against main contains **only this report**; the task doc is identical to main/source. This supersedes earlier historical statements that the task updated those shared docs. No other task docs, status rows, plans or bug ledgers were edited. Source identity and docs scope are checked again before the implementation commit. PR #105 stays draft; no gh pr ready, merge, deploy, live upload or production generation.

**Round 3 checks:** build, typecheck and lint exit 0; full integrated suite **1099 passed, 9 skipped** (139 passed files, one skipped). Focused Script Review/LLM suite **162 passed**; affected fixture/budget integration tests **17 passed**; final D4/numeric controls **28 passed**. The archived paid-run guard exits 1 before key loading. No provider calls were made.
**Historical pre-waiver blocker (superseded below):** sanitized historical failure records are still absent; the before-spending prerequisite and real Sonnet control acceptance are incomplete. No further provider call is authorized through an assumption about those failures.

### Round 3 integration-check corrections and sign-off

The first integrated full suite exposed three test issues. The fixture count expected 11 rather than the now-extended 19; the weekly pre-check expected the cheaper Haiku-based estimate rather than the Sonnet-based $1.10; and the existing Admin bulk/single comparison depended on unspecified database channel order. Test-only corrections update the fixture count and exact cost expectation and compare channel tuples in channel-ID order. Every channel/value/status is still checked. No runtime budget policy, quota, ceiling or credentials were changed. The final complete suite passes as recorded above.

Task doc synchronization: source byte-identical immediately before commit; main unchanged at 2c2e19c. Docs scope: only this report. Both lengths select Sonnet in the central purpose registry. Control scores and flags remain unassessed by Sonnet in Round 3. **NOT READY:** missing historical failure records prevent the paid continuation required by the owner's step 1; Sonnet controls have not passed. Conservative charge remains $1.999582/$3, with $0 new paid spend. PR #105 remains draft; no merge or deployment.

## Authorized Sonnet reproduction and continuation (2026-10-19)

The owner waived the unavailable historical records and authorized one request for each failed Sonnet review, under a separate $0.15 step cap, then controls-first continuation if the failure did not reproduce. The archive contains **one** failed Sonnet review (clean-short repeat 1); the other failed request was Haiku and was **not retried**. No historical reservation was released.

### Diagnostic result: failure not reproduced

| Model | Calls | HTTP | Stop / raw stop | Input / output / reasoning tokens | Reply length | Metered cost | Score / flags |
| --- | --- | --- | --- | --- | --- | --- | --- |
| claude-sonnet-5-5 | 1 | 200 | stop / end_turn | 5685 / 244 / 0 | 609 characters | $0.013810 | 7; no factual/style flags; advisory spoken ambiguity |

The request reserved $0.101734 before sending, below the **$0.15 diagnostic cap**. SDK retries were disabled and a second format call was prohibited in this phase. **The failure did not reproduce.** This does not establish the old failures' causes: their HTTP/stop/usage evidence remains lost. Because no cut-off was reproduced, no conditional larger-limit/reasoning-off change was applied. General LLM Registry Part A remains out of scope. Shorts and long-form continue to resolve Sonnet 5.5 from the existing central purpose registry.

**Sanitized evidence is committed in the requested report folder:** [task6-sonnet-evidence.json](task6-sonnet-evidence.json). It includes per-call requested/returned model, HTTP status, safe request ID/error type, stop reasons, input/output/reasoning usage, reply length, cap, reservation, actual raw reply and original fixture snapshots. It contains no keys, authorization headers or raw provider error bodies. All 29 calls returned HTTP 200 and stop/end_turn; none required a format retry. Observed input tokens: 5,685-11,773; output tokens: 244-2,990; reasoning tokens: 0-2,266; reply lengths: 609-2,351 characters. Reasoning is included in output cost once. No output cap was reached.

### Completion and the hard budget stop

Completed the diagnostic plus **all 11 previously unattempted Sonnet reviews**, then the additional controls and budget-permitted D4 negatives: **29 successful requests total** (one diagnostic, 28 continuation). The 11 are clean-short repeats 2/3 and all three repeats of Appendix A clean, dropped-hedge and invented-details. No provider failure occurred in the continuation.

The next request, D4 sensory-speech invented-quote repeat 3, needed a **$0.106996** worst-case reservation. Adding that to **$2.910662** would reach **$3.017658**, so it was stopped **before sending**, with no charge. Seven supplementary requests remain unexecuted: that D4 negative repeat and six Lego negative-excerpt repeats. Their absence is not counted as a pass. No further paid calls were made or attempted after the stop.

| Spending item | Amount |
| --- | --- |
| Historical known metered | $1.780191 |
| New diagnostic plus continuation metered | $0.911080 |
| Known metered cumulative | **$2.691271** |
| Old unresolved reservations (unchanged) | **$0.219391** |
| Conservative cumulative charge | **$2.910662 / $3** |
| Remaining conservative allowance | **$0.089338** |

The unresolved amount is still $0.031893 original + $0.088256 old Haiku + $0.099242 old Sonnet. A successful retry does not prove that an old failed call cost zero. New returned usage is fully retained; there are no new unknown-cost calls.

### Per-control actual result

All rows use requested and returned model **claude-sonnet-5-5**. Scores below 7 were rejected by the unchanged gate rule. Flags below distinguish actual constraint findings from advisory quality/production-fit notes; all exact strings are in the evidence JSON.

| Control | Model | Actual scores, repeats 1/2/3 | Actual findings |
| --- | --- | --- | --- |
| clean-short (repeat 1 is the diagnostic) | Sonnet 5.5 | 7 / 7 / 7 | No factual/style or video flags. SR-3/4 advisory ambiguity on "carried 50 workers"; low hook/engagement ratings. No spelling false flag. |
| Lego facts, synthetic | Sonnet 5.5 | 4 / 5 / 5 | SR-2 length in 3/3; zero factual concerns. SR-3/4/5 and illustration advisories. |
| Lego rhetoric, synthetic | Sonnet 5.5 | 6 / 5 / 5 | SR-2 length in 3/3; zero factual concerns. Permitted rhetoric was not treated as SR-9. Spoken-clarity, filler and visual advisories. |
| Appendix A clean | Sonnet 5.5 | 4 / 4 / 4 | SR-9 causal/referent interpretations in 2/3; no factual/style arrays in repeat 2. All three describe repetitive, self-referential narration and weak visual/engagement fit. |
| D4 imagined first person | Sonnet 5.5 | 7 / 6 / 5 | No factual concerns. SR-2 omitted documented binary/cubical/decimal facts in 2/3. "I think in grams" was advisory, not an SR-9 cap. |
| D4 senses and tagged speech | Sonnet 5.5 | 6 / 6 / 6 | Unsupported balance-scale prop SR-9 in 2/3; omitted documented facts SR-2 in 1/3. Tagged everyday speech was allowed; low factual payoff and wording advisories remain. |

Other completed outcomes: Appendix A dropped hedge **4/4/3**; Appendix A invented details **4/4/4**; D4 invented 777 **4/4/4**; D4 factual/numbered speech **4/4**, third repeat not sent. These negative scores do not substitute for passing the clean controls.

### Fixture accountability and zero-cost corrections

I prepared both synthetic Lego controls at **215 words**, below the two-minute lower bound (232 words at 145 wpm). I missed that mechanical validity check before the paid run. Their SR-2 length rejections are **valid**, not model false positives. The synthetic D4 speech brief did not supply the balance device used in the script; "The balance tilts" / "edge of the balance" are concrete additions beyond its allowance. The stricter corrections remove the prop rather than expanding the brief to excuse it. They also include all supplied documented facts, avoiding the omitted-facts ambiguity.

The Appendix control's flagged lines are **"the answer from owners was to push automatic elevators"** (a causal interpretation) and **"There were fewer tellers per branch" / "the change within a branch"** (a referent interpretation beyond the literal supplied wording). They are not ordinary transitions. The old control is retained as an **advisory-only borderline replay**. A stricter factual variant uses literal supplied wording and removes those interpretations; its wider narrative quality is still unverified. Empty factual arrays in repeat 2 did not prevent a quality score of 4; the benchmark needs a better production-quality control, not an artificial score floor.

No old input, raw response or failed outcome was overwritten. [sr-sonnet-round3-replays.json](../../../../studio/src/content-evidence/fixtures/sr-sonnet-round3-replays.json) freezes all 29 actual input/response/output triples for zero-cost replay. [sr-strict-controls.json](../../../../studio/src/content-evidence/fixtures/sr-strict-controls.json) contains five separate **offline-only, unreviewed** candidate corrections: Lego controls at 264 words, D4 controls at 108/113 words, and the stricter Appendix factual variant at 1,014 words. The originals remain in the evidence snapshots and historical fixture set; corrected IDs are distinct. Mechanical word range, numeric/exact constraints and all 29 captured outcomes replay without provider calls. This is not paid acceptance of the corrected controls and does not make the PR ready.

### Current sign-off

**NOT READY.** Sonnet controls did not pass; corrected candidates have not been reviewed, and the next reservation would breach the $3 ceiling. The obsolete requirement to wait for historical error records is superseded by the owner's explicit waiver. Evidence capture, one-call reproduction and the 11-review continuation are complete. No merge, deployment, live upload, production generation, runtime budget-policy change, threshold change or general LLM retry-policy rewrite occurred.

**Final validation:** build, typecheck and lint exit 0; full suite **1135 passed, 9 skipped** (141 passed files, one skipped). Focused reviewer/LLM checks before spending: **164 passed**. Captured-outcome replay plus strict offline fixture constraints: **34 passed**, with zero provider calls. Budget audit confirms exactly one diagnostic call, all original 11 completed, and no request for the budget-stopped row. Task doc is taken whole from main, as the latest owner instruction requires. Docs scope is this report plus the explicitly requested sanitized JSON evidence in the report folder; no STATUS.md, BUSINESS_LOGIC.md, plan or other authored doc changes remain.

**Final branch state:** current main remains 2c2e19c1a03d7715c4cba588a424a67cdf608c26 and is fully included. task6.md is byte-identical to the whole main copy. The only docs outputs are this report and the explicitly requested task6-sonnet-evidence.json. Original raw evidence and failures are retained. **NOT READY - PR #105 remains draft; no further paid calls, merge or deployment.**


## Founder control audit, before the separately approved rerun (2026-10-19)

Original control fixtures are frozen. The five previously prepared strict candidates remain **unapproved proposals**, not acceptance substitutes, and will not be used for paid calls. Founder approval authorizes a separate additional $1.50 ceiling. It does not release the historical $0.219391 reservations or reopen the stopped $3 campaign. Original brief/script snapshots and exact raw replies remain in the evidence JSON.

All scores below are claude-sonnet-5-5, repetitions 1/2/3. A whole-script length violation has no single offending factual sentence. Advisory comments and low model scores are separated from blocking findings.

| Original control | Scores | Rule / exact flagged script sentence | Brief / D4 boundary and disposition |
| --- | --- | --- | --- |
| clean-short | 7/7/7 | No blocking rule. SR-4 (rep 3 mislabels SR-3): "It carried 50 workers." | Inside allowed fact "It carried fifty workers." Advisory ambiguity must not deduct score. No control edit. |
| lego-facts-control | 4/5/5 | SR-2: whole narration, 215 words at 145 wpm = 89 seconds, below 96 seconds for target 120 +/-20%. | Genuine target-length failure; factualConcerns empty 3/3. Propose adding at least 17 supported words (232 total) or a founder-approved target change. Do not change fixture without founder decision. |
| lego-rhetoric-control | 6/5/5 | Same genuine SR-2 whole-script length failure. SR-4 advisory: "Make the brick the center of everything again, and trust it." | That exact rhetoric is expressly permitted, as is "It was a hard time for everyone involved." Neither triggered SR-9 in any run. Penalising rhetoric/repetition as SR-3/4 is a reviewer defect; prompt correction, no fixture edit. |
| appendix-A-clean | 4/4/4 | SR-9 rep 1: "But the answer from owners was to push automatic elevators." | The brief lists the 1945 strike and owners pushing automatic elevators, without an explicit causal link. "answer" adds a response claim. Propose "Owners pushed automatic elevators." Founder decides; unchanged. |
| appendix-A-clean | 4/4/4 | SR-9 rep 3: "There were fewer tellers per branch, but more city branches." and "So the change within a branch is not the same measure as the number of teller jobs." | Brief: "branch tellers fell from 20 to 13 between 1988 and 2004, city branches rose 43 percent"; overall teller jobs did not fall. A natural paraphrase, but per-branch unit is not expressly spelled out. Disputed interpretation, not a proven invention; no automatic code dismissal or fixture rewrite. Founder can confirm the intended unit. Rep 2 has no blocking findings. |
| d4-imagined-clean | 7/6/5 | False SR-2 reps 2/3: missing cubical/binary/decimal facts; no offending added sentence. SR-4: "I think in grams while the small stone rests in my palm." | DOCUMENTED supplies admissible facts, not an express must-include-all instruction. False coverage requirement is a reviewer defect. Modern term is D4 advisory, not a cap. Code moves only provable optional-coverage findings to advisory notes; never raises score. |
| d4-imagined-clean | 7/6/5 | Rep 3 note only: "I want the balance to settle, but the stones make me hesitate." and "I let my hands rest beside the balance." | Want/worry/gesture are inside IMAGINED. A concrete balance device is not supplied in this brief; the last sentence implies a prop. Propose referencing only supplied stones/weights; founder decides. No blocking SR-9 was actually returned here. |
| d4-sensory-speech-clean | 6/6/6 | SR-9 reps 1/2: "The balance tilts, so I move it gently." and "Morning light reaches the edge of the balance, and the market murmurs around me." | Movement/light/sound are allowed IMAGINED, but the specific balance device is outside the supplied facts/express allowance. Propose removing just that prop, not the sensory scene; founder decides. Rep 3 no blocking SR-9. |
| d4-sensory-speech-clean | 6/6/6 | False SR-2 rep 1: missing documented series, no offending sentence. "An unnamed neighbour says, "Take your time."" | Missing optional facts is a reviewer defect. Tagged everyday speech is explicitly inside D4 allowance, and was not flagged as SR-9. Fingers, grip, light, sound and body sensation are permitted. No fixture edits. |

Exact additional advisory script sentences: "Those are the figures at the start of this story."; "That is where the story began."; "Think of the brick as the thread connecting the beginning and the end."; "The parks were sold, and the focus was the core toys."; "By sales matters here: that is the comparison these figures support."; "From the shortfall in 2003 to that sales comparison in 2015, the story turns back to the core toys." These Lego lines are supported restatements or rhetoric, with "That is where the story began" an SR-4 ambiguity, not a new historical event. Appendix advisory examples: "The brief gives us her retirement, and it gives us the machine that ended the job."; "Dorothy Vaughan belongs in both parts through the actions the brief records."; "We can tell that through scenes and silhouettes, without a portrait."; "The dates and figures belong to those changes." D4 closing advisory: "The hands, the light and the neighbour's everyday words are imagined; the weight findings are the factual baseline." Rhetoric, repetition, pronunciation and awkwardness are SR-3/4/5 only, so their use to reduce score is a reviewer defect. Required openers/closers cannot be penalised for obeying the brief. Prompt now states this explicitly; code does not silently inflate model scores.

Code guards are narrow: (1) label-only DOCUMENTED omissions with no explicit coverage directive and no mixed constraint are advisory; (2) exact whole rhetorical quotes explicitly permitted by the brief cannot create an SR-9 cap. New names, numbers, prices, factual speech, ambiguous semantics, unsupported props, and explicit coverage/length constraints retain review/caps. Regression tests retain the 777-coins violation when a false optional-coverage finding appears in the same review. The replay file and recorded outcomes remain immutable; expected corrected outcomes are derived separately.


## Completed original-control rerun (additional $1.50 approval)

Evidence: [task6-control-audit-evidence.json](task6-control-audit-evidence.json). Model requested and returned: `claude-sonnet-5-5`, production `script-review` registry purpose for Shorts and long-form. All 18 calls HTTP 200, `end_turn`, complete JSON; no format retries, provider failures, new unresolved reservations, production data access or uploads. One initial CLI invocation stopped before key loading/provider access because archived dollar amounts are strings; the normalization fix was checked offline before any paid request. All six original controls were reviewed three times, with no substituted/edited fixtures.

| Original control | Scores 1/2/3 | Blocking findings | Evidence interpretation |
| --- | --- | --- | --- |
| clean-short | 8/8/8 | r1: none; r2: none; r3: none | Allowed fifty/50 fact; no false spelling flag. |
| lego-facts-control | 5/6/6 | r1: SR-2; r2: SR-2; r3: SR-2 | Genuine whole-script SR-2 length issue, not an SR-9 rhetoric issue. Some advisory/mandatory-ending score criticism persists. |
| lego-rhetoric-control | 6.5/6/5 | r1: SR-2; r2: SR-2; r3: SR-2 | Genuine whole-script SR-2 length issue, not an SR-9 rhetoric issue. Some advisory/mandatory-ending score criticism persists. |
| appendix-A-clean | 5/4.5/5 | r1: none; r2: none; r3: none | Empty concern arrays, yet below 7 for production-facing/repetitive narration; not accepted. Earlier causal and per-branch disputes remain as audited above, even though these new reviews did not flag them. |
| d4-imagined-clean | 5.5/6/5 | r1: SR-9; r2: SR-9; r3: SR-9 | SR-9 balance prop; the want/gesture/sensory language is inside IMAGINED, while the device itself is not expressly supplied. Founder decides the proposed prop-only correction/boundary; no control edit. |
| d4-sensory-speech-clean | 6/6/6 | r1: SR-9; r2: SR-9; r3: SR-9 | SR-9 balance prop; the want/gesture/sensory language is inside IMAGINED, while the device itself is not expressly supplied. Founder decides the proposed prop-only correction/boundary; no control edit. |

The exact D4 script sentences remain: `I want the balance to settle, but the stones make me hesitate.`; `I let my hands rest beside the balance.`; `The balance tilts, so I move it gently.`; `Morning light reaches the edge of the balance, and the market murmurs around me.` The thoughts, wants, hesitation, hands, motion, light and sound are allowed D4 content. Sonnet flags the word **balance** as a concrete device, not those allowed categories. The provided brief does not expressly supply that device. Do not generalise this to a ban on permitted imagination or assert a new historical device fact. The proposed changes are subject to founder decision; no fixture was rewritten. Tagged `Take your time` speech and `I think in grams` received no blocking finding in any new review.

Current actual findings, verbatim (full script sentences/boundaries above):

- `lego-facts-control` repeat 1 (5): SR-2: Narration is 215 words, about 89 seconds, below the 96-144 second range for a 2-minute target; add on-brief material or expand allowed transitions to reach about 290 words.
- `lego-facts-control` repeat 2 (6): SR-2: Length misses the target. 215 words is about 89 seconds, under the 96-second floor of 120 seconds minus 20%. Add about 20-30 words of brief-supported narration.
- `lego-facts-control` repeat 3 (6): SR-2: Narration is 215 words, about 89 seconds, below the 96-second minimum for a 120-second target; add compliant, non-factual narrative transitions to reach about 240-290 words.
- `lego-rhetoric-control` repeat 1 (6.5): SR-2: Narration is 215 words, about 89 seconds at 145 wpm, below the 96-second minimum of the 120s ±20% target; add roughly 20 words of brief-supported content.
- `lego-rhetoric-control` repeat 2 (6): SR-2: 215 words is about 89 seconds, outside the 120 s ±20% target (96-144 s). Add roughly 25-70 words of allowed-fact narration, not repetition.
- `lego-rhetoric-control` repeat 3 (5): SR-2: Narration is 215 words, about 89 seconds, outside the 2-minute plus or minus 20% target (96-144 seconds); add roughly 20-60 brief-supported words.
- `d4-imagined-clean` repeat 1 (5.5): SR-9: "I want the balance to settle" and "beside the balance" add a specific weighing device not in the brief. Use "the weights" or a hand gesture instead.
- `d4-imagined-clean` repeat 2 (6): SR-9: 'I want the balance to settle' and 'beside the balance' add a balance, a concrete prop not in the brief. Say 'I want my hands steady' and 'beside the stones'.
- `d4-imagined-clean` repeat 3 (5): SR-9: "I want the balance to settle" and "beside the balance" add a weighing device not in the brief, which lists only cubical stone weights. Use "the stones" or "my hands" instead.
- `d4-sensory-speech-clean` repeat 1 (6): SR-9: "The balance tilts" and "edge of the balance" add a specific weighing device not in the brief. Use "The stone feels heavy in my fingers" and "Morning light reaches my hands."
- `d4-sensory-speech-clean` repeat 2 (6): SR-9: [H4][H6] 'The balance tilts' and 'edge of the balance' add a specific weighing device not in the brief; use 'the stone feels heavy in my hand'.
- `d4-sensory-speech-clean` repeat 3 (6): SR-9: 'The balance tilts' and 'edge of the balance' add a specific weighing device not in the brief [H4][H6]. Use 'the stone feels heavy in my hand' or similar.

### What the reviewer fix did and did not establish

The new prompt and code remove the invented requirement to narrate every DOCUMENTED fact, while preserving explicit must-include constraints, numeric/hedge verdicts and actual unsupported-detail findings. Three prior D4 control false-coverage findings and one negative-fixture false-coverage finding are corrected in free replays; the negative fixture retains its legitimate 777-coins concern. Zero of six new D4 reviews returns the false missing-DOCUMENTED-facts constraint. Code additionally protects narrowly exact, expressly permitted rhetoric from an SR-9 cap; no broad semantic or imagined-prop whitelist was added. The original Lego rhetorical lines produce zero SR-9 findings in six new reviews.

The prompt explicitly prohibits lowering scores for SR-3/4/5 or mandated openers/closers. Nevertheless, Sonnet still cites repetition/production-facing wording and gives Appendix A 5/4.5/5 with empty concern arrays. This is unresolved control/scoring acceptance, not a successful reviewer acceptance pass; code does not raise those scores or hide the raw replies. A model score is not reconstructed by inventing a floor at 7. The current D4 prop interpretation is deliberately visible for founder judgment. PR stays draft.

| Rule / control signal | Actual result |
| --- | --- |
| SR-1 / SR-7 / SR-8 | No new control findings; this was a control rerun, not a fresh negative-case detection run. Existing detection tables above retain their dated/model provenance. Numeric and currency/hedge security regressions pass offline. |
| SR-2 true length | 6/6 Lego reviews identify the actual length miss. |
| SR-2 false optional D4 coverage | 0/6 new D4 reviews, versus 3/6 prior D4 control reviews; four historical raw replays corrected including one negative fixture. |
| SR-3/4/5 advisory | Advice remains visible; Appendix A is still below 7 with no blocking arrays in 3/3. Advisory-score separation is not proven reliable. |
| SR-6 | D4 confirmed SR-9 outcomes stay at or below 6; explicit caps and no fabricated score increases verified in code tests. |
| SR-9 rhetoric | 0/6 Lego reviews flag the two explicitly allowed rhetorical lines. |
| SR-9 D4 prop | 6/6 D4 reviews flag balance; allowed thoughts/senses/speech are not independently flagged. The prop boundary/correction requires founder decision. |

### Spend, privacy and readiness

- Newly metered: **$0.529818 / $1.50**; average **$0.029434** per review. Remaining step allowance $0.970182, unused; no further paid calls planned. Every call reserved full output plus conservatively bounded input before dispatch.
- Historical metered $2.691271 + new $0.529818 = **$3.221089 known metered**. Historical unknown reservations **$0.219391 remain held, NOT released**. All-campaign conservative total **$3.440480**. The old $3 run remains stopped; this is a separately founder-approved additional step, not a reset or waiver.
- Evidence privacy: removed 29 historical response-header request identifiers; raw model replies, fixture snapshots and cost/token usage are unchanged. Both evidence JSON files contain no API keys, request/response headers or header identifiers, account/contact personal data, emails or IP addresses. Exact existing local credential values were compared in memory only and were absent; no values were printed. Historical public-person names in the fixtures are retained as necessary reference facts, not account identity metadata.
- Replay-first gates before spending: full **1,151 passed / 9 skipped**, focused **176 passed**, typecheck/build/lint passed. Post-run focused **196 passed**, including all eighteen new raw-response replays, original-fixture identity, durable budget and privacy checks. Final full verification recorded below.
- Current main `2c2e19c1a03d7715c4cba588a424a67cdf608c26` integrated in own worktree, already up to date; no new conflicts this round. Task doc remains whole from main. Only this task report and explicitly requested evidence files are changed under docs. Combined Sprint 4-5 acceptance after Task 5 applies; there is no Sprint 4 closure or real-upload hold. No merge, deploy or production generation performed.
- **Remaining**: founder decisions on the proposed original-control corrections/boundaries, plus reviewer control acceptance (especially Appendix A below-threshold scoring). Seven supplementary reviews from the stopped old run remain unattempted; no paid calls were silently added to complete them. **NOT READY.**

Final local verification: **1,171 tests passed, 9 skipped** across 145 test files; focused reviewer/LLM **196 passed**. Typecheck, build and lint passed. The original fixtures/proposed candidates/raw historical replay bytes remain unchanged; task6.md matches main whole. Evidence privacy and ledger tests pass; no scores or provider replies were edited.


## Founder-approved corrections and D2 implementation, in progress

Founder authorised (A) both Lego control length corrections (initially 240, finally 300 words each); (B) Appendix A elevator sentence changed to "Owners pushed automatic elevators."; (C) explicit IMAGINED SCENE PROPS policy in both D4 controls, listing stone/stone weights/balance, with unlisted incidental props soft SR-9 capped at 8. The five approved fixtures changed; immutable historical raw snapshots remain. New internal required scoreAudit records a rubric grade and rule-linked deductions; code excludes SR-3/4/5 and applies factual/brief caps, without a fixed passing floor or public output-shape change. Legacy raw replay mode is explicit and confined to historical tests. Policy cap numbers are excluded from factual numeric support. At that checkpoint, focused free tests were 226 passed and no new paid calls had been made. The completed pass is recorded below. PR remains draft.

Integrated origin/main `0f01ba97aee61bcfd84665c51d909c76654fd14a` (Registry Part A #108). Conflicts resolved in reviewer index, LLM client/test/types/registry, stage-failure, state-machine. Main client/thinking rewrite, registry-owned 16,000 output limit/reasoning policy, automatic cutoff retry and prior-attempt accounting retained; script-review purpose remains Sonnet 5.5. Removed reviewer-owned token limits. Format retry and native retries both book all completed calls. Task doc retained whole from main. Live harness reserves before every native HTTP request, including retries, under the new $0.60 ceiling. Final paid results are recorded below.

The final Lego corrections also satisfy the long rubric's absolute two-minute minimum, not only the +/-20% target window: both are 300 words (about 124 seconds at 145 wpm), using only supported facts and rhetorical recap. First/last lines, chapter questions, hedges and figures remain intact.

## Founder-approved five-control pass (2026-10-20)

The canonical fixture corrections are limited to the five approved controls. Each Lego script is 300 words (about 124 seconds at 145 wpm), above the absolute two-minute floor and inside the 120-second target window. Appendix A says ?Owners pushed automatic elevators.? The two D4 briefs explicitly list stone, stone weights and balance; a listed prop is allowed and an unlisted incidental prop is a soft SR-9 note capped at 8. Other factual additions remain disallowed. Historical fixture snapshots and raw replies are untouched.

Offline first: isolated Admin fixture passed; the full suite run with one worker passed **1,231 / 1,240 tests** (9 skipped, 149 test files passed, 1 skipped). A prior parallel run had one shared Admin database fixture collision; no Admin source was altered. Final focused reviewer/evaluation replay checks: **77 passed**; recovery-specific checks: **23 passed**; post-run immutable live-response replays: **16 passed**. Typecheck, lint, build, and the live-harness TypeScript check passed. The new source-bound proof hash is in the local offline proof.

| Approved control | Live Sonnet score, repeats 1/2/3 | Rule flags in factual/style arrays | Assessment |
| --- | --- | --- | --- |
| Lego facts | 6 / 8 / 9 | R1 SR-9: ?That is where the story began? after 2004; R2/R3 none | The single flagged transition is rhetorical and the score falls to the SR-9 cap in R1. Founder has not approved a fixture change for this sentence. |
| Lego rhetoric | 8 / 9 / 8 | None in all repeats | R1/R3 rubric reasons cite padding/repetition despite SR-3 being advisory. |
| Appendix A clean | 6 / 6 / 7 | R1 none; R2 two SR-9 plus two SR-2; R3 three SR-2 | R1 grade 6 is partly attributed to meta-commentary/thin visuals despite empty rule arrays; later flags concern the brief/story framing and require adjudication, not an automatic fixture edit. |
| D4 imagined clean | 8.5 / 8 / 9 | None in all repeats | Listed balance is accepted; no false missing-facts flag. |
| D4 sensory/speech clean | 9 / 8.5 / 9 | None in all repeats | Listed balance and permitted imagined content are accepted. |

The 15 live replies show that the earlier audit let the model put advisory reasons inside an opaque `rubricScore`; the code then accepted the lower base grade. After the paid run, the private wire audit was tightened to require named, eligible rubric deductions. Code reconstructs the base grade from 10 minus those deductions and rejects a lower unexplained grade or an advisory disguised as a rubric reason; it uses the existing single format retry and then fails closed. Historical paid replies are preserved and replayed through explicit legacy mode for provenance. The new native contract passes synthetic and archived offline tests, but **has not been tested in a fresh paid model pass**. The live scores above remain the actual pre-correction outputs, not revised estimates. They do not establish clean-control acceptance or readiness. No more fixture text was changed to improve scores. The PR remains draft. The remaining $0.229710 of this step was not spent.

Paid evidence: [task6-founder-decisions-evidence.json](task6-founder-decisions-evidence.json). All **15 native calls** returned HTTP 200 with `end_turn` and measured usage. One Windows atomic file replacement failed during Appendix A repeat 1; the temporary file already held its HTTP 200 response and token usage. That reply was replayed offline into the ledger at its measured **$0.033010** cost; no duplicate provider call was made. The resumed run skipped the three completed reviews. Total for this approved step: **$0.370290 / $0.60**. Historical known metered $3.221089 + this step = **$3.591379**. Historical reservations **$0.219391 remain held**, not released; conservative all-campaign total **$3.810770**. The ledger holds no keys, request/response headers, request IDs, email or account identifiers; the five approved fixture inputs, sanitized reply text, token usage, model, stop reason, HTTP status and cost. No production run, upload, merge or deployment occurred.

Current main `0f01ba97aee61bcfd84665c51d909c76654fd14a` (Registry Part A) was merged in this worktree. The task6.md task document remains whole from main. The revised combined Sprint 4?5 acceptance follows Task 5; Sprint 4 closure and a real YouTube upload are not prerequisites.

### Post-run D2 code correction

The model-produced rubric grade is no longer trusted as an unexplained base. The new required private `scoreAudit.rubricDeductions` lists only chapter-order, open-loop, factual-causality, brief-brand or hook-promise defects with points and a specific reason. The model-provided `rubricScore` must equal 10 minus those points. The reviewer rejects an inconsistent grade and rejects rubric reasons describing SR-3/4/5 advice (including repetition, filler, padding, awkwardness, pronunciation, meta-commentary and thin/static visuals). Explicit SR-3/4/5 rule deductions are still ignored. Eligible SR and rubric deductions remain, with the existing caps; there is no fabricated passing floor. The public review payload is unchanged. A missing or inconsistent audit receives the existing one format retry and otherwise fails closed with native usage preserved. The old paid responses have no new field, so their unchanged outputs are verified only in explicit archived replay mode. No further live calls were made after this code change.

Final post-correction verification: **1,249 tests passed, 9 skipped** across 150 passing test files (1 skipped); focused native-audit, saved-response replay, budget and consumer tests **44 passed**. Typecheck, lint and build passed. The earlier full lint attempt included temporary untracked recovery scripts; those scratch files were removed and the repository lint then passed. No provider calls occurred after the new score-audit contract.

## Revised D2 live acceptance under the remaining $0.60 step cap (2026-10-20)

Founder authorised only Appendix A clean ?3 and Lego facts ?3, with no further paid iteration if a control fails. Offline focused checks passed **41/41** and the isolated harness typechecked and linted before dispatch. Production script-review remained Sonnet 5.5, reasoning `off` (mapped to `between_tools` on the native wire), 16,000 output tokens; for this capped evaluation process only, the output limit was 2,560. Each native message used Anthropic?s free input-token count with a 2,048-token reservation margin and the full output limit before dispatch. The reviewer request **omitted temperature**, so it was **not set to 0**. No production setting changed.

Appendix A repeat 1 failed the revised audit after its one existing format retry. Both native requests returned HTTP 200, `end_turn`, valid JSON, no cutoff or provider error; input/output usage was 13,791/888 and 14,779/833 tokens. Both raw model replies proposed score **6.5**, below the pass bar of 7, but neither became an accepted review score. Each put a 1.5-point `brief-brand` rubric deduction on meta-commentary, which D2 explicitly excludes as an advisory rubric reason; the code rejected both and failed closed. Both also proposed a 2-point SR-2 brief finding. The exact flagged script sentence was: ?Those are the terms of this story: a worker who woke other workers, a pea shooter, dried peas, and sixpence a week.? In reply 1, the reviewer said the brief requires each chapter to be a story with ?but? and ?so?, while chapters mostly restate facts in meta-commentary rather than narrating events; it asked for scene-based narrative turns. Reply 2 gave the same reason and asked for scene-based but/so turns. The brief does contain that chapter-story requirement, so the merit of the broad SR-2 judgment is unresolved; the control was not edited. Neither reply gave an SR-9 finding.

The failed control stopped the run. Appendix A repeats 2?3 and all three Lego facts reviews were **not attempted**. [Sanitized D2 evidence](task6-d2-acceptance-evidence.json) records both raw replies, usage, preflight counts and stop reason. New measured spend **$0.074350**; this step now totals **$0.444640 / $0.60**, leaving **$0.155360** unused. Known metered cumulative **$3.665729**; conservative cumulative **$3.885120**. Both new calls were metered; no new reservation was held. The historical **$0.219391** consists of three failed calls lacking provider usage ($0.031893 in local results.json and $0.088256 + $0.099242 in comparison-round.json). These are conservative file-ledger allowances, not known provider charges or production database rows. They remain held because the original errors did not save enough evidence to prove their actual cost. They count in the cumulative conservative total but **do not consume the separately approved $0.60 step cap**. No more model calls were made.

Pass bar failed. PR #105 remains draft; no `gh pr ready`, merge, deployment, production generation or upload. The requested post-pass main/CI/ready sequence was not triggered. P12?s story-editor acceptance should use repeated controls and model comparison; this round adds no P12 implementation.

## Code-owned scoring acceptance: stopped at Appendix A repeat 3 (2026-10-20)

The private native audit now returns five rubric subscores and findings by SR rule. Code validates that any subscore below 10 cites a surviving objective concern, averages the five scores, and applies SR caps. The model's public score and deduction points are ignored. SR-3/4/5, weak scene work, rhetoric and recap advice cannot lower the grade. SR-2 is score-bearing only for an absent explicit chapter constraint. Public output shape and writer retry threshold are unchanged; historical replies retain their original replay path. The two saved failed Appendix A raw replies replay at 10, with the meta-commentary SR-2 dismissed. No fixture changed.

Sonnet 5.5 rejects non-default temperature, including 0, with HTTP 400 according to [Anthropic's compatibility documentation](https://platform.claude.com/docs/en/about-claude/models/extended-thinking-models). Temperature remains omitted; native evidence records null for all three calls. No trial 400 request was sent. Offline before spending: **1,241 passed, 9 skipped** (151 passing files, one skipped), typecheck, lint and build passed; focused compatibility/replay **107 passed**. The source-bound paid harness counted input tokens without charge, reserved a 2,048-token input margin and full response limit before each request, and stopped on the first failure.

| Control | Repeat | Code score | Flag |
| --- | ---: | ---: | --- |
| Appendix A clean | 1 | 10 | None |
| Appendix A clean | 2 | 10 | None |
| Appendix A clean | 3 | **6** | **SR-9** on "The operator's job did not remain as it had been". The reviewer called it unsupported because the brief gives only "today only a handful of operators" and suggested that exact wording. |
| Lego facts | 1-3 | Not run | Stopped at first failed control. |

The flagged sentence is a broad paraphrase/inference from the brief's handful-of-operators fact, not a new checkable historical event. The reviewer treated it as a hard brief-only invention and code correctly applied the SR-9 cap to its surviving finding. This fails the founder's bar; no further paid call, fixture edit or scoring iteration occurred. [Sanitized evidence](task6-code-score-acceptance-evidence.json) preserves all three accepted raw replies and usage. Each native call returned HTTP 200, `end_turn`, and metered usage. New spend **$0.105514**; the approved step totals **$0.550154 / $0.75**, leaving **$0.199846** unused. Known cumulative metered spend **$3.771243**; earlier unknown-usage reservations **$0.219391** remain held in local evaluation ledgers, making conservative cumulative **$3.990634**. Those reservations are not production budget rows and do not consume this step cap.

**NOT READY.** The six-run pass bar failed. PR #105 remains draft. Pulling main, confirming CI and `gh pr ready` were conditional on all six passing and were not performed. No merge, deployment, production generation or upload occurred. P12 story-editor acceptance should use repeated controls and model comparison; this task makes no P12 implementation change.

## Hard-cap confirmation step: built and replayed offline; live round not run (2026-10-21)

Code now confirms an SR-1 or brief-only SR-9 finding before it may cap a score at 6. For each such finding, code finds the quoted script sentence and makes one short call with the sentence and the brief's facts: is it supported by, or a paraphrase of, these facts? The cap of 6 applies only to a finding confirmed unsupported. A "supported" answer dismisses the finding before scoring (so it cannot lower a subscore either). An unreadable answer, or a finding with no quotable script sentence, stays visible but is capped at 8, not 6. Findings computed by code from the brief (exact-wording and numeric violations) are not re-asked. Archived legacy replays skip the step. `reviewRules` gained the line "a sentence that restates or summarises a supplied fact in other words is not a new claim". At most four confirmation calls run per review, and a failing confirmation call fails the review the same way a failing format retry does, with the completed calls booked. The public review payload is unchanged; `reviewScript` also returns `hardCapChecks` for evidence.

Offline first: the recorded run-3 reply (Appendix A, score 6, SR-9 on "The operator's job did not remain as it had been") replays to score 10 with the finding dismissed when the confirmation says supported, and to the old score 6 when it says unsupported; an unreadable confirmation gives 8. Quote extraction finds the script sentence for 180 of 181 recorded SR-1/SR-9 findings across the fixture and evidence files; the one miss is an archived finding about wording the founder has since corrected. All earlier replay tests pass unchanged. Full serial suite **1,249 passed / 9 skipped**; typecheck, lint, build and the new harness typecheck pass. A mocked-endpoint dry run of the new harness (no provider contact) exercised the ledger, reservation and pass-bar summary.

**Live round: not run.** The only Anthropic key in the project's env files (identical in the main and Registry A checkouts) was rejected with HTTP 401 at the free token-count preflight of the first Appendix A review. No message was sent, so **no spend and no calls**: the step total stays **$0.550154 against the raised $0.80 cap** (conservative cumulative $3.990634). The zero-call ledger is kept as `task6-hard-cap-confirmation-preflight-401.json`. Appendix A clean x3 and Lego facts x3 were not attempted, so the pass bar (all six at 7 or higher, no unconfirmed hard cap) is unmet. Main was not pulled and `gh pr ready` was not run; the PR stays draft.

Harness notes for the rerun (`scripts/accept-hard-cap-controls.ts`): the step ceiling is $0.80 counted from $0.550154; the evaluation-only output cap is 2,560 for reviews and 400 for the short confirmation call; the input margin is 1,024 tokens. Sonnet 5.5 rejects temperature 0 (non-default temperature returns HTTP 400), so neither the review nor the confirmation request sets one.

## Hard-cap confirmation: final live round passed (2026-10-21)

The two earlier attempts above failed at the free token-count preflight with HTTP 401 for a harness bug of mine, not a bad key. The new harness statically imported a value from `hard-cap-confirmation.ts`, which loads the app config before the harness sets the key, so the SDK sent no `x-api-key` header (confirmed by a spy that logged the preflight and exited before any message). The value import is now dynamic, after the key is set; the harness's own preflight returned HTTP 200 before the paid run. Offline proof hash was recomputed for the changed harness.

Appendix A clean x3 and Lego facts x3 ran under the raised $0.80 step cap, counted from $0.550154. All six returned HTTP 200 / end_turn, scored **10, 10, 10, 10, 10, 10**, and returned no factual or brief findings. The pass bar (all six at 7 or higher, no unconfirmed hard cap) is met. Because no review raised an SR-1 or brief-only SR-9 finding, **no confirmation call was made, so the confirmation call itself was not exercised live**; it is covered offline (recorded run-3 reply: dismissed when supported, capped at 6 when unsupported, 8 when unreadable) and by a mocked-endpoint dry run. The request set no temperature (Sonnet 5.5 rejects temperature 0 with HTTP 400); evidence records null for all six calls.

Calls and cost (input/output tokens, USD): Appendix A 13,495/1,180 $0.038790; 13,495/699 $0.033980; 13,495/731 $0.034300. Lego facts 9,403/568 $0.024486; 9,403/640 $0.025206; 9,403/640 $0.025206. New spend **$0.181968**; step total **$0.732122 / $0.80**, $0.067878 unused. Known metered cumulative $3.953211; conservative cumulative **$4.172602** (the $0.219391 of earlier unmetered reservations remains held). Evidence: [task6-hard-cap-confirmation-evidence.json](task6-hard-cap-confirmation-evidence.json). The earlier zero-call 401 ledger is kept as `task6-hard-cap-confirmation-preflight-401.json`. No production generation, upload or deployment.

## Post-merge live detection check (2026-10-21)

Branch `SPRINT5_TASK6_POSTMERGE_CHECK` was cut from `main` at `ed9faa5` (PR #105 merged); worktree `D:\Study Material\7AI-SPRINT5\task6-postmerge`; PR #110. No code changed. The task doc was synced to r4 as the first commit. The only code run was an uncommitted one-off harness, derived from the merged `accept-hard-cap-controls.ts`, that ran the two drafts once each and applied the pass bar. Before the paid run, full serial tests (**1,249 passed / 9 skipped**), typecheck, lint and build passed in this worktree, the harness passed a mocked-endpoint dry run, and its free token-count preflight returned HTTP 200.

The check ran the merged reviewer (Sonnet 5.5, long form, brief-only, no temperature, evaluation output cap 2,560 for the review and 400 for each confirmation) on the two recorded invented-fact scripts, `lego-draft-1-excerpts` and `lego-draft-2-excerpts` (synthetic excerpt fixtures built from the architect's Appendix B). **Pass bar met for both:** each got SR-9 flags, the confirmation call fired for every flagged sentence and answered "unsupported", and the score is capped at 6.

| Draft | Quoted sentence | Confirmation answer | Score | Cost (review + confirmations) |
| --- | --- | --- | --- | --- |
| Lego draft 1 | "Shelves that once overflowed with colorful bricks grew thin." | unsupported: the brief says nothing about store shelves or availability | **6** | **$0.032132** |
| Lego draft 1 | "Workers who once managed amusement parks were replaced by designers again." | unsupported: the facts only say the Legoland parks were sold in 2005 | (same review) | (same review) |
| Lego draft 2 | "The factory floors grew quiet, and the offices that once buzzed with new ideas sat empty and still." | unsupported: a specific scene the facts do not contain | **6** | **$0.032708** |
| Lego draft 2 | "Store shelves that once sat half empty were now stacked high with boxes." | unsupported: shelves half empty or stacked with boxes are not in the brief | (same review) | (same review) |

Each review returned two SR-9 findings, both confirmed, so each draft cost one review call and two confirmation calls. All six native calls returned HTTP 200 / end_turn with metered usage. Review calls: 9,174/876 and 9,149/927 input/output tokens, $0.027108 and $0.027568. Confirmation calls were 928 to 940 input and 65 to 74 output tokens, about $0.0025 each. This is the first live run of the confirmation call.

New spend **$0.064840**; step total **$0.796962 of the raised $0.90** ($0.103038 unused), counted from $0.732122. Known metered cumulative **$4.018051**; conservative cumulative **$4.237442** (still including the $0.219391 of earlier unmetered reservations). Evidence: [task6-post-merge-live-detection-evidence.json](task6-post-merge-live-detection-evidence.json) holds the six raw replies, usage and the per-finding confirmation verdicts. No production generation, upload or deployment.

Before marking ready I fetched and pulled `main` (no new commits since `ed9faa5`, so no conflicts to resolve), re-ran tests, typecheck, lint and build, and checked that the PR touches only docs allowed by Hard rule 6: this task's doc (identical to the architect's r4 source), this report and the evidence file.
