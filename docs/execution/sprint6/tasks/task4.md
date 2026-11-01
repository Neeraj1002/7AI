# Sprint 6 Task 4: Creative direction per channel (P16): presets as data, one resolved direction object, the prompts read it

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow, the Hard rules (5 to 9: task doc sync, pull `main` before ready, who owns which doc, close after merge, same-cause sweep), the `STATUS.md` rule and the report shape. This file states only this task's specifics. Keep every reply to the founder to 3 lines; only the report is long. Do not edit `STATUS.md`, `PLAN.md` or any doc except your own report and the docs named in the Report section.

**Revision**: r1, 2026-11-01.

**Written**: 2026-11-01 by the architect chat (there is no task writer for this item), from `sprint6/PLAN.md` P16, the prompt audit of 1 Nov, and the founder's answers of 1 Nov. **Status**: not started; starts when this doc is merged and the founder confirms the open decisions at the top. **Priority**: P2. **Branches**: `SPRINT6_TASK4A_BE`, `SPRINT6_TASK4B_BE`, `SPRINT6_TASK4C_BE`; worktrees `task4a`, `task4b`, `task4c` under `D:\Study Material\7AI-SPRINT6`. The app part (the preset picker and the channel settings clean-up) is **not** in this agent's work: it is built with the Task 3 app task (Contract C5 and C6 below). Give branch, worktree and PR in your first reply and at the top of the report (Hard rule 7).

## Founder decisions

Answered on 1 Nov:
1. **Presets, not per-setting forms.** A channel's direction is one preset plus one short free-text note. No per-field form.
2. **Which preset for which channel today.** Three channels exist: Not In Your Textbook (NIYT) gets `history`; Cold Open gets `story-first`; Start to Shelf gets `explainer`. **Correction to the plan row:** Cold Open is not a history channel. Since 30 Oct it tells real cons, heists, thefts, forgeries and trials from history, legend first and then the record, in a plain confident third-person voice (`channel_bibles/COLD_OPEN_CHANNEL_CONFIG.md` v1.1, sections 1, 2 and 8). So only NIYT can keep its prompts byte-identical; Cold Open's and Start to Shelf's will change, on purpose.
3. **Switch the fallback to neutral inside this task**, after the three channels have explicit direction (so no channel is left on the old built-in behaviour). A fourth channel later gets its own preset; with none it gets neutral.
4. **Build three presets now** (history, story-first, explainer) plus the neutral fallback. The plan's other names (explainer-utility, facts-list) stay names only until a channel needs them.
5. **Shorts consumers first** (the daily videos are Shorts), then long-form.
6. **Evaluation ceiling $6**, hard, with the final cap proposed after the first check.

Still open (the founder answers before the step named):
7. **Each preset's text is approved by the founder one at a time** (R6) before PR B starts. `history` is a verbatim copy of today's text, so its approval is a check that nothing changed.
8. **Start to Shelf's description.** No Start to Shelf channel doc was found in the Project on 1 Nov. The only source is the founder's line: a stock-footage channel that explains how small everyday things go from raw material to product. The founder gives a few lines (voice, hook, ending) or says "draft it and I will edit" before R6.
9. **Note length.** Proposed 300 characters. Confirm.

## Objective

Move every piece of channel-specific creative direction out of shared prompts and into data, so a channel's voice, hook, ending, chapter style, pacing and visual-review tone come from its chosen preset, and the code holds only a neutral platform contract. Today the history persona is in the code: the long script writer is told it is "a master historical documentary filmmaker", the long review rewards a "historical moment" hook, the frame review fails pictures "unrelated to the historical topic", and the format hint and the writer contradict each other on chapter openings (audit findings A1, A2, A4, A7, A8, A9, D1, D4). Three channels now argue with that on every run.

**Success Criteria**: (1) a profile can hold `direction { preset, note }`, validated; (2) `resolveChannelConfig` returns one resolved direction every consumer reads; (3) with `history` on NIYT, the prompts every consumer builds are **byte-identical** to `main` for the same inputs (snapshot tests); (4) Cold Open and Start to Shelf prompts change only where their preset text differs, and the founder has approved that text; (5) after the flip, no history, crime or niche word is in any shared prompt or code path outside the preset data file (grep proof); (6) the picker's read query exists and returns server wording; (7) each run records which preset and preset version made it; (8) the before-and-after evaluation is in the report under the spend ceiling; (9) full tests, type check and lint pass.

## Constraints that decide every choice

- **Presets are data, not code.** One data file holds the presets (R1). History words inside that data file are allowed and are named in the grep proof; they are allowed nowhere else.
- **Parts, not prose.** A preset is a set of small named parts (below). A new preset reuses parts; the consumers assemble the same sentences the same way.
- **Zero change where promised.** For `history`, a consumer must produce today's exact text. Where today's prompt has a sentence that is not channel-specific (for example the JSON rules and safety rules), it stays in the platform contract unchanged.
- **Do not touch the review rules' examples** (the Lego, Roman and "$120" examples in `script-review/rules.ts`, audit A5 and A6) or the dead score-cap text (B5): those are a separate task with its own before-and-after. If a consumer needs `rules.ts`, read it, do not edit it. Report anything you find.
- **No new LLM calls, no new agent, no framework.** Plain code assembles the prompts. Existing registry purposes only.
- **Channel-generic (Key Principle 11).** No channel name in code. The three channels are data in the database; this task sets their profile through R5.
- **Stop rule.** A database migration, a new native dependency, or a change to an existing flow stops the task: ask the architect. (Profile data is JSON and `ChannelProfileDataSchema` is strict, so a new `direction` object is a schema change in code, not in the database; R0 confirms.)
- **Preset parts** (from the plan): `persona` (who the writer is), `domain` (what the channel covers, one line), `hookRule`, `endingRule`, `chapterStyle`, `pacingCues`, `visualReviewTone`. Hashtag words stay in `packaging.hashtagsBase` where they already are; do not duplicate them.

## R0. Read the real code first and confirm

**Where**: `studio/src/channel-profile/` (`schema.ts`, `resolve.ts`), `api/routers/channels.ts` (`getActiveProfile`, `createProfileVersion`), `run-pipeline/resolved-config.ts` and where `resolveChannelConfig` is called, every consumer in the audit (`agents/script-generation/index.ts`, `long-form.ts`, `agents/script-review/index.ts`, `agents/video-intelligence/index.ts`, `video-generation/plan.ts`, `plan-long.ts`, `still-check.ts`, `formats/manifest.ts`, `agents/publishing/index.ts`), `models/repositories/channel-profile-version.repository.ts`, how a run pins its profile version (`profileVersionId`), the app's content profile screen (`app/app/(app)/channel/[id]/profile`) and channel settings screen (`channel/[id].tsx`), and the prompt audit report (branch `PROMPT_AUDIT`; if it is not on `main`, the founder supplies it).

**Fix**: a confirmed / wrong / unknown table in the report **before** choosing files or shapes. Confirm at least: (1) every line of channel-specific text in a consumer, with file and line (start from the audit; its line numbers are from `9be48fb`); (2) whether adding `direction` to the profile needs any database change (expected: none); (3) which prompts a profile-less channel reads today (the legacy path); (4) how the three channels' profiles look now: NIYT's, Cold Open's (v1.1 section 8 says "save as a new version"), and whether Start to Shelf has one; (5) which consumers take `resolveChannelConfig` already and which receive their text another way; (6) where a run's tags or stage output can carry the preset key and version (use the same place as Task 3's tags if Task 3 is on `main`); (7) Task 3's PR status, so the Short-side consumers do not conflict with its changes to the same files; (8) the contradiction D1 and D4 in the exact lines.

**Verify**: real files and names listed; conflicts with this task listed; stop and return to the architect if anything needs a migration.

## R1. The preset library (data) and the schema

**Where**: a new data file, for example `studio/src/channel-direction/presets.ts`, and `channel-profile/schema.ts`.

**Fix**: each preset is `{ key, version, label, summary, parts }`. `summary` is one plain sentence for the picker. Keys: `history`, `story-first`, `explainer`, and `neutral` (all parts empty or generic; the fallback). `history.parts` is today's text, copied verbatim from the consumers (persona, rules, hook, outro, visual-review tone) with the line numbers recorded in the report. `story-first` and `explainer` are drafted by you from the sources in R6 and approved by the founder. Add to `ChannelProfileDataSchema`: `direction: z.object({ preset: z.enum(keys), note: z.string().max(300).optional() }).strict().optional()`.

**Verify**: a profile with a valid `direction` saves; an unknown preset, a long note, or an extra field fails loudly; `history` parts equal the text on `main` (a test that compares them).

## R2. The resolver

**Fix**: `resolveChannelConfig` returns `direction`: the chosen preset's parts, the note, and `presetKey` and `presetVersion`. A profile with no `direction` resolves to the **pre-flip fallback**, named in one constant (`FALLBACK_PRESET = 'history'`), so every channel with no direction behaves exactly as today. R7 flips that constant to `neutral`. The note is appended after the parts, never replacing them.

**Verify**: with no `direction`, the resolved object equals today's behaviour; with `direction`, the parts and note appear; unknown keys cannot reach the resolver (schema rejects them).

## R3. Shorts consumers

**Fix**: make the consumers that touch Shorts read the resolved direction: the frame review (`video-intelligence`, "unrelated to the historical topic" and "dramatic tone", audit A7), the Short planner's niche examples and "historical event" wording (A8, D6; the audit's finding that a channel-fixed visual source already bypasses the forced rule is confirmed or corrected in R0), and any hook or ending rule in the Short writer and the Short review that is channel-specific (R0 lists them; the audit found none in the Short writer's persona). For each: the platform sentence stays in code; the channel-specific sentence comes from a part.

**Verify**: for NIYT with `history`, every consumer's built prompt equals `main` exactly (snapshot, same inputs); for Cold Open and Start to Shelf the prompts differ only in the parts; a test shows the frame review for an `explainer` channel no longer says "historical".

## R4. Long-form consumers

**Fix**: the long writer's persona and rules (audit A1, A2: "master historical documentary filmmaker", "moment in history", the cliffhanger outro, "NEVER start a chapter with an explicit question"), the long review's hook rule (A4, "plunge ... into a high-stakes ... historical moment", bans questions), the long planner (`plan-long.ts`), and the format hint contradiction (D1: the format's "each chapter opens with the question it answers" against the writer's ban; D4: the hard-coded "NEVER" ban overriding a channel's banned lists). `chapterStyle` decides whether a chapter may open with a question, so the platform text and the format hint can no longer contradict: say in the report how each of D1 and D4 was resolved and for which preset. Do not edit the format's own wording in `formats/manifest.ts` beyond what the chosen design needs; report it.

**Verify**: as R3, for the long consumers; a test shows the writer prompt and the format hint never give opposite chapter-opening rules for any preset.

## R5. Set the three channels (data)

**Fix**: set `direction` on each channel's active profile through a new profile version that **keeps every other field unchanged**: NIYT `history`, Cold Open `story-first`, Start to Shelf `explainer`. Provide one admin script (dry run by default, follows the `invite-tenant` script's pattern) that the founder runs once on the server, and say plainly in the first reply what the founder must run. If the Task 3 app picker has landed by then, the founder may use it instead; the script stays as the audited path.

**Verify**: reopen each profile after saving and compare field by field with the old version (only `direction` differs); the script refuses an unknown channel and never changes another field.

## R6. Preset text approval (before PR B starts)

**Fix**: put each preset's parts, verbatim, in the PR description and in the report for the founder to approve one at a time. Sources: `history` is copied from the consumers (nothing to author; show it as "no change"). `story-first` (Cold Open) is drafted from `COLD_OPEN_CHANNEL_CONFIG.md` v1.1, **keeping channel-specific rules out of the preset**: the truth layers (documented, debated, unknown, imagined) and the "popular version, then record" rule are Cold Open's own and stay in its style guide (`script.guide`); the preset holds the story mechanics only (an in-scene open, tension by withholding, no hype, an ending that lands on what the record supports or leaves open, no "you"). `explainer` (Start to Shelf) is drafted from the founder's answer to decision 8 and the saved Shorts scriptcraft notes. No preset text goes into PR B until the founder approves it.

**Verify**: the founder's approval for each preset is recorded in the PR before PR B merges.

## R7. The flip and the grep proof

**Fix**: after the three channels have direction and the evaluation (R8) is acceptable, change `FALLBACK_PRESET` to `neutral`, update the tests, and run the proof: `git diff origin/main...HEAD -- studio app | grep '^+' | grep -iE 'histor|heist|crime|textbook|cold open|niyt|lego|mary celeste|roman|shelf'` returns only lines inside the presets data file (list them) and test fixtures with neutral names. Also search the consumers for the words the audit listed.

**Verify**: a channel with no direction gets the neutral prompt; the three real channels are unchanged from before the flip.

## R8. Evaluation (PR C), under the spend ceiling

**Fix**: **before** PR B merges, capture baseline outputs from today's code for each of the three channels: one Short each, and one long video for NIYT and Cold Open (propose the exact set and its cost in your first reply; the founder confirms). After PR B, run the same briefs again. Report: the prompt diff for each channel, the output side by side, a **leak detector** (plain code: history words in a non-history channel's script, review notes and frame review), and, if Task 3's cold reader is on `main`, the same blind read on both versions (else the founder reads the pairs). Also two invented neutral briefs (no channel) as Shorts to prove the neutral fallback. Spend: **$6 ceiling**, hard; state the estimate first; stop and report at the ceiling. Everything else is offline with a mocked model.

**Verify**: NIYT's before and after prompts are identical; Cold Open and Start to Shelf changes are exactly the approved preset parts; no history word in a non-history channel's output.

## R9. Same-cause sweep (Hard rule 9)

Causes: (a) a channel-specific or niche sentence in a shared prompt or code; (b) a rule written in two places that drifted (the audit's E4: the no-logos and no-text rules in four places); (c) a model, limit or text defined outside its owner. Search `studio/` and `app/` and list each hit as fixed here, left alone with a reason, or needing a new task. Leave `rules.ts` examples, the dead score-cap text and the registry comments to their own tasks and list them.

## Not in this task

The preset picker screen and the channel settings clean-up (app; Contract C5 and C6, built with the Task 3 app task). The neutral review-rule examples and the dead score-cap text (separate task). The model experiment on the still check and frame review. The zero-behaviour prompt tidy-up (separate task; coordinate on the same files through `main`). Story-first or explainer variants beyond the one preset each. Per-field direction forms. Any retention or analytics route.

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

**C3. Write: the existing `channels.createProfileVersion`.** The app sends the whole profile data with `direction` changed; the server validates with the schema (an unknown preset or a note over 300 characters is `BAD_REQUEST`). No new mutation. The save keeps every other field unchanged: the app must send back what it read.

**C4. Resolved direction (server only).** `resolveChannelConfig` returns `direction` with the parts, the note, `presetKey` and `presetVersion`. It is not sent to the app.

**C5. App: the picker (built with the Task 3 app task).** On the Content profile screen a "Creative direction" card: the presets from `channels.directionPresets` as choices (label, summary, and a "what this changes" list of the parts), one note field, and the existing save (a new profile version). The current choice is read from `getActiveProfile`. No verdict or text is computed in the app. Behind an app flag `creativeDirection` (`app/lib/feature-flags.ts`, default false until the phone check), as `gate2PackageScreens` was.

**C6. App: channel settings clean-up (same app task).** On `main` (1 Nov) the channel settings screen shows a "Style guide" box under the niche description and a "Default voice" row **only when the channel has no content profile**; with a profile it shows a note "Default voice and style guide now come from the content profile. Edit them there." (`app/app/(app)/channel/[id].tsx`, around lines 360 to 413). Those duplicates are removed: no style guide box and no default voice row on the settings screen at all. A channel with no profile shows a "Set up content profile" entry in their place. Captions, watermark and the other settings stay. If the founder still sees the duplicates on a channel that has a profile, report which channel and which build before changing anything.

**C7. Tests for the contract.** A profile saves with each preset and with no `direction`; an unknown preset, a long note or an extra field is rejected; `directionPresets` returns the four presets with server wording; the resolver equals today's behaviour with no `direction` (pre-flip) and equals the neutral prompt after the flip; a run records its preset key and version; tenant isolation holds on the profile calls.

## Schema Impact

None expected. The profile data is JSON validated in code; `direction` is a new optional object. R0 confirms there is no database check or column to change. Any migration stops the task and goes to the architect.

## Business Logic / State Transition

No run state changes. The resolved direction is read when a prompt is built; a run keeps the profile version it started with, so a profile change affects new runs only (as today).

## Spend

Proposals, not verified against current prices; the founder confirms before work starts. **Evaluation ceiling: $6**, hard (decision 6); the agent states the exact estimate for the chosen set of briefs in its first reply and stops at the ceiling. All other tests use a mocked model.

## Testing

Backend and app type check, lint, build and the focused tests R0 finds; the full suite with `--maxWorkers=4` (say so). Cover: the schema (valid and invalid `direction`); the preset data (a test that `history` equals the text on `main`); the resolver before and after the flip; **snapshot tests of every consumer's built prompt** for each preset, with NIYT-with-`history` identical to `main`; the D1 and D4 contradictions gone for every preset; the grep proof; tenant isolation on the profile calls; the admin script (dry run, refusal on an unknown channel, only `direction` changes).

## Delivery: three PRs

- **PR A (`SPRINT6_TASK4A_BE`)**: R0, R1, R2, the contract's C1 to C4, `history` snapshots proving no behaviour change, and `directionPresets`. No consumer changes yet. Merge first so the app task can start in parallel.
- **PR B (`SPRINT6_TASK4B_BE`)**: R3 (Shorts consumers), then R4 (long-form consumers), R5, R6. Needs the founder's preset approvals (R6) and the baseline captured before it merges (R8).
- **PR C (`SPRINT6_TASK4C_BE`)**: R7 (the flip), R8 (the evaluation), R9. Merge `main` into your branch first. Report after each PR; Hard rule 8 closing runs after PR C merges.

## Report

`docs/execution/sprint6/reports/task4.md` (one report, a section per PR): branch, worktree and PR at the top; the R0 table; the contract as built; every consumer's old and new prompt text (a diff); the D1 and D4 resolution; the preset texts and the founder's approvals; the evaluation (baseline, after, leak detector, cost per call against the $6); the grep proof; the sweep section; Hard rules 5 to 9 lines; code-complete, merged and deployed as three separate statements; open founder decisions. **State plainly** which prompts changed for which channel. Say what you could not verify. Give the architect a one-line status for `PLAN.md`.

## Not verified by the architect

Code (nothing in this doc was run; the line references come from the prompt audit at `9be48fb` and from reading `schema.ts`, `resolve.ts`, `channels.ts` and the channel settings screen on `main` on 1 Nov). Whether any database check touches the profile JSON. The current contents of the three channels' profiles (they live in the database). Whether Start to Shelf has a profile at all. Cold Open's current behaviour under the history persona (the founder's own reports say its videos were not watchable; whether the persona caused that is not established).

## Links & References

`sprint6/PLAN.md` (P16, section "2026-10-26 Plain Prompt gaps") · `channel_bibles/COLD_OPEN_CHANNEL_CONFIG.md` v1.1 · `channel_bibles/NIYT_CHANNEL_CONFIG.md` · the prompt audit report (branch `PROMPT_AUDIT`) · `sprint6/tasks/task3.md` (the app task shares the Contract's C5 and C6) · `sprint5/bugs/tasks/acceptance-run-1.md` (grep proof) · `decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md`.

## Revision log
- r1, 2026-11-01: first issue (architect). Cold Open is a real-crime story channel, not history, so the plan's "existing channels get history" is corrected; three presets plus neutral; the fallback flips inside this task; Shorts consumers first; the picker and the settings clean-up are in the Contract and built with the Task 3 app task.
