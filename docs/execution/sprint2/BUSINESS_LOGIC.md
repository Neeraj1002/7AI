# Sprint 2 Business Logic Delta

**Status**: Task 1 introduces no new `PipelineRun`/`PipelineStage` states or transitions — it adds a
new resolved *input* (which voice `generateVideo` uses) to the existing `video_generation` stage,
and documents the general "creation option resolution" rule Sprint 2's later tasks (visual style,
audio layer) will each reuse verbatim.

## Task 1 — Creation-option resolution order (D1/D2)

### What this task implements

The **three-step creation-option resolution rule**, established here for voice and meant to be
followed verbatim by every future creation-option field (Task 2's `visualSource`, Task 3's
`audioLayer`):

1. An explicit per-run override (`PipelineRun.creationOptions.<field>`) always wins, if set.
2. Otherwise, the owning `Channel`'s own default for that field (`Channel.default<Field>`), if set.
3. Otherwise, the relevant module's existing hardcoded fallback (for voice:
   `media/registry.ts`'s `DEFAULT_TTS_VOICE`).

For voice specifically, this is `resolveVoice` (`media/registry.ts`), a pure, DB-free function —
`state-machine.ts`'s `runVideoGenerationStage` calls it once, resolving to a concrete value
(`resolvedVoice`) before `generateVideo` is ever invoked. `generateVideo`/`synthesizeSpeech`
themselves never apply their own default when a caller passes an explicit voice — they only fall
back internally (`DEFAULT_TTS_VOICE`) when a caller passes nothing at all, which is what keeps every
pre-Sprint-2 call site (none of which pass a voice) behaving identically to before this task.

### Where this plugs into the existing state machine

No transition change. `video_generation`'s existing `running → completed` (or `→ needs_attention`
on failure) transitions are unchanged — this only changes one of the *inputs* that stage's success
path uses (which voice key gets sent to OpenAI), the same way B5 (Week 5 Task 2) changed *what*
Video Generation renders (captions on/off) without touching the transition table at all.

The resolved voice is also recorded into the `video_generation` `PipelineStage.input` (as
`resolvedVoice`) — not required for correctness (the value is already fully determined once
`generateVideo` is called), but for the same observability reason Week 5 Task 5's `gate2`
`editedOutput` records what was actually approved: a human or a future task reading a stage's row
directly should be able to see which voice was actually used without re-deriving it from
`creationOptions`/`Channel.defaultVoice` by hand.

### Preconditions
A `PipelineRun` row exists, with `creationOptions` either set (from a real API submission,
`api/routers/runs.ts`'s `voice` field) or `null` (every run created before this task, and every run
created without an explicit voice choice afterward). The run's `Channel` row exists and has either a
real `defaultVoice` or `null`.

### Postconditions
`generateVideo` always receives a concrete, resolved `voice: string` — never `undefined`, never an
unresolved override, regardless of which of the three resolution steps actually applied. This is
what makes the postcondition testable as a single invariant (`resolveVoice(...)` always returns a
string) rather than three separate cases each caller has to remember to check.

### Failure Modes & Handling
An override naming an unknown voice key fails at API-input validation (`api/routers/runs.ts`'s
`z.enum(TTS_VOICE_KEYS)` on the `voice` field) — rejected at the edge with a structured Zod/tRPC
input error, before a `PipelineRun` row (let alone a `creationOptions` value) is ever created. This
is the same "reject bad structured input at the edge, not deep in the pipeline" posture the rest of
the API layer already uses (e.g. `z.string().uuid()` on `channelId`). A `Channel.defaultVoice` value
written outside the app (direct SQL, a future admin tool) that doesn't match a known `TTS_VOICES` key
is not defended against by a DB `CHECK` constraint — same posture as every other free-text-ish
nullable `Channel` column (`postingCadence`); a bad value there would surface as a real OpenAI API
error the existing `mapOpenAiError`/retry-classification path already handles, not a new failure mode
this task needs to invent handling for.

### Reference
Full state machine and control-flow rules live in `week5/BUSINESS_LOGIC.md` and earlier weeks' — this
task adds no new states, only a new resolved input to an existing one.

## Task 2 — A second visual-source backend (E1-E4)

### What this task implements
One plan field, `ProductionPlan.visualSource`, drives three agents' behavior: Video Generation
(which asset pipeline actually runs — `searchStockFootage` vs. `ai-visuals`' `generateStills` +
Ken-Burns assembly), Video Intelligence (which review-rubric variant judges the render), and
Publishing (what `containsSyntheticMedia` the real YouTube upload carries). This is deliberately one
field three readers share, not three independently-set flags that could disagree — a run can never
end up in a state where the render used AI stills but the disclosure flag says otherwise, because
both derive from the exact same `plan.visualSource` the video_generation stage actually recorded.

**Resolution order** (mirrors Task 1's three-step pattern, but only two steps — there is no
channel-level default for `visualSource`, since Schema Impact for this task is explicitly "no new
columns"): an explicit `PipelineRun.creationOptions.visualSource` always wins; with no override, the
production-planning LLM decides, steered to default to `'stock-footage'` unless it has a specific,
strong reason not to. The override is enforced twice — once via the prompt (asking the LLM to honor
it), once deterministically after the LLM responds (`plan.ts`'s `planVideoProduction`, which
force-corrects `plan.visualSource` back to the requested value if the LLM ignored the instruction).
The second layer exists because `visualSource` drives a real external compliance flag (E4) — this is
one of the few places in this codebase where a plan field's correctness can't rest on prompt-following
alone, the same reasoning Week 5 Task 2's B1 gave for making atomicity a transaction guarantee rather
than a "the code happens to always do it in order" assumption.

### Preconditions
A `PipelineRun` row with `creationOptions.visualSource` either set (a real per-run choice) or unset
(the planning LLM decides). The channel's `brandAssets`/`defaultVoice` are read the same way
regardless of visual source — this task doesn't change voice resolution at all.

### Postconditions
`generateVideo` always receives a `plan.visualSource` that is exactly one of `'stock-footage'` /
`'ai-stills'` — never an unresolved override, per the enforcement above. Both branches converge on a
single `visualPath` (a ready base-video file) before any of the shared scale/crop/subtitles/
watermark/audio-mux code runs — "the branch stays narrow" isn't just a style preference, it's what
makes E3/E4 possible to implement as a single field read rather than per-branch duplicated logic.

### Failure Modes & Handling
An `ai-visuals` generation failure (provider error, no usable stills, or a plan claiming
`visualSource: 'ai-stills'` with no `stillScenePrompts` to actually generate from) is a real stage
failure routed through the existing `withRetryAndCircuitBreaker` path — never a silent fallback to
stock footage, which would make E4's disclosure flag wrong for a video that actually used AI stills
(or vice versa). This is the same reasoning the task spec itself states directly, not a design
choice made independently.

### A real, live finding from this task's own end-to-end verification, not a hypothetical
The first version of `buildKenBurnsVideo` (video-generation/index.ts) combined `-loop 1 -t <duration>`
on each still's input (which already emits `duration × fps` duplicate frames) with `zoompan`'s own
`d=<duration × fps>` parameter (which expands EACH incoming frame into `d` further output frames) —
a double multiplication, not addition. A 3-second segment silently became tens of thousands of
frames; a real end-to-end test run took over 8 hours before failing, and a corrected first attempt
(pre-scale fix alone) still took 70-90 minutes per attempt and produced a 180MB+ intermediate file
for what should have been a ~50-second video. Fixed by switching to the standard, correct pattern:
each still is encoded as its own independent, correctly-`-t`-bounded segment (no `-t` on the looped
input itself — `zoompan`'s `d=` alone controls frame count from a single repeating source frame),
then all segments are joined via FFmpeg's concat *demuxer* (a fast stream copy, not a re-encode) —
verified afterward at ~17 seconds for 3 stills / ~10.5s of Ken-Burns video, and ~60-70 seconds for a
full real `video_generation` stage (real TTS, real transcription, stub stills) end-to-end.

### Reference
`week4/BUSINESS_LOGIC.md` Section 1 — the video_generation stage's existing transition table, which
this task extends with a second asset-sourcing path but no new transitions. `week2/BUSINESS_LOGIC.md`
Section 3 — the Video Intelligence review rubric this task adds a conditional variant to.
