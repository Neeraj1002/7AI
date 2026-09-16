# Sprint 2 Task 5: Custom Cover Frame + Title/Description A/B Testing (Investigation)

**Date**: 2026-09-16
**Status**: Complete (H1 explicitly **not fully working end-to-end** — a real founder-action blocker
found via live testing, stated plainly, not glossed over. H2 closed, not viable as scoped.)
**Files Created**: 1 (`docs/execution/sprint2/tasks/task5.md`)
**Files Modified**: 6
**Tests**: All Passing (`npm run build && npm run lint && npm run typecheck && npm test` — 68 tests,
all clean)

## H1 status — read this first

**The custom-cover-frame code is real, built, wired in, and its failure isolation is real-verified —
but the real `thumbnails.set` call itself does not succeed yet**, because of a genuine, live-found
founder-action gap, not a code bug. Before implementation, `sprint2/tasks/task5.md` itself checked
(per its own instruction) that the channel could plausibly support this: `channels.list?part=status`
showed `longUploadsStatus: "eligible"`, i.e. phone-verified. That check turned out to prove the wrong
thing. A real end-to-end run (see Verification below) hit a real `403`:

```json
{"error":{"code":403,"message":"The authenticated user doesn't have permissions to upload and set custom video thumbnails.","errors":[{"reason":"forbidden","domain":"youtube.thumbnail","location":"Authorization","locationType":"header"}]}}
```

`longUploadsStatus` and custom-thumbnail permission are two different eligibility gates. The OAuth
token already carries `youtube.upload` (one of the scopes Google's own docs list as sufficient for
this endpoint), so this isn't a scope problem either — it's most likely a separate, Studio-side
feature-eligibility step (Settings → Channel → Feature eligibility → Custom thumbnails) that hasn't
been completed on this channel. This is tracked as a new founder action,
`KNOWN_ISSUES_AND_BLOCKERS.md` §1 (H1) — not silently left for a later session to rediscover.

What **is** fully verified, real: the ffmpeg cover-frame extraction genuinely works (a real 181KB
JPEG was produced from the real rendered video at the LLM's own chosen timestamp), and the failure
isolation genuinely works — the real run that hit this real 403 still completed the `publishing`
stage successfully, with the already-uploaded video untouched and `coverFrameSet: false` recorded
truthfully.

## What Was Done

### H1 — Custom cover frame

`PublishingMetadataSchema` (`agents/publishing/types.ts`) gained
`coverFrameTimestampRatio: z.number().min(0).max(1)` — a sibling output of the same
Metadata-Generation LLM call that already produces title/description/tags, same "extend the existing
cheap-tier call" principle Week 5 Task 4's C3 and Sprint 2 Task 4's G3 both established. The system
prompt gained explicit guidance: pick a moment that reads well as a static image (a clear visual,
ideally near the hook), avoiding the first/last ~5% where a fade or mid-caption transition is more
likely.

`extractCoverFrame` (`agents/publishing/index.ts`) mirrors Video Intelligence's own
`extractSampleFramesBase64` technique exactly: ffmpeg `-ss <timestamp> -frames:v 1`, one real JPEG,
no new pattern. `setThumbnailViaProvider` (`agents/publishing/youtube-client.ts`) is the only new
function touching the real API — confirmed against Google's own documentation before building it:
raw image bytes as the POST body (not multipart, unlike the video upload), `videoId` as a query
param. `setThumbnail` (`agents/publishing/index.ts`) is the `YOUTUBE_STUB`-aware wrapper, same
pattern `uploadVideo` already uses.

`state-machine.ts`'s `runPublishingStage` calls `extractCoverFrame` + `setThumbnail` as a genuinely
separate, best-effort follow-up immediately after the existing upload succeeds — wrapped in its own
try/catch, logged and never rethrown on failure, never escalated to `needs_attention`. A new
`coverFrameSet: boolean` audit field is recorded in the stage's own output either way, so the real
outcome is always visible without digging through logs. Same "isolated, non-blocking, logged" design
Sprint 2 Task 4's G2 established for retention-curve capture, for the same underlying reason (a
secondary capability's failure must never regress a primary one that already works).

### H2 — Title/description A/B testing: investigated, closed, not viable as scoped

`MVP_PART3_CONTENT_QUALITY_AND_GROWTH_LOOP.md` §2 proposed Publishing drive YouTube's built-in
title/thumbnail test feature directly from Metadata Generation's output. Live research (`WebSearch`)
against Google's own current (2026) documentation found two disqualifying facts:

1. **Shorts are explicitly excluded.** Per YouTube's own help documentation: *"You are not able to
   A/B test Shorts, scheduled lives and Premiere videos at this time... A/B testing is not available
   for Shorts."* This project produces Shorts exclusively — there is no content type this project
   makes that the feature would ever apply to.
2. **No programmatic API surface exists at all.** The feature ("Test and Compare") is *"currently
   only available on computers through YouTube Studio"* — no `videos.update` field, no dedicated
   endpoint, nothing in the YouTube Data API v3 reference. Even setting aside (1), there would be
   nothing for Publishing to call.

No code was written against this — building a stub or partial version of something structurally
inapplicable to this project's actual content type was explicitly out of scope per the task's own
instruction. Closed with real citations in `KNOWN_ISSUES_AND_BLOCKERS.md` §4 and
`MVP_PART3_CONTENT_QUALITY_AND_GROWTH_LOOP.md` §2.

## Verification — real, live, per the task's own bar

A full real end-to-end `PipelineRun` was driven through the actual pipeline via `scripts/dry-run.ts`
(intake stubbed for speed/cost; script generation, script review, video generation, video review,
gate1, gate2, and **publishing** all real) — never touching the founder's existing public video, a
brand-new private test upload created for this verification alone.

1. **Real gate2 approval defaulted privacy to `private`**, confirmed by reading the stage output
   before publishing: `{"outcome":"approve","privacyStatus":"private"}` — this run was never at risk
   of becoming public.
2. **The real upload succeeded**: `youtubeVideoId=sOnC-fyjpu8`, a real, new, private video — distinct
   from any prior test video or the founder's own content.
3. **The real Metadata Generation call chose a real `coverFrameTimestampRatio: 0.35`** for this
   video's actual content (an octopus-hearts script), proving the LLM genuinely reasons about this
   field, not just schema-validates it.
4. **`extractCoverFrame` genuinely works**: a real 181KB JPEG (`1.mp4.cover-frame.jpg`) was produced
   from the real rendered 71.5s video at the real chosen timestamp.
5. **`setThumbnailViaProvider`'s real request hit a real, specific 403**, quoted above — confirmed via
   a temporary scratch diagnostic script (deleted after use) that called the real endpoint directly
   and dumped the full real error body, not just the classified message.
6. **Failure isolation is real-verified, not just designed**: `dry-run.ts publish` printed
   `[dry-run] publishing completed without interruption` despite the real 403 — the stage's own
   output correctly recorded `coverFrameSet: false` alongside the real, successful
   `youtubeVideoId`/`privacyStatus`/`metadata`. `PipelineRun.status` advanced to the `analytics`
   stage exactly as it would have if the thumbnail call had never been attempted at all.
7. **A direct re-check of `channels.list?part=status`** (same real credentials) reconfirmed
   `longUploadsStatus: "eligible"` at the moment of the real 403 — ruling out a transient
   verification-state flip as the explanation; the gates are genuinely separate.
8. **H2's citations are from current (2026) documentation**, fetched live during this task, not
   carried over from any earlier session's knowledge.

## Files Created/Modified

- Created:
  - `docs/execution/sprint2/tasks/task5.md`
- Modified:
  - `studio/src/agents/publishing/types.ts` — `coverFrameTimestampRatio` field
  - `studio/src/agents/publishing/youtube-client.ts` — `setThumbnailViaProvider`, `YOUTUBE_THUMBNAILS_SET_URL`
  - `studio/src/agents/publishing/stub.ts` — `stubSetThumbnail`
  - `studio/src/agents/publishing/index.ts` — `extractCoverFrame`, `setThumbnail`, `SYSTEM_PROMPT` update
  - `studio/src/agents/publishing/youtube-client.test.ts` — `setThumbnailViaProvider` mocked-client tests, `coverFrameTimestampRatio` added to existing fixtures
  - `studio/src/run-pipeline/state-machine.ts` — isolated cover-frame step wired into `runPublishingStage`

## Schema Changes Applied

None. `coverFrameTimestampRatio` and `coverFrameSet` both live inside the existing
`PipelineStage.output` Json (the `publishing` stage's existing `metadata`/output shape). See
`sprint2/SCHEMA.md`.

## Test Results

```
npm run build       -> clean
npm run lint         -> clean
npm run typecheck    -> clean
npm test             -> 11 test files passed (11), 68 tests passed (68)
```

Plus the real, live end-to-end run described above (not a synthetic test).

## Deviations from Spec

- **H1's own success criterion #1 ("a real published video gets a real custom thumbnail") is not
  fully met** — not because the code is wrong, but because a real, live-found founder-action gap
  blocks it. The task spec anticipated checking phone-verification before building
  (`longUploadsStatus: "eligible"`, confirmed) but that check turned out to prove a different thing
  than assumed. This is reported plainly rather than claiming success on a criterion that isn't
  actually met yet — the same posture `sprint2/reports/task4.md` took for G1.
- **Success criteria #2 (failure isolation) and #3 (H2 closed with a real, cited reason) are both
  fully met**, and #2 in particular was verified against a real failure, not a forced/simulated one —
  a stronger form of verification than the task anticipated needing.
- **`durationSeconds` availability guard**: `runPublishingStage` skips the cover-frame step with a
  logged warning (rather than crashing the stage) if `video_generation`'s stage output somehow lacks
  `durationSeconds` — not spec'd explicitly, added because the field's presence is an implicit
  assumption this task introduces a new dependency on, and a stage row from before this dependency
  existed should degrade gracefully, not crash.

## Sign-Off

- Task Objective: Partially met, honestly reported. H1's code is complete, real-verified for
  extraction and for failure isolation; the actual `thumbnails.set` success criterion is blocked on a
  real, newly-found founder action (tracked, not hidden). H2 is fully met — investigated first,
  closed with real, current citations, no code built against a structurally inapplicable feature.
- Schema Impact: None — confirmed and documented in `sprint2/SCHEMA.md`.
- Business Logic: `sprint2/BUSINESS_LOGIC.md` updated with the isolation design and both real
  findings (H1's permission gate, H2's Shorts-exclusion/no-API-surface finding).
- Tests: Passing (68/68), plus real live end-to-end verification including a real failure case.
- Ready for Integration: Yes. H1 remains genuinely open — tracked in
  `KNOWN_ISSUES_AND_BLOCKERS.md` §1, with the exact real error and the most likely fix path, not
  silently left for someone else to rediscover.
