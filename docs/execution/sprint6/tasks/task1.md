# Sprint 6 Task 1: Curiosity Packaging, titles and thumbnails that make a stranger want to know (P1)

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow, the Hard rules (5 to 9: task doc sync, pull `main` before ready, who owns which doc, close after merge, same-cause sweep), the `STATUS.md` rule and the report shape. This file states only this task's specifics. Keep every reply to the founder to 3 lines; only the report is long. Do not edit `STATUS.md`, `PLAN.md` or any doc except your own report and the docs named in the Report section.

**Revision**: r6, 2026-10-24. Rewritten around the founder's intent (curiosity, not the file). r5 treated this as "make options and upload a thumbnail".

**Written**: 2026-10-24 by the architect chat, at the founder's request. **Status**: not started. **Priority**: P2, runs first among the priority 2 items by founder direction (24 Oct), ahead of P12. **Branches**: `SPRINT6_TASK1A_BE`, `SPRINT6_TASK1B_BE`, `SPRINT6_TASK1C_BE` (add `_FE` branches only if R0 shows the app change is too big to share a PR); worktrees `task1a`, `task1b`, `task1c` under `D:\Study Material\7AI-SPRINT6`. Give branch, worktree and PR in your first reply and at the top of the report (Hard rule 7).

## What the founder wants (read this twice)

The goal is not "a custom thumbnail" or "better titles". The goal is that a stranger scrolling past **feels curious enough to click**, and then the video honestly pays that curiosity off. The founder's reference thumbnails (24 Oct, described in Appendix A; do not commit the images) all do one thing: at a glance they raise a question the viewer cannot answer without watching. The thumbnail shows the world and the stake; the title asks the question. They are one pair, designed together, and the video closes the gap.

**Curiosity here means an honest information gap, never a trick.** A package that promises something the video does not deliver is a defect, however well it would click.

## Objective

For every channel, after the script is approved, build **curiosity packages**: each is one question the viewer will have, a title, a thumbnail and the place in the video where the question is answered. Test them with a cold reader before the founder sees them, drop any that over-promise, and let the founder choose at Gate 2 on a mock viewer card. Keep YouTube's suggested thumbnail as the fallback. Also give Shorts a strong first-seconds opening built from the chosen package.

**Duration**: to estimate after R0 (three PRs, see Delivery).
**Depends On**: existing Gate 1/Gate 2 and publishing paths; the LLM Registry (every new LLM call is registered there: output limit, retry and evidence per Part B); Sprint 6 Task 2 must merge before PR C (both change the Short opening). P2's 403 concerns NIYT only; it must not block other channels or the option tool.
**Owning Component**: Packaging and publishing, thumbnail generation and overlay, Gate 2 API and app UI, video opening. Confirm exact owners in R0.
**Success Criteria**: on any channel the founder sees, at Gate 2, two real packages on a mock viewer card, each with the question viewers will have and where the video answers it; every package passed the cold-reader and payoff checks or was dropped with a reason; the choice survives a restart; the chosen thumbnail file is what goes to the upload boundary when supported; the truthful result is shown when it is not.

## Founder decisions still open (recommendations given)

1. **NIYT faces.** NIYT's current rules restrict sharp faces; two of the references work because a face or figure dominates. Recommendation: on thumbnails, show figures from behind, in profile or in shadow by default; a front-facing imagined face only where the founder approves it for that channel. R0 reads the NIYT config and reports the exact current rule.
2. **Shorts thumbnails.** The Shorts feed shows no thumbnail, so a 9:16 custom thumbnail has low value. Recommendation: build 16:9 Long first. For Shorts the package is title + hook line + frame-zero image; add a 9:16 thumbnail only if R0 finds real evidence it matters for this channel.
3. **NIYT exact display typeface.** The cinematic serif direction is accepted for NIYT only; R0 names a licensable face, and the first real pair needs the founder's approval before it becomes the default. Other channels use their own profile font and mark, with a neutral fallback.
4. **Cost per video.** Set after R0 from the real image price (see Spend).

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

**Where**: run creation, Gate 1 and Gate 2 contracts, publish metadata and title generation, script fact check, still generation, video rendering, thumbnail extraction and upload, artifact storage, Compare grouping, retention ingestion, the LLM Registry model table (`llm/models.ts`), the relevant app screens, current reports and open work.

**Fix**: put a confirmed / wrong / unknown table in the report before choosing files, storage, costs or API shape. Confirm: which image generator and price per image; whether a registry model can read images (needed for R4); font licensing and the NIYT face rule; whether run or profile JSON can hold the brief, the packages, the choice, the device and the recipe per channel and run; how a run survives a restart and how Gate 2 edits persist; how channel ownership stops packaging crossing tenants; what the current title generation and title fact check do. Do not state a code or schema fact from an older doc.

**Verify**: the report names real files and contracts and every conflict with this task. Stop and return to the architect for a schema decision if existing storage cannot hold this safely.

## R1. Curiosity brief (after the approved script)

**Fix**: one structured LLM call (registry, capped, evidence recorded) reads only the approved script and the channel guidance and returns: the question a stranger will have (the gap), what is at stake, the scale or mystery element, the primary device, the place the script answers it (chapter or time), and one promise sentence for the first 5 to 10 seconds. If the script has no honest gap, return that plainly ("weak gap: ...") instead of inventing one; the weakness is shown at Gate 2. When the P12 story team exists, its angle feeds this step; do not build any P12 role here.

**Verify**: for a test script the brief quotes where the answer is. A script with no real question returns "weak gap" and the founder sees it.

## R2. Three packages, then keep the best two

**Fix**: from the brief make three packages with three different primary devices: each has a title, a thumbnail concept (subject, gaze or gesture, scale, the threat or mystery, light, lettering words, optional subline), the question viewers will have, and where it is answered. Apply the channel's title guidance and length limits; run every title and every lettering word through the existing fact check. A cheap text-only cold-reader call ranks the three and keeps the best two before any image is paid for.

**Verify**: three distinct packages exist; an unsupported figure or "really/untold" without the earning contrast is rejected; only two reach image rendering.

## R3. Render the two thumbnails (the thumbnail tool)

**Fix**: generate the scene with the channel's look; add the lettering in code (at most four words plus the optional subline) in the channel's profile font, with safe margins; produce 16:9 for Long (9:16 only per decision 2). Never bake a duration chip or any badge into the file; the mock card draws the duration. Check readability at three sizes (full, a feed-size preview about 360 px wide, a sidebar preview about 170 px wide) and drop the subline if it fails the small size. Concepts carry the grammar above, never a reference's names. Keep the real downloadable files even when YouTube refuses upload.

**Verify**: two valid image files and three size previews exist for a test Long; lettering is within limits and readable at the small size; files are readable and downloadable after a restart.

## R4. Click test and payoff check (the honesty guard)

**Fix**: two separate calls on the two rendered packages.
(a) **Cold reader**: sees only the thumbnail and the title. Answers: what is this about, what do you expect to see, what do you want to know, would you click and why, what would disappoint you. Its answer ranks the packages and its reasons are shown to the founder. Advisory only; it never changes a score or auto-picks.
(b) **Payoff check**: sees the script and the package. Answers: is every visible scene and word supported, where is the question answered, does it arrive. Hard result: a scene the video does not contain, a question never answered, a fake badge or an unearned "untold" drops the package, never to Gate 2. If both packages drop, Gate 2 says so with the reasons and YouTube's suggested thumbnail stays.

**Verify**: a seeded over-promising package (a scene not in the script) is dropped with the reason; an honest one passes; the cold-reader notes appear at Gate 2.

## R5. Gate 2: the mock viewer card and the choice

**Fix**: show each package as a YouTube-feed-style card (thumbnail, title, channel, duration chip) with, under it, one line "viewers will ask: ..." and "answered at: chapter or time". The founder picks one, edits the title (an edited title re-runs the fact check) or keeps YouTube's suggested thumbnail. Persist the choice before any irreversible provider call; the chosen title and file are what publishing uses.

**Verify**: choice survives reload and restart; an edited title with an unsupported figure is refused; per-tenant ownership holds.

## R6. Publishing result

**Fix**: attempt the custom-thumbnail upload through the existing publishing boundary for the run's own channel when eligible. Keep a failed thumbnail call separate from video upload success. When custom upload is unavailable, YouTube's suggested thumbnail stays live, the founder sees the generated file and the real reason, and nothing claims the custom thumbnail is live. Do not reopen P2's 403 investigation.

**Verify**: a success shows the thumbnail in Studio and `coverFrameSet` true; a refusal leaves the video published, `coverFrameSet` false, the file accessible; no second video is inserted.

## R7. The opening opens the question (PR C, after Task 2 merges)

**Fix**: for Shorts, the strongest image and the hook line are at frame zero and come from the chosen package's question. Script Review gets an **advisory** note when the question is not opened within five seconds (ten for Long); it never enters the score or triggers a paid retry (Task 6 D7). The hook comes first; Task 2's fixed disclaimer follows it when its toggle is on. Gate 2's card also plays or shows the first ten seconds.

**Verify**: inspect the rendered first frame and first ten seconds, with Task 2 on and off.

## R8. Record what was offered, chosen and rejected (PR C)

**Fix**: store, per run: the brief, the packages offered, the one chosen, its primary device, title, thumbnail recipe, and the cold-reader and payoff results, so Compare can group by device and we can later see which devices the founder picks and which win. Store impressions, click-through rate, average view duration and retention only where the provider and the existing ingestion supply them; unknown stays null. Read CTR with impressions and watch time. Do not claim an API for YouTube's Test & Compare or promise a CTR lift.

**Verify**: the chosen and rejected packages read back for a published run; no invented metric appears.

## R9. Same-cause sweep (Hard rule 9)

Name the cause (title or thumbnail made in more than one place with different rules). Search `studio/` and `app/` for every existing title builder, frame-grab cover, thumbnail helper and hard-coded length or font; list each hit as fixed here, left alone with a reason, or needing a new task; give shared limits one owner.

## Delivery: three PRs so nothing waits

- **PR A (`SPRINT6_TASK1A_BE`), the thumbnail tool first**: R0, R1, R2, R3, R5, R6. Packages appear at Gate 2 with the existing title fact check.
- **PR B (`SPRINT6_TASK1B_BE`)**: R4 (cold reader and payoff check).
- **PR C (`SPRINT6_TASK1C_BE`)**: R7, R8, R9 final; starts after Task 2 is merged. Merge `main` into your branch first.
Report after each PR; the Hard rule 8 closing runs after PR C merges (or after the founder says the task ends earlier).

## Spend

Text steps are cheap; images are the cost. Report the real price per image after R0 and the founder fixes a per-video ceiling then. Live checks for the whole task: proposed ceiling **$2.00**, confirmed or changed by the founder after R0; stop and report at the ceiling. Never spend on a live call you did not need; offline tests carry the rest.

## Schema Impact

Unknown until R0. Prefer existing run or profile JSON only if its contract and persistence fit. Any table, column or migration is described to the architect first; none is assumed.

## Business Logic / State Transition

The approved script precedes packaging. Gate 2 approves the exact title and file before publishing. A custom-thumbnail failure never reverses a successful video upload. Persist the choice before irreversible provider calls. Record any actual change in the Sprint 6 business-logic doc.

## Testing

Backend and app type check, lint, focused tests found in R0. Cover: two differently branded channels; per-tenant ownership; three packages, two kept; a "weak gap" script; an over-promising package dropped; an unearned "untold" rejected; an edited title refused when unsupported; Gate 2 choice survives restart; both upload outcomes; small-size readability; file readability and download; Short first frame and first ten seconds; missing metrics shown as unknown. One live run on dev with a real approved script (Mary Celeste or an Appendix A script is a fair test, only where its facts support it), within the ceiling.

## Report

`docs/execution/sprint6/reports/task1.md` (one report, a section per PR): branch, worktree and PR at the top; the R0 table; the contracts chosen; both rendered packages with the three size previews; the cold-reader and payoff results for the live run; actual cost per image and per video; test commands and results; the sweep section; exact upload outcome; Hard rules 5 to 9 lines; code-complete, merged and deployed as three separate statements; open founder decisions. Do not edit `docs/channel_bibles/NIYT_CHANNEL_CONFIG.md`; the architect updates it from your findings. Give the architect a one-line status for `PLAN.md`.

## Links & References

`sprint6/PLAN.md` (P1, section 3 packaging) · `docs/channel_bibles/NIYT_CHANNEL_CONFIG.md` (section 11 packaging, G11, section 14) · `docs/channel_bibles/NOT_IN_YOUR_TEXTBOOK.md` (older font guidance, only where the newer config does not disagree) · `sprint5/bugs/tasks/llm-registry.md` · `sprint6/tasks/task2.md` (the disclaimer; lands first) · [YouTube custom thumbnails](https://support.google.com/youtube/answer/72431) · [YouTube A/B tests](https://support.google.com/youtube/answer/16391400?hl=en) (Long only, desktop, no API) · [impressions and CTR](https://support.google.com/youtube/answer/7628154?hl=en).

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
- r6, 2026-10-24: rewritten around the founder's curiosity intent: curiosity grammar, honest-curiosity rules, packages (question, title, thumbnail, answer location), cold-reader and payoff checks, three PRs, spend ceiling, sweep, Appendix A. Short thumbnails and NIYT faces made explicit decisions. Stale L-1 example removed.
- r5, 2026-10-24: NIYT style recorded as channel-specific (earlier text).
