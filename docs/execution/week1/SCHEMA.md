# Week 1 Schema: Foundation Tables

**Scope**: `Tenant`, `Channel`, `PipelineRun`, `PipelineStage`, `ReviewLog` — exactly the five tables `MVP_ROADMAP_OCT15.md` Section 12 names for Week 1. Nothing else gets migrated this week.

**Status of each definition below**:
- `Channel` and `ReviewLog` — field lists are **locked**, sourced directly from `AGENT_FLEET_DESIGN.md` Section 6.2. Do not diverge without updating that doc.
- `Tenant`, `PipelineRun`, `PipelineStage` — **proposed here for the first time**. The fleet doc names them but doesn't give field-level shape (`PipelineRun`/`PipelineStage` aren't detailed there at all; `Tenant` is described only as "top-level account"). Treat these as a first draft for Task 3 to implement, open to a quick founder sign-off before the migration runs — not yet "locked" the way `Channel`/`ReviewLog` are.

**Explicitly out of scope this week** (dormant tenancy/billing tables per `AGENT_FLEET_DESIGN.md` Section 6.1–6.2 — `AgentCredential`, `AgentQuota`, `UsageEvent`, `Plan`/`Subscription`/`Invoice`): these get created once an agent actually runs and needs metering (Week 2+, starting with Script Generation), not before. Creating them now with nothing writing to them yet is exactly the kind of speculative scope Section 14 (Risk #3, scope creep) warns against — unlike `ReviewLog`, which is explicitly called out as cheap-now/expensive-later and therefore worth building empty.

---

## Enum Strategy: TypeScript Union + CHECK Constraint, Not Postgres ENUM

Applies to every enum-like field below: `Channel.platform`, `Channel.priorsScope`, `PipelineRun.status`, `PipelineStage.stageName`, `PipelineStage.status`. All of them are `VARCHAR` with a `CHECK` constraint in the DDL — none of them is a native Postgres `ENUM` type (`CREATE TYPE ... AS ENUM (...)`), and that's a deliberate choice, not an oversight.

**Why not a native Postgres enum**: `StageName` alone goes from one real value (`intake`) to nine over the next five weeks as each agent comes online — that's exactly the shape of field Postgres enums handle badly. Adding a value is `ALTER TYPE ... ADD VALUE`, which in practice can't run in the same transaction as a migration that also *uses* the new value, and there's no `DROP VALUE` at all — renaming or removing one means recreating the type and repointing every column that uses it. A `VARCHAR` + `CHECK` changes with one `ALTER TABLE ... DROP CONSTRAINT` / `ADD CONSTRAINT`, in a single ordinary transaction, on the specific table, not a shared type other tables might also depend on. It also matches the convention `yt_shorts` already used for its own lifecycle-style fields (`DATA_MODEL.md`'s `lifecycle`, `status` columns) — one less thing to relearn moving between the two codebases.

**Single source of truth is the TypeScript union**, not the CHECK constraint and not a separately-maintained Zod schema. Define each enum once as a `const` array, and derive everything else from it:

```typescript
// studio/src/types/pipeline.types.ts
export const STAGE_NAMES = [
  'intake', 'script_generation', 'script_review', 'gate1',
  'video_generation', 'video_review', 'gate2', 'publishing', 'analytics',
] as const;
export type StageName = typeof STAGE_NAMES[number];

export const STAGE_STATUSES = ['pending', 'running', 'completed', 'failed', 'skipped'] as const;
export type StageStatus = typeof STAGE_STATUSES[number];

// The Zod schema from WEEK1_INSTRUCTIONS.md Task 3's schema-drift note derives from the same array:
// z.enum(STAGE_NAMES) — never a separately-typed-out list.
```

When a new stage or status is added later, it's two edits in one migration commit: the `const` array (which the Zod validator and every consumer pick up automatically — nothing else in the app needs to change) and the CHECK constraint's value list below, kept in sync by hand since Postgres has no way to read a CHECK constraint's list from a TypeScript file. Two places, not three, and both change together in the same PR.

**If Task 1 lands on Prisma**: declare these fields as `String @db.VarChar(50)` in `schema.prisma`, not Prisma's `enum` keyword — a Prisma `enum` compiles to a native Postgres `ENUM` type by default, which reintroduces exactly the `ALTER TYPE` friction this section avoids. The `CHECK` constraint itself will likely still need a raw SQL migration step either way, since Prisma's schema language doesn't have first-class `CHECK` constraint syntax in its stable release.

---

## 1. Tenant

The top-level account. For the MVP this is a single row — the founder's own account.

```typescript
type Tenant = {
  id: string;          // UUID, primary key
  name: string;         // display name, e.g. "Neeraj — 7AI"
  createdAt: Date;
  updatedAt: Date;
};
```

```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT now(),
  updatedAt TIMESTAMP NOT NULL DEFAULT now()
);

-- Seed row for the MVP's single tenant
INSERT INTO tenants (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Neeraj — 7AI');
```

**Rationale**: deliberately minimal. Every other table hangs off `tenant_id`, so the table has to exist from the first migration even though nothing about multi-tenancy is exercised yet (`AGENT_FLEET_DESIGN.md` Principle 2 — mandatory from v1). No auth/billing fields here; those stay on the dormant tables list until a real second tenant exists.

---

## 2. Channel

Locked field list, from `AGENT_FLEET_DESIGN.md` Section 6.2: "Holds niche/topic focus, style/voice guide, brand assets (intro/outro, watermark, voice profile), OAuth credential, posting cadence, per-channel approval-gate settings, and per-channel priors scope. Every pipeline run is scoped by `(tenant_id, channel_id)`... Hard-capped at 7 channels per platform per tenant."

```typescript
type Channel = {
  id: string;                    // UUID, primary key
  tenantId: string;              // FK -> tenants.id
  platform: 'youtube';           // enum; only value for MVP, more added per-platform later
  name: string;                  // display name for this channel
  externalChannelId?: string;    // the platform's own channel ID, once OAuth is set up (Task 7)

  // Niche / voice
  nicheDescription: string;      // free text for MVP; structured taxonomy is a later refinement
  styleGuide?: string;           // voice/tone guidance, free text or short JSON for MVP

  // Brand assets — references, not the binary assets themselves
  brandAssets: Record<string, unknown>;  // { introUrl?, outroUrl?, watermarkUrl?, voiceProfileId? }

  // Operations
  postingCadence?: string;       // e.g. "daily", cron-like string, or plain text for MVP
  approvalGateConfig: {
    gate1Enabled: boolean;       // default true
    gate2Enabled: boolean;       // default true
  };
  priorsScope: 'isolated' | 'shared';  // default 'isolated' — cross-channel learning is opt-in only

  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

// Note: raw OAuth credentials are NOT stored on Channel. They belong on the (dormant-for-now)
// AgentCredential table, encrypted at rest. For Week 1 / single-channel MVP, Task 7's OAuth
// setup can live in environment variables as a stopgap; AgentCredential is a Week 2+ task once
// a second channel makes env-var-per-channel unworkable.
```

```sql
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenantId UUID NOT NULL REFERENCES tenants(id),
  platform VARCHAR(20) NOT NULL DEFAULT 'youtube'
    CHECK (platform IN ('youtube')),
  name VARCHAR(255) NOT NULL,
  externalChannelId VARCHAR(255),

  nicheDescription TEXT NOT NULL,
  styleGuide TEXT,

  brandAssets JSONB NOT NULL DEFAULT '{}',

  postingCadence VARCHAR(255),
  approvalGateConfig JSONB NOT NULL DEFAULT '{"gate1Enabled": true, "gate2Enabled": true}',
  priorsScope VARCHAR(20) NOT NULL DEFAULT 'isolated'
    CHECK (priorsScope IN ('isolated', 'shared')),

  isActive BOOLEAN NOT NULL DEFAULT true,
  createdAt TIMESTAMP NOT NULL DEFAULT now(),
  updatedAt TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_channels_tenant ON channels(tenantId, isActive);
CREATE UNIQUE INDEX idx_channels_external ON channels(platform, externalChannelId) WHERE externalChannelId IS NOT NULL;
```

**The 7-channel cap is application logic, not a DB constraint.** A `CHECK` constraint can't count sibling rows in Postgres without a trigger, and a trigger is more moving parts than this needs at MVP scale. Enforce it in the Orchestrator's channel-creation path instead: `SELECT count(*) FROM channels WHERE tenantId = $1 AND platform = $2 AND isActive = true`, reject if the count is already 7. This rule is documented in `BUSINESS_LOGIC.md` Section 4 — implement it as part of Task 3/4, not left implicit.

---

## 3. PipelineRun

**Proposed, not yet locked.** One row per end-to-end brief-to-published-video run.

```typescript
type PipelineRunStatus =
  | 'pending'           // created, Intake not yet run
  | 'running'           // actively executing a stage
  | 'paused_gate1'       // waiting on human at Gate 1 (Week 2+; state exists from Week 1, unused until then)
  | 'paused_gate2'       // waiting on human at Gate 2 (Week 2+)
  | 'completed'         // published, analytics logging started
  | 'failed'            // hit a hard failure, not auto-recoverable
  | 'needs_attention';  // circuit breaker tripped or ambiguous input — escalated to the approval queue

type PipelineRun = {
  id: string;                    // UUID, primary key
  tenantId: string;              // FK -> tenants.id
  channelId: string;             // FK -> channels.id

  status: PipelineRunStatus;
  currentStage?: string;         // matches PipelineStage.stageName of the active/last stage

  briefText: string;             // the human's raw 2-3 sentence input
  intakeParsed?: Record<string, unknown>;  // structured { topic, constraints } once Intake runs

  retryCount: number;            // total retries across all stages in this run
  lastError?: string;

  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};
```

```sql
CREATE TABLE pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenantId UUID NOT NULL REFERENCES tenants(id),
  channelId UUID NOT NULL REFERENCES channels(id),

  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'paused_gate1', 'paused_gate2', 'completed', 'failed', 'needs_attention')),
  currentStage VARCHAR(50),

  briefText TEXT NOT NULL,
  intakeParsed JSONB,

  retryCount INT NOT NULL DEFAULT 0,
  lastError TEXT,

  startedAt TIMESTAMP,
  completedAt TIMESTAMP,
  createdAt TIMESTAMP NOT NULL DEFAULT now(),
  updatedAt TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_runs_tenant_channel ON pipeline_runs(tenantId, channelId);
CREATE INDEX idx_runs_status ON pipeline_runs(status);
```

**Rationale**: `status` and `currentStage` are deliberately separate — `status` is the coarse-grained run state (what the approval queue and dashboard filter on), `currentStage` is the fine-grained pointer used for resumability (roadmap Section 9: "the scheduler reads persisted state from Postgres on startup"). `intakeParsed` is nullable because it doesn't exist until the Intake stage completes — see `BUSINESS_LOGIC.md` Section 3.

---

## 4. PipelineStage

**Proposed, not yet locked.** One row per stage-attempt within a `PipelineRun`. Week 1 only defines the shape and the `intake` stage's real use; the rest of the stage names exist in the enum now so the state machine doesn't need a schema change every time a new agent comes online.

```typescript
type StageName =
  | 'intake' | 'script_generation' | 'script_review' | 'gate1'
  | 'video_generation' | 'video_review' | 'gate2' | 'publishing' | 'analytics';

type StageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

type PipelineStage = {
  id: string;                // UUID, primary key
  pipelineRunId: string;     // FK -> pipeline_runs.id
  stageName: StageName;
  status: StageStatus;
  attemptNumber: number;     // 1-indexed; increments on retry

  input?: Record<string, unknown>;   // what this stage received
  output?: Record<string, unknown>;  // what this stage produced (plain, human-readable per Section 6 of the roadmap)

  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
};
```

```sql
CREATE TABLE pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipelineRunId UUID NOT NULL REFERENCES pipeline_runs(id),
  stageName VARCHAR(50) NOT NULL
    CHECK (stageName IN ('intake', 'script_generation', 'script_review', 'gate1',
                          'video_generation', 'video_review', 'gate2', 'publishing', 'analytics')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  attemptNumber INT NOT NULL DEFAULT 1,

  input JSONB,
  output JSONB,

  startedAt TIMESTAMP,
  completedAt TIMESTAMP,
  error TEXT,
  createdAt TIMESTAMP NOT NULL DEFAULT now(),
  updatedAt TIMESTAMP NOT NULL DEFAULT now(),

  UNIQUE(pipelineRunId, stageName, attemptNumber)
);

CREATE INDEX idx_stages_run ON pipeline_stages(pipelineRunId);
```

**Rationale for `input`/`output` as JSONB, not a typed column per stage**: stage payloads differ completely by stage (a brief string vs. a script vs. video metadata), and a wide table with one nullable column per possible payload shape is worse than JSONB here — this mirrors how `MetricSnapshot`/`Forecast` in `yt_shorts`'s data model used typed columns *because* their shape was fixed and known, whereas this table's shape is deliberately generic across nine different agents. Keep `output` "plain, human-readable text/JSON" per `MVP_ROADMAP_OCT15.md` Section 6 — no opaque binary — since a human reads this directly at the approval gates.

---

## 5. ReviewLog

Locked field list, from `AGENT_FLEET_DESIGN.md` Section 6.2: "One row per review-type decision anywhere in the pipeline — Script Review's score/notes, Video Intelligence's own-draft pass/fail, and every human Gate 1/Gate 2 decision (approve/edit/reject). Fields: `tenant_id`, `channel_id`, `pipeline_run_id`, `agent` (or `human`), `verdict`, `rationale`, `timestamp`."

```typescript
type ReviewLog = {
  id: string;                 // UUID, primary key — proposed addition, not in the locked field list, needed as PK
  tenantId: string;
  channelId: string;
  pipelineRunId: string;
  agent: string;              // agent name, or the literal string 'human'
  verdict: string;            // e.g. "pass", "fail", "approve", "edit", "reject", or a numeric score as text
  rationale: string;
  timestamp: Date;

  // Proposed additions (not in the locked list — flag for confirmation, but low-risk/high-value):
  stageId?: string;           // FK -> pipeline_stages.id, for direct traceability to the stage reviewed
  editedOutput?: Record<string, unknown>;  // when verdict is a human "edit", what they changed it to
};
```

```sql
CREATE TABLE review_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenantId UUID NOT NULL REFERENCES tenants(id),
  channelId UUID NOT NULL REFERENCES channels(id),
  pipelineRunId UUID NOT NULL REFERENCES pipeline_runs(id),
  stageId UUID REFERENCES pipeline_stages(id),

  agent VARCHAR(100) NOT NULL,
  verdict VARCHAR(50) NOT NULL,
  rationale TEXT NOT NULL,
  editedOutput JSONB,

  timestamp TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_reviewlog_run ON review_logs(pipelineRunId);
CREATE INDEX idx_reviewlog_channel_time ON review_logs(channelId, timestamp);
```

**`verdict` deliberately has no `CHECK` constraint**, unlike the enum-like fields above — the fleet doc's own definition allows it to be "pass/fail," "approve/edit/reject," or "a numeric score as text" depending on which agent or human wrote the row, so it isn't a single closed set the way `stageName` or `status` is. If a per-agent verdict vocabulary firms up later, constrain it then.

**Why write this table now with nothing reading it back**: this is the exact "predicted quality vs. actual outcome" calibration data Continuous Learning will need later, and reconstructing it retroactively (re-deriving what a review verdict was after the fact) isn't possible once the moment has passed. Same logic already applied to `UsageEvent` and tenancy — cheap now, expensive or impossible later.

---

## Relationship Diagram

```
Tenant
  └── 1:M → Channel
             └── 1:M → PipelineRun
                        ├── 1:M → PipelineStage
                        └── 1:M → ReviewLog
```

## Migration Strategy

Single migration for Week 1: `migrations/0001_foundation_schema.sql` (or the equivalent Prisma migration, once ORM choice is confirmed in Task 1). All five tables in one migration, since they're mutually dependent via foreign keys and there's no meaningful intermediate state between "none of this exists" and "the skeleton exists." Later weeks add migrations incrementally as each week's `SCHEMA.md` calls for it.
