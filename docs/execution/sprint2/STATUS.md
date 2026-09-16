# Sprint 2 Status: Flexible Creation + Content Intelligence

**Sprint status**: Tasks 1-5 done. Task 1 built a real per-channel default voice and a real,
explicit, per-brief `voice` override, replacing "whatever `media/registry.ts` happens to resolve" —
also the foundation (`PipelineRun.creationOptions`, the resolution-order pattern) the rest of the
sprint's flexible-creation work builds on. Task 2 added a real second visual-source path
(AI-generated stills, Ken-Burns animated) alongside stock footage, a matching Video Intelligence
rubric variant, and the real YouTube synthetic-media disclosure flag — plus found and fixed a real,
severe FFmpeg performance bug along the way (see its own report). Task 3 added a real music/sound
bed (a self-synthesized, genuinely `CC0` curated library) mixed under narration at a real, measured
low weight, plus a licensing-metadata gate at track-pick time — closing out Track B's
flexible-creation trio (voice, visual, audio) in full. Task 4 (Track C, independent of Tracks A/B)
built real retention-curve capture — verified via its stub path and a real, correctly-failing live
call — plus a real hook-first scoring dimension on Script Review, verified via a clear, well-reasoned
paired comparison. **G1 (the YouTube Analytics API) is a genuine, still-open founder-action
blocker** — see `KNOWN_ISSUES_AND_BLOCKERS.md` §1; not silently glossed over. Task 5 (Track C) built
a real custom-cover-frame step on Publishing — real, live testing found a **second** genuine
founder-action blocker (H1: custom-thumbnail permission, distinct from long-uploads verification),
with failure isolation itself real-verified (the run that hit the real 403 still published
successfully) — and closed the title/description A/B-testing item with a real, cited reason
(YouTube's "Test and Compare" feature excludes Shorts entirely and has no API surface), rather than
building it blind.
**Last updated**: 2026-09-16 (after Task 5)

| Task | Name | Status | Owner | Notes |
|---|---|---|---|---|
| 1 | Voice Selection & Structured Creation Choices | Done | Claude Code | D1: `media/registry.ts` gained `TTS_VOICES` (the 13 real OpenAI preset voices, sourced from the installed SDK's own types, not guessed), `DEFAULT_TTS_VOICE`, and a pure `resolveVoice` three-step resolution function. `generateVideo` now threads a real voice into `synthesizeSpeech` instead of always taking the hardcoded default. D2: real Prisma migration (`Channel.defaultVoice`, `PipelineRun.creationOptions`); `api/routers/runs.ts`'s brief-submission input gains a real, validated `voice` field, stored separately from `intakeParsed` (never inferred by `parse-brief.ts`'s LLM call). Verified live: three real, full `video_generation` runs (real TTS, real stock footage), each confirmed against the actual OpenAI request payload — explicit override wins (`nova`), channel default when unset (`shimmer`), and the regression-critical case of neither (`alloy`, unchanged from before this task). See `reports/task1.md`. |
| 2 | A Second Visual-Source Backend — AI-Generated Stills + Synthetic-Content Disclosure | Done | Claude Code | E1: new `ai-visuals/` module (mirrors `stock-footage/`'s client/stub/registry/index split), real provider decision `gpt-image-1.5` (not the soon-deprecated `gpt-image-1`, checked live). E2: `ProductionPlanSchema` gained `visualSource`/`stillScenePrompts`; `generateVideo` branches into stock-footage vs. a real Ken-Burns (zoompan) assembly from generated stills, converging on a shared `visualPath` before all downstream assembly. E3: Video Intelligence's review prompt gained an ai-stills-aware carve-out — verified live via the reviewer's own language ("stylized lighthouse illustrations"), proving it isn't penalizing AI-generated style, only genuine content-relevance (a legitimate bar, applied identically either way). E4: real `containsSyntheticMedia` on the YouTube upload request, derived from `plan.visualSource`, verified two ways — a mocked-client test asserting the real multipart request body, and a live stub-upload run confirming `false` for stock-footage end-to-end. **Real, live finding, fixed within this task**: an early `buildKenBurnsVideo` combined a looped-input `-t` duration with `zoompan`'s own `d=` parameter, double-multiplying frame count — an 8+ hour real failure before being diagnosed and fixed (switched to independently-encoded per-segment files joined via the concat demuxer; verified at ~17s for a 3-still test, ~60-70s for a full real stage). See `reports/task2.md`. |
| 3 | Royalty-Free Audio Layer + Licensing Risk Check | Done | Claude Code | F1: new `audio-bed/` module (`manifest.ts` + `client.ts`, deliberately lighter than `ai-visuals`'s full split — no external API to stub), 5 mood-tagged tracks under `data/audio-beds/`, every one self-synthesized locally with FFmpeg's own signal generators (genuinely `CC0`, not sourced from any external rights holder). `ProductionPlanSchema` gained `audioLayer`; `generateVideo` mixes the picked track under narration via `amix` (bed weight 0.18 vs. voiceover's 1). F2: `pickTrackByMood` refuses a manifest entry missing `license` at pick time, before any FFmpeg work starts — a manifest-integrity check, explicitly not a live Content-ID API call (none exists to call synchronously). **Verified live**: spectral band-pass analysis of a real rendered output confirmed the bed's own frequency band is genuinely present (-49.9dB mean) and distinctly quieter than the voiceover's (-43.0dB mean) — real, measured proof of a real, correctly-weighted mix, not just reading the ffmpeg command. A separate real render with `audioLayer: 'none'` confirmed no regression/penalty. A real `.gitignore` gotcha (two iterations) was needed to actually get the curated tracks checked into the repo — see the report. See `reports/task3.md`. |
| 4 | Retention-Curve Capture + Hook-First Script Rubric | Done — G1 action needed | **Founder (G1)** / Claude Code (G2/G3) | G1: **not granted** — confirmed live that the real blocker is two things: the YouTube Analytics API isn't enabled for this Google Cloud project at all (a real `403 SERVICE_DISABLED` today), and the OAuth token also lacks `yt-analytics.readonly`. See `KNOWN_ISSUES_AND_BLOCKERS.md` §1 for the exact Cloud Console URL and both real actions needed. G2: real migration (`PerformanceSnapshot.retentionCurve`); `recordSnapshot` gains an isolated, non-blocking retention-curve fetch (`YOUTUBE_ANALYTICS_STUB=1` for testing) — verified live both ways: the stub path wrote a real, correctly-shaped 21-point curve; the real path hit the real 403, was classified into a clear "API not enabled" message (not a generic auth error, locked in by a real regression test built from the actual captured error body), and — critically — did NOT break the rest of the snapshot (`views`/`likes`/`comments` still captured correctly). G3: `hookScore`/`hookNotes` added to Script Review's output; verified via a real paired comparison — a genuine cold-open script scored `hookScore: 8` vs. a slow, logo-first-style intro on identical underlying content scoring `hookScore: 2`, with notes explicitly naming the retention patterns from the prompt. See `reports/task4.md`. |
| 5 | Custom Cover Frame + Title/Description A/B Testing (Investigation) | Done — H1 action needed | **Founder (H1)** / Claude Code (H1 code / H2) | H1: `PublishingMetadataSchema` gained `coverFrameTimestampRatio`; `extractCoverFrame` (ffmpeg `-ss X -frames:v 1`, mirroring Video Intelligence's own technique) + real `thumbnails.set` client function, wired into Publishing as an isolated, non-blocking follow-up after upload. **Real, live finding**: every real attempt gets a real `403 forbidden` ("doesn't have permissions to upload and set custom video thumbnails") — the channel's `longUploadsStatus: "eligible"` (checked live before building, per the task's own plan) turned out to be a *different* eligibility gate from custom-thumbnail permission, not proof of it. Founder action tracked in `KNOWN_ISSUES_AND_BLOCKERS.md` §1 (H1). Failure isolation itself real-verified: the run that hit this real 403 still completed publishing successfully, with `coverFrameSet: false` recorded truthfully (`youtubeVideoId=sOnC-fyjpu8`, a fresh private test upload, never the founder's existing public video). H2: investigated before building anything — live research against Google's own current (2026) docs found YouTube's "Test and Compare" feature (a) explicitly excludes Shorts (this project's entire content type) and (b) has no API surface at all (Studio-UI-only). Closed with a real, cited reason in `KNOWN_ISSUES_AND_BLOCKERS.md` §4 and the design doc, not built blind. See `reports/task5.md`. |

## Full detail
Per-task reports: `reports/task1.md`, `reports/task2.md`, `reports/task3.md`, `reports/task4.md`, `reports/task5.md`.

## Open items closed by Task 1
- `MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` Section 2's "Voice" item — **closed**. Section 2's
  "Visual style" item is explicitly Task 2's, not this task's — see that doc's own "two different
  requests, not one" framing.

## Open items closed by Task 2
- `MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` Section 2's "Visual style" item — **closed**.
- `MVP_PART3_CONTENT_QUALITY_AND_GROWTH_LOOP.md` §1's synthetic-content disclosure item — **closed**.

## Open items closed by Task 3
- `MVP_PART3_CONTENT_QUALITY_AND_GROWTH_LOOP.md` §1's audio-layer item — **closed**.
- `MVP_PART3_CONTENT_QUALITY_AND_GROWTH_LOOP.md` §1's licensing/Content-ID risk check — **partially
  closed** (the lightweight manifest-integrity half; a real live API check remains open, see below).

## Open items closed by Task 4
- `MVP_PART3_CONTENT_QUALITY_AND_GROWTH_LOOP.md` §2's hook-first script rubric item — **closed**.
- `MVP_PART3_CONTENT_QUALITY_AND_GROWTH_LOOP.md` §2's retention-curve capture item — **code closed**,
  real data **not yet** (G1 still open — see below, and `KNOWN_ISSUES_AND_BLOCKERS.md` §1).

## Open items closed by Task 5
- `MVP_PART3_CONTENT_QUALITY_AND_GROWTH_LOOP.md` §2's custom-cover-frame item — **code closed**,
  real thumbnail-set **not yet** (H1 founder action still open — see below, and
  `KNOWN_ISSUES_AND_BLOCKERS.md` §1).
- `MVP_PART3_CONTENT_QUALITY_AND_GROWTH_LOOP.md` §2's title/description A/B-testing item —
  **closed, not viable as scoped** — real, cited reason in `KNOWN_ISSUES_AND_BLOCKERS.md` §4.

## Open items carried forward
- **`Channel.defaultVoice` has no in-app settings UI** — set via a founder-operator script
  (`scripts/set-channel-default-voice.ts`), same posture as every other channel-level MVP setting
  (`budgetOverrideUsd`, `postingCadence`, etc.). Real settings UI is Part 2 territory, not this
  sprint's scope.
- **No DB-level `CHECK` constraint validates `Channel.defaultVoice` against `TTS_VOICES`'s known
  keys** — enforced at the API edge and at the one script that writes it, not by Postgres itself.
  Same posture as every other free-text-ish nullable `Channel` column already in this schema.
- **Full generative AI video** — deliberately not attempted; `ai-stills` (animated stills) was this
  task's real scope per the design doc's own "smaller lift" recommendation. See
  `KNOWN_ISSUES_AND_BLOCKERS.md` §6.
- **A real, unrelated `extractJsonText` parsing gap, found during Task 2's regression testing** —
  a real Video Intelligence multimodal review call returned its JSON wrapped in a markdown code
  fence despite the prompt's explicit "no markdown code fences" instruction, and `extractJsonText`
  didn't strip it, causing a `NonTransientStageError` and escalating a real, otherwise-fine run to
  `needs_attention`. Not a Task 2 regression (this is Script Review/Video Intelligence's own JSON
  parsing, unrelated to visual-source logic) — not fixed here, logged in
  `KNOWN_ISSUES_AND_BLOCKERS.md` §3 as a real, pre-existing robustness gap.
- **A real, live Content-ID/licensing-risk API check** — Task 3's F2 is deliberately a
  manifest-integrity check only; no public synchronous Content-ID API exists to call at generation
  time. Worth building the moment a non-curated audio/visual source is ever added. See
  `KNOWN_ISSUES_AND_BLOCKERS.md` §6.
- **G1: the YouTube Analytics API — two real, distinct founder actions, both still open** —
  (1) enable the YouTube Analytics API in this project's Google Cloud console (a real, live-confirmed
  `403 SERVICE_DISABLED` today, exact Cloud Console URL in the error body), and (2) re-authorize the
  OAuth app with `yt-analytics.readonly`. Until both close, `retentionCurve`/`watchTimeMinutes`/
  `retentionPct` all stay `null` for every real video. See `KNOWN_ISSUES_AND_BLOCKERS.md` §1.
- **`watchTimeMinutes`/`retentionPct` (the single-number summary fields) still unbuilt** — Task 4
  built the real timestamp-level `retentionCurve`, not these; they'd need their own separate
  Analytics API report (a different metric/dimension pair). See `KNOWN_ISSUES_AND_BLOCKERS.md` §6.
- **H1: custom-thumbnail permission — a real, still-open founder action** — every real
  `thumbnails.set` attempt gets a real `403 forbidden`; most likely fix is a Studio-side
  feature-eligibility step (Settings → Channel → Feature eligibility → Custom thumbnails), distinct
  from the `longUploadsStatus` phone verification already granted. See
  `KNOWN_ISSUES_AND_BLOCKERS.md` §1.
