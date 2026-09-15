# Sprint 2 Task 2: A Second Visual-Source Backend — AI-Generated Stills + Synthetic-Content Disclosure

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.**

**Objective**: Give Video Generation a real second `visualSource` — AI-generated stills animated
Ken-Burns-style — alongside today's only option (real Pexels stock footage), plus the YouTube
disclosure flag Path B is required to set before it ships.
**Duration**: 8-10 hours — the biggest single Sprint 2 task, a genuinely new content-generation
path, not a parameter.
**Depends On**: Task 1 (`creationOptions` plumbing, the voice-resolution pattern this task mirrors
for `visualSource`).
**Owning Component**: new `ai-visuals/` module, Video Generation (`agents/video-generation/`),
Video Intelligence (`agents/video-intelligence/`), Publishing (`agents/publishing/`), Shared Schema
(none).
**Success Criteria**: (1) A run can request `visualSource: 'ai-stills'` and produce a real Ken-Burns
render from generated stills, without touching the existing stock-footage path's code. (2) Video
Intelligence's review doesn't false-fail an `ai-stills` render for not looking like stock footage.
(3) Every `ai-stills` upload's real YouTube request carries `containsSyntheticMedia: true`; every
`stock-footage` upload's carries `false`.

## Task Requirement

`MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` Section 2: visual style is a genuinely different
content-generation path, not a parameter — stock footage is one option, AI-generated video/stills
another, possibly user-uploaded footage a third. The doc explicitly recommends AI-generated stills
animated Ken-Burns-style as the smaller lift to consider "before jumping straight to generative
video" — this task takes that recommendation. Full generative video is explicitly out of scope here
(see Documentation reconciliation) — a distinct, larger future task, not attempted in this one.

### E1 — the module
New `ai-visuals/` directory mirroring `llm/`/`media/`/`stock-footage/`'s
`registry.ts`/`client.ts`/`types.ts`/`stub.ts` split — the established pattern for a provider
boundary in this repo, not a new one:

- `client.ts` — calls an image-generation API for still frames matching the plan's scene
  descriptions (the real provider is an open decision for whoever picks this up — recommend reusing
  whatever's already an org dependency before adding a new vendor; flag it in the report the same
  way Week 5 Task 4's C3 flagged tool-use as new integration scope, rather than silently picking
  one). Generated stills then get FFmpeg's `zoompan` filter applied per still for its on-screen
  duration, synced to the caption-cue timing already computed from the TTS transcript.
- `types.ts` — a `GeneratedStillsResult` shape (image paths, cost, provider/model).
- `stub.ts` — a deterministic stub (a handful of bundled placeholder images), mirroring
  `stock-footage`'s own stub, for `*_STUB=1`-style testing without real spend.
- `registry.ts` — purpose resolution, same shape as `media/registry.ts`.

### E2 — `visualSource` becomes a real production-plan field
`ProductionPlanSchema` (`video-generation/plan.ts`) gains
`visualSource: z.enum(['stock-footage', 'ai-stills'])`. The planning LLM call's system prompt gains
the same explicit steering pattern the caption-style prompt already uses — default to
`'stock-footage'` unless a specific per-run choice says otherwise (mirroring Task 1's resolution
order: explicit `PipelineRun.creationOptions.visualSource` wins; the planning LLM otherwise defaults
to `'stock-footage'` since that's the proven path). `video-generation/index.ts`'s `generateVideo`
branches on `params.plan.visualSource`: the existing `searchStockFootage` call for
`'stock-footage'`, a new `ai-visuals` client call + Ken-Burns filter graph for `'ai-stills'`. Keep
the branch narrow — everything downstream of "a clip/stills are ready" (audio mux, caption burn-in,
watermark overlay) stays shared, not duplicated per branch.

### E3 — Video Intelligence needs a per-style rubric variant
**Where**: `agents/video-intelligence/index.ts`'s review rubric was written and tuned entirely
against real photographic stock footage. **Fix**: thread `plan.visualSource` into the review call;
its system prompt gets a conditional block for `'ai-stills'` explicitly telling the reviewer not to
penalize a stylized/animated frame for not looking like a real photograph — same shape as the
caption-style word-flash carve-out already in that reviewer's prompt.

### E4 — Synthetic/altered content disclosure
(folds in here, not a separate task — `MVP_PART3_CONTENT_QUALITY_AND_GROWTH_LOOP.md` §1)
**Where**: `agents/publishing/youtube-client.ts`'s upload request's `status` part currently sends
only `privacyStatus`. Verified against Google's own `VideoStatus` API reference for this task: the
real field is `status.containsSyntheticMedia` (boolean). **Fix**: `UploadParams` gains a
`containsSyntheticMedia: boolean` field; `uploadVideoViaProvider` sets it on the request.
`runPublishingStage` (or wherever `uploadVideo` is called) derives it directly from
`plan.visualSource === 'ai-stills'` — Path A (real stock footage) almost certainly doesn't trigger
the policy, Path B does, per the design doc's own framing. This is a real platform policy
requirement, not optional polish, so it ships in the same task that ships Path B, never after.
**Verify**: a real (or fixture) `'ai-stills'` upload's actual request body carries
`containsSyntheticMedia: true`; a `'stock-footage'` upload's carries `false`.

## Schema Impact
No new tables or columns. `visualSource` is stored inside the existing `PipelineStage.output` Json
(video-generation stage output already includes `plan`) and `PipelineRun.creationOptions` Json
(Task 1's column) — no migration needed for either.

## Business Logic / State Transition

### What this task implements
A second branch in Video Generation's assembly step, selected by `ProductionPlan.visualSource`,
with Video Intelligence and Publishing both reading the same field to adjust their own behavior
downstream — one plan field driving three agents' decisions, not three independently-set flags that
could disagree.

### Failure Modes & Handling
An `ai-visuals` generation failure (provider error, no usable stills returned) is a stage failure
like any other agent call — routes through the existing retry/circuit-breaker path
(`retry-with-backoff.ts`), not a silent fallback to stock footage (a silent visual-source swap would
make the disclosure flag in E4 wrong).

## Testing
```bash
npm run build && npm run lint && npm run typecheck && npm test
```
Plus: run both paths end-to-end for the same script (stub mode is fine for `ai-stills`' first pass,
given no vendor decision is locked yet) and confirm the review rubric doesn't false-fail the
`ai-stills` render, and the disclosure flag differs correctly between the two paths (E4's verify).

### Documentation reconciliation
- `docs/execution/sprint2/SCHEMA.md`, `BUSINESS_LOGIC.md` (`visualSource` resolution + disclosure
  derivation), `STATUS.md`.
- `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md` §6 ("Not yet built") gains a line for full
  generative AI video as the explicitly-deferred bigger option this task deliberately didn't
  attempt.
- `docs/design_doc/MVP_PART3_CONTENT_QUALITY_AND_GROWTH_LOOP.md`: §1's disclosure item can be marked
  picked-up-by this task.

## Report Template
`execution/sprint2/reports/task2.md`, standard shape. Include the real provider decision made for
`ai-visuals/client.ts` and the reasoning, even if it was a pragmatic "reused X because it's already
a dependency" call.
