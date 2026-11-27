# Decision: Prompt layers (who owns what in an LLM call)

**Date**: 2026-11-01
**Status**: Decided (founder, 1 Nov 2026). The enforcement lands in Sprint 6 Task 4; two follow-ups are in `sprint6/PLAN.md` (P22, P23). Readers: architects and agents read all of it; channel owners start at "For channel owners".
**Related**: Key Principle 11 in `execution/templates/TASK_TEMPLATE.md` and STATUS rule 4 (nothing channel-specific is hardcoded); `decisions/LLM_AND_NOTIFICATION_CAPABILITY_LAYERS.md` (the registry owns the model and limits per purpose); `execution/sprint6/tasks/task4.md` (P16, creative direction); the prompt audit of 1 Nov (branch `PROMPT_AUDIT`, line numbers from `9be48fb`).

## Why

Every LLM call is built from several inputs written by different people at different times, and nothing said which input owns which question. The result was contradiction on every run:

- Channel words sit in shared prompts (audit A1 to A13): the long writer is "a master historical documentary filmmaker", the long review rewards a "historical moment", the frame review checks the "historical topic".
- The format hint tells the writer each chapter opens with the question it answers (`formats/manifest.ts:103`) while the long writer prompt says "NEVER start a chapter with an explicit question" (`agents/script-generation/long-form.ts:130`) (audit D1). A hard-coded ban can override a channel's own banned lists (D4).
- The writer and the reviewer each build their own copy of the channel's inputs (`script-generation/index.ts:148-157`, `script-review/index.ts:190-194`), so they can disagree about the same video.
- The resolver orders fields only (run, profile, legacy field, default; `channel-profile/resolve.ts`). For prose there is no rule, so each layer says its piece alone.
- One policy name, two strengths: `brief-only` in the Short writer still allows "common, verifiably-safe general knowledge" and says nothing about hedge words (`script-generation/index.ts:81-84`); the long writer says "Rely EXCLUSIVELY on facts explicitly provided" (`long-form.ts:135`). Invented detail was logged in four of seven reviewed runs (`review_tuning/SCRIPT_REVIEW_MISSES.md`, cases 4 to 7).

## Decision

An LLM call's content comes from eight layers. **Each question has one owner.** The table runs from most general to most specific.

| # | Layer | The question it owns | Lives in; changed by | Never contains |
|---|---|---|---|---|
| 1 | Platform rules | What is never allowed, for any tenant, channel or video? YouTube policy (disclosure, no mass-produced content), nothing graphic, no accusing the living, what each fact policy means, human gates, tenant scoping, spend caps | Code constants; the architect by pull request | Style, topic, channel names |
| 2 | Task prompt (the system prompt of each job) | What is this call's job and output shape? Role in neutral words, input description, JSON shape, word-count and quote mechanics | Code; pull request with a snapshot test | Persona, tone, hook or ending style, any example from a real topic |
| 3 | Creative direction (preset) | What craft family is this channel in? Persona kind, hook, story shape, ending, chapter style, pacing, what to avoid, how pictures are judged | Shared data file; pull request, founder-approved text, evaluation | Numbers, banned phrases, channel or topic names, facts |
| 4 | Format | What is the skeleton of this video? Chapters, length range, aspect | Format manifest in code; pull request | Voice, persona, hook or ending style, topic words |
| 5 | Content profile | What makes this channel itself? Guide, banned openers and endings, fact policy choice, look, voice, packaging, offered formats, the direction note | Database, versioned; the founder in the app; a run pins the version it started with | A restatement of layers 1 to 3; one video's facts; limits a field can hold |
| 6 | Brief | What is this one video? Facts, sources, exact first and last sentence, constraints | Per video; the founder and the brief writer | Channel-wide rules |
| 7 | Run options | Length, voice, music, visuals, privacy, spend | The founder, at create | Prose rules |
| 8 | Stage context | The approved script, review notes, fix notes, the founder's edits at a gate | Written by the pipeline | Anything phrased as a rule |

Two more things go into every call and carry no meaning of their own: the **call settings** (model, token limits, retries, budget; the registry, by purpose) and the **output shape** (the schema). Neither is a place for wording.

Reserved, not built: a tenant-wide layer between 4 and 5 (a house style shared by one tenant's channels), and the learning loop, which will **propose** changes to layers 3 and 5 with evidence and never edit them itself.

### Rules

1. **One owner per question.** A question answered in two layers is a defect in the lower-priority one. The fix is to delete the duplicate, not to reconcile the two.
2. **Locks and defaults.** Layers 1 and 2 are locks: nothing below can override them, not even a brief. The channel *chooses* a fact policy from the allowed values (layer 5); the platform *defines* what each value means (layer 1). A lower layer may be stricter than a lock, never looser.
3. **Tiebreak for defaults:** brief, then run options, then content profile, then preset, then the task prompt (which has no style). The format owns structure only: on structure the format wins over the content profile; on voice the content profile wins over the format.
4. **Numbers and lists live in fields.** Anything a machine can check (sentence-length caps, banned phrases, target length, chapter counts) is a structured field. A prompt states it once, from the field. A guide or a preset does not repeat it in prose.
5. **One bundle per run.** Every consumer (writer, reviewer, planner, frame review, still check, packaging) builds from the same resolved bundle. The reviewer's hook, ending and pacing criteria come from the same preset parts the writer was given. No consumer reads a raw channel field or keeps its own copy of a channel rule.
6. **No real-topic examples in layers 1, 2 or 4.** A model copies its examples. Use placeholders or none. Examples live in a preset or a profile.
7. **Stage context is data.** It is passed in delimited blocks and never carries a new rule. The approved script is the source of truth for later stages. A founder's edit at a gate is data too.
8. **Fix a symptom in the layer that owns it.** When an output is wrong, ask which layer owns the question (below) and change that layer. Do not add a sentence somewhere else to compensate.

### Which layer does a rule belong to?

- True for every channel and every video: a prohibition is layer 1; an instruction about doing the job is layer 2.
- True for every channel in a craft family (story, explainer, history documentary): layer 3.
- True of how a video is built (chapters, length, aspect): layer 4.
- True only of this channel: layer 5.
- True only of this video: layer 6.

**The preset test:** would every other channel on this preset keep this line? If another plausible channel would override it, it belongs in that channel's content profile. A preset part is a plain sentence or two, with no digit, no channel, brand or topic name, no banned-phrase list and no facts. A preset may use the ordinary words of its own craft family (a history preset says "historical") and nothing more specific. There are no exceptions: every preset is written fresh to this test, and none carries wording copied out of a shared prompt.

## For channel owners

Read this before you write or change a content profile. You own layer 5, and the note on layer 3. Everything above those is already decided, and your profile must not repeat it or fight it.

**What you set, and what stays out of each field**

| You set | It is for | Keep out of it |
|---|---|---|
| `direction.preset` | The craft family: one of the five presets in the Presets section below | Nothing to keep out. You choose a preset; you do not edit one |
| `direction.note` (up to 300 characters) | One line that bends the preset for this channel | A copy of a preset sentence; numbers; a banned-phrase list |
| `script.guide` | What is true of this channel only: truth layers, tense and person, rotation, sensitivity rules, the narrator's attitude where it differs from the preset | Hook, ending, chapter and pacing rules the preset already holds; numbers a field holds; one video's facts |
| The fields: banned openers and endings, fact policy, target length, look (`stylePrompt`, `negativePrompt`), voice, mood, packaging (title guidance, description template, hashtags), formats | Every number and list a machine can check | Prose that restates them |
| The brief | One video: facts, sources, exact first and last sentence, constraint lines | Channel-wide rules |

**Before you save a profile**, take every sentence in the guide and ask:
1. Does the platform or the preset already say this? Delete it. (Read the Presets section.)
2. Is it a number or a list that a field holds? Move it to the field.
3. Is it about one video? Move it to the brief.
4. Does it argue with the preset? Do not fight the preset in the guide. If the preset is wrong for the channel, ask the architect for another preset or a change (the founder approves the text). The note can tilt a preset slightly, no more.
5. After saving, reopen the new version and read the `warnings` the save returns. A warning does not block the save. It means a sentence probably belongs somewhere else.

**Known limits today (1 Nov)**
- Sentence-length caps (for example "at most 12 words") are still prose in the guide, because there is no field for them yet (P23). The save warning will flag them. That is expected: keep the caps, in one sentence, until the field exists.
- The safety lines (nothing graphic, no accusing the living, no villain the record does not name) are **not** platform rules yet (P22). Each channel guide must carry its own.
- `brief-only` does not mean the same thing in the Short writer and the long writer (P22). Where the sources hedge, put the hedge word in the brief ("usually", "according to"), and check hedges at Gate 1.
- Until Task 4 is built, the 1 Nov audit found a history voice in the long-form prompts and in the format hints. The presets below are the target, not what runs today.

**Asking for a change.** A new preset, or a change to one, goes to the architect. The founder approves the text, a pull request bumps the preset's version, and an evaluation runs (Change procedure below). A change to a platform rule or a task prompt goes the same way. Do not work around either in your profile.

## What each call takes from the channel

Plain words, not the prompt text. The text holds output shapes and mechanics and changes with the code, so a copy here would go stale. When you need the exact wording, read the prompt files listed in `execution/sprint6/tasks/task4.md` (R0). This table is the contract once Task 4 is built. It was written from the 1 Nov audit and Task 4's file list, and was not re-read in code.

| Call | Its job | What it takes from the channel |
|---|---|---|
| Script writer (Short and long) | Writes the script from the brief | Preset parts (persona, domain, hook, story shape, ending, chapters, pacing, avoid); the guide; banned openers and endings; fact policy; target length; the format's skeleton |
| Script reviewer | Checks the script against the brief and the channel | The same hook, ending and pacing text the writer got; the guide; banned lists; fact policy |
| Picture planner (Short and long) | Plans what each beat shows | Preset domain; the look (`stylePrompt`, `negativePrompt`); visual source |
| Frame review and still check | Judge the pictures | Preset picture-review tone; the look |
| Packaging | Titles, description, hashtags | The packaging fields (title guidance, description template, hashtags); never the preset |

## Presets

Data, not prose. A test in `studio` reads this section and fails if the code's presets differ from it character for character. So edit it only through the Change procedure, keep the block format (`### preset: <key>`, then one `- **part:** text` bullet per line), and never reformat it. Each preset has a `version` (normally a text change bumps it; the proposed Task 5 in-place Explainer revision requires an unused-key compatibility check before rollout), a `label` and `summary` (shown in the app's picker), and nine parts. **Required in every preset:** `persona`, `hookRule`, `endingRule`, `pacingCues`, `avoid`, `visualReviewTone`. `domain`, `storyShape` and `chapterStyle` may be `(empty)`. No part holds a digit, a channel or brand name, a banned-phrase list or a fact. The ordinary words of a craft family are allowed (the history preset says "historical").

The founder approved the original four texts on 1 Nov 2026 and approved the revised explainer and new Puzzle & Reveal wording on 27 Nov 2026.

Planned assignment (set by Task 4, R5): NIYT `history`, Cold Open `story-first`, Start to Shelf `explainer`. A channel with no preset gets `neutral`. A channel's own rules stay in its content profile. For Cold Open that means the truth layers, "popular version, then record", the tense rules, the sentence caps, the case-type rotation, third-person voice, and the graphic and accusation lines.

### preset: history
- **version:** 1
- **label:** History documentary
- **summary:** A documentary storyteller for stories from the past, built on conflict and turning points.
- **persona:** A documentary storyteller who brings the past to life with a historian's care and a film's pull. One steady, atmospheric voice that never turns breathless and says plainly when the sources are silent.
- **domain:** The past: events, people and everyday life, told from the sources.
- **hookRule:** Open inside one vivid, documented moment from the brief, then step back to how it came about. Let the tension build before any context arrives. The first line must work with the sound off. No greeting, no setup, no generic question.
- **storyShape:** Build the story around conflict and turning points. Set the time and place early, in plain words. Plant one or two open questions early and settle them later, as far as the sources allow. Let the shape of the story set the order of the beats; do not force one pattern on every video.
- **endingRule:** Settle the open questions as far as the sources allow, then close on one lingering thought. No summary sign-off, no moral, no question to the viewer, no call to action, no promise of another video.
- **chapterStyle:** Each chapter has one job. Open it in the action: a conflict, a turning point or a shift in perspective. Do not open with a question or a recap. Give each chapter a vivid title label.
- **pacingCues:** Write for the ear: short, rhythmic sentences, no semicolons. Use an ellipsis for a real pause and a dash for a shift. Let a short line land after a long one.
- **avoid:** Hype words and exclamation marks. Modern slang. Judging people of the past by today's standards. Suspense that promises more than the sources give.
- **visualReviewTone:** Judge pictures as frames from a serious historical documentary. Each must fit the scene being narrated and its period and place; anything out of period is a defect.

### preset: story-first
- **version:** 1
- **label:** Story first
- **summary:** True stories told like a film: one central question, a chain of "but" and "so", and a quiet last line.
- **persona:** A storyteller who tells true stories as a film would. One plain, confident voice, curious about the case and a little amazed by it, that says plainly when something is not known.
- **domain:** A real event told as a story around one central question, answered as far as the evidence allows.
- **hookRule:** Open inside the strangest moment the brief gives, not before it. The first line must work with the sound off. Start in the moment, then step back to how it began. No greeting, no setup, no generic question.
- **storyShape:** Tell it as a chain of "but" and "so": what someone wanted, what stood in the way, what happened because of it, and the turn. Put a turn near the middle that makes the next beat necessary. Plant one open question early and pay it off at the end, or say plainly that it cannot be answered. Let the shape of the story set the order of the beats; do not force one pattern on every video.
- **endingRule:** End on the strongest fact in the story, or the plainest statement of what is not known, in one line shorter than the lines before it. Where it fits, echo a word from the opening. Then stop. No moral, no question to the viewer, no call to action, no promise of another video.
- **chapterStyle:** Each chapter has one job. A chapter may open with the question it answers; otherwise it opens in the action. Never open with a recap.
- **pacingCues:** Write for the ear: one idea per sentence, no semicolons. Mix very short lines with longer ones, and let a short line land after a long one. Use an ellipsis only for a real breath.
- **avoid:** Hype words and exclamation marks. Suspense that promises the answer instead of withholding it. A moral. Mocking anyone in the story.
- **visualReviewTone:** Judge pictures as frames from a serious film about this story. Each must fit the scene being narrated and its time and place.

### preset: explainer
- **version:** 1
- **label:** explainer
- **summary:** Show how something works, how it is made, or why it behaves the way it does. Follow the steps, explain the mechanism, or combine both.
- **persona:** Explain in a clear, approachable voice. Describe actions in order when sequence matters and show how parts interact when the viewer needs to understand a result.
- **domain:** Show how an object, process or system works, how it is made or why it behaves as it does. Make the important steps, transfers and resulting changes visible.
- **hookRule:** Open on a concrete action, visible result, design feature or operating limit. Show what the viewer gains by understanding this particular result.
- **storyShape:** Choose the order that best answers the brief. For a walkthrough, follow the important steps and show what changes at each one. For a mechanism, trace what causes the result and what it depends on. Combine both when the steps help explain the cause.
- **endingRule:** Return to the opening and show what the steps produce or why the observed behavior occurs. If a supported change in conditions would alter the result, explain how.
- **chapterStyle:** Give each chapter a step, change, constraint or decision to explain. Connect it to what follows or to its effect on the larger system.
- **pacingCues:** Slow down where a viewer could lose track of what changes or why. Use a visible before-and-after when it makes the transition easier to follow.
- **avoid:** Avoid catalogs of parts and unsupported precision. Say when a proposed cause or design rationale is an inference. Preserve the conditions and limits that make the explanation true.
- **visualReviewTone:** Check that the action or relationship is visible when the narration explains it. Flag missing or misleading steps, reversed transfers and inconsistent states.

### preset: neutral
- **version:** 1
- **label:** Neutral
- **summary:** A clear, engaging default with no particular style.
- **persona:** A clear, engaging scriptwriter for online video.
- **domain:** (empty)
- **hookRule:** Open with the most interesting true thing the brief gives. No greeting, no generic question.
- **storyShape:** (empty)
- **endingRule:** End on the strongest point, then stop. No call to action, no question to the viewer.
- **chapterStyle:** (empty)
- **pacingCues:** Write for the ear: one idea per sentence.
- **avoid:** Hype words and exclamation marks.
- **visualReviewTone:** Judge whether each picture fits what is being said at that moment.

### preset: puzzle-reveal
- **version:** 1
- **label:** Puzzle & Reveal
- **summary:** Choose this when viewers can spot a clue, trace a hidden connection or try a solution before seeing how the evidence supports the reveal.
- **persona:** Guide a curious viewer who is capable of working things out. Be precise about what they can observe, what they can infer and what remains open.
- **domain:** Show a question through the evidence or constraints the viewer can inspect. Establish the decisive detail before the answer and return to it with its identifying features intact.
- **hookRule:** Put a concrete situation, choice or apparent contradiction in view and make the question clear. Direct attention to the first observation or constraint while leaving its significance for the viewer to discover.
- **storyShape:** Give viewers a chance to inspect the evidence, predict the outcome or try their own solution before the explanation. Let each discovery confirm a prediction, change an interpretation or help the viewer compare options. When you promise a solvable puzzle, supply every essential clue before the solution.
- **endingRule:** Return to the opening evidence and show how it supports the answer. When alternatives fit, demonstrate a workable answer and its trade-off or say what the evidence leaves undecided.
- **chapterStyle:** Give each chapter an observation to test or a constraint to resolve. Carry the remaining question forward once the viewer has learned something concrete.
- **pacingCues:** Hold a visual clue long enough to inspect it, or leave a beat to weigh a choice before the explanation. Bring an earlier detail back when it changes what the viewer can conclude.
- **avoid:** Avoid empty teasing, concealed premises, premature spoilers and claims of a unique answer when alternatives fit.
- **visualReviewTone:** Check that the viewer can inspect the clue or constraint before the payoff and recognize it again at the explanation. Flag captions or crops that hide it, shots that change it and images that give away the answer too soon.


## Where things sit today (to be moved)

From the prompt audit (line numbers from `9be48fb`; the lines marked "read 1 Nov" were read on `main` that day).

| Today | Belongs in | Fixed by |
|---|---|---|
| Long writer persona, cold open, pacing, chapter openings, open loops, outro (`long-form.ts:120-132`, read 1 Nov) | Layer 3 (the `history` preset, written fresh to the preset test); the mechanics around them stay in layer 2 | Task 4 |
| Tags line "relevant historical search terms" (`long-form.ts:138`) | Tag count in layer 2; the noun from the channel's hashtags (layer 5) | Task 4 |
| Long review hook "historical moment" (`script-review/index.ts:138`); frame review "historical topic and dramatic tone" (`video-intelligence/index.ts:281`); Short planner "a historical event" (`plan.ts:171`); long planner "inventing historical facts" (`plan-long.ts:159`); still check "for a documentary video" (`still-check.ts:47`) | Layer 3, read from the same parts the writer uses | Task 4 |
| Format hints: "each chapter opens with the question it answers", "a closing line that points forward" (`manifest.ts:103`); brief template "[Historical event/thing]" (`manifest.ts:33`) | Chapter structure stays in layer 4; opening and closing style move to layer 3; topic words leave | Task 4 (the report lists what is left) |
| Lego, Roman and "$120" examples in the review rules (`script-review/rules.ts`) | Neutral placeholders, or layers 5 and 6 | The separate neutral-examples task; listed as known debt in the scan below |
| `brief-only` defined twice with different strength | Layer 1, one definition | P22 |
| Safety lines (nothing graphic, no accusing the living, no villain the record does not name) exist only in channel guides, not as a platform rule | Layer 1. Adding them is a behaviour change for every channel, so it needs a before and after | P22 |
| Sentence-length caps and similar limits written as prose in channel guides | Layer 5 fields | P23 |
| Reviewer notes, fix notes and the founder's gate edits entering the next call (how each call passes them today is not verified) | Layer 8: delimited data, never phrased as a rule (rule 7) | P22 reads each call first, then fixes and tests it |

## Enforcement

A rule that is not tested is not locked. The pattern already exists: `llm/no-output-cap-outside-llm.test.ts` scans the source tree and fails on a violation.

| Check | What it catches | Built by |
|---|---|---|
| **Prompt-neutrality scan** (source scan) | A channel, niche or brand word in the prompt files of layers 1, 2 and 4. Starts with a short written debt list (the review-rule examples); each Task 4 PR removes entries it fixes; after PR C the list holds only the neutral-examples debt | Task 4 PR A (list), PR C (hard fail) |
| **Preset lint** | A digit, a channel or topic name, a banned-phrase list, an over-long part (more than 120 words), a missing required part | Task 4 PR A |
| **Prompt snapshots** | Any change to an assembled prompt, per live channel and purpose, so no prompt changes without a visible diff for the reviewer to read | Task 4 (R3, R4) |
| **Writer and reviewer agree** | For every preset, the writer prompt and the reviewer prompt are built from the same hook, ending and pacing part text | Task 4 PR B |
| **Bundle scan** | A consumer reading `Channel.styleGuide`, `Channel.defaultVoice` or profile JSON outside `channel-profile/` and the bundle builder (Task 4 R0 lists the exact fields) | Task 4 PR B |
| **Profile-save warnings** | `channels.createProfileVersion` returns an optional `warnings: string[]` and still saves. It warns when the guide holds a number next to words, sentences or seconds (a limit that belongs in a field), or repeats a sentence of the chosen preset. The picker shows them | Task 4 PR A (server); the Task 3 app task shows them behind `creativeDirection` |
| **Layer versions on every run** | A prompt that cannot be traced to its inputs. A run records `profileVersionId` (exists), `presetKey` and `presetVersion` (Task 4 C1) and the pipeline-version tag (Task 3) | Task 4, Task 3 |
| **Brief check at intake** (plain code) | A fixed first or last sentence that the channel's own banned lists forbid; straight quotes; missing required constraint lines | P23 |
| **Stage context is data** (test) | A reviewer note, fix note or founder edit that reaches a prompt outside a delimited data block, or phrased as a rule | P22 |

## Dirty data

- **One source per field.** The legacy `Channel.styleGuide` and `Channel.defaultVoice` stay read-only fallbacks in the resolver until every live channel has a content profile, then the fallback is removed. The channel settings screen no longer shows them (Task 4, C6). Which channels have a profile today is not verified (Task 4, R0 item 4).
- **Validate at every boundary.** Profile (strict schema, exists), preset key (enum), run options (validated when a run is created, exists), model output (schema and JSON extraction, exists), brief (P23).
- **Never pass raw model output on as a rule.** Reviewer notes and fix notes enter the next call only as stage context (rule 7).

## Change procedure

- **Layers 1 and 2:** the architect, by pull request, with the snapshot diff. A claim that a change improves quality needs a real-run comparison (build principle).
- **Layer 3:** one pull request that edits the Presets section of this doc and the presets data file together (a test fails if they differ), bumps the preset version, shows the snapshot diff for every channel on that preset, carries the founder's approval of the text, and runs an evaluation under a stated spend ceiling.
- **Layer 5:** the founder in the app; a new profile version; running runs keep theirs.
- **Layers 6 and 7:** per video.
- Every task that touches a prompt names the layer it changes (Key Principle 12, `TASK_TEMPLATE.md`).

## Not decided

- The tenant layer (reserved).
- Whether the learning loop's proposals for layers 3 and 5 go through the same approval screen as a manual change (decide when the loop is built).

## Not verified

Code was read on `main` on 1 Nov: `script-generation/index.ts`, `long-form.ts` (lines 100 to 175), `channel-profile/schema.ts` and `resolve.ts`, `run-pipeline/resolved-config.ts`, and the lines named above. Audit lines not marked "read 1 Nov" come from the audit report at `9be48fb` and were not re-read. The call table ("What each call takes from the channel") comes from the audit and Task 4's file list and was not re-read in code. Not checked: what the debug bundle stores per call; which channels have a content profile; whether `brief-only` is set on each live channel.

## Revision log

- r1, 2026-11-01: first issue (architect), after the founder asked for the roles of the system prompts, presets, content profile and other inputs to be defined and locked before the preset text is approved.
- r2, 2026-11-01: the `history` preset is written fresh, like the others (founder, 1 Nov: NIYT will be rewritten as a channel, so its prompts are not carried forward). Removed the recorded exceptions (digits and six carried phrases), the byte-identity check, and the digit exception in the preset lint. A preset may use the ordinary words of its own craft family and nothing else.
- r3, 2026-11-01: added the channel-owner guide, the plain-words table of what each call takes from the channel, and the Presets section (the four approved texts moved here from Task 4 Appendix A, so they do not go stale when the task closes; a test keeps the code equal to them). Rule 7 (stage context is data) now has a check, owned by P22. Founder: "go", 1 Nov.
