# Week 5 Task 5: Meter Intake Spend, Go Public for Real — Close Out Sprint 1

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.**

**Objective**: Close the two real things standing between here and an honestly-complete Sprint 1:
Intake's unmetered spend (found during Task 4, undermines C2's budget accuracy) and the still-unproven
"genuinely public" step from the original MVP roadmap. Ends with one real, live, public Short.
**Duration**: 3-5 hours (D2 now threads a real per-run privacy choice through Gate 2 → Publishing,
not just a one-line constant flip — plus the live real-time approval wait)
**Depends On**: Week 5 Task 4 (fact-check flagging, fair budget allocation, model-tier cleanup, test
harness) — done.
**Owning Component**: Orchestrator (`run-pipeline/state-machine.ts`), Gate 2
(`agents/gate2/index.ts`), Publishing (`agents/publishing/`)
**Success Criteria**: (1) Every real Intake call writes a real `UsageEvent` row. (2) One real Short
about GPT-6 Astra is live on channel #1's real YouTube account, `privacyStatus: 'public'` confirmed
via the YouTube Data API, captions disabled on that render, both approval gates answered live. Sprint 1
is then genuinely closed — nothing left in `KNOWN_ISSUES_AND_BLOCKERS.md` §1/§3 blocks calling it done.

## Task Requirement

### D1 — Meter Intake's real spend
**Where**: found during Task 4's C1 verification — `runIntakeStage` (`run-pipeline/state-machine.ts`)
calls `callLLM({purpose: 'intake-parsing', ...})` but never calls `insertUsageEvent`, unlike every
other stage since Week 1. Real Anthropic spend from every Intake call across all five weeks has never
been recorded — which also means C2's pool-total check (`sumUsageCostForTenantPlatform`) has always
undercounted real spend by that amount, undermining the very budget-fairness work Task 4 just built.
**Fix**: add the `insertUsageEvent` call to `runIntakeStage`, mirroring the exact pattern already used
by every other stage (check `runScriptGenerationStage`/`runScriptReviewStage` for the reference shape —
provider/model from the `LLMResponse`, real token counts, `agent: 'intake'`).
**Verify**: a real Intake call (`dry-run.ts` or a fresh brief through the real orchestrator) now
produces a real `UsageEvent` row with the actual model/token counts/cost — confirm by querying it
directly, not just by code review.

### D2 — Privacy becomes a real per-run choice at Gate 2, then run one genuinely public test
**Founder direction (2026-09-14), supersedes the original plan**: privacy status should not be a
constant someone edits in source and flips back — it's a real choice the founder makes each time a
video is approved, exactly like Gate 1's approve/edit/reject choice. `agents/publishing/types.ts`'s
`PRIVACY_STATUS` constant (with its own comment anticipating a manual one-line flip) is being replaced
by a real field threaded from Gate 2's reply, not a temporary code edit.

**Where**: `agents/gate2/index.ts` (`Gate2Outcome`, `parseGate2Reply`, `formatGate2Message`,
`requestGate2Decision`), `agents/publishing/types.ts` (`UploadParams`/`UploadResult`),
`agents/publishing/youtube-client.ts` (`uploadVideoViaProvider`), `agents/publishing/stub.ts`
(`stubUploadVideo`), `agents/publishing/index.ts` (`uploadVideo`), `run-pipeline/state-machine.ts`
(`runGate2Stage`/`runPublishingStage`).

**Fix**:
1. `PublishingMetadataSchema`'s sibling — add a `PrivacyStatusSchema = z.enum(['private', 'unlisted',
   'public'])` (or similar) to `publishing/types.ts`; `UploadParams` gains a real `privacyStatus`
   field (no longer importing a constant). Keep a `DEFAULT_PRIVACY_STATUS = 'private'` export for the
   case below — the safe default stays private, it just stops being the *only* option.
2. `Gate2Outcome`'s `approve` variant gains an optional `privacyStatus` field. `parseGate2Reply`
   recognizes `"approve public"`, `"approve unlisted"`, and `"approve private"` (case-insensitive,
   same exact-match discipline as the rest of Gate 1/2's parsing — no fuzzy matching), falling back to
   `DEFAULT_PRIVACY_STATUS` on a bare `"approve"` so existing behavior for every prior, unspecified
   reply is unchanged.
3. `formatGate2Message`'s reply-options line updated to spell out all four: `Reply "approve" (private
   by default), "approve public", "approve unlisted", "reject <reason>", or send revision notes.`
4. `runGate2Stage`/`runPublishingStage` thread the chosen `privacyStatus` from the `Gate2Outcome` down
   into `uploadVideo({ ..., privacyStatus })` — real value, not the old constant. Log the chosen
   `ReviewLog.editedOutput` as `{ privacyStatus }` when it's anything other than the default, mirroring
   how Gate 1's edited-script choice is already recorded — the audit trail should show not just
   approve/reject but *what* was approved.
5. `stubUploadVideo` (stub.ts) and `uploadVideoViaProvider` (youtube-client.ts) both honor the real
   `params.privacyStatus` instead of a hardcoded constant, so `YOUTUBE_STUB=1` testing stays realistic.

**The real test — a Short about OpenAI's GPT-6 Astra release**, real and current (released
2026-09-03, drawing both "possible AGI" framing and real safety scrutiny — genuinely good, current
Shorts material). Submit this brief through the real orchestrator (not a stub run):

> "OpenAI just released GPT-6 Astra, their most capable model yet — some are calling it a real step
> toward AGI, but it's already facing real safety scrutiny, including a safety guarantee that
> reportedly broke down in public within days of launch. Make a Short explaining what Astra actually
> is, why people are excited, and why others are worried."

**Before submitting**: set the test channel's `brandAssets.captionsEnabled = false` for this run only
(direct DB update or a quick one-off script, founder's call which is lighter) — B5 (Task 2) already
makes this a real, working toggle. No privacy pre-flip needed anymore — that's the whole point of D2.

**Run it for real**: submit the brief, answer Gate 1 live, and at Gate 2 reply **`approve public`** —
the new real mechanism, not a source-code edit. Actually look at the video before approving; this is
the first run where the reply itself makes something genuinely, publicly visible, not a
private/harmless test artifact like every prior one.

**After**: restore `captionsEnabled` (unset or `true`) on the test channel — same "restore after"
discipline `scripts/set-budget-ceiling.ts` documents for its own one-off flips. Nothing to restore on
the privacy side — a bare `"approve"` already defaults back to private for every future run
automatically, which is the actual benefit of making this a real per-run choice instead of a global flip.

**Verify**: (1) `parseGate2Reply` unit tests (add to the `vitest` suite Task 4 stood up) for
`"approve"` → default private, `"approve public"` → public, `"approve unlisted"` → unlisted, and that
`"approved public"`/other near-misses still fall through to `revise` rather than false-matching. (2)
The resulting `youtubeVideoId` confirmed via a direct YouTube Data API call showing `privacyStatus:
'public'` (same direct-API-check discipline Task 1 used for `'private'`) — not inferred from the DB
row. (3) Confirm the rendered video has no burned-in captions (extract a frame, same technique Task 2
used for B5's verification). (4) A second, separate real or fixture run approved with a bare
`"approve"` still publishes `private` — proving the default didn't quietly change.

**A real, deliberate caution, not boilerplate**: this creates one real, publicly visible, searchable
YouTube video on the founder's real channel — genuinely different from every prior test, which stayed
private/harmless by design. Worth being comfortable with the actual title/description/content before
sending `approve public`, not just mechanically clicking through gates like the stub tests.

### Explicitly not in this task
Channel #2/#3 expansion — deliberately deferred to Sprint 3 per `docs/roadmap/SPRINT_ROADMAP.md`
(multi-channel becomes central there anyway); not an oversight here.

### Documentation reconciliation
- `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md`: close D1 (§3's Intake-metering entry) and D2 (the
  remaining public-test framing); §1 should already show nothing founder-blocking — confirm it still
  does.
- `docs/execution/week5/SCHEMA.md`/`BUSINESS_LOGIC.md`: D1 needs no schema change (existing
  `UsageEvent` table, existing insert pattern). D2 needs no schema change either (`ReviewLog.editedOutput`
  is an existing `Json?` column) — document the new Gate 2 reply grammar (`approve public`/`approve
  unlisted`) and the `Gate2Outcome`/`UploadParams` type changes as a real business-logic delta.
- `docs/execution/week5/STATUS.md`: add Task 5's row, and mark Sprint 1 closed in the week's own
  status line.
- Write `docs/execution/week5/reports/week5-summary.md` — the same optional narrative close-out every
  prior week wrote (Week 1/2/3's own reports), now genuinely warranted as the actual end of Sprint 1:
  what the five tasks added up to, the real public video's link, and what's next
  (`docs/roadmap/SPRINT_ROADMAP.md` Sprint 2).

## Testing
```bash
npm run build && npm run lint && npm run typecheck && npm test
```
Plus D1/D2's real, live verification above — no automated test substitutes for D2's live gate
approvals and the real YouTube API check.

## Report Template
`execution/week5/reports/task5.md`, standard shape. For D1/D2: what was actually done, how verified
(including the real `youtubeVideoId` and confirmation of the public video), deviations with reasoning.
