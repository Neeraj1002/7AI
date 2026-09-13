# Week 5 Schema Delta

**Status**: No new tables, no migration. One new documented convention within an existing `Json` column (Task 2).

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

## Reference
- `docs/execution/week4/SCHEMA.md` — the schema Task 1 verifies against, for real
- `docs/execution/week1/SCHEMA.md` — `brandAssets`' original definition
