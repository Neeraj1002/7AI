# Sprint 4 Task 11: Image Model Move (gpt-image-1.5 shuts down 2026-12-01) (Backend)

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow, the Hard rules (one worktree per session, never push to `main`) and the report shape. This file states only this task's specifics.

**Written**: 2026-10-08 as a hardening note; **moved to Sprint 4 and rewritten 2026-10-11** so it runs in parallel with Tasks 9 and 10 and nothing waits for it. **Status**: not started. **Branch**: `SPRINT4_TASK11_BE`, in its own worktree off fresh `main`. **Hard deadline**: 2026-12-01 (the old model stops answering). **Target**: merged and deployed by **2026-11-15**.

**Objective**: the default `ai-stills` path calls `gpt-image-1.5`, which OpenAI shuts down on 2026-12-01. Move still generation to a supported model, book the real cost of each still, and have the founder approve how the new stills look before any channel publishes with them.
**Duration**: 1.5 to 2 days of agent work plus the founder's approval of the contact sheets.
**Depends On**: nothing. (Sprint 3 Closure part 2, PR #57, is merged. The old note said to wait for it.)
**Owning Component**: `studio/src/ai-visuals/` model call, `registry.ts`, `types.ts`, `stub.ts`, the image price table and the cost figures that depend on it.
**Success Criteria**: (1) measured, not assumed, sizes, prices and rate limit for both candidate models are in the report; (2) the founder has approved the contact sheets; (3) after the switch, a real preview run per channel books a `video-generation` row whose cost matches the sum of per-still costs within a cent; (4) searching the repository for `gpt-image-1.5` finds only history, not a live call.

**How this task stays out of other agents' way** (decided 2026-10-11)
- Sprint 4 Task 9 (long-form video) owns the `size` parameter and the new file `ai-visuals/sizes.ts` (portrait and landscape constants). This task owns the model, the price table and the cost-from-usage. You may change *values* in `sizes.ts` if your measurements show another size. Do not restructure either file.
- Both tasks touch `ai-visuals/client.ts`. Keep your edits to the model call and the cost; whichever task merges second merges `main` into its branch and resolves the small conflict.
- You never wait for another agent, and no other agent waits for you. Long-form works on the current model and picks up the new model automatically once this merges.
- The only wait is the founder's approval of the contact sheets. Do all the other work first (see R3), so the approval is a one-line switch.

---

## The issue

| Fact | Detail |
|---|---|
| Model in use | `gpt-image-1.5`, set in `AI_VISUALS_REGISTRY['still-generation']` (`ai-visuals/registry.ts`). Size `1024x1536`, quality `low`, one request per still, reads `b64_json`. |
| Shutdown | `gpt-image-1.5`: announced 2026-06-02, shuts down 2026-12-01. Replacements named on OpenAI's deprecations page: `gpt-image-2.5-sunburst` or `gpt-image-2.5-flare`. `gpt-image-1` shuts down 2026-10-23 and `gpt-image-1-mini` on 2026-12-01. |
| What breaks | After the shutdown every `ai-stills` render fails at the first still (loud: a non-retryable provider error, then `needs_attention`). That is the default path for real people and events. |
| More than a one-line change | The price is a flat table entry (`IMAGE_PRICING['gpt-image-1.5'] = $0.013`, matches a real run) and `resolveImagePricing` throws for an unknown model, so changing the name alone fails every render. The budget gate reads these costs. |

Known about the replacement (OpenAI's `gpt-image-2.5-flare` page, read 2026-10-08): billed by tokens (image output $30 per million tokens, text input $5, image input $8); quality values `low`, `medium`, `high`, `xhigh`, `max`, `auto`; alias `gpt-image-2.5-flare` and dated snapshot `gpt-image-2.5-flare-2026-09-08`; rate limits by tier (Build 250,000 tokens and 20 images a minute; Launch 150; Grow 250).
**Not known (R1 settles these)**: the per-image price at each size (a third-party estimate exists for 1024x1024 only; do not use it in code), the sizes the model accepts, whether `sunburst` and `flare` differ, whether the response carries a `usage` object with output tokens, the default response format, the rate limit this organisation actually has (it measured 5 a minute on the old model), and the wording of a 429 (the wait logic parses "try again in N s").

## Requirements

**R1 (measurement spike).** One throwaway script, not the pipeline, and no run on `sevenai_preview`. Real calls to measure, for both candidate models and for `gpt-image-1.5` as the baseline: the sizes accepted, **including landscape 1536x1024 and 1920x1080 (long-form needs these)** and portrait 1024x1536; tokens and cost per still at `low` and `medium`; the rate limit from the response headers; the response shape (`usage`, `b64_json` default); the exact wording of a 429 (trigger one on purpose if cheap); and the three prompts that were blocked by moderation on the old model, if the logs have them. Cost: a few dollars at most. If the OpenAI key is refused for the new model, report the exact error and tell the founder (image models can need organisation verification); do the rest of the work meanwhile.

**R2 (contact sheets for the founder).** For each active channel (Not In Your Textbook and Underdogs), render the same 6 to 8 scene prompts with the old model and the candidate(s), side by side, in portrait and, for Not In Your Textbook, also landscape. A historical channel must not drift into photoreal faces or modern objects. No registry change yet. Send the sheets to the founder with a recommendation (model, alias or dated snapshot; prefer the dated snapshot and record its date).

**R3 (code, in this order).** Steps 1 to 3 do not need the founder's approval, so do them right after R1 and keep the old model as the live default until step 4.
1. Cost from usage: price a still from the response's token `usage` at the published token rates, with a flat fallback (the measured value from R1) when a response has no `usage`. Keep `resolveImagePricing` throwing for an unknown model; a missing price must stay loud.
2. The new model works behind the same registry entry shape, including the `size` parameter from Task 9 if it is on `main` (if not, use the existing size constant; Task 9 merges the plumbing).
3. Tests: cost from a response with `usage`, the fallback without it, an unknown model still throws, a 429 still waits, moderation skip unchanged, existing client tests unchanged. Keep the rate-limit wait, the moderation skip, the partial-spend context (Closure 2 P5) and the stub untouched except where R1 shows a real difference. Do not refactor.
4. **The switch (last commit, only after the founder approves the contact sheets and the model choice):** `AI_VISUALS_REGISTRY['still-generation']` points at the chosen model, with the dated snapshot if that was the decision; update the comment above it. Push it to the same PR.

**R4 (documents that quote the old numbers).** List and propose, do not edit Project documents without asking: the closure SQL that filters `model = 'gpt-image-1.5'` (`closureTask.md` (archived, see docs/ARCHIVE_INDEX.md), `closureTask2.md` (archived, see docs/ARCHIVE_INDEX.md)); the channel playbook's pilot cost line (about $1.30 for 100 stills) in `docs/channel_bibles/NOT_IN_YOUR_TEXTBOOK.md` section 14; the budget sizing note in `closureTask.md` (archived, see docs/ARCHIVE_INDEX.md) (about $0.20 per attempt, $20 a week per channel); and the long-form cost estimate in Sprint 4 Task 9 R7.

**R5 (verify, after the founder deploys).** One real `ai-stills` run per channel to Gate 2. Report the `video-generation` usage row (model name, cost), the number of stills, the render time compared with the old model, and the founder's judgement of the look. **Long-form check, whoever merges second:** if Task 9 is already on `main` when you finish, also run one 2-minute long-form test render on the new model; if it is not, Task 9's agent does that check after your merge.

## Out of scope
- Another vendor (Stability AI, Midjourney and so on): needs a new credential and a founder decision, so its own task. Mention it only if R1 or R2 shows the new model is unusable for the channels' look.
- How many stills a video uses or their pacing (Sprint 4 Task 3 and Task 9).
- Any schema change (none expected).

## Schema Impact / Business Logic
No schema changes. No new control flow.

## Testing
```bash
npm run build && npm run lint && npm run typecheck && npx vitest run
```

## Report
`docs/execution/sprint4/reports/task11.md`: the R1 measurement table (measured values), the contact-sheet decision, deviations, the R4 list. Do not edit `docs/STATUS.md` or other shared status pages; send the architect a one-line status. Record the branch in `docs/execution/sprint4/STATUS.md` (archived, see docs/ARCHIVE_INDEX.md) when you create it.

## Links & References
- OpenAI's deprecations page and the `gpt-image-2.5-flare` model page (read 2026-10-08); `studio/src/ai-visuals/registry.ts`, `client.ts`.
- `sprint4/tasks/task8.md` (the 5-a-minute rate limit, the $0.013 per still figure) · `sprint4/tasks/task9.md` (R5, `sizes.ts`) · `sprint4/PENDING.md`.
