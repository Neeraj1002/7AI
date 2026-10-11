# Sprint 4 Task 10: Long-Form Video Quality, Preview and Publishing (Backend)

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** This file states only this task's specifics.

**Written**: 2026-10-11 by the architect chat. **Status**: not started. **Branch**: `SPRINT4_TASK10_BE`, in its own worktree.

**Objective**: Make a long-form video reviewable and publishable: a review rubric for chapters, a long-form quality profile, a small preview copy for the phone at Gate 2, chapter timestamps and the right metadata on upload, and long-form numbers in analytics.
**Duration**: 1.5 to 2 days.
**Design rule (founder, 2026-10-11): every long-form video is published publicly on a real channel.** Metadata, credits, licences and the synthetic-media flag must be right on every upload.
**Depends On**: Sprint 4 Task 9 merged (it provides `videoKind`, `chapters`, `chapterTimings`, `captions.srt`, the 1920x1080 render). The per-row warning flag change for quality checks (separate small PR) should be merged first or at least agreed, because R2 extends the same data.
**Owning Component**: Script Review, `quality-spec.ts` / `quality-metrics.ts`, Gate 2, YouTube upload, analytics, `runs.get`.
**Success Criteria**: (1) the 2-minute test video from Task 9 gets a long-form review and a quality result with no caption check; (2) `runs.get` returns a preview URL, a subtitle download link and the subtitle upload result for a long run; (3) the upload description starts its chapter list at `00:00` and the subtitles are uploaded (or the run records why not); (4) Shorts reviews, quality checks and uploads are unchanged.

## R0. Read the code first
As in Task 9: before changing anything, check each "What exists" line against the real files and put the result in the report. Also find out and report: how Video Intelligence is fed the video (inline bytes or a cloud storage path, and what that allows for a file of hundreds of MB), its price per minute for the features used, and how the analytics step reads results today.

## R1. Script Review for long-form
**What exists** (verify): the rubric is Shorts-specific (`hookScore`, `fitsLengthLimit` against 60 s). Concerns, violations and sources are shown at Gate 1 (Task 2).
**Change**, only when `videoKind = 'long'`: criteria for chapter flow (each chapter answers the question it opens with), cold open strength, open loops that get closed, closing line, and length against target within +/-20% (also use `lengthOutOfRange` from Task 9). Factual-concern rules stay as they are for both types. The Script Review rules SR-1 to SR-9 are a separate task, not part of this one. Output shape for Shorts is unchanged; long adds `chapterNotes: { chapterTitle, note }[]` (optional).

## R2. Quality profile
**What exists**: `QUALITY_SPEC` and `qualityMetrics` (Task 8) check loudness, resolution, fps, codec, longest shot and caption presence for 1080x1920.
**Change**: a long-form profile chosen by `videoKind`: 1920x1080, 30 fps, duration 120 to 900 s and within 2% of the narration, loudness -14 +/-3 LUFS (unchanged), **no caption-presence check**, longest single shot allowed up to `1.5 x secondsPerStill` (so a 6 s still may be held 9 s), frame sampling for visual review taken at least once inside every chapter (use `chapterTimings`). Blocking rules stay the same kind as Shorts (loudness, wrong resolution, wrong or variable fps, no audio, duration out of range). Each row carries the per-row warning flag.

## R3. Gate 2 preview copy and artifacts
1. After the final video is built, create a **preview copy**: 1280x720, 30 fps, about 1.5 Mbps video and 96k audio (`-preset veryfast`), stored beside the full video. Gate 2 plays the preview; YouTube gets the full file. A 10-minute preview should be about 110 MB or less; report the real size.
2. `runs.get` returns, for a long run: `previewUrl`, `videoUrl` (full, kept as today), `subtitlesUrl` (signed link to `captions.srt`, always present for long-form), `subtitlesUploaded: boolean` and `subtitlesMessage?: string` (set only when the upload failed), `chapters: { title, startSec }[]`. Links are signed and expire as the existing media links do. For a Short, none of these fields are present.
3. Do not put the full long video in the debug bundle (Task 13); keep only the preview, the script, the metrics and the logs.

## R4. Publishing
**What exists** (verify): upload sends title, description, tags, `selfDeclaredMadeForKids: false`, `defaultLanguage` and category fields (Task 5); no chapter list; `#shorts` is added for Shorts.
**Change**, long-form only:
1. Append a chapter list to the description: first line `00:00 <title>`, then each chapter at `chapterTimings.startSec` as `m:ss` (or `h:mm:ss` over an hour). YouTube needs the first stamp at 00:00, at least 3 chapters and each at least 10 seconds; if a run does not satisfy that, publish without the list and add a warning to the Gate 2 message.
2. Do not add `#shorts` to the title, description or tags. 16:9 uploads are not Shorts.
3. `categoryId` from the channel profile or format, default 27 (Education) for long-form if the profile has none.
4. **Subtitles are uploaded by the pipeline** (decision 2026-10-11), after the video upload succeeds, with `captions.insert` and the `captions.srt` from Task 9. This needs the wider `youtube.force-ssl` permission in addition to the upload permission (confirm the exact scopes against Google's docs in R0). Add it to the OAuth request; the founder reconnects the channel once after this task is merged. If the call fails, the publish still succeeds, nothing is retried, and the run records `subtitlesUploaded: false` with a plain `subtitlesMessage` that the app shows on the published screen: a 403 for a missing permission reads "Subtitles were not uploaded. Reconnect this channel, then upload the file by hand."; any other failure reads "YouTube did not accept the subtitles. Upload the file by hand." Keep the technical error in the log and the stage output. The download link `subtitlesUrl` is shown on the published screen for every long-form video, whether or not the upload worked. The caption track uses the channel's `defaultLanguage` and the language name as track name. Report the quota used (each insert costs 400 units of the default 10,000 a day). The wider permission can also delete videos; build no delete feature.
5. Thumbnails stay manual (the 403 is a separate item). Keep the Task 5 sources and editor credit lines, and append a credit line for every music bed whose manifest licence requires attribution.
6. Check, and report, that the connected channel is allowed to upload videos longer than 15 minutes if the target ever goes above 15 (the channel is phone-verified, so not needed now).

## R5. Gate 2 follows the channel setting
No change (decision 2026-10-11): long-form uses the channel's Gate 2 toggle exactly like Shorts. With Gate 2 off, the existing rule still holds (default visibility must be Private, so the video publishes as Private). Nothing in this task forces a stop.

## R6. Analytics and the comparison dashboard
**What exists** (verify): analytics reads Shorts metrics; `dashboard.comparison` (Task 7) groups by channel and content format.
**Change**: store `videoKind` with each published video; add the long-form metrics the YouTube Analytics API provides (average view duration, average percentage viewed, impressions click-through rate, estimated minutes watched) and keep the Shorts metrics for Shorts. `dashboard.comparison` accepts an optional `videoKind` filter and returns it per row; without the filter it behaves as today. Never mix Shorts and long-form averages in one number.

## R7. Optional, only if time remains
Regenerate only the scenes a reviewer flags, using Task 9's still cache. Say in the report whether it was built.

## Schema Impact
Expected: store `videoKind` on the published-video record if it is not already derivable from the run. If so, one small migration after `main`'s newest. Otherwise none. Update `SCHEMA.md` and `BUSINESS_LOGIC.md` with the delta.

## Business Logic / State Transition
No new statuses. Gate 2 follows the channel toggle (R5). The preview copy is created before the run reaches Gate 2; a failure creating it is a stage failure with the normal retry.

## Testing
```bash
npm run build && npm run lint && npm run typecheck && npx vitest run
```
Unit tests: long-form rubric selection, quality profile selection (including no caption check and the 1.5x longest-shot rule), chapter-list formatting and the three YouTube rules, no `#shorts` for long, `runs.get` fields present for long and absent for Shorts, analytics filter by `videoKind`, Shorts paths unchanged. Real check on the dev database with the Task 9 two-minute video: review result, quality result, preview size and playback, description text. Report real numbers.

## Report
`docs/execution/sprint4/reports/task10.md`. Do not edit shared status pages; send the architect a one-line status.

## Links & References
- `sprint4/tasks/task9.md` · `sprint4/tasks/task8.md` · `sprint4/tasks/task5.md` · `sprint4/tasks/task7.md` · `docs/review_tuning/SCRIPT_REVIEW_MISSES.md` · `sprint4/PENDING.md`
