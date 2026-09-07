# Week 2 Schema Delta

**Status**: Two new tables proposed this week — `AgentQuota` and `UsageEvent`. Both are named in `AGENT_FLEET_DESIGN.md` Section 6.2 but left unspecified at field level, the same situation Week 1's `Tenant`/`PipelineRun`/`PipelineStage` were in. Proposed here for Task 4 to implement; open to a quick founder sign-off before the migration runs — not yet "locked" the way `Channel`/`ReviewLog` are.

**Why now**: `docs/execution/week1/BUSINESS_LOGIC.md` Section 6 and `docs/execution/week1/SCHEMA.md`'s scope note both flagged these tables as starting "once an agent actually runs and needs metering (Week 2+, starting with Script Generation)." Task 4 (Script Generation) is that trigger — per Design Principle 7 ("every call is a metered event... from the first working version"), Script Generation cannot ship without `UsageEvent` writes alongside it.

## 1. AgentQuota

Locked concept, proposed fields, from `AGENT_FLEET_DESIGN.md` Section 6.2: "Pooled per `(tenant_id, platform)` — API units and dollar budget are one shared ceiling across all 7 channels on a platform, not 7 separate per-channel ceilings."

```typescript
type AgentQuota = {
  id: string;                  // UUID, primary key
  tenantId: string;            // FK -> tenants.id
  platform: 'youtube';         // matches Channel.platform; one row per (tenant, platform)

  budgetCeilingUsd: string;    // NUMERIC as string — founder-set soft ceiling, dollars

  createdAt: Date;
  updatedAt: Date;
};
```

```sql
CREATE TABLE agent_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenantId UUID NOT NULL REFERENCES tenants(id),
  platform VARCHAR(20) NOT NULL DEFAULT 'youtube'
    CHECK (platform IN ('youtube')),
  budgetCeilingUsd NUMERIC(10,2) NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT now(),
  updatedAt TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE(tenantId, platform)
);
```

**Deliberately no period/reset tracking this week** — a single running ceiling, not a monthly-resetting budget, is enough for one channel at MVP scale (named `budgetCeilingUsd`, not `monthlyBudgetUsd`, to avoid implying a reset that doesn't exist yet). Section 8.7's fair-allocation-across-channels problem doesn't exist yet with only one channel — revisit once channel #2 goes live (Week 5) and the pool actually needs to arbitrate between channels.

**Enforcement is a soft/manual ceiling**, per `MVP_ROADMAP_OCT15.md` Section 5.6 ("even a soft/manual ceiling for MVP is fine"): before invoking Script Generation, the Orchestrator sums `UsageEvent.costUsd` for the tenant+platform and compares it to `budgetCeilingUsd`. See Week 2 `BUSINESS_LOGIC.md` Section 2 for the exact transition.

**Seeding**: Task 4 seeds one `AgentQuota` row for the founder's tenant + `youtube`, at a founder-confirmed starting ceiling — this is a real dollar number affecting whether Script Generation runs at all, so Task 4's report should state what value it used and flag it for confirmation rather than picking one silently.

## 2. UsageEvent

Locked concept, proposed fields, from `AGENT_FLEET_DESIGN.md` Section 6.2 ("One row per agent invocation — written from day one, MVP included") and Design Principle 7 ("Every call is a metered event").

```typescript
type UsageEvent = {
  id: string;                  // UUID, primary key
  tenantId: string;            // FK -> tenants.id
  channelId: string;           // FK -> channels.id
  pipelineRunId?: string;      // FK -> pipeline_runs.id — nullable for a future standalone/"rentable" call (Principle 4), always set for MVP
  stageId?: string;            // FK -> pipeline_stages.id — which stage this call happened in

  agent: string;                // e.g. 'script-generation', 'script-review' — matches the LLM layer's Purpose value where applicable
  provider: string;             // e.g. 'anthropic' — from the LLM layer's registry resolution, not hardcoded per call site
  model: string;                // e.g. 'claude-sonnet-5'

  inputTokens: number;
  outputTokens: number;
  costUsd: string;              // NUMERIC as string — computed from token counts, see note below

  createdAt: Date;
};
```

```sql
CREATE TABLE usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenantId UUID NOT NULL REFERENCES tenants(id),
  channelId UUID NOT NULL REFERENCES channels(id),
  pipelineRunId UUID REFERENCES pipeline_runs(id),
  stageId UUID REFERENCES pipeline_stages(id),

  agent VARCHAR(100) NOT NULL,
  provider VARCHAR(50) NOT NULL,
  model VARCHAR(100) NOT NULL,

  inputTokens INT NOT NULL,
  outputTokens INT NOT NULL,
  costUsd NUMERIC(10,4) NOT NULL,

  createdAt TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_tenant_platform_time ON usage_events(tenantId, createdAt);
CREATE INDEX idx_usage_run ON usage_events(pipelineRunId);
```

**Where `costUsd` comes from**: computed inside `studio/src/llm/` (Task 1), not re-derived per agent — a small per-model pricing table sits alongside the registry, since that's already where provider+model gets resolved. Call sites (Script Generation, Script Review) get a cost figure back from the layer along with the response; they don't compute it themselves. Task 4 confirms the exact placement when it's the first real consumer.

## Reference
- `AGENT_FLEET_DESIGN.md` Section 6.2 — `AgentQuota`/`UsageEvent` named, pooling behavior locked
- `AGENT_FLEET_DESIGN.md` Section 8.7 — cost budgets, pooling, fair-access open question (deferred to Week 5)
- `docs/execution/week1/SCHEMA.md` — same "proposed, not yet locked" treatment applied to `PipelineRun`/`PipelineStage`
- `docs/execution/week1/BUSINESS_LOGIC.md` Section 6 — the scope note that triggers this work
