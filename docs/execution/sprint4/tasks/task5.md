# Sprint 4 Task 5: Packaging From Profile — Title/Description/Hashtags + Editor & Source Credit + Upload Compliance Fields + Repeat-Topic Warning

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** Branch: `SPRINT4_BE`.

**Objective**: Let a channel's resolved packaging preferences (title guidance, a description template,
a base hashtag set, real `{editor}`/`{sources}` credit, and explicit upload-time
audience/category/language fields) actually shape both Metadata Generation's output and the real
`videos.insert` call, and add a non-blocking heads-up at Gate 1 when a new brief looks like a topic the
channel already covered recently.
**Duration**: 6-8 hours (was 4-6 when `{editor}`/`{sources}` were still deferred and upload-compliance
fields weren't in scope at all — now includes wiring real credit data into `generatePublishingMetadata`
and threading three new fields straight into `uploadVideoViaProvider`, on top of the original scope).
**Depends On**: Sprint 4 Task 1 (`resolveChannelConfig`, including R18's `selfDeclaredMadeForKids`/
`categoryId`/`defaultLanguage`); Sprint 4 Task 2 (`formatGateMessage`'s already-extended shape — this
task adds one more optional line to the same function, not a second, competing change to it);
**Sprint 4 Task 4 (`ReviewLog.approvedByUserId`, `findGate1ApproverForRun`)** — the real data source for
`{editor}`, built specifically so this task doesn't have to defer it.
**Owning Component**: `studio/src/agents/publishing/` (`index.ts`, `youtube-client.ts`, `types.ts`),
`studio/src/agents/gate1/`, `studio/src/run-pipeline/`,
`studio/src/models/repositories/pipeline-run.repository.ts`.
**Success Criteria**: (1) A profile's `packaging.titleGuidance`/`descriptionTemplate`/`hashtagsBase`
measurably shapes a real Metadata Generation call's output. (2) A real run's real Gate 1 approver's name
(or email, if no name is set) is available to `{editor}` in a real `descriptionTemplate`, sourced from
Task 4's real `ReviewLog.approvedByUserId` — not a placeholder, not faked. (3) A real upload's real
`videos.insert` request body explicitly carries `status.selfDeclaredMadeForKids`, and
`snippet.categoryId`/`snippet.defaultLanguage` whenever the profile sets them — confirmed by inspecting
the real request body, not just trusting the field was threaded through. (4) A channel with no profile
produces title/description/tags/upload-fields indistinguishable in approach from today's output (except
`selfDeclaredMadeForKids`, which is now always explicitly `false` rather than omitted — a deliberate,
documented behavior change, not a regression). (5) Submitting a brief whose topic clearly overlaps a
real recent run on the same channel produces a visible, non-blocking note at Gate 1; submitting a
genuinely new topic does not.

## Task Requirement

### R17 — Packaging from the profile, including real `{editor}`/`{sources}` credit

**Where**: `agents/publishing/index.ts`'s `generatePublishingMetadata` — currently takes only
`{scriptText, hashtags}`; its `SYSTEM_PROMPT` has no channel-specific input at all today (confirmed by
reading the current file). Separately, `types/review-log.types.ts` had no approving-user field until
Task 4 built it — this task is what actually consumes that field, rather than the credit line being
deferred a second time now that its dependency is real.

**Fix**: `generatePublishingMetadata` gains optional params `titleGuidance?: string`,
`descriptionTemplate?: string`, `hashtagsBase?: string[]`, `editorName?: string`, `sources?: string[]`
(the last two are new relative to this task's original scope — see below). When present,
`titleGuidance`/`descriptionTemplate` are appended to the user message (`callLLM`'s `messages`) as
additional instructions the LLM should follow (`"Title guidance: ..."`, `"Use this description
template, filling in the brackets: ..."`), and `hashtagsBase` is unioned with the script's own
`hashtags` before being sent to the model as available tags to draw from (never silently dropped, never
force-included if irrelevant — the model still picks what actually fits, same posture the existing
prompt already takes toward the script's own hashtags). `descriptionTemplate` supports four literal
placeholders the prompt instructs the model to fill in with real content: `{summary}`, `{hashtags}`, and
now `{editor}`/`{sources}`:

- **`{editor}`**: resolved by the caller (`state-machine.ts`'s `runPublishingStage`, before calling
  `generatePublishingMetadata`) via Task 4's `findGate1ApproverForRun(runId)` — `user.name ?? user.email`
  when a real approver is found, or the literal string `"the team"` when `findGate1ApproverForRun`
  returns `null` (the ops-path/dry-run case — a real, handled fallback, not an error). Passed as
  `editorName`, substituted into the template the same literal-placeholder way `{summary}`/`{hashtags}`
  already work — not a second templating engine.
- **`{sources}`**: resolved from `creationOptions.sources` (Task 2's field) when present — joined into a
  short readable list (e.g. `"Sources: A, B, C"`); when no sources were provided for the run, `{sources}`
  resolves to an empty string (the placeholder is simply removed, not left as literal `{sources}` text in
  the published description) rather than treated as a template error.

Both are real now, not placeholders faked with a static string — sourced from Task 4's real
`ReviewLog.approvedByUserId` plumbing and Task 2's real `sources[]` field respectively, which is the
entire reason Task 4 was built first instead of deferring this alongside it.

**Verify**: a profile with `titleGuidance: "always end with a question mark"` and
`hashtagsBase: ["#historyshorts"]` → a real `generatePublishingMetadata` call reliably (check several
real calls, not one) produces a title ending in "?" and includes `#historyshorts` when it fits. A
profile-less channel's real metadata call is unaffected — same prompt, same behavior as before this
task. A real run approved at Gate 1 by a real signed-in user with `descriptionTemplate: "...edited by
{editor}..."` → the published description contains that real user's real name (or email) — confirmed by
a direct Postgres cross-check against the `ReviewLog` row Task 4 produced for that same run, not just
eyeballing the output. A run resolved via the ops path → `{editor}` resolves to `"the team"`, not a
crash and not a blank. A run with real `sources` in `creationOptions` and a template using `{sources}` →
they appear in the output; a run with none → `{sources}` cleanly disappears, no literal placeholder text
leaks through.

### R18 (new) — Explicit upload-time `madeForKids`/`categoryId`/`defaultLanguage`, not channel defaults

**Where**: `youtube-client.ts`'s `uploadVideoViaProvider` builds the real `videos.insert` request's
`metadataPart` with `snippet: { title, description, tags }` and `status: { privacyStatus,
containsSyntheticMedia }` only — confirmed by reading the current file. Neither
`status.selfDeclaredMadeForKids` nor `snippet.categoryId`/`snippet.defaultLanguage` is ever sent, so
every real upload today silently relies on whatever YouTube/the channel's own Studio-level defaults
happen to be — a real, unaudited gap once several channels with different audiences/languages exist,
not something either the code or a report has ever explicitly verified is correct per channel.

**Fix**: `UploadParams` (`agents/publishing/types.ts`) gains `selfDeclaredMadeForKids: boolean`
(required, not optional — Task 1's resolver already guarantees a concrete `false` default, so there's
never a legitimate "unset" value by the time this reaches the upload call) and `categoryId?: string`,
`defaultLanguage?: string` (both optional — genuinely fine to omit when a profile doesn't set them,
unlike the made-for-kids flag). `uploadVideoViaProvider`'s `metadataPart` becomes:

```typescript
const metadataPart = {
  snippet: {
    title: params.metadata.title,
    description: params.metadata.description,
    tags: params.metadata.tags,
    ...(params.categoryId && { categoryId: params.categoryId }),
    ...(params.defaultLanguage && { defaultLanguage: params.defaultLanguage }),
  },
  status: {
    privacyStatus: params.privacyStatus,
    containsSyntheticMedia: params.containsSyntheticMedia,
    selfDeclaredMadeForKids: params.selfDeclaredMadeForKids,
  },
};
```

`state-machine.ts`'s `runPublishingStage` resolves all three from Task 1's `resolveChannelConfig`
(`selfDeclaredMadeForKids`, `categoryId`, `defaultLanguage` — already on `ResolvedChannelConfig` per
Task 1's R18) and passes them into the `UploadParams` object alongside the existing
`privacyStatus`/`containsSyntheticMedia`. `UploadResult` echoes `selfDeclaredMadeForKids` back (same
"the audit trail shows not just intent but what was actually sent" pattern `containsSyntheticMedia`
already established) — stored in the `publishing` stage's own output.

**Verify**: a real upload for a channel with no profile → the real request body sent to
`videos.insert` (capture it the same way Sprint 2 Task 5's own report captured the real 403 body — a
temporary scratch diagnostic, or logging the request just before `client.request()`, removed after use)
shows `status.selfDeclaredMadeForKids: false` explicitly present, and no `categoryId`/`defaultLanguage`
keys at all (omitted, not sent as empty strings). A real upload for a channel whose profile sets
`categoryId: "27"` (Education) and `defaultLanguage: "en"` → both appear correctly in the real request
body, confirmed the same way. A direct read of the resulting `publishing` stage's `output` shows
`selfDeclaredMadeForKids` recorded truthfully either way.

## Schema Impact
No schema changes in this task itself (Task 4 already made the one schema change R17 needed; R18 needs
none — `selfDeclaredMadeForKids`/`categoryId`/`defaultLanguage` live in the existing profile `Json`
column via Task 1's schema, and pass through `UploadParams`/`PipelineStage.output` the same
already-Json-typed way `privacyStatus`/`containsSyntheticMedia` do).

### R20 — Repeat-topic warning (non-blocking)

**Where**: no existing check compares a new brief's topic against a channel's own history at all.

**Fix**: after Intake produces `intakeParsed.topic` (existing stage, unchanged), a new pure function
`findLikelyRepeatTopic(newTopic: string, recentTopics: Array<{ runId: string; topic: string; createdAt: Date }>): { runId: string; topic: string; createdAt: Date } | null`
(new file, `run-pipeline/repeat-topic.ts`) does a simple, deliberately unsophisticated
case-insensitive token-overlap check (e.g. normalize both to a lowercased word set, flag a match when
overlap exceeds a fixed threshold — no new dependency, no embedding/similarity service). Called from
`state-machine.ts` right after Intake completes, against the channel's last 20 completed/running runs
(a new `listRecentRunTopicsForChannel(channelId, limit)` repository function —
`pipeline-run.repository.ts`, a narrow query: `id`, `intakeParsed->>'topic'`, `createdAt`, excluding the
current run). A match is **never blocking** — it's threaded into `formatGateMessage` (Task 2's already-
extended version) as one more optional line:

```
Possible repeat topic: this looks similar to a run from ${date} ("${topic}") — not blocked, just flagged.
```

Omitted entirely when no likely repeat is found — same "message only gains lines when there's something
to say" rule Task 2 established.

**Verify**: two real runs on the same channel with genuinely overlapping topics (e.g. "the fall of the
Roman Empire" and "why the Roman Empire fell") → the second run's Gate 1 message shows the warning. Two
runs with genuinely unrelated topics → no warning on either. A profile-less channel behaves identically
to a channel with a profile for this check — it's not profile-gated at all, every channel gets it (a
genuinely useful default, not something that needs opting into).

## Business Logic / State Transition
No new transitions. The repeat-topic check runs as a side query after Intake's existing
`running → completed` transition, purely additive to what Gate 1's message shows — it cannot fail the
Intake stage itself (a query error here logs and is treated as "no warning found," never propagated to
fail the run over what is explicitly a non-blocking nicety). `runPublishingStage`'s resolution of
`{editor}`/`{sources}` similarly cannot fail metadata generation — a `findGate1ApproverForRun` query
error is caught, logged, and treated as `null` (falls back to `"the team"`), never blocks a real
publish. R18's fields never fail the upload either — they're pure resolved-config values with
guaranteed fallbacks (Task 1's resolver), never a network call of their own.

### Failure Modes & Handling
`findLikelyRepeatTopic`'s own query failure (a real DB error, not a "no match found") is caught and
logged at the call site, treated as `null` (no warning) — this check must never be why a real run fails.
Same posture for `findGate1ApproverForRun`'s query failure in the packaging path.

## Implementation

### Files to Create
- `studio/src/run-pipeline/repeat-topic.ts` — `findLikelyRepeatTopic`
- `studio/src/run-pipeline/repeat-topic.test.ts`

### Files to Modify
- `studio/src/agents/publishing/index.ts` — R17, including `editorName`/`sources` params on
  `generatePublishingMetadata`
- `studio/src/agents/publishing/types.ts` — R18: `UploadParams` gains `selfDeclaredMadeForKids`
  (required)/`categoryId`/`defaultLanguage` (optional); `UploadResult` echoes `selfDeclaredMadeForKids`
- `studio/src/agents/publishing/youtube-client.ts` — R18: `uploadVideoViaProvider`'s `metadataPart`
- `studio/src/agents/gate1/index.ts` — R20 (one more optional `formatGateMessage` param, alongside
  Task 2's)
- `studio/src/run-pipeline/state-machine.ts` — call the repeat-topic check after Intake; resolve
  `{editor}` via Task 4's `findGate1ApproverForRun` and `{sources}` via `creationOptions.sources` before
  calling `generatePublishingMetadata`; resolve R18's three fields via `resolveChannelConfig` before
  building `UploadParams` in `runPublishingStage`
- `studio/src/models/repositories/pipeline-run.repository.ts` — `listRecentRunTopicsForChannel`

## Testing

```bash
npm run build && npm run lint && npx tsc --noEmit
npx vitest run repeat-topic publishing gate1
```

### How to Verify
1. `repeat-topic.test.ts`'s overlap-threshold cases (a clear match, a clear non-match, an edge case near
   the threshold — document what the threshold actually is and why).
2. Real end-to-end: the two-similar-topics / two-different-topics runs above.
3. Real end-to-end: a profiled channel's metadata call vs. a profile-less channel's, confirming R17's
   scoped behavior.
4. Real end-to-end: a run approved by a real signed-in user, with `{editor}`/`{sources}` in the
   description template, cross-checked against Task 4's `ReviewLog.approvedByUserId` row via Postgres.
5. Real end-to-end: R18's Verify above — a real captured `videos.insert` request body, for both a
   profile-less channel and a channel with `categoryId`/`defaultLanguage` set.

## Report Template
`docs/execution/sprint4/reports/task5.md`. State the repeat-topic overlap threshold chosen and why,
confirm `{editor}`/`{sources}` shipped for real (not deferred, linking back to Task 4's report as the
dependency that made this possible), and state plainly that `selfDeclaredMadeForKids` is now always
explicitly sent (a real, deliberate behavior change from "never sent" — call this out, don't let it read
as an incidental side effect).

## Links & References
- `sprint4/tasks/task1.md` — the resolver (including R18's three new resolved fields) and
  `ChannelProfilePackagingSchema` this task extends.
- `sprint4/tasks/task2.md` — `formatGateMessage` shape this task extends for R20.
- `sprint4/tasks/task4.md` — `ReviewLog.approvedByUserId`/`findGate1ApproverForRun`, the real data
  source for `{editor}` this task consumes rather than deferring.
- `sprint4/tasks/hardening-thumbnail-phone-verification.md` — a related but distinct real upload-side
  gap (custom-thumbnail 403), tracked as its own task rather than folded in here since it's an
  investigation/founder-action item, not a code change to packaging fields.
