# Sprint 3 Task 9: UI Enhancement 2 — Backend Requirements (Channel Settings, Watermark Upload, Gate Toggles, Brief Length)

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git
Workflow, the `STATUS.md` update this task must make, and the section structure this file follows.

**Note on why this is a Sprint 3 task, not Sprint 4**: same reasoning as Task 8 — Sprint 4
(`docs/execution/sprint4/`) is a separate, larger, not-yet-started initiative (channel
profiles/formats/content-quality configurability). This task is narrowly scoped backend work that
exists to unblock the UI/UX track's "UI Enhancement 2" frontend build
(`docs/execution/ui-ux/tasks/task2.md`, branch `UIUX_ENH2_FE`, built after Enhancement 1/PR #26 merges).
Filed as a third Sprint 3 reopen (after Task 7, then Task 8) rather than a new sprint, on its own branch
so it's never mistaken for real Sprint 3/4 work in `git log`/the PR list.

**Depends on Enhancement 1 landing first**: this task assumes Task 8's `channels.update` (B2/R2) and
`Channel.defaultPrivacyStatus` (B1/R1) have merged to `main` with the shape specified in
`sprint3/tasks/task8.md`. **The code snapshot this task was verified against predates PR #27's merge** —
confirm the actual merged `channels.update` input/handler shape by direct read before extending it;
if it differs from `task8.md`'s spec in any way, adjust this task's R1/R2 accordingly rather than
assuming.

**R2's Bugs Task 6 dependency is now cleared — read this for the history, but R2 is unblocked.** R2's own
section below was rewritten on 2026-09-26 after a real premise error was found and corrected (see that
section for the full story): the script-review auto-retry mechanism this doc originally claimed didn't
exist is, in fact, real and live on `main` (Bugs Task 3/R3), and a separate task, **Bugs Task 6**
(`docs/execution/bugs/tasks/task6.md`), extended that exact same code region (`runScriptReviewStage` in
`state-machine.ts`) with a feedback-notes fix and a budget-routing consistency fix. R2's own new branch
(the `gate1Enabled`-off skip-through) sits inside that same function, immediately adjacent to what Bugs
Task 6 changed. **`BUGS_TASK6` merged to `main` via PR #31 on 2026-09-27 — R2's implementation can now
start.** Build R2 directly on top of the `fixNotes` lookup and budget-routing fix Bugs Task 6 added,
rather than reintroducing a parallel branch — this was always the intent, and is now safe to do. R1, R3,
R4, R5 were always independent of this and can proceed on their own schedule regardless.

## Status: Done — all five R-items complete, PR #32 ready for review

**R1, R2, R3, R4, and R5 are all complete, live-verified, and pushed to `UIENHANCEMENT2_BE` (2026-09-27).** PR [#32](https://github.com/Neeraj1002/7AI/pull/32) is out of draft, ready for review. Full verification detail (including R2's real sandbox-DB results for both gates) is in `docs/execution/sprint3/reports/task9.md`. R4 found and fixed a real issue not anticipated in this doc's original spec — a bare "approximately N seconds" prompt hint didn't reliably move the model; stating the equivalent word count fixed it, re-verified across multiple target durations. R2 built exactly the design this doc recommends below, with a `gate1AutoApprove`/`gate2AutoApprove` synthetic gate-row pattern so an auto-approve is indistinguishable downstream from a human one.

**Objective**: let the app's new Channel Settings screen actually persist every setting it shows
(style guide, voice, captions, budget override, watermark, gate toggles), and let New Brief's per-run
Options include a target length — each control stays behind a feature flag until its backend item
lands, so partial landing is safe.

**Duration**: R1 (B5) ~1.5h, R2 (B7) ~1-2h (**revised down from ~3-5h — see R2's corrected scope below;
the heavy lifting this estimate originally accounted for turned out to already exist**), R3 (B6) ~3h
(new dependency, new file-serving route, upload/remove/serve), R4 (B10) ~1.5h, R5 (B9,
optional) ~0.5h.

**Depends On**: Sprint 3 Task 8 (B1/B2 — `defaultPrivacyStatus`, `channels.update`), Sprint 2 Task 1/2/3
(D1/D2, E2, F1 — the `voice`/`visualSource`/`audioLayer` creation-options wiring this task's R4 extends
directly), Sprint 3 Task 5 (M1/M2 — ownership checks `channels.update` already reuses), **Bugs Task 6
(R2 only — merged via PR #31, 2026-09-27; no longer a live blocker, see the note above)**.

**Owning Component**: `studio/src/api/routers/channels.ts`, `studio/src/api/routers/runs.ts`,
`studio/src/models/repositories/channel.repository.ts`, `studio/src/run-pipeline/state-machine.ts`,
`studio/src/agents/script-generation/index.ts`, `studio/src/types/pipeline.types.ts`,
`studio/src/models/schema.prisma`, `studio/src/api/server.ts` (new watermark REST route), a new
`studio/src/api/watermark-route.ts`, optionally a new `studio/src/api/routers/options.ts`.

**Success Criteria**:
1. `channels.update` accepts `styleGuide`/`defaultVoice`/`captionsEnabled`/`budgetOverrideUsd` and
   persists each correctly, without ever dropping the other one at a time it doesn't touch (see the
   shared design note below — `brandAssets` is a JSON column two different items in this task write to).
2. A `gate1Enabled: false` channel's script review, once it reaches or auto-retries to a real score of 7
   or above, advances straight to `video_generation` with an auto-approve `ReviewLog` row instead of
   pausing at Gate 1 — reusing the auto-retry mechanism that already exists (Bugs Task 3/R3 + Task 6),
   not building a new one. See R2 below for the full corrected picture.
3. A channel can have a watermark logo uploaded and removed through the app, video generation's
   existing FFmpeg consumption of it keeps working unmodified, and the "built but never exercised"
   watermark render path (`KNOWN_ISSUES_AND_BLOCKERS.md` §5) gets a real, live exercise for the first
   time.
4. `runs.create` accepts an optional `targetDurationSec` (30/45/60) that actually reaches the script the
   agent writes.
5. (Optional) A read-only query gives the app labels/options without needing its own hardcoded copies.

## Shared design note — `brandAssets` is one JSON column, two items write to it

`Channel.brandAssets` (`Json`, containing at least `{watermarkUrl?, captionsEnabled?}`) is touched by
**both R1 (B5's `captionsEnabled`) and R3 (B6's `watermarkUrl`)**. Whatever `channel.repository.ts`
function either one calls **must read-merge-write this JSON column, never overwrite it wholesale** — a
naive `{ brandAssets: { captionsEnabled: input.captionsEnabled } }` write would silently erase
`watermarkUrl` (or vice versa) the moment the other field was ever set. If Task 8's R2 `updateChannel`
doesn't already handle JSON-column patches this way (it had no JSON field to patch yet, only scalars),
this task is what first needs that merge behavior — add it once, in one place, and have every
`brandAssets`-touching caller (R1's `captionsEnabled`, R3's `watermarkUrl`/removal) go through it, not
each write its own ad hoc merge.

## Task Requirement

The UI/UX track's "UI Enhancement 2" document (2026-09-28, addressed to this chat) specifies these as
already-decided product requirements except B7's Gate 1 behavior, which its own text flags as needing a
founder decision. **That decision is now largely resolved by a corrected premise, not a founder pick
between options — re-read R2 in full before touching it, since its scope shrank significantly once the
premise error was found.**

Suggested build order: **R1 (B5) → R3 (B6) → R4 (B10) → R2 (B7) — any order now works for R2 relative to
the others**, since its only real dependency (Bugs Task 6 merging) is now satisfied; it's listed last here
only because that was this release's original planned order, not because it still needs to wait. R5 (B9)
is optional and independent.

---

### R1 (Role: `BE`) — Extend `channels.update`: style guide, voice, captions, budget override

**Current state, confirmed by direct read**: all four are real, already-consumed fields.
`channel.styleGuide` is read in `script-generation/index.ts`'s prompt and threaded into both the
`script_generation` and `script_review` stage inputs (`state-machine.ts`). `channel.defaultVoice` is
resolved in `runScriptGenerationStage`... — correction, more precisely in `runVideoGenerationStage` —
via `resolveVoice({ overrideVoice: run.creationOptions?.voice, channelDefaultVoice: channel.defaultVoice
})` (the same three-step resolution order — explicit per-run override, then channel default, then
`media/registry.ts`'s hardcoded fallback — already established for `visualSource`/`audioLayer`); the
resolved value is what actually reaches `video-generation/index.ts`, not a direct read by that module
itself — a minor precision correction on the UI doc's phrasing, not a different fact.
`brandAssets.captionsEnabled` is read at `video-generation/index.ts` (`captionsEnabled =
params.brandAssets.captionsEnabled !== false`, defaulting `true` when unset). `budgetOverrideUsd` is
read by `budget-gate.ts`'s pool-allocation logic. All four confirmed: real columns, real consumption,
no way to set any of them from the app today.

**Fix**:
1. Extend `channel.repository.ts`'s update/patch function (Task 8/R2's `updateChannel`, assuming it
   landed with a plain partial-patch shape) with `styleGuide?: string | null`, `defaultVoice?: string |
   null`, `budgetOverrideUsd?: string | null` (this column is stored/typed as `string | null` per
   `channel.types.ts` — Prisma `Decimal` represented as a string; confirm `insertChannel`'s own
   number→string conversion as precedent for the input-side `number` → stored-`string` conversion), and
   a `captionsEnabled?: boolean` that goes through the shared `brandAssets` merge helper above, not a
   direct column write.
2. `channels.ts`'s `update` input gains:
   ```ts
   styleGuide: z.string().nullable().optional(),
   defaultVoice: z.enum(TTS_VOICE_KEYS).nullable().optional(),
   captionsEnabled: z.boolean().optional(),
   budgetOverrideUsd: z.number().positive().multipleOf(0.01).nullable().optional(),
   ```
   `null` on `styleGuide`/`defaultVoice`/`budgetOverrideUsd` clears the override (falls back to the
   channel's real default / the pipeline's hardcoded fallback, per each field's own existing resolution
   order) — `undefined`/omitted leaves it unchanged, same optional-vs-null distinction Task 8's R2
   already established for this mutation. Same ownership check and archived-channel rejection Task 8/R2
   already added. Output: same `withHasYoutubeCredential(updated)` `Channel` shape as today, now
   carrying these fields.

**Verify**: update a real channel's `styleGuide`/`defaultVoice`/`captionsEnabled`/`budgetOverrideUsd`
through the mutation; confirm via `channels.get` they round-trip. Drive one real run through
`script_generation` after a `styleGuide` change and confirm the new value appears in that stage's
recorded `input` (direct DB read of the `PipelineStage` row) — the same "does an edit actually reach an
in-flight/future stage" bar Task 8/R2 already established for niche edits. Set `captionsEnabled: false`
on a channel that already has a real `watermarkUrl` set (once R3 exists) and confirm the update doesn't
clear the watermark — the shared design note's own failure mode, proven not to happen.

---

### R2 (Role: `BE`) — Gate 1 / Gate 2 toggles become real

**Current state, confirmed by direct read**: `Channel.approvalGateConfig`
(`{gate1Enabled, gate2Enabled}`, JSON, default both `true`) is stored, mapped, and typed end to end —
and **genuinely never read** anywhere in `state-machine.ts` or `pipeline-runner.ts` (grepped both
directly, zero hits outside the type/repository/schema definitions). Both gates run unconditionally
today regardless of this field's value. This half of the original finding is still exactly right.

**A premise error, found and corrected 2026-09-26 — read this before doing anything else with R2.**
This section originally claimed, based on a direct code read at the time, that no score-threshold
auto-retry loop existed for script review, and framed R2 as a three-way founder decision about whether
to build one from scratch. **That claim has since been proven wrong by a separate, later, independently
confirmed direct code read** (the investigation that produced Bugs Task 6): the auto-retry mechanism
does exist, is live on `main` today, and has since Bugs Task 3/R3 landed. It was almost certainly missed
here because this section's original read happened against a checkout that predated that merge — the
project's own convention of always re-syncing to a fresh `origin/main` before investigating (learned the
hard way during the Bugs track's own Task 4) applies exactly here too, and wasn't followed at the time.

**What's actually real, confirmed** (`studio/src/agents/script-review/index.ts:19-20`,
`state-machine.ts`'s `runScriptReviewStage` ~line 304 onward): `SCRIPT_REVIEW_AUTO_REJECT_THRESHOLD = 7`,
`MAX_SCRIPT_REVIEW_AUTO_RETRY_ATTEMPTS = 3`. A script scoring below 7 loops back to a fresh
`script_generation` attempt, up to 3 times; a script at or above 7 (on any attempt) proceeds to
`paused_gate1`; a script still below 7 after the cap also proceeds to `paused_gate1`, with a note
appended. **Crucially, this entire mechanism runs unconditionally today, regardless of
`approvalGateConfig.gate1Enabled`'s value** — exactly like the rest of that field, it's simply never
read. Separately, **Bugs Task 6** (`docs/execution/bugs/tasks/task6.md`, merged via PR #31 on
2026-09-27) fixed a real gap in this mechanism — the retry loop now feeds the reviewer's notes into the
next generation attempt (`fixNotes`, live-verified) — and a related budget-routing inconsistency
(a retry-attempt budget refusal now routes to `paused_gate1` like the cap-reached case, instead of
`needs_attention`). None of that changes what's described in this paragraph; it makes the existing
mechanism better, not different in shape, and R2 now builds directly on top of it.

**What this means for R2's actual scope — much smaller than originally framed**: the three-way "build
vs. simplify vs. middle ground" decision this section used to pose no longer applies, because Option 1
(build a real retry-with-cap mechanism gating Gate 1) **already exists** — it just isn't wired to the
`gate1Enabled` toggle yet. The real, much narrower question R2 now answers is only: *what should
`gate1Enabled: false` change about a mechanism that already runs the same way for everyone?* The natural
reading, and this doc's recommendation: **when `gate1Enabled` is `false`, a script that reaches or
auto-retries up to a real score of 7 or above should proceed straight to `video_generation` (an
auto-approve `ReviewLog` row, no human pause) instead of `paused_gate1`.** The below-threshold retry
loop itself — including the cap-reached fallback — is unaffected by the toggle either way; it isn't a
"Gate 1" behavior in the sense the toggle means, it's a quality floor that makes sense to keep running
regardless of whether a human also looks at the result. This also means a `gate1Enabled: false` channel
is **not** left without an automated quality backstop before real `video_generation` spend, unlike what
this section previously worried about under "Option 2" — the retry-to-7 floor still applies either way.
State this reading plainly in the report as the chosen design, since it's a real interpretation choice
even if a fairly uncontroversial one — don't treat it as too obvious to record.

**Fix** (revised, much smaller than the original three-option version — Bugs Task 6 has merged, so this
can be built now):
1. `channels.ts`'s `update` input gains `gate1Enabled: z.boolean().optional()`, `gate2Enabled:
   z.boolean().optional()`. **Server-side constraint**: reject setting `gate2Enabled: false` unless the
   channel's (post-patch) `defaultPrivacyStatus === 'private'` — `TRPCError({code: 'BAD_REQUEST',
   message: "Gate 2 can only be disabled when the channel's default privacy is 'private'"})`, per the UI
   doc's own explicit requirement (an auto-published `public`/`unlisted` video with no human check is a
   real risk this constraint exists to prevent).
2. `runScriptReviewStage`: at the existing branch point that currently sends any score-≥-7 outcome (a
   fresh pass, or the cap-reached fallback) to `paused_gate1` — this is the same branch point that, per
   Bugs Task 6, now also resolves `fixNotes` and the budget-routing fix, so build directly on top of that
   code, don't reintroduce a parallel branch — add: when `channel.approvalGateConfig.gate1Enabled
   === false`, write the auto-approve `ReviewLog` row (`agent: 'system', verdict: 'auto-approve'`)
   instead of pausing, and set `currentStage` to advance into `video_generation` directly. The
   below-threshold retry path and the cap-reached-fallback-to-Gate-1 path are both unchanged by this — a
   cap-reached script still goes to `paused_gate1` even with the toggle off, since a human genuinely
   needs to look at it at that point regardless of the toggle's intent.
3. `runVideoReviewStage`'s existing pass branch (`outcome.verdict === 'pass' ? {status: 'paused_gate2',
   ...} : ...`, `state-machine.ts` ~line 864): when `channel.approvalGateConfig.gate2Enabled === false`,
   this branch instead writes the auto-approve `ReviewLog` row and drives the run toward `publishing`
   using the channel's `defaultPrivacyStatus`, rather than pausing. **This part of B7 has no premise
   problem** — video_review already has real score/verdict handling (`MAX_VIDEO_REGEN_ATTEMPTS`); Gate 2
   off is a straightforward branch off an already-real pass/fail outcome, unlike Gate 1's situation
   above ever was.
4. **Inherits a pre-existing structural gap, doesn't fix it**: Task 8/R3 already found
   `pipeline-runner.ts`'s live `runPipelineToNextGate` loop never drives `publishing`/`analytics` — only
   `resume-on-startup.ts`'s restart-driven path does. An auto-approved Gate 2 (this item) will hit the
   exact same gap: setting `currentStage: 'publishing'` on a live run doesn't actually publish it until
   the next process restart, today. State this plainly in the report as an inherited, not newly
   introduced, limitation — worth its own fix (tracked in `KNOWN_ISSUES_AND_BLOCKERS.md`/`sprint3/STATUS.md`
   already) but not this task's to close.

**Verify**: with `gate1Enabled: false` on a real channel, drive one real run whose script reaches ≥7
(first attempt or after a real retry) and confirm it reaches `video_generation` directly — no human ever
resolves `gate1` — and that the `ReviewLog` row exists with `agent: 'system', verdict: 'auto-approve'`.
Separately, drive a real run on that same toggled-off channel that hits the retry cap while still below
7, and confirm it still lands at `paused_gate1` (the toggle does not suppress this path). Attempt to set
`gate2Enabled: false` on a channel whose `defaultPrivacyStatus` isn't `'private'` and confirm a clean
`BAD_REQUEST`. Drive a real run through Gate 2 off on a channel that is `'private'`-default and confirm
the auto-approve `ReviewLog` row and the `currentStage` advance to `publishing` (noting in the report,
per point 4 above, that this last part will need a process restart to actually upload, same as every
other `publishing`-stage run today).

---

### R3 (Role: `BE`) — Watermark upload / remove

**Current state, confirmed by direct read**: `video-generation/index.ts` reads
`params.brandAssets.watermarkUrl` **as a local filesystem path**, fed straight into FFmpeg (`const
watermarkPath = params.brandAssets.watermarkUrl; const hasLocalWatermark = Boolean(watermarkPath &&
fsSync.existsSync(watermarkPath))`, then `-i watermarkPath` in the FFmpeg args when present). There is
no upload mechanism anywhere in this codebase today. `package.json` has `@fastify/cors`/`@fastify/static`
but no multipart/file-upload library. `KNOWN_ISSUES_AND_BLOCKERS.md` §5 independently confirms: "Video
Generation's watermark/brand overlay — wired into the FFmpeg filter graph, untested, since no channel in
the dev DB has `brandAssets.watermarkUrl` set." This task is what first gives that path a real exercise.

**Design choice, not left to the UI doc's silence on transport**: `video-route.ts`
(`GET /runs/:id/video`) already establishes this repo's precedent for binary content — a **plain REST
route**, not a tRPC procedure, specifically because "tRPC's JSON-RPC shape isn't a fit for streaming
file bytes," per that file's own comment. The UI doc doesn't specify transport for the upload; this task
follows the same precedent rather than base64-encoding an image through a tRPC mutation, and reuses the
identical `@fastify/static`-with-`serve: false` + `reply.sendFile()` serving pattern for reading it back.

**Fix**:
1. Add `@fastify/multipart` as a new dependency (none exists today — call this out plainly in the
   report, same as any new-dependency addition).
2. New `studio/src/api/watermark-route.ts`, registered in `server.ts` alongside `registerVideoRoute`,
   covered by the same global `onRequest` auth hook (no exception):
   - `POST /channels/:id/watermark` — multipart form-data, one file field. Reject anything but
     `image/png`/`image/jpeg`, reject over 1MB (`KNOWN_ISSUES_AND_BLOCKERS.md`-style clear error, not a
     generic 500). Ownership-checked the same way `channels.update`/`disconnectYoutube` already are.
     Delete any existing watermark file for this channel first (avoids orphaned files if the extension
     changes between uploads), write the new one to `data/watermarks/<channelId>.<ext>`, and update
     `channel.brandAssets.watermarkUrl` to that **local path** — through the shared `brandAssets` merge
     helper from R1's design note, never a wholesale overwrite. Returns `{ watermarkUrl:
     "/channels/<id>/watermark" }` — the HTTP path the app displays as an `<img src>`, **not** the same
     string stored in the DB (that stays a local fs path for FFmpeg's existing consumption, unchanged).
   - `GET /channels/:id/watermark` — same `sendFile` pattern as `video-route.ts`; 404 if
     `brandAssets.watermarkUrl` is unset or the file is missing.
   - `DELETE /channels/:id/watermark` — ownership-checked, clears `brandAssets.watermarkUrl` (merge
     helper again), deletes the file from disk. Returns `{ success: true }`.
3. **No change needed to `video-generation/index.ts`** — it already gracefully no-ops when
   `watermarkPath` is unset or the file doesn't exist (`hasLocalWatermark` check), so this task's job is
   purely making that field settable/removable for real, not touching its consumption.

**Verify**: upload a real PNG through the new route for a real channel, confirm `channels.get`'s
`brandAssets` (or a dedicated field, implementer's choice) reflects it, and `GET
/channels/:id/watermark` returns the actual image bytes. **Then drive one real pipeline run through
`video_generation` for that exact channel and confirm the rendered output actually has the watermark
overlaid** (`ffprobe`/visual frame check) — this is the "confirm the watermark render path works end to
end" ask from the UI doc, and the first real exercise of a path that's existed, untested, since Sprint 2.
Remove the watermark via `DELETE`, confirm the file is gone and a subsequent render has no overlay.
Attempt an over-size/wrong-mimetype upload and confirm a clean rejection, not a partial write.

---

### R4 (Role: `BE`) — `targetDurationSec` on `runs.create`

**Current state, confirmed by direct read**: `parse-brief.ts` extracts only `{topic, constraints}` — no
duration field, structured or otherwise; any length mention in a brief only ever lands inside the
free-text `constraints` array. `script-generation/index.ts`'s system prompt hardcodes "30-60 seconds"
and `generateScript()` accepts only `{topic, constraints, styleGuide}`. `video-generation/plan.ts` —
read in full — has **zero** consumption of any duration value anywhere (confirmed by direct grep, not
inference); the UI doc's own phrasing ("passed to script generation (and anywhere the plan uses
duration)") is hedged correctly, and the hedge resolves to "nowhere" — the plan naturally adapts to
whatever length the actual synthesized narration produces downstream of script generation, so **this
item's real footprint is confined to `runs.create`'s input, `CreationOptionsSchema`, and
script-generation's own prompt/params** — no `video-generation`/`plan.ts` change needed.

**Fix** (mirrors the exact existing `voice`/`visualSource`/`audioLayer` wiring pattern in
`CreationOptionsSchema`/`runs.ts`/`state-machine.ts` — same three touch points, same edge-validation
posture):
1. `types/pipeline.types.ts`'s `CreationOptionsSchema` gains `targetDurationSec:
   z.union([z.literal(30), z.literal(45), z.literal(60)]).optional()` — its own comment already
   anticipated exactly this ("this task only ever sets `voice`; `visualSource`/`audioLayer` exist here
   now so [later tasks] extend this one object instead of adding parallel `PipelineRun` columns each
   time").
2. `runs.ts`'s `create` input gains the identical `z.union([z.literal(30), z.literal(45),
   z.literal(60)]).optional()` field, validated at the API edge exactly like `voice`/`visualSource`/
   `audioLayer` are today (rejected as a structured tRPC input error if it's not one of the three
   values, never passed through as free text); included in the same `creationOptions` object-assembly
   block alongside the other three.
3. `runScriptGenerationStage` (`state-machine.ts`): add `targetDurationSec:
   run.creationOptions?.targetDurationSec` to `stageInput`, pass it into `generateScript()`'s params.
4. `script-generation/index.ts`: `generateScript()`'s params gain `targetDurationSec?: 30 | 45 | 60`.
   When present, the system prompt/user message state the exact target length explicitly instead of the
   generic "30-60 seconds" range (e.g. "Write this script to run approximately `<N>` seconds when
   narrated aloud" alongside, not replacing, the existing Shorts-format framing); when absent, today's
   unchanged "30-60 seconds" behavior is the fallback — this field is additive, never a behavior change
   for a run that doesn't set it.

**Verify**: create a real run with `targetDurationSec: 45`, confirm it lands in the `PipelineRun.creationOptions`
column (direct DB read) and in `script_generation`'s recorded stage `input`; confirm the actual generated
script's narration length (rough estimate: word count / speaking rate, or a real TTS render's actual
audio duration) lands meaningfully closer to 45s than an unset run's typical output. Create a second run
with no `targetDurationSec` and confirm it's unaffected (today's behavior, unchanged).

---

### R5 (Role: `BE`, optional) — Read-only options query

**Founder decision**: optional — not required (the app type-checks its own lists against `runs.create`'s
input types already), but lets labels/new voices appear without an app release.

**Current state, confirmed by direct read**: `media/registry.ts` exports `TTS_VOICES` (a
`{key: {label}}` object) and `TTS_VOICE_KEYS`. `video-generation/plan.ts` exports `VISUAL_SOURCES`
(`['stock-footage', 'ai-stills']`) and `AUDIO_LAYERS` (`[...MOOD_TAGS, 'none']`, re-exporting
`audio-bed`'s `MOOD_TAGS`). All three already exist as real, exported constants — nothing new to define,
only a query to expose them.

**Fix**: a small new `studio/src/api/routers/options.ts`:
```ts
options: router({
  list: publicProcedure.query(async () => ({
    voices: TTS_VOICE_KEYS.map((key) => ({ key, label: TTS_VOICES[key].label })),
    visualSources: VISUAL_SOURCES,
    moodTags: AUDIO_LAYERS,
  })),
})
```
No input, no auth beyond the existing global hook (this is non-sensitive, tenant-independent static
data). Register alongside `channels`/`runs`/`dashboard` in `router.ts`.

**Verify**: a real call returns all thirteen real voice keys with their real labels, the real two visual
sources, and the real mood-tag list including `'none'`.

---

## Schema Impact

### Tables Modified
None beyond what Task 8 (B1/R1) already migrates — every field this task's R1/R2/R4 touches
(`styleGuide`, `defaultVoice`, `budgetOverrideUsd`, `approvalGateConfig`, `brandAssets`) is an existing
column; R4's `targetDurationSec` lives in `creationOptions`, an existing `Json` column on `PipelineRun`,
not a new one. **No new migration for this task.**

### Reference
`schema.prisma` directly — no per-sprint `SCHEMA.md` exists for this small a change, same posture as
Task 8.

## Business Logic / State Transition

### What this task implements
- `channels.update`'s effective surface grows to cover every setting the new Channel Settings screen
  shows (R1, R2's toggles) plus watermark management (R3, via its own dedicated REST routes rather than
  `channels.update` itself).
- Gate 1/Gate 2 become real per-channel switches (R2) instead of stored-but-inert config. Gate 1's real
  behavior reuses the already-existing auto-retry-to-7 mechanism (Bugs Task 3/R3 + Task 6) and simply
  changes what happens once that mechanism's own outcome is ≥7 while the toggle is off; Gate 2 gets a
  fresh auto-publish-at-`defaultPrivacyStatus` behavior, gated by the same `'private'`-only constraint
  B1/R1 already established the privacy field for.
- `runs.create` gains one more structured, edge-validated creation option (R4), following the exact
  precedent the `voice`/`visualSource`/`audioLayer` fields already set.

### Preconditions
- R1/R2: the channel row exists and the caller passes the same ownership check `channels.update`
  already enforces (Task 8/R2 assumed landed). **R2's `BUGS_TASK6` dependency is satisfied** — merged via
  PR #31, 2026-09-27.
- R3: same ownership check; the channel need not have an existing watermark for upload, must have one
  for `DELETE`/`GET` to return anything but 404/no-op.
- R4: the channel and tenant exist per `runs.create`'s existing checks (Task 8/R3's archived-channel
  guard, if landed, also applies unchanged).

### Postconditions
- R1, after `channels.update` returns: the touched fields reflect the new values; any field omitted
  from the input is unchanged; any field explicitly `null` (where nullable) reverts to that field's own
  documented fallback.
- R2, after a Gate-1-off run's script reaches ≥7 (or a Gate-2-off run's video passes review): a
  `ReviewLog` row exists with `agent: 'system', verdict: 'auto-approve'`, and the run's `currentStage`
  has advanced past the gate that would otherwise have paused it — subject to R2's own point 4 caveat
  for Gate 2 (advancing `currentStage` to `publishing` doesn't itself trigger a live publish, per the
  pre-existing `pipeline-runner.ts` gap). A Gate-1-off run that hits the retry cap while still below 7
  still lands at `paused_gate1`, unaffected by the toggle.
- R3, after a successful upload: `GET /channels/:id/watermark` serves real image bytes, and the next
  `video_generation` run for that channel produces a video with the overlay actually present (not just
  "wired," genuinely verified for the first time).

### Failure Modes & Handling
- R1's `brandAssets` merge: if the shared merge helper (this task's own addition, per the design note)
  is skipped and a caller overwrites the JSON column wholesale, the failure mode is silent data loss (a
  caption toggle clearing a watermark, or vice versa) — not a thrown error, which is exactly why the
  Verify steps above explicitly test the cross-field case rather than trusting code review alone.
- R2 reuses the existing auto-retry mechanism's own already-accepted failure-mode posture (cap breach →
  `paused_gate1`, regardless of the toggle) — no new failure-mode design needed for the retry path
  itself; the only new failure mode R2 introduces is purely the new ≥7-while-toggle-off branch, which has
  no failure mode of its own beyond the existing `ReviewLog`/stage-transition write succeeding or not,
  same as any other stage transition in this file.
- R3's upload route: an oversized or wrong-mimetype file is rejected before any write to disk or the DB
  — never a partial file left behind. A watermark file that gets deleted from disk out-of-band (manual
  cleanup, disk issue) without the DB field being cleared degrades exactly the way it already does today
  (`hasLocalWatermark`'s existing `fsSync.existsSync` check silently skips the overlay) — not a new
  failure mode this task introduces, just inherited from the existing consumption code.

### Reference
No `BUSINESS_LOGIC.md` exists for this ad hoc Sprint 3 follow-on, same posture as Task 8 — this section
is the full reference.

## Testing

```bash
npm run build && npm run lint && npm run typecheck
```

Plus each R-item's own **Verify** section above — R2 and R3 specifically need a real pipeline run
through the affected stage, not just passing type checks (R2: a real Gate-1-off run that reaches ≥7, a
real Gate-1-off run that hits the retry cap, and a real Gate-2-off run; R3: a real render with the
watermark actually visible in the output).

## Report Template

Generate at `docs/execution/sprint3/reports/task9.md`, same shape as `reports/task8.md` — state R2's
final design plainly (the ≥7-while-toggle-off behavior, and that this reuses Bugs Task 3/6's existing
mechanism rather than building a new one), and state R3's watermark-render verification honestly (this
is the first real exercise of a previously untested path — say clearly whether the overlay was actually
visible in the output, not just that the route didn't error).

## Additional Notes

- **R2's premise was corrected 2026-09-26** — this doc originally posed a three-way founder decision that
  no longer applies; the corrected, much narrower design in R2 above is this doc's own recommendation,
  not a menu. Still worth a quick founder confirmation that the ≥7-while-toggle-off reading matches
  intent, since it's a real interpretation choice even if an uncontroversial one — not something to
  silently assume without saying so in the report.
- R1's shared `brandAssets` merge helper is worth building once, correctly, rather than per-field ad hoc
  merging — R3 depends on it existing.
- **R2's `BUGS_TASK6` dependency is cleared** — merged to `main` via PR #31 on 2026-09-27. R2 is ready to
  build now; no further wait needed before starting it.

## Known Issues / Future Improvements
- R2's ≥7-while-toggle-off design still means a `gate2Enabled: false` channel's Gate 2 is a genuine
  on/off switch with no equivalent quality floor (Gate 2 has no analogous "keep retrying below some bar"
  mechanism the way Gate 1 does) — worth noting as an asymmetry between the two gates, not a defect this
  task needs to fix.
- R2 inherits (does not fix) Task 8/R3's already-known `pipeline-runner.ts` live-loop gap — a
  Gate-2-off auto-publish still needs a process restart to actually upload today, same as every other
  publishing-stage run.
- R3's watermark file storage (`data/watermarks/<channelId>.<ext>`) has no cleanup path if a channel is
  later archived (Task 8/R3's `archiveChannel` doesn't touch it) — low priority (an archived channel
  never renders again), but worth a one-line addition to `channels.archive`'s sweep later if disk usage
  ever becomes a real concern.

## Links & References
- [TASK_TEMPLATE.md](../../templates/TASK_TEMPLATE.md)
- `docs/execution/sprint3/STATUS.md`
- [sprint3/tasks/task8.md](task8.md) — Enhancement 1's backend work this task builds on
- [ui-ux/tasks/task2.md](../../ui-ux/tasks/task2.md) — the frontend work this unblocks
- `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md` §5 — the watermark "wired but untested" note this task's
  R3 closes for real
- `docs/execution/bugs/tasks/task6.md` — **R2's dependency, now cleared (merged via PR #31,
  2026-09-27)**: the auto-retry mechanism this task's R2 wires the `gate1Enabled` toggle onto, plus the
  feedback-loop and budget-routing fixes it added to that same code region. Build R2 directly on top of
  this.
- `docs/execution/bugs/tasks/task3.md` — R3, the original build of the auto-retry mechanism itself

## Git Workflow

This task runs on its **own branch**, same posture as Task 8.

1. `git checkout main && git pull` from `D:\Study Material\7AI`.
2. `git checkout -b UIENHANCEMENT2_BE`. Record this exact name in `docs/execution/sprint3/STATUS.md`'s
   new Task 9 row immediately — before the first commit.
3. One commit per R-item: `UIENHANCEMENT2_TASK9_BE_R<X>: [what it does]`. **R2 can now be built and
   committed at any point in this branch's work** — its `BUGS_TASK6` dependency merged to `main` on
   2026-09-27; rebase/pull `main` before starting R2's work regardless, to pick up the merged Bugs Task 6
   code cleanly, same as any other dependency.
4. After R1's first commit is pushed, open the PR as a draft:
   `gh pr create --draft --title "UIENHANCEMENT2_BE: Channel Settings, Watermark, Gate Toggles, Brief Length" --body "Tracking PR for UI Enhancement 2's backend requirements. Live status: docs/execution/sprint3/STATUS.md (Task 9). Do not merge until marked ready for review."`
5. After R2 — this task's last item, per the suggested build order — lands and is pushed, write the
   report and this task's `STATUS.md` row update, commit them together, then `gh pr ready`.
6. **Never push or merge to `main` directly** and **never commit to a branch this task didn't create** —
   same as every other track.
