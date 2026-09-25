# Sprint 2 Frontend Task 1: Structured Creation Options on New Brief

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** Note the branch/track
identifier for this task: `SPRINT2_FE` (see Additional Notes — this deliberately extends the
`_BE`/`_FE` suffix convention to a sprint-numbered frontend branch, a departure from the original
frontend track's `FRONTEND_FE`, one continuous branch; the reasoning is stated there).

**Objective**: Let a real user pick voice, visual source, and audio layer when submitting a brief
from the app — today the app can only submit `channelId` + `briefText`, even though the backend
(Sprint 2 Tasks 1-3) has accepted `voice`/`visualSource`/`audioLayer` on `runs.create` since Sprint 2
shipped.
**Duration**: 4-6 hours
**Depends On**: Sprint 2 backend Tasks 1-3 (`sprint2/tasks/task1.md`-`task3.md`) — closed. Frontend
track Tasks 1-3 (the original API layer + app scaffold + dashboard) — closed.
**Owning Component**: `app/` (the Expo app, sibling to `studio/` at the repo root — confirmed at
`D:\Study Material\7AI-frontend\app`), plus one small additive `studio/src/api/` endpoint.
**Success Criteria**: (1) A real run created from the app with an explicit voice/visualSource/
audioLayer override produces a `PipelineRun.creationOptions` row matching exactly what was picked,
confirmed by a direct Postgres read. (2) A run created with no override behaves exactly as before
(channel default, then hardcoded fallback) — no regression to the existing New Brief flow.

## Task Requirement

`sprint2/tasks/task1.md`'s own D2 already validates `voice`/`visualSource`/`audioLayer` at the API
edge (`api/routers/runs.ts`'s `create` mutation, confirmed by reading it: `voice: z.enum(TTS_VOICE_KEYS)
.optional()`, `visualSource: z.enum(VISUAL_SOURCES).optional()`, `audioLayer: z.enum(AUDIO_LAYERS)
.optional()`) — the backend contract has existed since Sprint 2 shipped. `app/app/(app)/new-brief.tsx`
(confirmed by reading it in full) only ever calls `createRun.mutate({ channelId, briefText })` — none
of the three fields are exposed anywhere in the app.

### FE1 — A real way to fetch the valid option lists
**Where**: `TTS_VOICES` (`studio/src/media/registry.ts`), `VISUAL_SOURCES`/`AUDIO_LAYERS`
(`studio/src/agents/video-generation/plan.ts`) are TypeScript values inside `studio/src/`, not
exposed over the API in any form — only referenced inside `runs.ts`'s Zod validators. `app/lib/trpc.ts`'s
own established discipline is "no hand-written response types, no duplicated Zod schemas" (its own
comment, verified) via a direct type-only import of `AppRouter` — hardcoding a second copy of these
lists inside the app would violate that discipline and silently drift the moment a backend task adds
a 14th voice or a third `visualSource`.

**Fix**: a small, additive `api/routers/options.ts` — one query, `options.creationOptions`, returning
`{ voices: { key: string; label: string }[], visualSources: string[], audioLayers: string[] }`,
built directly from the same `TTS_VOICES`/`VISUAL_SOURCES`/`AUDIO_LAYERS` exports the Zod validators
already use (re-exported, not re-typed) — the single source of truth stays `studio/src/`, the app
just gets a real way to read it. This is a `studio/src/api/` change, in the same spirit as Frontend
Track Task 1's own precedent of the frontend track owning small, additive backend work in direct
service of the app (`createRun` extraction, `resolvePendingApproval`) — not a Sprint 2 backend task
reopened.

**Verify**: a real call to `options.creationOptions` returns exactly the 13 real voice keys/labels
`sprint2/SCHEMA.md` documents, plus the real `visualSources`/`audioLayers` values — cross-checked
against `media/registry.ts`/`plan.ts` directly, not assumed.

### FE2 — Voice / visual source / audio layer pickers on New Brief
**Where**: `app/app/(app)/new-brief.tsx` — currently a channel-chip row + a brief-text field only.

**Fix**: three new, collapsible "Advanced options" pickers below the brief text field, each
defaulting to **unset** (no chip pre-selected) — an unset picker means "don't send this field at
all," which is what makes the channel-default → hardcoded-fallback resolution order
(`sprint2/BUSINESS_LOGIC.md`'s Task 1 section) actually reachable from the app; a picker that
defaults to some concrete value would silently turn every run into an explicit per-run override,
permanently short-circuiting the channel-default tier for anyone using the app. Same chip-row pattern
`new-brief.tsx`'s existing channel picker already uses (`styles.channelChip`/`channelChipSelected`),
reused for visual consistency rather than inventing a second control style. `createRun.mutate` gains
the three optional fields, included only when actually selected (`{ ...(voice && { voice }), ...
(visualSource && { visualSource }), ...(audioLayer && { audioLayer }) }` — mirroring exactly how
`runs.ts`'s own `create` mutation already builds `creationOptions` server-side, confirmed by reading
it, so the two sides agree on what "unset" means).

**Verify**: (1) a real run submitted with all three explicitly picked produces a
`PipelineRun.creationOptions` row matching exactly, confirmed by a direct Postgres read — not
inferred from the UI alone. (2) A real run submitted with the pickers left untouched produces
`creationOptions: null` (or a value containing only fields the user did touch, if some were touched
and others weren't) — the regression check that matters, since every existing New Brief flow depends
on "untouched" meaning "no override," not "override to some default."

## Schema Impact
None. This task consumes Sprint 2's existing `creationOptions` column; FE1 adds no new table.

## Business Logic / State Transition
None new. This task is a consumer of Sprint 2's already-implemented creation-option resolution order
(`sprint2/BUSINESS_LOGIC.md` Task 1) — it doesn't change that order, it's the first thing that lets a
real app user actually reach the "explicit override" tier of it.

## Testing
```bash
npm run build && npm run lint && npm run typecheck
npx expo start   # manual verification, same as Frontend Track Task 2/3
```
Plus FE1/FE2's real, live verification above.

## Additional Notes — branch naming for this task
The original frontend track (`docs/design_doc/frontend/MOBILE_APP_DESIGN.md`,
`docs/execution/templates/TASK_TEMPLATE.md`) used one continuous `FRONTEND_FE` branch, not
sprint-numbered, since it ran as a standalone track alongside the weekly backend cadence. Starting
this task, frontend work is grouped by sprint to match the backend (`sprint2/tasks/frontend-task1.md`,
this file) — branch as `SPRINT2_FE`, building on top of the existing `FRONTEND_FE` PR's merged work,
not a fresh branch from `main`. Flag this branch-naming change in `TASK_TEMPLATE.md`'s own Git
Workflow section as part of this task's documentation reconciliation, so it's not a silent,
undocumented convention shift for whoever picks up Sprint 3 frontend work next.

## Documentation reconciliation
- `docs/execution/sprint2/BUSINESS_LOGIC.md`: note the `options.creationOptions` endpoint as a small
  additive surface, not a new business-logic transition.
- `docs/execution/frontend/STATUS.md` or a new `docs/execution/sprint2/FRONTEND_STATUS.md` (this
  task's own call — state which in the report, and be consistent for FE2/3 below): this task's row.
- `docs/execution/templates/TASK_TEMPLATE.md`: note the `SPRINT[N]_FE` branch-naming change per
  Additional Notes above.

## Report Template
`execution/sprint2/reports/frontend-task1.md` (or wherever the report path is confirmed to actually
land — state it plainly if it differs), standard shape per `TASK_TEMPLATE.md`.
