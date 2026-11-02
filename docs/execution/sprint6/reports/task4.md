# Sprint 6 Task 4: Creative direction per channel

**Branch / worktree / PR A:** `SPRINT6_TASK4A_BE` / `D:\Study Material\7AI-SPRINT6\task4a` / #161
**Task doc:** r6 on `origin/main` (founder selected r6; the base checkout's r1 copy is stale).
**Status:** PR A is open. Architect review follow-up is prepared as a second local commit for the founder to push; merged: no; deployed: no.

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

### PR B

Pending founder-run profile script and baseline evaluation.

PR B adds `presetKey` and `presetVersion` to the Task 3 learning tags (`pipelineTags`), per architect ruling.

### PR C

Pending PR B merge.


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

