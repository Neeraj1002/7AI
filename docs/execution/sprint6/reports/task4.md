# Sprint 6 Task 4: Creative direction per channel

**Branch / worktree / PR A:** `SPRINT6_TASK4A_BE` / `D:\Study Material\7AI-SPRINT6\task4a` / #161
**Task doc:** r6 on `origin/main` (founder selected r6; the base checkout's r1 copy is stale).
**Branch / worktree / PR B+C:** `SPRINT6_TASK4BC_BE` / `D:\Study Material\7AI\.worktrees\task4bc` / [#166](https://github.com/Neeraj1002/7AI/pull/166) (draft).
**Current base:** fetched `origin/main` at `cad5b6c` on 2026-11-24 (Asia/Calcutta).
**Current status:** Part A merged in #161 (`89fb06a`); picker #152 (`540c1c3`) and #165 (`bdafb89`) merged. B+C offline implementation complete; paid evaluation and production verification blocked. B+C merged: **no**; deployed: **no**.
**Draft blocker:** No production connection or R5 evidence for the three active profile assignments and direction-only version comparisons; no five R8 baseline outputs, original briefs/profile snapshots, or frame inputs. Local database is localhost, with only a profile-less NIYT row among the three names. No paid calls were made. Do not merge until R5 and R8 evidence is attached and evaluated under the cumulative $6 ceiling.

The PR A sections below are the historical 1–2 Nov record; their delivery/status statements describe that time, not the current merge status.

## PR A — R0 confirmed / wrong / unknown (recorded before implementation choices)

| Check | Finding | Evidence |
|---|---|---|
| Channel-specific prompt text | **Confirmed.** Long writer history persona, history rules, outro and chapter ban; long reviewer historical hook; frame review historical topic and dramatic tone; Short planner historical-event forcing and topic examples; format brief template and chapter hint. Review-rule examples remain separate-task debt. | `studio/src/agents/script-generation/long-form.ts:120-138`; `script-review/index.ts:140-154`; `video-intelligence/index.ts:281-283`; `video-generation/plan.ts:171,236`; `formats/manifest.ts:33,103`; prompt audit A1-A9, D1, D4, D6. |
| Profile storage migration | **Confirmed: none.** Profile data is a JSON column and the existing validator is strict. | `studio/src/models/schema.prisma:548`; `channel-profile/schema.ts`. |
| Profile-less channel | **Confirmed at initial audit.** The resolver then used legacy style guide and voice. Current `main` has retired those columns; after final rebase a profile-less channel has no script guide, platform default voice and neutral direction. Consumer prompts still contain built-in history text until PR B. | `channel-profile/resolve.ts`; `run-pipeline/resolved-config.ts`; main PR #157. |
| Live channel profiles and fact policies | **Unknown in production.** The configured local database was read-only checked; it has test channels and none of the three named live channels. Their active profile versions and fact policies cannot be inferred from it. | Read-only Prisma query, 1 Nov; no production connection was available. Check on server before PR B. |
| Resolved config consumers | **Confirmed.** The pipeline calls `loadResolvedConfig` for script generation, review, planning, rendering and publishing; it passes individual fields to consumers. The Short writer's system prompt takes fact policy only. | `run-pipeline/state-machine.ts:333-351,509-520,723,951,1568,2153`; `script-generation/index.ts:89-91`. |
| Run version record | **Confirmed.** `profileVersionId` pins the saved JSON. The preset key/version are stored in run-owned `creationOptions`, available from run creation; Task 3 writes separate pipeline-version tags to the completed intake stage. No dedicated run tags column was found. | `schema.prisma:294-295,325-326,407`; `state-machine.ts` createRun and runIntakeStage. |
| Task 3 dependencies | **Confirmed.** Backend PR #143, app PR #151, app picker PR #152 and followups #153/#154 merged into `origin/main` after the initial audit. PR A later rebased onto `4222a53`, including PR #157's legacy-field retirement. | `git log origin/main`; final rebase on 2 Nov. |
| D1 | **Confirmed.** The format says each chapter opens with a question; the long writer says NEVER open with an explicit question. Both reach the same prompt. | `formats/manifest.ts:103`; `script-generation/long-form.ts:130`. |
| D4 | **Confirmed.** The writer hard-codes an ending ban independent of the profile's banned lists. | `script-generation/long-form.ts:132`; `script-generation/index.ts:152-156`. |
| Prompt-layer inventory | **Confirmed with debt.** `PROMPT_LAYERS.md`'s historical wording and duplicate rules remain in the audited consumers; #145 supplies goldens and a prompt index. Detailed source scan will track each debt entry. | `docs/decisions/PROMPT_LAYERS.md`; `studio/src/agents/prompt-goldens.test.ts`; `studio/src/llm/prompt-index.ts`. |
| Profile save atomicity | **Confirmed.** Insert, version increment and active pointer update are in one Prisma transaction with a channel row lock. | `models/repositories/channel-profile-version.repository.ts:34-54`. |
| Debug bundle prompt trace | **Confirmed: no full assembled prompt.** The video attempt bundle holds script, plan, transcript, FFmpeg arguments, assets and manifest context, but no prompt per LLM call. Reconstructing a call later needs the pinned profile version, preset key/version, pipeline code version and stage inputs; storing an exact prompt would require a later trace artifact. | `storage/attempt-bundle.ts:7-109`. |
| App profile/settings | **Confirmed / doc stale.** Profile screen reads active profile and sends whole form data through `createProfileVersion`. Settings on current `main` already show “Set up content profile” and contain no duplicate style guide or default voice row. | `app/app/(app)/channel/[id]/profile.tsx:55-57,125-140`; `app/app/(app)/channel/[id].tsx:350-395`. |

**`PROMPT_LAYERS.md` “Where things sit today” audit:** long writer persona/hook/pacing/chapter/outro — confirmed in `long-form.ts:120-132`, PR B; historical tag noun — confirmed at `:138`, PR B; long reviewer/frame review/Short planner/long planner/still check — confirmed at `script-review/index.ts:141`, `video-intelligence/index.ts:281-283`, `plan.ts:171`, `plan-long.ts:159`, `still-check.ts:47`, PR B; format hint and brief template — confirmed at `manifest.ts:33,103`, PR B; review-rule examples — confirmed in `rules.ts`, separate task; two strengths of `brief-only` — confirmed in Short/long writers, P22; guide-only safety lines — production data unknown, P22; numeric sentence caps in guides — production data unknown, P23; stage context / debug prompt trace — stage inputs are stored, full prompt absent, P22 for delimited data.

### PR A implementation, verification and contract

**Scope.** Layer 3 data and storage/read contract only. No existing consumer prompt text changed. The neutral fallback is resolved now, but PR A consumers have not yet been wired to read it.

- Added four preset records from the approved `PROMPT_LAYERS.md` block, including nine named parts, versions and picker wording. An offline test compares every value character for character with that document and lints the parts. The `history` preset is new approved wording, not the old prompt.
- Added strict `direction: { preset, note? }` profile validation; note maximum 300 characters. No migration: the profile version's `data` is JSON.
- `resolveChannelConfig` now returns `direction: { presetKey, presetVersion, parts, note }`, with `neutral` when absent. The note remains separate so consumers can append it after parts in PR B.
- `channels.directionPresets` returns server labels, summaries and nonempty part texts; `createProfileVersion` returns advisory warnings for numeric prose limits or repeated preset sentences. Invalid keys, long notes and extra fields fail before the atomic insert.
- `createRun` captures the selected preset key/version in server-owned `creationOptions` alongside the already pinned `profileVersionId`; rerun strips these server fields and recomputes them.
- Added `scripts/set-channel-directions.ts`, dry run unless `--live`, with exact tenant/name lookup, all three profiles validated before writes, idempotence, active-version recheck and post-save field comparison. It refuses a missing profile or unknown/duplicate channel. The founder runs it on the server after PR A deploys; this local environment cannot reach the three live profiles.
- Extended #145's prompt goldens with Short planner, long planner and frame-review variants. Existing golden entries remain unchanged. Exporting the Short planner's pure prompt builder is the only consumer-file edit.

**Founder command after PR A deploys (first dry run, then append `--live`):**

```powershell
cd studio
npx tsx scripts/set-channel-directions.ts --tenant <tenant-uuid> --channel "Not In Your Textbook=history" --channel "Cold Open=story-first" --channel "Start to Shelf=explainer"
```

**Prompt changes by channel in PR A:** none. The saved direction is not read by a consumer until PR B. PR B must not merge until the founder has run the script and reopened all three versions.

**Enforcement debt at PR A.** The prompt-neutrality source scan covers script writer/reviewer, frame review, planners, still check, metadata, packaging and format hints. Its explicit existing debt is the old history persona/rules in long writer, long reviewer, frame review, planners and format hints; the review-rule examples; the `historic` typeface mood. Any new unmatched niche line fails. PR B/C must shrink this list. The separate-task review-rule examples and dead score-cap text remain untouched.

**Verification, 1–2 Nov:** on final base `4222a53`, focused suite **48/48**, backend and app typechecks, backend build, backend lint and direct app ESLint passed. App ESLint has two pre-existing warnings in untouched `app/lib/gate2-packaging.ts`. On earlier base `4efc56d`, the full backend suite was run once alone with one worker: **191 passed, 3 failed, 13 skipped files; 1,843 passed, 3 failed, 79 skipped tests**. Failures are named below; this full-suite count predates final main sync and is superseded by the architect review follow-up result below. Before that rebase, a full backend suite with `--maxWorkers=4` passed: 1,755 passed, 65 skipped. `expo lint` fails because its wrapper splits the worktree path at the space. No model calls or paid evaluation; spend $0.

**Delivery handoff:** PR #161 is open. The founder will push the architect review follow-up commit. This follow-up was not pushed or deployed locally.

**Contract difference to resolve with the app task:** C2 says the neutral picker entry has no parts, but the approved neutral preset has generic nonempty parts. This API returns the approved generic parts so the picker can show what it sets. The architect should clarify C2 wording.

**Exact PR A contract names and shapes.** `runs.get` takes `{ id: UUID }` and returns its existing detail object with `run`, `channel`, `stages`, `reviewLogs` and derived fields. PR A adds no top-level `direction` field to this response. Its `run.profileVersionId: UUID | null` pins the profile; `run.creationOptions` now contains server-owned `presetKey: 'history' | 'story-first' | 'explainer' | 'neutral'` and `presetVersion: number`. `channels.directionPresets` is an input-free query returning `{ key, version, label, summary, parts: { key, label, text }[] }[]`, with empty-text parts omitted. `ChannelProfileDataSchema.direction` is optional, strict `{ preset: one of those four keys, note?: string (max 300) }`; `resolveChannelConfig().direction` is `{ presetKey, presetVersion, parts: Record<persona | domain | hookRule | storyShape | endingRule | chapterStyle | pacingCues | avoid | visualReviewTone, string>, note: string | null }`. **PR A adds no migration or columns.** Its new `main` base includes migration `20261102000000_retire_channel_style_voice`, which **drops** `channels.styleGuide` and `channels.defaultVoice`; PR A neither adds nor edits that migration.

**Named media test follow-up.** The earlier four-worker full suite timed out at 120 seconds in `src/agents/video-generation/long-narration.test.ts` ("chunks the long chapter, joins with the gaps, and times each chapter") and `src/agents/video-generation/shorts-command.test.ts` ("uses a constant frame clock and the shared AAC target"). On PR A, each file passed alone with one worker: 3/3 in 24.86 seconds and 1/1 in 26.75 seconds. On isolated clean `origin/main` (`4efc56d`), each passed alone: 3/3 in 33.33 seconds and 1/1 in 18.17 seconds. Thus neither fails on clean main in isolation. The final one-worker full suite still timed out in the long narration case (120 seconds); it did not report a Shorts render failure. It also timed out in `src/agents/video-generation/long-form.replay.test.ts` ("a chapter with too few scenes gets exactly the missing scenes", 300 seconds) with an `EBUSY` cleanup error, and `src/storage/attempt-bundle.test.ts` ("a stock revision muxes a fresh original voice file", 240 seconds). Those two files then passed alone on PR A: 2/2 in 97.98 seconds and 3/3 in 92.19 seconds. Clean-main isolated checks were run for the original two timeouts only. This evidence establishes suite-only timeouts here; it does not establish their root cause.

**CI scope:** `.github/workflows/deploy.yml` runs on PRs into `main`. Its backend job runs studio typecheck, ESLint and build; its app job runs app typecheck, ESLint and app Vitest. **CI does not run the studio Vitest suite**; the local counts above are the only backend test evidence. The founder's push is needed before CI can validate this follow-up commit.

**Hard rules:** 5 — r6 was already on `origin/main`; the founder selected it over the base checkout's stale r1, so no task-doc rewrite was made. 6 — rebased onto current main `4222a53`; docs diff contains only this report. 7 — this report is the only doc written; no `STATUS.md` or `PLAN.md` edit. 8 — do not close until founder confirms merge. 9 — initial same-cause debt is tracked by the source scan; full sweep is PR C.

**Architect PLAN.md status:** Task 4 PR A is in review on PR #161; production profile data, PR B baseline and PR B/C delivery remain pending.

### PR A architect review follow-up (second commit)

The admin script now calls `setChannelDirections({ tenantId, assignments, live, repository, log })` in `channel-direction/admin-run.ts`; parsing, dry-run output, prechecks, version writes, recheck and post-save verification retain the prior behavior. Six integration tests ran against the dedicated local `sevenai_sprint6_task4_test` database, after applying the repository migrations and regenerating the Prisma client: **6 passed**. They prove dry-run output and no writes; unknown, duplicate and profile-less channel refusal without writes to the other channels; three live direction-only versions with the existing note retained; idempotent rerun; and a concurrent profile edit causing refusal before this script writes a version for that channel. The concurrent edit itself accounts for the one extra version in that fixture. The test skips against an ordinary development database.

The packaging baseline adds 16 golden entries to `prompt-goldens.json` for the system and user prompt builders in `packaging/prompts.ts` and `packaging/prompts-vision.ts`, including thumbnail and render-script builders. Both packaging source files are byte-identical to `main`; all 21 prior golden entries remain byte-identical. The builders were already exported, so no prompt source edit was needed.

| R0 audited consumer | Golden entry or entries |
|---|---|
| `agents/script-generation/index.ts` | `script-short/base`, `script-short/brief-only`, `script-short/packet-default`, `script-short/packet-brief-only` |
| `agents/script-generation/long-form.ts` | `script-long/source`, `script-long/packet` |
| `agents/script-review/index.ts` | `review-short/prompt`, `review-long/prompt`, `review-short/assembled`, `review-long/assembled`; `hard-cap-confirmation` covers its separate confirmation prompt |
| `agents/video-intelligence/index.ts` | `frame-short/stills`, `frame-short/stock`, `frame-long/stills` |
| `agents/video-generation/plan.ts` | `plan-short/free`, `plan-short/fixed` |
| `agents/video-generation/plan-long.ts` | `plan-long/free`, `plan-long/fixed` |
| `agents/video-generation/still-check.ts` | `still-check` |
| `formats/manifest.ts` | **No direct golden** for its format brief templates and chapter hints. |
| `agents/publishing/index.ts` | `metadata-short`, `metadata-long` |
| `packaging/prompts.ts` | `packaging/brief-system`, `packaging/concepts-system`, `packaging/cold-reader-system`, `packaging/brief-user`, `packaging/concepts-user`, `packaging/cold-reader-user`, `packaging/thumbnail-prompt`, `packaging/render-script` |
| `packaging/prompts-vision.ts` | `packaging/defect-system`, `packaging/critic-system`, `packaging/payoff-system`, `packaging/compare-system`, `packaging/defect-user`, `packaging/critic-user`, `packaging/payoff-user`, `packaging/compare-user` |

**Final-head verification for this follow-up:** studio typecheck and ESLint passed; app web build passed on base `4222a53` (Expo web export, 1,274 modules). Before the suite, `Get-Process` showed only three pre-existing Node processes (PIDs 9988, 12372, 13912, all started 1 Nov), with no Vitest, FFmpeg, npm, ESLint, tsc or build process. The first Vitest command failed during config startup with `EPERM` creating a Vite temp file in the linked `node_modules`; it loaded no tests. With the required filesystem access, the one full studio run used `npm test -- --maxWorkers=1`, alone: **200 passed, 14 skipped files; 1,872 passed, 85 skipped tests; zero failures** (631.85 seconds). There are therefore no final-head failure names or isolated branch/clean-main comparisons to report. The earlier media timeouts described above are historical, not failures on this final head. **CI does not run the studio Vitest suite**, so these local counts are the only backend test evidence for this commit; the founder's push must trigger CI for the second commit.

## Combined PR B+C — 24 Nov 2026

The founder requested one PR combining Parts B and C, starting from current main, with a draft if production or baseline evidence is missing. This supersedes the original three-PR delivery sequence. No app work, migration, native dependency, registry/model/limit change or new LLM purpose was needed. No database writes were performed.

### R0 refresh before implementation

| Check | Current finding and disposition |
|---|---|
| Dependencies | #145, #161, #152 and #165 are in fetched main; r6 task doc and approved preset data already present. No task-doc commit needed. |
| Consumer paths | Confirmed current shared history persona, long opening/ending/pacing/chapter rules, long review hook, frame topic/tone, planners and format hint; all changed below. Short writer still had a neutral platform role. |
| Storage and saves | Still JSON profile data; existing row-lock transaction inserts a new version and changes active pointer atomically. No schema/persistence edits. |
| Production profiles and fact policies | **Unverified.** Both available env files point to localhost. A read-only exact-name query returned NIYT with no active profile; Cold Open and Start to Shelf were absent. This is not production evidence and no profile was created/changed. The user SSH directory contains known-host files but no configured key; a BatchMode read-only command to the documented deploy server failed with `Permission denied (publickey,password)`. No server state was changed. Production profile IDs, fact policies, direction-only comparisons and deployed commit remain unknown. |
| Profile-less behavior | Resolver gives neutral. All changed consumers now receive neutral by default as well. This is tested independently of the production assignment. |
| Run version trace | Existing createRun pins profileVersionId and preset key/version in creationOptions. Intake pipelineTags now also carries resolved presetKey/presetVersion beside Task 3's build/version tags. Legacy tags remain readable with absent preset fields. |
| Consumer transport | Writer/reviewer get config.direction from the pinned bundle, Short and long planners get the same object, frame reviewer gets it plus visual style, long still checker gets it plus visual style. Packaging/metadata keep their existing resolved packaging fields; no preset is added to them. |
| Debug trace | Full prompts still are not stored per call. Goldens demonstrate assembly, not live calls. A live trace still needs pinned profile, preset version, code revision, brief/stage inputs and selected options; no trace subsystem added. |
| Layer inventory | Task 4-owned rows moved to preset assembly or neutral mechanics. Review-rule examples/dead caps remain untouched; brief-only strengths and stage-context delimiters remain P22; prose caps remain P23. |

### Implementation and prompt layers

`channel-direction/prompts.ts` is the sole assembly helper: approved part text is used verbatim, empty parts are skipped, and the channel note follows the selected parts. It explicitly labels creative direction as defaults beneath explicit brief/profile constraints and inside platform rules. Presets and versions are unchanged and still compare character for character with `PROMPT_LAYERS.md`.

- **Layers 2/3:** both writers receive persona, domain, hookRule, storyShape, endingRule, chapterStyle, pacingCues and avoid. Both reviewers receive the exact same hook, story, ending, chapter, pacing and avoid parts. Platform JSON, length, fact-policy and production-fit rules stay. Long factual-grounding wording loses the niche adjective and dramatic intensification default; factual support remains mandatory. The Short review's separate generic hook recipe is replaced by assessment against hookRule.
- **Layers 2/3:** planners receive domain (plus note); frame review and still check receive visualReviewTone (plus note and resolved visual style). The Short planner's event restriction stays as a source-selection mechanic, with the niche noun removed; fixed profile/run source still bypasses that free-choice rule. Named sports/fashion examples leave. Long planner's fallback query becomes `video`; factual-grounding sentence becomes topic-neutral.
- **Layers 2/5:** long tag count stays 3–8; generic relevant search terms replace historical terms, and packaging.hashtagsBase reaches the writer user message. Hashtag words stay in the content profile, outside presets.
- **Layer 4 / D1:** only manifest lines 33 and 103 change (base line numbers). `[Historical event/thing]` becomes `[Event/thing]`; long structure becomes `Ordered chapters with a title and spoken narration for each chapter, within the target length.` Chapter count/target limits still come from chapter-bounds and the resolved target. No other format wording changes. History forbids chapter questions; story-first permits them; explainer and neutral have empty chapterStyle and no shared question ban.
- **D4:** hard-coded chapter-opening and generic sign-off bans leave the long writer. Each preset owns its approved ending; channel banned lists remain separate profile constraints and the brief's exact mandated wording takes precedence. This applies to all four presets. No future-topic cliffhanger remains.
- **Layer 2 sweep:** packaging's typefaceMood options now come from TYPEFACE_MOODS, with no topic/brand examples assigning a font mood. Existing enum `historic` and font assets remain a compatibility/typography choice; no direction or niche gloss remains in the shared prompt source.

**Prompt changes by channel:** NIYT receives history v1; Cold Open receives story-first v1; Start to Shelf receives explainer v1. For all three, Short/long writer and reviewer, both planners, frame review and still check change deliberately. Packaging's neutral enum wording changes for all channels; other packaging/metadata prompts are unchanged. These statements describe assembly with the intended saved assignments, not verified production profiles. No channel name is in consumer code. Exact approved text is retained verbatim in this report's final section and in the PR description.

**Cache same-cause fix:** long planner input identity includes resolved direction (including note/version/parts), so a checkpoint for different direction cannot be carried forward. Still-check identity includes prompt text, topic, narration and image bytes; a different note, style or preset cannot reuse an earlier verdict. No new calls or flow were added; existing checks run on cache misses. Repair-only and timing-only rendering paths retain their existing eligibility and reuse behavior.

### Prompt goldens and R10 enforcement

Goldens were deliberately regenerated with UPDATE_PROMPT_GOLDENS=1. There are now **114** golden entries: the original 37 plus 76 direction-specific entries (19 per preset) and the format manifest. For every preset the fixture includes a note, style and profile constraints; covers both fact policies and packet/source Short writer, packet/source long writer, both assembled reviewers, writer/reviewer user messages, free/fixed Short planner, long planner, still/stock Short frame review, long frame review and still check. These are offline fixtures, not snapshots of production profiles. Existing packaging/metadata entries remain covered. Two existing chosen-angle snapshots are deliberately updated for the neutral preset block. The prompt index names the shared part assembler and preset data for every affected purpose.

`layers.test.ts` checks all presets for writer/reviewer hook-ending-pacing equality; question-rule/format consistency; notes after parts; visual tone and look; no history wording in non-history frame review; neutral fallback; pipeline tag fields; and changed planner cache identity. Its consumer source scan covers agents, packaging and story-tests, rejects direct legacy channel fields, raw profile JSON and profile repository reads, and includes deliberate bad fixtures. Preset lint, schema/warnings/tenant tests and run pinning remain in the suite. Still-check regression test proves reuse for identical inputs and recheck on changed note/style.

The neutrality source test is now a hard failure across the audited prompt files and story-tests prompts. Its only explicit debt is the unchanged review-rule example lines (`Lego rhetoric`, `salarium`, `Roman = Rome`) owned by the separate neutral-examples task. A deliberately inserted historical hook is rejected. The word `documentary` in statements that generated images are not documentary evidence is an unchanged platform factual-support distinction, not a channel persona. Prompt fixtures/goldens naturally contain approved historical preset text.

### R8 evidence and spend — blocked, not passed

| Required output | Baseline on cad5b6c | Branch on same brief | Blocker |
|---|---|---|---|
| NIYT Short, history | Missing | Not run | Production brief/profile/assignment and output absent |
| Cold Open Short, story-first | Missing | Not run | Same |
| Start to Shelf Short, explainer | Missing | Not run | Same |
| NIYT long, history | Missing | Not run | Same, plus frame inputs |
| Cold Open long, story-first | Missing | Not run | Same, plus frame inputs |
| Neutral Short: lending library | Not required | Not run | Hold paid campaign until baseline set is auditable |
| Neutral Short: kitchen timer | Not required | Not run | Same |

`channel-direction/evaluation.ts` contains the exact two invented neutral briefs, a plain-code leak detector that reports words and offsets separately in script/review/frame text, and a finite/nonnegative reservation check against the visible **$6** ceiling. Offline tests inject leaks into all three fields and check the ceiling boundary. **These tests do not establish that generated outputs are leak-free.** No live script, review, frame-review or cold-reader result exists for this PR, no side-by-side quality conclusion is made, and there is no per-call usage receipt to report. Current campaign spend **$0.00**; reserved **$0.00**; remaining **$6.00**.

The exact five briefs cannot be selected or costed from missing production inputs. No paid execution estimate is asserted as verified; the immediate offline phase is exactly $0. Before resuming, freeze the five original briefs, profile snapshots, target lengths/options and frame inputs; cost the selected existing registry calls (including Task 3's `runScriptStep` blind cold reader, which is on main) against one cumulative ledger. Reserve each call's worst case before dispatch, retain unresolved reservations, and refuse a call that could exceed $6. No paid runner or one-off money-spending script was left behind. Full media renders are not assumed affordable. Record any reduced evaluation scope as unverified, never as a full R8 pass.

### R5 / rollout steps still unverified

On the server, after confirming #161 is deployed, use the existing audited command (dry run first; append --live only if needed), or inspect the already-saved picker versions. Do not run it against the local profile-less fixture:

```sh
cd /var/www/7AI/studio
NODE_ENV=production npx tsx scripts/set-channel-directions.ts --tenant <production-tenant-uuid> --channel "Not In Your Textbook=history" --channel "Cold Open=story-first" --channel "Start to Shelf=explainer"
```

Attach reopened active profile IDs/versions, expected direction, fact policy and field-by-field previous/current comparison proving every other field is unchanged. If there is no profile, the founder must create it in the app; the script refuses. Capture five baseline outputs with the actual deployed pre-B/C prompt code before merging this PR, then evaluate this branch on those exact inputs plus the two neutral briefs and the same blind reader. Founder reads all three channel pairs, including NIYT. This PR is draft until these steps and the cost/leak receipts are complete. #165 already enabled the picker; phone display, live save/warnings and alignment of that flag with deployed consumers were not rechecked. No deployment, feature-flag edit, merge or production run was performed here.

### R9 same-cause sweep

Searched studio, app and docs for history/niche/persona wording, chapter-opening rules, duplicated no-logos/no-text rules and misplaced model/output limits. Production non-history wording cannot be inferred from source scans.

| Hits / cause | Disposition / owner |
|---|---|
| Long writer persona, streaming brand comparison, hook tension word count, pacing, question ban, loops and future-topic ending; long review historical hook; frame historical topic/tone | **Fixed here:** preset parts own style; neutral platform mechanics stay. |
| Short reviewer independent hook recipe | **Fixed here:** hookRule is the criterion; same ending/pacing/story/chapter parts supplied. |
| Short planner historical-event noun and sports/fashion examples; long planner historical adjective and documentary query fallback; still checker documentary-video role | **Fixed here:** neutral wording plus resolved domain/visual tone. |
| Long manifest contradictory opening/forward-ending hint and historical brief placeholder | **Fixed here:** long format is structural and placeholder neutral. Other Short format skeletons still contain opening/order/style instructions (`question-surprising-answer`, `what-it-feels-like`, etc.). **Needs a separate format-design task:** task explicitly limits manifest edits; do not silently redesign those formats or their UI names. |
| Long planning/still-review caches omitted new prompt inputs | **Fixed here:** input identities include direction/prompt context; regression tests cover changes. |
| Packaging typefaceMood topic examples | **Fixed here:** use existing enum owner; `historic` enum and Cinzel assets left as typography compatibility, not channel direction. |
| Review rules' Lego, salary/Roman, currency, Latin/archaic examples and dead score-cap prose (`rules.ts`) | **Left alone, separate neutral-examples/review-calibration task**, expressly excluded; file is byte-identical to main. Source scan debt allows only the identified lines. |
| NO_MARKS_CLAUSE and SAFETY_NEGATIVE_CLAUSE in scene-prompts; Short/long planner instructions; strongerPrompt remediation; still-check defect categories; frame safety flag; packaging thumbnail restrictions | **Left alone with reason:** these have different jobs (image negatives, planning instructions, defect schema, retry remediation and frame verdict policy). All are neutral platform rules. Brand-mark exception vs unconditional checks/flag semantics needs a separate platform-safety decision (P22); unifying them here would change existing policy/flow and expand the evaluation. No new copies introduced. |
| Brief-only rules in Short/long writers and packet policy | **Left alone, P22:** strengths and packet semantics unchanged. Numeric prose limits in profile guides remain P23; production guide contents unverified. |
| Registry model/tier/persona comments; existing registry max-output and reasoning settings | **Left alone:** registry owns call settings, comments are not prompt text; no model/limit changes. Existing no-output-cap-outside-llm test remains required. |
| App Step/Version history, database history, historical replay identifiers, test/fixture topics, channel bibles/task/audit/report descriptions | **Left alone:** UI/version/audit data or tests, not shared prompt direction. App code is unchanged. Source fixtures intentionally exercise real topics. |

### Sweep evidence inventory

Commands used (PowerShell/rg; generated outputs, fixtures and report text were classified separately):

```text
rg -n -i "histor|heist|crime|textbook|cold open|niyt|lego|roman|shelf|Netflix|no logos|no text|chapter opens|NEVER start a chapter" studio/src/agents studio/src/packaging studio/src/formats studio/src/story-tests app --glob *.ts --glob *.tsx --glob !*.test.*
rg -l -i "histor|heist|crime|textbook|cold open|niyt|lego|roman|shelf|Netflix|no logos|no text|chapter opens|NEVER start a chapter" docs --glob *.md --glob !task4.md
rg -n -i "logos|text|lettering|watermarks|marks" studio/src/agents/video-generation/plan.ts studio/src/agents/video-generation/plan-long.ts studio/src/agents/video-generation/scene-prompts.ts studio/src/agents/video-generation/still-check.ts studio/src/agents/video-intelligence/index.ts studio/src/packaging/prompts.ts
```

Remaining lexical source hits, with current line numbers (all left alone for the reason shown):

| File / lines | Disposition |
|---|---|
| `packaging/constants.ts:43,48` | Existing `historic` typography enum/font, no niche instructions. |
| `script-review/rules.ts:8,13,14` | Only three debt lines matched by the prompt-neutrality scan; separate task, file untouched. Its other examples/caps are excluded from editing too. |
| `packaging/prompts.ts:70`; `scene-prompts.ts:7,14`; `still-check.ts:157` | Neutral no-marks planning/negative/remediation policies, not preset direction. |
| `plan.ts:240–248`; `plan-long.ts:164–166`; `video-intelligence/index.ts:263` | Additional neutral logos/text/safety instructions found by the dedicated marks scan; distinct roles and flag semantics described above. |
| `long-narration.ts:174` | Error text `has no text to narrate`, unrelated lexical hit. |
| `script-review/score-audit.ts:42` | Archived replay-contract comment, not a prompt. |
| `app/app/(app)/run/[id].tsx:32,58,422,429,981,982` | Step-history imports/UI/state, unrelated to creative history direction. |
| Same file `:469,470,1085,1086` | `angleGoOff` contains the letters `lego` across a code identifier; false positive. |
| `app/app/(app)/channel/[id].tsx:581`; `channel/[id]/profile.tsx:401` | Spend/version-history UI text. |
| `app/lib/run-settings.ts:96,101`; `run-view.ts:115,127,135,213,219,228,236,253`; `components/StepHistory.tsx:4,10,20,41,87,92,101` | History types/UI/documentation, not prompts. |

Docs search covered channel bibles, decisions, design/audit/review-tuning/competitor docs, server runbooks and execution reports/tasks/templates across sprints, bugs, admin and UI. Those hits describe actual channels, recorded audits/defects or operating instructions: **left alone**, architect-owned and not consumer direction. Task 4 docs were read separately in full; the report was excluded from the broad count to avoid recursive self-hits. No docs were modified except this report. The source scan also inspected comments and test/fixture matches: descriptive comments and explicit regression input data remain allowed. Registry models/limits were checked by owner and by the existing enforcement tests, not replaced from documentation.

### Verification and delivery

- Focused backend: **19 passed, 1 skipped files; 163 passed, 6 skipped tests**, --maxWorkers=4. Skipped file is dedicated-database R5 integration; not run against shared local development data.
- Backend typecheck/lint/build: passed, including final rerun after the prompt grammar/cache/index changes.
- App typecheck: passed; direct ESLint: zero errors, two existing array-type warnings in untouched `app/lib/gate2-packaging.ts:111,122`; Expo web build: passed, 1,274 modules.
- Full backend suite: **208 passed, 14 skipped files; 1,915 passed, 85 skipped tests; zero failures**, `npm.cmd test -- --maxWorkers=4`, 304.79 seconds, alone with FFmpeg access. The first sandbox run was interrupted after FFmpeg execution was denied (`Access is denied`); no complete suite result is claimed for that attempt. The access-enabled full run supersedes it. No failing test remains to compare against clean main.
- App suite: **35 files / 246 tests passed**, `npx.cmd vitest run --root ../app --maxWorkers=4`.
- `git diff --check`: passed. Task doc, presets and `script-review/rules.ts` are unchanged from main. No migrations, lockfile or app source changes.
- Final main sync: `git fetch origin` and `git pull --no-rebase origin main` in this session's own branch/worktree; already up to date at `cad5b6c4f37c085187df3ee3dcbc2115e5ed558c`, no conflicts. The final source equals the full-suite source; only report/PR bookkeeping follows. Docs scope is only this report.
- CI: PR checks run backend typecheck/lint/build and app checks; they do not run the backend Vitest suite. Local full-suite evidence above remains necessary. PR #166 is draft against main; CI results are recorded in the delivery note below.

**Hard rules 5–9:** 5 — task doc r6 already identical to fetched main; no task-doc edits. 6 — fresh branch from fetched main; final sync/docs-scope check recorded below. 7 — only this report is edited under docs; no STATUS/PLAN changes. 8 — leave worktree/branch until founder confirms merge; no closure claimed. 9 — sweep dispositions above. No unresolved founder preset-text decisions; operational evidence is missing. Architect PLAN status: **P16 B+C offline implementation complete in draft; R5 production verification and R8 baseline/branch evaluation block readiness and merge.**

### R7 offline grep proof

The staged PR diff was scanned with the exact required lexical pattern, before committing; the committed `origin/main...HEAD` check was repeated at delivery on `377f04f` with the identical 37 matches:

```text
git diff --cached origin/main -- studio app | [added lines only] | rg -i "histor|heist|crime|textbook|cold open|niyt|lego|mary celeste|roman|shelf"
```

**37 matching added lines**, in only these files:

| File | Count | Disposition |
|---|---:|---|
| `agents/prompt-goldens.json` | 28 | Captured approved history part strings and unchanged excluded review examples inside per-preset test fixtures. |
| `channel-direction/evaluation.test.ts` | 5 | Deliberately leaking script/review/frame fixtures and expected detector output. |
| `channel-direction/layers.test.ts` | 1 | `preset.key !== 'history'` assertion for non-history frame prompts. |
| `channel-direction/evaluation.ts` | 3 | Two lexical detector lines (history exemption and regex), plus the fictional neutral library brief's ordinary word `shelf`. This module is offline evaluation tooling/data, not a consumer prompt contract or channel name. |

No added match exists in a shared consumer/format/packaging prompt source; preset data itself is unchanged. The unchanged review-rule lines remain the only source-scan debt. This proof is **offline only**: R7's post-acceptable-R8/production assertions remain unverified because no paid output comparison has run. It must not be interpreted as a live-output leak pass.

### Delivery note

Implementation committed as `377f04f` and pushed to `SPRINT6_TASK4BC_BE`; one combined draft PR opened: [#166](https://github.com/Neeraj1002/7AI/pull/166), base `main`. The docs diff contains only this report. Backend full suite and app suite are green locally. CI was triggered by the PR and is pending at this report update. The following bookkeeping commit changes only this report's PR/evidence references. Worktree/branch retained for review. Code-complete offline: **yes**; R5/R8 and rollout complete: **no**; merged: **no**; deployed: **no**. No paid evaluation result or production preset verification is claimed.

### Exact prompt diffs (same offline inputs)

These diffs compare the original 37 baseline goldens on current main with the regenerated neutral-default goldens. The 76 new per-preset goldens add each approved preset's selected parts and note to these same task mechanics; their full strings are in `studio/src/agents/prompt-goldens.json`. This is prompt evidence only, distinct from the five missing R8 generated outputs.

Changed existing keys (19): `script-short/base`, `script-short/brief-only`, `script-short/packet-default`, `script-short/packet-brief-only`, `script-long/source`, `script-long/packet`, `review-short/prompt`, `review-long/prompt`, `review-short/assembled`, `review-long/assembled`, `still-check`, `plan-short/free`, `plan-short/fixed`, `plan-long/free`, `plan-long/fixed`, `frame-short/stills`, `frame-short/stock`, `frame-long/stills`, `packaging/brief-system`. Unchanged existing keys: 18.

#### `script-short/base`

```diff
--- main/script-short/base
+++ branch/script-short/base
@@ -17,2 +17,9 @@

-Respond with raw JSON only — no markdown code fences, no commentary.+Respond with raw JSON only — no markdown code fences, no commentary.
+
+Creative direction (defaults; explicit brief constraints and content-profile rules take precedence within the platform contract):
+persona: A clear, engaging scriptwriter for online video.
+hookRule: Open with the most interesting true thing the brief gives. No greeting, no generic question.
+endingRule: End on the strongest point, then stop. No call to action, no question to the viewer.
+pacingCues: Write for the ear: one idea per sentence.
+avoid: Hype words and exclamation marks.
```

#### `script-short/brief-only`

```diff
--- main/script-short/brief-only
+++ branch/script-short/brief-only
@@ -19,2 +19,9 @@

+Creative direction (defaults; explicit brief constraints and content-profile rules take precedence within the platform contract):
+persona: A clear, engaging scriptwriter for online video.
+hookRule: Open with the most interesting true thing the brief gives. No greeting, no generic question.
+endingRule: End on the strongest point, then stop. No call to action, no question to the viewer.
+pacingCues: Write for the ear: one idea per sentence.
+avoid: Hype words and exclamation marks.
+
 Facts and figures stated in the brief are authoritative: keep every one of them, with the numbers

```

#### `script-short/packet-default`

```diff
--- main/script-short/packet-default
+++ branch/script-short/packet-default
@@ -19,2 +19,9 @@

+Creative direction (defaults; explicit brief constraints and content-profile rules take precedence within the platform contract):
+persona: A clear, engaging scriptwriter for online video.
+hookRule: Open with the most interesting true thing the brief gives. No greeting, no generic question.
+endingRule: End on the strongest point, then stop. No call to action, no question to the viewer.
+pacingCues: Write for the ear: one idea per sentence.
+avoid: Hype words and exclamation marks.
+
 Use the evidence packet policy. Citation-only URLs supply no factual text and do not verify general knowledge.
```

#### `script-short/packet-brief-only`

```diff
--- main/script-short/packet-brief-only
+++ branch/script-short/packet-brief-only
@@ -19,2 +19,9 @@

+Creative direction (defaults; explicit brief constraints and content-profile rules take precedence within the platform contract):
+persona: A clear, engaging scriptwriter for online video.
+hookRule: Open with the most interesting true thing the brief gives. No greeting, no generic question.
+endingRule: End on the strongest point, then stop. No call to action, no question to the viewer.
+pacingCues: Write for the ear: one idea per sentence.
+avoid: Hype words and exclamation marks.
+
 For the supplied evidence packet, add no factual detail beyond its permitted text. A citation-only URL has not been fetched and supplies no factual text.
```

#### `script-long/source`

```diff
--- main/script-long/source
+++ branch/script-long/source
@@ -1,2 +1,2 @@
-You are a master historical documentary filmmaker and a high-retention YouTube scriptwriter. Your writing style is immersive, suspenseful, and deeply atmospheric, similar to high-end history productions (e.g., Netflix's historical epics or premium storytelling channels).
+You write chaptered scripts for long-form YouTube video.

@@ -8,15 +8,18 @@
 - Word Count: The "text" field of every single chapter must be spoken narration containing at least 26 words (10 seconds when read aloud).
-- The Cold Open (Chapter 1): Drop the viewer directly into a high-stakes, dramatic, or mysterious moment in history. The first 50 to 100 words must build intense narrative tension *before* explaining the broader historical context. NEVER start with a generic question or an introductory greeting.
-- Micro-Pacing & Pacing Cues: Write in short, rhythmic, punchy sentences. Use ellipses (...) to force natural dramatic pauses or breaths in speech synthesis, and en-dashes (—) to mark sudden, dramatic shifts in the historical narrative.
-- Chapter Transitions: NEVER start a chapter with an explicit question. Instead, open chapters with active historical conflict, a turning point, or a shifting perspective. The "title" should be a highly compelling, cinematic label.
-- Narrative Loops: Plant one or two deep historical mysteries or open loops early in the video, explicitly resolving them in a much later chapter to maintain viewer retention.
-- The Climax & Outro: The final chapter must build to the ultimate historical resolution and close with a lingering, provocative thought or a cliffhanger that seamlessly bridges to a future topic. Absolute ban on generic sign-offs like "Thanks for watching."
+

 Content Restrictions & Delivery:
-- Strict Factual Grounding: Rely EXCLUSIVELY on facts explicitly provided in the brief and sources. Do not invent dates, statistics, names, or historical claims. If source material is thin, narrow the focus and intensify the dramatic depth of the existing facts rather than hallucinating details.
+- Strict Factual Grounding: Rely EXCLUSIVELY on facts explicitly provided in the brief and sources. Do not invent dates, statistics, names, or factual claims. If source material is thin, narrow the focus and develop the existing facts rather than hallucinating details.
 - Technical Formatting: Spoken narration text only. NO stage directions, NO audio cues in brackets, and NO markdown headings inside the text strings.
 - Escape Strings Safely: Never use the straight double-quote character (") inside a text value other than as the JSON delimiter. For internal quotes or dialogue, use curly quotes (“ ”) or single quotes. Apostrophes are permitted.
-- Tags: "hashtags" must be an array of 3 to 8 relevant historical search terms, excluding the '#' character.
+- Tags: "hashtags" must be an array of 3 to 8 relevant search terms, excluding the '#' character.

 Output Execution:
-Respond with raw JSON only. Do not wrap the response in markdown code blocks (```json), and provide no pre-text or post-text commentary.+Respond with raw JSON only. Do not wrap the response in markdown code blocks (```json), and provide no pre-text or post-text commentary.
+
+Creative direction (defaults; explicit brief constraints and content-profile rules take precedence within the platform contract):
+persona: A clear, engaging scriptwriter for online video.
+hookRule: Open with the most interesting true thing the brief gives. No greeting, no generic question.
+endingRule: End on the strongest point, then stop. No call to action, no question to the viewer.
+pacingCues: Write for the ear: one idea per sentence.
+avoid: Hype words and exclamation marks.
```

#### `script-long/packet`

```diff
--- main/script-long/packet
+++ branch/script-long/packet
@@ -1,2 +1,2 @@
-You are a master historical documentary filmmaker and a high-retention YouTube scriptwriter. Your writing style is immersive, suspenseful, and deeply atmospheric, similar to high-end history productions (e.g., Netflix's historical epics or premium storytelling channels).
+You write chaptered scripts for long-form YouTube video.

@@ -8,15 +8,18 @@
 - Word Count: The "text" field of every single chapter must be spoken narration containing at least 26 words (10 seconds when read aloud).
-- The Cold Open (Chapter 1): Drop the viewer directly into a high-stakes, dramatic, or mysterious moment in history. The first 50 to 100 words must build intense narrative tension *before* explaining the broader historical context. NEVER start with a generic question or an introductory greeting.
-- Micro-Pacing & Pacing Cues: Write in short, rhythmic, punchy sentences. Use ellipses (...) to force natural dramatic pauses or breaths in speech synthesis, and en-dashes (—) to mark sudden, dramatic shifts in the historical narrative.
-- Chapter Transitions: NEVER start a chapter with an explicit question. Instead, open chapters with active historical conflict, a turning point, or a shifting perspective. The "title" should be a highly compelling, cinematic label.
-- Narrative Loops: Plant one or two deep historical mysteries or open loops early in the video, explicitly resolving them in a much later chapter to maintain viewer retention.
-- The Climax & Outro: The final chapter must build to the ultimate historical resolution and close with a lingering, provocative thought or a cliffhanger that seamlessly bridges to a future topic. Absolute ban on generic sign-offs like "Thanks for watching."
+

 Content Restrictions & Delivery:
-- Strict Factual Grounding: Rely exclusively on factual text supplied in the evidence packet brief. Citation-only URLs are unfetched and provide no facts. Do not invent dates, statistics, names, or historical claims. If source material is thin, narrow the focus and intensify the dramatic depth of the existing facts rather than hallucinating details.
+- Strict Factual Grounding: Rely exclusively on factual text supplied in the evidence packet brief. Citation-only URLs are unfetched and provide no facts. Do not invent dates, statistics, names, or factual claims. If source material is thin, narrow the focus and develop the existing facts rather than hallucinating details.
 - Technical Formatting: Spoken narration text only. NO stage directions, NO audio cues in brackets, and NO markdown headings inside the text strings.
 - Escape Strings Safely: Never use the straight double-quote character (") inside a text value other than as the JSON delimiter. For internal quotes or dialogue, use curly quotes (“ ”) or single quotes. Apostrophes are permitted.
-- Tags: "hashtags" must be an array of 3 to 8 relevant historical search terms, excluding the '#' character.
+- Tags: "hashtags" must be an array of 3 to 8 relevant search terms, excluding the '#' character.

 Output Execution:
-Respond with raw JSON only. Do not wrap the response in markdown code blocks (```json), and provide no pre-text or post-text commentary.+Respond with raw JSON only. Do not wrap the response in markdown code blocks (```json), and provide no pre-text or post-text commentary.
+
+Creative direction (defaults; explicit brief constraints and content-profile rules take precedence within the platform contract):
+persona: A clear, engaging scriptwriter for online video.
+hookRule: Open with the most interesting true thing the brief gives. No greeting, no generic question.
+endingRule: End on the strongest point, then stop. No call to action, no question to the viewer.
+pacingCues: Write for the ear: one idea per sentence.
+avoid: Hype words and exclamation marks.
```

#### `review-short/prompt`

```diff
--- main/review-short/prompt
+++ branch/review-short/prompt
@@ -9,12 +9,5 @@
 score well overall while still opening weak, and the opening disproportionately determines whether a
-Short survives the first swipe before anything else about it matters. Judge the opening against known
-Shorts retention patterns:
-- A genuine cold open — does it start mid-thought/mid-action, not with a slow wind-up or preamble?
-- No logo/branding/intro filler before real content starts — every second before the hook lands is a
-  second a viewer can swipe away.
-- Does it immediately state a question, a surprising claim, or a visual/conceptual surprise that
-  creates a reason to keep watching, rather than easing in generically ("Today we're going to talk
-  about...")?
-Score high (8-10) only for an opening line that does real work on at least one of these; score low
-(0-3) for a slow, generic, or logo/intro-first opening, even if the rest of the script is strong.
+Short survives the first swipe before anything else about it matters. Judge the opening against
+the supplied creative direction's hookRule. Score high (8-10) for an opening that fulfils that rule;
+score low (0-3) for an opening that does not. The brief's mandated wording takes precedence.
 "hookNotes" explains the hookScore specifically — what the opening does or doesn't do, separate from

```

#### `review-long/prompt`

```diff
--- main/review-long/prompt
+++ branch/review-long/prompt
@@ -7,4 +7,4 @@

-"hookScore" is a SEPARATE 0-10 score judging ONLY the cold open (the first 50-100 words of narration):
-does it immediately plunge the viewer into a high-stakes or high-tension historical moment? Does it completely avoid generic introductions, questions, greetings, or "Today we're going to explore..."? Score 8-10 only for an opening that commands absolute attention; 0-3 for a slow or textbook-style one. "hookNotes" explains the hookScore.
+"hookScore" is a SEPARATE 0-10 score judging ONLY the opening:
+judge it against the supplied creative direction's hookRule, preserving the brief's mandated wording. Score 8-10 for an opening that fulfils that rule; 0-3 for one that does not. "hookNotes" explains the hookScore.


```

#### `review-short/assembled`

```diff
--- main/review-short/assembled
+++ branch/review-short/assembled
@@ -9,12 +9,5 @@
 score well overall while still opening weak, and the opening disproportionately determines whether a
-Short survives the first swipe before anything else about it matters. Judge the opening against known
-Shorts retention patterns:
-- A genuine cold open — does it start mid-thought/mid-action, not with a slow wind-up or preamble?
-- No logo/branding/intro filler before real content starts — every second before the hook lands is a
-  second a viewer can swipe away.
-- Does it immediately state a question, a surprising claim, or a visual/conceptual surprise that
-  creates a reason to keep watching, rather than easing in generically ("Today we're going to talk
-  about...")?
-Score high (8-10) only for an opening line that does real work on at least one of these; score low
-(0-3) for a slow, generic, or logo/intro-first opening, even if the rest of the script is strong.
+Short survives the first swipe before anything else about it matters. Judge the opening against
+the supplied creative direction's hookRule. Score high (8-10) for an opening that fulfils that rule;
+score low (0-3) for an opening that does not. The brief's mandated wording takes precedence.
 "hookNotes" explains the hookScore specifically — what the opening does or doesn't do, separate from
@@ -65,2 +58,8 @@
 A pass is represented by [] in the concern arrays, not a string explaining the pass. Do not include the examples in your review unless the ACTUAL script contains the same offending claim.
-FINAL VALIDATION: The concern arrays contain FAILURES ONLY, never passed checks, acceptable wording, things to confirm, or general advice. Each finding must state an actual mismatch, quote it and give a repair. Put ALL SR-3/4/5 advice in notes only. Do not flag digit versus spelled-number formatting unless expressly verbatim. Inspect every brief fact, required key term and local qualifier, not just candidate hints. In notes explain actual findings, without inventing a model score reduction. Keep notes under 70 words, hookNotes under 20, each concern under 35, and each chapter note under 20; output valid complete JSON within the existing token limit.+FINAL VALIDATION: The concern arrays contain FAILURES ONLY, never passed checks, acceptable wording, things to confirm, or general advice. Each finding must state an actual mismatch, quote it and give a repair. Put ALL SR-3/4/5 advice in notes only. Do not flag digit versus spelled-number formatting unless expressly verbatim. Inspect every brief fact, required key term and local qualifier, not just candidate hints. In notes explain actual findings, without inventing a model score reduction. Keep notes under 70 words, hookNotes under 20, each concern under 35, and each chapter note under 20; output valid complete JSON within the existing token limit.
+
+Creative direction (defaults; explicit brief constraints and content-profile rules take precedence within the platform contract):
+hookRule: Open with the most interesting true thing the brief gives. No greeting, no generic question.
+endingRule: End on the strongest point, then stop. No call to action, no question to the viewer.
+pacingCues: Write for the ear: one idea per sentence.
+avoid: Hype words and exclamation marks.
```

#### `review-long/assembled`

```diff
--- main/review-long/assembled
+++ branch/review-long/assembled
@@ -7,4 +7,4 @@

-"hookScore" is a SEPARATE 0-10 score judging ONLY the cold open (the first 50-100 words of narration):
-does it immediately plunge the viewer into a high-stakes or high-tension historical moment? Does it completely avoid generic introductions, questions, greetings, or "Today we're going to explore..."? Score 8-10 only for an opening that commands absolute attention; 0-3 for a slow or textbook-style one. "hookNotes" explains the hookScore.
+"hookScore" is a SEPARATE 0-10 score judging ONLY the opening:
+judge it against the supplied creative direction's hookRule, preserving the brief's mandated wording. Score 8-10 for an opening that fulfils that rule; 0-3 for one that does not. "hookNotes" explains the hookScore.

@@ -50,2 +50,8 @@
 A pass is represented by [] in the concern arrays, not a string explaining the pass. Do not include the examples in your review unless the ACTUAL script contains the same offending claim.
-FINAL VALIDATION: The concern arrays contain FAILURES ONLY, never passed checks, acceptable wording, things to confirm, or general advice. Each finding must state an actual mismatch, quote it and give a repair. Put ALL SR-3/4/5 advice in notes only. Do not flag digit versus spelled-number formatting unless expressly verbatim. Inspect every brief fact, required key term and local qualifier, not just candidate hints. In notes explain actual findings, without inventing a model score reduction. Keep notes under 70 words, hookNotes under 20, each concern under 35, and each chapter note under 20; output valid complete JSON within the existing token limit.+FINAL VALIDATION: The concern arrays contain FAILURES ONLY, never passed checks, acceptable wording, things to confirm, or general advice. Each finding must state an actual mismatch, quote it and give a repair. Put ALL SR-3/4/5 advice in notes only. Do not flag digit versus spelled-number formatting unless expressly verbatim. Inspect every brief fact, required key term and local qualifier, not just candidate hints. In notes explain actual findings, without inventing a model score reduction. Keep notes under 70 words, hookNotes under 20, each concern under 35, and each chapter note under 20; output valid complete JSON within the existing token limit.
+
+Creative direction (defaults; explicit brief constraints and content-profile rules take precedence within the platform contract):
+hookRule: Open with the most interesting true thing the brief gives. No greeting, no generic question.
+endingRule: End on the strongest point, then stop. No call to action, no question to the viewer.
+pacingCues: Write for the ear: one idea per sentence.
+avoid: Hype words and exclamation marks.
```

#### `still-check`

```diff
--- main/still-check
+++ branch/still-check
@@ -1,2 +1,2 @@
-You inspect AI-generated still images for a documentary video, one numbered image at a time. Each image comes with the narration line it illustrates. Report only real problems, in these kinds:
+You inspect AI-generated still images for a video, one numbered image at a time. Each image comes with the narration line it illustrates. Report only real problems, in these kinds:
 - "logo": any brand logo, wordmark, trademark or brand name, including on a sign, building, product, packaging or screen.

```

#### `plan-short/free`

```diff
--- main/plan-short/free
+++ branch/plan-short/free
@@ -13,3 +13,3 @@
 "visualSource" — the founder/user did NOT request a specific visual style for this run. Default to
-"ai-stills". A script centred on a specific named person, a historical event, or a story beat that needs a
+"ai-stills". A script centred on a specific named person, a specific event, or a story beat that needs a
 specific scene MUST use "ai-stills" — stock footage cannot depict specific people or events (it shows an
@@ -54,3 +54,3 @@
 For scene prompts about real, named people: depict scenes, objects, places, settings and silhouettes
-that evoke them (e.g. a boxing ring and gloves, a stadium track at dusk, a dress on a mannequin) rather
+that evoke the narrated subject rather
 than a close-up photoreal likeness of their face. Never ask for text, captions, logos or watermarks
@@ -65,2 +65,4 @@
 "rationale" briefly explains your choices, and — on a regen attempt — how they address the feedback.
-Respond with raw JSON only — no markdown code fences, no commentary.+Respond with raw JSON only — no markdown code fences, no commentary.
+
+Creative direction (defaults; explicit brief constraints and content-profile rules take precedence within the platform contract):

```

#### `plan-short/fixed`

```diff
--- main/plan-short/fixed
+++ branch/plan-short/fixed
@@ -50,3 +50,3 @@
 For scene prompts about real, named people: depict scenes, objects, places, settings and silhouettes
-that evoke them (e.g. a boxing ring and gloves, a stadium track at dusk, a dress on a mannequin) rather
+that evoke the narrated subject rather
 than a close-up photoreal likeness of their face. Never ask for text, captions, logos or watermarks
@@ -61,2 +61,4 @@
 "rationale" briefly explains your choices, and — on a regen attempt — how they address the feedback.
-Respond with raw JSON only — no markdown code fences, no commentary.+Respond with raw JSON only — no markdown code fences, no commentary.
+
+Creative direction (defaults; explicit brief constraints and content-profile rules take precedence within the platform contract):

```

#### `plan-long/free`

```diff
--- main/plan-long/free
+++ branch/plan-long/free
@@ -11,3 +11,3 @@
 2. Describe framing, viewpoint, lighting and depth as image composition. Do not request continuous physical action, generated camera tracking or drone traversal, lip sync, or a video model/provider.
-3. Use era and place details only when supported by the approved narration or actual profile. Maintain visual continuity without inventing historical facts. A reconstruction is an illustration, never documentary evidence of an event.
+3. Use era and place details only when supported by the approved narration or actual profile. Maintain visual continuity without inventing facts. A reconstruction is an illustration, never documentary evidence of an event.
 4. If narration mentions children, depict adult caregivers or the setting instead. Never ask for text, captions, overlays, subtitles, logos, or watermarks inside the frame. The image provider's safety system rejects graphic content, so avoid depicting children/minors, medical exams, active physical violence, bodily injury, or blood. Focus on the tense atmosphere just before a harmful action or the somber aftermath.
@@ -16,2 +16,4 @@

-Respond with raw JSON only, no markdown code fences, no commentary.+Respond with raw JSON only, no markdown code fences, no commentary.
+
+Creative direction (defaults; explicit brief constraints and content-profile rules take precedence within the platform contract):

```

#### `plan-long/fixed`

```diff
--- main/plan-long/fixed
+++ branch/plan-long/fixed
@@ -11,3 +11,3 @@
 2. Describe framing, viewpoint, lighting and depth as image composition. Do not request continuous physical action, generated camera tracking or drone traversal, lip sync, or a video model/provider.
-3. Use era and place details only when supported by the approved narration or actual profile. Maintain visual continuity without inventing historical facts. A reconstruction is an illustration, never documentary evidence of an event.
+3. Use era and place details only when supported by the approved narration or actual profile. Maintain visual continuity without inventing facts. A reconstruction is an illustration, never documentary evidence of an event.
 4. If narration mentions children, depict adult caregivers or the setting instead. Never ask for text, captions, overlays, subtitles, logos, or watermarks inside the frame. The image provider's safety system rejects graphic content, so avoid depicting children/minors, medical exams, active physical violence, bodily injury, or blood. Focus on the tense atmosphere just before a harmful action or the somber aftermath.
@@ -18,2 +18,4 @@
 Channel script guide (tone/context only; do not rewrite narration or override the scene-slot JSON contract): clear
-Respond with raw JSON only, no markdown code fences, no commentary.+Respond with raw JSON only, no markdown code fences, no commentary.
+
+Creative direction (defaults; explicit brief constraints and content-profile rules take precedence within the platform contract):

```

#### `frame-short/stills`

```diff
--- main/frame-short/stills
+++ branch/frame-short/stills
@@ -1,4 +1,4 @@
-You are reviewing 3 frames sampled at different points (roughly 25%, 50%, and 75% through) from a short vertical video (a YouTube Short) before it's approved for publishing, alongside the topic and script it's based on. Judge the video as a whole across all the frames together — ensuring the visual narrative flows smoothly, is not blank, is free of severe AI artifacts, and is deeply consistent with the described historical topic and dramatic tone (the visuals are generated still compositions animated by supported FFmpeg pan/zoom and cuts. Judge whether each sampled image is an on-topic illustration of the narration; a reconstruction is not documentary source evidence. Do not expect generated physical action or camera traversal. Stylized or AI-rendered imagery is permitted. Fail for blank/corrupted content, severe image artifacts or content genuinely unrelated to the topic, while keeping the existing overall-frame verdict policy.).
+You are reviewing 3 frames sampled at different points (roughly 25%, 50%, and 75% through) from a short vertical video (a YouTube Short) before it's approved for publishing, alongside the topic and script it's based on. Judge the video as a whole across all the frames together — ensuring the visual narrative flows smoothly, is not blank, is free of severe AI artifacts, and is deeply consistent with the described topic (the visuals are generated still compositions animated by supported FFmpeg pan/zoom and cuts. Judge whether each sampled image is an on-topic illustration of the narration; a reconstruction is not documentary source evidence. Do not expect generated physical action or camera traversal. Stylized or AI-rendered imagery is permitted. Fail for blank/corrupted content, severe image artifacts or content genuinely unrelated to the topic, while keeping the existing overall-frame verdict policy.).

-A single frame catching a momentary presentation artifact (e.g. burned-in captions caught mid-transition between cues, showing a partial word) should NOT by itself fail the video if the other sampled frames look reasonable — judge the overall impression across all frames, not a single worst instant. Only fail if the pattern is consistent across the frames, or if a frame shows something genuinely wrong (blank/corrupted footage, severe physical clipping errors, or content completely unrelated to the historical topic).
+A single frame catching a momentary presentation artifact (e.g. burned-in captions caught mid-transition between cues, showing a partial word) should NOT by itself fail the video if the other sampled frames look reasonable — judge the overall impression across all frames, not a single worst instant. Only fail if the pattern is consistent across the frames, or if a frame shows something genuinely wrong (blank/corrupted footage, severe physical clipping errors, or content completely unrelated to the topic).

@@ -7,2 +7,5 @@
 Respond with raw JSON only — no markdown code fences, no commentary.
-This channel enforces a strict safety and compliance rule on AI-generated stills. Also fail the video if any sampled frame clearly shows any of: a recognisable brand logo or trademark; legible gibberish text baked directly into the visual landscape (other than the burned-in captions); a photoreal depiction of an identifiable real modern person; graphic blood, gore, or extreme violence. Name the offending frame in the notes so the next rendering attempt can steer away from it.+This channel enforces a strict safety and compliance rule on AI-generated stills. Also fail the video if any sampled frame clearly shows any of: a recognisable brand logo or trademark; legible gibberish text baked directly into the visual landscape (other than the burned-in captions); a photoreal depiction of an identifiable real modern person; graphic blood, gore, or extreme violence. Name the offending frame in the notes so the next rendering attempt can steer away from it.
+
+Creative direction (defaults; explicit brief constraints and content-profile rules take precedence within the platform contract):
+visualReviewTone: Judge whether each picture fits what is being said at that moment.
```

#### `frame-short/stock`

```diff
--- main/frame-short/stock
+++ branch/frame-short/stock
@@ -1,4 +1,4 @@
-You are reviewing 3 frames sampled at different points (roughly 25%, 50%, and 75% through) from a short vertical video (a YouTube Short) before it's approved for publishing, alongside the topic and script it's based on. Judge the video as a whole across all the frames together — ensuring the visual narrative flows smoothly, is not blank, is free of severe AI artifacts, and is deeply consistent with the described historical topic and dramatic tone (the background is real licensed stock footage chosen for the topic, not a custom shoot — judge whether it's a *reasonable* backdrop for this content, not whether it's visually impressive.).
+You are reviewing 3 frames sampled at different points (roughly 25%, 50%, and 75% through) from a short vertical video (a YouTube Short) before it's approved for publishing, alongside the topic and script it's based on. Judge the video as a whole across all the frames together — ensuring the visual narrative flows smoothly, is not blank, is free of severe AI artifacts, and is deeply consistent with the described topic (the background is real licensed stock footage chosen for the topic, not a custom shoot — judge whether it's a *reasonable* backdrop for this content, not whether it's visually impressive.).

-A single frame catching a momentary presentation artifact (e.g. burned-in captions caught mid-transition between cues, showing a partial word) should NOT by itself fail the video if the other sampled frames look reasonable — judge the overall impression across all frames, not a single worst instant. Only fail if the pattern is consistent across the frames, or if a frame shows something genuinely wrong (blank/corrupted footage, severe physical clipping errors, or content completely unrelated to the historical topic).
+A single frame catching a momentary presentation artifact (e.g. burned-in captions caught mid-transition between cues, showing a partial word) should NOT by itself fail the video if the other sampled frames look reasonable — judge the overall impression across all frames, not a single worst instant. Only fail if the pattern is consistent across the frames, or if a frame shows something genuinely wrong (blank/corrupted footage, severe physical clipping errors, or content completely unrelated to the topic).

@@ -6,2 +6,5 @@
 "notes" briefly explains the verdict; on a fail, give specific, actionable fix guidance.
-Respond with raw JSON only — no markdown code fences, no commentary.+Respond with raw JSON only — no markdown code fences, no commentary.
+
+Creative direction (defaults; explicit brief constraints and content-profile rules take precedence within the platform contract):
+visualReviewTone: Judge whether each picture fits what is being said at that moment.
```

#### `frame-long/stills`

```diff
--- main/frame-long/stills
+++ branch/frame-long/stills
@@ -1,4 +1,4 @@
-You are reviewing 4 key frames, one sampled within each chapter's rendered still-image sequence, from a long-form 16:9 YouTube video before publishing, alongside the topic and script it's based on. Judge the video as a whole across all the frames together — ensuring the visual narrative flows smoothly, is not blank, is free of severe AI artifacts, and is deeply consistent with the described historical topic and dramatic tone (the visuals are generated still compositions animated by supported FFmpeg pan/zoom and cuts. Judge whether each sampled image is an on-topic illustration of the narration; a reconstruction is not documentary source evidence. Do not expect generated physical action or camera traversal. Stylized or AI-rendered imagery is permitted. Fail for blank/corrupted content, severe image artifacts or content genuinely unrelated to the topic, while keeping the existing overall-frame verdict policy.).
+You are reviewing 4 key frames, one sampled within each chapter's rendered still-image sequence, from a long-form 16:9 YouTube video before publishing, alongside the topic and script it's based on. Judge the video as a whole across all the frames together — ensuring the visual narrative flows smoothly, is not blank, is free of severe AI artifacts, and is deeply consistent with the described topic (the visuals are generated still compositions animated by supported FFmpeg pan/zoom and cuts. Judge whether each sampled image is an on-topic illustration of the narration; a reconstruction is not documentary source evidence. Do not expect generated physical action or camera traversal. Stylized or AI-rendered imagery is permitted. Fail for blank/corrupted content, severe image artifacts or content genuinely unrelated to the topic, while keeping the existing overall-frame verdict policy.).

-A single frame catching a momentary presentation artifact (e.g. burned-in captions caught mid-transition between cues, showing a partial word) should NOT by itself fail the video if the other sampled frames look reasonable — judge the overall impression across all frames, not a single worst instant. Only fail if the pattern is consistent across the frames, or if a frame shows something genuinely wrong (blank/corrupted footage, severe physical clipping errors, or content completely unrelated to the historical topic).
+A single frame catching a momentary presentation artifact (e.g. burned-in captions caught mid-transition between cues, showing a partial word) should NOT by itself fail the video if the other sampled frames look reasonable — judge the overall impression across all frames, not a single worst instant. Only fail if the pattern is consistent across the frames, or if a frame shows something genuinely wrong (blank/corrupted footage, severe physical clipping errors, or content completely unrelated to the topic).

@@ -8,2 +8,5 @@
 Respond with raw JSON only — no markdown code fences, no commentary.
-This channel enforces a strict safety and compliance rule on AI-generated stills. Also fail the video if any sampled frame clearly shows any of: a recognisable brand logo or trademark; legible gibberish text baked directly into the visual landscape (other than the burned-in captions); a photoreal depiction of an identifiable real modern person; graphic blood, gore, or extreme violence. Name the offending frame in the notes so the next rendering attempt can steer away from it.+This channel enforces a strict safety and compliance rule on AI-generated stills. Also fail the video if any sampled frame clearly shows any of: a recognisable brand logo or trademark; legible gibberish text baked directly into the visual landscape (other than the burned-in captions); a photoreal depiction of an identifiable real modern person; graphic blood, gore, or extreme violence. Name the offending frame in the notes so the next rendering attempt can steer away from it.
+
+Creative direction (defaults; explicit brief constraints and content-profile rules take precedence within the platform contract):
+visualReviewTone: Judge whether each picture fits what is being said at that moment.
```

#### `packaging/brief-system`

```diff
--- main/packaging/brief-system
+++ branch/packaging/brief-system
@@ -10,3 +10,3 @@
 7. What is the picture about (subjectKind)? iconic-thing: a landmark, ship, object or place that is the subject by itself. named-person: a named person is central to the story. anonymous-person: unnamed people (a crew, a worker, a child) are there. no-focal-subject: nothing in the story is a clear thing to look at.
-8. typefaceMood for the lettering: stakes (urgent, numbers, risk, business), editorial (people, human stories), historic (ancient or long-ago subjects).
+8. typefaceMood for the lettering: stakes, editorial, historic.
 9. promise: one sentence saying what the first 5 to 10 seconds of the video deliver.

```

### Approved preset text copied from the implemented data

#### history (version 1)

Label: History documentary
Summary: A documentary storyteller for stories from the past, built on conflict and turning points.

- persona: A documentary storyteller who brings the past to life with a historian's care and a film's pull. One steady, atmospheric voice that never turns breathless and says plainly when the sources are silent.
- domain: The past: events, people and everyday life, told from the sources.
- hookRule: Open inside one vivid, documented moment from the brief, then step back to how it came about. Let the tension build before any context arrives. The first line must work with the sound off. No greeting, no setup, no generic question.
- storyShape: Build the story around conflict and turning points. Set the time and place early, in plain words. Plant one or two open questions early and settle them later, as far as the sources allow. Let the shape of the story set the order of the beats; do not force one pattern on every video.
- endingRule: Settle the open questions as far as the sources allow, then close on one lingering thought. No summary sign-off, no moral, no question to the viewer, no call to action, no promise of another video.
- chapterStyle: Each chapter has one job. Open it in the action: a conflict, a turning point or a shift in perspective. Do not open with a question or a recap. Give each chapter a vivid title label.
- pacingCues: Write for the ear: short, rhythmic sentences, no semicolons. Use an ellipsis for a real pause and a dash for a shift. Let a short line land after a long one.
- avoid: Hype words and exclamation marks. Modern slang. Judging people of the past by today's standards. Suspense that promises more than the sources give.
- visualReviewTone: Judge pictures as frames from a serious historical documentary. Each must fit the scene being narrated and its period and place; anything out of period is a defect.

#### story-first (version 1)

Label: Story first
Summary: True stories told like a film: one central question, a chain of "but" and "so", and a quiet last line.

- persona: A storyteller who tells true stories as a film would. One plain, confident voice, curious about the case and a little amazed by it, that says plainly when something is not known.
- domain: A real event told as a story around one central question, answered as far as the evidence allows.
- hookRule: Open inside the strangest moment the brief gives, not before it. The first line must work with the sound off. Start in the moment, then step back to how it began. No greeting, no setup, no generic question.
- storyShape: Tell it as a chain of "but" and "so": what someone wanted, what stood in the way, what happened because of it, and the turn. Put a turn near the middle that makes the next beat necessary. Plant one open question early and pay it off at the end, or say plainly that it cannot be answered. Let the shape of the story set the order of the beats; do not force one pattern on every video.
- endingRule: End on the strongest fact in the story, or the plainest statement of what is not known, in one line shorter than the lines before it. Where it fits, echo a word from the opening. Then stop. No moral, no question to the viewer, no call to action, no promise of another video.
- chapterStyle: Each chapter has one job. A chapter may open with the question it answers; otherwise it opens in the action. Never open with a recap.
- pacingCues: Write for the ear: one idea per sentence, no semicolons. Mix very short lines with longer ones, and let a short line land after a long one. Use an ellipsis only for a real breath.
- avoid: Hype words and exclamation marks. Suspense that promises the answer instead of withholding it. A moral. Mocking anyone in the story.
- visualReviewTone: Judge pictures as frames from a serious film about this story. Each must fit the scene being narrated and its time and place.

#### explainer (version 1)

Label: Explainer
Summary: A friendly, step-by-step explanation of how something works or is made.

- persona: A friendly explainer who has just found out how this works and is a little amazed. Curious and lively, never stiff, never hype.
- domain: How something works or is made, explained one step at a time.
- hookRule: Open with the subject and the strangest true thing about it, in plain words. The first line must work with the sound off. No greeting, no generic question.
- storyShape: Walk through it in order, one step at a time. Each step is one action and one concrete detail the viewer can picture. Point at the oddest step and say why it matters. Vary the shape of the opening from video to video.
- endingRule: End on a line that echoes the opening. Then stop. No call to action, no question to the viewer, no moral.
- chapterStyle: _(empty)_
- pacingCues: Write for the ear: one idea per sentence, contractions are fine, commas where a voice should breathe, no semicolons. Let every step move the explanation forward.
- avoid: Hype words and exclamation marks.
- visualReviewTone: Judge the pictures by whether each one fits the step being narrated at that moment. The viewer should see the action or the thing the sentence names.

#### neutral (version 1)

Label: Neutral
Summary: A clear, engaging default with no particular style.

- persona: A clear, engaging scriptwriter for online video.
- domain: _(empty)_
- hookRule: Open with the most interesting true thing the brief gives. No greeting, no generic question.
- storyShape: _(empty)_
- endingRule: End on the strongest point, then stop. No call to action, no question to the viewer.
- chapterStyle: _(empty)_
- pacingCues: Write for the ear: one idea per sentence.
- avoid: Hype words and exclamation marks.
- visualReviewTone: Judge whether each picture fits what is being said at that moment.

