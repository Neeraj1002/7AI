# Sprint 5 Bug: Stock-footage audio and video timing

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.**

**Revision**: r1, 2026-10-30, founder-reported hotfix.
**Role**: BE
**Objective**: Diagnose and fix the audio slur and brief picture speed-up in stock-footage runs, including revisions.
**Branch**: `BUGS_STOCK_FOOTAGE_AV`
**Report**: `docs/execution/sprint5/bugs/reports/stock-footage-av.md`

## Task Requirement

Run `f596f80c-c804-4e20-ab0b-50cfae3bacd7` on preview has two stock-footage attempts. The founder hears audio slurring while the picture briefly speeds up at the same place. A revise did not fix it, and the measured output audio bitrate fell further. AI-image runs do not show the reported symptom.

### Acceptance Criteria

- Establish the cause from the stored voice, stock-shotlist video, final MP4, FFmpeg arguments and per-attempt review data before changing render code. Record codecs, bitrates, sample rates, declared and actual frame timing, durations and the audio/video duration difference for both attempts.
- Inspect fitting, revise and retry paths. Do not infer time stretching or bitrate reduction from the symptom.
- Change only the demonstrated cause with deterministic code. Use no LLM calls and add no channel-specific literal.
- Sweep `studio/`, `app/` and relevant docs for the same cause in AI-image runs and Shorts. Record every hit and disposition.
- Test the fitting rule and revise path. Check the budget and obtain the founder's estimate before at most one real stock-footage rerun using the same brief.
- Compare before and after probes and audible/visual behavior. Do not merge. Mark the PR ready only after CI is green.

## Schema Impact

No schema change is expected. Stop if diagnosis requires one.

## Business Logic / State Transition

The video-generation stage must fit visual material to the original narration without changing speech timing. A Gate 2 revise creates a new attempt from the sanctioned script, with independently generated source audio and an output whose audio and video remain aligned. Existing retry and gate transitions remain in force.

## Implementation

Investigate `studio/src/agents/video-generation/stock-shotlist.ts`, `index.ts`, `audio-mix.ts`, `quality-spec.ts`, `studio/src/agents/video-intelligence/quality-metrics.ts`, and the revise/retry calls in `studio/src/run-pipeline/state-machine.ts`. Modify only files supported by the measurements, with focused regression tests.

## Testing

Run relevant Vitest tests, build, lint and typecheck. Use FFprobe on both existing attempts and on the single authorized live rerun, if the budget and founder estimate allow it. Compare the voice file with the final audio by listening at the reported timestamp and compare picture timing at the same point.

## Reporting

Write `docs/execution/sprint5/bugs/reports/stock-footage-av.md` with the evidence, cause, fix, same-cause sweep, test results, live comparison, branch/worktree/PR, CI state and founder retest instructions. Do not edit `STATUS.md` or `PLAN.md`.

## Revision log

- r1, 2026-10-30: first issue from the founder's hotfix request.
