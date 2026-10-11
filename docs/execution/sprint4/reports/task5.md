# Sprint 4 Task 5: Packaging From Profile (+ Editor/Source Credit, Upload Compliance Fields, Repeat-Topic Warning, B16)

**Date**: 2026-10-08
**Status**: Complete
**Branch**: `sprint4_be`
**Tests**: All passing (238 tests); `tsc`, lint, build clean.

`{editor}` is real: it comes from Task 4's `ReviewLog.approvedByUserId` via `findGate1ApproverForRun`
(see `reports/task4.md`, the dependency that was built first so this was not deferred). `{sources}` comes
from Task 2's `creationOptions.sources`.

## What Was Done

- **R17 packaging** (`agents/publishing/packaging.ts`, `index.ts`): `generatePublishingMetadata` takes
  `titleGuidance`, `descriptionTemplate`, `hashtagsBase`, `editorCredit`, `editorName`, `sources`. Title
  guidance and the template go into the user message; `hashtagsBase` is unioned with the script's hashtags
  (de-duplicated, no `#`). `{editor}` and `{sources}` are filled **before** the model sees the template;
  `{summary}`/`{hashtags}` are left for the model. With no packaging input the message is exactly the old one.
  `{editor}` = approver `name ?? email`, or "the team" (ops path, or a failed lookup, which is logged and
  never blocks a publish). Empty `{sources}` is removed cleanly.
- **Credits enforced after the model replies** (found by a live check, see below): `scrubDescription`
  strips any leftover placeholder, appends `Edited by <editor>.` if it was asked for (template has
  `{editor}`, or profile `editorCredit: true`) and is missing, and appends the `Sources:` line if the
  template used `{sources}` and it is missing.
- **R18 upload fields**: `UploadParams.selfDeclaredMadeForKids` (required), `categoryId?`,
  `defaultLanguage?`; `buildUploadMetadataPart` (pure, exported) builds the `videos.insert` body;
  `UploadResult` and the `publishing` stage output echo `selfDeclaredMadeForKids`. Values come from
  `resolveChannelConfig` via the run's snapshotted profile.
- **R20 repeat topic** (`run-pipeline/repeat-topic.ts`, `listRecentRunTopicsForChannel`): see threshold
  below. Called best-effort right after Intake completes; a query error is logged and means "no warning".
  `formatGateMessage` gains the line (before the Reply line, omitted when none).
- **B16 (where `runs.get` returns the warning)**: stored as `repeatTopic: { runId, topic, createdAt }` on
  the **intake stage's own output** (additive Json via `patchStageOutput`, no migration; the gate1 stage
  does not exist yet when Intake finishes, and its output is only written at resolution, so intake output
  was the durable place that is also restart-safe). `runs.get` returns it as
  `scriptReview.repeatTopic` (null when none), next to the Task 2 fields; the raw value is also in
  `stages[].output`. Gate 1 reads it from the same place, so the message and the API cannot disagree.

## Repeat-topic threshold

Words are lowercased, split on non-alphanumerics, stripped of stopwords and a trailing plural "s". A match
needs **>= 2 shared words and an overlap coefficient (shared / the smaller set) >= 0.6**. Overlap
coefficient, not Jaccard, because the typical repeat is a short topic restated inside a longer one ("the
fall of the Roman Empire" vs "why the Roman Empire fell": shared {roman, empire}, smaller set 3, 0.67).
0.6 sits above a same-subject-different-angle pair ("Roman roads" vs "Roman Empire": 1 shared, 0.5) and the
two-word floor means one common word can never match. It is a deliberately crude heuristic: it will miss
paraphrases that share few words ("fall"/"fell" do not match each other) and can flag two genuinely
different angles on one subject. It is non-blocking, so a false positive costs one ignorable line.

## Test Results

New/extended unit tests: repeat-topic (clear match, clear non-match, 1-shared-word and 2-shared-but-below-
threshold edges, case/plural, newest-on-tie, empty input); packaging message (identical to old with no
input, hashtag union, `{editor}`/`{sources}` filling, fallback, empty-sources removal, `editorCredit`);
`scrubDescription` enforcement; the repeat-topic Gate 1 line and its omission; `deriveScriptReview`
`repeatTopic`; and, in the existing mocked-Google-client test, the **actual multipart request body**:
`status.selfDeclaredMadeForKids: false` is present with no `categoryId`/`defaultLanguage` keys at all when
unset, and `categoryId: "27"` / `defaultLanguage: "en"` appear when set.

Live (real Anthropic, real intake, real gate and publishing stages on `sevenai_dev`; `YOUTUBE_STUB=1`, R2
blanked; throwaway tenant, deleted, leftovers 0; about $0.05):
- Title guidance "end with a question mark" + base hashtag `#historyshorts`: **4/4 titles ended in "?"**,
  `#historyshorts` present 4/4. A profile-less call produced a normal title and 10 tags (as before).
- **Finding**: with a template, the model sometimes rewrote the description and dropped the editor and
  sources lines (first run of this check). Fixed with the enforcement step above; re-run: the editor line
  and sources line appear every time, the ops path gives "Edited by the team." with no Sources line, and no
  literal `{editor}`/`{sources}` leaked.
- Repeat topic through the real Intake stage: topic 1 "fall of the Roman Empire" (no warning); a second run
  on the same channel, brief "Why the Roman Empire fell, a short explainer" -> `repeatTopic` stored on its
  intake output, shown in the real Gate 1 notification message and returned by `runs.get`; an unrelated
  octopus brief -> no warning. It behaves the same on a profile-less channel (not profile-gated).
- `{editor}` end to end: a real signed-in user approved Gate 1 through the router; `runPublishingStage`
  produced a description ending "Edited by ZZ Editor." and "Sources: https://example.com/rome", and the
  `ReviewLog` row's `approvedByUser.name` ("ZZ Editor") matched (cross-checked in Postgres). The publishing
  stage output recorded `selfDeclaredMadeForKids: false`.

## Behaviour change to call out

**`status.selfDeclaredMadeForKids` is now always sent explicitly (default `false`)**; before this task it
was never sent and YouTube used the channel's Studio default. A channel that genuinely needs `true` sets it
in its profile. This is deliberate, not incidental.

## Deviations from Spec

- **Not captured against the real YouTube API**: the request body was verified from the real multipart
  payload handed to the mocked Google client (the same layer Sprint 2's disclosure test uses), not from a
  real upload (the stub was used end to end; there is no spare upload to burn).
- **Credit enforcement** (`scrubDescription`) is beyond the doc, added after the live check showed the model
  dropping the lines. `editorCredit: true` is interpreted as "add an Edited-by line even if the template has
  no `{editor}`": the doc did not define it, flag if you meant something else.
- The doc says the warning is computed "after Intake" and threaded into the Gate 1 message; it is computed
  at that point but also persisted (B16), and Gate 1 reads the persisted copy.
- The publishing cover-frame step logged a non-blocking failure in the live check (fake mp4 file); expected.

## Sign-Off

- Task Objective: Met
- Schema Impact: None (Json only)
- Business Logic: `BUSINESS_LOGIC.md` updated
- Tests: Passing
- Ready for Integration: Yes
