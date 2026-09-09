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

## Reference
- `MVP_ROADMAP_OCT15.md` Sections 5.1 (Intake), 8.3, 12, 13
- `AGENT_FLEET_DESIGN.md` Sections 4.7, 4.8, 8.1
- `docs/execution/week4/SCHEMA.md`
