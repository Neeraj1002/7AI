# Sprint 4 Task 3: Visual-Side Pipeline Capabilities — Style Prompts, Dynamic Still Count, Safety Negatives

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** Branch: `SPRINT4_BE`.

**Objective**: Let a channel's resolved visual style actually reach AI-generated image prompts, and let
still count scale with a channel's own target length — the two real reasons every channel's AI-stills
output looks generic and identically-paced today. Fold in the one platform-wide safety change the
source proposal calls out explicitly (a fixed negative-prompt clause on every AI-generated image).

**A note on risk, read before starting**: this task touches the exact code that produced a real,
previously-shipped bug — `buildKenBurnsVideo`'s zoompan frame-count multiplication (`sprint2/BUSINESS_LOGIC.md`
Task 2's own write-up: a 3-second segment silently became tens of thousands of frames, an 8-hour
failure). This task does **not** touch `buildKenBurnsVideo` itself — only what's fed into it
(`stillScenePrompts`, still count) — but the real regression-run requirement in Testing below is not
optional. Do not skip it because the diff looks small.

**Duration**: 6-8 hours
**Depends On**: Sprint 4 Task 1 (`resolveChannelConfig`).
**Owning Component**: `studio/src/agents/video-generation/index.ts`, `studio/src/agents/video-generation/plan.ts`,
`studio/src/agents/video-intelligence/`, `studio/src/config/env.ts`.
**Success Criteria**: (1) A profile's `visual.stylePrompt` reliably shapes real AI-generated stills
across several real runs on the same channel — visibly, not just "the prompt text changed." (2) A
profile's `visual.secondsPerStill` changes the number of stills requested, computed from the channel's
resolved `targetSeconds`; a channel with no profile still gets Task 8's platform default (still count
estimated from the script's word count, clamped 6–20 — `estimateStillCount` in `plan.ts`), unchanged. (3) With `AI_VISUALS_SAFETY_NEGATIVES_ENABLED=1`, a real AI-stills render with a prompt that
would otherwise include a logo/real-person likeness is measurably steered away from it, and Video
Intelligence's rubric flags one that slips through anyway. (4) A full real regression run — same
channel, same brief shape used in Sprint 2 Task 2's own original verification — produces a video whose
render time and frame count are in the same ballpark as before this task, confirmed with `ffprobe`, not
assumed from a clean diff.

## Task Requirement

### R9 — Visual style reaches AI-stills image prompts

**Where**: `agents/video-generation/index.ts`, the `ai-stills` branch (`params.plan.stillScenePrompts`
passed straight into `generateStills({ scenePrompts })` with no modification — confirmed by reading the
current code, not assumed).

**Fix**: before calling `generateStills`, when the resolved config has a `visualStylePrompt` and/or
`visualNegativePrompt` (Task 1's resolver), append them to **each** scene prompt string rather than
changing `ai-visuals`' own `GenerateStillsParams` shape — the simplest, most additive option, and it
keeps `ai-visuals/` provider-agnostic about style (matches its own header comment: "never the
underlying provider's [types]"):

```typescript
const styledScenePrompts = scenePrompts.map((scene) => {
  const parts = [scene];
  if (resolvedConfig.visualStylePrompt) parts.push(`Style: ${resolvedConfig.visualStylePrompt}`);
  if (resolvedConfig.visualNegativePrompt) parts.push(`Avoid: ${resolvedConfig.visualNegativePrompt}`);
  return parts.join('. ');
});
const stills = await generateStills({ scenePrompts: styledScenePrompts });
```

No change when both are unset (null) — `styledScenePrompts` reduces to the original `scenePrompts`
array unchanged.

**Verify**: 3 real runs on the same channel with a real `visual.stylePrompt` set (e.g. "muted
watercolor illustration style") — the resulting stills are visibly consistent with each other and with
the requested style (a human/founder spot-check, the same kind of judgment call Sprint 2 Task 2's own
report used for its render-comparison checks).

### R10 — Dynamic still count from resolved config

**Where**: `agents/video-generation/plan.ts`'s `planVideoProduction` / `buildSystemPrompt`. **Updated
2026-10-06 (Task 8 lands first)**: the old fixed "3-6 image-generation prompts" literal no longer exists.
Task 8/R6 replaced it with a platform default, `estimateStillCount(scriptText)` =
`clamp(ceil(words / 2.7 / 2.5), 6, 20)`, already passed to the prompt as "exactly N image-generation
prompts".

**Fix**: `planVideoProduction` gains an optional `desiredStillCount?: number` param. When set, it
**overrides** Task 8's estimate (same "exactly {N}" prompt wording, just a different N); when unset
(default), the prompt is unchanged from Task 8's own default. `state-machine.ts`'s caller computes it
**only when the resolved config has `visual.secondsPerStill` set**:

```typescript
const desiredStillCount = resolvedConfig.visual?.secondsPerStillSeconds // from Task 1's resolver
  ? Math.min(20, Math.max(3, Math.ceil(resolvedConfig.targetSeconds / resolvedConfig.visual.secondsPerStillSeconds)))
  : undefined;
```

Bounds (3-20) are the platform floor/ceiling regardless of what the profile requests — a profile
setting an extreme `secondsPerStill` (e.g. 0.5s) cannot force an unreasonable still count. This is
computed from the **resolved target length**, not the real post-TTS audio duration — TTS hasn't run
yet at planning time. This is a deliberate, honest scoping choice, not an oversight: `distributeStillWindows`
(already existing, unchanged by this task) reconciles however many stills there are against the real
caption-cue timing once TTS *has* run, the same way it already does today for Task 8's default count.

**Verify**: a profile with `targetSeconds: 40, secondsPerStill: 4` → a real planning call requests
exactly 10 stills (bounded correctly if you also test an extreme value, e.g. `secondsPerStill: 0.1`,
which should clamp to 20, not literally 400). A channel with no profile (or a profile that never sets
`secondsPerStill`) → `desiredStillCount` stays `undefined`, and the planner still requests Task 8's
`estimateStillCount` default — the must-not-break case for this requirement.

### R11 — Platform safety negative prompt (the one all-channels-eventually change)

**Where**: same `ai-stills` branch as R9; `agents/video-intelligence/index.ts`'s review prompt.

**Fix**: a fixed platform-level negative clause — no logos or trademarks, no on-screen text baked into
the image, no photoreal depiction of an identifiable real person, no gore/graphic content — appended to
every AI-stills scene prompt, **gated behind a new env flag**, same pattern as `AI_VISUALS_STUB`/
`YOUTUBE_STUB`:

```typescript
// config/env.ts
AI_VISUALS_SAFETY_NEGATIVES_ENABLED: z.string().optional().default(''),
```

When `'1'`, appended to `styledScenePrompts` from R9 (after any profile-level `visualNegativePrompt`,
not replacing it). `agents/video-intelligence/index.ts`'s review prompt gains a matching check, **scoped
to `plan.visualSource === 'ai-stills'` only** — real stock-footage frames can legitimately show real
people, so the photoreal-person rule must not apply there (this is the one open question the source
proposal itself flagged, Q6 — answered here by scoping the check to AI-generated stills only).

**Rollout**: this task ships the flag **off by default** (`''`, i.e. unset). Turning it on for real is a
founder decision after a real regression run confirms it doesn't produce false rejections on a real
`ai-stills` channel — note this plainly in the report, don't flip the default yourself.

**Verify**: with the flag on, a scene prompt describing a real, named public figure or a specific brand
logo produces a still that's visibly steered away from a literal likeness/logo (spot-check, same as R9).
A stock-footage-only channel's real people in frame are **not** flagged by Video Intelligence — a
regression check, not just a code read.

## Schema Impact
No schema changes — everything here lives in prompt text and an env var.

## Business Logic / State Transition
No new transitions. `video_generation`'s existing `running → completed`/`needs_attention` path is
unchanged; this task only changes what's fed into the existing `ai-stills` branch and
`video_intelligence`'s existing review call.

### Failure Modes & Handling
No new failure mode for R9/R10 — a `generateStills` provider failure still routes through the existing
`withRetryAndCircuitBreaker` path, unchanged (Sprint 2 Task 2's own "never a silent fallback to stock
footage" rule still applies — style/count changes don't touch that). R11: Video Intelligence flagging a
real safety-negative violation is a normal review failure (routes to a regen attempt with `fixNotes`,
same as any other Video Intelligence rejection), not a new stage-level error type.

## Implementation

### Files to Modify
- `studio/src/agents/video-generation/plan.ts` — R10 (`desiredStillCount` param)
- `studio/src/agents/video-generation/index.ts` — R9, R10 (compute `desiredStillCount`, build
  `styledScenePrompts`)
- `studio/src/agents/video-intelligence/index.ts` — R11 (scoped safety check)
- `studio/src/config/env.ts` — R11 (`AI_VISUALS_SAFETY_NEGATIVES_ENABLED`)
- `studio/src/run-pipeline/state-machine.ts` — passes the resolved config (from Task 1/2's plumbing)
  into `planVideoProduction`'s new param

## Testing

```bash
npm run build && npm run lint && npx tsc --noEmit
npx vitest run video-generation video-intelligence plan
```

### How to Verify — the mandatory regression run
1. Unit tests for `desiredStillCount`'s bounds/undefined-when-unset logic.
2. **Real regression run, required, not optional**: on a profile-less channel, run the exact same brief
   shape Task 8's own regression run used. Confirm via `ffprobe` that render time and output frame
   count/duration are consistent with the numbers recorded in `sprint4/reports/task8.md` (Task 8 is the
   baseline now, since it already changed the default still count from Sprint 2's 3–6; Sprint 2's
   own figures were ~17s for 3 stills / ~10.5s of video, and are kept there for reference). A render that takes
   materially longer, or produces a wildly larger intermediate file, is this task's own version of the
   Sprint 2 bug — stop and investigate before proceeding, don't just note it and move on.
3. Real run with a profile (`stylePrompt` + `secondsPerStill` set) — confirm still count and visible
   style both land as expected (R9/R10's own Verify steps above).
4. Real run with `AI_VISUALS_SAFETY_NEGATIVES_ENABLED=1` on both an `ai-stills` and a `stock-footage`
   channel — confirm R11's scoping (AI images steered/checked, stock footage untouched).

## Report Template
`docs/execution/sprint4/reports/task3.md`. State the regression-run numbers explicitly (render time,
frame count) against Task 8's recorded baseline (`sprint4/reports/task8.md`; Sprint 2 Task 2's own numbers are the older reference) — this is the one task this sprint where "tests
passed" alone is not sufficient evidence, per this task's own risk note above.

## Links & References
- `sprint2/BUSINESS_LOGIC.md` Task 2 — the Ken Burns double-multiplication bug and its fix; the
  baseline this task's regression run is measured against.
- `sprint4/tasks/task1.md` — `resolveChannelConfig`, consumed here.
