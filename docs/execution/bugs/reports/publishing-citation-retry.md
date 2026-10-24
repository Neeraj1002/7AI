# Publishing citation numbers and retry recovery

**Date:** 2026-10-22.
**Task:** [r1](../tasks/publishing-citation-retry.md), committed first as `a483982`.
**Branch/worktree:** `codex/fix-publishing-citation-retry`, `D:\Study Material\7AI\.worktrees\publishing-citation-retry`.
**Source:** current main `592db32a91ef2202d8ba91798f4b0b224ccbd530`.
**PR:** [#114](https://github.com/Neeraj1002/7AI/pull/114), opened as draft for founder review.
**Tested implementation:** `f9e8306` (documentation-only task first commit `a483982`).
**Status:** implementation, 334 targeted tests and final build/lint/typecheck pass. Not deployed; production recovery not performed.

## Verified cause and scope

The owner's SQL set `PipelineRun.retryCount` to 3. That is the restart-resume crash counter. Manual Retry reads the per-stage **used** count in `creationOptions.manualRetries`, with a maximum of three. `runs.get` and the mutation share the same cap helper. Changing the former counter does not re-enable manual Retry; setting the latter to three also means exhausted, not three remaining. The app does not poll waiting runs continuously, so an external correction needs a refresh/reopen.

At `2026-10-22T10:54:15Z`, the live Admin API reported `e16cbde`. Run `716a9a14-09b7-43ed-930a-ff8bc044c9fe` was needs_attention/publishing on Cold Star. Four failed publishing attempts reported unsupported numeric claims `174488104` and `4023228` inside citation article URLs. Generation, video review and Gate 2 had completed. The safe publishing summary showed no receipt/known ID/active owner; this is not universal proof of no historical upload. Recorded total booked cost was about $2.2155; no test/provider action changed it.

The allowed audited diagnostic read exposed video-stage manual counts only. A subsequent own-run `runs.get` read returned HTTP 403 under the existing diagnostic credential; no tenant session was minted and no authorization bypass attempted. Therefore the publishing manual count and restart-counter database value are **not independently read back** here. The recovery script checks the exact expected old count before making any change.

## Change

- One shared `citationUrlSpans` helper identifies HTTP(S)/www addresses locally without fetching them. `numberMentions` excludes address spans while preserving original text and offsets. URL path/query/fragment numbers and number words are neither claims nor supporting factual quantities.
- Publishing abbreviation expansion shares those spans so URL strings such as `/220M?amount=1.4B` stay intact rather than being split into invented prose quantities. Actual outgoing metadata and citations are unchanged.
- Visible numeric link labels, unsupported prose next to links, units, supported arithmetic and dropped hedges remain checked. A number appearing only in a source URL cannot authorize the same number in a title or script.
- No retry cap/exception, score policy, prompt/model, schema, budget, approval or upload-identity logic changed. No app/native change.

## Same-cause sweep

| Hit | Disposition |
|---|---|
| `script-review/numbers.ts`: extraction, numeric verdicts, hedge backtracking, number-format equivalence | Fixed through the one extractor; existing tests plus new address/prose regressions pass. |
| `publishing/metadata-claims.ts` | Fixed through the shared helper/extractor; URL-safe abbreviation expansion prevents recreating the bug. |
| `script-review/brief-checks.ts` / `normalizedNumbers` / supported values | Fixed through the shared extractor; sources cannot lend their URL IDs as factual support. Existing suite passes. |
| `script-review/scene-props.ts`, `grounded-findings.ts` | Same shared extraction owner; no copied recognizer added. Existing reviewer tests included. |
| Existing Task 6/Task 8 task/report prose | Historical implementation descriptions; left unchanged to preserve task ownership. This report documents the delta. |
| Manual counter helper, `runs.get`, Retry/update-settings/Revise, app disabled flag and restart recovery | Read/compared; existing intended count semantics preserved, no global retry override added. Existing retry/guard tests included. |
| Waiting-screen polling | Existing behavior; no app change is needed for this wrong-counter incident. Recovery instructions require refresh/reopen. |
| URL retrieval, emails, general citation verification | No new producer or trust claim. No evidence establishes a broader fetching/verification task. |

## Tests and evidence

- Before the implementation, the incident-derived partial/synthetic regressions failed: **10 failed, 38 passed** across the numeric/publishing test files. The error text reproduced the same two article-ID holds. Fixture hosts, metadata title and surrounding prose are synthetic; this is not a full stored-response replay.
- After implementation and URL-safe abbreviation coverage: **334 passed across 26 files**, zero skips. Includes all Script Review and publishing suites, manual retry/API caps, old approval/cancel publishing guards and the new real `runPublishingStage` integration path with mocked repositories/providers.
- Publishing integration covers Shorts and long-form: citations reach the guarded mocked upload boundary after one metadata call; unsupported prose still stops before claim/upload after the existing one correction. The mocked boundary deliberately throws; no actual session, bytes or successful publication is claimed.
- Final post-edit `npm run build`, `npm run lint` and `npm run typecheck` passed; `git diff --check` passed. No database test suite, shared-data application startup or provider call executed. The test environment uses a dummy isolated localhost test URL; all accessed repositories are mocked.
- After committing the tested implementation, fetched origin and pulled main into this own branch: already up to date at `592db32`; no integration conflicts or new source differences. Task-doc content hashes match the architect source. The PR's documentation scope is only this task doc, report and expressly requested recovery script. No shared STATUS or other task document changed.

## Owner recovery after deployment

Use [the guarded operator script](../recovery/publishing-citation-retry.sql) on the VPS through the existing authorized database workflow. It reads the relevant values and changes only this run's manual publishing count from exactly three used to two, restoring one further try. It requires needs_attention/publishing, no receipt, no active publishing stage and no recorded ID. Zero returned rows means stop/reinspect, not remove the guards. It preserves the unrelated restart counter, other stage counters, paid media, budget and approvals.

Do not run that retry before the citation fix is deployed. Refresh/reopen the app after the counter correction, then use ordinary Retry. Existing budget, receipt/legacy-ID, archived-channel and approval checks remain authoritative. This planning/implementation chat has not run production SQL, changed counters, retried, uploaded, changed visibility or deployed anything. A successful live recovery remains founder-operated acceptance.
