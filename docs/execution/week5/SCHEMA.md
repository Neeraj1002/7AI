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

## Reference
- `docs/execution/week4/SCHEMA.md` — the schema Task 1 verifies against, for real
- `docs/execution/week1/SCHEMA.md` — `brandAssets`' original definition
