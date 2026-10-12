# Sprint 4 Task 11: Image Model Move (gpt-image-1.5 shuts down 2026-12-01) (Backend)

**Date**: 2026-10-11
**Status**: Code done (R3 steps 1-3). **Waiting on the founder**: contact-sheet approval, then the registry switch (R3 step 4), then R5 verification.
**Branch**: `SPRINT4_TASK11_BE` (worktree `D:\Study Material\7AI-SPRINT4_TASK11_BE`)
**Tests**: `ai-visuals` suite 16/16 passing; typecheck and lint clean.

## What was done
- **R1 spike** against the real API (throwaway scripts, no pipeline, no preview run). Cost of everything including the 72 contact-sheet stills: about $0.60.
- **R3 steps 1-3**: `priceStill()` in `registry.ts` prices a still from the response `usage` for token-billed models, with a measured flat fallback; `IMAGE_PRICING` gained `gpt-image-2.5-flare`, `gpt-image-2.5-flare-2026-09-08` and `gpt-image-2.5-sunburst`; `resolveImagePricing` still throws for unknown models. `client.ts` changed in two lines (import and the cost line). `gpt-image-1.5` stays the live default and stays flat-priced at $0.013.
- **R2**: contact sheets built, see `task11-contact-sheets/index.html` (open locally; images are 360 px or 640 px JPEGs, 4 MB total, committed under `task11-contact-sheets/`).

## R1 measurements (2026-10-11, this organisation, quality `low` unless noted)

| | gpt-image-1.5 | gpt-image-2.5-flare | gpt-image-2.5-sunburst |
|---|---|---|---|
| 1024x1536 | ok, 591 out tokens (408 image + 183 text), $0.013 flat | ok, **158** out tokens | ok, 158 |
| 1536x1024 | ok, 592 | ok, 158 | ok, 158 |
| 1024x1024 | ok, 522 | ok, 196 | ok, 196 |
| 1920x1080 | **400**: only 1024x1024, 1024x1536, 1536x1024, auto | **400**: sides must be divisible by 16 | same |
| 1920x1088, 1088x1920, 2048x1152, 1280x720 | not tested | **all ok** (1920x1088: 148 tokens) | not tested |
| `medium` 1024x1536 | 2002 tokens | 343 tokens | 343 |
| `high`, `auto` 1024x1536 | n/a | 1372 / 158 | n/a |
| Latency, 1024x1536 low | about 10 s | about 11 s | about 14 s |
| Cost per still, 1024x1536 low | $0.013 | **$0.0049** (158 x $30/M + 29 x $5/M) | $0.0049 |
| Cost per still, medium | n/a | $0.0107 | $0.0107 |

- **Flare and sunburst behave identically** in size, tokens and price; looks differ slightly (sheets).
- **Landscape for long-form**: 1920x1080 is rejected by the new models; **1920x1088 works** (and 1536x1024 on both). Task 9 should use 1920x1088, or 1536x1024, in `sizes.ts` (Task 9 is not on `main` yet, so I have not touched `sizes.ts`).
- **Response shape**: `b64_json` is the default on all three; `usage` is present on all three, with `output_tokens_details.image_tokens` and no text output tokens on the new models. `usage` also carries `input_tokens_details`.
- **Rate limit** (new models, this org): **20 images a minute and 250,000 tokens a minute**, headers `x-ratelimit-limit-input-images`, `x-ratelimit-remaining-input-images`, `x-ratelimit-reset-*`, plus `retry-after`/`retry-after-ms`. A burst of 30 gave 27 ok and 3 429s. That is 4x the old 5 a minute, so a 20-still video no longer needs the long waits.
- **429 wording**: `Rate limit reached for gpt-image-2.5-flare (for limit gpt-image) in organization ... on input-images per min: Limit 20, Used 20, Requested 1. Please try again in 3s.` The existing `rateLimitWaitMs` regex parses it unchanged.
- **Moderation**: no `moderation_blocked` prompts exist in the logs or docs I can reach, so none re-tested. The behaviour is unchanged in code and covered by a test.
- Not tested: the key was accepted for both new models without any verification error.

## R2 contact-sheet decision (for the founder)
Same 8 scene prompts per channel, three models, `low`. Sheets: Not In Your Textbook portrait, Not In Your Textbook landscape, Underdogs portrait, plus one style-tweak row.
- **Finding**: with the channel's existing style prompt, both 2.5 models drift **more photoreal** than the old model (real-looking faces and skin, cleaner modern lighting). The old model reads as a painting. This is the "photoreal faces" risk the task warned about.
- **Mitigation tested**: adding "visible brushwork and flat stylised faces, clearly a painting and not a photograph" to the style prompt brought flare back to a painterly look (last row of the sheet). The style prompt is applied in Sprint 4 Task 3, so that wording should go into the channel style prompts there.
- **Assumption**: there is no Underdogs channel bible in the repo, so its scenes use a generic sports-underdog style I wrote. The founder should judge that sheet with that in mind.
- **Recommendation**: `gpt-image-2.5-flare-2026-09-08` (the dated snapshot; flare over sunburst because they match on price and size and flare is the one OpenAI names first). About 62% cheaper per still and 4x the rate limit. Approve only together with the stronger "painting, not photograph" style wording. Quality stays `low`.
- **Founder to decide**: model and snapshot, and whether the style wording change is accepted. Then the one-line registry switch goes in as the last commit on this PR.

## R4: documents that quote the old numbers (listed, not edited)
1. `docs/execution/bugs/Sprint3/closureTask.md` lines 156, 320, 328 and `closureTask2.md` lines 76, 160-178: SQL filters on `model = 'gpt-image-1.5'`. After the switch it must also match `gpt-image-2.5-flare%`.
2. `docs/channel_bibles/NOT_IN_YOUR_TEXTBOOK.md` section 14, line 500: "about $1.30 of images (~100 stills)" becomes about $0.50 at $0.0049, and "about 20 minutes at the 5-per-minute rate limit" becomes about 5 minutes at 20 a minute.
3. `closureTask.md` lines 166-167: about $0.20 per attempt and $20 a week per channel. Image cost per attempt drops from about $0.18 to about $0.07; the recommended ceiling can be lowered after one real week.
4. Sprint 4 Task 9 R7: the long-form cost estimate and its size constants (see 1920x1088 above).
Test fixtures that name `gpt-image-1.5` (`closure2-render.test.ts`, admin tests) are plain strings and do not need to change.

## Deviations
- Measured the style fix beyond R2's scope because the sheets showed the photoreal drift; it is a finding, not a code change.
- `sizes.ts` does not exist on `main` yet, so the existing `STILL_SIZE` constant is used.
- The base checkout has no `node_modules`; the worktree got its own `npm ci` and `prisma generate`.

## Still open
- R3 step 4 (registry switch) after founder approval.
- R5: one real `ai-stills` preview run per channel after the founder deploys, plus the 2-minute long-form check if Task 9 has merged by then.
