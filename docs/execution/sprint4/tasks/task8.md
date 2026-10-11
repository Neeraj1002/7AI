# Sprint 4 Task 8: Render Quality Floor — Audio Mastering, Captions, Output Standard, Visual Pacing, Deterministic QC

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** Branch: `SPRINT4_BE`.

**Status (updated 2026-10-07)**: code merged to `main` as **PR #46**. The founder action (real music beds)
is done: **PR #54**, merged (see "Founder action" below). Still open: the real verification run on the
preview VPS and `docs/execution/sprint4/reports/task8.md`.

**Build order note**: this task is numbered 8 (so the cross-references between existing Sprint 4 tasks stay
valid), but it is **built first** in Sprint 4. See `STATUS.md` → "Build order". It has no dependency on
Task 1's profile model. Everything here is a platform-wide default that later tasks (notably Task 3) build
on and can override per channel.

**Objective**: Every published video today fails basic Shorts quality standards, whatever the channel or
script. This task fixes the renderer itself, so every channel gets a sound baseline before Sprint 4 starts
making things configurable per channel.

**Duration**: ~10–14h (R1 2h, R2 3–4h, R3 0.5h, R4 1h, R5 2–3h, R6 1h, R7 2h)
**Depends On**: nothing in Sprint 4. Strongly recommended but not required: Sprint 3 Task 13 (per-attempt
debug bundles in R2), which makes this task's before/after verification measurable from outside the VPS.
**Owning Component**: Video Generation (`agents/video-generation/index.ts`, `plan.ts`), `audio-bed/`,
`stock-footage/`, Video Intelligence (`agents/video-intelligence/index.ts`).
**Success Criteria**: A real render on the preview VPS, measured with `ffmpeg`/`ffprobe` (never by eye
alone), meets every number in the **Quality spec** below, for both an `ai-stills` and a `stock-footage` run.

---

## Evidence (2026-10-06, external architect review; not re-litigated here)

9 real published Shorts (downloaded from YouTube Studio into `D:\Study Material\7AI-Published\06102026`)
plus the generation code, all read directly:

| Finding | Measured | Root cause in code |
|---|---|---|
| Every video is ~12 dB too quiet | Integrated loudness **−24.6 to −26.6 LUFS** (YouTube normalizes to about −14, and doesn't turn quiet audio up); peaks only −5.7 to −13 dBFS | No loudness stage anywhere in `generateVideo`'s FFmpeg graph |
| Captions oversized, clipped, pinned to the top | ~300 px glyphs, words cut at the frame edges ("ousand", "olynesia"), white text with a thin outline over bright sky | An SRT file with `force_style='Fontsize=48,…,MarginV=200'`. libass interprets SRT styling on a default **288 px-tall canvas**, so 48 → ~320 px and MarginV 200 → ~70% up the frame |
| 5 of 6 stock-footage videos have **zero cuts** in 23–32s; Columbus loops one 16.4s clip 3× | Scene detection: 0 cuts, or cuts only at loop restarts | `searchStockFootage` takes Pexels' **first result** for one query; `-stream_loop -1` loops it under the whole voiceover; `minDurationSeconds` exists in the client but is never passed |
| Stock subject doesn't match the story | A Wilma Rudolph story shows an anonymous jogger; a Stallone story shows an unrelated man in a gym | Stock search can't depict specific real people or events |
| AI-stills videos look good but are slow | One still every ~5–6s (genre norm ~2–3s) | `plan.ts` asks for a fixed 3–6 stills |
| Frame rate varies between 25 and 30 fps | `ffprobe` | Output inherits the stock clip's fps; no `-r` |
| Caption text can drift from the script | — | Captions use Whisper's words, which lack punctuation, so `sentence-grouped` never detects a sentence end and silently falls back to 8-word chunks; names can be misspelled |
| Music bed sounds synthetic | — | `data/audio-beds/*.mp3` were generated from FFmpeg `sine`/`tremolo` (Sprint 2 Task 3). **Resolved 2026-10-07 by PR #54** (real YouTube Audio Library tracks). |
| `pacingNotes` has no effect | — | The planner produces it, but no code reads it |

---

## Quality spec (the measurable bar for this task and for R7's gate)

| Property | Target |
|---|---|
| Integrated loudness | −14 LUFS ±1 |
| True peak | ≤ −1.0 dBTP |
| Output | 1080×1920, **30 fps constant**, H.264 High, yuv420p, `+faststart`, AAC 48 kHz ≥ 160 kbps |
| Max time on one visual | ≤ 4.0 s (ai-stills); stock: no single clip shown more than once |
| Captions | Fully inside the safe area (≥ 90 px from left/right, centre band between ~45% and ~70% of height); readable over any background (outline or box); text matches the script word-for-word |
| Music bed | ≥ 12 dB below voice while speech is present (ducked), never louder than the voice |

---

### R1 — Audio mastering

**Where**: `generateVideo`'s audio chain (`audioFilterChain`, `-map 1:a`, `-c:a aac`).

**Fix**:
1. Always build an audio filter chain (today there's none when `audioLayer === 'none'`).
2. With a bed: replace `amix … weights='1 0.18'` with sidechain ducking. The voice is the sidechain key
   (`asplit` the voice → `sidechaincompress` on the bed, keyed by the voice), then
   `amix=inputs=2:duration=first:normalize=0`. Start with: bed pre-gain −18 dB, `threshold=0.02`,
   `ratio=8`, `attack=20`, `release=300`. Tune by measurement against the spec, not by ear alone.
3. Final stage on every render: `loudnorm=I=-14:TP=-1.5:LRA=11`. Single-pass is acceptable; two-pass
   (measure, then apply `measured_*`) is better if render time allows. Note which one you chose in the
   report.
4. Output `-c:a aac -b:a 192k -ar 48000`.

**Verify**: `ebur128=peak=true` on a real render (with a bed and with `'none'`) → I within −14 ±1 LUFS,
TP ≤ −1.0. A band-pass check (same technique as Sprint 2 Task 3) shows the bed ≥ 12 dB under the voice
during speech.

### R2 — Captions: real ASS styling, safe area, script-accurate text

**Where**: `buildSrt`/`buildCaptionSegments`/`captionFontSize`/the `subtitles=` filter in `generateVideo`.

**Fix**:
1. Generate an **`.ass` file** instead of `.srt`, with `PlayResX: 1080` / `PlayResY: 1920` in
   `[Script Info]`, so every size and margin is in real output pixels. Render with `ass=<file>:fontsdir=<repo fonts dir>`.
2. **Bundle the font in the repo** (an OFL-licensed heavy sans such as Montserrat ExtraBold or Inter
   Black, under `studio/data/fonts/`, with its licence file) and point `fontsdir` at it. Laptop and VPS
   then render identically, instead of falling back to whatever fonts each machine happens to have.
3. Default style: centred (`Alignment=5`) and positioned in the centre band of the quality spec
   (via `MarginV`/`\pos`), `MarginL/MarginR ≥ 90`, primary white, **outline 6–8 px black + soft shadow**,
   bold. Font sizes in real pixels per style: `word-flash` ~110, `phrase-grouped` ~90,
   `sentence-grouped` ~72. Set `WrapStyle` so long words wrap rather than run off the edge, and add a
   unit test that the longest word in a fixture script fits within the safe width at the chosen size.
4. **Script-accurate text**: align the sanctioned script's words (punctuation and casing intact) to
   Whisper's word timestamps with a simple sequence alignment (`difflib`-style on normalized tokens), and
   use **script words with Whisper timings**. Fall back to Whisper's word only where alignment has no
   match. This also fixes `sentence-grouped`, since punctuation now exists.
5. Optional, only if time remains: a per-word highlight within a phrase (ASS `\k` karaoke tags). Note in
   the report whether it was built.
6. Keep `captionsEnabled=false` behaviour exactly as today (no caption file, no filter).

**Verify**: frames sampled every 2s from real renders of all three caption styles. Captions sit inside the
safe area, are fully visible (no clipped glyphs), and are readable over a bright frame. A fixture with a
proper noun (e.g. "hemocyanin") shows the script's spelling, not Whisper's.

### R3 — Output standard

**Where**: `ffmpegArgs` in `generateVideo`.

**Fix**: add `fps=30` to the video chain (after scale/crop), and
`-c:v libx264 -preset medium -crf 20 -profile:v high -pix_fmt yuv420p -movflags +faststart`.

**Verify**: `ffprobe` on a render from a 25 fps stock clip shows `30/1`. Render time is still reasonable;
record it in the report.

### R4 — Visual-source policy: AI stills for real people and events

**Where**: `plan.ts`'s system prompt (Sprint 2 Task 2/E2 made `'stock-footage'` the default, "since
that's the proven path"; the evidence above reverses that).

**Fix**: with no explicit `visualSourceOverride`, the planner chooses **`'ai-stills'` by default**, and
`'stock-footage'` only for generic, non-specific subjects (nature, places, abstract concepts) where any
matching clip genuinely fits. State the rule in the prompt explicitly: *a script centred on a specific
named person, historical event, or story beat that needs a specific scene uses `ai-stills`.* Explicit
overrides still win, unchanged.

Keep Sprint 2's compliance behaviour unchanged: `containsSyntheticMedia` still follows `visualSource`.
If `AI_VISUALS_SAFETY_NEGATIVES_ENABLED` (Sprint 4 Task 3/R11) exists by then, the planner's real-person
scene prompts should favour scenes, objects and silhouettes over close facial likeness. Until then, add
that guidance to the scene-prompt instructions directly.

**Verify**: 3 real planning calls on the published-video briefs (Stallone, Wilma Rudolph, Vera Wang) →
`ai-stills`. 1 generic brief (e.g. "the deepest lake in the world") may still pick stock footage.

### R5 — Stock-footage path: a shot list instead of one looped clip

**Where**: `ProductionPlanSchema` (`stockFootageQuery: string`), `generateVideo`'s stock branch,
`stock-footage/client.ts` (`data.videos[0]`).

**Fix**:
1. The schema gains `stockFootageQueries: string[]` (3–8, one per story beat). Keep the old single
   `stockFootageQuery` as a fallback for the regen path and old stage outputs.
2. Fetch one clip per query, passing `minDurationSeconds` (each beat's share of the voiceover), and
   **skip clip IDs already used** in this attempt (move past `videos[0]` when it's a duplicate).
3. Trim each clip to its beat window (windows derived from caption cues, same idea as
   `distributeStillWindows`), normalize each to 1080×1920 at 30 fps, and concatenate. No clip loops.
   If total footage still falls short, extend the **last** clip rather than looping the whole set.
4. Same never-a-silent-fallback rule Sprint 2 established: a stock-search failure is a real stage
   failure, never a silent switch to `ai-stills` (that would make the disclosure flag wrong).

**Verify**: a real stock run of ~30s shows ≥ 3 distinct clips via scene detection and no clip repeated.

### R6 — Default stills pacing (platform default, overridable later by Task 3)

**Where**: `plan.ts` (fixed "3–6 image-generation prompts").

**Fix**: the sanctioned script text is already known at planning time, so estimate narration length
from its word count (~2.7 words/second) and request
`clamp(ceil(estimatedSeconds / 2.5), 6, 20)` stills. This replaces "3–6" as the **platform default**.
Sprint 4 Task 3/R10's per-profile `secondsPerStill` then overrides this default when a profile sets it.
**Update Task 3's doc wording when implementing**: its "unchanged 3–6 default" references become
"Task 8's default".

**Cost note**: ~12 stills × $0.013 (gpt-image-1.5 low, per `ai-visuals/registry.ts`) ≈ $0.16 per
attempt, up from ~$0.05. Accepted. Record the real figure from `UsageEvent` in the report.

**Mandatory regression check (the Sprint 2 Ken Burns bug)**: this raises the still count fed into
`buildKenBurnsVideo`. Do a real ~45s ai-stills render and record its render time and output frame
count with `ffprobe`. Expect roughly linear growth versus Sprint 2's baseline (~17s for 3 stills). A
superlinear jump or a 100 MB+ intermediate file is that bug again: stop and investigate.

**Verify**: a 120-word script requests ~18 stills; a 60-word script ~9; nothing exceeds 4s on screen.

### R7 — Deterministic quality gate (measure, record, block only on hard failures)

**Where**: `agents/video-intelligence/index.ts`'s deterministic pre-checks (today: `volumedetect` mean
volume plus `ffprobe` metadata).

**Fix**:
1. Measure on every review: integrated LUFS and true peak (`ebur128`), fps/resolution/codec (`ffprobe`),
   longest single shot (`select='gt(scene,0.3)'` timings), and caption presence when `captionsEnabled`.
   Store these as a `qualityMetrics` object in the `video_review` stage output, and show it in the
   Gate 2 message so the human approver sees the numbers.
2. **Block** (deterministic fail, no LLM call) only on hard failures that would ship a broken video:
   loudness outside −14 ±3 LUFS, wrong resolution/fps, no audio. Everything else in the spec is recorded
   and shown, not blocking. A deterministic renderer issue won't fix itself on a regen, so blocking on
   soft metrics would just burn the regen budget.
3. Thresholds live in one constant (`QUALITY_SPEC`) that R1–R6 and this gate share.

**Verify**: a render with the loudness stage deliberately disabled is blocked with a clear reason; a
normal render passes and its `qualityMetrics` appears in the stage output and the Gate 2 message.

---

## Founder action (in parallel, not blocking code) — ✅ DONE 2026-10-07 (PR #54, merged)

**Replace the synthetic music beds.** Source 1–2 real tracks per existing mood tag. Recommended source:
YouTube Audio Library tracks marked as not requiring attribution, recorded in `audio-bed/manifest.ts`
with `license: 'youtube-audio-library'` and the track's name. Avoid tracks from sources known to trigger
Content ID claims. The code path (manifest + licence gate) already exists; this is only a content swap,
and R1's ducking makes a real track sit correctly under the voice.

**What was done (PR #54, merged 2026-10-07):**
- One YouTube Audio Library track ("no attribution required") per mood tag: `upbeat`, `calm`, `mysterious`,
  `inspirational`, `tense`, replacing the synthetic files in `studio/data/audio-beds/`.
- All five normalised to −18.0 LUFS integrated (two-pass `loudnorm`), true peaks −1.5 to −7.0 dBTP.
- `audio-bed/manifest.ts`: `license` = `'YouTube Audio Library (no attribution required)'`, `label` = track
  name. (The licence string differs from the `'youtube-audio-library'` suggested above; the licence gate only
  checks that the field is present.)
- Test render with `audioLayer: calm`: −14.1 LUFS output, true peak −1.5 dBTP, no hard failure; music set
  15 dB under the voice before ducking.
- `scripts/generate-audio-beds.ts` now warns that running it would overwrite the real tracks; Sprint 2
  `BUSINESS_LOGIC.md` notes the old CC0 claim covered only the synthetic beds.
- **Founder to confirm on the server:** the five files are present in the server's `DATA_DIR/audio-beds`
  after deploy, and `sevenai` was restarted.

## Schema Impact

No database schema changes. `ProductionPlanSchema` (stored in the `video_generation` stage output JSON)
gains `stockFootageQueries`. The `video_review` stage output gains `qualityMetrics`. Old stage outputs
without either field remain valid.

## Business Logic / State Transition

No new states. R7 adds a deterministic-fail reason to the existing `video_review` deterministic-check
path (same routing as today's deterministic fails).

### Failure Modes & Handling
- A missing font at render time → libass falls back silently, so R2 checks the bundled font file exists
  before rendering and throws `NonTransientStageError` if it's missing (a deploy problem, not a content
  problem).
- `loudnorm` can lengthen render time noticeably in two-pass mode. If it does, use single-pass rather
  than making the stage time out.

## Implementation

### Files to Modify
- `studio/src/agents/video-generation/index.ts`: R1, R2, R3, R5
- `studio/src/agents/video-generation/plan.ts`: R4, R5 (schema), R6
- `studio/src/stock-footage/client.ts` (+ `types.ts`, `stub.ts`): R5 (skip used IDs, `minDurationSeconds`)
- `studio/src/agents/video-intelligence/index.ts`: R7
### Files to Create
- `studio/src/agents/video-generation/captions-ass.ts`: ASS writer + script/Whisper alignment (R2), unit-tested
- `studio/src/agents/video-generation/quality-spec.ts`: `QUALITY_SPEC` constants (R7, shared)
- `studio/data/fonts/<font>.ttf` + licence: R2

## Testing

```bash
npm run build && npm run lint && npm run typecheck
npx vitest run video-generation video-intelligence
npx tsx scripts/dry-run.ts
```

Unit tests: ASS header/PlayRes, safe-width fit for long words, script/Whisper alignment (including a
missing word and an extra word), still-count clamp, stock clip-ID de-duplication.

**Real verification (required)**: one `ai-stills` and one `stock-footage` real run on the preview VPS
(real TTS, real Pexels, real images), measured against every row of the Quality spec, with the numbers
in the report. **Before/after**: re-render one of the 9 published briefs and put the old and new
measurements side by side.

## Report Template

`docs/execution/sprint4/reports/task8.md`. Include: the before/after measurement table, R6's render time
and frame-count numbers against the Sprint 2 baseline, the real per-attempt cost change, the
`loudnorm` single-pass vs two-pass choice, and whether R2's optional karaoke highlight was built.

## Known Issues / Future Improvements

- Language-specific captions/fonts (e.g. Kannada) aren't covered. The bundled-font mechanism from R2 is
  the hook for them later (a per-language font), together with a non-OpenAI TTS for Indic languages.
- Hook-line emphasis (a larger first caption, an animated title card) is format territory, better done
  via Task 6's format library on top of this renderer.
- An R2 lifecycle rule and temp-folder cleanup remain open (see Sprint 3 Task 13).

## Links & References
- `docs/execution/sprint3/tasks/task13.md`: debug bundles (recommended before this task)
- `docs/execution/sprint2/BUSINESS_LOGIC.md` Task 2: Ken Burns double-multiplication bug (R6's regression check)
- `docs/execution/sprint2/tasks/task3.md`: audio-bed manifest and licence gate (R1, founder action)
- `docs/execution/sprint4/tasks/task3.md`: per-profile style/still count, built on top of this task
