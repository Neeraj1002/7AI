# Sprint 5 Task 6: Script Review Rules SR-1 to SR-9 (Backend)

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting**, then [WORKFLOW](../WORKFLOW.md). Use `task6` under the shared Sprint 5 root (`D:\Study Material\7AI-SPRINT5`), your own worktree off fresh `main`, branch `SPRINT5_TASK6_BE`, one PR. Record the branch in your row of `sprint5/STATUS.md` when you create it, and write only your own row and your own report.

**Keep replies and tool output short: no step-by-step narration, read only the files you need, one-line status messages.**

**Revision**: r5, 2026-10-21, live detection check passed (PR #110); one offline fix left: hedge word must sit next to its figure.

**Written**: 2026-10-18 by the architect chat, at the founder's request. **Status**: PR #105 MERGED (20 Oct, by the founder). Open: one small follow-up PR with a live detection check (see Addendum r4). Not deployed yet. **Priority**: P0 for the first public long video.

**Objective**: make Script Review enforce the nine rules in the [miss log](../../../review_tuning/SCRIPT_REVIEW_MISSES.md) (SR-1 to SR-9), so a score of 9 or 10 really means "safe to publish as is", and a script that invents facts, drops a hedge or breaks a brief constraint is flagged and held back. Every long-form video is published publicly on a real channel; today a script with two invented facts scored 8 out of 10.
**Duration**: 2 to 3 days.
**Depends On**: Task 4 (evidence packet and the minimal reviewer adapter, #94) and Sprint 4 Task 10 (long-form review) merged on `main`. Check `sprint5/STATUS.md`.
**Owning Component**: `studio/src/agents/script-review/` (prompt, output handling, score calibration), a new pure-function checks module beside it, and the eval fixtures in `studio/src/content-evidence/fixtures/`. **Not** in scope: the evidence packet itself (Task 4), Gate 1 screens (app), the writer.
**Success Criteria**: (1) replaying the six miss-log cases, each recorded miss is flagged under the right rule and the score never reaches 9 when an SR-1, 2, 7, 8 or 9 issue is present, enforced in code; (2) a script with a dropped hedge, an invented number and an invented detail is flagged in the Appendix A brief test; (3) a clean control script is not blocked; (4) Shorts and long-form both covered; output shape, threshold 7, the three automatic retries and Gate 1 behaviour unchanged; (5) full tests, `tsc`, `eslint` pass.

## Decisions (defaults apply unless the founder says otherwise)

- **D1, strictness of SR-9 for long-form (brief-only):** an invented claim caps the score at **6** (same as SR-1), which sends it back to the writer automatically with the concern. Alternative: cap at 8, so it reaches Gate 1 with the concern shown. Default: 6, because the founder's rule for long videos is "use only the facts in the brief".
- **D2, SR-3, SR-4, SR-5 (filler, spoken clarity, TTS risk):** advisory. They are listed as concerns but never change the score.
- **D3, reviewer model (decided by the founder, 18 Oct):** long-form script review runs on Sonnet 5.5 (`claude-sonnet-5-5`), a few cents more per review. Shorts stay on the current reviewer model only if it passes the same acceptance. R5.3 reports detection, false flags on the control and cost per review for both models. R2 also changes: a hedge dropped from a hedged brief number, and a number with no match in the brief (after normalising numbers and currency forms; derived arithmetic stays a hint), are code-level verdicts; names and soft cases stay hints.
- **D4, imagined passages (added 18 Oct and widened later the same day, channel "Not In Your Textbook" story-feel style):** a brief may contain an IMAGINED allowance (the narrator's thoughts, feelings, wants and small worries, body sensations, weather, light, sounds, smells, small gestures, unnamed neighbours, and up to two short everyday speech lines by unnamed people, each with a speech tag) next to numbered DOCUMENTED, INFERRED and COMMENTARY-ONLY facts. The reviewer reads the allowance as part of the brief: text inside it is **not** an invented claim and must not trigger the cap at 6. Numbers, dates, names, places, prices, rules, beliefs or rituals outside the facts remain invented claims. The code-level checks (R2) apply to them unchanged. Fixture: one first-person script that stays inside its allowance must pass; one that invents a number or a name must be capped. A first-person narrator using modern units or terms (grams, BCE, "years ago") is an advisory note, not a cap. Second fixture: a script that shows feeling through the hands and senses and contains one everyday speech line with a speech tag must pass; one that gives a speech line a number, a name or a fact, or invents words for a real named person, must be flagged.
- **D5, control fixtures are corrected where they break the brief (founder, 2026-10-19):** the round 3 audit showed the Lego controls fail the brief's minimum length (215 words, about 89 s, minimum 96 s) and the Appendix A "clean" script contains an invented causal link ("But the answer from owners was to push automatic elevators."). Correct the two Lego controls to meet the minimum length (the founder's edited 273-word script fits) and change the Appendix A sentence to "Owners pushed automatic elevators." A control must obey its own brief; never loosen a constraint to make a control pass. No other fixture is changed without the founder.
- **D6, scene props in the IMAGINED allowance (founder, 2026-10-19):** the IMAGINED allowance gains a "scene props" line (everyday objects the narrator handles or sees). A prop listed there is allowed. A prop not listed (for example "the balance" in the two D4 fixtures) is a soft SR-9 note: it caps the score at **8** (so a human sees it at Gate 1), not at 6. Numbers, dates, names, places, prices, rules, beliefs and rituals stay hard invented claims (cap 6). Add the props line to both D4 fixture briefs ("a balance, small stones"), so the two D4 scripts stay clean.
- **D7, advisory notes never lower the score (D2 made explicit; founder, 2026-10-19):** after the rerun the controls still scored 4.5 to 6.5 with empty factual arrays, because the reviewer deducted for repetitive or production-facing narration (SR-3, 4, 5). Fix the reviewer prompt (and the output handling if needed) so the score reflects only factual accuracy, brief compliance (SR-1, 2, 7, 8, 9) and the rubric; SR-3, 4, 5 are listed as concerns without a deduction. A script with no factual or brief flags must not be sent back for a retry because of advisory notes.

## R0. Read the code first

Table in the report: each item below **confirmed** or **wrong (what is really there)**. The architect could not read the code from the chat. Open: `script-review/index.ts` and its tests, the long-form rubric (Task 10 R1), the Task 4 adapter and `content-evidence/packet.ts`, `fixtures/sr-pre-gate.json`, and how the writer receives reviewer feedback on a retry.

1. Output shape today: score, `factualConcerns`, violations and sources, as shown at Gate 1. Where would each rule's finding go with no shape change and no app change? Plan: SR-1, 7, 8, 9 findings go in `factualConcerns`; SR-2 findings go in the brief-violation list; SR-3, 4, 5 go in the existing general concerns list with an `SR-n:` prefix. If the existing shape cannot carry them, add optional fields only and tell the founder what the app would need.
2. Threshold 7, up to three automatic retries, escalation to Gate 1 after that (Sprint 3/4): unchanged. Does the writer's retry prompt include the reviewer's concerns? If not, add that (R4).
3. The evidence packet: for long-form the policy is `brief-only`; for Shorts it is the resolved policy. Source URLs are unfetched and prove nothing.

## R1. Rule text in the reviewer

Put SR-1 to SR-9 into the reviewer prompt for **both** Shorts and long-form (long-form keeps its Task 10 chapter criteria and its +/-20% length rule). Use the miss log's wording as the source, adjusting length-specific text (SR-3's "~2.5 s per sentence" applies to Shorts only; for long-form use "adds no new fact, tension or payoff"). The evidence block comes from Task 4's packet only; do not add a second input path. Under `brief-only`, SR-9 means: every fact, number, name, date and vivid detail must trace to a brief line. Under any other policy, a claim must trace to the brief or to supplied source **text**; a URL alone supports nothing.

## R2. Cheap checks before the model call (hints, not verdicts)

New pure module (for example `script-review/brief-checks.ts`), no model, no network. From the brief and the script it produces **candidate flags**:
- numbers, years and spelled-out numbers in the script that are absent from the brief (after normalising "50", "fifty", "more than 50");
- capitalised names and terms in the script absent from the brief;
- absolutes in the script ("none", "all", "always", "never", "every", "nobody", "entire", "completely") not present in the brief (SR-8);
- hedge words present in the brief ("about", "around", "largely", "mostly", "estimates", "at most", "only a handful", "more than", "over", "did not fall as...") whose sentence in the script no longer carries them (best effort);
- exact-wording constraints in the brief ("first sentence must be exactly: ...", "last sentence must be exactly: ...", "use these exact hedge words: ..."): checked by string comparison; a mismatch is an SR-2 violation without asking the model.
Candidates go into the reviewer prompt as hints to confirm or dismiss. Only the model's final list, plus the exact-wording string mismatches, counts. Derived arithmetic (for example "nearly three days" computed from brief numbers) must not be flagged by hints alone. Log hint precision in the report (how many hints the model confirmed).

## R3. Score calibration in code

After the model answers, apply the caps in code, so a model that ignores the rule cannot score high:
- any SR-1 concern (and any SR-9 concern under D1): score at most **6**;
- any SR-2, SR-7, SR-8 or SR-9 issue: score at most **8** (SR-6);
- SR-3, 4, 5: no effect on score (D2).
The reason is added to the reviewer's concerns text ("capped at 6: SR-9, claim not in brief: 'copper nails torn loose from ships'"). A capped score below 7 triggers the existing automatic retry; the retry count and cost limits are unchanged.

## R4. Retry feedback

On an automatic retry, the writer receives the reviewer's SR concerns verbatim (what to remove or fix). R0 says whether this already happens; if it does, only verify it with a test. A script that still fails after the last automatic retry reaches Gate 1 with the concerns visible (existing behaviour).

## R5. Evaluation fixtures and a small real-model check

1. Extend `fixtures/sr-pre-gate.json` with the six miss-log cases, the Task 9 test script (two invented facts, scored 8), a clean control script, the two Lego drafts of Appendix B (each scored 8/10 by the current reviewer, with the brief's allowed facts as the control), and the Appendix A brief with three scripts: clean, one with a dropped hedge ("None of it worked"), one with invented details.
2. Unit tests (mocked model): caps applied, exact-wording mismatch caught, hints never become verdicts on their own, output shape unchanged for old callers.
3. One budgeted real-model run on the dev database or fixtures only: each fixture three times with the real reviewer. Report per rule: detected in how many of 3, false flags on the control, and the total cost (spend ceiling **$3**; stop and report if it would exceed that). No production data, no publish, no paid image or video work.

## Not in this task

Web search or any retrieval (open founder decision), a new model or agent, new settings, editing the pass threshold or retry count, Video Review rules, the evidence packet, any app screen, editing past production scripts. Do not rebuild Task 4's adapter.

## Acceptance criteria

All five Success Criteria above, plus: each rule SR-1 to SR-9 has at least one test that fails without it; the report lists every rule with where its finding appears at Gate 1.

## Schema Impact

None expected (prompt, code and fixtures only). If R0 shows a stored shape must change, stop and report before adding a migration.

## Business Logic / State Transition

No new states. Script Review still returns a score and concerns; Gate 1, auto-approval (Gate 1 off passes scripts scoring 7 or more) and the retry loop behave as before. The only change is that the score cannot exceed the caps in R3. Update `BUSINESS_LOGIC.md` with the cap table.

## Testing

Studio `npm run build`, `npm run lint`, `npm run typecheck`, and `npx vitest run` for `agents/script-review`, `content-evidence` and the fixtures. Report anything skipped as skipped, not passed.

## Report

`docs/execution/sprint5/reports/task6.md`: the R0 table, one section per requirement, the per-rule detection table from R5, hint precision, the real-model cost, deviations, and the one-line status to the founder. After it merges the founder reads Gate 1 concerns on a real long video as part of the combined acceptance test.

## Definition of Done

Merged PR; tests pass; the R5 table shows each rule detected on its miss-log case; the control is not blocked; no change to threshold, retries, Gate 1 or the app. Code-complete, merged and deployed are reported as separate statements.

## Appendix A: long-form brief for the evaluation (founder's own, 2026-10-13)

Topic: four jobs that machines took over before AI, and what happened to the workers, Britain and America, 1900s to today. Constraints: about 1,240 words; four chapters in order (knocker-upper, elevator operator, human computers, bank teller), each told as a story with "but" and "so", each opening with the question it answers; **use only the facts in the chapters, no other facts, numbers, names, dates or details; no predictions about AI**; first sentence exactly "Today, many people worry that AI will take their job. People have worried about machines before, and history kept the receipts."; last sentence exactly "The cash machine didn't end the bank teller. The phone in your pocket did."; exact hedge words "around 1900", "about 1.5 million", "more than 50 years", "only a handful", "over 400,000", "did not fall as ATMs rolled out"; no dollar conversions; Dorothy Vaughan only through scenes and silhouettes, never as a portrait. Chapter facts (abridged): knocker-uppers woke workers with long sticks; Mary Smith in London's East End used a pea shooter and dried peas, 1900s to 1930s, sixpence a week, retired 1934; cheap alarm clocks ended the job. Automatic elevators invented around 1900 but not trusted; 1945 New York strike, about 1.5 million office workers stranded; owners pushed automatic elevators; calm recorded voice, red stop button, emergency phone; more than 50 years to feel normal; today only a handful of operators. NACA human computers; Dorothy Vaughan joined 1943, acting head of West Area Computers 1949, first Black supervisor at NACA; electronic computers arrived 1961; she taught herself FORTRAN and taught her co-workers; retired 1971. ATMs from the 1970s, over 400,000 in the United States; teller jobs did not fall as ATMs rolled out; branch tellers fell from 20 to 13 between 1988 and 2004, city branches rose 43 percent; teller job became helping customers; numbers fell later in the smartphone era.

## Appendix B: Lego brief, two live misses (founder's acceptance run, 18 Oct 2026)

Brief (2-minute Video, channel Underdogs): "Lego's recovery from financial crisis to market leader, 2003-2015". Allowed facts and nothing else: in 2003 a shortfall of about 1.4 billion Danish kroner, roughly 220 million dollars; in 2004 almost a thousand workers laid off and the owner put about 800 million kroner of his own money in; instead of chasing growth it went back to basics; in 2005 it sold its four Legoland theme parks for 375 million euros, to focus on its core toys; ten years later, in the first half of 2015, it outsold Mattel, 2.1 billion dollars against 1.9 billion, becoming the world's biggest toy company by sales. Constraints: first sentence exactly "In 2003, Lego was losing money fast."; last sentence exactly "Lego won by going back to the brick."; each chapter opens with a question; hedge words "about", "roughly", "almost", "by sales"; no logos or brand lettering in pictures. Scene ideas from the brief: plain plastic bricks, a quiet empty office, workers leaving a factory, a theme park with rides, children building with bricks, busy toy store shelves.

- **Draft 1** (scored 8/10, "strong narrative arc"). Correct: exact first and last sentence, question openers, hedge words, all figures. Invented or unsupported: "Shelves that once overflowed with colorful bricks grew thin"; "the board couldn't look away"; "letting go of people who had built the company brick by brick"; "betting everything on a future he couldn't yet see"; "Lego could have chased the trend, building bigger parks, flashier attractions"; "Workers who once managed amusement parks were replaced by designers again"; "It was a quiet admission, hard-won, that the brick itself was the brand"; "Ten years after near collapse... not for survival, but for the crown"; "a title it hadn't held in years" (likely false); "piling colorful sets into carts, grandparents watching with memories of decades past"; "It was strategy, sacrifice, and the slow rebuilding of faith". Dropped brief fact: "to focus on its core toys".
- **Draft 2** (also scored 8/10, from a second run). Correct: first and last sentence, hedges, figures. Invented or unsupported: "The factory floors grew quiet, and the offices that once buzzed with new ideas sat empty and still"; "had chased bigger ambitions... but the growth never came"; "packed up their desks and walked out the factory doors for the last time, the company shrinking just to survive"; "unwilling to watch his family's legacy crumble"; "betting everything on a future that was far from certain"; "chasing theme parks and spinoffs"; "trading roller coasters"; "decades earlier"; "It was a risky bet"; "piling colorful bricks back onto quiet shelves"; "For years, the outcome was uncertain"; "Store shelves that once sat half empty were now stacked high with boxes". Dropped brief facts: "to focus on its core toys" and "ten years later".
- **Clean control** (the founder's edited script, used in the video; it still has a few harmless rhetorical lines): about 273 words in three chapters using only the allowed facts and scene ideas. Under SR-9 with brief-only, "It was a hard time for everyone involved" and "make the brick the center of everything again, and trust it" are rhetoric, not claims; they must not be capped.

## Addendum r3 (2026-10-19, after the round 3 audit)

- **Status**: PR #105 stays a draft. CI passes; the Sonnet rerun cost $0.529818; cumulative spend with the $0.219391 of test-harness holds is $3.44 against the founder's $4.50 ceiling. Those holds live in the evaluation harness's own result files, not in the database, so they are not a production leak.
- **Do now**: apply D5, D6 and D7. Test with the recorded replays first. Then one live re-run of the five controls only (Lego facts, Lego rhetoric, Appendix A clean, D4 imagined, D4 sensory speech), capped at $0.60. Report per control: score and flags. Mark the PR ready only when the controls pass and CI is green on the latest push.
- **Git and docs**: Hard rules 5 to 7 apply. Hard rule 7 replaces the sentence at the top of this file about writing your row in `sprint5/STATUS.md`: do not edit `STATUS.md`; give the branch name in your first reply and the top of your report. The latest task doc is in the founder's docs folder; sync it into your branch with the code.
- **Architect follow-up (not agent work)**: add the scene-props line to the NIYT brief structure in `channel_bibles/NIYT_CHANNEL_CONFIG.md` after the founder's go-ahead.

## Addendum r4 (2026-10-20, after the merge)

- **Status**: PR #105 is merged to `main` (founder, 20 Oct). Code-complete and merged: yes. Deployed: no. Live detection check: not yet (follow-up PR below).
- **What was built (from the agent's PR description)**: code computes the review score (the average of five rubric subscores, then the SR caps); the model returns findings and subscores, not a free overall score, so advisory notes (SR-3, 4, 5, weak or recap sentences) never enter the formula. SR-2 fires only when a required constraint is missing from a chapter. A confirmation step for hard-cap findings (SR-1, SR-9): code makes one short call with only the quoted sentence and the brief's allowed facts, and the hard cap applies only when confirmed. Rule line added: a sentence that restates or summarises a supplied fact in other words is not a new claim. Sonnet 5.5 rejects temperature 0, so no temperature is set.
- **Evidence**: Appendix A and Lego facts, three live runs each, all six scored 10; offline replays include the run-3 false SR-9 ("The operator's job did not remain as it had been": 10 when confirmed supported, 6 when unsupported). CI green on `474466b`. The two earlier 401 errors came from a harness import-order bug in the agent's test script (no spend), not from the API key.
- **Spend**: this step $0.732122 of the $0.80 cap; cumulative (conservative, includes $0.219391 of harness holds) $4.172602 of the $4.50 approved.
- **Caveat and why a follow-up is needed**: no live review raised a hard-cap finding, so the confirmation call has never run live, and detection of real invented facts was not re-checked live after the prompt and scoring changes. A fault there would let invented facts through silently.
- **Do now (small follow-up PR, new branch off latest `main`, no code change unless the check fails; step cap raised to $0.90 by the founder)**: run Lego draft 1 and Lego draft 2 (the two recorded invented-fact scripts) once each against the live reviewer on Sonnet 5.5. Pass bar: each gets an SR-9 flag, the confirmation call fires and confirms it, and the score is capped at 6. Report per draft: quoted sentence, confirmation answer, score, cost. If a draft passes uncapped or the confirmation call never fires, stop without more spend and report; the fix decision is the founder's. If both pass, the PR holds only the report update and the evidence file; pull `main`, confirm CI, mark ready. Hard rules 5 to 7 apply.
- **Founder actions**: merge the follow-up PR when green; deploy; run the Script Review part of the combined test (T09 area) after deploy.

## Addendum r5 (2026-10-21, after the live detection check and Task 8's finding)

- **Status**: PR #110 (live detection check) is ready, CI green. Result: Lego draft 1 and draft 2 each got two SR-9 findings, the confirmation call fired and confirmed all four as unsupported, and both scores were capped at 6 (cost about $0.032 per draft). The detection concern in Addendum r4 is cleared. Merge is the founder's; after the merge the agent closes the task per Hard rule 8.
- **New defect found by Task 8 (merged code, no task covers it)**: the numeric check in `numericVerdicts` treats a hedge word as covering a figure when it appears anywhere in the same sentence. "Around" in "How Lego Turned Around Its $220M Crisis" is a verb particle, so the unhedged figure is not flagged (Task 8's test records this). The same sentence-level check runs on script text, so "Around the same time, it lost $220 million" would pass unhedged. This lets unhedged figures through.
- **Do now (small follow-up PR, new branch off the latest `main` after #110 is merged and closed; offline only, no live calls)**:
  1. A hedge word counts only when it is adjacent to the figure it hedges: within the two or three words before it, not anywhere in the sentence. Read the real code first and confirm where the match is made; do not assume.
  2. Required behaviour, each with a test: "Turned Around Its $220M Crisis" is flagged; "Around the same time, it lost $220 million" is flagged; "around 1900", "about 1.5 million" and "roughly 220 million dollars" still pass.
  3. Add Task 8's Lego title case ("How Lego Turned Around Its $220M Crisis") as a test, and update the Task 8 test that records the gap if it lives in a file this PR may edit; otherwise tell the architect which test needs updating after both PRs merge.
  4. Replay the existing fixtures (miss-log cases and all controls): no control may change score. No live calls, no spend.
  5. Hard rules 5 to 7 apply (sync this doc first, pull `main` before ready). Then close per Hard rule 8.
- **Founder actions**: merge #110, then the follow-up; deploy; run the Script Review part of the combined test.

## Links

[Miss log](../../../review_tuning/SCRIPT_REVIEW_MISSES.md) · [Task 4](task4.md) and its [report](../reports/task4.md) · [Sprint 4 Task 10](../../sprint4/tasks/task10.md) · [WORKFLOW](../WORKFLOW.md) · [Acceptance plan, Sprint 4 and 5](../SPRINT4_5_ACCEPTANCE_PLAN.md) (once on `main`)

## Revision log
- r1, 2026-10-18: first issue.
- r2, 2026-10-18: round 2 instructions (real-model acceptance, Sonnet 5.5 for long-form).
- r3, 2026-10-19: D5 (correct fixtures that break the brief), D6 (scene props, soft cap 8), D7 (advisory notes never lower the score); status and next steps.
- r4, 2026-10-20: PR #105 merged; Addendum r4 (what was built, evidence, spend, caveat, follow-up live detection check with cap $0.90).
- r5, 2026-10-21: live detection check passed (PR #110); Addendum r5: hedge word must be adjacent to its figure (found by Task 8, offline fix, small follow-up PR).
