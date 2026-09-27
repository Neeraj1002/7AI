# Sprint 3 Backend Task 9: UI Enhancement 2 — Backend Requirements (Channel Settings, Watermark Upload, Gate Toggles, Brief Length)

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.**

Condensed copy of the task as issued (2026-09-27/28). Branch: `UIENHANCEMENT2_BE` (own branch). Depends on
Task 8 merged (confirmed). R2 depends on `BUGS_TASK6` merging first — deferred until then; R1/R3/R4/R5 proceed
independently. Commits: `UIENHANCEMENT2_TASK9_BE_R<X>: ...`.

## Shared design note
`Channel.brandAssets` (JSON: `{watermarkUrl?, captionsEnabled?}`) is written by both R1 (`captionsEnabled`) and R3
(`watermarkUrl`). Any writer must read-merge-write, never overwrite wholesale — one shared helper, every caller
goes through it.

## R1 — Extend `channels.update`: styleGuide, defaultVoice, captionsEnabled, budgetOverrideUsd
- `updateChannel` patch gains `styleGuide?`, `defaultVoice?`, `budgetOverrideUsd?` (string|null, Decimal-as-string)
  and `captionsEnabled?` (via the shared brandAssets merge).
- Router input: `styleGuide`/`defaultVoice` (enum TTS_VOICE_KEYS) nullable+optional; `captionsEnabled` optional
  boolean; `budgetOverrideUsd` nullable+optional positive number, multipleOf 0.01. `null` clears to fallback;
  omitted leaves unchanged. Same ownership/archived checks as today.
- Verify: round-trip via update+get; a real script_generation stage's recorded input reflects a styleGuide edit;
  setting `captionsEnabled:false` on a channel with a real watermarkUrl must not clear the watermark.

## R2 — Gate toggles (DEFERRED until BUGS_TASK6 merges)
- `gate1Enabled:false`: once script review reaches/retries to score >=7, auto-approve (ReviewLog
  `agent:'system', verdict:'auto-approve'`) straight into video_generation instead of pausing at Gate 1. The
  below-threshold retry loop and the cap-reached-to-Gate-1 fallback are unaffected by the toggle.
- `gate2Enabled:false` requires `defaultPrivacyStatus === 'private'` (BAD_REQUEST otherwise). On a passing video
  review, auto-approve and drive toward `publishing` at the channel's default privacy instead of pausing at Gate 2.
- Inherits, does not fix, pipeline-runner's pre-existing gap: a live run's `currentStage:'publishing'` still needs
  a process restart to actually upload.

## R3 — Watermark upload/remove
- New dependency `@fastify/multipart`. New `watermark-route.ts`, registered like `video-route.ts`, under the
  normal auth hook.
- `POST /channels/:id/watermark` (multipart, one file, png/jpeg only, <=1MB): ownership check, delete any existing
  file, write to `data/watermarks/<channelId>.<ext>`, set `brandAssets.watermarkUrl` (merge helper) to that fs
  path, return `{ watermarkUrl: "/channels/<id>/watermark" }`.
- `GET /channels/:id/watermark`: sendFile pattern like video-route; 404 if unset/missing.
- `DELETE /channels/:id/watermark`: ownership check, clear brandAssets.watermarkUrl (merge helper), delete file.
- No change needed in video-generation/index.ts (already no-ops gracefully).
- Verify: real PNG upload -> GET serves real bytes -> real video_generation run for that channel actually shows
  the overlay (ffprobe/frame check) -> DELETE removes it -> next render has no overlay. Reject oversize/wrong type
  cleanly, no partial write.

## R4 — `targetDurationSec` on `runs.create`
- `CreationOptionsSchema` and `runs.create` input both gain `z.union([z.literal(30),z.literal(45),z.literal(60)]).optional()`.
- `runScriptGenerationStage` threads it into `stageInput`/`generateScript()`; `generateScript` states the target
  length explicitly in the prompt when present, unchanged "30-60s" fallback when absent. No plan.ts change needed.
- Verify: a real run with `targetDurationSec:45` lands in `creationOptions` and the script_generation stage input;
  narration length estimate trends toward 45s vs an unset run. A second, unset run is unaffected.

## R5 (optional) — read-only options query
- New `options.list` query: `{ voices: [{key,label}], visualSources, moodTags }` from the existing
  `TTS_VOICES`/`VISUAL_SOURCES`/`AUDIO_LAYERS` exports. No input, no extra auth.
- Verify: real call returns all 13 voices with labels, 2 visual sources, mood tags including 'none'.

## Report
`docs/execution/sprint3/reports/task9.md`; state R2's design and status (deferred vs done) plainly, and R3's
watermark-render verification honestly (was the overlay actually visible, not just "route didn't error").
