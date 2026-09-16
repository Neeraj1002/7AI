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

## Task 3 — Royalty-free audio layer + licensing risk check (F1/F2)

### What this task implements
A second, independent `ProductionPlan` field, `audioLayer`, following the exact same two-step
resolution order Task 2 established for `visualSource`: an explicit
`PipelineRun.creationOptions.audioLayer` always wins; with no override, the planning LLM picks
whichever mood tag fits the script, or `'none'` — a fully valid, equally-good choice, never treated
as an incomplete plan. Unlike `visualSource`, no compliance flag depends on this field, so the
deterministic post-LLM enforcement (mirroring `visualSourceOverride`'s) exists for consistency with
the resolution-order guarantee, not because a wrong value has real external consequences.

F2's license gate runs at **track-pick time** (`audio-bed/client.ts`'s `pickTrackByMood`), strictly
before any FFmpeg work starts for that attempt — a missing-license entry is a `NonTransientStageError`
raised immediately, the same "fail fast on a bad input" posture the rest of this pipeline already
uses, not a mid-render failure.

### Preconditions
A `PipelineRun` row with `creationOptions.audioLayer` either set (a real per-run choice, validated
against `AUDIO_LAYERS` at the API edge) or unset (the planning LLM decides). The curated
`audio-bed/manifest.ts` library exists with real, license-tagged entries for every mood tag
`AUDIO_LAYERS` lists (minus `'none'`, which needs no track at all).

### Postconditions
`generateVideo` always receives a `plan.audioLayer` that is exactly one of the real mood tags or
`'none'` — never an unresolved override. When it's a mood tag, the rendered video's audio track is
the real output of FFmpeg's `amix` (voiceover weight 1, bed weight 0.18), not two separate streams
left unmixed and not silently dropped — verified live (see below) via spectral analysis of the real
rendered output, not just by reading the ffmpeg args.

### Failure Modes & Handling
A manifest entry missing `license` refuses at pick time (`NonTransientStageError`, never
auto-retried, escalates to `needs_attention` like any other non-transient input problem) — before
any FFmpeg work starts, not mid-render. This is a **manifest-integrity check**, not a live
Content-ID API call — no such public API exists to call synchronously at generation time; see
`KNOWN_ISSUES_AND_BLOCKERS.md` §6 for the real API check this deliberately doesn't attempt.

### A real, live verification worth recording
The curated library (`data/audio-beds/*.mp3`) is not sourced from any external rights holder — every
track was synthesized locally with FFmpeg's own `sine`/`amix`/`tremolo` signal generators
(`scripts/generate-audio-beds.ts`), so `license: 'CC0'` is a real, accurate claim this project can
make outright, not a placeholder. A real end-to-end render with `audioLayer: 'calm'` was verified via
spectral band-pass analysis of the actual output file (not just inspecting the ffmpeg command): the
bed's own frequency range (~207-237Hz) showed real, non-silent energy (-49.9dB mean) distinctly
quieter than the voiceover's own frequency range (-43.0dB mean) — direct, measured proof the mix is
real and weighted as intended, not equal-volume or absent. A separate real render with
`audioLayer: 'none'` produced a normal, valid video with no crash or regression, confirming F1's
third success criterion.

### Reference
`sprint2/BUSINESS_LOGIC.md`'s own Task 2 section, immediately above — this task reuses the exact
resolution-order pattern and the "one branch point, shared code past it" design Task 2 established.

## Task 4 — Retention-curve capture + hook-first script rubric (G1-G3)

### What this task implements
G2 adds a second, independent Analytics-API call inside the existing `recordSnapshot` function —
called at both of Performance Analytics' existing trigger points (the initial post-publish
snapshot, and every periodic poll tick, per `week4/BUSINESS_LOGIC.md` Section 3) — no new schedule,
no new state transition. G3 adds two new scored fields to Script Review's existing output — no new
transition, no new `purpose`, no new call.

### Preconditions
G2: a `PipelineRun` has a real `youtubeVideoId` (from a completed `publishing` stage) — the same
precondition `recordSnapshot`'s existing views/likes/comments fetch already has. G3: none beyond
Script Review's own existing preconditions (a completed `script_generation` stage).

### Postconditions
G2: `PerformanceSnapshot.retentionCurve` is either a real, non-empty array of
`{ elapsedVideoTimeRatio, audienceWatchRatio }` points, or `null` — **never** a thrown error that
prevents the rest of the snapshot (`views`/`likes`/`comments`) from being recorded. This is a
deliberate design choice, not just a defensive habit: G1's founder action is real and currently
ungranted (confirmed live — see `KNOWN_ISSUES_AND_BLOCKERS.md` §1), so every real snapshot taken
before it closes would otherwise throw and lose the views/likes/comments data that *has* been
working reliably since Week 4, over a capability (retention curves) that's brand new and explicitly
not read by anything yet. G3: `ScriptReviewOutput.hookScore`/`hookNotes` are always present — the
schema has no `.optional()` on either, so a malformed/missing hook assessment fails the same
`ScriptReviewOutputSchema.safeParse` validation the rest of the output already goes through, not a
silent gap.

### Failure Modes & Handling
G2's real Analytics API call, before G1 closes, fails with a real, specific, classified error
(`youtube-analytics-client.ts`'s `classifyAnalyticsError` — confirmed live against this project's
own actual 403 response, not guessed) — caught one level up in `recordSnapshot`'s own
`fetchRetentionCurve` wrapper, logged once, and treated as "this field stays null this time," never
propagated to fail the whole snapshot or retried by `withRetryAndCircuitBreaker` (a scope/enablement
problem won't resolve itself on retry, so retrying it would just be wasted real API calls against an
endpoint that will keep 403ing identically). G3 has no new failure mode — a bad `hookScore`/`hookNotes`
is caught by the same schema-validation `NonTransientStageError` every other Script Review output
field already goes through.

### A real, live finding worth recording
G1's actual blocker, confirmed live against this project's own real OAuth credentials (not assumed
from the task spec alone), is **two separate things**, not one: (1) the YouTube Analytics API is not
yet enabled in this project's Google Cloud console at all (`403 SERVICE_DISABLED`/
`accessNotConfigured` — this is what a real call returns *today*), and only once that's fixed would
(2) the missing `yt-analytics.readonly` OAuth scope actually surface as its own distinct error. See
`KNOWN_ISSUES_AND_BLOCKERS.md` §1 for the full write-up and the exact Cloud Console URL Google's own
error response provided.

### Reference
`week4/BUSINESS_LOGIC.md` Section 3 — Performance Analytics' two existing trigger points, which this
task's G2 call reuses without adding a new one. `week2/BUSINESS_LOGIC.md` Section 3 — Script Review's
existing rubric, which G3 extends with a new scored dimension, same shape as Week 5 Task 4's C3.

## Task 5 — Custom cover frame + title/description A/B testing investigation (H1/H2)

### What this task implements
H1 adds a new, isolated follow-up step inside the existing `publishing` stage
(`run-pipeline/state-machine.ts`'s `runPublishingStage`), running immediately after the existing
`videos.insert` upload succeeds — no new state, no new transition. `coverFrameTimestampRatio` is a
sibling output of the same Metadata Generation LLM call that already produces
title/description/tags, same "extend the existing cheap-tier call" principle Week 5 Task 4's C3 and
Sprint 2 Task 4's G3 both established. H2 investigated and closed a design-doc item without writing
any code against it — see the "real, live finding" note below.

### Preconditions
H1: a successful `uploadVideo` call this same stage invocation (never re-attempted on resume — the
existing resume-safety early-return path completes the stage without re-running the cover-frame step
if a prior attempt already checkpointed a `youtubeVideoId`), and `video_generation`'s stage output
carrying a real `durationSeconds` (present on every stage row since that field was added; a
pre-existing row without it just skips the cover-frame step with a logged warning rather than
crashing the stage).

### Postconditions
The `publishing` stage's output gains a plain `coverFrameSet: boolean` — `true` only when
`thumbnails.set` genuinely succeeded, `false` for every other case (extraction failure, real API
error, or a missing `durationSeconds`). `coverFrameSet` is never allowed to change whether the stage
itself is recorded as completed — the durable checkpoint (`recordStageProgress`) and `completeStage`
call both run regardless, exactly as they did before this task, since the video upload (the thing
that actually matters for the stage's own success) already happened before the cover-frame step even
starts.

### Failure Modes & Handling
A failure anywhere in the cover-frame step (ffmpeg extraction, or the real `thumbnails.set` call —
classified through the same `mapGoogleError` the upload path already uses) is caught in
`runPublishingStage` itself, logged once, and never rethrown — unlike the upload's own failure path,
it is **not** escalated to `needs_attention`, since the video itself already published successfully
and a human doesn't need to intervene in the pipeline over a missing custom thumbnail. This is the
same "isolated, non-blocking, logged" posture Sprint 2 Task 4's G2 established for retention-curve
capture, and it was exercised for real, not just designed: see the finding below.

### A real, live finding worth recording
`sprint2/tasks/task5.md` itself checked, before implementation, that the channel's
`longUploadsStatus: "eligible"` (phone verification for long uploads) meant the channel could also
set custom thumbnails — a reasonable-looking inference that turned out to be wrong. A real end-to-end
run (fresh private test upload, `youtubeVideoId=sOnC-fyjpu8`, never the founder's existing public
video) hit a real `403 forbidden` on the real `thumbnails.set` call: *"The authenticated user doesn't
have permissions to upload and set custom video thumbnails"* (`domain: "youtube.thumbnail"`,
`reason: "forbidden"`). The OAuth token already carries `youtube.upload` — one of the scopes Google's
own docs list as sufficient for this endpoint — so this isn't a scope gap; it's most likely a
separate Studio-side feature-eligibility step. **Critically**, this same real run proved the failure
isolation actually works, not just that it was written to: the stage still completed successfully,
with `coverFrameSet: false` recorded truthfully in the output, and the already-uploaded video was
untouched. See `KNOWN_ISSUES_AND_BLOCKERS.md` §1 (H1) for the full write-up.

H2's own investigation is the other real finding this task produced: `MVP_PART3...md` §2's original
recommendation (Publishing drives YouTube's native title/thumbnail test feature) doesn't hold up
against Google's own current (2026) documentation — the feature explicitly excludes Shorts (this
project's entire content type) and has no API surface at all (Studio-UI-only). Closed with citations
in `KNOWN_ISSUES_AND_BLOCKERS.md` §4 rather than built blind or dropped silently.

### Reference
`week5/BUSINESS_LOGIC.md`'s Publishing section — the existing upload flow this task's cover-frame
step follows without altering. `video-intelligence/index.ts`'s `extractSampleFramesBase64` — the
existing ffmpeg frame-extraction technique `extractCoverFrame` mirrors rather than reinventing.
Sprint 2 Task 4's G2 section above — the isolated-failure design template this task's own isolation
posture is copied from.

## Task 6 — Founder daily digest + post-hoc "why didn't it work" tagging (I1/I2)

### What this task implements
I1 is a new periodic checker (`run-pipeline/founder-digest.ts`), registered in `index.ts` the same
way `gate-reminder.ts` already is — a `setInterval` tick against Postgres, no new state, no new
transition, purely a read-only observer over existing `PipelineRun`/`Channel`/`Tenant` rows. I2 is a
new, narrow branch inside `notify-founder/telegram-channel.ts`'s existing `message:text` handler —
the project's first genuinely *unsolicited* incoming message. Every prior flow
(`requestApproval`) is outbound-initiated: a reply only ever resolves a promise the original caller
is already blocking on. A `tag ...` command has no caller waiting on it at all; it's parsed, acted
on, and replied to entirely within the incoming-message handler itself.

### Preconditions
I1: none beyond a `Tenant` row existing (`MVP_TENANT_ID`, seeded by the foundation migration) and
`FOUNDER_DIGEST_INTERVAL_MS` having actually elapsed since `Tenant.lastFounderDigestSentAt` (or that
column being `null`, i.e. no digest ever sent). I2: the message must start with the literal word
`tag` — anything else is untouched, since it could legitimately be an edited script or ordinary
conversation reaching the existing reply-to-message/single-pending-gate resolution logic unchanged.

### Postconditions
I1: `Tenant.lastFounderDigestSentAt` is updated to the real send time **only after**
`founderChannel.notify` actually succeeds — never speculatively before, so a failed real Telegram
send is naturally retried on the next check tick rather than silently marked "done." I2: a matched,
well-formed `tag <runId> <word> [notes]` command produces exactly one new `ReviewLog` row
(`agent: 'founder-post-hoc'`), and the founder always receives a real reply — either a confirmation,
a "run not found" message, or a malformed-command usage hint — never silence.

### Failure Modes & Handling
I1: Telegram's real `sendMessage` has a genuine 4096-character limit. Rather than risk the real send
itself failing once enough `needs_attention`/`completed`/pending runs have accumulated,
`formatDigestMessage` caps each category at 5 listed runs (`"...and N more"`) plus a defensive
whole-message truncation as a last-resort safety net. I2: `parsePostHocTagCommand` distinguishes
three outcomes — a well-formed command, a message that starts with `tag` but is otherwise malformed
(gets a real usage-hint reply, not silent fallthrough — this project's own real live testing during
this task found an earlier design that let a malformed attempt go unanswered), and a message that
isn't a tag attempt at all (untouched, falls through to the pre-existing gate-reply logic). A
well-formed command referencing a run id that doesn't exist gets a real, honest "no run found" reply
rather than a crash or a silently-dropped write.

### A real, live finding worth recording
An early version of I2's handler used `void recordPostHocTag(...).then(...)` (fire-and-forget)
inside the `message:text` callback. Real, live testing (`dry-run.ts tag`, which calls
`simulateIncomingTelegramMessage` and then exits) found this genuinely lost the write: grammy's
`handleUpdate` only awaits what the handler itself returns, and a synchronous handler returns before
the fire-and-forget promise settles — the process exited before the real `ReviewLog` row was ever
written. **Not just a test-harness artifact**: the same race exists in production every time the
process is mid-shutdown when a tag command arrives. Fixed by making the handler itself `async` and
genuinely `await`-ing the write and the reply — confirmed via a second real run that the `ReviewLog`
row now exists with the exact real values sent. See `sprint2/reports/task6.md`.

### Reference
`run-pipeline/gate-reminder.ts` — the exact periodic-checker shape I1 reuses.
`notify-founder/channel.ts` / `gate1/index.ts`'s `parseGateReply` — the existing
outbound-request/reply-grammar conventions I2's parser and reply-routing follow as closely as the
genuinely different (unsolicited) direction allows.
