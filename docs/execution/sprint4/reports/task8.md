# Sprint 4 Task 8: Render Quality Floor — Audio Mastering, Captions, Output Standard, Visual Pacing, Deterministic QC

**Date**: 2026-10-06
**Status**: Complete (code + real-render verification). Not yet run on the preview VPS (see Deviations).
**Branch**: `SPRINT4_TASK8_BE` (draft PR 46). The task header says `SPRINT4_BE`; **superseded for this task only** — Task 8 is urgent and independent, so it ships on its own short-lived branch and merges before `SPRINT4_BE` is created.
**Files Created**: 17 (incl. font + licence)
**Files Modified**: 15
**Tests**: All passing (24 files, 159 tests); `npm run build`, `lint`, `typecheck` clean.

## What Was Done

| R | What | Where |
|---|---|---|
| R3 | 30 fps constant (`fps=30` after scale/crop), `libx264 -preset medium -crf 20 -profile:v high -pix_fmt yuv420p -movflags +faststart`. | `video-generation/index.ts`, `quality-spec.ts` |
| R1 | Always-on audio chain. Bed = sidechain-ducked (voice is the key), `amix normalize=0`, final `loudnorm I=-14:TP=-1.5:LRA=11`, AAC 192k / 48 kHz **stereo**. | `audio-mix.ts` |
| R2 | `.ass` captions, `PlayResX/Y = 1080/1920`, bundled Montserrat ExtraBold (OFL) via `ass=…:fontsdir=…`, centred at 57 % height, `MarginL/R = 90`, 7 px outline + shadow, 110/90/72 px per style, long words shrunk to fit (real font metrics), script text with Whisper timings, fail-fast if the font is missing. **Karaoke highlight: built** (`\kf` fill, yellow over white) for `phrase-grouped` and `sentence-grouped`; `word-flash` stays plain white. | `captions-ass.ts` |
| R6 | Still count `clamp(ceil(words / 2.7 / 2.5), 6, 20)` replaces the fixed "3–6". | `plan.ts` (`estimateStillCount`) |
| R4 | Planner defaults to `ai-stills`; stock only for generic subjects; explicit overrides still win; `containsSyntheticMedia` still follows `visualSource`; real-person scenes steered to scenes/objects/silhouettes. | `plan.ts` |
| R5 | `stockFootageQueries[]` (3–8) with `stockFootageQuery` as fallback; `minDurationSeconds` passed; used clip IDs skipped; each clip trimmed to its beat window, normalised to 1080×1920@30, concatenated; no looping; a stock failure is a real stage failure. | `stock-shotlist.ts`, `stock-footage/client.ts` |
| R7 | `QUALITY_SPEC` shared by renderer and gate. Video Intelligence measures LUFS/true peak, fps/resolution/codec, longest shot, caption presence; stores `qualityMetrics` on the `video_review` output; shows it in the Gate 2 message. Blocks only on: loudness outside −14 ±3 LUFS, wrong resolution, wrong/variable fps, no audio. | `quality-spec.ts`, `quality-metrics.ts`, `gate2/index.ts`, `state-machine.ts` |

**`loudnorm`: two-pass.** An audio-only ffmpeg run measures the mixed track, then `loudnorm` applies the measured values with `linear=true`. If the measurement can't be parsed it falls back to single-pass. I did not A/B single- vs two-pass accuracy, so I can't quantify the difference; the three real renders landed at −14.1 / −14.0 / −13.9 LUFS.

## Measurements (real renders, real OpenAI + Pexels, final code)

Instrument: `scripts/measure-render.ts` (the same code the R7 gate uses: `ffprobe`, `ebur128=peak=true`, `select='gt(scene,0.3)'`). Briefs: Wilma Rudolph (76 words), Stallone/Rocky (115 words, ~40 s), "deepest lake" (80 words, forced stock). Scripts for the first two were recovered by transcribing the published originals and punctuating them.

### Quality spec, row by row

| Spec row | Target | Wilma (ai-stills, phrase-grouped, bed) | Rocky (ai-stills, word-flash, no bed) | Lake (stock, sentence-grouped, bed) |
|---|---|---|---|---|
| Integrated loudness | −14 ±1 LUFS | **−14.1** ✓ | **−14.0** ✓ | **−13.9** ✓ |
| True peak | ≤ −1.0 dBTP | **−1.5** ✓ | **−1.5** ✓ | **−1.5** ✓ |
| Resolution / codec | 1080×1920, H.264 High, yuv420p | ✓ | ✓ | ✓ |
| Frame rate | 30 fps constant | 30 (avg 30.00) ✓ | 30 (avg 30.00) ✓ | 30 declared, avg 29.93 (concat rounding) ✓ |
| `+faststart` | moov before mdat | ✓ | ✓ | ✓ |
| Audio | AAC 48 kHz ≥ 160 kbps | 48 kHz, **192 k** ✓ | 48 kHz, **193 k** ✓ | 48 kHz, **152 k** ✗ (soft) |
| Max time on one visual | ≤ 4.0 s (stills); stock: no clip shown twice | **3.4 s** ✓ | **3.07 s** ✓ (19 shots) | 8 distinct clip IDs, none repeated ✓ (longest 4.6 s) |
| Captions: inside safe area, readable | ≥ 90 px side margin, centre band 45–70 % | ✓ (frames inspected) | ✓ | ✓ |
| Captions: text = script | word-for-word | **76/76 identical** | **115/115 identical** | **80/80 identical** |
| Music bed | ≥ 12 dB under voice while speech present | **18.7–20.5 dB** under ✓ | no bed (`none`) | **17.7–19.8 dB** under ✓ |

How the softer rows were checked, and their limits:
- **Captions / safe area**: verified by (a) the ASS geometry (`\pos` y = 1094 px = 57 % of 1920; `MarginL/R` = 90), (b) a unit test that the longest word of a fixture script fits the 900 px safe width at every style size using the real font's advance widths, and (c) frames sampled every 2–3 s from all three styles and viewed (centred, readable over bright and dark frames, no clipped glyphs). I did **not** build an automated pixel-bounding-box check of rendered captions.
- **Script spelling vs Whisper**: Whisper heard "glass, clear" where the script says "glass-clear"; the captions show the script's "glass-clear". (The "hemocyanin"-style proper-noun case is covered by a unit test; Whisper happened to get "Baikal" and "nerpa" right on this audio.)
- **Bed ducking**: measured on separated stems (voice vs ducked bed) in 10 s speech windows, using the production gain computation. The 12 dB requirement is met with room to spare; the target is ~15 dB under the voice before ducking.
- **Audio bitrate**: ffmpeg's native AAC under-spends the 192k target on simple content (calm bed + speech → 152 k). The audio is complete (packets to the end of the file, no silence gaps). Recorded as a soft warning, not blocking.

### Before / after — Wilma Rudolph

"Before" = the published upload in `7AI-Published/06102026` (read-only).

| | Before (published) | After (new render) |
|---|---|---|
| Integrated loudness | **−26.4 LUFS** | **−14.1 LUFS** |
| True peak | −12.4 dBTP | −1.5 dBTP |
| Longest single shot | 26.7 s (**1 shot**, one stock clip) | 3.4 s (12 shots) |
| Visuals | anonymous stock jogger on a bridge | 11 on-topic AI stills (leg brace, track, Rome, podium) |
| Visual source (planner default) | stock footage | `ai-stills` |
| Captions | oversized/clipped/top-pinned (per the 2026-10-06 review) | centred, 90 px, outlined, karaoke fill |
| Resolution / fps / audio | 720×1280 / 25 fps / 44.1 kHz 128 k* | 1080×1920 / 30 fps / 48 kHz 192 k stereo |

\* **Caveat**: the "published" files are YouTube-Studio downloads, i.e. YouTube transcodes, not our original renders. Loudness, true peak and shot structure are unaffected by that and are a fair comparison; resolution, fps and audio bitrate in the "before" column are the transcode's, not ours. The same measurement on the other two briefs: Stallone −25.8 LUFS / −11.4 dBTP / one 32.3 s shot; Vera Wang −26.5 LUFS / −12.9 dBTP / one 27.7 s shot.

### R4 — planner policy (3 real planning calls + 1 generic)

| Brief | Planner chose | Stills requested |
|---|---|---|
| Wilma Rudolph | `ai-stills` | 12 |
| Stallone / Rocky | `ai-stills` | 14 |
| Vera Wang | `ai-stills` | 12 |
| "deepest lake in the world" (generic) | **`ai-stills`** (spec allowed stock here, not required) | 12 |

Because the generic brief also went to `ai-stills`, the stock verification run used an explicit `stock-footage` override. Worth knowing: the planner leans hard toward `ai-stills`; if you want more stock on generic topics, the prompt needs a gentler default.

### R6 — Ken Burns regression check (mandatory)

Sprint 2 baseline (from `sprint2/BUSINESS_LOGIC.md` Task 2): ~17 s for 3 stills / ~10.5 s of video ≈ **1.6 s of render per output second**.

| Run | Stills | Output video | Ken Burns time | s per output second | Intermediate | Intermediate frames |
|---|---|---|---|---|---|---|
| Sprint 2 baseline | 3 | ~10.5 s | ~17 s | ~1.6 | — | — |
| Wilma | 11 | 27.1 s | 54.9 s | 2.0 | 4.2 MB | — |
| **Rocky (~45 s target)** | **18** | **40.2 s** | **65.5 s** | **1.6** | **6.6 MB** | **1205 (= 40.17 s × 30 fps)** |

Growth is linear, there is no frame multiplication (1205 frames for 40.17 s is exactly 30 × duration), and the intermediate is single-digit MB. No sign of the Sprint 2 zoompan bug. Earlier runs of the same brief gave 74.2 s / 5.9 MB and 73.7 s / 5.8 MB; timings vary ±15 % with machine load. Whole-attempt wall time on this laptop: 184–303 s, dominated by one OpenAI image call per still (and a 5-images/minute rate limit, below).

### R7 — gate verification

Run on copies of the real Wilma render:

| Input | Result |
|---|---|
| normal render | **PASS** (−14.1 LUFS) |
| volume −11 dB (loudness stage effectively absent) | **BLOCK** — "Loudness −25.1 LUFS is outside the −14 ±3 LUFS band" |
| audio stripped | **BLOCK** — "Video has no audio track" |
| rescaled to 720×1280 | **BLOCK** — "Wrong resolution 720x1280 (expected 1080x1920)" |

`qualityMetrics` is stored on the `video_review` stage output (optional, so older rows stay valid) and rendered in the Gate 2 message as a `Quality:` line plus `Quality notes:` for soft misses (unit-tested). I did not drive a full pipeline run through `state-machine.ts`, because that needs the shared dev DB (see below), so the DB write path of `qualityMetrics` is covered by type-checking and unit tests, not an end-to-end run.

### Cost per attempt

Numbers are the `costUsd` that `generateVideo` returns (the value `state-machine.ts` writes to the `video-generation` `UsageEvent`), plus the planning and review LLM calls, from my DB-free harness. Historical "before" is a **read-only** query of the dev DB's existing `UsageEvent` rows.

| | Before (6 historical ai-stills attempts) | After |
|---|---|---|
| Stills per attempt | 5.0 (over ~44.5 s of audio ≈ one still / 9 s) | 11 (27 s), 18 (40 s) |
| `video-generation` cost | **$0.043** | **$0.158** (Wilma), **$0.257** (Rocky) |
| Planning LLM | $0.0025 | $0.0052–0.0061 (bigger output) |
| Video review LLM | $0.0048 | $0.0060 |
| **Per attempt, all-in** | **≈ $0.05** | **≈ $0.17 (27 s) to ≈ $0.27 (40 s)** |
| Stock-footage attempt | $0.020 | $0.0165 + planning/review (unchanged) |

For a similar ~40–45 s script the ai-stills attempt is roughly **5×** more expensive (the spec estimated ~$0.16 vs ~$0.05; that assumed ~12 stills). With up to 3 attempts per run (regen cap), a worst-case run is ≈ $0.8. Check the per-tenant budget ceilings.

## Files Created/Modified

- Created: `studio/src/agents/video-generation/{quality-spec,audio-mix,captions-ass,stock-shotlist}.ts`, `studio/src/agents/video-intelligence/quality-metrics.ts`, `studio/data/fonts/{Montserrat-ExtraBold.ttf,OFL.txt}`, `studio/scripts/measure-render.ts`, tests: `audio-mix.test.ts`, `captions-ass.test.ts`, `plan.test.ts`, `stock-shotlist.test.ts`, `quality-metrics.test.ts`, `stock-footage/client.test.ts`; docs `sprint3/tasks/task13.md`, `sprint4/tasks/task8.md` (synced), this report.
- Modified: `.gitignore` (carve-out so `data/fonts/` is committed, same pattern as `audio-beds/`), `agents/video-generation/{index,plan}.ts` + `index.test.ts`, `agents/video-intelligence/index.ts`, `agents/gate2/index.ts`, `run-pipeline/state-machine.ts`, `ai-visuals/{client,types}.ts` + `client.test.ts`, `stock-footage/{client,stub,types}.ts`, `sprint4/STATUS.md` (archived, see docs/ARCHIVE_INDEX.md) (Task 8 row + Branch column), `sprint4/tasks/task3.md` (wording; see below).

## Schema Changes Applied

None. `ProductionPlanSchema` gained optional `stockFootageQueries`; the `video_review` stage output gained optional `qualityMetrics`; `video_generation` usage `metadata` gained optional `stockFootageQueries/SourceIds/ClipCount` and `aiVisualsSkippedStills`. Old stage outputs without these remain valid.

## Test Results

```
npm run build      → clean
npm run lint       → clean
npm run typecheck  → clean
npx vitest run     → Test Files 24 passed (24), Tests 159 passed (159)
```

New unit tests cover: ASS header/PlayRes/margins/outline/sizes, long-word safe-width fit (real font metrics) for every style, script↔Whisper alignment (substitution, **missing word**, **extra word**, divergence fallback, sentence grouping), still-count clamp (120 words → 18, 60 → 9, 6/20 bounds), shot-list normalisation, stock clip-ID de-duplication, per-beat segment planning (no looping), audio graph strings (ducking, `normalize=0`, loudnorm last, two-pass parameters), bed gain computation, hard-fail vs soft-warning rules, Gate 2 message, time-aware/contiguous still windows, rate-limit wait parsing.

**Not run**: `npx tsx scripts/dry-run.ts` — it writes `PipelineRun`/`UsageEvent` rows to the shared dev DB, which the brief said to avoid (Sprint 3 Task 10's resume-on-startup incident).

## Deviations from Spec

1. **Branch**: `SPRINT4_TASK8_BE`, not `SPRINT4_BE` (as instructed). A separate git worktree was used for the last stretch of work (see 12).
2. **R4 + R6 + the R5 schema half share one commit** (`SPRINT4_TASK8_BE_R6_R4`): all three edit one planner prompt and couldn't be split cleanly. Later fixes are grouped in `…_VERIFY_FIXES` and follow-up `…_R6` commits.
3. **Bed level is computed, not fixed**: the spec's fixed `-18 dB` pre-gain left the bed ~32 dB under the voice (inaudible; the synthetic beds are very quiet and the compressor only removes 4–8 dB). The bed is now levelled to 15 dB under the *measured* voice before ducking, so the balance also holds for the real licensed tracks the founder will add.
4. **Stereo output** (`aformat=stereo`): mono AAC measured 130–167 kbps, below the ≥160 kbps row.
5. **Scope additions found by measuring real renders** (each is small, tested, and in the commits):
   - `ai-visuals/client.ts`: a provider `moderation_blocked` on one scene now **skips that still** instead of failing the attempt (OpenAI rejected 1–2 of 12 prompts in 4 of 5 Wilma runs, the first of which failed the whole attempt, e.g. a child in a hospital setting). It fails only if *every* prompt is blocked. Skips are recorded as `aiVisualsSkippedStills`. The planner prompt now also steers away from minors/medical imagery.
   - `ai-visuals/client.ts`: a **429 is waited out per still** (honouring the provider's retry hint) instead of propagating, because the pipeline-level retry would re-generate and re-bill every earlier still. This org's `gpt-image` limit is **5 images/min**; one Rocky run failed on it.
   - `distributeStillWindows`: boundaries are now **time-aware** (nearest cue end to each equal-time slice) and **contiguous**. Equal cue counts produced 4.1–4.3 s shots, and gaps between windows left the stills video shorter than the audio (36.2 s vs 39.9 s on a word-flash run), so the final mux **looped the video back to its first still** for the last seconds. That predates this task but contradicts the "never loop" intent. A log line records Ken Burns time and intermediate size.
   - Planner prompt: state the subject's gender/age/era in person scenes (the reviewer caught a male athlete in a Wilma Rudolph story).
6. **R2 alignment**: Whisper words with no script counterpart are **dropped** (the narration is TTS of the script, so they carry no script text) rather than shown. Whisper's own words are used only if fewer than half the script words align (the audio and script have diverged).
7. **R7 hard gate uses `r_frame_rate`** (declared constant rate) plus a loose variable-frame-rate guard on the average, not the average alone: concat rounding leaves a 30 fps file at an average of 29.93, uncomfortably close to a 0.1 tolerance.
8. **Stub flags**: the brief said `.env.local` has `MEDIA_STUB`/`STOCK_FOOTAGE_STUB`/`AI_VISUALS_STUB` on. They are not in `.env.local` (all default to off), so no toggling was needed and real calls were already the default. All keys needed were present.
9. **DB-free harness, not a VPS run**: renders were done on the local Windows machine through a harness calling the real `planVideoProduction` → `generateVideo` → `reviewVideo`, without writing `PipelineRun`/`UsageEvent` rows. **The preview VPS was not used**, so VPS render times and the on-VPS fonts path are unverified (the fonts are committed under `studio/data/fonts/`, and a missing font fails the stage fast).
10. **Font download**: Montserrat-ExtraBold.ttf and `OFL.txt` were fetched from the upstream `JulietaUla/Montserrat` GitHub repository (OFL 1.1) as the task requires; about 455 KB.
11. **Task 3 doc**: `sprint4/tasks/task3.md` wording updated as R6 instructs ("unchanged 3–6 default" → Task 8's `estimateStillCount` default; regression baseline → this report's numbers).
12. **Shared checkout moved under me**: mid-session the main checkout was switched to `MEDIASTORAGE_BE` and a merge commit made there by something other than this session. I did not touch that branch; my branch was already on origin, and I continued from a separate worktree (`D:\Study Material\7AI-task8`).

## Known Issues / Follow-ups

- **Stock-footage relevance is weak** and is the reason R4 exists. On the lake run the Pexels queries returned a sea lion, a husky and a muskrat for a "nerpa" narration, and the LLM reviewer failed that render on content (twice). That is a content judgement, not a renderer defect, and the deterministic gate passed. The planner currently prefers `ai-stills` even for generic topics.
- **Stock files are large** (33–43 MB for 28 s; ~10–12 Mbps at crf 20 on busy 4K-origin footage). Fine for upload, heavy for R2 draft storage; a bitrate cap (`-maxrate`) is a follow-up if it matters.
- **Image rate limit (5/min)** means an 18-still attempt takes ≥ ~4 minutes of wall time on this org's tier.
- **The Oscar scene in the Rocky render has baked-in text** ("BEST PICTURE", "PREMIERE TONIGHT") despite the planner being told not to ask for text. Task 3's safety-negatives flag (R11) is the right place to enforce it.
- **Founder action**: replace the synthetic sine-wave music beds with real licensed tracks (`audio-bed/manifest.ts`, `license: 'youtube-audio-library'`). R1's bed levelling adapts to the track's loudness.
- **Gate 2 `Quality:` line** is only seen by a human once a real run reaches Gate 2 on the dev/preview stack.

## Sign-Off

- Task Objective: Met (every Quality-spec row measured; two soft misses recorded: stock audio bitrate 152 k, and Wilma's earlier 4.1–4.3 s shots fixed by the window changes)
- Schema Impact: No schema changes (JSON-shape additions only, all optional)
- Business Logic: Matches `BUSINESS_LOGIC.md` (new deterministic-fail reasons use the existing `video_review` path)
- Tests: Passing
- Ready for Integration: Yes, after the cost/budget decision above
