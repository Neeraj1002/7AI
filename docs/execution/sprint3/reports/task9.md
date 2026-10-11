# Sprint 3 Task 9: UI Enhancement 2 — Backend Requirements (Channel Settings, Watermark Upload, Gate Toggles, Brief Length)

**Date**: 2026-09-27
**Status**: Complete — all five R-items done, live-verified, pushed.
**Branch**: `UIENHANCEMENT2_BE` (own branch off `main`; PR #32)
**Commits**: `..._R1`, `..._R3`, `..._R4`, `..._R5`, a STATUS update, a merge of `main` (post-`BUGS_TASK6`), and this
report/R2 commit.
**Tests**: build, lint, typecheck clean; `npx vitest run` — 18 files / 108 tests passing throughout. No new unit
tests added (this task's own verification is real, live, against a sandbox/dev DB — see below, per this task's own
established posture).

## What was built, per R-item

**R1 — Extend `channels.update`.** `styleGuide`/`defaultVoice`/`captionsEnabled`/`budgetOverrideUsd` added to the
mutation input and `ChannelPatch`; `captionsEnabled` routes through a new shared `updateChannelBrandAssets`
read-merge-write helper (never a direct `brandAssets` column write) so it can never clobber R3's `watermarkUrl` in
the same JSON column. Live-verified: round-trip via update+get; a real `script_generation` stage's recorded input
reflects a `styleGuide` edit; toggling `captionsEnabled:false` on a channel with a real `watermarkUrl` left the
watermark untouched.

**R3 — Watermark upload/serve/remove.** New `@fastify/multipart` dependency; new `watermark-route.ts` (REST, not
tRPC — binary content doesn't fit tRPC's JSON-RPC shape, same reasoning as the existing `video-route.ts`), registered
under the normal auth hook. `POST /channels/:id/watermark` (one file, png/jpeg, ≤1MB): ownership check, replaces any
existing file, writes to `data/watermarks/<channelId>.<ext>`, sets `brandAssets.watermarkUrl` via the merge helper.
`GET` serves it (404 if unset/missing); `DELETE` clears the JSON key and deletes the file. Live-verified end-to-end,
not just "the route didn't error": a real PNG uploaded, served back byte-for-byte, rendered into a real
`video_generation` run for that channel, and confirmed **actually visible** via raw-pixel inspection (cropped the
watermark region to raw RGB via ffmpeg, read the bytes directly — near-pure red, matching the test PNG) — then
`DELETE`d, and a second render confirmed the overlay was genuinely gone (natural, non-red pixel values in the same
region). Oversize/wrong-type uploads rejected cleanly with no partial write.

**R4 — `targetDurationSec` on `runs.create`.** `CreationOptionsSchema` and `runs.create`'s input both gained
`30 | 45 | 60` (optional); threaded into `script_generation`'s `stageInput` and `generateScript()`. **Found during
live verification, not assumed**: a bare "approximately N seconds" prompt hint did not reliably move the model —
three real 45s-targeted runs landed at 55-80s estimated narration, no closer to 45s than an unset control. Fixed by
also stating the equivalent word count in the prompt (`~150 words/minute`, the same rate `media/stub.ts`'s own
duration estimate already assumes) — re-verified across two more 45s-targeted runs (45.2s each) and one 30s-targeted
run (30.4s), confirming the fix generalizes rather than being a one-off.

**R5 (optional) — read-only `options.list` query.** `{ voices: [{key,label}], visualSources, moodTags }` from the
existing `TTS_VOICES`/`VISUAL_SOURCES`/`AUDIO_LAYERS` exports, no input, no extra auth. Live-verified: a real call
returned all 13 voices with labels, 2 visual sources, mood tags including `'none'`.

**R2 — Gate 1/Gate 2 toggles.** Was deliberately deferred pending `BUGS_TASK6` (PR #31) merging to `main` first, per
this task's own explicit instruction — confirmed merged (`9dd7ad6`) before this work started, and `main` was merged
into `UIENHANCEMENT2_BE` (real merge commit, not a rebase/squash) before R2's implementation began, resolving two
small conflicts in `script-generation/index.ts` and `state-machine.ts` (both additive — R4's `targetDurationSec` and
Bugs Task 6's `fixNotes`, combined rather than either side dropped).

`Channel.approvalGateConfig` (an existing JSON column, `{gate1Enabled, gate2Enabled}`, both defaulting `true`, that
nothing previously read or wrote) now has a real write path: `channels.update` gains `gate1Enabled`/`gate2Enabled`
booleans, routed through a new `updateChannelApprovalGateConfig` read-merge-write helper (same reasoning as R1's
`brandAssets` helper — two independently-settable keys, never clobber one while setting the other).
**Invariant**: `gate2Enabled:false` requires `defaultPrivacyStatus === 'private'` — checked against the *effective*
value of each (whichever this call is actually changing, else the channel's current value), so this catches both a
direct attempt to disable Gate 2 on a non-private channel **and** a later attempt to change `defaultPrivacyStatus`
away from `'private'` while Gate 2 is already disabled from an earlier call. Both rejected with a clean `BAD_REQUEST`.

`runScriptReviewStage`'s existing score-branch point (Bugs Task 3/R3's ≥7 auto-reject threshold, extended by
`BUGS_TASK6` with retry feedback) gains a `gate1AutoApprove` case: **only** the passing-score outcome is affected —
the below-threshold retry loop and the auto-retry-cap-reached-to-Gate-1 fallback are untouched, exactly as specified.
When gate1 is disabled and the score passes, a synthetic `gate1` stage row is created and completed with the same
`{outcome:'approve', sanctionedScriptText}` shape `runGate1Stage`'s own human-approve path writes (so nothing
downstream — `runVideoReviewStage`, `runPublishingStage` — can tell an auto-approve apart from a human one), plus a
separate `ReviewLog` row (`agent:'system', verdict:'auto-approve'`) distinct from the score-verdict row, so the run's
history plainly shows Gate 1 was skipped rather than silently absent. `runVideoReviewStage` gets the exact symmetric
treatment for Gate 2 (a `gate2AutoApprove` case on a passing verdict only; synthetic `gate2` row with
`{outcome:'approve', privacyStatus: channel.defaultPrivacyStatus}`; same separate `system`/`auto-approve` `ReviewLog`
row) — inheriting, not fixing, `pipeline-runner.ts`'s pre-existing gap that a live run's `currentStage:'publishing'`
still needs a process restart to actually upload (documented already; out of this task's scope).

### R2 live verification

Real script-review/video-review scoring is non-deterministic (real LLM calls), so forcing the retry-cap and
pass/fail branches needed deterministic control — same posture `BUGS_TASK6`'s own R1 verification used: an isolated
sandbox Postgres database (`sevenai_uienh2_r2_sandbox`, created, migrated with all 16 real migrations, and dropped
after use — never the shared dev DB), with `reviewScript`/`reviewVideo` mocked via `vitest`'s `vi.mock` (real
`callLLM`/`generateScript`/`runVideoGenerationStage` calls were **not** mocked — the code under test is the real
state-machine branching logic, driven by a controlled score/verdict, not a faked pipeline). A first attempt at this
same mocking via a plain `tsx` script (property-reassignment on the required module) turned out to be silently inert
— this project's esbuild/tsx toolchain copies a required CommonJS module's exports onto a fresh object for both
`import()` and, it turns out, even a same-path `require()` from a `.ts` entry script, so mutating that copy never
reached `state-machine.ts`'s own module reference. `vitest`'s real module graph doesn't have this problem — confirmed
by the mock's own call counter actually incrementing.

Real results, one single passing test run:
```
[check] gate2Enabled:false on a public-default channel -> BAD_REQUEST: confirmed
[check] gate1Enabled:false + gate2Enabled:false on a private-default channel -> succeeds: confirmed
[check] changing defaultPrivacyStatus away from 'private' while gate2Enabled is already false -> BAD_REQUEST: confirmed
[Gate1 A] status/currentStage: running/video_generation; gate1 row: completed, output={"outcome":"approve", ...};
  ReviewLogs: script-review:9, system:auto-approve; mock calls: 1
[Gate1 B] status/currentStage: paused_gate1/gate1; gate1 row: none; mock calls: 4
[Gate2] status/currentStage: running/publishing; gate2 row: completed, output={"outcome":"approve","privacyStatus":"private"};
  ReviewLogs: video-intelligence-own-draft:pass, system:auto-approve
```
- Gate 1 Check A: a real script-generation call, reviewScript mocked to a passing score (9) — gate1 fully skipped,
  run advanced straight to `video_generation`, synthetic gate1 row completed with `outcome:'approve'`, a real
  sanctioned script text, and the `system:auto-approve` ReviewLog present.
- Gate 1 Check B: reviewScript mocked to a below-threshold score (3) on every call — confirmed exactly 4 calls (1 +
  `MAX_SCRIPT_REVIEW_AUTO_RETRY_ATTEMPTS`), landing at `paused_gate1`/`gate1` with **no** gate1 row auto-created —
  the toggle has zero effect on the cap-reached fallback, as specified.
- Gate 2 Check: a real (stub-media) `video_generation` stage, `reviewVideo` mocked to a passing verdict — gate2
  fully skipped, run advanced to `publishing`, synthetic gate2 row completed with `outcome:'approve'` and
  `privacyStatus:'private'` (the channel's own default), `system:auto-approve` ReviewLog present.
- The two `channels.update` `BAD_REQUEST` cases (direct `gate2Enabled:false` on a public-default channel, and
  changing `defaultPrivacyStatus` away from `'private'` while `gate2Enabled` is already `false`) both confirmed.

All temporary test/script files used for this were deleted before committing (none of this branch's commits include
throwaway test code), and the sandbox database was dropped afterward.

## Schema Impact
None. `Channel.approvalGateConfig` already existed (added by an earlier migration, `{gate1Enabled: true, gate2Enabled:
true}` default) but nothing previously read or wrote it — R2 is the first real reader/writer, no new column.

## Known Issues / Out of Scope
- Inherits `pipeline-runner.ts`'s pre-existing "a live run reaching `currentStage:'publishing'` needs a process
  restart to actually upload" gap for both the human-approved and auto-approved paths alike — not this task's scope,
  already tracked in `KNOWN_ISSUES_AND_BLOCKERS.md`.
- R3's watermark file storage is local filesystem (`data/watermarks/`), same posture as the existing video output
  storage — no object-storage migration in this task's scope.

## Test Results
```
studio/: build PASS, lint PASS, typecheck PASS, npm test — 18 files / 108 tests passing
```
Live verification narratives (R1/R3/R4/R2) reproduced above and in the branch's own commit messages.

## Sign-Off
- R1/R3/R4/R5/R2: all complete, live-verified, pushed to `UIENHANCEMENT2_BE`.
- Ready for Integration: yes — PR #32 moved out of draft with this report.

## Links & References
- `docs/execution/sprint3/tasks/task9.md`, `docs/execution/sprint3/STATUS.md`
- `docs/execution/bugs/Sprint3/tasks/task6.md`, `docs/execution/bugs/Sprint3/reports/task6.md` — the R2 dependency, merged first
- `docs/execution/bugs/Sprint3/tasks/task3.md` — the score-threshold/auto-retry mechanism R2's `gate1AutoApprove` sits next to
