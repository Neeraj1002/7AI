# Sprint 4 Task 9: Long-Form Video Foundation (Backend)

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow, the Hard rules (one worktree per session, never push to `main`) and the report shape. This file states only this task's specifics.

**Written**: 2026-10-11 by the architect chat. **Status**: not started. **Branch**: `SPRINT4_TASK9_BE`, in its own worktree.

**Objective**: Let the same pipeline produce a 16:9 video of 2 to 15 minutes (a "long-form video") as a second type next to Shorts, set per run from the app, generic for every channel. Shorts must behave exactly as today.
**Duration**: 2 to 3 days.
**Depends On**: PR #49 (Sprint 4 Tasks 1 to 7) merged; Sprint 4 Task 8 (merged); Sprint 3 Task 12 (merged). The image-model spike (`Sprint3/tasks/hardening-gpt-image-migration.md`, R1) should be done first because it settles the landscape size, price and rate limit. If its report is not on `main` when you reach R5, make those measurements yourself (one real call per size) and record them.
**Owning Component**: `studio/src/api/routers/runs.ts`, the creation-options schema, `studio/src/formats/`, `studio/src/channel-profile/resolve.ts`, script generation, narration, `ai-visuals/`, `video-generation/`, the budget pre-check.
**Success Criteria**: (1) a real `runs.create` with `videoKind: 'long'` and a 2-minute target runs to Gate 2 on the dev database and produces a 1920x1080, 30 fps, -14 LUFS MP4 whose length is within 2% of the narration, with chapters and an SRT built from the exact script text; (2) measured cost and render time are in the report; (3) a normal Shorts run is unchanged (same stage inputs, same output, same cost); (4) a crash during image generation resumes without re-paying finished stills; (5) a channel's offered formats are stored in its profile, filtered by type through `channels.listFormats`, and enforced at `runs.create` (R1b).

**Design rule (founder, 2026-10-11): every long-form video is published publicly on a real channel.** So nothing in this task may send a placeholder or stub output to Gate 2; music must be licensed for monetised public use; AI-generated images keep the synthetic-media flag on upload; facts come only from the brief and its sources; and any check that cannot run must fail the run loudly, never pass silently.

> This task does **not** include: the long-form review rubric, the long-form quality profile, the Gate 2 preview copy, publishing changes, analytics, or any app screen. Those are Sprint 4 Task 10 and the UI track. Thumbnails stay manual.

---

## R0. Read the code first (nothing below is final until you have done this)

The architect could not read the code from the chat, so every "What exists" line below comes from reports and docs. Before changing anything, open the real files and put a table in the report: each "What exists" line, **confirmed** or **wrong (what is really there)**. If a line is wrong, follow the real code and say so. Files to open: `runs.ts`, the creation-options schema (`CreationOptionsSchema`), `formats/manifest.ts`, `channel-profile/resolve.ts` and `ChannelProfileDataSchema`, `generateScript` and its prompt, the TTS and Whisper calls, `ai-visuals/client.ts` and `registry.ts`, `plan.ts` (`estimateStillCount`), `video-generation/index.ts`, `captions-ass.ts`, `audio-mix.ts`, `audio-bed/manifest.ts`, the budget pre-check, and how a stage is resumed after a restart (Task 12 R5).

## R1. Run options: the new `videoKind`

**What exists**: `targetDurationSec` is a union of 30, 45, 60 (Sprint 3 Task 9 R4); the resolver (Sprint 4 Task 2) defaults to 45 and never exceeds 60; `runs.create` takes `formatKey` (Task 6).
**Change** (name is `videoKind`, not `format`, because `format` already means the content format such as countdown):

```typescript
// runs.create input (additions only)
videoKind?: 'short' | 'long'          // default 'short'
targetDurationSec?: 30 | 45 | 60      // when videoKind = 'short' (unchanged)
                  | number            // when videoKind = 'long': integer, whole minutes, 120..900, e.g. 300, 600
```

- Validate at the API edge: long requires a multiple of 60 between 120 and 900; otherwise `BAD_REQUEST` with a plain message ("Video length must be a whole number of minutes from 2 to 15"). Short keeps today's validation. A client that sends neither field behaves exactly as before.
- Add `videoKind: 'short' | 'long'` (default `'short'`) to `ContentFormat` in the format manifest, and to `channels.listFormats` output. If `formatKey` is sent and `videoKind` is not, infer it from the format. If both are sent and disagree, `BAD_REQUEST`. Seed one generic long format `chaptered-explainer` (about 600 s, 4 chapters, cold open, closing line). Channel-specific long formats come later through the channel profile, not this task.
- Resolver: precedence stays run override, then format, then channel profile, then default. The "never exceed 60" cap applies to `short` only. Default long length when nothing is set: 600 s.
- Store `videoKind` and the resolved `targetSeconds` in the run's resolved options so every later stage reads them from one place.
- `runs.get` returns `videoKind` and `targetSeconds` (the app needs them for the chip "Video · 10 min").

## R1b. Formats each channel offers (founder decision 2026-10-11)

**What exists** (verify in R0): `ChannelProfileDataSchema` and `ChannelProfileVersion` (Task 1, merged in PR #49), the format manifest and `channels.listFormats` with 9 seed formats (Task 6), `runs.create` with `formatKey`.
**Change**:
1. Profile field: add `offeredFormatKeys?: string[]` to `ChannelProfileDataSchema`. Each key must exist in the format manifest (unknown key: `BAD_REQUEST`), no duplicates, any mix of `short` and `long` formats. The UI recommends 2 to 4; the server does not enforce a count. A profile version without the field (every existing version) means "none". `getActiveProfile`, `listProfileVersions` and the resolver (`resolveChannelConfig`) return it (resolver default `[]`). Stored inside the existing profile JSON, so no migration is expected; if R0 shows otherwise, add one.
2. `channels.listFormats` takes an optional input `{ channelId?: string; videoKind?: 'short' | 'long' }`. Without `channelId` it returns all formats exactly as today, each now with `videoKind`. With `channelId` it returns only the formats in that channel's active profile, in the profile's order (an empty list returns `[]`). `videoKind`, when sent, filters after that. Entry shape:
```typescript
{ key: string; label: string; videoKind: 'short' | 'long'; targetSeconds: number; briefTemplate: string; scriptStructure: string }
```
3. Freeform is not a format entry. It is the absence of `formatKey` on `runs.create`, always available and the default. The app adds it itself.
4. `runs.create`: if the channel's list is non-empty and `formatKey` is not in it, `BAD_REQUEST` ("That format is not offered by this channel"). If the list is empty, any known `formatKey` is still accepted (keeps API callers and existing tests working; the app only shows Freeform in that case). The existing checks stay: the format's `videoKind` must match the run's `videoKind`.
5. Tests: unknown key rejected, duplicate rejected, older profile version returns `[]`, `listFormats` with and without `channelId` and `videoKind`, `runs.create` accepted and rejected cases, Freeform run unchanged.

## R2. Script generation

**What exists** (verify): `generateScript` was rewritten on `main` (structured output, one repair retry, spend tracking) and Sprint 4 Task 2 added raw brief, fact policy, `sources`, banned phrases and `styleGuideViolations`. The prompt still assumes a Short.
**Change**:
1. A long-form prompt, used only when `videoKind = 'long'`: about 145 words per minute of target length (a 10-minute video is about 1,450 words), a cold open of the first 20 to 40 seconds, 3 to 6 chapters (each at least 25 words so each lasts at least 10 seconds), one or two open loops that the next chapter answers, and a closing line that points forward. Every chapter opens with the question it answers. The channel profile (hooks, banned phrases, fact policy, style guide) still applies.
2. Output gains `chapters: { title: string; text: string }[]`. `script.text` stays the concatenation of the chapter texts (so every existing reader keeps working). Shorts output has no `chapters` field. Same JSON safety as Bugs Task 11 (straight quotes, structured output, one repair retry).
3. Length check: word count must be within ±20% of the target (145 words per minute). Outside the range, one repair attempt, then continue and record `lengthOutOfRange: true` for the reviewer. Do not fail the run on length alone.
4. **Facts**: the long-form prompt may use only facts in the brief and `sources`. It must not add dates, prices or names that are not there (the Script Review misses SR-8 and SR-9). Decision (2026-10-11): the founder supplies a full facts brief with sources; the pipeline does no web search. A research step that proposes sourced facts for the founder to approve is a separate, later decision.
5. Gate 1 edit: the edit sheet shows the script with chapter lines written as `## Title` followed by the chapter text. On save, parse the `##` lines back into `chapters`. If parsing finds fewer than 3 chapters, reject the edit with a plain message.

## R3. Narration

**What exists**: one TTS call for the whole script; the provider limits each request to 4,096 characters.
**Change**, long-form only:
1. One TTS request per chapter. A chapter over 4,000 characters is split at sentence boundaries into chunks under 4,000. Same voice, model and speed for every chunk.
2. Concatenate with ffmpeg, adding 250 ms of silence between chapters and 80 ms between chunks inside a chapter. Measure each chapter's real duration with `ffprobe` and store `chapterTimings: { title, startSec, endSec }[]` (the description timestamps and the SRT use it).
3. Whisper runs per chunk, not on the whole file (it limits uploads to 25 MB; a 15-minute mp3 is fine, WAV is not). Offset each chunk's word times by its start. Check the file size before sending and fail with a clear message if a chunk is over the limit.
4. Narration spend is recorded per request as it happens.

## R4. Subtitles (SRT)

Build `captions.srt` from the **exact script text** with Whisper word timing, reusing Task 8's alignment (script words, Whisper timings). Lines of at most 42 characters, at most 2 lines, 1 to 6 seconds each. Store it as a run artifact next to the video (same bucket and cleanup as the video). Do not burn captions into long-form video. The test: parse the SRT back, times are increasing, and the text with whitespace normalised equals the script text.

## R5. Stills

**What exists** (verify): `STILL_SIZE` is a fixed portrait 1024x1536; `estimateStillCount` is capped at 20 and now uses the profile's `secondsPerStill` (Task 3); the rate-limit wait is per still; `resolveImagePricing` throws for an unknown model.
**Change**, long-form only:
1. A landscape size constant for long-form, set from the image-model spike (today's model offers 1536x1024, which is 3:2; the render step scales and crops it to 1920x1080 with a centre crop, leaving room for the zoom). If the spike says another size, use that and note it.
2. Still count = `ceil(targetSeconds / secondsPerStill)`, clamped to 12..200. Default `secondsPerStill` for long = 5 (decision 2026-10-11: the pilot plan implied about 5.4 s, and a new picture every 5 s suits retention); the format manifest or channel profile can override it. A 10-minute video is about 120 stills.
3. Each scene belongs to one chapter and carries the words it illustrates, so image timing follows the narration. The planner gets the channel style guide (Task 3) and the chapter titles. Long-form uses `ai-stills` only. If the run asks for stock footage, return `BAD_REQUEST` at `runs.create`.
4. **Disk cache by prompt hash**: key = hash of (model, size, quality, final prompt text). Store files under a per-run folder in the data directory. On a restart or a retry the stage reads the cache and generates only the missing stills; spend is recorded per still when it is generated, so a cache hit costs nothing and a crash never loses paid work. Delete the folder when the run reaches a terminal state, using the existing temp cleanup path. No reuse across different runs.
5. Price every still through `resolveImagePricing`, never hard-coded.
6. Image generation takes about 24 minutes for a 10-minute video at 5 images a minute (up to 36 for 15 minutes). Make sure no stage timeout, heartbeat or stale-run rule (Task 12) kills or double-starts a stage of this length. Report what you found.

## R6. Render

**What exists** (verify): output is hard-coded 1080x1920; captions are burned `.ass` at PlayRes 1080x1920; Task 8 added the audio chain (sidechain-ducked bed, two-pass `loudnorm` to -14 LUFS, AAC 192k/48 kHz stereo), 30 fps constant, `libx264 -preset medium -crf 20`, and the Ken Burns single-multiplication `zoompan` with contiguous windows (Sprint 2 Task 2 regression).
**Change**: a render profile (width, height, fps, burn-in or not) chosen from `videoKind`.
1. Long: 1920x1080, 30 fps, no burned-in captions, `-maxrate 8M -bufsize 16M` (YouTube's recommended 1080p30 bitrate). Reuse the audio chain unchanged.
2. Ken Burns alternates push-in and lateral pan, never the same move twice in a row, using the existing single-multiplication `zoompan` and contiguous windows. Frame count must equal `30 x duration`.
3. Order of work: build the full mixed and loudness-normalised audio first, then render the video, then mux. Render the video in one segment per chapter and join them with the concat demuxer (`-c copy`) so a crash resumes at the last finished chapter. If this is too invasive for the existing `generateVideo`, say so in R0 and do the simplest resumable version; whole-render resume is a follow-up.
4. **Music beds** (decision 2026-10-11): the manifest (`audio-bed/manifest.ts`) allows several tracks per mood, and the founder adds longer tracks. For long-form, chain tracks of the chosen mood in a fixed order with 3-second crossfades until the video is covered; loop the last track only when no more tracks exist. Same -18 LUFS bed level and ducking. Every manifest entry's `license` field must say it is cleared for monetised public use and whether attribution is required; Task 10 R4 adds required credits to the description.
5. Shorts rendering must be byte-for-byte the same command as today (assert this in a test).
6. Report render time per output second for long-form (the dev machine measured about 1.6 s per output second for Shorts).

## R7. Budget

**What exists**: new tenants get $10 a week split across YouTube-connected channels (Task 12); the pre-check runs before render.
**Change**:
1. `estimateLongFormCost` from the real unit prices: stills (`resolveImagePricing`), narration characters, Whisper minutes, LLM tokens for script, review and planner. Return per attempt and worst case (3 attempts with the still cache, so the worst case pays for stills once).
2. Pre-check at `runs.create`: if the estimate for one attempt is more than the channel's remaining weekly share, reject with a message that states both numbers ("Estimated $1.70 for this video, $1.20 left this week for this channel"). Check again before the image stage and before render, as Shorts do today.
3. **Per-video spend limit, set by the user on the brief screen** (decision 2026-10-11). New procedure `runs.estimateCost({ channelId, videoKind, targetDurationSec, options? })` returns `{ estimateUsd, worstCaseUsd, suggestedMaxUsd, remainingWeeklyUsd }`. `suggestedMaxUsd` = 1.5 x the per-attempt estimate, rounded up to the next $0.50. A flat $2 default would reject a 10-minute video (about 120 stills plus narration and LLM is about $2.0 to $2.2 at today's image price). `runs.create` takes optional `maxCostUsd` (default `suggestedMaxUsd`) and rejects it if it is below the per-attempt estimate, stating both numbers. The run's spend is checked against `maxCostUsd` before the image stage, before render, and after every paid call; when reached, stop with the existing `needs_attention` path and a plain message. An absolute cap `LONGFORM_MAX_RUN_USD_LIMIT` (env, default 10) bounds what anyone may type; the channel's weekly share still applies on top.
4. Put the measured numbers (first attempt, worst case) in the report. The channel playbook's pilot estimate was about $1.55 for 100 stills plus narration, on the current image model.

## Schema Impact
No table changes expected: `videoKind` and the resolved options live in the run's existing options JSON, `chapters` and `chapterTimings` live in the stage output JSON. If R0 shows otherwise, add one migration, sorted after `main`'s newest, and list it in the report. Update `SCHEMA.md` and `BUSINESS_LOGIC.md` with the delta.

## Business Logic / State Transition
- No new run statuses. A long run uses the same stages and gates. Stage durations are longer (image stage about 24 minutes and up to 36, render 15 to 25 minutes); R5.6 covers the timeouts.
- Preconditions for the image stage: script approved, chapters present, budget pre-check passed.
- Postconditions: every finished still is on disk and its spend is booked before the next one starts; chapter segments are on disk; a restart resumes from them.
- Failure modes: TTS or Whisper failure on one chunk retries that chunk only; a provider 429 waits as today; moderation-blocked stills are skipped as today and the scene reuses the previous image; budget exceeded stops the stage with the existing `needs_attention` path.

## Testing
```bash
npm run build && npm run lint && npm run typecheck && npx vitest run
```
Unit tests: `videoKind` validation (short unchanged, long 120 to 900 whole minutes, mismatch with `formatKey`), resolver precedence and the 60-second cap applying to short only, chapter parsing from the edit sheet, TTS chunking under 4,000 characters, SRT build and parse-back, cache hit and miss, still-count clamp, cost estimate, Shorts render command unchanged.
**Real test, on the dev database, before any long run**: one 2-minute long-form run to Gate 2. Record: stills, image time, narration time, render time, total cost, final duration versus narration (within 2%), LUFS (-14 +/-1), frame count equal to 30 x duration, resolution, SRT parse-back. **Do not run a 10-minute video until the founder has seen the 2-minute result.** Then one 10-minute run only if the founder asks.

## Report
`docs/execution/sprint4/reports/task9.md` with the R0 table, measured numbers, deviations and open items. Do not edit `docs/STATUS.md` or other shared status pages; send the architect a one-line status.

## Known Issues / Future Improvements
- Regenerate only the scenes the reviewer flags (later).
- Code-drawn cards (map, price, chapter) and an auto-generated thumbnail (after the thumbnail 403 is fixed).
- Stock footage for long-form, mid-roll ads, videos over 15 minutes: not planned.

## Decisions (2026-10-11, do not reopen)
- Facts come from the founder's brief; no web search in the pipeline.
- Music: several tracks per mood, chained with crossfades; the founder adds longer, monetisation-cleared tracks.
- Default 5 seconds per still.
- Per-video spend limit chosen on the brief screen, with a suggested value from the estimate.
- Long-form videos are published publicly on real channels.
- Each channel's Content profile lists the formats it offers; the New brief picker shows only those that match the chosen Type, plus Freeform (always available, the default). A channel with no list shows only Freeform.

## Links & References
- `docs/execution/sprint4/PENDING.md` · `sprint4/tasks/task8.md` and `reports/task8.md` · `sprint4/tasks/task6.md` · `Sprint3/tasks/hardening-gpt-image-migration.md` · `docs/channel_bibles/NOT_IN_YOUR_TEXTBOOK.md` §14 (the one-off pilot renderer this replaces) · `docs/review_tuning/SCRIPT_REVIEW_MISSES.md`
