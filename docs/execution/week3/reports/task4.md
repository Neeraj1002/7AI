# Week 3 Task 4: Approval Gate 2

**Date**: 2026-09-08
**Status**: Complete — all four reply outcomes verified live (approve, reject, revise-under-cap, revise-over-cap/circuit-breaker)
**Files Created**: `studio/src/agents/gate2/index.ts`
**Files Modified**: `studio/src/notify-founder/channel.ts` (added optional `attachmentPath` to `requestApproval`), `studio/src/notify-founder/telegram-channel.ts` (sends `sendVideo`+`InputFile` when an attachment is given), `studio/src/run-pipeline/state-machine.ts` (`runGate2Stage`, plus a real bug fix in `runVideoGenerationStage`'s fix-notes lookup — see below), `scripts/dry-run.ts` (`gate2` command)
**Tests**: `npm run typecheck`/`build`/`lint` clean; `grammy` import-boundary grep clean; all three reply grammars (approve/reject/revise) verified against real Telegram sends with simulated replies, including both branches of the shared regen-attempt cap

## What Was Done

- **`studio/src/agents/gate2/index.ts`**: `parseGate2Reply` (exact-match `approve`, `reject [reason]`, else treated as revision notes — no raw-edit path, since a video can't be hand-edited as text, unlike Gate 1's script edit). `formatGate2Message` builds the Telegram caption (channel name, Video Intelligence's verdict + rationale, a too-large notice when applicable). `requestGate2Decision` stats the real video file, compares against Telegram's 50MB bot-upload limit, and calls `founderChannel.requestApproval` with `attachmentPath` set only when under that limit (a link/local-path notice otherwise — see Deviations).
- **Threading**: reused Gate 1's `threadKey` (the `PipelineRun.id`) unchanged — confirmed by reading `channel.ts`'s own docstring and `telegram-channel.ts`'s `pendingByThreadKey` map, which already keys on an opaque `threadKey` with no gate-specific logic. No second-thread concept exists or was needed; Gate 1 and Gate 2 messages for the same run land in the same Telegram thread.
- **`telegram-channel.ts`**: `requestApproval` now calls `getBot().api.sendVideo(chatId, new InputFile(attachmentPath), { caption: message })` when `attachmentPath` is given, else falls back to the existing `sendMessage` path (used by Gate 1 and by Gate 2's own too-large case). Import boundary preserved — `grammy`'s `InputFile` is used only here.
- **`state-machine.ts`'s `runGate2Stage`**: loads the completed `video_generation`/`video_review` stage output, opens the gate (blocks on `requestGate2Decision`), and on each outcome: `reject` → `ReviewLog(human, reject, reason)` → `PipelineRun.status = 'failed'`; `approve` → `ReviewLog(human, approve)` → `PipelineRun.status = 'running'`, `currentStage = 'publishing'` (Week 4 builds the consumer; same "stops here deliberately" pattern as every prior week's frontier stage); `revise` → `ReviewLog(human, revise, notes)`, then checks `videoGenStage.attemptNumber <= MAX_VIDEO_REGEN_ATTEMPTS` exactly like Task 3's automatic path — regen (`running`/`video_generation`) if under the cap, else `needs_attention` with the cap message. A founder-requested revise does not bypass the shared circuit breaker.
- **Real bug found and fixed while wiring this task**: `runVideoGenerationStage`'s fix-notes lookup only matched a review log with `verdict === 'fail'`, which covered Task 3's automatic-fail path but silently missed Gate 2's `revise` verdict — a founder-requested revision's notes would never have reached the next `video_generation` attempt's `fixNotes` input. Fixed by matching `(agent === 'video-intelligence-own-draft' && verdict === 'fail') || (agent === 'human' && verdict === 'revise')`. Found by code review, not by a failing test — flagging it explicitly since it's exactly the kind of silent gap this task's own instructions warned against ("no shortcuts on the reject/notes paths just because Gate 1 already proved the transport works").

## File-size check (Acceptance Criterion 4)

Actual rendered file size from Task 2/3's real test video: **1.28MB** — well under Telegram's ~50MB bot-upload limit, so every live test in this task attached the real video file via `sendVideo`, never the link/too-large fallback. The too-large branch (`videoTooLargeToAttach`, `formatGate2Message`'s notice line) is implemented and covered by a plain code read, but **not exercised against a real oversized file** — flagging this the same way Task 2 flagged its untested watermark-overlay path, as a known gap rather than a silent omission.

## Real verification — all four reply outcomes, live

Per Week 2 Task 6's standing convention: each test sent one real Telegram message (video attached), then fed a simulated incoming update through the real `handleUpdate` path targeting that exact message id via `peekPendingMessageId`/`reply_to_message` — no live human round-trip blocked on. Real Anthropic costs were incurred for the script-gen/script-review/gate1 stages used to build each fixture; video generation ran with `MEDIA_STUB=1` (no OpenAI key exists yet), consistent with Tasks 1–3's stated stubbing. To avoid repeatedly re-triggering Task 3's already-documented flashing-caption/frame-extraction finding (and burning further real multimodal-LLM budget on a known result), the `video_review` verdict feeding each Gate 2 test was forced to `pass` via a direct-DB test fixture (`scripts/fixture-force-video-review-pass.ts`) rather than re-run live each time — the same cost-conscious tradeoff used at the end of Task 3.

1. **`reject`** (run `b3109735-…`, `video_generation` attempt 3): real video sent, simulated `reject dry-run test rejection reason` reply. Result: `ReviewLog(human, reject, "dry-run test rejection reason")` written, `PipelineRun.status = 'failed'`, `lastError = "Rejected at Gate 2: dry-run test rejection reason"`.
2. **`revise` — over the cap** (same run, `video_generation` attempt 3 > `MAX_VIDEO_REGEN_ATTEMPTS = 2`): simulated `Please brighten the background and re-render.` reply. Result: `ReviewLog(human, revise, notes)` written, then `PipelineRun.status = 'needs_attention'`, `lastError = "Gate 2 regen cap (2) reached: Please brighten the background and re-render."` — **confirms a founder-requested revise does not bypass the shared circuit breaker**, per this task's explicit acceptance criterion.
3. **`revise` — under the cap** (fresh run `d7578b28-…`, `video_generation` attempt 1 ≤ 2): same revision-notes reply. Result: `ReviewLog(human, revise, notes)` written, `PipelineRun.status = 'running'`, `currentStage = 'video_generation'` — correctly loops back to regen rather than tripping the breaker.
4. **`approve`** (same run, after a real attempt-2 regen and a second forced-pass fixture): simulated `approve` reply. Result: `ReviewLog(human, approve, "Approved as-is")` written, `PipelineRun.status = 'running'`, `currentStage = 'publishing'`.

A client-side timing bug was also found and fixed during this verification: `scripts/dry-run.ts`'s `gate2()` originally copied `gate1()`'s 10-second message-send polling window verbatim, which is enough for a plain `sendMessage` but not for a real video-file `sendVideo` upload — the first live attempt timed out client-side (`Error: Timed out waiting for the real gate2 message to send`) even though the underlying `runGate2Stage` call was likely still in flight server-side, leaving an orphaned `gate2` attempt-1 stage row stuck at `status: 'running'` for run `b3109735-…` (visible in that run's stage history below). Fixed by widening the window to 60 seconds; the retry succeeded and correctly created attempt 2 rather than duplicating or losing the run, per the established idempotent-resume pattern. The orphaned attempt-1 row was left in place as harmless test debris rather than manually cleaned up, since deleting stage-history rows isn't something normal operation ever does.

## Test Results

```
npm run typecheck                        -> clean
npm run build                            -> clean
npm run lint                             -> clean
grep -rn "grammy" studio/src/agents/gate2/  -> only comments, no imports

Live outcome 1 (reject):              PipelineRun -> failed, ReviewLog written correctly
Live outcome 2 (revise, over cap):    PipelineRun -> needs_attention, cap message correct,
                                       confirms revise does not bypass MAX_VIDEO_REGEN_ATTEMPTS
Live outcome 3 (revise, under cap):   PipelineRun -> running/video_generation (regen loop)
Live outcome 4 (approve):             PipelineRun -> running/publishing
```

## What ran real vs. stubbed

- **Real**: Anthropic calls (script generation, script review, Gate 1's own flow, Task 3's `video_review` LLM verdict used in earlier runs), all Telegram sends (`sendVideo`/`sendMessage`) and the simulated-reply parsing/resume path through the real `handleUpdate` code.
- **Stubbed**: `video_generation`'s TTS/transcription (`MEDIA_STUB=1`, no `OPENAI_API_KEY` exists yet — unchanged from Tasks 1–3's stated stub scope). The specific `video_review` verdicts feeding this task's fixtures were forced to `pass` via a direct-DB test fixture rather than re-run live, to avoid redundant real-multimodal-LLM spend on an already-documented result (Task 3's flashing-caption finding) — this is a test-fixture shortcut for Gate 2's own verification, not a stub inside any production code path.

## What's still open (not closed by this task)

- The too-large-video fallback path (`videoTooLargeToAttach` → link/local-path notice instead of `sendVideo`) is implemented but not exercised against a real oversized file — every real test video produced so far (1.28MB) is far under the 50MB limit.
- No genuine (non-forced) `pass` verdict has yet been produced by Task 3's live multimodal check against a real Task-2 video, because of the caption/frame-extraction issue documented in Task 3's report — this task's `approve`/`revise` tests necessarily ran against a forced-pass fixture rather than an organically-passing run. This is not a Gate 2 defect; it's a downstream consequence of the still-open Task 2/3 caption-style finding.

## Deviations from Spec

- None beyond what's already flagged above (the too-large path untested, and forced-pass fixtures used for cost reasons) — implementation otherwise follows the task spec's reply grammar, message format, and state-transition table exactly.

## Sign-Off

- Task Objective: Met
- Schema Impact: None new (as specified) — only `pipeline_runs.status`/`currentStage` and `review_logs` touched
- Business Logic: Matches `docs/execution/week3/BUSINESS_LOGIC.md` Sections 1, 4 — all three reply outcomes and both branches of the shared regen cap verified live
- Tests: Passing — approve/reject/revise-under-cap/revise-over-cap all confirmed against real Telegram sends
- Ready for Integration: Yes — Task 5 wires the full pipeline end-to-end and closes out Week 3
