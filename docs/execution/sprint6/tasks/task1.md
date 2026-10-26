# Sprint 6 Task 1: Curiosity Packaging, titles and thumbnails that make a stranger want to know (P1)

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow, the Hard rules (5 to 9: task doc sync, pull `main` before ready, who owns which doc, close after merge, same-cause sweep), the `STATUS.md` rule and the report shape. This file states only this task's specifics. Keep every reply to the founder to 3 lines; only the report is long. Do not edit `STATUS.md`, `PLAN.md` or any doc except your own report and the docs named in the Report section.

**Revision**: r7, 2026-10-25. Built on the spike result (go, with the changes below), the no-new-settings rule and the channel-agnostic rule. r6 rewrote the task around curiosity; r5 treated it as "make options and upload a thumbnail".

**Written**: 2026-10-24, revised 2026-10-25 by the architect chat, at the founder's request. **Status**: not started; starts only after the spike closure PR is merged. **Priority**: P2, runs first among the priority 2 items by founder direction (24 Oct), ahead of P12. **Branches**: `SPRINT6_TASK1A_BE`, `SPRINT6_TASK1B_BE`, `SPRINT6_TASK1C_BE` (add `_FE` branches only if R0 shows the app change is too big to share a PR); worktrees `task1a`, `task1b`, `task1c` under `D:\Study Material\7AI-SPRINT6`. Give branch, worktree and PR in your first reply and at the top of the report (Hard rule 7).

## What the founder wants (read this twice)

The goal is not "a custom thumbnail" or "better titles". The goal is that a stranger scrolling past **feels curious enough to click**, and then the video honestly pays that curiosity off. The founder's reference thumbnails (24 Oct, described in Appendix A; do not commit the images) all do one thing: at a glance they raise a question the viewer cannot answer without watching. The thumbnail shows the world and the stake; the title asks the question. They are one pair, designed together, and the video closes the gap.

**Curiosity here means an honest information gap, never a trick.** A package that promises something the video does not deliver is a defect, however well it would click.

## Two rules that decide every choice (founder, 25 Oct)

1. **Channel-agnostic.** No channel name, no channel-specific branch, no channel-specific prompt text anywhere in code, prompts or fixtures. NIYT, Cold Open and Underdogs are test channels only. A channel with no profile gets neutral defaults and still works.
2. **No new settings.** Packaging adds no profile field, no channel toggle and no form. The system derives every decision from what already exists: the story guide, `visual.stylePrompt`, the title guidance and the approved script itself (for example whether a face helps is read from the script, never configured). The only human choices are per video: pick a package, edit the title, keep YouTube's thumbnail.

Tests use at least two channels with different profiles, plus one with no profile.

## What the spike taught (PR #117, 25 Oct; report `sprint6/reports/task1-spike.md`)

Our image generator at its current `low` quality reaches the richness we need; the weak point was the thinking, not the pixels. Build to these findings:
- Curiosity is **a familiar subject plus a contradiction of what people believe** (the Eiffel Tower "SOLD FOR SCRAP?" card was the clear winner). Start every brief from "what do people believe" versus "what does the record say".
- The picture must connect to the title **without the script**. A good picture that does not match its title is a failed package (pair I in round 1).
- The title must **withhold the answer**. The critic was too generous, so the critic is a gate with harder questions plus a pairwise compare against the best candidate, not a score.
- Failures were about honesty: an invented toy, an image that contradicts the words, dropped hedges, an imagined real person. The model also broke its own limits in 2 of 18 packages (word counts, length). **Limits, hedges and scene-versus-script are code checks, not prompt hopes.**
- A face helps a concept that has no focal subject and adds little to an iconic subject. **Whether to show a face is decided from the script**: a named person central to the story gets a face or figure; a script without a focal subject may get an imagined, anonymous figure (from behind, in profile or in shadow, never a real or recognisable person); an iconic subject (a tower, a ship) gets none. Uncanny faces are checked at feed and sidebar size.
- Stills stay at `low` quality (about $0.0065 per image); thumbnails may use the same.

## Objective

For every channel, after the script is approved, build **curiosity packages**: each is one question the viewer will have, a title, a thumbnail and the place in the video where the question is answered. Test them with a cold reader before the founder sees them, drop any that over-promise, and let the founder choose at Gate 2 on a mock viewer card. Keep YouTube's suggested thumbnail as the fallback. Also give Shorts a strong first-seconds opening built from the chosen package.

**Duration**: to estimate after R0 (three PRs, see Delivery).
**Depends On**: existing Gate 1/Gate 2 and publishing paths; the LLM Registry (every new LLM call is registered there: output limit, retry and evidence per Part B); Sprint 6 Task 2 must merge before PR C (both change the Short opening). The thumbnail upload 403 (Task 8 R11.5) must not block the package tool.
**Owning Component**: Packaging and publishing, thumbnail generation and overlay, Gate 2 API and app UI, video opening. Confirm exact owners in R0.
**Success Criteria**: on any channel the founder sees, at Gate 2, two real packages on a mock viewer card, each with the question viewers will have and where the video answers it; every package passed the cold-reader and payoff checks or was dropped with a reason; the choice survives a restart; the chosen thumbnail file is what goes to the upload boundary when supported; the truthful result is shown when it is not.

## Decisions (settled; none open)

1. **Faces**: derived from the script (see the spike findings). No NIYT rule, no setting. R0 reports what the existing profiles' negative prompts already say, so the thumbnail does not contradict a profile.
2. **Shorts**: the package is the title, a hook line and a frame-zero image (R7). A 9:16 thumbnail is not built; add one only if R0 finds real evidence it matters.
3. **Typeface**: the engine picks one of three open-licence families that ship with the app (Anton, Playfair Display Black, Cinzel Black, all OFL 1.1) from the mood of the profile's style text and the script, and stores the pick with the package. If a profile already names a font, that wins. No font setting.
4. **Cost**: packaging cost is part of the run's cost estimate shown before approval (R0 finds where), at the real price per image.

## The curiosity grammar (from the references; the agent builds to this)

Each cue is a tool, not a checklist. A package should use one clear primary device and at most one supporting.
- **Stake**: something is at risk and we can see it (a person and a threat).
- **Scale**: a small human next to something enormous.
- **Mystery**: we are shown only part of it (a figure seen from behind, a shadowed face, an unread sign).
- **Correction**: the popular version versus the record ("what really happened", only when the script has that contrast).
- **How**: a process or survival question the viewer wants answered.
- **Person**: a named human moment with a face or gesture we feel.
- **Countdown**: time pressure that is true of the story.

The thumbnail and the title divide the work: large lettering (at most four words, plus an optional small subline of at most five) names the world or subject; the title opens the specific question. They must not repeat each other. Light, depth and one dominant subject carry the rest. The device list is the starting set; do not invent more without the architect.

## Honest curiosity: rules that never bend

- The question in the package must be answered by the approved script, in the video, at a place the package names (chapter or time).
- The thumbnail must not show a scene, person or object the video does not contain or depict. Imagined scenes are only those the treatment supports.
- "Untold", "what really happened", "secret", "banned" and similar words appear only when the script contains the documented contrast that earns them (the popular-version-then-record rule).
- No fake badges or labels: no "4K", "Full Movie", "Official" or similar unless true of this video.
- No copying a reference channel's people, wording, lettering, logo or exact composition. The references show a grammar, not assets.
- Figures, dates and claims in a title or lettering pass the same fact check as the script.
- Real, identifiable living people are not depicted. Imagined portraits of historical people are allowed only as the channel config allows.

## R0. Read the real code first and confirm

**Where**: run creation, Gate 1 and Gate 2 contracts, publish metadata and title generation, script fact check, still generation (`ai-visuals/registry.ts`, `agents/video-generation/scene-prompts.ts`, `sceneStyle` in `run-pipeline/state-machine.ts`), video rendering, thumbnail extraction and upload, artifact storage, Compare grouping, retention ingestion, the LLM Registry (`llm/models.ts`, purposes, `callLLM`), the spike code in `studio/scripts/spikes/packaging/`, the relevant app screens, current reports and open work.

**Fix**: a confirmed / wrong / unknown table in the report before choosing files, storage, costs or API shape. Confirm: the image price; which registry model reads images; how run or profile JSON can hold the brief, packages, choice, device and recipe; how a run survives a restart and Gate 2 edits persist; how channel ownership stops packaging crossing tenants; what current title generation and fact check do; where the run cost estimate is built; whether Gate 2 designs for the package screens exist yet (Report asks you to build to them, not invent them). Do not state a code or schema fact from an older doc.

**Verify**: real files and contracts named; conflicts with this task listed. Stop and return to the architect for a schema decision if existing storage cannot hold this safely.

## R1. Curiosity brief (after the approved script)

**Fix**: one registered LLM call reads only the approved script and the channel guidance and returns: what people believe (or assume) about this subject, what the record in the script says, the gap between them as the question a stranger will have, what is at stake, the one thing a viewer should look at in the picture, the primary device, the place the script answers it (chapter or time), whether a face or figure helps (derived from the script as above) and one promise sentence for the first 5 to 10 seconds. If the script has no honest gap, return "weak gap: ..." and show it at Gate 2 instead of inventing one. The P12 story team's angle may feed this later; build no P12 role here.

**Verify**: the brief quotes where the answer is; a script with no real contrast returns "weak gap"; the face decision differs for a script about a person, a landmark and an abstract subject.

## R2. Six concepts, three kept

**Fix**: from the brief write six text concepts with different devices where the script supports them (say so where it does not): title, thumbnail concept (subject, gaze or gesture, scale, threat or mystery, light, lettering words, optional subline), the question, and where it is answered. Apply the channel's title guidance. **Code validates before anything else**: title length, lettering at most four words plus an optional subline of at most five, hedges from the script kept, every figure and date present in the script, no banned honesty words without the earning contrast, no named real living person. A concept that fails is dropped with the reason, never repaired silently. A cheap text-only cold reader (title and lettering only) ranks the survivors and keeps three. The title must not state the answer.

**Verify**: seeded limit-breaking, hedge-dropping and figure-inventing concepts are caught by code; three survivors continue; a title that gives away its answer is dropped.

## R3. Render two or three thumbnails

**Fix**: build the image prompt from the concept plus the profile's `visual.stylePrompt` and a fixed thumbnail safety set (no readable text in the picture, no logos, no badges, no real people). Do **not** reuse the stills `negativePrompt` verbatim: it was written for scenes and over-restricts a single-subject thumbnail. Quality stays `low`. Lettering is drawn in code with the chosen typeface, safe margins and a subtle plate or shadow; never ask the image model for words. Produce full size, a feed preview (about 360 px wide) and a sidebar preview (about 170 px wide); drop the subline if it fails the small size. Never bake a duration chip or badge into the file. Keep the real files downloadable even when upload fails. Render three only when the spend ceiling allows; otherwise two.

**Verify**: valid files and three previews for a test Long; limits met; readable at the small size; files survive a restart; an uncanny face is reported, not hidden.

## R4. The honesty gate (two checks on the rendered package)

**Fix**: (a) **Vision critic**, sees only the thumbnail and title: what is this about, what do you expect to see, what do you want to know, would you click, what would disappoint you, **does the picture connect to the title without the script**, and a **pairwise compare** against the best other candidate. It is advisory for ranking and is shown to the founder; it never auto-picks. (b) **Payoff check**, sees the script and the package: is every visible scene and word supported, where is the question answered, does it arrive. Hard result: a scene the video lacks, an unanswered question, a picture that contradicts the words, a fake badge or an unearned "untold" drops the package. If a picture-title mismatch is found the package is dropped, not shown. If all packages drop, Gate 2 says so with reasons and YouTube's suggested thumbnail stays.

**Verify**: seeded cases from the spike (an invented object, a contradicting image) are dropped with the reason; an honest package passes; critic notes show at Gate 2.

## R5. Gate 2: the package cards and the choice (app)

**Fix**: build to the designer's screens (the architect supplies them before PR A starts the app part; if they are not ready, build the API and the cards behind the existing Gate 2 layout and stop before polishing). Each package is a YouTube-feed-style card (thumbnail, title, channel, duration drawn by the card) with "viewers will ask: ..." and "answered at: ...". The founder picks one, edits the title (an edited title re-runs the title checks and is refused if unsupported) or keeps YouTube's suggested thumbnail. Persist the choice before any irreversible provider call; the chosen title and file are what publishing uses. A zoomed view shows feed and sidebar previews and a download.

**Verify**: choice survives reload and restart; an unsupported edited title is refused; tenant ownership holds.

## R6. Publishing result

**Fix**: attempt the custom-thumbnail upload through the existing publishing boundary for the run's own channel when eligible. A failed thumbnail call is separate from video upload success. When unavailable, YouTube's suggested thumbnail stays live, the founder sees the file and the real reason, and nothing claims the custom thumbnail is live. Do not reopen the thumbnail 403 (Task 8 R11.5 owns it).

**Verify**: success shows in Studio with `coverFrameSet` true; refusal leaves the video published, `coverFrameSet` false, the file accessible; no second video.

## R7. The opening opens the question (PR C, after Task 2 merges)

**Fix**: for Shorts, the hook line and the frame-zero image come from the chosen package's question. Script Review gets an **advisory** note when the question is not opened within five seconds (ten for Long); it never enters the score or triggers a paid retry. The hook comes first; Task 2's disclaimer follows when its toggle is on.

**Verify**: inspect the first frame and first ten seconds with Task 2 on and off.

## R8. Record what was offered, chosen and rejected (PR C)

**Fix**: store per run the brief, packages offered, the one chosen, its device, title, recipe, typeface and the critic and payoff results, so Compare can group by device. Store impressions, CTR, average view duration and retention only where the provider and existing ingestion supply them; unknown stays null. Do not claim an API for YouTube's Test & Compare or promise a CTR lift.

**Verify**: chosen and rejected read back for a published run; no invented metric.

## R9. Same-cause sweep (Hard rule 9)

Causes: title or thumbnail made in more than one place with different rules; and any channel name or single-channel assumption in packaging code, prompts or fixtures. Search `studio/` and `app/` for every title builder, frame-grab cover, thumbnail helper, hard-coded length or font, and channel name. List each hit as fixed here, left alone with a reason, or needing a new task; give shared limits one owner.

## Regression cases (from the spike; they become tests)

The Eiffel "SOLD FOR SCRAP?" concept passes; a concept that invents an object not in the script is dropped; a picture contradicting its words is dropped; a dropped hedge is caught; a title with a word count over the limit is caught by code; a title that states its answer is dropped; a person-centred script gets a face or figure, a landmark script gets none.

## New LLM Registry purposes

Add packaging purposes to the registry (brief, concepts, cold reader, vision critic, payoff check), each with output limit, retry and evidence, and the canary. Do not reuse `script-generation` or `metadata-generation` for them (the spike did only to avoid blocking).

## Delivery: three PRs so nothing waits

- **PR A (`SPRINT6_TASK1A_BE`)**: R0, R1, R2, R3, R5 (API plus cards), R6. Packages appear at Gate 2 with the title checks.
- **PR B (`SPRINT6_TASK1B_BE`)**: R4 (vision critic and payoff check).
- **PR C (`SPRINT6_TASK1C_BE`)**: R7, R8, R9 final; starts after Task 2 merges. Merge `main` into your branch first.
Report after each PR; the Hard rule 8 closing runs after PR C merges.

## Spend

Text steps are cheap; images are the cost (about $0.0065 each at `low`; two to three per video). Packaging cost is inside the run estimate (decision 4). Live checks for the whole task: ceiling **$2.00**; stop and report at the ceiling. Offline tests carry the rest.

## Schema Impact

Unknown until R0. Prefer existing run or profile JSON only if its contract and persistence fit. Any table, column or migration is described to the architect first; none is assumed.

## Business Logic / State Transition

The approved script precedes packaging. Gate 2 approves the exact title and file before publishing. A custom-thumbnail failure never reverses a successful video upload. Persist the choice before irreversible provider calls. Record any actual change in the Sprint 6 business-logic doc.

## Testing

Backend and app type check, lint, focused tests found in R0. Cover: two differently configured channels and one with no profile; no channel name in any prompt or fixture; per-tenant ownership; three packages, two kept; a "weak gap" script; an over-promising package dropped; an unearned "untold" rejected; an edited title refused when unsupported; Gate 2 choice survives restart; both upload outcomes; small-size readability; file readability and download; Short first frame and first ten seconds; missing metrics shown as unknown. One live run on dev with a real approved script (Mary Celeste or an Appendix A script is a fair test, only where its facts support it), within the ceiling.

## Report

`docs/execution/sprint6/reports/task1.md` (one report, a section per PR): branch, worktree and PR at the top; the R0 table; the contracts chosen; both rendered packages with the three size previews; the cold-reader and payoff results for the live run; actual cost per image and per video; test commands and results; the sweep section; exact upload outcome; Hard rules 5 to 9 lines; code-complete, merged and deployed as three separate statements; open founder decisions. Give the architect a one-line status for `PLAN.md`.

## Links & References

`sprint6/PLAN.md` (P1, section 3 packaging) · `sprint6/tasks/task1-spike.md` and `sprint6/reports/task1-spike.md` (findings, prompts, fonts, code under `studio/scripts/spikes/packaging/`) · `sprint5/bugs/tasks/llm-registry.md` · `sprint6/tasks/task2.md` (the disclaimer; lands first) · [YouTube custom thumbnails](https://support.google.com/youtube/answer/72431) · [YouTube A/B tests](https://support.google.com/youtube/answer/16391400?hl=en) (Long only, desktop, no API) · [impressions and CTR](https://support.google.com/youtube/answer/7628154?hl=en).

## Appendix A. The founder's reference thumbnails (24 Oct), read as grammar

Seven samples, described in our words; do not store or copy them. Four are fiction (not our niche); the grammar still applies.

| Ref | What a stranger sees | Curiosity device | Title device | Take | Do not take |
|---|---|---|---|---|---|
| A. History, about 18 min | A man in front holding a compass, a ship behind him, people on a shore; large gold serif name plus a subline | Person, Mystery (a voyage, a meeting) | "What REALLY happened ...? The untold story ..." (Correction) | Three depth layers that tell the whole story at a glance; name large, question in the title | The loose, stereotyped depiction of real peoples; "REALLY/untold" without the earning contrast |
| B. Fantasy film | A frightened woman cradling small creatures, a huge threat behind | Stake, Countdown | A full-sentence situation: "She is alone ... and the army is close" | Vulnerable person versus looming threat, face and gaze | Fiction subject; fake "4K" badge |
| C. Ice Age | A family at a fire in a shelter, mammoths far away, sunset | Scale, How | "Life 20,000 years ago: how ... survived" | Warm focal light against a vast cold world; a "How" the viewer wants answered; subline of three words | Nothing to avoid except the badge-free rule |
| D. Fantasy film | A warrior with a spear overhead, a giant figure behind | Scale, Stake | "The Prince who started the war" (origin of a consequence) | One small figure and one huge presence | Fiction; "Full Movie 4K" label |
| E. Sci-fi film | Two people staring at a burning sky, huge lettering "THE SUN IS DYING" | Stake, Countdown | "Can he save Earth in time" | A three-word stake in giant lettering; people looking at the thing | Fake "4K"; film-poster framing |
| F. Music video | A close face with a wolf, mood and the words "WOLF MOTHER" | Mystery (mood only) | A plain label | Strong single subject, restraint | Weak curiosity gap: atmosphere without a question |
| G. Devotional story | A figure seen from behind facing an enormous demon, a burning city | Scale, Mystery (back view), Stake | "How ... defeated the unbeatable ...: the full story of the 9-day war" | "Unbeatable" plus "how"; a timely hook (the festival) | Sacred subject needs care; a "Short Movie 4K" label |

## Revision log
- r7, 2026-10-25: spike result built in (belief versus record, picture-title match, withhold the answer, code validators, pairwise critic, six concepts to three, `low` quality); channel-agnostic and no-new-settings rules; faces derived from the script; typeface engine-chosen from three open families; NIYT decisions removed; Gate 2 built to designer screens; new registry purposes; regression cases; packaging cost in the run estimate.
- r6, 2026-10-24: rewritten around the founder's curiosity intent: curiosity grammar, honest-curiosity rules, packages (question, title, thumbnail, answer location), cold-reader and payoff checks, three PRs, spend ceiling, sweep, Appendix A. Short thumbnails and NIYT faces made explicit decisions. Stale L-1 example removed.
- r5, 2026-10-24: NIYT style recorded as channel-specific (earlier text).
