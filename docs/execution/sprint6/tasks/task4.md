# Sprint 6 Task 4: Creative direction per channel (P16): presets as data, one resolved direction object, the prompts read it

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting, then `docs/decisions/PROMPT_LAYERS.md` in full.** The template defines the Git Workflow, the Hard rules (5 to 9: task doc sync, pull `main` before ready, who owns which doc, close after merge, same-cause sweep), the `STATUS.md` rule and the report shape. `PROMPT_LAYERS.md` (founder-decided 1 Nov) says which layer owns which question in an LLM call; every choice in this task follows it, and the task's job is to make the code obey it. This file states only this task's specifics. Keep every reply to the founder to 3 lines; only the report is long. Do not edit `STATUS.md`, `PLAN.md` or any doc except your own report and the docs named in the Report section.

**Revision**: r5, 2026-11-01.

**Written**: 2026-11-01 by the architect chat (there is no task writer for this item), from `sprint6/PLAN.md` P16, the prompt audit of 1 Nov, `decisions/PROMPT_LAYERS.md` and the founder's answers of 1 Nov. **Status**: not started; starts when this doc is merged (every founder decision is answered and the Presets section of `decisions/PROMPT_LAYERS.md` is approved). **Priority**: P2. **Branches**: `SPRINT6_TASK4A_BE`, `SPRINT6_TASK4B_BE`, `SPRINT6_TASK4C_BE`; worktrees `task4a`, `task4b`, `task4c` under `D:\Study Material\7AI-SPRINT6`. The app part (the preset picker and the channel settings clean-up) is **not** in this agent's work: it is built with the Task 3 app task (Contract C5 and C6 below). Give branch, worktree and PR in your first reply and at the top of the report (Hard rule 7).

## Founder decisions

Answered on 1 Nov:
1. **Presets, not per-setting forms.** A channel's direction is one preset plus one short free-text note. No per-field form.
2. **Which preset for which channel today.** Three channels are live (founder, 1 Nov): Not In Your Textbook (NIYT, to be renamed later, still a history documentary channel) gets `history`; Cold Open gets `story-first`; Start to Shelf gets `explainer`. Clocked In is not live and gets no preset now. **Correction to the plan row:** Cold Open is not a history channel. Since 30 Oct it tells real cons, heists, thefts, forgeries and trials from history, legend first and then the record, in a plain confident third-person voice (`channel_bibles/COLD_OPEN_CHANNEL_CONFIG.md` v1.1, sections 1, 2 and 8). All three channels' prompts change, on purpose. NIYT's are not preserved: the founder said (1 Nov) it will be rewritten as a channel, so `history` is written fresh like the others.
3. **The fallback is `neutral`, from the first PR.** A profile with no direction gets the neutral preset. The three channels get their direction (R5) before PR B merges, so none lands on neutral by accident. A fourth channel later gets its own preset; with none it gets neutral.
4. **Build three presets now** (history, story-first, explainer) plus the neutral fallback. The plan's other names (explainer-utility, facts-list) stay names only until a channel needs them.
5. **Shorts consumers first** (the daily videos are Shorts), then long-form.
6. **Evaluation ceiling $6**, hard, with the final cap proposed after the first check.

Also answered on 1 Nov:
6a. **The layers are locked** (`decisions/PROMPT_LAYERS.md`): eight layers, one owner per question, locks and defaults, the enforcement checks in R10. The preset text is written to that doc.
8. **Start to Shelf's description** is `channel_bibles/START_TO_SHELF_CHANNEL_CONFIG.md` (v0.2). It is the source for the `explainer` preset and for what stays in its content profile.

7a. **Preset text approved** (founder, 1 Nov): `story-first`, `explainer` and `neutral`, as written in the Presets section of `decisions/PROMPT_LAYERS.md`.

7b. **The `history` text approved** (founder, 1 Nov), as written in the Presets section of `decisions/PROMPT_LAYERS.md`. It is written fresh (not a copy of today's code), so NIYT's prompts change. He accepted the one change he was asked to look at: the old outro bridged to a future topic with a cliffhanger; the preset drops that and ends on a lingering thought.
9. **Note length: 300 characters** (founder, 1 Nov).

Nothing is open. The agent copies the Presets section of `decisions/PROMPT_LAYERS.md` verbatim and never edits it.

## Objective

Move every piece of channel-specific creative direction out of shared prompts and into data, so a channel's voice, hook, ending, chapter style, pacing and visual-review tone come from its chosen preset, and the code holds only a neutral platform contract. Today the history persona is in the code: the long script writer is told it is "a master historical documentary filmmaker", the long review rewards a "historical moment" hook, the frame review fails pictures "unrelated to the historical topic", and the format hint and the writer contradict each other on chapter openings (audit findings A1, A2, A4, A7, A8, A9, D1, D4). Three channels now argue with that on every run.

**Success Criteria**: (1) a profile can hold `direction { preset, note }`, validated; (2) `resolveChannelConfig` returns one resolved direction every consumer reads; (3) every consumer's built prompt is covered by a snapshot test for each preset, so every prompt change is a visible diff, and the report lists the changes per channel; (4) each of the three channels' prompts changes only where a channel-specific sentence is replaced by the resolved preset parts, and the founder has approved that text; (5) no history, crime or niche word is in any shared prompt or code path outside the preset data file (grep proof); (6) the picker's read query exists and returns server wording; (7) each run records which preset and preset version made it; (8) the before-and-after evaluation is in the report under the spend ceiling; (9) full tests, type check and lint pass.

## Constraints that decide every choice

- **Presets are data, not code.** One data file holds the presets (R1). History words inside that data file are allowed and are named in the grep proof; they are allowed nowhere else.
- **Parts, not prose.** A preset is a set of small named parts (below). A new preset reuses parts; the consumers assemble the same sentences the same way.
- **Platform sentences stay.** Where today's prompt has a sentence that is not channel-specific (for example the JSON rules and safety rules), it stays in the platform contract unchanged. Only the channel-specific sentences are replaced by the resolved parts, and every such change shows in a snapshot diff.
- **Do not touch the review rules' examples** (the Lego, Roman and "$120" examples in `script-review/rules.ts`, audit A5 and A6) or the dead score-cap text (B5): those are a separate task with its own before-and-after. If a consumer needs `rules.ts`, read it, do not edit it. Report anything you find.
- **No new LLM calls, no new agent, no framework.** Plain code assembles the prompts. Existing registry purposes only.
- **Channel-generic (Key Principle 11).** No channel name in code. The three channels are data in the database; this task sets their profile through R5.
- **Stop rule.** A database migration, a new native dependency, or a change to an existing flow stops the task: ask the architect. (Profile data is JSON and `ChannelProfileDataSchema` is strict, so a new `direction` object is a schema change in code, not in the database; R0 confirms.)
- **Layers (`decisions/PROMPT_LAYERS.md`).** A preset is layer 3. It holds only what every channel on that preset would keep (the preset test in the doc). Platform rules and task mechanics stay in code (layers 1 and 2), numbers and banned phrases stay in the content profile (layer 5), per-video facts and the exact first and last sentence stay in the brief (layer 6). Where a line in a consumer mixes layers (for example the long writer's "Tags" line: a count of 3 to 8 plus the word "historical"), split it: the mechanics stay in code, the channel word comes from the right layer.
- **Preset parts:** `persona` (who the writer is), `domain` (what the channel covers, one line), `hookRule`, `endingRule`, `storyShape`, `chapterStyle`, `pacingCues`, `avoid`, `visualReviewTone`. Any part may be empty. Every preset, `history` included, is written fresh to the preset test in `PROMPT_LAYERS.md` and carries no wording copied from a consumer; the reviewer judges the hook against the preset's `hookRule`. (`storyShape` and `avoid` are new in r2; they hold the story mechanics and the shared "never do" list that the plan row folded into the other parts.) The reviewer's hook, ending and pacing criteria are derived from the same `hookRule`, `endingRule` and `pacingCues` text the writer gets, never written separately. Hashtag words stay in `packaging.hashtagsBase` where they already are; do not duplicate them.

## R0. Read the real code first and confirm

**Where**: `studio/src/channel-profile/` (`schema.ts`, `resolve.ts`), `api/routers/channels.ts` (`getActiveProfile`, `createProfileVersion`), `run-pipeline/resolved-config.ts` and where `resolveChannelConfig` is called, every consumer in the audit (`agents/script-generation/index.ts`, `long-form.ts`, `agents/script-review/index.ts`, `agents/video-intelligence/index.ts`, `video-generation/plan.ts`, `plan-long.ts`, `still-check.ts`, `formats/manifest.ts`, `agents/publishing/index.ts`), `models/repositories/channel-profile-version.repository.ts`, how a run pins its profile version (`profileVersionId`), the app's content profile screen (`app/app/(app)/channel/[id]/profile`) and channel settings screen (`channel/[id].tsx`), and the prompt audit report (branch `PROMPT_AUDIT`; if it is not on `main`, the founder supplies it).

**Fix**: a confirmed / wrong / unknown table in the report **before** choosing files or shapes. Confirm at least: (1) every line of channel-specific text in a consumer, with file and line (start from the audit; its line numbers are from `9be48fb`); (2) whether adding `direction` to the profile needs any database change (expected: none); (3) which prompts a profile-less channel reads today (the legacy path); (4) how the three channels' profiles look now: NIYT's, Cold Open's (v1.1 section 8 says "save as a new version"), and whether Start to Shelf has one; (5) which consumers take `resolveChannelConfig` already and which receive their text another way; (6) where a run's tags or stage output can carry the preset key and version (use the same place as Task 3's tags if Task 3 is on `main`); (7) Task 3's PR status, so the Short-side consumers do not conflict with its changes to the same files; (8) the contradiction D1 and D4 in the exact lines; (9) each row of the "Where things sit today" table in `PROMPT_LAYERS.md`: confirmed, moved, or wrong, with the current line; (10) the `fact policy` each live channel's profile sets (`brief-only` or not) and whether the debug bundle stores the assembled prompt of a call (if not, say what a run would need to store so a prompt can be traced to its layers; do not build it).

**Verify**: real files and names listed; conflicts with this task listed; stop and return to the architect if anything needs a migration.

## R1. The preset library (data) and the schema

**Where**: a new data file, for example `studio/src/channel-direction/presets.ts`, and `channel-profile/schema.ts`.

**Fix**: each preset is `{ key, version, label, summary, parts }`. `summary` is one plain sentence for the picker (`label` and `summary` are proposed wording the founder has not separately reviewed; the prompt text itself is approved). Keys: `history`, `story-first`, `explainer`, and `neutral` (the fallback; its parts are generic, and some are empty). All four are the founder-approved text in the Presets section of `decisions/PROMPT_LAYERS.md`, copied verbatim. `history` is not a copy of today's consumer text; the report still records the line numbers of the consumer text each preset replaces. Add to `ChannelProfileDataSchema`: `direction: z.object({ preset: z.enum(keys), note: z.string().max(300).optional() }).strict().optional()`. **Preset lint** (a test, PR A): every part is a plain sentence or two of at most 120 words; no digit, for any preset; no channel, brand or topic name (a preset may use the ordinary words of its own craft family, such as "historical" in `history`); no banned-phrase list; the required parts are present for each preset (the Presets section of `decisions/PROMPT_LAYERS.md` lists them).

**Verify**: a profile with a valid `direction` saves; an unknown preset, a long note, or an extra field fails loudly; each preset's parts, `version`, `label` and `summary` equal the Presets section of `decisions/PROMPT_LAYERS.md` character for character (a test that reads `docs/decisions/PROMPT_LAYERS.md`; the block format is fixed: `### preset: <key>`, then one `- **part:** text` bullet per line, `(empty)` for an empty part; if a test under `studio/` cannot read that path in CI, stop and tell the architect); the preset lint passes for all four presets and fails on a deliberately bad fixture.

## R2. The resolver

**Fix**: `resolveChannelConfig` returns `direction`: the chosen preset's parts, the note, and `presetKey` and `presetVersion`. A profile with no `direction` resolves to the `neutral` preset, named in one constant (`FALLBACK_PRESET = 'neutral'`). The note is appended after the parts, never replacing them.

**Verify**: with no `direction`, the resolved object is the neutral preset's; with `direction`, the parts and note appear; unknown keys cannot reach the resolver (schema rejects them).

## R3. Shorts consumers

**Fix**: make the consumers that touch Shorts read the resolved direction: the frame review (`video-intelligence`, "unrelated to the historical topic" and "dramatic tone", audit A7), the Short planner's niche examples and "historical event" wording (A8, D6; the audit's finding that a channel-fixed visual source already bypasses the forced rule is confirmed or corrected in R0), and any hook or ending rule in the Short writer and the Short review that is channel-specific (R0 lists them; the audit found none in the Short writer's persona). For each: the platform sentence stays in code; the channel-specific sentence comes from a part.

**Verify**: for each of the three channels, every consumer's built prompt differs from `main` only where a channel-specific sentence was replaced by the resolved parts (snapshot diff, same inputs); a test shows the frame review for an `explainer` channel and for a `story-first` channel no longer says "historical".

## R4. Long-form consumers

**Fix**: the long writer's persona and rules (audit A1, A2: "master historical documentary filmmaker", "moment in history", the cliffhanger outro, "NEVER start a chapter with an explicit question"), the long review's hook rule (A4, "plunge ... into a high-stakes ... historical moment", bans questions), the long planner (`plan-long.ts`), and the format hint contradiction (D1: the format's "each chapter opens with the question it answers" against the writer's ban; D4: the hard-coded "NEVER" ban overriding a channel's banned lists). `chapterStyle` decides whether a chapter may open with a question, so the platform text and the format hint can no longer contradict. Per `PROMPT_LAYERS.md` the format owns structure only: the format hint's style words ("each chapter opens with the question it answers", "a closing line that points forward", `manifest.ts:103`) move into the preset's `chapterStyle` and `endingRule`, and the format keeps the chapter count and length. Say in the report how each of D1 and D4 was resolved and for which preset. Do not edit the format's own wording in `formats/manifest.ts` beyond what this requires, and report every line you touch there; the topic words in the brief template (`manifest.ts:33`) are listed in the sweep (R9) if you leave them.

**Verify**: as R3, for the long consumers; a test shows the writer prompt and the format hint never give opposite chapter-opening rules for any preset.

## R5. Set the three channels (data)

**Fix**: set `direction` on each channel's active profile through a new profile version that **keeps every other field unchanged**: NIYT `history`, Cold Open `story-first`, Start to Shelf `explainer`. Provide one admin script (dry run by default, follows the `invite-tenant` script's pattern) that the founder runs once on the server, and say plainly in the first reply what the founder must run. If the Task 3 app picker has landed by then, the founder may use it instead; the script stays as the audited path. **Order:** the script is built in PR A (it needs only the schema). PR A merges and deploys, the founder runs the script, and only then may PR B merge. Until PR B merges no consumer reads `direction`, so setting it early changes nothing. If a live channel has no profile at all, the script refuses and says so (the first profile is the founder's to create in the app); report it before PR B starts.

**Verify**: reopen each profile after saving and compare field by field with the old version (only `direction` differs); the script refuses an unknown channel and never changes another field.

## R6. Preset text approval (before PR B starts)

**Fix**: the founder approved each preset's text in the architect chat (decisions 7a and 7b), and the architect put it in the Presets section of `decisions/PROMPT_LAYERS.md` (it moved there from this doc in r5, so it does not go stale when this task closes). You copy it verbatim; you never edit it. Put each preset's final parts, verbatim, in the PR description and the report so the founder can check them once more against what the code assembles. Sources, for your information only: `story-first` (Cold Open) from `COLD_OPEN_CHANNEL_CONFIG.md` v1.1 with its channel-specific rules left in its content profile (the truth layers, "popular version, then record", the sentence-length caps, the case-type rotation); `explainer` (Start to Shelf) from `START_TO_SHELF_CHANNEL_CONFIG.md` v0.2, with its own rules left in its content profile; `history` is written fresh from the craft the old long-form prompts described (a documentary storyteller, a vivid opening, conflict and turning points, rhythmic sentences), without their wording. If the text you must copy fails the preset lint or the preset test in `PROMPT_LAYERS.md`, stop and tell the architect; do not fix the text yourself.

**Verify**: each preset's parts in the code equal the Presets section of `decisions/PROMPT_LAYERS.md` character for character (the R1 test); the founder's approval is recorded in this doc's revision log (r4).

## R7. The grep proof

**Fix**: after the evaluation (R8) is acceptable, run the proof: `git diff origin/main...HEAD -- studio app | grep '^+' | grep -iE 'histor|heist|crime|textbook|cold open|niyt|lego|mary celeste|roman|shelf'` returns only lines inside the presets data file (list them) and test fixtures with neutral names. Also search the consumers for the words the audit listed.

**Verify**: a channel with no direction gets the neutral prompt (tested since PR A); the three real channels get their approved presets; no history, crime or niche word remains outside the presets data file except the debt list.

## R8. Evaluation (PR C), under the spend ceiling

**Fix**: **before** PR B merges, capture baseline outputs from today's code for each of the three channels: one Short each, and one long video for NIYT and Cold Open (propose the exact set and its cost in your first reply; the founder confirms). After PR B, run the same briefs again. Report: the prompt diff for each channel, the output side by side, a **leak detector** (plain code: history words in a non-history channel's script, review notes and frame review), and, if Task 3's cold reader is on `main`, the same blind read on both versions (else the founder reads the pairs). Also two invented neutral briefs (no channel) as Shorts to prove the neutral fallback. Spend: **$6 ceiling**, hard; state the estimate first; stop and report at the ceiling. Everything else is offline with a mocked model.

**Verify**: for each of the three channels, the prompt diff is exactly the replaced channel sentences plus the approved preset parts; no history word in a non-history channel's output. All three channels change, so the founder reads each pair (NIYT's too, though it will be rewritten later).

## R9. Same-cause sweep (Hard rule 9)

Causes: (a) a channel-specific or niche sentence in a shared prompt or code; (b) a rule written in two places that drifted (the audit's E4: the no-logos and no-text rules in four places); (c) a model, limit or text defined outside its owner. Search `studio/` and `app/` and list each hit as fixed here, left alone with a reason, or needing a new task. Leave `rules.ts` examples, the dead score-cap text and the registry comments to their own tasks and list them.

## R10. Make the layers enforceable (tests, not intentions)

**Where**: the checks in the "Enforcement" table of `decisions/PROMPT_LAYERS.md` that Task 4 owns.

**Fix**: (a) **Prompt-neutrality scan**, a source scan in the pattern of `llm/no-output-cap-outside-llm.test.ts`: it reads the prompt files of layers 1, 2 and 4 and fails on a channel, niche or brand word. Build it in PR A with a written debt list of today's hits (the audit's list, confirmed in R0); each later PR removes the entries it fixes; in PR C the list holds only the review-rule examples (`script-review/rules.ts`, left to their own task) and the scan fails on anything else. (b) **Preset lint** (R1). (c) **Writer and reviewer agree** (PR B): for every preset, a test shows the writer prompt and the reviewer prompt carry the same hook, ending and pacing part text. (d) **Bundle scan** (PR B): a test fails when a consumer reads `Channel.styleGuide`, `Channel.defaultVoice` or the profile JSON outside `channel-profile/` and the bundle builder; R0 lists the exact fields. (e) **Profile-save warnings** (PR A, server): `channels.createProfileVersion` returns an optional `warnings: string[]` and still saves. It warns when `script.guide` holds a number next to words, sentences or seconds (a limit that belongs in a field), or repeats a sentence of the chosen preset exactly. Plain code, no model call. (f) **Layer versions on the run** (C1): the run records `presetKey` and `presetVersion` next to `profileVersionId`.

**Verify**: each check fails on a deliberate bad fixture and passes on the real tree; the debt list is in the report with each entry's owner; the warnings test covers both warning kinds and a clean profile.

## Not in this task

The preset picker screen and the channel settings clean-up (app; Contract C5 and C6, built with the Task 3 app task). The brief check at intake and the structured sentence-length fields (P23). One definition of the `brief-only` fact policy and the platform safety lines, with a before-and-after on live channels (P22). The neutral review-rule examples and the dead score-cap text (separate task). The model experiment on the still check and frame review. The zero-behaviour prompt tidy-up (separate task; coordinate on the same files through `main`). Story-first or explainer variants beyond the one preset each. Per-field direction forms. Any retention or analytics route.

## Contract (API and app)

**C1. Storage.** `ChannelProfileDataSchema` gains `direction?: { preset: 'history' | 'story-first' | 'explainer' | 'neutral'; note?: string }` (note up to 300 characters, strict). It lives in the profile version's JSON; **no database migration** (R0 confirms). A run already pins its profile version (`profileVersionId`), so the preset a run used is recoverable; the run also records `{ presetKey, presetVersion }` in its tags place (R0 item 6) because a preset's text can change between versions.

**C2. Read: `channels.directionPresets`** (query, no input, same auth as `channels.getActiveProfile`):
```
channels.directionPresets -> {
  key: 'history' | 'story-first' | 'explainer' | 'neutral',
  version: number,
  label: string,                 // server wording, e.g. "History documentary"
  summary: string,               // one plain sentence for the picker
  parts: { key: string, label: string, text: string }[]   // what this preset sets, in plain words; empty for neutral
}[]
```
The app shows labels, summaries and part texts exactly as given and never keeps its own copy. `channels.getActiveProfile` already returns the profile data, so `data.direction` is read from there.

**C3. Write: the existing `channels.createProfileVersion`.** The app sends the whole profile data with `direction` changed; the server validates with the schema (an unknown preset or a note over 300 characters is `BAD_REQUEST`). No new mutation. The save keeps every other field unchanged: the app must send back what it read. The result gains an optional `warnings: string[]` (server wording, R10 e); a save with warnings still succeeds, and an older app that ignores the field keeps working.

**C4. Resolved direction (server only).** `resolveChannelConfig` returns `direction` with the parts, the note, `presetKey` and `presetVersion`. It is not sent to the app.

**C5. App: the picker (built with the Task 3 app task).** On the Content profile screen a "Creative direction" card: the presets from `channels.directionPresets` as choices (label, summary, and a "what this changes" list of the parts), one note field, and the existing save (a new profile version). The current choice is read from `getActiveProfile`. After a save, any `warnings` from `createProfileVersion` are shown as given, under the card. No verdict or text is computed in the app. Behind an app flag `creativeDirection` (`app/lib/feature-flags.ts`, default false until the phone check), as `gate2PackageScreens` was.

**C6. App: channel settings clean-up (same app task).** On `main` (1 Nov) the channel settings screen shows a "Style guide" box under the niche description and a "Default voice" row **only when the channel has no content profile**; with a profile it shows a note "Default voice and style guide now come from the content profile. Edit them there." (`app/app/(app)/channel/[id].tsx`, around lines 360 to 413). Those duplicates are removed: no style guide box and no default voice row on the settings screen at all. A channel with no profile shows a "Set up content profile" entry in their place. Captions, watermark and the other settings stay. If the founder still sees the duplicates on a channel that has a profile, report which channel and which build before changing anything.

**C7. Tests for the contract.** A profile saves with each preset and with no `direction`; an unknown preset, a long note or an extra field is rejected; `directionPresets` returns the four presets with server wording; a profile with no `direction` resolves to the neutral preset; a run records its preset key and version; `createProfileVersion` returns `warnings` for a guide holding a limit in prose and for a guide that repeats a preset sentence, and none for a clean profile; tenant isolation holds on the profile calls.

## Schema Impact

None expected. The profile data is JSON validated in code; `direction` is a new optional object. R0 confirms there is no database check or column to change. Any migration stops the task and goes to the architect.

## Business Logic / State Transition

No run state changes. The resolved direction is read when a prompt is built; a run keeps the profile version it started with, so a profile change affects new runs only (as today).

## Spend

Proposals, not verified against current prices; the founder confirms before work starts. **Evaluation ceiling: $6**, hard (decision 6); the agent states the exact estimate for the chosen set of briefs in its first reply and stops at the ceiling. All other tests use a mocked model.

## Testing

Backend and app type check, lint, build and the focused tests R0 finds; the full suite with `--maxWorkers=4` (say so). Cover: the schema (valid and invalid `direction`); the preset data (a test that each preset equals the Presets section of `decisions/PROMPT_LAYERS.md`); the resolver (no `direction` gives neutral); **snapshot tests of every consumer's built prompt** for each preset, so every prompt change is a visible diff; the D1 and D4 contradictions gone for every preset; the grep proof; tenant isolation on the profile calls; the admin script (dry run, refusal on an unknown channel, only `direction` changes).

## Delivery: three PRs

- **PR A (`SPRINT6_TASK4A_BE`)**: R0, R1 (with the preset lint), R2, R5 (the admin script), the contract's C1 to C4 and the `warnings` of C3, snapshots of every consumer as it is on `main` (the baseline the later diffs are read against), `directionPresets`, and R10 (a), (b), (e), (f). No consumer changes yet, so no prompt changes. Merge first so the app task can start in parallel. After it deploys, the founder runs the R5 script.
- **PR B (`SPRINT6_TASK4B_BE`)**: R3 (Shorts consumers), then R4 (long-form consumers), R6, and R10 (c) and (d). The preset text is already approved (the Presets section of `decisions/PROMPT_LAYERS.md`). Merge only after the founder has run the R5 script and the baseline outputs are captured (R8).
- **PR C (`SPRINT6_TASK4C_BE`)**: R7 (the grep proof), R8 (the evaluation), R9, and R10 (a) made a hard failure. Merge `main` into your branch first. Report after each PR; Hard rule 8 closing runs after PR C merges.

## Report

`docs/execution/sprint6/reports/task4.md` (one report, a section per PR): branch, worktree and PR at the top; the R0 table; the contract as built; every consumer's old and new prompt text (a diff); the D1 and D4 resolution; the preset texts and the founder's approvals; the evaluation (baseline, after, leak detector, cost per call against the $6); the grep proof; the sweep section; Hard rules 5 to 9 lines; code-complete, merged and deployed as three separate statements; open founder decisions. **State plainly** which prompts changed for which channel. Say what you could not verify. Give the architect a one-line status for `PLAN.md`.

## Not verified by the architect

Code (nothing in this doc was run; the line references come from the prompt audit at `9be48fb` and from reading `schema.ts`, `resolve.ts`, `channels.ts` and the channel settings screen on `main` on 1 Nov). Whether any database check touches the profile JSON. The current contents of the three channels' profiles (they live in the database). Whether Start to Shelf has a profile at all, and which fact policy each live channel sets. **Git and the Project differed:** the Cold Open and Start to Shelf channel docs (and `CHANNEL_MANAGER_ROLE.md`, `COLD_OPEN_CONTENT_PLAN.md`) were in the Project but not on `main` on 1 Nov. The doc pull request that adds this task adds them, copied from the Project (Start to Shelf without its line naming Clocked In as active). They are inputs, not rules for you: the preset text you need is in the Presets section of `decisions/PROMPT_LAYERS.md`. What the debug bundle stores per call. Cold Open's current behaviour under the history persona (the founder's own reports say its videos were not watchable; whether the persona caused that is not established).

## Links & References

`decisions/PROMPT_LAYERS.md` (the contract this task makes true) · `sprint6/PLAN.md` (P16, section "2026-10-26 Plain Prompt gaps") · `channel_bibles/COLD_OPEN_CHANNEL_CONFIG.md` v1.1 · `channel_bibles/START_TO_SHELF_CHANNEL_CONFIG.md` v0.2 · `channel_bibles/NIYT_CHANNEL_CONFIG.md` · the prompt audit report (branch `PROMPT_AUDIT`) · `sprint6/tasks/task3.md` (the app task shares the Contract's C5 and C6) · `sprint5/bugs/tasks/acceptance-run-1.md` (grep proof) · `decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md`.

## Revision log
- r1, 2026-11-01: first issue (architect). Cold Open is a real-crime story channel, not history, so the plan's "existing channels get history" is corrected; three presets plus neutral; the fallback flips inside this task; Shorts consumers first; the picker and the settings clean-up are in the Contract and built with the Task 3 app task.
- r2, 2026-11-01: the prompt layers are locked (`decisions/PROMPT_LAYERS.md`, founder, 1 Nov). Added: the layers as the governing rule and constraint; two preset parts (`storyShape`, `avoid`); the preset lint; R0 items 9 and 10; the D1 resolution by layer (the format keeps structure, style words move to the preset); R10 (the checks that make the layers enforceable); `warnings` on `createProfileVersion` (C3, C5, C7); three live channels confirmed (Clocked In is not live); Start to Shelf's doc found (decision 8 closed); preset text is approved in the architect chat first and added as Appendix A before the task starts (decision 7 reworded).
- r3, 2026-11-01: founder decisions of 1 Nov. NIYT is not carried forward (it will be rewritten as a channel), so `history` is written fresh like the others and there is no byte-identity: removed the byte-identical success criterion, the verbatim `history` test, the recorded `history` exceptions in the preset lint, the pre-flip fallback and the flip step. The fallback is `neutral` from PR A; the R5 script moves to PR A and runs before PR B merges. `story-first`, `explainer` and `neutral` approved as presented and added as Appendix A; `history` drafted there and awaits approval. The four channel docs are added by the same doc pull request.
- r4, 2026-11-01: the founder approved the `history` text and confirmed the note length at 300 characters (decisions 7 and 9 closed). Appendix A is final: all four presets approved. No other change.
- r5, 2026-11-01: the preset text moved out of this doc into the Presets section of `decisions/PROMPT_LAYERS.md` (founder, "go"), so the channel owners read it in one place and it outlives the task. The R1 test now compares the code to that section instead of an appendix here. Added `label` and `summary` (proposed picker wording) and a fixed block format. No change to the approved prompt text.


## Appendix A: Preset text (moved)

The four approved presets (history, story-first, explainer, neutral) are in the Presets section of `decisions/PROMPT_LAYERS.md`. Copy them verbatim; never edit them. The required parts, the block format, the proposed labels and summaries, and what stays in Cold Open's content profile are there too.

Deliberate changes from today's long-form prompts, approved with the `history` text (list them in the report's prompt diff): the old outro's cliffhanger that bridges to a future topic is dropped (it conflicts with "no promise of another video", which every preset keeps); the comparison to named streaming productions is gone; the old rule of 50 to 100 words of tension before context is now "let the tension build" (the number belongs in a field, not in a preset); the old ban on opening a chapter with a question stays.
