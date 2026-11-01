# Sprint 4 Task 2: Script-Side Pipeline Capabilities — Raw Brief, Dynamic Length, Style Guide, Style Violations

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** Branch: `SPRINT4_BE`.

**Objective**: Make Script Generation and Script Review actually use a channel's resolved config
instead of a hardcoded "30-60 seconds" and a bare `styleGuide` string — closing the two real gaps a
channel needs fixed to run credibly in a new niche: facts from the brief getting lost, and a script's
own style never being checked against anything.
**Duration**: 6-8 hours
**Depends On**: Sprint 4 Task 1 (`resolveChannelConfig`, `ChannelProfileVersion`) — this task is the
first real consumer of the resolver.
**Owning Component**: `studio/src/agents/script-generation/`, `studio/src/agents/script-review/`,
`studio/src/run-pipeline/state-machine.ts`, `studio/src/agents/gate1/`, `studio/src/api/routers/runs.ts`,
`studio/src/types/pipeline.types.ts`.
**Success Criteria**: (1) A brief with numbered facts survives into the script unchanged, verified with
a real brief containing 3-4 specific numbers/facts. (2) A channel with a resolved `targetSeconds` gets
narration timed to it, not a fixed "30-60s" literal. (3) `reviewScript` flags a real, deliberately
style-violating script (a banned opener) via a new `styleGuideViolations` field. (4) Gate 1's message
shows factual concerns, style violations, and brief sources when any exist — and is **byte-identical**
to today's message when none exist, on a channel with no profile.

## Task Requirement

### R4 — Raw brief text reaches Script Generation and Review

**Where**: `run-pipeline/state-machine.ts`'s script-generation/script-review stage runners already
have `run.briefText` in scope (it's a `PipelineRun` column) but never pass it to `generateScript`/
`reviewScript` — those two functions only ever see `topic`/`constraints` (from `intakeParsed`).

**Fix**: both functions gain an optional `briefText: string` param, and `state-machine.ts` passes
`run.briefText` through on every call (not gated behind having a profile — the raw brief is always
available, profile or not). Prompt rule, resolved from `factPolicy` (Task 1's resolver, default
`'brief-plus-common'`): when `factPolicy === 'brief-only'`, the system prompt states facts/figures in
the brief are authoritative and the model must not introduce claims beyond common,
verifiably-safe knowledge; the default `'brief-plus-common'` keeps today's prompt wording (the model
may draw on general knowledge) but adds the brief text as explicit extra context alongside
`topic`/`constraints`, not a replacement for them.

**Verify**: a real brief with 4 distinct numbered facts (e.g. specific dates/measurements) → all 4
appear, numbers unchanged, in a real `generateScript` call. A regression run on a profile-less channel
with the same brief as before this task produces a script of comparable quality (not byte-identical —
an LLM call isn't deterministic — but the same facts present, same general shape).

### R5 — Optional `sources[]` on run creation

**Where**: `api/routers/runs.ts`'s `create` input; `types/pipeline.types.ts`'s `CreationOptionsSchema`.

**Fix**: extend `CreationOptionsSchema` with `sources: z.array(z.string()).optional()` — the same
"extend one object, don't add parallel columns" pattern Sprint 2 Task 1 established for
`voice`/`visualSource`/`audioLayer`. `runs.create`'s input gains a matching optional `sources` field,
folded into `creationOptions` the same way the other three already are. No migration — `creationOptions`
is already a `Json?` column. Explicit only, for now — inferring sources from free-text brief parsing is
real added scope this task doesn't take on; the existing "Freeform" brief submission stays fully
supported with `sources` simply absent.

**Verify**: a real `runs.create` call with `sources: ["https://example.com/study"]` → confirm via a
direct Postgres read that `creationOptions.sources` persists correctly; a call omitting it behaves
identically to today (`creationOptions` either `undefined` or lacking the field).

### R6 — Length from resolved config, not a hardcoded literal

**Where**: `agents/script-generation/index.ts`'s `SYSTEM_PROMPT` ("YouTube Shorts, 30-60 seconds"),
`agents/script-review/index.ts`'s `SYSTEM_PROMPT` (same literal) and its `videoGenFit.fitsLengthLimit`
check.

**Fix**: both prompts take the resolved `targetSeconds` (Task 1's resolver, platform default 45) and
say "approximately {targetSeconds} seconds when read aloud at a natural pace — must never exceed 60
seconds" in place of the "30-60 seconds" literal. `fitsLengthLimit` becomes a check against the
resolved target (with reasonable tolerance — recommend ±20%) rather than the fixed 60s-only ceiling
mentioned in the prompt today.

**Honest note, not a "no behavior change" claim**: today's prompt gives the model a 30-60s *range* to
pick within; the resolved default (45s, a single point) is a reasonable stand-in but is a soft behavior
nuance, not a byte-identical reproduction. Worth a real side-by-side comparison (a handful of runs on
an existing, profile-less channel, before and after this task) rather than assuming equivalence — note
the result in the task's report either way.

**Verify**: a channel with a profile setting `script.targetSeconds: 30` produces narration that, read
at a natural pace, lands close to 30s — spot-check with a real render's actual audio duration (`ffprobe`,
the same tool this project already uses for other duration checks), not just an estimate from word count.

### R7 — Script prompts include the resolved guide + banned lists

**Where**: `agents/script-generation/index.ts`'s `buildUserMessage`/`generateScript`.

**Fix**: `generateScript`'s `styleGuide` param already exists (resolved by Task 1's `resolveChannelConfig`
as `scriptGuide`, itself falling back to `Channel.styleGuide` — so this is already correctly wired for
legacy channels via the resolver, no separate legacy-fallback code needed here). Add two new optional
params, `bannedOpeners: string[]` and `bannedEndings: string[]` (from the resolver), appended to
`buildUserMessage`'s output only when non-empty: `"Do not open with any of: {list}"` /
`"Do not end with any of: {list}"`.

**Verify**: a profile setting a banned opener phrase → a real `generateScript` call reliably avoids it
across several real generations (LLM instruction-following isn't 100%, so "reliably avoids" means
check a handful of real calls, not one).

### R8 — Review checks against the resolved config; Gate 1 message gains lines

**Where**: `agents/script-review/index.ts`'s `ScriptReviewOutputSchema`/`SYSTEM_PROMPT`;
`agents/gate1/index.ts`'s `formatGateMessage`.

**Fix**: `ScriptReviewOutputSchema` gains `styleGuideViolations: z.array(z.string()).default([])` — same
"empty array if nothing stands out" shape `factualConcerns` (Sprint 2 Task 4) already uses. The prompt
gains a paragraph: given the resolved guide/banned lists, list any specific way the script violates
them (quote or closely paraphrase), empty if none — same "be specific, not vague" instruction
`factualConcerns`'s own prompt text already models.

**A real, existing gap this task also closes**: `formatGateMessage` today shows `reviewScore`/`reviewNotes`
only — `factualConcerns` has existed on `ScriptReviewOutput` since Sprint 2 Task 4 but was **never
surfaced at Gate 1**, so a founder approving a script never actually sees it. This task fixes that in
the same pass as adding `styleGuideViolations`, since both are the same kind of appended line and
touching `formatGateMessage` once for both is more honest than a second task re-opening the same
function.

`formatGateMessage` gains three new optional params — `factualConcerns?: string[]`,
`styleGuideViolations?: string[]`, `sources?: string[]` — each rendered as its own labeled block,
**appended after** the existing `"Reply..."` line stays last, and **omitted entirely** when the array
is empty or undefined:

```
...
Review notes: ${reviewNotes}

Factual concerns:
- ${concern1}
- ${concern2}

Style guide violations:
- ${violation1}

Sources cited in brief:
- ${source1}

Reply "approve", "reject <reason>", or send edited script text.
```

**Verify**: on a channel with no profile and a script with empty `factualConcerns`/no
`styleGuideViolations`/no `sources`, `formatGateMessage`'s output is **byte-identical** to what it
produces today (write this as an explicit unit test comparing against the current, unmodified output —
not just "looks the same"). On a run with all three populated, all three blocks render, in the order
above, each item on its own line.

## Schema Impact
No new tables/columns — `ScriptReviewOutput`'s `styleGuideViolations` and `CreationOptions.sources`
both live in existing `Json` columns (`PipelineStage.output`, `PipelineRun.creationOptions`), same
pattern Sprint 2 Task 2/3 used for `visualSource`/`audioLayer`.

## Business Logic / State Transition
No new transitions — `script_generation`/`script_review`'s existing `running → completed` (or
`needs_attention` on schema-validation failure) is unchanged. This task only changes the *inputs* those
two stages' LLM calls receive and one *output* field's presence (`styleGuideViolations`), the same class
of change Sprint 2 Task 1 (voice) and B5 (captions on/off) already made without touching the transition
table.

### Failure Modes & Handling
No new failure mode. A malformed `styleGuideViolations` (wrong type) fails the existing
`ScriptReviewOutputSchema.safeParse` the same `NonTransientStageError` path every other field already
goes through.

## Implementation

### Files to Modify
- `studio/src/agents/script-generation/index.ts` — R4, R6, R7
- `studio/src/agents/script-review/index.ts` — R4, R6, R8
- `studio/src/agents/gate1/index.ts` — R8
- `studio/src/run-pipeline/state-machine.ts` — thread `resolveChannelConfig`'s output (fetched via
  Task 1's `findActiveProfileForChannel`/`findProfileVersionById` using the run's own snapshotted
  `profileVersionId`, not the channel's possibly-since-changed active one) into both stage runners'
  calls, and into `requestGate1Decision`'s new params
- `studio/src/api/routers/runs.ts` — R5
- `studio/src/types/pipeline.types.ts` — R5 (`CreationOptionsSchema`)

## Testing

```bash
npm run build && npm run lint && npx tsc --noEmit
npx vitest run script-generation script-review gate1
```

### How to Verify
1. The byte-identical `formatGateMessage` regression test (R8) passes.
2. A real end-to-end run on a **profile-less** channel — same brief style as any pre-Sprint-4 run —
   completes through Gate 1 with a message and script quality indistinguishable from before this task
   (the honest R6 comparison above).
3. A real end-to-end run on a channel with a profile (`script.guide`, one banned opener,
   `targetSeconds: 30`, `factPolicy: 'brief-only'`) — confirm the guide/banned-opener/length actually
   shape the real generated script, and any violation the review genuinely finds shows up at Gate 1.

## Report Template
`docs/execution/sprint4/reports/task2.md`. Update `sprint4/STATUS.md` (archived, see docs/ARCHIVE_INDEX.md)'s Task 2 row,
`sprint4/SCHEMA.md` ("No schema changes" — Json-column-only), `sprint4/BUSINESS_LOGIC.md` (the
`factualConcerns`-at-Gate-1 fix, named plainly as closing a pre-existing gap, not a new capability).

## Links & References
- `sprint2/BUSINESS_LOGIC.md` (archived, see docs/ARCHIVE_INDEX.md) Task 4 (G3) — where `factualConcerns` was added but never wired to
  Gate 1's message; this task closes that.
- `sprint4/tasks/task1.md` — `resolveChannelConfig`, the shared resolver this task consumes.
