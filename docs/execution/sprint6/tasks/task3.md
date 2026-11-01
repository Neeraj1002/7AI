# Sprint 6 Task 3: Story Tests, angle pairing, cold-reader on the script, learning record (P19, first slice of P12)

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow, the Hard rules (5 to 9: task doc sync, pull `main` before ready, who owns which doc, close after merge, same-cause sweep), the `STATUS.md` rule and the report shape. This file states only this task's specifics. Keep every reply to the founder to 3 lines; only the report is long. Do not edit `STATUS.md`, `PLAN.md` or any doc except your own report and the docs named in the Report section.

**Revision**: r8, 2026-11-01 (log at the end) (architect finalised r1: P19 naming, Task 2 and Task 1 references brought up to date, a prompt-review step, a P16 overlap check).

**Written**: 2026-11-01 by the task-writer chat, at the founder's request, from the founder-approved design (not redesigned here). Finalised by the architect the same day. **Status**: not started; all eight founder decisions and the spend ceilings are answered (1 Nov); starts when the architect hands it to the agent and this doc is merged. **Priority**: P2 (P19, the first slice of P12; P12 keeps the story writer, story editor and taste library). Note: P16 in `PLAN.md` is creative direction per channel, a different item. **Branches**: `SPRINT6_TASK3A_BE`, `SPRINT6_TASK3B_BE`, `SPRINT6_TASK3C_BE` (add `_FE` branches only if R0 shows the card is too big to share a PR); worktrees `task3a`, `task3b`, `task3c` under `D:\Study Material\7AI-SPRINT6`. Give branch, worktree and PR in your first reply and at the top of the report (Hard rule 7).

## Founder decisions (all eight answered 1 Nov; kept here as the record)

1. **DECIDED 1 Nov (founder): Part B swipe-away threshold** is the first two sentences for Shorts and the first ~15% of the script for long-form.
2. **DECIDED 1 Nov (founder): one neutral reader persona for every channel**: "a stranger scrolling their feed, no prior interest in this subject, ready to swipe if bored." No per-channel line is written now. Code still reads one optional per-channel string (empty by default) so a line can be added later without a code change; it must never name a channel or niche.
3. **DECIDED 1 Nov (founder): the Part B card shows at Gate 1 only.** Gate 2 has no new information for it.
4. **DECIDED 1 Nov (founder): Part A covers Shorts and long-form in this task.** Build and live-check Shorts first (the kind that ships daily), then long-form in the same task and PRs. Long-form is not deferred to a new task. R0 reports any difference between the two kinds at the intake-to-script step; the live checks include one Short and one long-form run.
5. **DECIDED 1 Nov (founder): yes.** One server-side switch for the whole feature (a deploy-time flag, not a channel setting), and a "write from the brief" (skip) choice on the Part A card.
6. **DECIDED 1 Nov (founder): when Part A is skipped, nothing is inferred.** The promise-match step records "not run: no chosen angle" and cannot cause a FAIL.
7. **DECIDED 1 Nov (founder): spend ceilings confirmed** as proposed in the Spend section ($0.10 per run for Part A, $0.15 per run for Part B, $1.50 ceiling for all live checks; the live checks include one Short and one long-form run).

8. **DECIDED 1 Nov (founder): yes, one small migration.** Add `paused_angle` to `pipeline_runs_status_check` (migration `20260907122134_foundation_schema` holds the current check; add a new migration, never edit that one). One line of SQL, no new table or column. The angle data itself needs no migration (it lives in the intake stage's JSON output, the way Task 1 keeps `output.packaging`). Reusing `paused_gate1` was rejected (it would show Gate 1 buttons on a run with no script). The migration is part of PR A; describe the SQL to the architect in the PR description and follow the migration rollout runbook the way `execution/sprint5/runbooks/task2-rollout.md` did.

## Objective

Find out whether a story is worth watching **before** money is spent on it, then check the finished script. Three parts, built in this order:

- **Part A, angle pairing** (before the script is written): one call proposes 4 to 5 angles (a title and a one-line promise each); a blind reader makes a forced choice twice with the order reversed; plain code marks "clear winner" or "no clear winner"; the founder picks one angle on a card before the script step starts.
- **Part B, cold-reader on the finished script** (before Gate 1, advisory): a reader sees only the script text and answers six questions as JSON; plain code gives PASS or FAIL; the founder sees a card at Gate 1 and decides.
- **Part C, learning record**: store everything a later comparison needs, tag every run with the pipeline version that made it, and report (not build) what retention data analytics stores today.

All of it is **advisory**. The readers never decide, never change a score, never trigger a writer retry.

**Duration**: to estimate after R0 (three PRs, see Delivery).
**Depends On**: the intake and script steps, Gate 1, Script Review (Sprint 5 Task 6, merged per its doc; confirm on `main`), the LLM Registry (`sprint5/bugs/tasks/llm-registry.md`; confirm which of its parts are on `main`). **Does not depend on analytics**: Parts A, B and the record must not wait on it. Sprint 6 Task 1 (curiosity packaging) is not a dependency; see the finding in R9.
**Owning Component**: intake-to-script step in `run-pipeline/`, a new story-tests module beside `agents/script-review/`, `llm/registry.ts` purposes, the Gate 1 API and card, the run record. Confirm exact owners in R0.
**Success Criteria**: (1) with the feature on, a run proposes 4 to 5 angles, shows them with the reader's two picks, and the script step does not start until the founder chooses (or skips); (2) the chosen angle's promise is stored and is what Part B checks against; (3) a script reaching Gate 1 has a stored Part B result and, where Gate 1 is on, the founder sees the verdict, swipe line and weakest sentence; (4) every call is a registered purpose, capped, metered, and no call exceeds the part's cap; (5) every run stores the record in Part C including its pipeline-version tags; (6) no channel name or niche literal was added to code (grep proof); (7) the Part C analytics finding is in the report; (8) full tests, type check and lint pass; the existing Script Review score, threshold, retries and Gate 1 behaviour are unchanged.

## Constraints that decide every choice

- **Stop rule.** If Part A needs more than a card, or changes the Gate 1 flow, **stop and ask the founder**. The same for a schema change, a new native dependency, or any flow change beyond a card. Pausing a run before the script step may itself be a new wait state; R1 settles that before any code is written.
- **Registry only.** Every call goes through the LLM Registry by purpose; no provider SDK import outside `llm/client.ts`. Each new purpose declares its own output limit and reasoning setting as the registry requires. Do not reuse `script-review` or `script-generation` purposes.
- **Reader strength.** The reader model must be at least as strong as the writer (Sonnet 5.5 class; Task 6 showed Haiku fails rule checks). If the registry allows, use a **different model family** from the writer to avoid same-family liking. R0 verifies what the registry and the configured keys actually allow; do not assume. If only one family is available, say so in the report and use it.
- **No retry loops, no new agent or framework.** Part A makes at most three calls (one angle call, two reader calls). Part B makes at most two calls (the reader, one promise-match check). Hard cost cap per part, checked **before** each call and metered after. If the registry client retries automatically on a cut-off (R0 checks), that retry counts toward the cap and is reported; if it can break the "two calls maximum" rule, ask the architect before building.
- **Channel-generic (Key Principle 11).** No channel name or niche literal in code, prompts or fixtures. The reader persona is one config line per channel, read from the channel's profile; a channel with none gets the neutral default. Grep proof in the report as in `sprint5/bugs/tasks/acceptance-run-1.md`.
- **The reader is blind.** Part A's reader receives only shuffled title + promise pairs: no brief, no channel name, no persona that names the channel. Part B's reader receives only the script text: no brief, notes, sources, channel name or promise. A test asserts this by inspecting the exact request each call builds.
- **Prompt review before live spend.** This task adds four new prompts (angle proposer, pair reader, cold reader, promise-match). Put the exact text of each in the PR description and in the report as soon as it is written, and **do not run any live check until the founder has approved them** (the founder judges each prompt on its own). Prompt text lives with its registered purpose, not inline in business code, and names no channel or niche.
- **No score.** A forced choice replaces any numeric score (model scores inflate; the Lego drafts scored 8 of 10 with a dozen invented facts). Do not add a score to either reader.

## R0. Read the real code first and confirm

**Where**: run creation and the state machine (`run-pipeline/state-machine.ts`), intake (`parse-brief.ts` or its successor), the script step and writer, `agents/script-review/` (index, the score, the retry loop, how it feeds Gate 1), the Gate 1 API and app screen, the LLM Registry (`llm/registry.ts`, `llm/types.ts`, `llm/client.ts`, `callLLM`, which providers and models are configured and have keys), the budget gate and usage events, the channel profile schema and resolver (`channel-profile/schema.ts`, `resolve.ts`), the run record and its JSON columns, Compare (where it groups runs and which fields it reads), analytics ingestion (Sprint 4 Task 10 and later), the Task 1 packaging code (merged 30 Oct; packages live on the Gate 2 stage row's JSON output, `output.packaging`).

**Fix**: a confirmed / wrong / unknown table in the report **before** choosing files, storage, costs or API shape. Confirm at least:

1. **Where intake ends and the script begins.** The exact function or state, what intake returns (`{topic, constraints}` per PLAN, to be confirmed), and whether any wait or approval state already exists between them. If none exists, Part A adds one: say so, describe the smallest change, and **stop and ask** if it changes the Gate 1 flow or needs more than a card.
2. **What "script text" is.** What the writer returns, what the voice reads, whether the text includes scene notes or chapter headings. Part B's reader must get what a viewer hears or reads and nothing else. (Task 2 and the in-video disclaimer were dropped on 29 Oct; no disclosure sentence exists in the script.)
3. **Script Review.** Where it sits, how its score is computed (code, caps, threshold 7, up to three automatic retries), and what Gate 1 shows. Part B runs once, on the script version that reaches Gate 1, after Script Review has finished; it never enters the retry loop or the score. Also: with Gate 1 off, scripts scoring 7 or more pass automatically; Part B still runs and is stored, but nobody sees the card. Confirm that behaviour.
4. **Registry.** Which model and family writes scripts today; which models and families the registry can resolve now (configured keys, not docs); the output-limit and reasoning fields each purpose must declare; the price per token used for cost; what automatic retry the client applies on a cut-off; the budget gate and where a per-part cap can live. The docs disagree on which purposes run on which model, so read the code.
5. **Where per-channel config lives** and whether one optional string (the reader persona) fits the existing profile JSON and zod schema without a database migration.
6. **Storage for the record (Part C).** Which existing run JSON column(s) can hold it safely, how a run survives a restart, how tenant and channel ownership is enforced, and what Compare reads today.
7. **How to identify "the stock footage fix"** for the version tag: a deployed commit, a PR number, a constant, or a flag. Name the one stable identifier code can read at run time. If none exists, say so; do not invent one.
8. **Part C analytics finding (read only, no build).** What retention data the analytics stage stores today: long-form watch numbers from Task 10 (as reported by the founder; not verified here), and whether anything is stored for retention at 3, 10 and 30 seconds or for the "viewed vs swiped away" rate for Shorts. STATUS reportedly says `dashboard.comparison` does not return watch numbers; confirm in code. Also say whether the separate "analytics-retention" task has a read route on `main` yet. Anything missing is a finding for the architect, who splits it into the analytics-retention task; **it does not become work in this task**.
9. Whether designer screens exist for the Part A card and the Part B card (the architect supplies them before the app part starts; see R4 and R7).

**Verify**: real files and contracts named; conflicts with this task listed. Stop and return to the architect for a decision if existing storage cannot hold the record safely, or if item 1 shows a flow change.

## R1. Part A, angle generation (before the script)

**Where**: between intake and the script step (as R0 item 1 confirms).

**Fix**: one registered call takes the intake result (topic and constraints) and returns 4 to 5 candidate angles, each only `{title, promise}` where the promise is one line. No script, no outline. Code validates: 4 or 5 angles, both fields present, length limits, no duplicate titles. If the figures in a promise can be checked with the existing Script Review numeric check (`brief-checks.ts`, R0 confirms it can be called as-is), flag any figure not present in the intake text and show the flag on the card; if it cannot be reused as-is, report that and skip it (do not write a second checker). If validation fails, or the budget for the step is reached before angles exist, the part is recorded as "not run: reason" and the run **continues straight to the script from the brief** (the same as skipping, with no wait and no card to answer; the founder sees a read-only line saying why, see C5); there is no retry. A failure of the **reader** only (angles exist, but a pick is unreadable) is different: the run still waits and the angles are shown without reader advice (C3).

Whether channel guidance would improve the angles is a finding for the report, not something to build: this call sees the intake result only.

**Verify**: a seeded intake returns 4 to 5 valid angles; a reply with 3 or 7 angles, a missing promise or a duplicate title is rejected with a recorded reason; no script text exists at this point.

## R2. Part A, the blind pair-reader and the code verdict

**Fix**: code assigns each angle a neutral id (not its position), shuffles, and builds the reader input from title + promise only. The reader returns JSON: the angle id it would click, the one it would skip, and one line why for each. It runs **twice**, the second time with the order reversed (two calls maximum, no third call to break a tie). Plain code maps ids back to angles and decides: both runs pick the same top angle → **"clear winner"**; otherwise **"no clear winner"** and both picks are shown. An id the reader invents, a click equal to the skip, or a malformed reply makes that run invalid: the verdict becomes "no clear winner (reader error)" and the error is recorded; no retry. The reader persona line comes from the channel profile or the neutral default. The reader never sees the brief or the channel name.

**Verify** (mocked model): same pick both runs → clear winner; different picks → no clear winner with both shown; reversed order is a true reverse of the first; an unknown id is rejected; the built request contains no brief, topic text beyond the angle lines, or channel name; at most two reader calls even when the first is invalid.

## R3. Part A, the card, the choice and the stored promise

**Fix**: show the founder one card: the angles, the reader's picks with their one-line reasons, the "clear winner" or "no clear winner" mark, any figure flag, and the choice: pick an angle, or "write from the brief" (skip). Build to the designer's screens; if they are not ready, build the API and the card behind the existing layout and stop before polishing. The script step starts only after the choice. Persist the choice **before** the script step starts, so it survives a restart. The chosen angle's promise (and title) is stored on the run and is what Part B checks against; no inferred promise is written. The reader's pick is advice: the founder may choose any angle, and the record keeps both.

Do not invent a timeout or auto-pick for an unanswered card; use whatever waiting behaviour existing gates have (R0 reports it) and tell the founder if that is not good enough.

**Verify**: choice survives reload and restart; the script step is not started before the choice; choosing something other than the reader's pick is stored as such; skip stores "skipped"; tenant ownership holds (another tenant cannot read or choose).

## R4. Part B, the cold-reader on the finished script

**Fix**: one registered call whose input is **the script text only**. It returns JSON with exactly these fields: (1) `about`, one sentence; (2) `why_care`, free text, where "can't tell" is allowed; (3) `swipe_line`, the exact quoted line where it would first swipe away, or "none"; (4) `remembered`, what it remembers after it ends; (5) `first_sentence_keeps_me`, yes or no with why; (6) `weakest_sentence`, quoted, with why. Use the registry's structured output. The reader persona line is the only other input. One call, no retry; a malformed reply records "not run: reader error" and is shown as such, never as a pass.

**Verify**: the request contains the script text and persona only (asserted in a test); a valid reply parses to the six fields; a malformed reply is recorded as an error, not a verdict.

## R5. Part B, the verdict by plain code and the promise-match check

**Fix**: code gives **FAIL** if any of these holds, and lists every reason that fired:
1. field (2) is "can't tell";
2. the swipe line sits inside the threshold zone: for Shorts the first two sentences (or the founder's decision 1), for long-form the first ~15% of the script by position; code finds the quote **in the script text** by exact string match, and a quote that cannot be found is recorded as "quote not found" (proposed: treated as a reader error, not a pass; confirm in the report);
3. field (5) is "no";
4. field (1) or field (4) does not match the stored promise from Part A: one more registered call, text only, input is the promise line plus answers (1) and (4), output is match yes or no per answer with one short line. It uses the reader's model class (the input is a few lines, so the cost is small). If there is no stored promise (Part A skipped or not run), this step does not run and cannot cause a FAIL (decision 6).

Otherwise **PASS**. The result (verdict, reasons, swipe line, weakest sentence, all six answers, the match check) is stored with the script version it read. A script edited at Gate 1 after the check shows "script changed since this check" if the script version or a hash is available (R0); no automatic re-run.

**Verify** (mocked model): each FAIL reason alone produces FAIL and each is listed; a swipe line at the very start of a Short and at 14% and 16% of a long script give the right outcome under each threshold; a quote not found is recorded as a reader error; Part A skipped means no match check and no FAIL from it; PASS when none fires.

## R6. Part B, where it runs and where it shows

**Fix**: run Part B once after Script Review has finished for the script that is going to Gate 1. It adds no field to the Script Review score and no step to its retry loop. At Gate 1 show a card with the verdict, the swipe line and the weakest sentence (plus the reasons that fired); the founder decides as today. Whether the card also shows at Gate 2 is decision 3. Do not block approval, and do not change what Gate 1 off does.

**Verify**: Script Review's score, threshold, retries and Gate 1 behaviour are unchanged on the existing fixtures; a FAIL does not stop the founder approving; with Gate 1 off the result is stored and nothing blocks.

## R7. Part C, the learning record and the pipeline-version tags

**Fix**: store per run, scoped by tenant and channel, and readable by Compare:
- Part A: the angles offered, the order each reader saw, each reader's click and skip with the one-line reasons, the mark (clear winner or not), any figure flag, the chosen angle (or "skipped" or "not run: reason"), and whether the choice equalled the reader's pick.
- Part B: the verdict and every reason, all six answers with the quoted lines, the match-check result, the script version it read.
- Shape fields from plain code, no model: **title shape** (word count, has a question mark, has a figure, opening word type) and **hook shape** (the first sentence's word count, question or statement, has a figure). Reuse Task 1's packaging record (`output.packaging`, on `main`) for the title; do not store the title twice.
- Per call: purpose, model, input and output tokens, cost, time.
- **Pipeline-version tags**, written by code at the moment each step happens and never edited later: story tests on or off; Part A used, skipped or not run; the stock-footage-fix identifier from R0 item 7 (null if R0 found none, and say so); the build or commit identifier if code can read one.

"Readable by Compare" means a read path and fields Compare can group by, so the architect can compare runs made before and after the stock-footage fix, with story tests on or off, and with Part A used or skipped. If this needs a Compare screen change in the app, that is a flow change: stop and ask. No backfill of old runs.

**Verify**: a run's record reads back whole after a restart; tags are present on a run with the feature on and a run with it off; a skipped Part A is tagged skipped; old runs read as untagged, not as "off" by guess; tenant isolation holds.

## R8. Spend: caps checked before, metered after

**Fix**: each part has a hard per-run cap held in one place (the registry or the budget config, per R0). Before each call, code checks the part's remaining budget against the call's worst-case cost (input estimate plus the output limit at the real price); if it would exceed the cap, the call is skipped and recorded "not run: cap". After each call, the real usage is booked as a usage event. No call is repeated to recover from an error.

**Verify**: a test with a tiny cap skips the call and records why; the metered total equals the sum of the calls; a cut-off retry by the client, if one exists, is counted.

## R9. Same-cause sweep and the finding for Task 1 (Hard rule 9)

Causes: (a) a channel name or niche in code, prompts or fixtures; (b) an output limit, model name or cost constant defined outside the registry; (c) a "promise" derived or stored in more than one place. Search `studio/` and `app/` and list each hit as fixed here, left alone with a reason, or needing a new task. Specifically: Sprint 6 Task 1 R1 derives its own promise sentence from the approved script. Once this task lands, the chosen angle's promise should feed it instead. Do **not** change Task 1; list it as a finding for the architect. Also check whether Task 1 added a cold-reader helper or registry purposes that this task should reuse rather than duplicate. **P16 overlap:** the P16 plan row ends with "a cold-reader adherence check" and adds a per-channel direction object. Read the P16 row in `sprint6/PLAN.md`; if the reader persona line (decision 2) or the cold reader could be one shared piece, report it as a finding and do not build two. The reader persona stays one optional string in the channel profile until P16 folds it in.

## Not in this task

A search-demand or trend check (needs API access and cost not verified). A synthetic audience panel (rejected: it mirrors the model's taste). The story writer and story editor roles of P12. Any change to Script Review rules, score, threshold or retries. Calibration against past or live videos and any tuning loop: the architect does that later on the live daily videos using the tags from R7. Building any retention or analytics route (R0 item 8 is a finding only). Changing Task 1. (Task 2 is cancelled.)

## Contract (API and app)

**Status**: proposed by the architect on 1 Nov from reading `main` (`api/routers/runs.ts`, `run-pipeline/state-machine.ts`, `run-pipeline/packaging-stage.ts`, `types/pipeline.types.ts`, the app files that read `paused_gate1`). R0 confirms every name; if `main` disagrees, the agent reports the difference to the architect before building, and the frontend never builds ahead of this contract. The designer's screens decide only the look, never these fields. Precedent: `sprint6/contracts/task1-gate2-packaging.md`.

**C1. Where the data lives (no schema change beyond decision 8).**
- Part A and the tags: the `intake` stage's `output.storyTests` (written with `patchStageOutput`, the way Task 1 writes `output.packaging` on the Gate 2 row). It survives a restart.
- Part B: the latest completed `script_review` stage's `output.storyTest` (the check reads the script version that review judged, and is not part of its score).
- Each object carries `version: 1`. Old runs have neither and read as `null`, never as "off".

**C2. A new run status: `paused_angle`** (decision 8). The run sits there from the end of intake until the founder chooses or skips; `currentStage` stays `intake`. The choice is persisted **before** the script step starts. On a server restart the wait is re-opened the way a Gate 1 and Gate 2 wait are (the `state-machine.ts` re-open paths), so a restart never leaves the run stuck at `paused_angle` with nothing waiting. Add the status to `PIPELINE_RUN_STATUSES` and to every place that maps statuses (backend: any `switch` or table on status; app: `lib/run-view.ts`, `lib/inbox.ts`, `lib/run-settings.ts`, `components/admin/status.ts`, `(tabs)/_layout.tsx`, `(tabs)/index.tsx`, `channel/[id].tsx`, `run/[id].tsx`; R0 lists the real ones). The status label everywhere (Inbox, Queue, run chip) is "Waiting for your angle choice"; the Inbox card's step row for this status reads "Angle" (the step comes from the status, because `currentStage` stays `intake`). **Notice and reminder (R0 checked `run-pipeline/gate-reminder.ts` on 1 Nov: it lists only `paused_gate1` and `paused_gate2`, so a run at `paused_angle` would wait with no nudge):** PR A sends one notification when the wait opens ("Angles ready to choose", through the existing `NotificationChannel`, naming the channel and the brief's first line, never the run id) and the reminder check also covers `paused_angle` with the label "your angle choice". No new state, no new screen: say so in the report. An old app build that does not know the status must not crash: R0 reports how `run-view.ts` treats an unknown status today.

**C3. Read: one new field on `runs.get`, `storyTests`** (the same tenant check as the rest of `runs.get`; `null` when the feature was off or the run is old). The server writes every label in plain words; the app never recomputes a verdict, a mark or a reason.
```
storyTests: null | {
  enabled: boolean,                         // the server switch was on for this run
  angleStep: {
    status: 'running' | 'waiting' | 'chosen' | 'skipped' | 'not_run',
    notRunReason: string | null,            // plain words, e.g. "the reader returned an unreadable reply", "the budget for this step was reached"
    angles: { id: string, title: string, promise: string, figureFlag: string | null,
              readerTags: { kind: 'click' | 'skip', label: string }[] }[],   // 4 or 5, in the writer's order (never the shuffled order); readerTags is empty when no read picked this angle; label is server wording, e.g. "Reader would click · both reads" or "Reader would skip · read 2"
    readerPicks: { run: 1 | 2, clickId: string, clickWhy: string, skipId: string, skipWhy: string }[],   // empty until both reader runs finish; ids are angle ids
    mark: 'clear_winner' | 'no_clear_winner' | 'no_clear_winner_reader_error' | null,
    markLabel: string | null,               // server wording, e.g. "Both reads picked the same angle"
    readerTopId: string | null,             // set only when mark is clear_winner
    chosenId: string | null,                // null when waiting or skipped
    choseReaderPick: boolean | null
  },
  scriptCheck: null | {                     // null until the check has run or been skipped
    status: 'ran' | 'not_run',
    notRunReason: string | null,            // plain words, e.g. "the reader returned an unreadable reply" or "the budget for this step was reached"; a skipped Part A is not a not_run (see promiseMatch)
    verdict: 'pass' | 'fail' | null,
    verdictLabel: string | null,            // server wording for the chip, set whenever verdict is set (the architect proposes "Reads well to a stranger" and "A stranger may swipe away"; the app shows it as given)
    reasons: { code: 'cant_tell' | 'swipe_early' | 'first_sentence_no' | 'promise_mismatch', label: string }[],   // every reason that fired; empty on pass
    about: string | null,                   // field 1
    whyCare: string | null,                 // field 2 ("can't tell" allowed)
    swipeLine: string | null,               // the exact quoted line, or null for "none"
    swipeAtPercent: number | null,          // where it sits in the script, 0 to 100
    remembered: string | null,              // field 4
    firstSentence: { keeps: boolean, why: string } | null,   // field 5
    weakestSentence: { quote: string, why: string } | null,  // field 6
    promiseMatch: { ran: boolean, note: string },            // note is never empty: when ran is false it says why in plain words ("Not compared: no angle was chosen", "Not compared: the check could not run"); when ran is true it is the match check's one short line. ran false never causes a fail
    scriptChanged: boolean,                 // the script at Gate 1 is not the one this check read
    advisoryNote: string                    // fixed server text: a text-only read, it cannot judge voice, pacing or visuals
  }
}
```
**Reader error (confirmed):** when `mark` is `no_clear_winner_reader_error`, `readerPicks` holds only the reads that were valid (possibly none), the angles are all still choosable, and `markLabel` says the reader could not give a clear read. The run waits as normal. **`notRunReason` and the run:** `angleStep.status: 'not_run'` means the run did **not** wait (C5). Nothing numeric is shown to the founder as a score. `swipeAtPercent` is for placing the quote, not a rating.

**C4. Write: one new mutation, `runs.chooseAngle`.**
```
runs.chooseAngle({ runId: uuid, angleId: string | null }) -> { resolved: true }
```
`angleId: null` means "write from the brief" (skip). The same tenant and ownership check as `runs.gate1` (`assertGateOwnership`). `BAD_REQUEST` if `angleId` is not one of this run's angles. `CONFLICT` if the run is not at `paused_angle` (already chosen or skipped, or not open yet), with the same wording style as Gate 1. The server persists `chosenId` and `choseReaderPick` first, then resumes the script step. There is no "regenerate angles" mutation (no retry; R1) and no "run the check again" mutation (R5).

**C5. Where each card shows (the designer draws them).**
- **Angle card**: the run screen while `status === 'paused_angle'` (only then is there anything to answer), plus a read-only summary afterwards (`chosen`, `skipped`). `not_run` is a read-only line with its reason ("Angles were not made: <reason>. The script was written from the brief."); there is no "still waiting" state and no button for it. Inbox and Queue show the run as needing the founder's angle choice. Whether the existing gate reminder and push cover the new status is an R0 finding (a flow change beyond a card stops the task).
- **Script check card**: the Gate 1 screen's Script tab, near the existing review concerns. A `fail` never disables Approve, Edit or Reject. `not_run` is shown as "not checked" with the reason and never looks like a pass. `scriptChanged` shows "script changed since this check".
- With `enabled: false`, `storyTests: null` or the feature off, **no card and no empty state** appear and nothing else changes.
- The Part A card is also needed for a long video and a Short; they differ only in the angles and the check's threshold, which the server applies.

**C5a. The app theme.** On 1 Nov the app is light only (`app/app.json` sets `userInterfaceStyle: light`; no colour-scheme code was found under `app/lib`, `components`, `constants` or `hooks`). The app task builds light first; the designer's dark tokens are the spec for later and are not built in this task.

**C6. Rules for the app.** Read `runs.get` only; one new write (`runs.chooseAngle`). No verdict, reason, mark or label is computed in the app. Behind an app flag `storyTestsCards` in `app/lib/feature-flags.ts` (default false, as `gate2PackageScreens` was) until the designer's screens are built and the phone checks pass; the server switch alone decides whether the data exists. Every server string is shown as given.

**C7. Tests for the contract.** `runs.get` returns `storyTests: null` for an old run and a feature-off run; returns the angle step at each of its five statuses and the script check at pass, fail, not_run, and scriptChanged; `chooseAngle` accepts a valid id, accepts null, rejects a foreign id, returns CONFLICT twice in a row, and fails the tenant check for another tenant; a restart at `paused_angle` re-opens the wait; the app's status maps cover `paused_angle`.

## Schema Impact

Checked on `main` 1 Nov: **one migration**, adding `paused_angle` to `pipeline_runs_status_check` (decision 8). No new table, column or stage name: Part A's data goes on the intake stage's JSON output, Part B's on the script review stage's JSON output, and the tags with Part A's data (see the Contract). The reader persona is one optional string in the existing profile JSON. Any other table, column or migration is described to the architect first; none is assumed. Stop and ask.

## Business Logic / State Transition

Part A adds a choice between intake and script, which R0 item 1 shows to be a new wait or an existing one; report which. The script step starts only after the choice is persisted. Part B runs after Script Review ends and before Gate 1, adds no state, and cannot change a run's outcome. A failed or capped reader call never fails the run: it is recorded and the run continues. Record any actual change in the Sprint 6 business-logic doc.

## Spend

All numbers below are the task writer's proposals, not verified against current prices; the founder confirms before work starts.

- **Per run, hard caps**: Part A (three calls on short title+promise text) **$0.10**; Part B (two calls, the script is the largest input) **$0.15**. Basis: Script Review live checks on Sonnet 5.5 cost about $0.03 per review (Task 6, PR #110), and these inputs are smaller or similar.
- **Live checks for the whole task**: ceiling **$1.50**, stop and report at the ceiling. They are wiring checks only (valid reply shapes, caps, cost per call), not a judgment of whether the tests flag weak stories. Everything else is offline with a mocked model.

## Testing

Backend and app type check, lint, build and the focused tests R0 finds; the full suite with `--maxWorkers=4` (say so). Cover: the request each call builds (blind inputs asserted); Part A mapping, reversal, clear winner and no clear winner, invalid replies; the choice persisted before the script step and surviving a restart; the Part B verdict with each FAIL reason, thresholds, quote not found, Part A skipped; Script Review unchanged on existing fixtures; per-part caps; the record read back with tags for a feature-on run, a feature-off run and a Part A skipped run; tenant isolation; two differently configured channels and one with no persona line. **Grep proof** in the report: the command and its (empty) result, for example `git diff origin/main...HEAD -- studio app | grep '^+' | grep -iE 'underdogs|not in your textbook|cold open|niyt|lego|mary celeste'`, plus every channel name on the test tenant. Fixtures use neutral names.

## Delivery: three PRs so nothing waits

- **PR A (`SPRINT6_TASK3A_BE`)**: R0, R1, R2, R3, R8 for Part A, the `paused_angle` migration (after the founder answers decision 8), `runs.chooseAngle` and the Part A half of `storyTests` in `runs.get` (contract C1 to C4). The pair-reader and the Part A card's data. Merge this contract's backend half first, so the app work can start in parallel.
- **PR B (`SPRINT6_TASK3B_BE`)**: R4, R5, R6, R8 for Part B and the `scriptCheck` half of `storyTests`. Needs the stored promise from PR A, or null when skipped.
- **App PR (`SPRINT6_TASK3_FE`)**: the two cards and the new status in the app, built from the designer's screens and the Contract above, behind `storyTestsCards`. The architect writes its own short task from the Contract once the designer's screens exist; it is not part of the backend agent's work.
- **PR C (`SPRINT6_TASK3C_BE`)**: R7, R9 final, and the R0 item 8 finding written up. Merge `main` into your branch first. Report after each PR; the Hard rule 8 closing runs after PR C merges.

## Report

`docs/execution/sprint6/reports/task3.md` (one report, a section per PR): branch, worktree and PR at the top; the R0 table including the analytics finding and which retention source exists on `main`; contracts chosen; the model and family used for the writer and for each reader, with the registry's real answer on different families; cost per call and per run against the caps; test commands and results; the grep proof; the sweep section; the finding for Task 1; Hard rules 5 to 9 lines; code-complete, merged and deployed as three separate statements; open founder decisions. **State plainly that text-only readers cannot judge voice, pacing or visuals**, and that the readers are advisory and not calibrated. Say what you could not verify. Give the architect a one-line status for `PLAN.md`.

## Not verified by the task writer

The code (no file was read; every code fact above is marked "confirm" or comes from a doc). The repository was not reachable from the task-writer chat. The architect has since checked `main` (1 Nov): `sprint6/tasks/` holds task1, task1-spike, task1-gate2-fe and task2, so number 3 is free; Task 1 and the stock-footage timing fix (#139) are merged. The task writer did not read `docs/STATUS.md`. The Task 10 analytics and `dashboard.comparison` statements are the founder's. Prices and the cost caps are estimates.

## Links & References

`sprint6/PLAN.md` (P12, section 3 story team) · `sprint5/tasks/task6.md` (Script Review: where it sits, the score, SR rules) · `sprint6/tasks/task1.md` (shape precedent; its R1 promise sentence) · `sprint6/PLAN.md` P16 row (creative direction; overlap check) · `sprint5/bugs/tasks/llm-registry.md` · `sprint5/bugs/tasks/acceptance-run-1.md` (grep proof) · `decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md`.

## Revision log
- r1, 2026-11-01: first issue. Calibration on past videos removed by the founder (to be done later by the architect on live daily videos); Part C tags runs by pipeline version; Part C analytics is a read-only finding.
- r2, 2026-11-01 (architect): item named P19 (P16 is creative direction); Task 2 references removed (cancelled 29 Oct); Task 1 and #139 recorded as merged; added the prompt-review step and the P16 overlap check. The seven open founder decisions are unchanged and still need answers before work starts.
- r3, 2026-11-01 (architect): decision 4 recorded as decided (Shorts first, long-form in this task).
- r4, 2026-11-01 (architect): decisions 2 (neutral persona for all) and 5 (switch and skip) recorded as decided.
- r5, 2026-11-01 (architect): decisions 1, 3, 6 and 7 recorded as decided; all seven are answered. Revision line at the top says r2; this log is the record (r2 to r5).
- r6, 2026-11-01 (architect): added the Contract (API and app), decision 8 (the `paused_angle` migration), the real Schema Impact and the app PR in Delivery.
- r7, 2026-11-01 (architect): decision 8 answered yes (the `paused_angle` migration). All eight decisions are answered; the backend task is ready to hand to the agent once this doc is merged.
- r8, 2026-11-01 (architect, after the designer's seven questions): a `not_run` angle step does not wait; reader-only failure waits with the angles shown; `readerTags` per angle; `verdictLabel`; `promiseMatch.note` always set; status label and Inbox "Angle" step; a notice and reminder for `paused_angle` added to PR A (the reminder code covered only the two gates); the app is light only today.
