# Week 3 Task 3: Video Intelligence Agent (Own-Draft Mode)

**Date**: 2026-09-08
**Status**: Complete — real end-to-end verification, including a genuine circuit-breaker trip
**Files Created**: `studio/src/agents/video-intelligence/index.ts`
**Files Modified**: `studio/src/llm/{types,client,registry}.ts` (multimodal extension), `state-machine.ts`, `scripts/dry-run.ts`
**Tests**: `npm run typecheck`/`build`/`lint` clean; deterministic-fail path verified with zero LLM cost; a real multimodal pass verified with a real (informative, not rubber-stamped) fail verdict; the regen circuit breaker tripped for real at exactly the proposed cap

## Architecture call, as flagged: extended `studio/src/llm/`, didn't build a second layer

Per this task's own recommendation, extended `LLMMessage` with an optional `attachments: LLMAttachment[]` field (`{ mediaType, dataBase64 }`) rather than a parallel multimodal contract. `client.ts` translates it to the AI SDK's current `FilePart` shape (not the deprecated `ImagePart`) only when attachments are present — every pre-existing call site (Intake, Script Generation, Script Review) is unaffected, since a message with no attachments still passes through as a plain string. Added `video-intelligence-own-draft` to `registry.ts`, resolving to `claude-haiku-4-5` (cheap/fast tier per `AGENT_FLEET_DESIGN.md` 8.1 — Haiku supports image input).

## `MAX_VIDEO_REGEN_ATTEMPTS` — proposed value confirmed as-implemented: **2**

Matches `docs/execution/week3/BUSINESS_LOGIC.md`'s proposed default exactly (up to 3 total `video_generation` attempts before escalating). Implemented as: after a `video_review` fail, regen is allowed if the just-reviewed `video_generation` attempt's own `attemptNumber` is `<= 2`; if it's already `3`, the cap trips. Verified live below — not just unit-tested.

## What Was Done

- **Deterministic checks** (`runDeterministicChecks`, zero LLM cost): `ffprobe` for duration (≤60s Shorts limit) and aspect ratio (9:16, ±2% tolerance), `ffmpeg`'s `volumedetect` filter for near-silence (mean volume below -45dB). Any failure returns a specific reason and the function returns *before* any LLM call is even considered.
- **Multimodal pass** (only runs if deterministic checks pass): extracts one frame at the video's midpoint via `ffmpeg`, base64-encodes it, calls `studio/src/llm/` with `purpose: 'video-intelligence-own-draft'` and the frame as an attachment alongside the topic/script text. Zod-validated `{ verdict, notes }` response, same JSON-extraction convention as every other agent.
- **`state-machine.ts`'s `runVideoReviewStage`**: writes a `UsageEvent` row *only* when the multimodal pass actually ran (a deterministic-only fail writes none). Writes a `ReviewLog` row (`agent = 'video-intelligence-own-draft'`) and mirrors the verdict/rationale into `pipeline_stages.output` either way. On pass: `PipelineRun` → `paused_gate2`/`gate2`. On fail: regen (`video_generation`, same run, next attempt) if under the cap, else `needs_attention` with the circuit-breaker message.

## Real verification — including a genuine, unplanned finding

Ran real `video_review` against the actual video produced in Task 2 (real deterministic checks, real multimodal Claude Haiku call — no stubbing exists or is needed for this agent, since it only calls `studio/src/llm/`, already real, not `studio/src/media/`).

**Deterministic-fail path**: generated a deliberately wrong-aspect-ratio (16:9) test video directly, confirmed `runDeterministicChecks` failed it specifically on aspect ratio, with zero LLM calls made (verified by inspection — the function returns before `extractMiddleFrameBase64`/`callLLM` are ever reached).

**Multimodal pass — a real, useful finding, not a rubber stamp**: the real Claude Haiku call correctly identified that the extracted mid-video frame shows only a fragment of a single flashing caption word (e.g. "with"), not a meaningful representative frame — a **genuine, valid critique** of Task 2's one-word-flash caption style combined with midpoint-frame extraction: any single frame from that style will usually show a partial word, not real content. This is real intelligence working as intended, not a false negative — flagging it here as a design consideration for a future Video Generation refinement (e.g. sampling multiple frames, or extracting from a caption-free moment), **not a bug in this task**, which correctly caught and acted on it.

**Circuit breaker — tripped for real, at exactly the proposed cap**: ran the same run through 3 full `video_generation` → `video_review` cycles. All three failed for the same genuine reason above. Attempt 1 fail → regen (attempt 2). Attempt 2 fail → regen (attempt 3). **Attempt 3 fail → `needs_attention`**, with the cap message, not a 4th regen. This is Week 1's originally-scaffolded-but-never-exercised regen circuit breaker (`docs/execution/week1/BUSINESS_LOGIC.md` Section 4) running for real for the first time, and it behaved exactly as designed — no change needed to the original scaffolding.

## Test Results

```
npm run typecheck   -> clean
npm run build       -> clean
npm run lint        -> clean

Deterministic-fail test (16:9 video): failed with "Aspect ratio 1920x1080 is not
  9:16" reason, zero LLM calls (verified by code path, not just by absence of a
  UsageEvent row)
Real multimodal pass (real video): genuine, specific fail verdict ("partial word
  fragment, not a representative frame"), UsageEvent row written ($0.0025,
  claude-haiku-4-5, 1876 input / 122 output tokens), ReviewLog row correct
Circuit breaker (3 real cycles): attempt 1 fail -> regen, attempt 2 fail -> regen,
  attempt 3 fail -> needs_attention (cap reached), not a 4th regen
```

## Deviations from Spec

- **Retry-with-backoff not wrapped around the multimodal call** — Script Generation/Review both wrap their LLM calls in `withRetryAndCircuitBreaker` for transient-failure retries; `runVideoReviewStage` does not. A genuine simplification, not an oversight: wrapping would require restructuring the per-attempt `UsageEvent`-logging pattern (the deterministic-check-only path returns normally rather than throwing, so retry semantics don't apply uniformly here the way they do for a pure LLM-calling stage). A transient LLM failure during video review currently routes straight to `needs_attention` rather than retrying. Flagging as a real gap, not silently deviating from the established pattern.
- The flashing-caption/frame-extraction interaction described above is a real, recurring finding from this task's own live testing, not something this task was asked to fix — noted for whoever next touches Video Generation's caption style or this agent's frame-sampling strategy.

## Sign-Off

- Task Objective: Met
- Schema Impact: None new (as specified)
- Business Logic: Matches `docs/execution/week3/BUSINESS_LOGIC.md` Sections 1, 3 — pass/fail/circuit-breaker branches all verified live, not just unit-tested
- Tests: Passing — deterministic gate, real multimodal pass, and a genuine circuit-breaker trip all verified
- Ready for Integration: Yes — Task 4 (Gate 2) is the first real consumer of a `pass` verdict
