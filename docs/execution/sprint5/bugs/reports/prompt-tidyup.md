# Prompt tidy-up (hot-fix)

**Branch**: `BUGS_PROMPT_TIDYUP`, cut from `origin/main` at `4f6140f`. **Worktree**: `D:\Study Material\7AI\.worktrees\BUGS_PROMPT_TIDYUP`. **PR**: see the PR opened from this branch (number given in the first reply). No live LLM call, $0. `STATUS.md` and `PLAN.md` untouched.

**Task doc**: none existed in the repo or the synced docs folder (`docs/execution/sprint5/bugs/tasks/` has no tidy-up file), so there was no task-doc commit (Hard rule 5). The founder's message was the brief. If the architect writes one, it still needs to be added.

**Zero behaviour change, and how it is proved.** Before touching anything I captured every affected prompt on `main` into `studio/src/agents/prompt-goldens.json` (committed first, as its own commit) and wrote `prompt-goldens.test.ts`, which rebuilds each prompt and asserts string equality. It covers: the short script writer (4 variants), the long script writer (packet and source), the short and long review prompts (alone and with the rules appended), both metadata prompts (captured from what `generatePublishingMetadata` sends), the still check prompt and the hard-cap confirmation prompt. It passes after every change below. Audit line numbers (from `9be48fb`) were each re-read in the current code; all the ones used here still matched (B3, B4, B2, E1, E2, F1, F2).

## What changed

1. **Stale comments only** (comments, no code):
   - `llm/registry.ts` header: now lists which purposes are on Sonnet 5.5 and which on Haiku 4.5, as the table has them (B3). The old "no distinct mid-tier model has ever been added" paragraph is gone; it was false.
   - `claude-sonnet-5-5` pricing row: no longer says "No purpose uses it" (B4).
   - `plan.ts` (two comments) and `state-machine.ts` (two comments): the disclosure flag is Yes when any picture is AI-generated; narration does not count (hot-fix #138). `deriveContainsSyntheticMedia` was read in full: it reads the plan, the repair receipt and the render record, which matches the comment now.
2. **Word-for-word duplicates**, shared constant only where byte-identical today:
   - E1: `FAILURE_LISTS_PARAGRAPH` in `script-review/index.ts`, used by the short and long review prompts.
   - E2: `METADATA_JSON_SHAPE` (the "Respond with ONLY a JSON object:" line and the shape line) in `publishing/index.ts`, used by both metadata prompts. Nothing else in those two prompts is identical (see below).
   - **E3: nothing changed.** The two script writers do not share byte-identical text. The JSON-quote rule differs ("inside "scriptText", "captions" or a hashtag" vs "inside a text value", different apostrophe sentence) and the no-commentary line differs ("Respond with raw JSON only — no markdown code fences, no commentary." vs "Respond with raw JSON only. Do not wrap ..."). Unifying would change a prompt, so I left both and say so.
   - **E4 (picture rules): left alone**, as asked. They differ in wording across `plan.ts`, `plan-long.ts`, `scene-prompts.ts` and `still-check.ts`.
3. **Own registry purposes** (`llm/types.ts`, `llm/registry.ts`):
   - `still-check`: Haiku 4.5, 4,000 output tokens, reasoning off (the same as `video-intelligence-own-draft`). Called from `video-generation/still-check.ts`.
   - `hard-cap-confirmation`: Sonnet 5.5, 16,000 output tokens, reasoning off (the same as `script-review`). Called from `script-review/hard-cap-confirmation.ts`.
   - Registry tests: a new test pins both entries to those exact values; the existing "every purpose has an entry", limit, reasoning, model-facts and pricing tests cover them through `PURPOSES`. `models.test.ts` and `registry.test.ts` iterate `PURPOSES`/`LLM_REGISTRY`, so they pick them up.
   - **One code change beyond the call sites**: `callScriptReviewForEvaluation` (`llm/index.ts`) only accepted `script-review`. The evaluation scripts (`compare-script-review.ts`) pass it as the `complete` function, so the hard-cap confirmation, now a different purpose, would have thrown there. It now accepts `hard-cap-confirmation` too, with the same entry values, so the comparison tool behaves as before.
   - **Every place purposes are listed**: `types.ts` `PURPOSES`; `registry.ts`; `registry.config.test.ts`; `registry.test.ts`; `models.test.ts`; `no-output-cap-outside-llm.test.ts` (scans source text for numeric caps outside `src/llm/`; it lists no purposes, and the new code adds no cap, so it needed no change); `cost-estimate.ts` (estimates by purpose; never included the still check or the confirmation calls, unchanged); `canary.ts` (runs a fixed set of purposes; does not cover the two new ones, unchanged); the `scripts/` that read `resolvePurpose('script-review')` (they read the review entry, which did not change).
   - **What the usage record's purpose name changes.** A `UsageEvent` row stores no registry purpose. Its `agent` column is set by the caller (`'still-check'` for the still check already; `'script-review'` for the review stage, including the confirmation calls), and none of that changed. The registry purpose reaches a row only inside `metadata.llm.purpose` (the call evidence). Old rows keep `video-intelligence-own-draft` (still check) and `script-review` (confirmation) there; new rows say `still-check` and `hard-cap-confirmation`. I found no code, Admin router or report that reads `metadata.llm.purpose` (searched `studio/src` and `app/`), so no report splits or breaks. A person reading raw JSON in old versus new rows will see the new names. The `label` shown in provider-error messages for these two calls is now "Still check" and "Hard-cap confirmation" (was "Video Intelligence" and "Script Review"); that is error text, not a prompt.
4. **Prompt index** (22 lines, plus a 35-line test): `llm/prompt-index.ts` maps each purpose to its prompt and call-site files. `llm/prompt-index.test.ts` fails if a purpose has no entry, a listed file does not exist, or a file that calls a purpose is missing from that purpose's list. Under the 60-line limit, so done.

## Same-cause sweep (Hard rule 9)

Copied blocks found and **left alone** (all would change a prompt, or are not duplicates):
- Script writers' JSON-quote and no-commentary lines (E3): similar, not identical.
- Picture rules in four places (E4): differ; the founder said leave them.
- `Respond with raw JSON only — no markdown code fences, no commentary.` is byte-identical in the short script writer and the short metadata prompt (different purposes, one line). Left alone; the review prompts wrap it differently.
- "A low score or failed fit checks are still a valid review outcome, not an error" opens both review prompts and then diverges. Left alone.
- The review rules' examples and the dead score-cap text (`rules.ts`), channel-specific wording (A1 to A13, D1, D4): out of scope by instruction.
- The cost estimate and the canary do not cover the two new purposes; same as before the split. *Needs a new task* only if the founder wants them added.

## Coordination and checks

- `git fetch` showed no new commits on `origin/main` since the branch was cut (4f6140f) at the time of the last check; nothing rebased. Task 3 and Task 4 had not landed on `main`. If either adds purposes, `PROMPT_INDEX` (a `Record<Purpose, ...>`) fails to compile until the new purpose is listed, which is intended.
- Full suite: `npx vitest run --maxWorkers=4`. Result: see the PR description. `tsc --noEmit` reports only `@napi-rs/canvas` missing (the shared `node_modules` junction lacks it; unrelated to this change).
- Docs scope: this report is the only doc added.
