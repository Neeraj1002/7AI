# Week 4 Business Logic Delta

**Status**: The pipeline reaches `completed` for the first time. `publishing` and `analytics` — named in `pipeline_stages.stageName`'s `CHECK` constraint since Week 1 but never reachable — become real.

**Added 2026-09-09 (Task 1)**: Week 4 now also closes a real gap found in Week 3's `video_generation`/`video_review` loop — a rejection wasn't actually changing the next attempt, since Video Generation had no decision-making step for `fixNotes` to act on. Task 1 adds a production-planning step and swaps the solid-color placeholder background for real stock footage (Path A of the two-path visual strategy). Full spec: `docs/decisions/VIDEO_GENERATION_LOOP_AND_VISUAL_STRATEGY.md`. This doesn't change the stage sequence below — `video_generation`'s internal shape changes, not its position in the transition table.

## 1. Stage sequence (Week 4 subset)

Extends Week 3's transition table (`docs/execution/week3/BUSINESS_LOGIC.md` Section 1):

| From | Event | To |
|---|---|---|
| `paused_gate2` | Founder approves (Week 3 Task 4) | `running`, `currentStage = publishing` |
| `running` (publishing) | Upload succeeds | `running`, `currentStage = analytics` |
| `running` (publishing) | Upload fails (transient — API timeout, rate limit) | retries per the existing `retry-with-backoff.ts` wrapper, same as every other stage |
| `running` (publishing) | Upload fails (non-transient — invalid credentials, quota exhausted) | `needs_attention` |
| `running` (analytics) | First snapshot recorded | `completed` |

`completed` is a terminal state — no further automatic transitions. Performance Analytics' *ongoing* polling (Task 2) continues writing `PerformanceSnapshot` rows against a `completed` run on its own schedule (Section 8.3's "batch over real-time" — a periodic job, not part of the state machine's per-run transitions), same pattern `Continuous Learning` will eventually use to read `ReviewLog` without being "called."

## 2. Publishing

**Owner**: Publishing agent, per `AGENT_FLEET_DESIGN.md` 4.7.

### Input
`{ tenantId, channelId, pipelineRunId, videoPath, scriptText }` — `videoPath` from Video Generation (Week 3), `scriptText` (the sanctioned Gate 1 version) as source material for metadata generation.

### Metadata generation — new call, flagged for confirmation
Nothing upstream produces a video title or description — Script Generation (Week 2) outputs `scriptText`/`captions`/`hashtags` only. Publishing makes one small LLM call (`purpose: 'metadata-generation'`, new registry entry, mid-tier per `AGENT_FLEET_DESIGN.md` 8.1 — optimizing a title/description is closer to "reasoning/explanation" than raw classification, but nowhere near Script Generation's premium creative-generation tier) to produce `{ title, description, tags }` from the script and hashtags, immediately before upload. This keeps Script Generation focused on the creative asset and gives Publishing ownership of platform-specific optimization, matching its own mission statement ("optimized titles, descriptions, tags, and metadata") rather than folding metadata into Script Generation's job.

### Output
`{ youtubeVideoId, privacyStatus }` written to `pipeline_stages.output` (`stageName = 'publishing'`).

### Privacy status — hardcoded default, not a config UI
Per `MVP_ROADMAP_OCT15.md` Section 12 ("First full internal dry runs — publish as unlisted/private first, not public"), uploads default to `private` (a constant in the Publishing agent, not per-channel config yet — Principle 10). Flip to `public` is a one-line code change when the founder is ready for the real public test (Section 12's Oct 12–15 window), not a feature to build this week.

### Metering
Writes one `UsageEvent` row for the metadata-generation call (token-shaped, uses the existing `UsageEvent` fields unchanged — no schema extension needed, unlike Week 3's media calls).

## 3. Performance Analytics

**Owner**: Performance Analytics agent, per `AGENT_FLEET_DESIGN.md` 4.8.

### Trigger
Two distinct behaviors, not one: (a) an initial snapshot taken right after Publishing succeeds, which is what advances the run to `completed`; (b) ongoing periodic polling against every `completed` run's `youtubeVideoId`, independent of any single run's state machine, per Section 8.3.

### Output
A `PerformanceSnapshot` row per poll, per `docs/execution/week4/SCHEMA.md`.

## Implementation Reconciliation (added by Week 4 Task 4)

The transition table and Sections 2-3 above were confirmed accurate against what was actually
built and exercised — see `docs/execution/week4/reports/task1.md` through `task4.md`. Deltas and
confirmations worth recording here, since this doc is meant to describe reality, not just the plan:

- **`metadata-generation`'s tier**: resolved to `claude-haiku-4-5`, not a new mid-tier model —
  the registry's existing mid-tier example (`script-review`'s revision notes) already resolves to
  the cheap/fast model, so this followed that precedent rather than introducing a third pricing
  tier unprompted. Same judgment call made for Task 1's `video-production-planning` purpose. See
  `reports/task1.md`/`task2.md`.
- **Publishing's real, non-repeatable side effect required a new resumability mechanism** not
  anticipated when this doc was first written: every earlier stage's resumability story was
  "redo the work, it's idempotent-enough." A second `videos.insert` call is a genuinely duplicate
  video, not just wasted spend. `pipeline-stage.repository.ts` gained `recordStageProgress` — a
  durable mid-attempt checkpoint written the moment a real upload succeeds, before the stage is
  marked complete. `runPublishingStage` checks for this checkpoint before ever calling
  `uploadVideo` again. See `reports/task2.md`.
- **`completed` reached for real for the first time** (Task 3): `runAnalyticsStage`'s initial
  snapshot confirmed to advance `PipelineRun.status` to `completed`, `currentStage` to `null`,
  exactly as Section 1's transition table specifies.
- **Idempotent resume extended to `publishing`/`analytics`** (Task 4, same method as Week 2 Task 7
  and Week 3 Task 5): `resume-on-startup.ts`'s `STAGE_RESUMERS` map now dispatches both. Verified
  live with a genuine mid-`publishing` process kill — see the note below on this project's
  recurring "kill the wrapper, not the real process" pitfall, which bit again here exactly as it
  did in Week 3 Task 5, and was caught and corrected the same way.
- **A real, live recurrence of the already-flagged "`resume()` sweeps every stale running run"
  risk** (`docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md` §2): two genuine leftover Week 3 test runs,
  sitting at `currentStage = 'publishing'` since before this week's resumer existed (exactly the
  scenario that entry predicted), were swept up and completed for real by this task's `resume()`
  calls — a small amount of unintended real Anthropic spend (`metadata-generation` calls) and two
  stub YouTube uploads for runs that were never meant to publish. Harmless in outcome (both
  completed cleanly, no duplicate uploads), but a live confirmation that the flagged risk is now
  materially live, not theoretical, now that a `publishing` resumer exists. Still not fixed —
  remains a deliberate product decision to make, per that doc's own framing.
- **The "kill the wrapper, not the real process" pitfall recurred, and was caught.** A first kill
  attempt used `TaskStop` against the backgrounded shell task; the actual `node.exe` several
  layers deep (npx → tsx CLI → the real runtime) kept running undetected and completed the test
  delay on its own, exactly the same failure mode Week 3 Task 5 already hit once. Caught by
  checking `tasklist`/`Get-CimInstance Win32_Process` for the actual PIDs and force-killing all
  three node processes in the tree directly. Worth a permanent note: on Windows, stopping a
  background *task* here does not reliably stop the *process tree* it spawned.

## Reference
- `MVP_ROADMAP_OCT15.md` Sections 5.1 (Intake), 8.3, 12, 13
- `AGENT_FLEET_DESIGN.md` Sections 4.7, 4.8, 8.1
- `docs/execution/week4/SCHEMA.md`
