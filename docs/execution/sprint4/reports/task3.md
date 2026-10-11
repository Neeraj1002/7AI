# Sprint 4 Task 3: Visual-Side Pipeline Capabilities

**Date**: 2026-10-06
**Status**: Complete. Safety negatives ship **off by default**, with a finding the founder should read before turning them on.
**Files Created**: 3 (`scene-prompts.ts`, its test, this report)
**Files Modified**: 8
**Tests**: All passing (201 / 201; 8 new)
**Branch**: `sprint4_be`

## What Was Done

- **R9 style**: `buildStyledScenePrompts` (`video-generation/scene-prompts.ts`, pure) appends
  `Style: ...` and `Avoid: ...` to every scene prompt before `generateStills`. With nothing set it returns
  the scenes unchanged. `ai-visuals/` is untouched.
- **R10 still count**: `computeDesiredStillCount(targetSeconds, secondsPerStill)` =
  `clamp(ceil(target / secondsPerStill), 3, 20)`, `undefined` when the profile does not set it.
  `planVideoProduction` takes `desiredStillCount` and uses it instead of Task 8's `estimateStillCount`
  (same "EXACTLY N" wording). `ResolvedChannelConfig` gained `visualSecondsPerStill` (Task 1's resolver did
  not expose it, though the doc's snippet assumed it).
- **R11 safety**: env flag `AI_VISUALS_SAFETY_NEGATIVES_ENABLED` (default off). When `'1'`, a fixed clause
  (no logos/trademarks, no text in the image, no photoreal identifiable real person, no gore) is appended
  to each AI-still scene prompt after the profile's own negative, and Video Intelligence's prompt gets a
  matching check **for `ai-stills` only** (stock footage prompt is unchanged).
- **Wiring** (`state-machine.ts`): the video stage now uses the resolved config. Beyond what the doc lists,
  this also makes the profile's `visual.defaultSource`, `audio.defaultVoice` and `audio.defaultMoodTag`
  take effect (run override > profile > legacy > default). A profile-less channel resolves identically to
  before.

## Test Results

```
npx vitest run -> 31 files, 201 tests passed; tsc, lint, build clean
```
New unit tests: prompt builder (unchanged when unset, style/avoid, safety clause after the profile negative),
still-count bounds (40 s / 4 s = 10; 0.1 s clamps to 20, not 400; 15 s / 10 s clamps to 3; undefined when
unset; Task 8's default unchanged), and the review prompt (safety text only for ai-stills with the flag on).

## Real renders (real OpenAI + Pexels + Anthropic; DB-free harness like Task 8; about $0.8 total)

### Mandatory regression run (profile-less, ai-stills, Rocky-style 115-word script)

| | Sprint 2 baseline | Task 8 baseline (Rocky) | **This task** |
|---|---|---|---|
| Stills | 3 | 18 | **17** (planner default, no `secondsPerStill`) |
| Output video | ~10.5 s | 40.2 s | **36.6 s** |
| Ken Burns time | ~17 s | 65.5 s | **59.4 s** |
| Seconds of render per output second | ~1.6 | 1.6 | **1.62** |
| Intermediate size | | 6.6 MB | **6.6 MB** |
| Frames (`ffprobe -count_frames`) | | 1205 (= 40.17 s x 30) | **1098 (= 36.6 s x 30)** |

Linear, exactly 30 x duration frames, single-digit MB: no sign of the Sprint 2 zoompan multiplication.
Whole-attempt wall time 307 s (image rate limit). Video review passed.

### R9 + R10: profile with `stylePrompt` ("muted watercolor illustration, soft paper texture"),
`negativePrompt` ("neon colours"), `targetSeconds: 40`, `secondsPerStill: 4`
- The planner was asked for and returned **exactly 10 stills** (40 / 4). Output 27.5 s, 825 frames
  (= 27.5 x 30), Ken Burns 45-59 s over two runs, 7.4 MB intermediate. Review passed both times.
- Style: I viewed six frames from the run. All six are consistent muted watercolor illustrations with a
  paper texture and a soft palette, on topic (lake, ice, underwater, seal). Style clearly lands.
  (Done on 2 runs of the same channel, not 3; the first run's frames were overwritten by a later scenario
  and I re-ran it once to view them.)
- Bounds checked in unit tests only (not a live planner call with 0.1 s).

### R11: flag on, `ai-stills`, deliberately risky brief (Michael Jordan and Nike)
- The safety clause is present in the prompt, and the planner's scene prompts themselves asked for the
  Nike swoosh and for Jordan. **The image model largely ignored the clause**: 2 of 6 viewed frames show a
  large Nike swoosh and 2 show a photoreal-looking basketball player.
- **Video Intelligence caught it**: verdict `fail`, "Frame 3 prominently displays the Nike Swoosh logo,
  which violates the channel's safety rule" (it sampled 3 frames). So the review gate works, and a real
  run would regenerate with `fixNotes`; the negative clause alone is a weak preventive.
- It did not flag the player's likeness (the sampled frames were stylised; judgement call by the model).

### R11 scoping: flag on, `stock-footage`
- The stock render's review prompt contains no safety text (unit test). The live stock run (lake) failed
  review for a nearly black middle frame, which is a pre-existing stock-path quality issue unrelated to this
  task (the stock path was not touched). I did **not** run a stock-footage brief containing real people, so
  "real people in stock frames are not flagged" is shown by the prompt scoping, not by a live run.

## Deviations from Spec

1. Wiring `defaultSource`, `audio.defaultVoice`, `audio.defaultMoodTag` into the video stage (not in the
   task doc; otherwise those profile fields do nothing). Flagged for review.
2. `visualSecondsPerStill` added to the resolver and its test.
3. Style run twice, not three times; stock real-people regression not run live (see above).
4. Only the video stage's DB path was verified through type-check/unit tests; renders used the Task 8
   style harness (`planVideoProduction` -> `generateVideo` -> `reviewVideo`), not `state-machine.ts`
   against the DB.

## Founder Actions / Recommendations

- **Do not rely on the safety flag to prevent logos or likenesses.** It makes the reviewer enforce them
  (and the regen loop retry), but the planner still writes scene prompts that ask for logos/people, and
  the image model ignores the negative. A real fix would also tell the planner not to request brands or
  real-person likenesses when the flag is on (follow-up, not built; the Task 8 planner already steers away
  from real people). Turning the flag on costs an extra regen attempt (about $0.15-0.25) whenever it trips.
- Leave `AI_VISUALS_SAFETY_NEGATIVES_ENABLED` off until you have decided that trade-off.
- I could not delete the git-ignored render scratch under `studio/data/` (a safety check blocked the
  command): `data/videos/00000000-0000-0000-0000-0000000t3*`, plus temp files in `data/ai-visuals-tmp`,
  `data/stock-footage-tmp`, `data/media-tmp`. Harmless; delete when convenient.

## Sign-Off

- Task Objective: Met (R11 with the caveat above)
- Schema Impact: None
- Business Logic: no new transitions; `BUSINESS_LOGIC.md` updated
- Tests: Passing
- Ready for Integration: Yes
