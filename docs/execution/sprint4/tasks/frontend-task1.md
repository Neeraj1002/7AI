# Sprint 4 Frontend Task 1: Channel Profile Setup Screen (Advanced) + Format Picker

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** Branch: `SPRINT4_FE`.

**Objective**: Give the app a real screen to configure a channel's profile (raw fields, not a wizard)
and let the brief form pick a content format — the frontend half of backend Tasks 1 and 6.
**Duration**: 6-8 hours
**Depends On**: Sprint 4 backend Tasks 1 (`channels.createProfileVersion`/`getActiveProfile`/
`listProfileVersions`) and 6 (`channels.listFormats`, `runs.create`'s `formatKey`).
**Owning Component**: new `app/app/(app)/channel/[id]/profile.tsx`, `app/app/(app)/new-brief.tsx`
(existing).
**Success Criteria**: (1) A real profile can be created/updated for a real channel through the app,
with a visible confirmation and readable validation errors on a bad value. (2) Submitting a brief
through the app can pick a format from Task 6's 9 seed formats, or submit freeform exactly as today.
(3) A read-only guardrails block and a simple version-history list are both visible on the profile
screen.

## Task Requirement

### R21 — Format picker on the brief form, Freeform preserved

**Where**: `app/app/(app)/new-brief.tsx` — currently a single free-text brief field only (confirmed by
reading the current file before assuming its shape).

**Fix**: a new, optional format selector above the existing brief text field — a simple picker over
`channels.listFormats`'s 9 entries plus a "Freeform" option (the default, selected state, preserving
today's exact behavior with zero extra taps for anyone who ignores this). Selecting a format shows its
`briefTemplate` as placeholder text in the (still fully editable) brief field — not auto-filled/locked
text the user has to delete, a starting point. Submitting includes `formatKey` in the `runs.create`
call only when a non-Freeform format is selected.

**Verify**: submitting with "Freeform" selected produces a real `runs.create` call with no `formatKey`
field at all — a real request/response check (e.g. via the existing dev tooling this app already uses
for API verification), not just a visual check that the UI looks unchanged.

### R22 (Advanced only) — Channel profile setup screen

**Where**: no channel-configuration screen exists at all today (confirmed via a full listing of
`app/app/(app)/` — only `dashboard.tsx`, `index.tsx`, `new-brief.tsx`, `run/[id].tsx` exist). This is
new screen surface, not an edit to something existing.

**Fix**: `app/app/(app)/channel/[id]/profile.tsx` — plain form fields matching Task 1's
`ChannelProfileDataSchema` exactly (script guide/target seconds/banned openers/banned endings/fact
policy; visual default source/style prompt/negative prompt/seconds-per-still; audio default voice/mood
tag; packaging title guidance/description template/hashtags/editor-credit toggle, plus Task 1/R18's
made-for-kids toggle/category/default-language fields). No AI-drafting, no multi-step wizard, no
example galleries — a single scrollable form, grouped into the same four sections the schema already
has, each field optional and clearly labeled as such ("leave blank to use the default" — except
made-for-kids, labeled "defaults to No" since Task 1/R18 always sends a concrete value, never leaves it
unset). Submits via `channels.createProfileVersion`; a validation failure shows the real Zod error
message inline against the offending field, not a generic toast.

**Verify**: a real submission with a deliberately bad value (e.g. `targetSeconds: 999`, outside the
15-60 bound) shows a real, specific inline error, not a crash or a silent no-op. A valid submission
creates a real new version, confirmed by the screen refetching and showing the new version's data.

### R27 — Locked platform guardrails, read-only

**Where**: same screen, a new non-editable section.

**Fix**: a small, static, clearly-labeled "Platform limits (not editable)" block: max length 60s, the
AI-disclosure flag behavior ("AI-generated visuals are automatically flagged as synthetic content on
upload"), and — only when the channel's resolved config would use `ai-stills` — a note that the
platform safety-negative prompt applies to AI-generated images. Purely informational text, no backend
call beyond what the profile fetch already returns.

### R28 (partial) — Version history

**Where**: same screen, a new read-only list.

**Fix**: `channels.listProfileVersions` rendered as a simple list — version number, created date,
creator (or "system" if `createdByUserId` is null) — newest first, matching Task 1's own ordering. No
diff view, no rollback action in this task — real, separable scope for later if it turns out to matter
once there's more than a handful of versions.

## Testing

```bash
npm run build && npm run lint && npx tsc --noEmit
```

### How to Verify
1. A real profile created for a real channel through the app, confirmed via `channels.getActiveProfile`
   returning it.
2. A real brief submitted with a format selected, confirmed via a direct look at the resulting
   `PipelineRun.creationOptions` (or the equivalent dev-tooling check this app's prior frontend tasks
   already established for confirming a real API call's effect).
3. Freeform submission unaffected — R21's Verify above.

## Report Template
`docs/execution/sprint4/reports/frontend-task1.md`.

## Links & References
- `sprint4/tasks/task1.md`, `task6.md` — the backend API this screen consumes.
