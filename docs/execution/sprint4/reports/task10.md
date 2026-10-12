# Sprint 4 Task 10: Long-Form Video Quality, Preview and Publishing (Backend)

**Date**: 2026-10-11
**Status**: Complete. Merged with `main` after Task 9 PR B (#69); the real check ran on the dev database against Task 9's 2-minute run `d88d50b8-ad08-48c0-8725-d312b20aeba8` (see "Real checks").
**Branch**: `SPRINT4_TASK10_BE` (worktree `D:\Study Material\7AI-SPRINT4_TASK10_BE`), originally cut from `main` at `d732ca4`, now merged with `555f0b1`.
**Tests**: `npm run build`, `npm run lint`, `npm run typecheck` clean; `npx vitest run`: 92 files passed, 649 tests passed (9 files / 49 tests skipped, the DB-backed ones).

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
- The Analytics API needs `yt-analytics.readonly`; the founder said yes (2026-10-13), so the connect request now asks for it next to `youtube.force-ssl`. **Each channel needs one reconnect for both.** The YouTube Analytics API must also be enabled in the Google Cloud project (existing founder item); until then the long-form metrics stay null and the counts still record.
- Channel allowed to upload videos over 15 minutes: the channel was confirmed `longUploadsStatus: "eligible"` (phone-verified) in Sprint 2 Task 5; no code checks it because the target tops out at 15 minutes.

## Real checks (dev database, Task 9 run d88d50b8, 2-minute "chaptered-explainer", Eiffel Tower)

The run was at `paused_gate2`; `runVideoReviewStage` was run on it once (a new `video_review` attempt, back to `paused_gate2`; the server was not started, so no other run resumed).

| Check | Result |
| --- | --- |
| Verdict | pass; 4 frames sent to the model, one inside each chapter (Task 9's old review sent 3 spread frames); review plus preview took 43.7 s |
| Video | 1920x1080, 30 fps (avg 30.0001), h264 High yuv420p, 107.4 s against 106.66 s of narration (0.7%), -14.0 LUFS, true peak -1.2 dBTP, aac 48 kHz 193 kbps |
| Quality rows | all `warn: false` except `longestShot`: `warn: true`, "Longest single shot is 8.4s (spec: <= 7.5s)". No `captions` row. A soft warning only; it does not block |
| Preview copy | 1280x720, 30 fps, 16.3 MB for 107 s (17.07 MB file). At that rate a 10-minute preview is about 91 MB, under the 110 MB target, so the preview bitrate was **not** lowered |
| `runs.get` | `videoKind: long`, `targetSeconds: 120`, signed R2 `previewUrl`, `videoUrl`, `subtitlesUrl`; `chapters` with `startSec` 0 / 30.298 / 60.092 / 79.494 (and script `text`); `qualityMetrics.rows`. `subtitlesUploaded` and `subtitlesMessage` absent (not published) |
| Description (real metadata call plus the real assembly code) | a generated 3-sentence summary, then a blank line and `00:00 Why Build It` / `0:30 How It Went Up` / `1:00 Why It Was Almost Lost` / `1:19 Why It Stayed`; chapter list included; no `#shorts`; no music line (the inspirational bed's license says no attribution required) |

Found by the real run: a 2-minute video measured 107.4 s, which the first-build 120 s minimum would have hard-blocked. The minimum is now 96 s (see Deviations).
Not done: the actual `videos.insert` and `captions.insert` to YouTube (this is a private test video and the channel has not been reconnected for `youtube.force-ssl`), and playback on a phone.

## Task 9 shapes: assumed versus confirmed in code

| Assumed | In Task 9's code | Action |
| --- | --- | --- |
| `video_generation.output.chapterTimings: {title,startSec,endSec}[]` | **Confirmed** (`agents/video-generation/index.ts`, set by `long-form.ts` from `long-narration.ts`) | none |
| SRT path at `output.captionsSrtPath`, else beside the video | **Different**: the field is `subtitlesPath` (`<attempt>.srt` beside the video), and Task 9 uploads it to R2 as `<attempt>.srt`, recorded as `output.r2SubtitlesKey` | reads `subtitlesPath` first; reuses `r2SubtitlesKey` for `subtitlesUrl` and does not upload the SRT a second time |
| `output.audioBeds` lists the beds used | **Does not exist.** The schema declares `bedCredits?: string[]` but nothing fills it; the render chains every track of the plan's mood (`pickAudioBedTracks`) and the manifest has an `attribution` credit text for tracks that need one | credits use `bedCredits` if present, else every manifest track of the plan's mood whose license requires attribution, written as its `attribution` text (over-credits if the video ended before the last track, never under-credits) |
| `scriptOutput.lengthOutOfRange` | read if present | none |

## Fields the later work (Task 12 PR B) reads

- Chapter warning: `video_review` stage output `chapterWarning` (string, present only when a long video cannot get a chapter list), returned on `runs.get` as `chapterWarning`, and shown as a `Warning:` line in the Gate 2 message. Same text, one function (`buildChapterList`).
- Quality rows: `runs.get.qualityMetrics.rows.<row>` = `{ warn: boolean, message: string | null }` with the same row keys as Shorts (`loudness`, `truePeak`, `videoCodec`, `videoProfile`, `pixelFormat`, `audioSampleRate`, `audioBitrate`, `longestShot`, `shotCount`; `captions` is absent for a long video). Also `qualityMetrics.softWarnings`.
- Other long-form fields on `runs.get`: `previewUrl`, `videoUrl`, `subtitlesUrl`, `subtitlesUploaded`, `subtitlesMessage`, `chapters[].startSec`.

## Deviations and open items

- `runs.get.chapters` is `{ title, text?, startSec? }[]`, a superset of Task 9's `{title,text}` and this task's `{title,startSec}`: `startSec` appears once the video is rendered.
- Without R2 (dev) `previewUrl`/`subtitlesUrl`/`videoUrl` are the relative paths `/runs/:id/preview|subtitles|video`, served by the same authenticated Fastify hook as the existing video route; with R2 they are 24-hour presigned links like `runs.getVideoUrl`.
- `dashboard.comparison`: a channel with both kinds and no filter has `avgViewsPerVideo: null` (never one mixed average) and per-kind averages in the new `byVideoKind`; Freeform splits into a Short row and a long row. Single-kind data is unchanged apart from the added `videoKind` field.
- The preview is made in `video_review` (not `video_generation`) so a preview failure retries the cheap stage, not the 15 to 25 minute render. If the run is rejected on review the preview is simply not made.
- Existing published Shorts and runs: no change; `scripts/youtube-oauth.ts` (the old terminal flow) was not touched and does not request `force-ssl`.
- R7 (regenerate only flagged scenes) was not built.
- **Minimum duration is 96 s and maximum 918 s** (the task said 120 to 900): a 2-minute script is allowed 20% either way and the real run was 107.4 s; 918 is 15 minutes plus the 2% slack.
- Task 9 PR B's long debug bundle kept a sample of 6 stills; this task's `longForm` flag keeps only transcript, plan, ffmpeg args and script (R3.3). The preview and SRT are stored beside the draft instead.
- `yt-analytics.readonly` is now in the connect flow (founder approved). Each channel needs one reconnect for `youtube.force-ssl` and `yt-analytics.readonly` together.
- Schema: one small migration (`longFormMetrics`). `videoKind` is read from `creationOptions`, not duplicated.
