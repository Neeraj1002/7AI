# Sprint 4 Hardening: Thumbnail 403 — Link to Phone Verification

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** Not a numbered Sprint 4
task (same posture as `sprint3/tasks/hardening-tenant-check.md` (archived, see docs/ARCHIVE_INDEX.md)) — a direct follow-on investigation
closing a real, already-tracked known issue, not new feature scope. Branch: continue on `SPRINT4_BE` if
still open, otherwise a small standalone branch off `main`.

**Objective**: Resolve the real, still-open custom-thumbnail `403` (Sprint 2 Task 5/H1) by testing the
specific, concrete hypothesis that it's blocked on the channel's phone-verification/feature-eligibility
state — not by re-guessing, but by actually completing phone verification and re-testing the real
`thumbnails.set` call. Don't leave this as a vague "known platform gap"; either close it for real or
document precisely why phone verification didn't fix it.
**Duration**: 1-2 hours of engineering + a real founder action in between (phone verification itself
happens in the founder's own Google/YouTube account, outside this codebase).
**Depends On**: none new — reuses Sprint 2 Task 5's existing `setThumbnailViaProvider` code path
untouched; this task is investigation + a founder action + real re-verification, not a rebuild.
**Owning Component**: `studio/src/agents/publishing/youtube-client.ts` (read-only for this task —
no code change expected unless the real re-test reveals a second, distinct bug),
`docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md`.
**Success Criteria**: (1) The real, current hypothesis and the founder action it requires are stated
in one place, replacing the old "most likely a Studio-side feature-eligibility gap" guess with a
concrete, testable next step. (2) After the founder completes phone verification, a real, live re-test
of `thumbnails.set` against a real uploaded video either succeeds (close the issue for real, with
evidence) or fails with a new/different real error (documented precisely, not re-guessed a second
time).

## Task Requirement

### Where this stands today — read before doing anything else

`sprint2/reports/task5.md` (archived, see docs/ARCHIVE_INDEX.md) (H1) already did real, live investigation, not speculation: a real
`thumbnails.set` call against a real uploaded video hit a real, specific `403`:

```json
{"error":{"code":403,"message":"The authenticated user doesn't have permissions to upload and set custom video thumbnails.","errors":[{"reason":"forbidden","domain":"youtube.thumbnail","location":"Authorization","locationType":"header"}]}}
```

That report also found `channels.list?part=status` → `longUploadsStatus: "eligible"` **at the same
moment as the real 403** — meaning the specific API field the task spec originally planned to check as
"proof of phone verification" does *not* actually gate this permission. The report's own conclusion was
that this is "most likely a separate, Studio-side feature-eligibility step (Settings → Channel →
Feature eligibility → Custom thumbnails)" — a real, informed guess, but never actually tested against a
real completed verification, because nothing in that task's scope included actually completing one.

### R29 (new) — Test the phone-verification hypothesis for real, don't re-guess it

**Where**: the gap is specifically that `longUploadsStatus: "eligible"` and YouTube Studio's own
"Feature eligibility" phone-verification state are two different things that don't necessarily move
together — a channel can show one without the other, which is exactly what Sprint 2 Task 5's report
found. Custom thumbnails is one of the features YouTube gates behind a channel-level phone verification
completed through Studio itself (`Settings → Channel → Feature eligibility`), distinct from whatever
`longUploadsStatus` reflects at the API level.

**Fix (founder action, not code)**: the founder checks `youtube.com/verify` (or Studio → Settings →
Channel → Feature eligibility) directly for the channel used in Sprint 2 Task 5's real test, and
completes phone verification there specifically if it shows anything other than fully verified —
distinct from, and not provably satisfied by, whatever `longUploadsStatus: "eligible"` already showed.

**Fix (engineering, after the founder action)**: re-run the exact same real diagnostic Sprint 2 Task
5's report used — upload or reuse a real test video, call `setThumbnailViaProvider` directly against
it, and check YouTube Studio for whether the cover actually changed. Two real outcomes, both handled
explicitly, neither assumed:
- **If it now succeeds**: `KNOWN_ISSUES_AND_BLOCKERS.md`'s H1 entry is closed for real, with the actual
  fix (phone verification, not a code change) stated plainly — `youtube-client.ts`'s own comment
  (currently: "Requires a phone-verified channel — confirmed live... `longUploadsStatus: 'eligible'`")
  gets corrected to name the real gating condition instead of the field that turned out not to be it.
- **If it still fails**: capture the real new error body the same way the original report did (a
  temporary scratch diagnostic, deleted after use — not guessed from documentation) and document it as
  a still-open, now more precisely scoped platform gap — ruling out phone verification specifically
  rather than leaving the cause as an open guess indefinitely.

**Verify**: a real `channels.list?part=status` check, plus a real look at Studio's own Feature
Eligibility page, both captured before the re-test (so the before/after state is on record, not just
"the founder said they did it"). The real `thumbnails.set` re-test's actual HTTP response (success or a
specific new error) is what determines the outcome — never inferred from the Studio UI alone, matching
the original report's own standard of evidence.

## Schema Impact
None.

## Business Logic / State Transition
None — this task touches no pipeline stage logic. `coverFrameSet`'s existing failure-isolation design
(Sprint 2 Task 5) is untouched either way; if the real re-test succeeds, `coverFrameSet: true` simply
starts actually happening instead of being permanently `false`.

## Implementation

### Files to Modify (only if the re-test succeeds or finds a new, distinct error)
- `studio/src/agents/publishing/youtube-client.ts` — correct the comment above
  `YOUTUBE_THUMBNAILS_SET_URL` to name the real gating condition
- `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md` — close or re-scope the H1 entry with real evidence

## Testing
No automated test changes expected — this is a live-credential investigation, same posture Sprint 2
Task 5's own H1/H2 spikes used. If the re-test succeeds, confirm `dry-run.ts publish`'s existing
`coverFrameSet` reporting now shows `true` for a real run, without any code change needed to make that
happen (proving the fix really was external, not something this codebase was also silently blocking).

## Report Template
`docs/execution/sprint4/reports/hardening-thumbnail-phone-verification.md`. State plainly: what the
Feature Eligibility page showed before the founder action, what the founder actually did, and the real
re-test's real result — success or a new, specific error. Do not report this as closed without a real
re-test's evidence, the same discipline Sprint 2 Task 5's own report already modeled.

## Links & References
- `sprint2/tasks/task5.md`, `sprint2/reports/task5.md` (archived, see docs/ARCHIVE_INDEX.md) — H1's original spike, the real 403 body, and
  the `longUploadsStatus`-isn't-the-gate finding this task builds directly on rather than re-investigating
  from scratch.
- `KNOWN_ISSUES_AND_BLOCKERS.md` §1 (H1) — where this item is currently tracked as an open founder
  action; this task is what actually closes or re-scopes it.
- `sprint4/tasks/task5.md` (R18) — a related but distinct upload-time fields gap (made-for-kids/
  category/language), fixed by a real code change rather than a founder action; kept as a separate task
  since the two have different owners (code vs. an external account action) and different verification
  shapes.
