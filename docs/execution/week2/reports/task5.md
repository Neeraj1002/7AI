# Week 2 Task 5: Script Review Agent

**Date**: 2026-09-08
**Status**: Complete — real end-to-end verification performed
**Files Created**: 1 (`agents/script-review/index.ts`)
**Files Modified**: `state-machine.ts`, `llm/{types,registry}.ts`, `scripts/dry-run.ts`
**Tests**: `npm run typecheck`/`build`/`lint` clean; real review verified against real Script Generation output; "always completes" verified with a deliberately weak script

## Cheap tier — confirmed, not left defaulting

Per this task's own Additional Notes: `registry.ts`'s `script-review` purpose is set to **`claude-haiku-4-5`** (cheap/fast tier per `AGENT_FLEET_DESIGN.md` 8.1's classification/scoring row), not left defaulting to Script Generation's premium `claude-sonnet-5`. Confirmed by the real test run below: the `script-review` `UsageEvent` row shows `model: "claude-haiku-4-5"`, costing $0.002 for 656+264 tokens vs. Script Generation's $0.0053 for a smaller 341+457-token call — the cheaper per-token rate is visibly doing its job.

## What Was Done

- `studio/src/llm/types.ts`/`registry.ts`: added the `script-review` purpose, resolving to `claude-haiku-4-5`.
- `studio/src/agents/script-review/index.ts`: `reviewScript({ scriptText, captions, nicheDescription, styleGuide })` — one LLM call scoring quality/engagement/clarity/brand (0-10) plus a structured `videoGenFit` check (`fitsLengthLimit`, `pacingRealistic`, `visualsProducible`, `flags`) per `AGENT_FLEET_DESIGN.md` 4.5's updated responsibilities — checking the script is actually producible by Week 1 Task 8's toolchain (TTS + captions + template/stock visuals), not just well-written. Zod-validated, same JSON-extraction convention as Intake and Script Generation.
- `state-machine.ts`'s `runScriptReviewStage`: reads the latest **completed** `script_generation` stage's output (validated against `ScriptGenerationOutputSchema` at the boundary, not just cast), runs the review under the same per-attempt `UsageEvent`-metering pattern Task 4 established, writes a `ReviewLog` row (`agent = 'script-review'`, `verdict` = score as text, `rationale` = notes + any video-gen-fit flags appended), and mirrors the same output into `pipeline_stages.output`. **No score-threshold branch exists anywhere in this path** — the stage always calls `completeStage` once a well-formed review comes back; only a genuine technical failure (LLM error, schema validation failure) routes to `needs_attention`. On success: `PipelineRun.status → 'paused_gate1'`, `currentStage → 'gate1'`.

## Real-call verification

Ran the full real sequence (`intake → script_generation → script_review`) via `scripts/dry-run.ts` on a fresh brief ("octopuses tasting with their arms"):

- Script Review scored the real Script Generation output **7/10**, with genuinely specific notes ("narration slightly dense for 60 seconds... reads at ~180 words") and two concrete video-gen-fit flags (tight pacing margin, confirm stock footage variety) — not generic filler text.
- `ReviewLog` row confirmed: `verdict: "7"`, `rationale` includes both the quality notes and the video-gen-fit flags appended, exactly as designed.
- `PipelineRun` ended at `status: "paused_gate1"`, `currentStage: "gate1"` — correct per the transition table.

**"Always completes" verification**: called `reviewScript` directly with a deliberately terrible one-line script ("uh yeah so like cats. cats do stuff. the end."). It returned a valid score of **1/10** with accurate criticism and `visualsProducible: false` — proving the agent handles bad input as a normal low-score outcome, not an error, and confirming by code inspection that no threshold check exists that would instead route this to `needs_attention`.

## Test Results

```
npm run typecheck   -> clean
npm run build       -> clean
npm run lint        -> clean

Real dry run (intake -> script_generation -> script_review): score 7/10, ReviewLog row
  correct, video-gen-fit flags present, PipelineRun -> paused_gate1/gate1
Weak-script direct call: score 1/10, did not throw, no special-cased low-score handling
```

## Deviations from Spec

None. Channel's "rubric/brand config" (mentioned in this task's Input section) doesn't exist as a dedicated schema field yet — used `Channel.nicheDescription` and `Channel.styleGuide` (the existing fields that carry this information per `SCHEMA.md`), consistent with how Script Generation (Task 4) already used them.

## Sign-Off

- Task Objective: Met
- Schema Impact: None new (writes to existing `review_logs`/`usage_events`)
- Business Logic: Matches `docs/execution/week2/BUSINESS_LOGIC.md` Sections 1, 3 — `script_review → paused_gate1` transition verified live
- Tests: Passing — real review verified against real Script Generation output; "always completes" verified with a deliberately weak script
- Ready for Integration: Yes — Task 6 (Gate 1) is the first real consumer of this stage's `ReviewLog`/output
