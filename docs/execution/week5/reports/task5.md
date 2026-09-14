# Week 5 Task 5: Meter Intake Spend, Go Public for Real — Close Out Sprint 1

**Date**: 2026-09-14
**Status**: Complete
**Files Created**: 1 (`studio/src/agents/gate2/index.test.ts`)
**Files Modified**: 8
**Tests**: All Passing (`npm run typecheck && npm run lint && npm run build && npm test` clean, 35
tests; D1/D2 additionally verified live — real DB queries, a real public YouTube upload confirmed
via a direct API call, real Telegram gate approvals)

## What Was Done

### D1 — Intake's real spend is now metered

`run-pipeline/parse-brief.ts`'s `parseBrief` changed its return shape from bare `IntakeParsed` to
`{ output: IntakeParsed; llm: LLMResponse }`, mirroring `generateScript`'s existing pattern exactly.
`stubParseBrief` (used only under `INTAKE_STAGE_STUB=1`) returns the same shape with a genuinely
zero-cost `llm` (`model: 'stub'`, 0 tokens, `costUsd: '0.000000'`) rather than a fabricated nonzero
estimate — its whole point is a zero-cost dry run, unlike the media stubs which fabricate a
plausible *nonzero* cost for realism.

`run-pipeline/state-machine.ts`'s `runIntakeStage` gained the same per-attempt metering wrapper
every other stage already has (`attemptOnce`, wrapped by `withRetryAndCircuitBreaker`): a real
`insertUsageEvent` call on success (`agent: 'intake'`, real `provider`/`model`/token counts/`costUsd`
from the `llm` response) and on failure (`getStageErrorContext` fallback, `costUsd: '0.000000'`),
same shape as Script Generation/Review's error path.

**Verification — real, not code review.** Ran a real intake call through `dry-run.ts` (`setup` +
`start`) and queried the resulting `usageEvent` rows directly:

```json
{
  "agent": "intake",
  "provider": "anthropic",
  "model": "claude-haiku-4-5",
  "inputTokens": 165,
  "outputTokens": 20,
  "costUsd": "0.0003"
}
```

Confirms both D1 (a real row now exists — zero existed before this task, for any Intake call across
all five weeks) and that Week 5 Task 4's C1 tier fix stayed intact (`claude-haiku-4-5`, not the
original premium default).

### D2 — Privacy becomes a real per-run choice at Gate 2, and one real Short went public

**Implementation** (`publishing/types.ts`, `publishing/index.ts`, `publishing/youtube-client.ts`,
`publishing/stub.ts`, `gate2/index.ts`, `run-pipeline/state-machine.ts`) exactly per spec:
- `PrivacyStatusSchema = z.enum(['private', 'unlisted', 'public'])` and
  `DEFAULT_PRIVACY_STATUS = 'private'` replace the old hardcoded `PRIVACY_STATUS` constant.
  `UploadParams` gained a real `privacyStatus` field.
- `Gate2Outcome`'s `approve` variant gained `privacyStatus?: PrivacyStatus`. `parseGate2Reply`
  recognizes `"approve public"`/`"approve unlisted"`/`"approve private"` (exact match,
  case-insensitive, same no-fuzzy-matching discipline as the rest of Gate 1/2), defaulting to
  `DEFAULT_PRIVACY_STATUS` on a bare `"approve"`.
- `formatGate2Message`'s reply-options line spells out all four options.
- `runGate2Stage` resolves the chosen `privacyStatus`, stores it in the `gate2` stage's output, and
  records it in `ReviewLog.editedOutput` when it's not the default — mirroring Gate 1's
  edited-script audit pattern. `runPublishingStage` reads it back off the `gate2` stage's output and
  threads it into `uploadVideo`.
- `stubUploadVideo`/`uploadVideoViaProvider` both honor `params.privacyStatus` instead of the old
  constant.

**The real test — GPT-6 Astra, run through the real orchestrator, live, twice (see Deviations)**

First attempt (`runId=6635b4c5-...`) went through real Intake → Script Generation → Script Review
(flagging real factual concerns — see below) → a **live** Gate 1 approval over real Telegram
(founder replied `"Approve"`) → real video generation. All 3 video-generation attempts (1 original +
the full regen budget) rendered to 68.2s / 68.6s / 67.8s — every one over the 60s Shorts limit — and
the run correctly escalated to `needs_attention`. This is a real, unrelated finding (see Deviations
and `KNOWN_ISSUES_AND_BLOCKERS.md` §3), not a D1/D2 bug.

Resubmitted (`runId=78bf0056-...`) with the same brief plus an explicit length constraint. This time:
real Intake → Script Generation → Script Review → a **live** Gate 1 approval (`"Approve"`, real,
over real Telegram) → real video generation (42.4s, passed video review on attempt 1) → a **live**
Gate 2 approval — the founder replied **`"Approve public"`** for real, over real Telegram, after
actually reviewing the attached video → a real YouTube upload.

**Verification — all four specified checks:**

1. **`parseGate2Reply` unit tests** (`src/agents/gate2/index.test.ts`, 8 tests): bare `"approve"` →
   `{ type: 'approve', privacyStatus: 'private' }`; `"approve public"`/`"approve unlisted"`/
   `"approve private"` (including mixed case) resolve correctly; near-misses (`"approved public"`,
   `"approve loudly"`, `"please approve public"`) fall through to `revise`, not a false-positive
   approval; plus the existing reject/revise coverage.
2. **Real YouTube Data API confirmation** — direct `videos.list?part=status` call (not the DB row):

   ```json
   { "id": "Tju034tqrrY", "status": { "uploadStatus": "processed", "privacyStatus": "public" } }
   ```

   Video: **https://youtu.be/Tju034tqrrY** — "GPT-6 Astra: AI That Understands Everything—But At
   What Cost?"
3. **No burned-in captions** — the test channel's `brandAssets.captionsEnabled` was set `false` for
   this run only (direct DB update, restored to `{}` immediately after); confirmed by extracting two
   frames (`ffmpeg -ss 5`/`-ss 20`) from the rendered video and viewing them directly — clean stock
   footage (a stylized robotic hand), no text overlay at all.
4. **Bare `"approve"` still defaults to `private`** — verified through the real pipeline wiring, not
   just the unit test: a fresh fixture run (tiny local 2-second test clip, to avoid a slow/large
   Telegram upload) approved with a bare, simulated `"approve"` (`YOUTUBE_STUB=1` for the upload step
   only, to avoid creating a second real YouTube artifact) produced
   `{ privacyStatus: 'private', youtubeVideoId: 'stub-...' }` at both the `gate2` stage output and
   the final `publishing` stage output — the default did not quietly change.

The `ReviewLog` for the real public approval carries `editedOutput: { privacyStatus: 'public' }`,
confirming the audit trail records *what* was approved, not just that it was approved — exactly the
Gate 1 edited-script pattern this was meant to mirror.

## A real finding along the way (Script Review's factual-concerns flag, working as designed)

Both real script-review calls for the GPT-6 Astra brief scored the script 4/10 and populated
`factualConcerns` flagging that "GPT-6 Astra is not an officially announced or confirmed OpenAI
product" — the review model's own knowledge-cutoff limitation, exactly the "plausibility check, not
a verified fact-check" caveat Week 5 Task 4's C3 documents. This was surfaced plainly at Gate 1
(the founder saw the concern in the real Telegram message) and the founder made an informed,
deliberate call to approve anyway — the system working exactly as C3 was designed to: flagging a
concern for a human to weigh, not silently blocking or silently passing.

## Files Created/Modified

- Created: `studio/src/agents/gate2/index.test.ts`
- Modified:
  - `studio/src/run-pipeline/parse-brief.ts` — D1, `{ output, llm }` return shape
  - `studio/src/run-pipeline/state-machine.ts` — D1 (`runIntakeStage` metering), D2 (`runGate2Stage`/`runPublishingStage` privacy threading)
  - `studio/src/agents/publishing/types.ts` — D2, `PrivacyStatusSchema`/`DEFAULT_PRIVACY_STATUS`
  - `studio/src/agents/publishing/index.ts` — D2, updated re-exports
  - `studio/src/agents/publishing/youtube-client.ts` — D2, honors `params.privacyStatus`
  - `studio/src/agents/publishing/stub.ts` — D2, honors `params.privacyStatus`
  - `studio/src/agents/gate2/index.ts` — D2, `parseGate2Reply`/`Gate2Outcome`/`formatGate2Message`

## Schema Changes Applied

None. See `week5/SCHEMA.md` — both D1 and D2 reuse existing columns (`UsageEvent`, `pipeline_stages.output`, `ReviewLog.editedOutput`).

## Test Results

```
npm run typecheck   -> clean
npm run lint        -> clean
npm run build       -> clean
npm test            -> 5 files passed (5), 35 tests passed (35)
```

## Deviations from Spec

- **The real test needed two live attempts, not one.** The first real run's video generation
  exhausted its full regen budget (3 attempts, all 67-68s) without ever fitting the 60s Shorts limit
  — a real, unrelated finding (Video Generation's regen loop adjusts pacing/caption style, not
  narration length, so it can't fix a script that's simply too long; see
  `KNOWN_ISSUES_AND_BLOCKERS.md` §3 for the full root-cause writeup). Worked around operationally by
  resubmitting the same brief with an explicit length constraint appended, which produced a properly
  short script from Script Generation directly and rendered at 42.4s on the first attempt. The first
  (abandoned) run was closed out as a test fixture (`close-stale-test-runs.ts`) rather than left
  dangling — it was also picked up once by B6's restart-safe gate reopening (a real, live side
  effect of restarting the dev server while it still sat at `paused_gate2`) and closed a second time
  immediately.
- **Verification #4 (bare-approve-still-private) used a fresh, tiny local fixture video, not the
  first run's real 45MB render.** An initial attempt reusing the first run's real (large) video
  timed out `dry-run.ts`'s own 60-second polling window for the simulated Telegram round-trip
  (`sendVideo`'s real upload of a 45MB file over the network genuinely took longer than that) — not
  a code bug, a testing-harness limitation. Switched to a 2-second local test clip generated via
  `ffmpeg`, which sent and resolved immediately, letting the confirmation exercise the real
  `runGate2Stage`/`runPublishingStage` wiring end-to-end without depending on network upload speed.
- **`YOUTUBE_STUB=1` was used for verification #4's publish step only**, to prove the default stays
  `private` without creating a second real, searchable YouTube video — the task explicitly allowed
  "real or fixture" for this check, and a second real public/private artifact for a purely
  confirmatory test isn't worth the clutter on the founder's real channel.

## Sign-Off

- Task Objective: Met — every real Intake call now writes a real `UsageEvent` row; privacy status is
  a genuine per-run Gate 2 choice; one real, live, public Short is up on channel #1's real YouTube
  account (`Tju034tqrrY`), confirmed `public` via a direct API call, with no burned-in captions, both
  gates answered live.
- Schema Impact: None — see `week5/SCHEMA.md`.
- Business Logic: `week5/BUSINESS_LOGIC.md` updated with both deltas; no transition-table changes.
- Tests: Passing; D1/D2 additionally verified live per the task's own bar (real DB queries, a real
  YouTube API call, real Telegram gate approvals) — no automated test substitutes for the live gate
  approvals or the public-video confirmation, per the task's own instruction.
- Ready for Integration: Yes. **Sprint 1 is now genuinely closed** — see
  `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md` and `docs/roadmap/SPRINT_ROADMAP.md`.
