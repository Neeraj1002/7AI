# Sprint 4 Task 10: Long-Form Video Quality, Preview and Publishing (Backend)

**Date**: 2026-10-11
**Status**: Code complete and unit-tested. The real end-to-end check on the dev database is **not done**: it needs Task 9 PR B (the 2-minute long render with `chapterTimings` and `captions.srt`), which had not merged. A synthetic 1920x1080 file was used for the parts that do not need PR B (see "Real checks").
**Branch**: `SPRINT4_TASK10_BE` (worktree `D:\Study Material\7AI-SPRINT4_TASK10_BE`), cut from `main` at `d732ca4` (Task 9 PR A merged).
**Tests**: `npm run build`, `npm run lint`, `npm run typecheck` clean; `npx vitest run`: 82 files passed, 581 tests passed (9 files / 49 tests skipped, the DB-backed ones). New: `long-form/long-form.test.ts`, `agents/video-intelligence/long-form-quality.test.ts`, three added cases in `dashboard-comparison.test.ts`.

## What was done

- **R1 Script Review**: long-form rubric (`LONG_FORM_SYSTEM_PROMPT`), chosen by `videoKind`. Criteria: chapter flow, cold open (`hookScore`), open loops, closing line, length within +/-20% (also reads `lengthOutOfRange`), facts only from the brief. Factual-concern and style rules are the Shorts ones. Output adds optional `chapterNotes`. The Shorts prompt, message and stage input are unchanged (asserted).
- **R2 Quality profile**: `qualityProfileFor(videoKind, secondsPerStill)` in `quality-spec.ts`. Long: 1920x1080, 30 fps, 120-900 s, video within 2% of the narration, loudness unchanged, no caption row, longest shot `1.5 x secondsPerStill` (6 s still: 9 s allowed). Blocking rules are the Shorts kinds plus duration range and narration match. Visual review takes one frame inside every chapter (midpoints of `chapterTimings`, capped at 12). Each row keeps its `warn` flag.
- **R3 Preview and artifacts**: after a passing long review, `video_review` creates a 1280x720, 30 fps, 1.5 Mbps / 96k, `-preset veryfast` copy and checks the SRT exists; both go next to the draft in R2 (`<attempt>.preview.mp4`, `<attempt>.srt`) when R2 is configured, and the local files always back `/runs/:id/preview` and `/runs/:id/subtitles`. A missing SRT or an ffmpeg failure is a stage failure with the normal retry. `runs.get` (long only) returns `previewUrl`, `videoUrl`, `subtitlesUrl`, `subtitlesUploaded`, `subtitlesMessage` (only on failure), `chapters`. The debug bundle for a long run keeps only transcript, plan, ffmpeg args and script.
- **R4 Publishing**: chapter list appended (rules enforced in `buildChapterList`; if broken the video publishes without it and Gate 2 shows a `Warning:` line), `#shorts` stripped from title/description/tags, category 27 default, `Music:` credit lines, `captions.insert` after the upload with the new `youtube.force-ssl` scope, language from the profile's `defaultLanguage` (else `en`) and the language name as track name, failure recorded with the two specified messages, technical error in the log and stage output.
- **R5**: no change. Gate 2 follows the channel toggle.
- **R6 Analytics**: long snapshots record `longFormMetrics` (new nullable Json column); `dashboard.comparison` takes `{ videoKind? }` and returns `videoKind` per row.
- **R7**: not built.

## R0: "What exists" versus the real code

| Line in the task | Result |
| --- | --- |
| Rubric is Shorts-specific (`hookScore`, `fitsLengthLimit` against 60 s) | **Confirmed** (`script-review/index.ts`) |
| Concerns/violations/sources shown at Gate 1 (Task 2) | **Confirmed** (`runs.get` `scriptReview`) |
| `QUALITY_SPEC` / `qualityMetrics` for 1080x1920, caption presence | **Confirmed**; the hard checks read `QUALITY_SPEC.video` directly, now a profile argument defaulting to the Shorts one |
| Upload sends title, description, tags, `selfDeclaredMadeForKids`, `defaultLanguage`, category (Task 5) | **Confirmed** (`buildUploadMetadataPart`) |
| "`#shorts` is added for Shorts" | **Wrong**: no code adds `#shorts`. Only the model-written metadata or the script hashtags could contain it. Long-form now strips it defensively; Shorts are untouched |
| Analytics reads Shorts metrics; `dashboard.comparison` groups by channel and format | **Confirmed**: Data API `videos.list` (views/likes/comments) plus an Analytics `reports.query` retention curve; comparison groups by `formatKey` |
| "Chapters, `chapterTimings`, `captions.srt` from Task 9" | **Not on `main` yet**. PR A has `chapters` (`{title,text}`) only. See "Assumed Task 9 shapes" |

**How Video Intelligence is fed**: it is not Google Video Intelligence. `reviewVideo` extracts JPEG frames with ffmpeg (`-ss`, one frame each), base64-encodes them and sends them inline to the multimodal LLM (`video-intelligence-own-draft`). No video bytes are ever uploaded, so file size (hundreds of MB) does not matter; cost is per image sent, not per video minute, so a long video costs roughly (frames) x (one image) instead of 3. Chapter sampling raises the count from 3 to the chapter count (3 to 6 normally, capped at 12). The per-image price is whatever the `video-intelligence-own-draft` model charges through `callLLM`; it is metered in the existing `UsageEvent` row.
**How analytics reads results**: `recordSnapshot` calls `videos.list` for the counts and, isolated from it, the Analytics retention report; the periodic poll re-runs it. Neither call changed for Shorts.

## Scopes, quota and API facts (checked against Google's docs, 2026-10-11)

- `captions.insert`: scope `youtube.force-ssl` (or `youtubepartner`); quota **400 units**; multipart upload to `/upload/youtube/v3/captions`; snippet needs `videoId`, `language`, `name`. Added `youtube.force-ssl` to the connect request in `youtube-oauth-connect.ts`. **The founder must reconnect each channel once after merge.** `youtube.force-ssl` also allows deleting videos; no code here calls a delete endpoint.
- Quota per long publish: `videos.insert` 1,600 + `captions.insert` 400 + `thumbnails.set` 50 = about 2,050 of the 10,000 daily units (the cover-frame call is existing behaviour).
- **Impressions click-through rate is not available in the YouTube Analytics API v2** (the metrics reference lists no thumbnail-impression metric). `longFormMetrics.impressionsClickThroughRate` is therefore always `null`; the app should read it from YouTube Studio. The other three (average view duration, average percentage viewed, estimated minutes watched) are documented video-report metrics.
- The Analytics API also needs `yt-analytics.readonly`, which the connect request still does **not** ask for (pre-existing; the retention curve has the same dependency). Without it the long-form metrics stay null and the snapshot still records the counts. Decision for the founder: add that scope to the same one-time reconnect.
- Channel allowed to upload videos over 15 minutes: the channel was confirmed `longUploadsStatus: "eligible"` (phone-verified) in Sprint 2 Task 5; no code checks it because the target tops out at 15 minutes.

## Real checks

PR B was not available, so there was no Task 9 two-minute video. On a synthetic 2-minute 1920x1080, 30 fps file (test pattern, -14 LUFS) on this machine with the real ffmpeg:

| Check | Result |
| --- | --- |
| `measureQualityMetrics` with the long profile | 4.8 s; -13.9 LUFS, 1920x1080, 30 fps, h264 High yuv420p; no captions row; hard check `null` (pass) |
| Rows | `audioBitrate` warned (138 kbps, the synthetic sine encodes small) and `longestShot` warned (a test pattern is one "shot", 120 s over 7.5 s); both carry `warn: true` and a message |
| Preview copy | 1280x720, 30 fps, h264 1.50 Mbps, aac 96 kbps; **23.0 MB for 2 minutes**, 28.6 s to make (about 4x real time) |
| Chapter list | `00:00 Cold open` / `0:30 The question` / `1:10 The answer` appended after the description |

Preview size: the test pattern is worst-case motion and sits at the bitrate cap, so 10 minutes would be about 115 MB (cap: 1.6 Mbps x 600 s = 120 MB). The spec target of "about 110 MB or less" is therefore met only if real still-image content encodes under the cap, which it normally does (low motion); **to be re-measured on the real 2-minute video** and, if over, lower the video bitrate in `PREVIEW_SPEC`. Not measured: Gate 2 playback on a phone, the real description on a published video, the real `captions.insert` call (needs the reconnect), the long-form review LLM calls.

## Assumed Task 9 shapes (tell the Task 9 agent / architect)

Everything reads defensively and returns "absent" if a field is missing. Please confirm or adjust these when PR B lands:
1. `video_generation` output carries `chapterTimings: { title, startSec, endSec }[]` (as the task text says).
2. `captions.srt` is on disk as `output.captionsSrtPath`, else `<video>.srt`, else `captions.srt` beside the video. If it is not found a long run fails `video_review` loudly.
3. Optional: `output.audioBeds` (labels or file paths of the beds used). Without it the music credits fall back to every manifest track of the plan's mood (over-credit, never under-credit). The attribution rule reads the manifest `license` text ("no attribution required" means none); a bed whose license says attribution is required gets a `Music: <label>` line.
4. `scriptOutput.lengthOutOfRange` (R2.3) is read if present.
5. The bundle upload in `runVideoGenerationStage` now passes `longForm: config.videoKind === 'long'`; if PR B restructures that call, keep the flag.

## Deviations and open items

- `runs.get.chapters` is `{ title, text?, startSec? }[]`, a superset of Task 9's `{title,text}` and this task's `{title,startSec}`: `startSec` appears once the video is rendered.
- Without R2 (dev) `previewUrl`/`subtitlesUrl`/`videoUrl` are the relative paths `/runs/:id/preview|subtitles|video`, served by the same authenticated Fastify hook as the existing video route; with R2 they are 24-hour presigned links like `runs.getVideoUrl`.
- `dashboard.comparison`: a channel with both kinds and no filter has `avgViewsPerVideo: null` (never one mixed average) and per-kind averages in the new `byVideoKind`; Freeform splits into a Short row and a long row. Single-kind data is unchanged apart from the added `videoKind` field.
- The preview is made in `video_review` (not `video_generation`) so a preview failure retries the cheap stage, not the 15 to 25 minute render. If the run is rejected on review the preview is simply not made.
- Existing published Shorts and runs: no change; `scripts/youtube-oauth.ts` (the old terminal flow) was not touched and does not request `force-ssl`.
- R7 (regenerate only flagged scenes) was not built.
- Schema: one small migration (`longFormMetrics`). `videoKind` is read from `creationOptions`, not duplicated.
