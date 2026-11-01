# Decision: Prompt layers (who owns what in an LLM call)

**Date**: 2026-11-01
**Status**: Decided (founder, 1 Nov 2026). The enforcement lands in Sprint 6 Task 4; two follow-ups are in `sprint6/PLAN.md` (P22, P23).
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

## Dirty data

- **One source per field.** The legacy `Channel.styleGuide` and `Channel.defaultVoice` stay read-only fallbacks in the resolver until every live channel has a content profile, then the fallback is removed. The channel settings screen no longer shows them (Task 4, C6). Which channels have a profile today is not verified (Task 4, R0 item 4).
- **Validate at every boundary.** Profile (strict schema, exists), preset key (enum), run options (validated when a run is created, exists), model output (schema and JSON extraction, exists), brief (P23).
- **Never pass raw model output on as a rule.** Reviewer notes and fix notes enter the next call only as stage context (rule 7).

## Change procedure

- **Layers 1 and 2:** the architect, by pull request, with the snapshot diff. A claim that a change improves quality needs a real-run comparison (build principle).
- **Layer 3:** a pull request that bumps the preset version, the snapshot diff for every channel on that preset, the founder's approval of the text, and an evaluation under a stated spend ceiling.
- **Layer 5:** the founder in the app; a new profile version; running runs keep theirs.
- **Layers 6 and 7:** per video.
- Every task that touches a prompt names the layer it changes (Key Principle 12, `TASK_TEMPLATE.md`).

## Not decided

- The tenant layer (reserved).
- Whether the learning loop's proposals for layers 3 and 5 go through the same approval screen as a manual change (decide when the loop is built).

## Not verified

Code was read on `main` on 1 Nov: `script-generation/index.ts`, `long-form.ts` (lines 100 to 175), `channel-profile/schema.ts` and `resolve.ts`, `run-pipeline/resolved-config.ts`, and the lines named above. Audit lines not marked "read 1 Nov" come from the audit report at `9be48fb` and were not re-read. Not checked: what the debug bundle stores per call; which channels have a content profile; whether `brief-only` is set on each live channel.

## Revision log

- r1, 2026-11-01: first issue (architect), after the founder asked for the roles of the system prompts, presets, content profile and other inputs to be defined and locked before the preset text is approved.
- r2, 2026-11-01: the `history` preset is written fresh, like the others (founder, 1 Nov: NIYT will be rewritten as a channel, so its prompts are not carried forward). Removed the recorded exceptions (digits and six carried phrases), the byte-identity check, and the digit exception in the preset lint. A preset may use the ordinary words of its own craft family and nothing else.
