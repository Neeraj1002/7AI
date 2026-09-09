# Week 3 Schema Delta

**Status**: One extension this week — `usage_events` (Week 2) gains optional non-token usage fields, so it can meter Video Generation's TTS/transcription calls without forcing them into a token-shaped row that doesn't describe what actually happened. No new tables; video assets are referenced by path/URL string in `pipeline_stages.output`, the same "plain, human-readable, no opaque binary" convention `Channel.brandAssets` and every other stage output already uses — a dedicated `Asset`/object-storage table isn't earned yet at MVP scale (Task 2 stores rendered files on local disk; see that task's Additional Notes).

## `usage_events` — extended

`inputTokens`/`outputTokens` become optional (LLM-shaped calls only); two new optional fields cover media-shaped calls; `costUsd` stays required as the one universal field every row has, whatever kind of call produced it.

```typescript
type UsageEvent = {
  id: string;
  tenantId: string;
  channelId: string;
  pipelineRunId?: string;
  stageId?: string;

  agent: string;
  provider: string;
  model: string;

  inputTokens?: number;              // was required — now optional, LLM-shaped calls only
  outputTokens?: number;             // was required — now optional, LLM-shaped calls only
  characterCount?: number;           // new — TTS-shaped calls (billed per character)
  audioDurationSeconds?: number;     // new — transcription-shaped calls (billed per audio-minute)
  costUsd: string;                   // still required, still the common denominator

  metadata?: Record<string, unknown>; // new — see note below
  createdAt: Date;
};
```

```sql
ALTER TABLE usage_events
  ALTER COLUMN inputTokens DROP NOT NULL,
  ALTER COLUMN outputTokens DROP NOT NULL,
  ADD COLUMN characterCount INT,
  ADD COLUMN audioDurationSeconds NUMERIC(10,2),
  ADD COLUMN metadata JSONB;
```

**Why one row per Video Generation invocation, not three (TTS + transcription + FFmpeg)**: `AGENT_FLEET_DESIGN.md` Section 6.2 defines `UsageEvent` as "one row per agent invocation" — Video Generation is one agent invocation internally making three calls (two billed, one free). Splitting into three rows would over-fragment against that definition and complicate the budget-check sum (Task 4/Week 2's pattern, reused by Week 3 Task 5, sums `usage_events.costUsd` per tenant+platform — three granular rows vs. one aggregated row shouldn't change that sum, but one row is simpler to reason about and matches every other agent's one-call-one-row shape). The new `metadata` field carries the breakdown (e.g. `{ ttsCharacters, transcriptionSeconds, ffmpegCostUsd: 0 }`) so nothing about the composite nature is lost — just not split across rows.

## Reference
- `docs/execution/week2/SCHEMA.md` Section 2 — original `UsageEvent` shape, extended here
- `AGENT_FLEET_DESIGN.md` Section 6.2 — "one row per agent invocation"
- `docs/execution/week1/reports/task8.md` — TTS/transcription/FFmpeg toolchain choice this extension is built for
