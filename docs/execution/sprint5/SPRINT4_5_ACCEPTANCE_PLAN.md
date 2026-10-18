# Consolidated Sprint 4–5 Acceptance Plan

**Prepared:** 2026-10-17 IST. **Scope:** Sprint 4 plus all five Sprint 5 tasks, including Task 5. **Status:** planning and read-only evidence gathering; acceptance tests have not been executed by this chat.

The owner could not finish Sprint 4 testing because production video generation was failing. The revised sequence is to integrate the Sprint 5 PRs individually, then perform one combined founder acceptance pass on the final implementation. Do not require a second full paid pipeline pass merely to close the older sprint.

Use the [57-case execution tracker](testing/sprint4-5-cases.csv) and [37-report bug traceability ledger](testing/sprint4-5-bug-traceability.csv). Every case starts **NOT_RUN** and every report starts **NOT_RETESTED**. Historical author test reports, database bug status and fresh acceptance are distinct evidence.

## 1. Where the application actually is

### Verified observations

Read-only production GETs at **2026-10-16 18:21:50 UTC** reported backend commit **`5b04a7a`**. The Admin bug list returned **37 reports**, below the requested limit of 200: **13 open** (eight bugs, five feedback items) and **24 fixed**. No report status was changed. Subsequent structure-only reads inspected the seven specifically referenced runs; no retry, cancellation, approval, content-view mutation or provider call was made.

GitHub inspection on October 16 showed #91–#94 open/draft. The #94 head changed during this investigation; the refreshed row below supersedes its earlier fixture-only state. These snapshots are not guarantees about later heads or deployment.

| Layer | Verified repository/PR evidence | Reported test evidence and remaining limit |
|---|---|---|
| Deployed Sprint 4 and planner hotfixes | Production reports #90 commit `5b04a7a`. Merged PR history includes long-form pipeline #69/#75, publishing/preview #72, image model #68, run data #73/#74 and app work #76–#82, plus planner fixes through #90. Local Sprint 4 STATUS/PENDING contain older states and cannot establish current completion. | Sprint 4 reports include real dev renders and many automated tests, but phone/full-journey/upload/long-duration gaps remain. Do not repeat their entire old task checklists independently. |
| Sprint 5 Task 1, [#91](https://github.com/Neeraj1002/7AI/pull/91) | Head `cd0036a06cd7b61d2c0a4bcb8e31cc7ad1b98f9b`, base main. Bounded Admin planner diagnostics and CLI. | Author reports 87 focused tests/build/lint/typecheck. New diagnostics live readback and the Task 2 safe-summary Admin adapter remain open in its report. This PR does not replace the planner fix or solve all execution races. |
| Task 2, [#92](https://github.com/Neeraj1002/7AI/pull/92) | Head `b08925ecdbd87de730e0372315060107bc61150f`, base main. Durable run receipt, resumable upload, fenced owner, first-ID checkpoint and optional-effect recovery; one nullable database migration. | Author reports 79 focused and nine real sandbox-DB tests, including fake HTTP/process recovery. No real YouTube production upload or production migration tested. Upload ownership does not certify general generation-worker exclusivity. |
| Task 3, [#93](https://github.com/Neeraj1002/7AI/pull/93) | Head `81561e6683e23d86d04fde334aeb3bf62bd8b130`, temporary base `SPRINT5_TASK3_DEPS`. Wording commit `7c6ef3c`; scene meaning, chapter-scoped alignment and actual asset/frame mapping follow. | Author reports 90 focused compatibility tests, additional affected checks, build/lint/typecheck and a real two-second red/blue FFmpeg render. That render proves a boundary mechanism, not a full production-duration video or improved pacing. |
| Task 4, [#94](https://github.com/Neeraj1002/7AI/pull/94) | Refreshed head `f1582acb14f9cb4c020d248c2a588e924bf7d8e6`, temporary base `SPRINT5_TASK4_DEPS` at `d38a71a064a41bc57a74367a07c9da27fce4760e`, including #93/#91/#92. Writer/reviewer packet, stored snapshot and factual baseline now implemented. | Updated report records 21 focused tests and broader affected results, with two fixture fixes retested. Its real-FFmpeg test could not execute because the configured executable was absent. Task 3's render is historical evidence, not a rerun on Task 4's tree. Factual accuracy/SR-1–SR-9 remain separate. |
| Task 5 | [Specification](tasks/task5.md) defines bounded visual-only repair, durable intent, reuse/integrity checks, renewed review/Gate 2 and one rendered continuity comparison. No implementation/report/PR found in the inspected shared root. | **Include all Task 5 acceptance below.** Map cases to its actual implementation and frozen interfaces once delivered. No implementation or creative benefit is assumed. |

GitHub returned empty check rollups for the inspected drafts; a CLEAN merge state is not evidence CI passed. Author-reported results above were read, not independently rerun in this planning chat.

### What the failed runs now establish

- **Planner incident `dbf432ff-4d67-4cf7-a143-73d8c7553cc7`:** generation attempt 6 completed. The run is now needs_attention at video_review: **19.4 s longest AI still shot against 7.5 s pacing limit**, with regen-cap message. Calling this only “video is not being created” is obsolete. The next proof must cover a usable, review-passing video, not merely planner completion.
- **Duplicate-attempt run `9ab4fbe5-938a-41be-a1c5-94f1eb08e561`:** run is failed with cancellation recorded; video attempt 2 remains stored as running and attempt 3 is failed/cancelled. This verifies a stale running row. It does **not** prove two current workers are executing. Test both state/UI reconciliation and actual driver/call concurrency.
- **Quote-error run `2d5f3def-1dc6-4e80-bac5-526b74b3c82d`:** historical attempts show unterminated-string/array parsing failures, followed by spend-limit/provider-usage failures. The latest condition must not be diagnosed from the first error alone.
- The two low-score reports each have four completed script reviews before Gate 1. Current code uses threshold 7, up to three automatic retries, and intentional human escalation after retry/budget exhaustion; a passing review can auto-approve when Gate 1 is disabled. The review scores/bodies of those historical attempts were not read here.

**Inference:** the highest-value remaining acceptance is integrated state/recovery, actual pacing and final media, followed by safe publishing. Counting generated scenes or displaying a completed stage alone misses the observed failures.

**Proposed response:** run the cases below once on the final candidate, with targeted automated reproduction for the state/concurrency gaps. Preserve all valid existing evidence; do not blindly mark the open reports fixed by Sprint 5.

## 2. Revised integration and closure sequence

**Owner direction:** merge the task PRs one by one after each is technically ready, then perform consolidated Sprint 4–5 founder acceptance after Task 5. This replaces the earlier circular requirement to finish blocked Sprint 4 video UAT before any Sprint 5 PR could become ready. It does not declare reliability gate R passed, waive migration/ownership review, or authorize this planning chat to merge/deploy.

**Proposal:** #91 → #92 → #93 → #94 → Task 5's eventual PR. If an existing defect requires a separate fix, integrate it before the affected acceptance cases and record the dependency. Keep one task PR per task. Do not merge a temporary dependency base as a substitute for its constituent PRs.

| After / before merge | Small checks and evidence | Full paid video required? |
|---|---|---|
| Every PR before merge | Fresh main integration; task-only diff; affected regression/build/lint/typecheck results at actual head; inspect conflict resolutions. A completed founder UAT is not required at every intermediate revision. | No |
| #91 deployed | Read reported commit/boot and selected-attempt Admin diagnostics. Old API 400 must be resolved by deployment, not hidden. Track the safe publishing-summary adapter explicitly if still absent. | No |
| #92 rollout | Review receipt migration/backup/encryption compatibility and old-worker/in-flight-upload drain. Verify schema/startup and safe diagnostics; rerun concurrency/ambiguity faults in sandbox. Do not force a production ambiguous upload for testing. | No |
| #93 / #94 integrated | Retarget each PR to main only after its dependencies land; remove dependency changes from its final diff, preserve production wording and scene contracts, rerun combined alignment/evidence/state regressions. Supply a working local FFmpeg executable and rerun the affected real fixture render on the candidate. | No |
| Task 5 integrated | Verify receipt/fingerprint/asset-reuse/restart interaction tests and one real offline A/B render. Reconcile any final main changes. | No extra paid generation |
| Final candidate | Pin backend SHA and installed APK/OTA, then perform the shared runs and device checks below. Verify that candidate is deployed; branch test evidence alone is insufficient. | One shared long and one Short; one private upload |
| Closure | Reconcile exact bug IDs, failed/blocked/deferred cases, supported duration range and editorial result; close each sprint on the same accepted evidence. | No separate Sprint 4 rerun |

**Verified:** `.github/workflows/deploy.yml` deploys main pushes to the VPS. **Inference:** sequential merges can expose intermediate code and resume work. **Proposal:** the operator applies Task 2's reviewed rollout/drain procedure and confirms deployment after each merge. This document does not invent a maintenance setting or assume the server is idle.

Stop adding paid acceptance runs if a P0 case fails; diagnose with retained artifacts/mocks and rerun affected cases after a fix. An unrelated cosmetic defect need not restart the whole batch.

## 3. Run the shared journeys once

### A. No-spend preparation and fault checks

The task owners/QA run the automated/sandbox cases first. These cover malformed replies, races, budgets, retries, legacy compatibility, corrupted files, evidence tampering, process exits and lost upload responses. They should not be reproduced by repeatedly paying real providers.

Use an explicitly named isolated test DB, provider mocks/local fake resumable server and isolated fixture processes. Do not run the application resume loop against shared/production data or restart the production server to inject faults. Record skipped tests as skipped; they are not passes.

The founder checks New Brief validation, offered formats, profile persistence, Admin entry and installed app version without starting new runs. Existing/seeded run records cover failed/rejected/cancelled/empty states.

### B. L1: one real two-minute long video

Choose the existing connected QA channel, founder-approved factual brief and format/Freeform. Record the **current estimate, weekly headroom and explicit spend ceiling**; this plan does not freeze old dollar estimates or increase a budget. Manual gates make the user journey observable.

1. Create from the phone. Capture selected type/format/length/options and estimate once.
2. At Gate 1 inspect chapters, supported facts/hedges, factual concerns, style and sources; approve the intended text. Exercise destructive invalid/reject/revise branches in sandbox instead of repeatedly regenerating this paid run.
3. During generation observe Queue/Run and image counts; compare stored profile/evidence snapshots and approved narration. No percentage or guessed ETA is expected.
4. At Gate 2 watch/listen to the **whole** result and inspect frame mapping/shot durations, QC, preview and SRT. A video that generates but fails pacing is not a successful journey.
5. Keep the baseline unpublished while the Task 5 comparison is prepared, since terminal cleanup may remove caches. Use approved isolated copies/local fixtures through Task 5's actual supported harness; a new repair app screen is not assumed.
6. After the final accepted artifact is known, test the real Gate 2 → publishing transition once. If repair updates this run, its changed artifact must be reviewed/reapproved first. Otherwise Task 5's local repair comparison and L1's publishing are separate explicitly recorded proofs.
7. Use **one private test upload** to verify provider-specific upload/caption/thumbnail/metadata behavior, correct final video identity and phone playback. No public posting or deliberately failed live upload is needed. Record channel, file hash, visibility, run/video ID and current account prerequisites before executing.

The same L1 evidence covers Sprint 4 long-form API/script/TTS/SRT/images/render/quality/preview/Run/Inbox/Queue/spend/packaging and Sprint 5 diagnostics/alignment/evidence/publishing integrations. It does not prove every failure case; those belong to lane A.

### C. S1: one Short, plus stock coverage

Create one 30–45 s AI-stills Short once on the final candidate. Use it for portrait rendering, caption safe area/timing, actual voice/music/style, repeated phone playback and Shorts routing regressions. It need not be uploaded again merely to test shared publishing metadata; sandbox tests cover that body.

Use an existing licensed stock fixture for the rejected-middle-clip report, shot exclusions, legitimate stock motion and bounded fallback. If that fixture reproduces a provider-specific issue that cannot be settled offline, add one targeted real stock run; do not automatically commission a third run.

### D. R1: Task 5's one controlled repair comparison

Freeze the baseline script/evidence/voice/timing/render settings and all unaffected assets. Change one identified visual scene through the actual repair contract. Use approved existing/local replacement assets and mocked generation unless separately scoped spend is chosen.

Require hashes/call counts proving unaffected images, narration, transcript/SRT/audio and chapter segments were retained; reject stale/corrupt/unlocatable baselines. Inject restart/refusal/budget faults in sandbox. Render playable A and B, inspect neighboring cuts/listen to unchanged audio, and record identity/era consistency, narration fit, artifacts and distraction using criteria frozen before viewing.

A “worse” or “inconclusive” editorial result is valid experiment evidence and means **do not adopt/expand the creative change**. Mechanical repair/reliability acceptance remains separate. A synthetic fixture proves mechanics only; production creative improvement stays unverified without a suitable production baseline. Do not claim retention uplift.

### E. Duration qualification

Exercise 2/5/10/15-minute validation/estimates and the maximum slot count offline. A two-minute pass does not qualify a ten/fifteen-minute production workload. Sprint 4's Task 9 report leaves a ten-minute real run open.

If closing the full long-duration capability, perform **one representative ten-minute run** at the final candidate after the cheaper core passes, or reuse equivalent evidence from that exact candidate. Otherwise state the accepted duration scope and keep the long-scale case unverified. Do not hide this gap to advertise a two-run complete sign-off; a ten-minute test is a purposeful additional expense, not a second Sprint 4 pass.

## 4. What the founder checks on the phone

Use one recording/screenshot set while traversing the journeys:

- Profile save/history and offered format/Freeform behavior; selected type/length/estimate/spend cap.
- Gate 1 chapters/edit validation, review score/concerns/sources and truthful low-score escalation.
- Current Run state and attempt history, image counts, actual option origins/spend, no stale activity on terminal runs.
- One per-run Inbox card, actionable current gate, Queue search/ended runs, no brief-stage reset after approval.
- Landscape preview and subtitles on long; portrait caption placement on Short; whole-file audio/ending and repeat playback.
- Task 5 A/B editorial judgment and changed video returning to review through its actual implemented path.
- Private publish confirmation/link and matching YouTube artifact, captions/chapters/optional-error messages.
- Compare Shorts/Videos/Freeform, empty/unavailable analytics and existing Admin access.

Cancel, lost-response, concurrency, crash and full retry-cap cases are principally automated/operator checks; the founder verifies the resulting UI states using those fixtures. Push/device behavior requires the correct installed native build as well as OTA; a mock/browser screenshot is not phone evidence.

## 5. Open reports: coverage and gaps

All observed open reports remain open in production. IDs are unambiguous prefixes; the ledger contains full UUIDs.

| Reports | Verified evidence / limit | Proposed acceptance and disposition |
|---|---|---|
| `8c560196`, `8055c043`: duplicate in-progress attempts | One cancelled run retains an older running generation row. #92's lease is publishing-specific. | RUN-07/09 and PLAN-04. Safely reproduce general driver/stale-row behavior; fix or retain an explicit blocker. Do not close because upload races pass. |
| `51801f31`: planner quote failure | Old parse failures were followed by distinct budget/provider failures. #89/#90 and later scene work change the path. | PLAN-01/02, L1 and scale coverage. Reuse legacy fixtures; new production success is still required. |
| `9e007cd7`: endless Cancelling | Backend run now terminal; device state at report time is not reproduced here. | RUN-09 plus actual screen refresh/relaunch. Do not infer UI fixed from terminal DB state. |
| `a9c7e7cb`, `43f1db20`: score below seven reaches Gate 1 | Code intentionally escalates after three automatic retries or budget exhaustion, with explanation. | RUN-03. Verify timing/reason and prevent low-score auto-approval. A universal hard minimum would be a separate product change. |
| `478a52b9`: stock middle clip repeatedly rejected | Three historical generation/review rounds; no rendered review inspected here. Task 5 is long-form visual repair. | VID-06. Cover stock selection/exclusion/review/fallback directly; no presumed repair from Task 5. |
| `ba8c7c8e`: missing Admin entry | Current app uses server `admin.whoami`; failure/false flag hides entry. Phone session not checked. | END-02. Verify account/API/OTA before assigning a code cause. |
| `a675e528`: spend per run/stage/attempt | Run total exists; full tenant stage/attempt spend UI is not established by these PRs. | Partial coverage RUN-12/REL-04; retain unmet feature scope explicitly. |
| `2947b8da`: general video ratings | Task 5 has one editorial comparison, not a rating product. | Keep general feature deferred; do not close it on A/B scoring alone. |
| `61ad1f75`: upload reference character image | Not in Task 5's prompt/asset repair contract. | Defer; no new model/reference-image capability assumed. |
| `2cd64d6c`: one Inbox card for both gates | Sprint 4 redesign/report describes per-run grouping; phone verification incomplete. | Reuse RUN-08; close if the actual requested behavior passes. |
| `1da9b7ac`: script/reviews/video history | Run details/review/preview partly cover it; a general archive screen is not demonstrated. | Verify existing access with RUN-12/VID-07; keep any remaining requirement explicit. |

The 24 already-fixed reports are mapped to shared regression evidence in the ledger. **Proposal:** preserve their historical verdicts and use the existing journey/fixtures for changed-path smoke checks. Reopen only if reproduced. Do not create 24 new paid runs or treat a historical “fixed” database value as fresh acceptance.

Additional explicit gaps: production safe-summary diagnostic integration in Task 1; Task 4 candidate FFmpeg rerun; production pacing acceptance; full SR-1–SR-9/model accuracy; actual consent/thumbnail eligibility/analytics availability; long-duration qualification; and Task 5 implementation/evidence. Each has a test/limit here; none is silently declared finished.

## 6. Execute, record and close

The tracker assigns owner/mode/priority/preconditions/steps/expected result/evidence and related report prefixes for each case. Record tested backend SHA, app update, run/fixture ID, actual result and artifact link.

Allowed results: **PASS**, **FAIL**, **BLOCKED**, **NOT_RUN**, **DEFERRED**. A pass requires the named evidence at the tested candidate. A report saying tests once passed is not a new PASS. When a fix lands, rerun impacted cases and the affected shared journey segment; repeat the whole paid run only if the fix invalidates its evidence.

| Decision | Required evidence |
|---|---|
| Integrated functional acceptance | All P0 cases pass on applicable final interfaces; dependency/real-render/publishing gaps resolved. Any unsupported/unimplemented path remains blocked, not passed. |
| Founder app acceptance | Phone journey and actual rendered playback accepted; account/provider limits distinguished from product failures. |
| Creative adoption | RPR-07 shows better continuity without factual/technical regression. Worse/inconclusive means defer creative adoption, even when repair mechanics pass. |
| Sprint closure | Both sprint records point to the same run/case evidence. No unresolved blocker is silently closed; named deferred features/duration/provider prerequisites retain owner/reason. |
| Bug closure | Reproduced original behavior now passes on deployed candidate, or owner explicitly accepts intended behavior/out-of-scope disposition. This planning exercise changes no triage records. |

Suggested execution commands use the existing package scripts: Studio `npm run build`, `npm run lint`, `npm run typecheck` and relevant `npx vitest run <files>`; App `npm run typecheck`, `npm run lint`, and from Studio `npx vitest run --root ../app`. Use the actual task report's test list and sandbox setup, not production environment credentials. DB suites and real FFmpeg fixtures must actually execute where their evidence is required.

## 7. Evidence sources and limits

- Production: allowlisted HTTPS GET `admin.system.info`, `admin.bugs.list` (all statuses, then fixed summary) and `admin.runs.get` for the seven named incidents, at October 16 readback. Existing approved diagnostic credential used without printing; responses bounded and no redirects. Only sanitized structural/triage summaries retained here.
- Local [Sprint 4 reports](../sprint4/reports/task9.md), [quality/preview/publishing](../sprint4/reports/task10.md), [run data](../sprint4/reports/task12.md), [frontend report](../sprint4/reports/frontend-task4.md), [pending ledger](../sprint4/PENDING.md) and [review miss log](../../review_tuning/SCRIPT_REVIEW_MISSES.md). Their dates/results are historical.
- Task 1–4 reports read under `D:\Study Material\7AI-SPRINT5\task[n]\docs\execution\sprint5\reports\task[n].md`; Task 4's refreshed implementation report supersedes its earlier fixture-only version.
- Repository implementation: [score/retry policy](../../../studio/src/agents/script-review/index.ts), [state transitions](../../../studio/src/run-pipeline/state-machine.ts), [quality constants](../../../studio/src/agents/video-generation/quality-spec.ts), [pacing check](../../../studio/src/agents/video-intelligence/quality-metrics.ts), [Admin entry predicate](../../../app/lib/use-admin.ts), [deployment workflow](../../../.github/workflows/deploy.yml); Task 3/4 implementation inspected in their owner worktrees where relevant.
- Future Task 5 behavior follows [its specification](tasks/task5.md) until actual code/report are available. Test expectations must be reconciled to the agreed implementation without weakening safety/approval/reuse requirements merely to make a test pass.

**Work performed here:** read-only repository/PR/production investigation and documentation/CSV creation. No application code changed, test suites or paid acceptance runs executed, PR made ready/merged, deployment/migration/restart performed, or production report mutated.
