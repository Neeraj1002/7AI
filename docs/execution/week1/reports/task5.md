# Week 1 Task 5: Intake Parsing

**Date**: 2026-09-07
**Status**: Plumbing complete and verified via stub; real-LLM verification **pending — blocked
on the LLM abstraction layer** (see Deviations — this is a deliberate deferral, not a gap)
**Files Created**: `parse-brief.ts` (real implementation + stub)

## What Was Done

- `src/run-pipeline/parse-brief.ts`: `parseBrief(briefText)` — a single Anthropic Messages API
  call (model `claude-sonnet-5`), prompted for extraction only (topic + constraints, no
  niche-matching, no auto-discovery, per `BUSINESS_LOGIC.md` Section 2's explicit scope limit).
  Output validated against `IntakeParsedSchema` (Zod) before being returned. Error handling
  distinguishes transient failures (`Anthropic.APIConnectionError`, `InternalServerError`,
  `RateLimitError` → `TransientStageError`, retried by the wrapper) from everything else
  (unparseable JSON, a model-reported `{"error": "unparseable"}`, schema validation failure →
  `NonTransientStageError`, fails immediately into `needs_attention`, never retried).
- Wired into `state-machine.ts`'s `runIntakeStage`, which persists both the `pipeline_stages`
  row (`input = {briefText}`, `output = {topic, constraints}`) and `pipeline_runs.intakeParsed`
  together, per `BUSINESS_LOGIC.md` Section 2's output contract.

## Deviations from Spec — real-LLM verification deferred, not skipped

**Both of this task's real-LLM-dependent acceptance criteria — "a real brief produces a
sensible `{ topic, constraints }`" and (per Task 4) the kill-mid-stage resumability test —
were verified against a stub instead of the real Anthropic call, and are flagged here as
pending, not silently passed over.**

Reason: no Anthropic API key was available this session, **and** we're about to redesign the
LLM call layer to be provider-agnostic and configurable per capability. `parse-brief.ts`'s
current direct `@anthropic-ai/sdk` call will likely be replaced by that layer once it exists,
so spending effort verifying against a real key today — on code that's expected to be
rewritten — has limited value. Building a sophisticated stub was equally not worth it for the
same reason: `stubParseBrief` (co-located in `parse-brief.ts`) is deliberately minimal — an
8-second artificial delay (long enough to interrupt mid-flight for Task 4's test) plus a
trivial pass-through extraction, with one keyword (`"unparseable"` in the brief text)
exercising the `needs_attention` failure path.

What the stub run **did** verify (real value, not just a placeholder pass):
- Schema validation (Zod) round-trips correctly for both the success and the
  `needs_attention` failure path.
- The failure path correctly skips retries for a `NonTransientStageError` (confirmed by
  timing: the unparseable-brief run took exactly one 8s stub delay, not three) and lands the
  run in `needs_attention` with `lastError` populated, never `failed`.
- The full state-machine + repository plumbing around the LLM call (persist-before-advance,
  stage attempt numbering, run status transitions) is correct end-to-end.

**Status of both acceptance criteria: pending — blocked on the LLM abstraction layer.** Once
that layer exists (and/or a real API key is available), re-run
`npx tsx scripts/dry-run.ts setup "<a real brief>"` /
`npx tsx scripts/dry-run.ts start <runId>` **without** `INTAKE_STAGE_STUB=1` and confirm the
output reads as a sensible topic/constraints extraction, not just schema-valid JSON.

## Test Results

```
npm run build   -> clean
npm run lint    -> clean
scripts/dry-run.ts (stub mode) -> success path: sensible-shaped stub output persisted correctly
                                -> failure path: needs_attention, lastError set, no retries attempted
```

## Sign-Off

- Task Objective: Plumbing met; real-brief verification pending (see above)
- Business Logic: Matches `BUSINESS_LOGIC.md` Section 2
- Tests: Passing (stub); real-LLM verification blocked on the LLM abstraction layer redesign
- Ready for Integration: Yes, with the above caveat tracked
