# Week 5 Schema Delta

**Status**: One real migration (Task 4 — `Channel.budgetOverrideUsd`), one schema field addition
inside an existing agent-output shape (Task 4 — `factualConcerns`), and one new documented
convention within an existing `Json` column (Task 2).

## Task 1
No schema changes. A real-credentials verification run against the existing schema — no new tables, no column changes.

## Task 2 — `Channel.brandAssets.captionsEnabled` (B5)

`brandAssets` is an existing `Json` column (`channels.brandAssets`, migrated Week 1) — no migration
needed. It gains one new, optional, documented key:

```typescript
type BrandAssets = {
  introUrl?: string;
  outroUrl?: string;
  watermarkUrl?: string;
  voiceProfileId?: string;
  captionsEnabled?: boolean;   // new — default true if unset, preserves existing behavior
};
```

`captionsEnabled: false` skips caption (SRT) generation and the `subtitles` FFmpeg filter stage
entirely in Video Generation — not just an empty/invisible caption track. No existing `Channel` row
needs a backfill: the field's absence is treated identically to `true`.

## Task 3 — No schema changes

Restart-safe gates (B6) is entirely behavior, not data shape: no new column, no new table. The
"already reminded once" tracking for the gate-reminder nudge is deliberately in-memory only
(`gate-reminder.ts`'s `remindedRunIds`, pruned every check tick against the currently-pending run
list) — not persisted, since it resets harmlessly on restart (a restart already re-sends the gate
prompt via `reopenPausedGates`, so one possible extra reminder shortly after is not a correctness
issue).

## Task 4 — `Channel.budgetOverrideUsd` (C2), a real migration

A real, typed, nullable column — not a `Json` convention this time — added via
`prisma migrate dev --name week5_channel_budget_override`:

```prisma
model Channel {
  // ...existing fields...
  budgetOverrideUsd  Decimal? @db.Decimal(10, 2)
  // null = use the equal-split share of the platform's pooled AgentQuota.budgetCeilingUsd;
  // a set value = this channel's ceiling is exactly this, regardless of channel count.
}
```

```sql
ALTER TABLE "channels" ADD COLUMN "budgetOverrideUsd" DECIMAL(10,2);
```

No backfill needed — every existing channel is `null` by construction, which is exactly the
equal-split default. `Channel` (domain type, `types/channel.types.ts`) gained
`budgetOverrideUsd: string | null` (NUMERIC-as-string convention, same as every other `Decimal`
field on this type).

**Allocation algorithm** (`run-pipeline/budget-gate.ts`, pure function `computeChannelBudgetCeilings`,
fully unit-tested — see Task 4's test-harness section in `BUSINESS_LOGIC.md`):
1. Split a platform's active channels into overridden (`budgetOverrideUsd` set) and default (`null`).
2. `reservedByOverrides` = sum of all overridden channels' override amounts.
3. `remainingPool` = pool ceiling − `reservedByOverrides`, floored at 0 (with a loud
   `console.warn` naming the tenant/platform and the overshoot) if overrides alone exceed the pool.
4. `equalShare` = `remainingPool / count(default-share channels)` (0 if none, no divide-by-zero).
5. Each channel's effective ceiling = its own override if set, else `equalShare`.

`isBudgetAvailable(tenantId, channelId, platform)` (signature changed — gained `channelId`) now
returns `false` if **either** the pool total is exhausted (unchanged, existing check) **or** this
channel's own spend (new `sumUsageCostForTenantChannelPlatform`,
`repositories/usage-event.repository.ts`) exceeds its effective ceiling. Both call sites in
`state-machine.ts` updated to pass `channel.id`.

**Setting an override**: `scripts/set-channel-budget-override.ts <channelId> <usdAmount|clear>`,
same one-off founder-script convention as `scripts/set-budget-ceiling.ts` (`clear` resets to `null`,
i.e. back to equal-split). No in-app UI — deliberately out of scope for a single-founder-operator
MVP (real settings UI is Part 2 territory).

## Task 4 — `factualConcerns` (C3), agent-output shape addition

`ScriptReviewOutputSchema` (`agents/script-review/index.ts`) gained
`factualConcerns: z.array(z.string())` (empty array when nothing looks off). Not a DB migration —
it flows through the same `pipeline_stages.output` `Json` column and `ReviewLog.rationale` text that
the rest of Script Review's output already uses (Week 2 Task 5's convention). Explicitly a
plausibility check against the model's own knowledge, not a verified fact-check — `llm/client.ts`
has no tool use/retrieval wired in.

## Reference
- `docs/execution/week4/SCHEMA.md` — the schema Task 1 verifies against, for real
- `docs/execution/week1/SCHEMA.md` — `brandAssets`' original definition
