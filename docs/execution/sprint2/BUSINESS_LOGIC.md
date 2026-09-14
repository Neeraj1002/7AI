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
