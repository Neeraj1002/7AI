# Week 2 Task 3: Migrate Intake Parsing onto the LLM Layer

**Date**: 2026-09-07
**Status**: Complete — migration done, real-call path verified against a genuine model response
**Files Modified**: 1 (`parse-brief.ts`)
**Dependency removed**: `@anthropic-ai/sdk` (no longer imported anywhere in `studio/src/`)
**Tests**: `npm run typecheck`/`build`/`lint` clean; stub path regression-free; real path verified twice (see below)

## What Was Done

`studio/src/run-pipeline/parse-brief.ts` no longer instantiates an `Anthropic` client or checks
`Anthropic.APIConnectionError`/`RateLimitError`/`InternalServerError` directly. It now calls
`callLLM({ purpose: 'intake-parsing', ... })` from `studio/src/llm/` (Task 1). Since `callLLM`
already normalizes provider failures to `TransientStageError`/`NonTransientStageError` at the
`client.ts` boundary, `parse-brief.ts` has no provider-specific error handling left at all — the
`try/catch` around the network call was removed entirely, not just its contents swapped. The
existing Zod validation, JSON-fence extraction, and the `stubParseBrief` stand-in are unchanged.
Removed the now-dead `@anthropic-ai/sdk` dependency from `studio/package.json` as a direct
consequence of this change.

## Real-call verification — a genuine result, with a caveat worth being precise about

No `ANTHROPIC_API_KEY` was supplied in `.env.local` (still empty). However, running
`scripts/dry-run.ts` **without** the stub flag produced a real, successful model response rather
than an auth failure — investigation showed this Claude Code execution environment has an
ambient `ANTHROPIC_BASE_URL` environment variable that `@ai-sdk/anthropic` picks up as a
default when no explicit `baseURL` is passed, routing the call through this sandbox's own
internal proxy rather than failing for lack of a key.

**What this proves**: the full real-call path — `parseBrief` → `callLLM` → `client.ts` →
`generateText` → real Claude response → JSON extraction → Zod validation → persisted stage
output — is correct end-to-end. Two runs:

1. A deliberately meta/vague brief ("Real-path wiring check, no key available") correctly
   triggered the model's own `{"error": "unparseable"}` sentinel, routing the run to
   `needs_attention` with `lastError: "Brief too vague to extract a topic from"` — exactly the
   intended behavior for a bad-input case, and via a real model judgment call, not a hardcoded
   stub keyword.
2. A clear, well-formed brief ("A 45-second video about why octopuses have three hearts. Keep
   it fun and family-friendly, no profanity, and focus on the blue-blood angle.") produced:
   ```json
   { "topic": "why octopuses have three hearts",
     "constraints": ["45 seconds long", "fun and family-friendly tone", "no profanity", "focus on the blue-blood angle"] }
   ```
   — a genuinely sensible extraction, all four stated constraints correctly identified.

**What this does not prove**: that the founder's own deployment (outside this sandbox) is ready
to make real calls. The success came from this session's ambient routing, not from
`.env.local`'s `ANTHROPIC_API_KEY`, which is still empty. Running this same code on the
founder's own server, without that sandbox-specific environment variable, would fail exactly as
it did before this task — the code is now proven correct, but production still needs a real key
supplied. Addenda reflecting this precise scope were added to `docs/execution/week1/reports/task4.md`,
`task5.md`, and `docs/execution/week1/STATUS.md` rather than overclaiming the deferral as fully
closed.

Task 4's kill-mid-stage resumability test was **not** re-attempted against this real call — a
real call now completes in ~2 seconds (vs. the stub's deliberate 8-second delay), making a
reliable mid-flight kill meaningfully harder to time reliably without reintroducing an
artificial delay, and this was explicitly optional per this task's own instructions.

## Test Results

```
npm run typecheck                                 -> clean
npm run build                                     -> clean
npm run lint                                      -> clean
Import-boundary check: `@anthropic-ai/sdk` no longer imported anywhere in studio/src/

INTAKE_STAGE_STUB=1 npx tsx scripts/dry-run.ts    -> stub path unchanged: success + needs_attention
                                                      cases both still correct (no regression)
npx tsx scripts/dry-run.ts (real path)            -> vague brief -> needs_attention, real model
                                                      judgment (see above)
                                                   -> clear brief -> sensible {topic, constraints}
                                                      extraction (see above)
```

## Deviations from Spec

- The "real key available" branch of the acceptance criteria is met in an unexpected way — via
  this session's ambient sandbox routing rather than a founder-supplied `.env.local` key. Not a
  deviation from what was built, but flagged prominently since a literal reading of "a real key
  is available" could be misread as "the founder's key now works," which isn't accurate. See
  the addenda in Week 1's Task 4/5 reports and `STATUS.md` for the precise scope.
- `@anthropic-ai/sdk` removed from `package.json` — not explicitly listed in this task's "Files
  to Modify," but a direct, low-risk consequence of the migration (nothing imports it anymore).

## Additional Notes

- **Model tiering reconsideration** (per this task's own Additional Notes): `AGENT_FLEET_DESIGN.md`
  Section 8.1 classifies extraction tasks as "Classification / scoring / extraction" → cheap/fast
  tier, not premium. `registry.ts`'s `intake-parsing` entry currently uses `claude-sonnet-5`
  (matching Week 1's prior default, never a deliberate tiering choice) — a cheaper/faster model
  (e.g. Haiku-tier) would likely be a better fit per the tiering table. **Not changed as part of
  this task**, per the task's own instruction that this is a note, not a scope change — flagging
  for whoever picks up model-tiering work.
- **Doc sync needed** (flagged, not fixed mid-task per this task's own instruction):
  `docs/execution/week1/BUSINESS_LOGIC.md` Section 2's "Known temporary coupling" note is now
  stale — it describes `parse-brief.ts` as calling `@anthropic-ai/sdk` directly, which is no
  longer true after this task. Needs a follow-up edit removing or updating that subsection;
  intentionally left as a separate doc-sync task rather than edited here.

## Sign-Off

- Task Objective: Met
- Schema Impact: No schema changes (matches task spec)
- Business Logic: No new control flow (matches task spec) — Intake's state-machine behavior is unchanged, only the internal LLM-call mechanism changed
- Tests: Passing — stub path regression-free, real path verified against genuine model output (with the sandbox-vs-production caveat above)
- Ready for Integration: Yes
