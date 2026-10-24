# Publishing citation numbers and retry recovery

**Revision:** r1, 2026-10-22.
**Objective:** Fix publishing rejection caused by numeric citation URLs, while retaining genuine numeric/hedge validation and the existing retry limits.
**Branch/worktree:** `codex/fix-publishing-citation-retry`, `D:\Study Material\7AI\.worktrees\publishing-citation-retry`.
**Owner:** this architecture/implementation chat. Separate draft PR; founder merges. No application start, provider call, production retry or upload is authorized by this fix.
**Scope:** backend shared numeric extraction, regression coverage and a run-specific operator recovery query. No schema, model, settings, auth, upload-receipt policy or app change.

## Evidence, inference and proposal

**Verified repository:** manual retries are used counts under `creationOptions.manualRetries[stage]`; three is the current cap. `PipelineRun.retryCount` controls restart-resume crash protection. Both the app's API response and Retry mutation share the manual cap rule. Waiting runs are not periodically polled, so an external edit may also require refreshing the screen.

**Owner supplied:** `UPDATE public.pipeline_runs SET "retryCount" = 3 WHERE id = '716a9a14-09b7-43ed-930a-ff8bc044c9fe';`. This does not reset manual retries.

**Verified live, 2026-10-22 10:54:15 UTC:** server reports `e16cbde`. That run is needs_attention/publishing on Cold Star, with four failed publishing attempts. The recorded hold treats `174488104` and `4023228` inside citation paths as unsupported factual quantities. Structure shows no known publishing receipt/ID or active publishing owner; a null summary is not universal proof of no historical upload. No production action was triggered. Manual publishing counter was not exposed by that structure read and must be read/guarded explicitly before any recovery change.

**Inference:** resetting the manual counter alone would repeat the publishing false positive. Broadly lifting retry limits or adding URLs as factual evidence would be incorrect.

**Proposed fix:** make the one shared number extractor exclude HTTP(S)/www URL spans from both claim extraction and supporting numeric evidence. Retain original text and offsets, visible numeric link labels, surrounding factual numbers, units, arithmetic and hedge behavior. Do not fetch URLs or strip actual metadata.

## R1 — Shared URL-aware numeric extraction

- Implement one bounded local span recognition helper in the existing numeric module.
- Exclude numbers inside citation addresses; URLs never supply factual support.
- Keep visible link labels and real narrative numbers validated, including claims adjacent to a URL.
- Sweep callers: publishing claims, Script Review numeric verdicts/brief hints/format equivalence and tests. Fix same-cause consumers through this shared owner rather than copied sanitizers.
- No allowance, score threshold or review policy changes.

## R2 — Verification and recovery guidance

- Add incident-derived, clearly labelled partial/synthetic URL fixtures for the two recorded article IDs.
- Prove URL IDs/query numbers and number words are ignored, unsupported prose/labels still fail, source-only URL numbers cannot support invented prose, and hedge/arithmetic/regression behavior remains.
- Exercise publishing integration so citation-only metadata reaches the mocked session path, while unsupported prose is held before upload.
- Run targeted publishing, number/reviewer and Retry tests, then build/lint/typecheck. No shared-data startup or paid providers.
- Supply a conditional, run-specific operator query granting one further manual publishing Retry (used count 3 to 2), only while the run remains needs_attention/publishing and the expected old value still matches. Preserve other JSON/counters and publish identity guards. Do not execute production SQL from this checkout or press Retry.
- Explain the separate restart counter; do not silently repurpose/reset it. Recovery is applied only after the code fix is deployed, followed by an app refresh and ordinary guarded Retry.

## Definition of done

Documentation committed first; implementation and meaningful regressions committed on this own branch; same-cause sweep recorded; exact test evidence and residual live/deployment limits in the report; draft PR created. No main merge/deploy, production DB mutation, budget increase or retry.

## Production verification boundary

Live reproduction is read-only historical evidence. A final successful guarded retry/publish remains founder-operated after deployment. If server access is missing, do not create SSH credentials or use the local ORM against production. Give the founder a precise guarded SQL statement and readback instead.
