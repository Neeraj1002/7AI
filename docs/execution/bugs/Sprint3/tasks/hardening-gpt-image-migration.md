# Hardening: gpt-image-1.5 Shuts Down on 2026-12-01 — Move Still Generation to a Supported Image Model

**Read `docs/execution/bugs/HOTFIXER_AGENT_PROTOCOL.md` and `docs/execution/templates/TASK_TEMPLATE.md` in
full before starting.** This is a deadline-driven item, not a numbered bug task: it has no `BUGS_TASK<N>`
number, on purpose, so it cannot collide with the numbers of the drafted Tasks 14 and 15. Same
posture as the other `hardening-*.md` docs in this repo.

**Written**: 2026-10-08. **Status**: not started. **Hard deadline**: 2026-12-01 (the old model stops
answering). **Target**: merged and deployed by **2026-11-15**, which leaves two weeks of margin.

**Objective**: the default `ai-stills` path generates every still with `gpt-image-1.5`. OpenAI has announced
that model's shutdown. Move still generation to a supported model before the shutdown, record the real cost of
each still, and have the founder approve how the new stills look before any channel publishes with them.

**Owning Component**: `studio/src/ai-visuals/` (`registry.ts`, `client.ts`, `types.ts`, `stub.ts`) and the
cost figures that depend on it.

---

## The issue

| Fact | Detail | Source |
|---|---|---|
| Model in use | `gpt-image-1.5`, set in `AI_VISUALS_REGISTRY['still-generation']` (`ai-visuals/registry.ts`). Size `1024x1536`, quality `low`, one request per still, reads `b64_json`. | Code read, 2026-10-08 |
| Shutdown | `gpt-image-1.5`: announced 2026-06-02, **shuts down 2026-12-01**. Replacement named on the page: `gpt-image-2.5-sunburst` or `gpt-image-2.5-flare`. `gpt-image-1` shuts down 2026-10-23 and `gpt-image-1-mini` on 2026-12-01 (the registry comment already says `gpt-image-1` was avoided for that reason). | OpenAI deprecations page, read 2026-10-08 |
| What breaks | After the shutdown every `ai-stills` render fails at the first still. That is the default path for real people and events, and the channel playbook relies on it. The failure would be loud (a non-retryable provider error, then `needs_attention`), not silent. | Code read: `mapOpenAiError`, `generateOneStill` |
| Why it needs more than a one-line change | The price is a flat table entry (`IMAGE_PRICING['gpt-image-1.5'] = $0.013`) and `resolveImagePricing` throws for any model without an entry, so changing the model name alone fails every render. And the budget gate reads these costs. | Code read |

Where the current price came from: $0.013 is OpenAI's published price for `gpt-image-1.5` at 1024x1536,
`low` quality (medium $0.05, high $0.20), confirmed 2026-10-08. A real run (`c3a0175c`, 14 stills) booked
$0.182 for its stills, which matches.

## What is known about the replacement (and what is not)

Known, from OpenAI's model page for `gpt-image-2.5-flare` (2026-10-08):
- Billed by tokens, not a flat price per image. Image output $30 per million tokens (batch $15), text input
  $5, image input $8. The page says these match GPT Image 2.
- Quality values: `low`, `medium`, `high`, `xhigh`, `max`, `auto`.
- Alias `gpt-image-2.5-flare`; dated snapshot `gpt-image-2.5-flare-2026-09-08`.
- Rate limits by tier: Build 250,000 tokens per minute and 20 images per minute; Launch 150 images per
  minute; Grow 250. Free tier is not supported.
- Endpoints: image generation, image edit, batch.

**Not published or not checked (these are the blockers below):**
- A per-image price at 1024x1536. One third-party estimate for the square 1024x1024 size is about $0.006
  (low), $0.013 (medium), $0.053 (high), but its author reconstructed the token counts from OpenAI's cost
  calculator and says he could not verify the portrait size. **Do not use these numbers in code.**
- Which sizes the model accepts. The model page does not list them.
- Whether `sunburst` and `flare` differ in speed, quality or token use. The page for `flare` does not mention
  `sunburst`.
- Whether the API response carries a `usage` object with output tokens (the earlier gpt-image models did),
  and what the default response format is.

## Blockers

| # | Blocker | Who clears it | How |
|---|---|---|---|
| B1 | **No published per-image price** for 1024x1536. The weekly budget gate and the dashboard use this number, and the "about 85 runs a week per channel at $20" sizing assumes $0.013. | Agent, with a real call | Make real calls at each quality, read `usage` from the response, compute cost from tokens at $30 per million. Use the measured figure, then re-check it against the first week of `usage_events`. |
| B2 | **Size support unknown.** If 1024x1536 is not accepted, the stills are no longer 9:16-friendly and the shared scale/crop step changes. | Agent | One real call per candidate size. |
| B3 | **Which model: `sunburst` or `flare`**, and alias or dated snapshot. An alias can change behind us; a snapshot is stable but ends at its own shutdown date. | Founder decides, agent supplies the comparison | Same 6 scene prompts through both, compared side by side (see B5). Prefer the dated snapshot and record the date in the registry. |
| B4 | **Rate limit.** This org measured 5 images a minute on the old model (Sprint 4 Task 8). The new model's limit depends on the org's usage tier; the Build tier lists 20 a minute. The wait logic parses the message "try again in N s", and the new model's wording is unchecked. | Agent, with a real call | Read the org's actual limit from the response headers, and trigger one 429 on purpose if it can be done cheaply, to confirm `rateLimitWaitMs` still parses the message. |
| B5 | **The look changes.** Both channel style prompts (the locked painterly look for Not In Your Textbook, and the Underdogs look) were tuned on the old model. A new model will draw the same prompt differently, and a historical channel cannot drift into photoreal faces or modern objects. | **Founder** | Agent generates one contact sheet per channel (same scene prompts, old model vs new model) before the registry changes. Founder approves, or asks for prompt changes. |
| B6 | **Account access.** The OpenAI key must be allowed to call the new model; image models can need organisation verification. | Founder, if the first call is refused | The agent reports the exact error. |
| B7 | **Moderation behaviour** may differ. The client skips a still when the provider returns `moderation_blocked`. | Agent | Re-run the three prompts that were blocked on the old model, if the logs have them. |

## Requirements

**R1 (Role: `BE`) — A measurement spike, before any code change.** Make the real calls needed to clear B1,
B2, B4 and B7 using a throwaway script, not the pipeline, and no run on `sevenai_preview`. Record in the
report: the sizes accepted, tokens and cost per still at `low` and `medium` for both candidate models, the
rate limit, the response shape (does it carry `usage`, is `b64_json` returned by default), and the wording of
a 429. Cost of the spike: a few dollars at most.

**R2 (Role: `BE`) — Contact sheets for the founder (B5).** For each active channel, render the same 6 to 8
scene prompts with `gpt-image-1.5` and with the candidate model(s), and put them side by side for the
founder. No registry change yet.

**R3 (Role: `BE`) — Change the model and record real cost.** After the founder approves (B3, B5):
1. `AI_VISUALS_REGISTRY['still-generation']` points at the chosen model, with the dated snapshot if that was
   the decision. Update the comment above it, which currently explains the old choice.
2. Replace the flat table for this model with a cost computed from the response's token `usage` at the
   published token rates, and keep a flat fallback figure (the measured value from R1) for a response that
   has no `usage`. Keep `resolveImagePricing` throwing for an unknown model; a missing price must stay loud.
3. Keep `STILL_SIZE` and `STILL_QUALITY` as constants, set from R1. If R1 shows a different size or quality
   is needed, say so in the report before changing it.
4. Keep the rate-limit wait, the moderation skip, the partial-spend context added in Closure 2 P5, and the
   stub untouched except where R1 shows a real difference. Do not refactor.
5. Tests: the cost from a response with `usage`, the fallback without it, an unknown model still throws, and
   the existing client tests unchanged.

**R4 (Role: `BE`) — Documents that quote the old numbers.** List and fix, one commit: the closure SQL that
filters `model = 'gpt-image-1.5'` (`closureTask.md`, `closureTask2.md`); the channel playbook's long-form
pilot cost line (about $1.30 for 100 stills) in `docs/channel_bibles/NOT_IN_YOUR_TEXTBOOK.md` §14; and the
budget sizing note in `closureTask.md` (about $0.20 per attempt, $20 a week per channel). Propose the text to
the founder; do not edit Project documents without asking.

**R5 (Role: `BE`, verify) — One real render on preview.** After deploy, one real `ai-stills` run per channel
to Gate 2. Report: the `video-generation` usage row (model name, cost), the number of stills, the render time
(compare with the old model's), and the founder's judgement of the look.

## Out of scope

- Switching to a different vendor (Stability AI, Midjourney or others). That means a new credential and a
  new vendor relationship, so it needs a founder decision and its own task. Mention it in the report only if
  R1 or R2 shows the new model is unusable for the look the channels need.
- Changing how many stills a video uses or their pacing (Sprint 4 Task 3).
- Any schema change. None is expected.

## Dependencies and order

- Starts **after Closure part 2 (PR #57) is merged**: that PR changed `ai-visuals/client.ts` (the partial
  spend on failure) and this task edits the same file.
- Does not depend on the 24-report triage. R1 and R2 can run in parallel with it.

## Verify

1. R1's report table is filled with measured, not assumed, values.
2. The founder has approved the contact sheets.
3. A real preview run per channel books a `video-generation` row whose cost matches the sum of the measured
   per-still costs within a cent.
4. Searching the repository for `gpt-image-1.5` finds only history (comments, old reports), not a live call.
5. `npm run build && npm run lint && npm run typecheck && npx vitest run` pass.

## Git Workflow

One branch, **`HARDENING_GPT_IMAGE`**, off a fresh `origin/main` in `D:\Study Material\7AI-bugs` after #57
is merged. Record it in `docs/execution/bugs/STATUS.md` before the first commit (the "Deadline" row already
exists). One commit per requirement (`HARDENING_GPT_IMAGE_R<X>: ...`), a report at
`docs/execution/bugs/Sprint3/reports/hardening-gpt-image-migration.md` in the closing commit, one draft PR,
then `gh pr ready`. Never push or merge to `main`.

## Links

- OpenAI deprecations page (the shutdown list) and the `gpt-image-2.5-flare` model page, read 2026-10-08.
- `studio/src/ai-visuals/registry.ts`, `client.ts`; `docs/execution/sprint4/tasks/task8.md` (R6, the 5-a-minute
  rate limit and the $0.013 per still figure).
- `docs/execution/bugs/Sprint3/closureTask2.md` P5 (the per-still price check and the partial-spend change).
