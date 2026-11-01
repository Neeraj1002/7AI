# Cold Open: Channel Production Spec

**Version 1.1 (draft for founder review) · 2026-10-30 · Owner: Neeraj · written by the architect chat; section 8 and the notes marked "30 Oct" revised by the Cold Open manager session at the founder's request.**
**Read this first.** Any chat that writes a brief, sets a channel option or judges a video for Cold Open starts here. It says what the channel is, the production settings a small team would hold, which of them the app supports today, the exact values to enter, how a brief (a "treatment") is built, and what is still missing.

**Direction change, 30 Oct (founder).** Cold Open moves toward real cons, heists, thefts, forgeries and trials from history, with a Shorts-first test. Murders and violent true crime stay out for now. The profile in section 8 is the simplified version agreed on 30 Oct; the earlier mystery-only values are in version 1.0 of this doc (git history). The mystery cases in sections 5 and 13 (Mary Celeste and the rest) stay on the tracker but are not the current test.

**Relationship to Not In Your Textbook (NIYT).** Cold Open is a separate channel with its own name, look, voice and rules. `NIYT_CHANNEL_CONFIG.md` is not changed by this doc. NIYT's first-person "history from the inside" rules (nameless narrator, imagined day, stance switching) do not apply here. The app, the pipeline and the gap register (NIYT spec section 13) are shared, and nothing in 7AI may be hardcoded for either channel.

**App state caveat.** The tags below are copied from NIYT spec v2.2 (2026-10-19). Re-check them against the latest STATUS before relying on them.

**How to read the tags** (every setting carries one; update them when the app ships a feature):
- ✅ **Wired**: a field in the app (profile or New brief). Enter it.
- 📝 **Text**: the app has no field. It is carried in the style guide or brief lines and a person checks it at the gates.
- ⬜ **Future**: needs an app feature (section 14). Never treat it as active.

---

## 1. The concept

| Field | Value |
|---|---|
| Name | **Cold Open**. Handle `@coldopenhistory` (the app and Studio now show Cold Open, 29 Oct). |
| Tagline | True stories from history that play like films. |
| Domain | Real events that feel like a thriller or a mystery. From 30 Oct the test focus is cons, heists, thefts, forgeries and trials, told as legend first, then record. Disappearances, strange finds and disasters stay in scope for later. One question per video, answered as far as the evidence allows. |
| Promise | The popular story first, then what the record actually supports. |
| Audience | English-speaking, global, 18 to 45; curious generalists who like film-style storytelling. |
| Tone | Plain, confident, precise and curious; suspenseful by withholding, never by hype. Says "we do not know" without embarrassment. (Changed 30 Oct from "calm": a calm voice made Shorts feel slow. Longs may stay calm if a brief asks.) |
| Language | English |
| Products | **Long** 8 to 10 min, 16:9 (the core) · **Short** 30 to 60 s, 9:16 (the cold open as a teaser) |
| Disclosure | Pictures are AI reconstructions and the voice is synthetic, said in four places (section 2) |
| Not this channel | Ghost, curse or alien explanations offered as fact · conspiracy theories presented as findings · current politics · nationalist, religious or racial framing · gore for effect · fake archive photos or fake footage · invented quotes · cases with living suspects or victims that are not settled history · murders and violent true crime (for now) |

**What differs from NIYT, at a glance**

| | NIYT | Cold Open |
|---|---|---|
| Voice | First person inside an imagined day, with commentary frames | One third-person commentator, plain and confident, curious about the case |
| Truth layers | Documented / Inferred / Commentary-only / Imagined | Documented / Debated / Unknown / Imagined |
| Hook | Spoken disclaimer first (open decision there) | The cold open comes first; disclosure goes elsewhere |
| Look | Documentary frame, 35 mm, people as backs | Cinematic low-key film still, teal and amber, people as silhouettes |
| Music default | `calm` | `mysterious` |
| Title shape | A human moment plus one soft link to today | The legend or familiar thing first, the question or contradiction, never the answer |
| Narrator voice | `ash` | `onyx` for now; not `ash` |

---

## 2. Truth layers (every video, every fact)

| Layer | What it is | Who may state it |
|---|---|---|
| **DOCUMENTED** | A fact with a named source, with its hedge words ("about", "may", "according to one count") | The commentator, plainly, hedges kept |
| **DEBATED** | Researchers disagree, or the evidence supports more than one reading | The commentator gives each view and who holds it. Never picks a winner the brief does not pick. |
| **UNKNOWN** | The record does not say | The commentator says plainly that it is not known. Never guesses, never fills the gap. |
| **IMAGINED** | Reconstruction detail for a scene: light, weather, sounds, textures, small gestures of unnamed people | Only inside the brief's IMAGINED list. **No invented numbers, dates, names, places, causes, motives or quotes.** |

**Quotes.** A short quote may be read word for word only if the brief supplies it with its source. Never invent words, thoughts or motives for a real person.

**Core rule: popular version, then record.** Every brief names the popular version of the story (what most people have heard) and, if known, where it comes from. The video states it plainly, then shows what the sources support. If the popular version is itself documented, say so. If a case has no popular version worth correcting, the brief says so and the main complication is covered instead. This rule is what separates Cold Open from the many history-mystery channels, and it is the reason every brief needs a checked fact table.

**Disclosure, in four places:**
1. The description line (✅ automatic).
2. The closing part says the pictures are reconstructions and what was documented, debated and unknown (📝).
3. The pinned comment repeats it (manual).
4. The synthetic-media flag, set automatically for AI images, with the Studio default also set to Yes (✅).

There is no spoken disclaimer in the first 10 seconds: the hook comes first (founder call, section 15).

**Policy watch.** Since 15 July 2025 YouTube's Partner Program rules call mass-produced or repetitive content "inauthentic content", and it is not eligible for monetisation. Press coverage of YouTube's statement says AI-made video can still be monetised when it adds to original content; templated, low-effort uploads are the target. Cold Open's defence is real editorial work: each video has its own researched fact table, its own story shape and an original script. Re-read YouTube's current Partner Program policy page before the first monetised upload.

---

## 3. The Cold Open format

Every Long opens inside the single strangest documented moment, then steps back. Timings follow the ideas-doc blueprint (hook, set the scene, build the story, raise the stakes, the reveal, the answer or what remains unknown, the close). The chapter jobs add the rule from section 2. About 150 words a minute, so 1,500 words for 10 minutes.

| # | Chapter pattern | Time | Words | Job |
|---|---|---|---|---|
| 1 | The Cold Open | 0:00 to 0:25 | 60 | Present tense, at most three sentences, inside one documented moment. No greeting, no setup. |
| 2 | How It Began | 0:25 to 1:15 | 125 | Where and when. The central question, stated once. |
| 3 | The People and the Clues | 1:15 to 3:30 | 340 | Who was involved, what they did, the first clues. Past tense. |
| 4 | The Version Everyone Tells | 3:30 to 6:00 | 375 | The complications, and the popular story: what it says and where it comes from. |
| 5 | What the Record Shows | 6:00 to 8:30 | 375 | The strongest evidence, with sources named. |
| 6 | What We Still Don't Know | 8:30 to 9:40 | 175 | DEBATED views and UNKNOWN gaps, as far as the evidence allows. |
| 7 | Back to the Cold Open | 9:40 to 10:00 | 50 | One line on what was documented, debated and unknown and that the pictures are reconstructions, then a last sentence that echoes chapter 1. |

Chapter titles are written per video; the brief gives them exactly. The patterns above are working labels.

**Short (about 40 s, about 100 words, from 30 Oct).** The cold open in present tense, the one question, two or three documented facts, the gap that remains. The last sentence echoes the first. No spoken call to action. Briefed separately until the "derive a Short from a Long" gap (G13) ships. Every Short brief carries the pace line: "short sentences, at most 12 words each (the one disclosure sentence may run to 18), and a new fact or turn about every 8 seconds". A Short may open on the legend people know in its first sentence; the exact first sentence in the brief overrides the guide's "strangest documented moment" rule.

---

## 4. Voice and stance

1. One commentator: plain, confident, third person, clearly curious about the case. "We" is allowed only for what is and is not known ("we do not know"). No "I". No "you". (Longs may stay calm if the brief says so.)
2. Chapter 1 is present tense. From chapter 2 on, past tense. Statements about today (\"the logbook is now kept in...\") are present tense.
3. Switch tense only at the chapter 1 to 2 boundary and in chapter 7, where the last sentence returns to the opening image.
4. One idea per sentence, at most 25 words (at most 12 in a Short), a short sentence at moments of shock, no semicolons or brackets.
5. Modern units and dates are fine: the commentator speaks from today.
6. A real, named person gets actions only as documented. No invented words, thoughts or motives.
7. Suspense comes from withholding the answer, never from promising it. No "you won't believe", no "what happened next will shock you".
8. Chapters 2 to 6 each open with the question they answer.
9. Hard names the voice may stumble on are listed in the brief.
10. Interest shows in the writing, not in hype: point at the oddest detail and say why it matters, use legend against record, vary sentence length. The guide's "Narrator" paragraph carries this. The spec has no voice direction (G6), so how lively the voice sounds depends on the voice chosen.

---

## 5. Case types (rotation)

| Type | What it is | Ideas in the tracker |
|---|---|---|
| **Vanished** | People, ships or colonies that disappeared | Mary Celeste, Roanoke |
| **Impossible Object** | A find that rewrote what seemed possible | Antikythera mechanism |
| **Strange Event** | A documented event with a debated cause | The 1518 dancing plague |
| **The Trick** | A deception that worked: cons, forgeries, heists | WWII Ghost Army; from 30 Oct also Natwarlal, the 1855 Great Gold Robbery |
| **The Trial** | A court case about identity or guilt, with a doubt that stays | Tichborne Claimant (30 Oct) |
| **Hours** | A disaster told hour by hour | Great Fire of London, Chernobyl |
| **Lost Place** | A place or institution, and the myth about its end | Indus cities, Alexandria, Nalanda |

Rotate: never the same case type twice in a row, and vary era and region.

---

## 6. Sensitivity levels (set per video in the brief)

| Level | Examples | Rules |
|---|---|---|
| **1 Low** | Events with no living community tied to them: a 1666 fire, a 1518 outbreak, an ancient device | Reconstruction allowed within the layers |
| **2 Medium** | Events with living descendants or communities, religion, veterans' families, or a contested ending | Neutral. No side taken. No villain the evidence does not name. Religion neutral. No claim that a modern group is the heir or enemy of a past one. |
| **3 High** | Events within living memory with survivors: Chernobyl, 1986 | Built on documented accounts. No gore. No recreated deaths of identifiable people. The human experience, not spectacle. Not before six published videos and a sensitivity review. Extra time at both gates. |
| **4 Highest** | Living peoples or ongoing conflicts | Not a Cold Open topic. |

Always: human remains in one clause, no lingering. No hypothetical modern attacks. The Aryan-invasion and migration debate only through named studies, hedged, never a headline hook. How a contested case ended (Nalanda, Alexandria) is presented as a debate, never as a villain story.

---

## 7. The full production spec by department

| Dept | Setting | Value / rule | Tag |
|---|---|---|---|
| **Showrunner** | Concept and promise | Section 1 | ✅ niche text, 📝 guide |
| | Cadence | While testing (from 30 Oct): Shorts first, about 3 a week, rotating the three lanes; no new Long until Shorts data picks a lane. Case types rotate. | 📝 |
| | Quality bar | Both gate checklists (section 11) pass; a P0 fail is fixed before the next paid run | 📝 |
| | Disclosure policy | Four places (section 2) | ✅ description and flag, 📝 closing line, ⬜ on-screen tag |
| | Policy watch | Inauthentic-content rule (section 2); every video needs its own fact table and story shape | 📝 |
| **Research and ethics** | Fact policy | `brief-only` | ✅ |
| | Layers | DOCUMENTED / DEBATED / UNKNOWN / IMAGINED lists in every brief | 📝 (⬜ reviewer reads the IMAGINED allowance, G3) |
| | Sources | At least 3 URLs per Long and 2 per Short, at least one primary document or academic or museum source. Encyclopedia and aggregator pages are leads, not sources. Entered in the New brief **Sources** field (fills `{sources}`, shown at Gate 1) | ✅ |
| | Sensitivity level | Set per video (section 6) | 📝 (⬜ automatic check, G10) |
| | Contested topics | Name the debate; never settle it | 📝 |
| | Popular version | Named in every brief and tested against the record (section 2) | 📝 |
| **Writer** | Voice and stance | Section 4 | 📝 |
| | Story craft | A question per chapter; one concrete detail per chapter; every fact tied to a person, object or consequence | 📝 guide and brief |
| | Length | Long 8 to 10 min (Length option); Short about 40 s, about 100 words. The pipeline does not enforce length; the brief's part budgets do. | ✅ |
| | Hook and close | Exact first and last sentence in the brief | 📝 |
| | Banned phrases | Openers and endings lists | ✅ |
| **Director** | Picture plan | Story chapters: reconstructed scenes. Evidence chapters: places as they are today, objects, plain unmarked documents and maps. | 📝 (⬜ per-chapter picture field, G1) |
| | Shot vocabulary | Wide establishing views, foreground shapes, silhouettes, hands, objects in hand, empty space | 📝 |
| | Pacing | About 3 s per still (channel-wide, set 30 Oct; was 5); longest shot 7.5 s. Whether the renderer honours the lower value is to verify on the first Short. | ✅ (to verify) |
| | Transitions | Slow push-in and lateral pan alternate | ✅ built, ⬜ more (G7) |
| | Maps, timelines, date slates, name-and-title slates | Needed for the evidence chapters | ⬜ G7 |
| **Art direction** | Medium, palette, light, faces | Style prompt (section 8), look A: cinematic low-key film still, teal and amber, people as silhouettes. Fallback B: noir ink illustration. On trial until the look test (section 11). | ✅ |
| | Negative list | No text, glyphs, logos, recognisable real people, modern objects, gore, faces to camera, ghosts, archive-photo looks. The image model mostly ignores "don't" lists, so the style prompt also says what surfaces are ("plain and unmarked"). | ✅ |
| | Consistency of recurring ships, objects, places | Reference images | ⬜ G8 |
| | Logo and fake-text check | Cheap vision pass on every still | ⬜ (Task 8 R6) |
| **Voice direction** | Narrator voice | `onyx`; the listening test against one other voice is deferred to the test plan; must differ from NIYT's `ash` | ✅ |
| | Emotion, pace and pause by beat | Direction line per chapter | ⬜ G6 |
| | Second voice (reads verbatim quotes) | | ⬜ G6 |
| **Composer** | Music mood | `mysterious` default, one per video, chained real tracks; `tense` set by hand for Hours cases | ✅ |
| | Music follows the story by chapter | | ⬜ G4 |
| | Licence | Cleared for monetised use; credit lines appended automatically if required | ✅ |
| **Sound design** | Ambience, effects, silence, cue sheet | | ⬜ G4 |
| | Loudness | -14 LUFS, bed 18 below | ✅ |
| **Editor** | Render | Long 1920x1080 30 fps; Short 1080x1920 | ✅ |
| | Captions | Short burned in; Long `.srt` uploaded | ✅ |
| | Chapters | At least 3, each 10 s or more; appended to description | ✅ |
| **Packaging and compliance** | Title formula | `titleGuidance` (section 8): legend or familiar thing first, never the answer | ✅ |
| | Description, disclaimer, sources, credit | Template (section 8) | ✅ |
| | Hashtags | Base set; `#shorts` added automatically for Shorts | ✅ |
| | Made for kids, category, language | false · 27 · en | ✅ |
| | Synthetic-media flag | Set automatically for AI images; also set the Studio default to Yes | ✅ |
| | Thumbnail | Made by hand (section 12); custom-thumbnail 403 open (P2) | ⬜ G11 |
| | Pinned comment, playlists, end screen | By hand | ⬜ G12 |
| **Analyst** | Compare by case type | Needs case types as formats | ⬜ G2, G15 |
| | Targets | Short: stayed to watch at least 62.2% (the channel's own first Short, 28 Oct), and a change counts only if it is 8 points better on at least 2 Shorts. Long: average viewed at least 35%, click-through at least 4%. Starting guesses, not benchmarks. | 📝 |

---

## 8. Settings to enter in the app (the ✅ rows)

App → Channels → this channel. Per-run options on the New brief screen override these. Mood list as of the 6 Oct snapshot: upbeat, calm, mysterious, inspirational, tense, none. Re-check it.

**Channel detail**

| Field | Value |
|---|---|
| Name | Cold Open |
| Niche | `True stories of cons, heists, thefts, forgeries and trials from history, told by a calm commentator over reconstructed pictures. Each video gives the legend people know, then what the record supports. English, global audience 18 to 45.` (If "calm" should go too: "a plain, confident commentator".) |
| Default visibility | **Private** (set Public by hand after a check) |
| Gate 1 and Gate 2 | Both on |
| Captions | On (Shorts); Long videos use the uploaded subtitle file |
| Watermark | Off |
| Spend limit | Check it before the next run: a Short run stopped at Gate 2 on 29 Oct for a model limit (which limit is not recorded) |

**Content profile** (save as a new version; reopen and check that `secondsPerStill` is 3)

| Group | Field | Value |
|---|---|---|
| Script | factPolicy | brief-only |
| | targetSeconds | 45 |
| | bannedOpeners | Did you know · In this video · Hey guys · Throughout history · Let's talk about · Welcome back · Imagine · What if · Have you ever wondered · Today we look at · You won't believe |
| | bannedEndings | Like and subscribe · Follow for more · Let me know in the comments · What do you think · Thanks for watching |
| | guide | the box below |
| Visual | defaultSource | AI images |
| | secondsPerStill | 3 |
| | stylePrompt | `Cinematic film still, 35mm anamorphic, shallow depth of field, fine grain, low-key light with deep shadows and one motivated light source that fits the scene. Muted teal shadows and amber highlights, weathered and period-accurate, never glossy or fantasy. Composed like a film frame: strong foreground shapes, subject off-centre, wide views. People appear from behind, as silhouettes, in profile at a distance or as hands; faces, if seen at all, are small, in shadow or turned away. Objects, documents, maps, walls and sacks are plain and unmarked.` |
| | negativePrompt | `text, lettering, numbers, symbols, logos, signs, watermarks, recognisable real people, modern objects, gore, graphic injuries, sharp faces looking at the camera, ghosts, supernatural glow, fantasy, oversaturated colour, vintage photograph, sepia, archive photo look, cartoon, 3D render, stock photo look` |
| Audio | defaultVoice | `onyx`. Not `ash`. A one-voice-against-another test is in the test plan. |
| | defaultMoodTag | mysterious |
| Packaging | titleGuidance | `One title per video, built from the script. Lead with the legend, object or place a stranger already knows, not a name few people know; a person's name goes in only if famous worldwide. Raise the question or contradiction at the heart of the story and never give the answer. If the title repeats a legend as a claim, put the claim in quotes or hedge it, so the title never states as fact what the script does not support, for example: The man who "sold" the Taj Mahal. Shapes, not to copy: The man who "sold" [landmark] / [The popular claim]: what the record shows / What was missing from the [object]? Use only facts and words the script contains. 35 to 60 characters, never over 65; Shorts under 45. Sentence case, no all caps, no emoji, no hashtags. No hype words (shocking, secret, insane, mind-blowing, you won't believe), no superlatives, no "nobody knows". No ghost or curse wording unless the script discusses it as a legend. Never state imagined details as fact. Vary the shape from video to video.` |
| | descriptionTemplate | the second box below |
| | hashtagsBase | #history #truestory #documentary #crimehistory |
| | editorCredit | on |
| | selfDeclaredMadeForKids | No |
| | categoryId | 27 |
| | defaultLanguage | en |

**Fallback look B, noir ink illustration** (only if look A fails the look test in section 11; enter as a new profile version; same negative prompt with "cartoon" and "3D render" removed):

`Noir ink illustration: bold black ink shapes and heavy shadows, a limited palette of three muted tones plus one amber accent, visible paper grain, calm cinematic framing, wide views and silhouettes. People are simple dark figures seen from behind or in profile, with no facial detail. Objects, documents, maps and walls are plain and unmarked.`

Look A is untested on the live image model. At NIYT's Task 11 the app rendered stills at low quality (about 1.3 cents each), which flatters stylised looks more than photographic ones, so B may win at that quality. gpt-image-1.5 retires on 2026-12-01 (NIYT spec section 7). Look again when the model or the quality changes. For a level 3 case, add "restrained, low-key, no drama" to the picture line of the brief until the look-per-series gap (G16) ships.

**Style guide (`guide`; the writer and the reviewer read it; revised 30 Oct, about 270 words)**
> Channel: true stories of cons, heists, thefts and trials from history, told by a plain, confident third-person commentator over reconstructed pictures. Use only the facts in the brief for anything presented as real. The brief marks each fact DOCUMENTED (state plainly, keep every hedge word), DEBATED (give each view and who holds it, never pick a winner the brief does not pick) or UNKNOWN (say plainly it is not known, never fill the gap). Imagined detail is allowed only where the brief lists it: light, weather, sounds, textures, small gestures of unnamed people. Never invent numbers, dates, names, places, causes, motives or quotes. Open inside the strangest documented moment, in present tense, then step back in past tense. State the legend people know, say where it comes from, then show what the record supports. One idea per sentence, short sentences, written for the ear, no semicolons. Build suspense by withholding the answer, never by promising it. No hype words, no moral, no call to action. If the brief gives an exact first or last sentence, use it word for word. Narrator: a storyteller who is clearly curious about this case and a little amazed by it. Show it through the writing. Point at the oddest detail and say why it matters, for example "Here is the part that does not fit." Use contrast: the legend says one thing, the record says another. Vary sentence length and let a short sentence land after a longer one. Speak as someone who has read the sources and wants the viewer to see what they saw. Interest is never hype: no exclamation marks, no words like incredible or amazing, no invented feelings for real people, and never "you". Never mocking; no gore; no blame on any people, religion or nation.

**Description template (`descriptionTemplate`):**
```
{summary}

{sources}

The pictures in this film are AI-made reconstructions, not photographs or archive footage, and the narration voice is synthetic. Facts come from the sources above. Where researchers disagree, the film says so.

Written and fact-checked by {editor}.

{hashtags}
```
Chapters for Long videos and any music credit lines are appended by the pipeline. **`{editor}` becomes the approving account's display name; if the account has no name set it falls back to the email address.** Check the first Private upload's description before anything goes Public.

---

## 9. Per-run options (New brief screen)

| Option | Short | Long |
|---|---|---|
| Type | Short | Video |
| Format | Freeform (the profile lists no formats yet) | Freeform |
| Length | 40 (from 30 Oct; the brief's part budgets set the real length) | 10 min |
| Visuals | AI images | AI images (locked) |
| Voice | channel default | channel default |
| Music | mysterious | mysterious (`tense` by hand for Hours cases) |
| Sources | the URLs listed under the brief | the URLs listed under the brief |
| Max spend | not needed | the suggested value |

Every Short brief carries the pace line (section 3).

---

## 10. The brief (treatment)

A brief is the per-video plan. It is sent to the pipeline as `Topic:` and `Constraint:` lines (the app reads text only), so every instruction is one line, and the numbered facts sit inside a `Constraint:` line so the parser cannot drop them. The sound plan stays in this doc and is **not** pasted: cues in the brief would be read aloud.

**Fields:** case and the one question · case type · sensitivity level · the cold-open moment (documented) · exact first sentence · the popular version and where it comes from · seven chapter titles · numbered facts, each tagged DOCUMENTED, DEBATED or UNKNOWN, allocated to chapters · IMAGINED allowance with its props list · quotes (verbatim, source named) · picture direction for story and evidence chapters · exact last sentence (the echo) · sources (URLs for the Sources field) · sound plan (doc only, ⬜).

**How a brief is made**
1. Topic pick (tracker, section 13).
2. The architect chat researches and builds a **fact table**: exact wording, hedges kept, tag (D, DEB or U), source, and a "verify" flag where only a secondary source was seen. Primary documents, museum and academic pages first; encyclopedia and aggregator pages are leads.
3. **You strike anything you do not trust.** This is the real fact-check.
4. The brief is written from the surviving rows. About 3 documented facts per minute of video, so about 30 for a 10-minute Long. If the table is smaller, make the video shorter. A Short needs 2 or 3 facts per part, sized to the part's word budget; the writer treats listed facts as mandatory and the budget as soft unless the brief says "hard limit".
5. Run. 6. Gate 1 against the table. 7. Gate 2. 8. Private upload, check, Public by hand.

**Fact table format**

| # | Fact (exact wording, hedges kept) | Tag | Source | Verify |
|---|---|---|---|---|

**Template (copy into the New brief screen, replace the brackets):**
```
Topic: [The case in one sentence, with place and year]. Pictures: chapters 1 to 3 are reconstructed scenes (people from behind or in silhouette, objects in hand, light and weather); chapters 4 to 6 show places as they look today, objects, and plain unmarked documents or maps; chapter 7 returns to the opening image. No writing, symbols, logos or lettering anywhere, no faces toward the camera, nothing that looks like an archive photograph.
Constraint: about 1,500 words for a 10 minute video, calm, short sentences, one commentator in the third person.
Constraint: seven chapters, titles exactly: "[1]", "[2]", "[3]", "[4]", "[5]", "[6]", "[7]". Chapters 2 to 6 each open with a question they answer. Chapter 1 is present tense, at most three sentences, inside one documented moment. From chapter 2 on, past tense.
Constraint: first sentence must be exactly: "[...]".
Constraint: the popular version is: [one line]. Chapter 4 states it plainly and says where it comes from. Chapter 5 shows what the record supports. [If there is no popular version to correct: say so, and chapter 4 covers the main complication.]
Constraint: use only the numbered facts below for anything presented as real. DOCUMENTED facts are stated plainly with every hedge word kept. DEBATED facts give each view and who holds it, and never pick a winner. UNKNOWN facts are stated as not known, never guessed. Facts: 1. [fact] (DOCUMENTED). 2. [fact] (DEBATED). 3. [fact] (UNKNOWN). ...
Constraint: chapter allocation: chapter 1 uses fact [n]. Chapter 2 uses [n to n]. Chapter 3 uses [n to n]. Chapter 4 uses [n to n]. Chapter 5 uses [n to n]. Chapter 6 uses [n to n]. Chapter 7 restates which facts were documented, debated and unknown.
Constraint: IMAGINED, you may add only light, weather, sounds, textures and small gestures of unnamed people, in chapters 1 and 3, with no new facts, numbers, names, places, causes or motives. Props allowed (everyday objects with no numbers, names or facts attached): [list; only objects the picture line names].
Constraint: quotes, only these, word for word, source named: [quote, source]. [Or: no quotes.]
Constraint: sensitivity level [N]. [Level rules in one line.]
Constraint: chapter 7, second-to-last sentence: one line saying what was documented, what is debated, what is unknown, and that the pictures are reconstructions.
Constraint: last sentence must be exactly: "[...]".
Sources (URLs, for the Sources field): [list]. Run: Video, Freeform, 10 min, AI images, voice default, music mysterious, max spend the suggested value.
```

---

## 11. Checklists

**Gate 1 (script):**
- [ ] First and last sentences exact
- [ ] Chapter 1 is present tense, at most three sentences, inside a documented moment; later chapters are past tense (a Short: cold open present tense, the rest past)
- [ ] Every number and name matches the fact table; nothing outside the lists
- [ ] DEBATED items show every view and who holds it; no winner picked unless the brief picks one
- [ ] UNKNOWN items are stated as not known; no guesses, no "probably" the brief does not carry
- [ ] IMAGINED stays inside the allowance (light, weather, sounds, textures, small gestures); every prop is in the brief's list
- [ ] The popular version is stated plainly in chapter 4 with its origin; chapter 5 shows what the record supports
- [ ] Seven chapters; chapters 2 to 6 open with their question; chapter 7 says what was documented, debated and unknown and that the pictures are reconstructions
- [ ] Any quote is verbatim from the brief with its source named
- [ ] No banned opener or ending; no moral, no question to the audience, no call to action; no hype words or superlatives the brief does not carry
- [ ] No blame on any people, religion or nation; sensitivity rules followed
- [ ] Word count in range; hard names the voice may stumble on noted
- [ ] Edit in the sheet before Approve (narration is recorded from the approved text)

**Gate 2 (video):**
- [ ] No writing, symbols, logos or lettering in any picture; no recognisable real person; no faces toward the camera
- [ ] Nothing graphic: no gore, human remains at most a distant clause; nothing mocking
- [ ] No frame passes as an archive photograph or real footage of the event
- [ ] Period and place fit what is narrated; story chapters show the reconstructed world, evidence chapters show places today, objects and plain documents
- [ ] The first 10 seconds show the cold-open moment and the strongest image
- [ ] **Look test (first Short only):** did one frame make you feel something? does any frame look like generic AI? do ships, objects and hands hold up at phone size? If the second answer is yes or the third is no, look A fails: record it in section 15 and re-run once with look B
- [ ] Voice says hard names acceptably; music does not fight the voice
- [ ] Length within the floor (8:00 for a 10-minute video); ending clean; `.srt` downloads
- [ ] Watched in full with sound

**Note what the current flow cannot do** (maps, timeline slates, sound cues, voice direction, picture consistency). Send it as `G: <what>`; it goes into the gap register.

---

## 12. Packaging

- **Title:** built from the script (section 8 title guidance): the legend or familiar thing first, the question or contradiction, never the answer. A legend repeated as a claim goes in quotes or is hedged. Most viewers do not know the people's names, so a name leads only if it is famous worldwide. 35 to 60 characters, never over 65; Shorts under 45. On a Short the title matters less than the first 1 to 3 seconds (98% of the first Short's views came from the feed); it still counts for search, the channel page and the Related-video link. The working titles in section 13 come from the ideas doc and are idea labels; final titles are written under the guidance.
- **Thumbnail (manual, 1280x720):** one subject, at most 4 words, same typeface and corner tag every time, readable on a phone. Make two variants and use YouTube's Test and Compare on Longs (desktop Studio only, long-form only, no API; you enter the winner). The custom-thumbnail 403 is open (P2). Sprint 6 Task 1 (curiosity packaging) is the planned automatic route; check STATUS for its state.
- **Description:** template (section 8); chapters and credits appended automatically.
- **Pinned comment:** repeats the disclosure and asks one open question the video leaves open. This replaces a question ending in the video.
- **Playlists:** one per case type. **End screen and cards:** by hand.
- **Studio defaults:** altered or synthetic content = Yes; made for kids = No; category Education; language English.

---

## 13. Tracker

Status: ⬜ to research · 📋 fact table ready · ✅ brief approved · 🟨 in pipeline · 🔒 Private · 🌐 Public.

Order is a recommendation: the stories that should be best sourced first, contested and sensitive ones later. Working titles come from the ideas doc (a ChatGPT list pasted by the founder on 2026-10-21; leads, not sources). The 30 Oct crime-direction cases (Natwarlal, the Great Gold Robbery, the Tichborne Claimant, and the waiting list) are tracked in `COLD_OPEN_CONTENT_PLAN.md`.

| ID | Case type | Working title | Level | Order | Status | Notes (only what has been checked) |
|---|---|---|---|---|---|---|
| CO-1 | Vanished | The Ghost Ship Mystery: What Happened to the Crew of the Mary Celeste? | 1 | 1 | 🌐 | Long published Public 22 Oct; three Shorts briefed (CO-1-L generated; CO-1-G and CO-1-Q unpublished, on hold) |
| CO-2 | Hours | Four Days That Changed London Forever (Great Fire, 1666) | 1 | 2 | ⬜ | Fact table to build |
| CO-3 | Impossible Object | The 2,000-Year-Old Computer Found in a Shipwreck (Antikythera mechanism) | 1 | 3 | ⬜ | Start or calibration date debated (178 BCE or about 204 BCE); wreck dated to about 60 BCE, give or take 10 years; maker, owner and how it got aboard unknown |
| CO-4 | The Trick | World War II's Secret Ghost Army | 2 | 4 | ⬜ | Fact table to build |
| CO-5 | Strange Event | The Strange Epidemic That Made People Dance Until They Collapsed (Strasbourg, 1518) | 1 | 5 | ⬜ | Cause debated (ideas doc); fact table to build |
| CO-6 | Vanished | The Lost Colony of Roanoke: What Really Happened? | 1 | 6 | ⬜ | Fact table to build |
| CO-7 | Lost Place | Why Did One of the World's Greatest Ancient Civilizations Decline? (Indus) | 1 | 7 | ⬜ | The NIYT L-1 fact table (36 Indus rows) can seed this one; rows marked "verify" still need a check |
| CO-8 | Lost Place | The Library of Alexandria: Did We Really Lose the Ancient World's Knowledge? | 2 | 8 | ⬜ | The single-fire story is misleading (ideas doc); one reading of the evidence is that Caesar's fire burned export warehouses, and there is no evidence the royal library still existed at the end of the 4th century. Religion neutral. |
| CO-9 | Lost Place | Nalanda: The Lost University That Drew Students From Across Asia | 2 | 9 | ⬜ | How it ended is contested: the main Persian account describes a fortress-college called Bihar, with no fire and no "Nalanda"; a Tibetan visitor in 1235 to 1236 (Roerich 1959) found a small community still teaching. Religion neutral, no villain. |
| CO-10 | Hours | Chernobyl: The Disaster That Forced a City to Leave Home | 3 | 10 | ⬜ | Within living memory. Not before six published videos and a sensitivity review. |

If the plan is 19 videos, the other nine topics are still to be chosen. Shorts: one per Long, cut from its cold open, briefed separately (S-n) until G13 ships.

---

## 14. Gap register

The shared register is `NIYT_CHANNEL_CONFIG.md` section 13 (G1 to G16). Do not duplicate it here. Cold Open leans hardest on:

| ID | Gap | Why Cold Open needs it |
|---|---|---|
| G7 | Director tools: maps, timelines, date slates, name-and-title slates | The evidence chapters (4 to 6) are weak without them |
| G2, G15 | Case types as formats; tag videos by case type | Compare by type; repeatable channel identity |
| G3 | Reviewer reads the brief's IMAGINED allowance | Otherwise the cold open's scene detail is flagged as an invented claim |
| G4, G6 | Sound design; voice direction | Suspense lives in music, silence and pace |
| G10 | Sensitivity check | Levels 2 and 3 are in the tracker |
| G9 | Fact-table builder in the app | Every brief needs one |
| G11 | Thumbnail tool and the 403 fix | Click-through on Longs |
| G13 | Derive a Short from an approved Long script | One Short per Long |
| G16 | Look per series and still quality | Level 3 needs a restrained look; low quality may favour look B |

New candidates, not in the shared register yet:
- **N1 (to verify):** the Task 6 reviewer must accept DEBATED views and "we do not know" sentences as allowed content, not as invented claims. Test it on the first Cold Open script at Gate 1.
- **N2:** a small on-screen "Reconstruction" tag from frame 0, the Cold Open equivalent of the "Imagined" tag accepted for NIYT Shorts on 2026-10-19 (sprint 6 plan). Needs G5 and G7.
- **N3 (to verify, 30 Oct):** Short pacing. `secondsPerStill` is a channel-wide profile value; the founder finds Shorts slow. Is there a per-run value, and does the renderer honour 3? Numbers to log: the first Short's real seconds per still and total length.
- **N4 (to verify, 30 Oct):** music repeats inside a Short (founder, 29 Oct). Likely cause: tracks shorter than a Short (STATUS to-do 9). Not confirmed. Numbers to log: track lengths and Short length.

---

## 15. Open decisions and change log

**Open (Neeraj):**
1. **Handle.** `@coldopenhistory` is in use; the `@coldopen` check is no longer needed unless the handle is changed.
2. **Voice.** `onyx` stays for now. A same-script test against one other voice is in the test plan (candidates: `fable`, `echo`; check they are in the app's voice list). Must differ from NIYT's `ash`. Also still open from NIYT: whether to stay on OpenAI TTS.
3. **Look.** A cinematic film still (default) or B noir ink. Decide at the first Short's Gate 2 with the look test.
4. **Disclosure placement.** Recommended: description line, closing line, pinned comment, synthetic flag; no spoken disclaimer in the first 10 seconds. Founder call.
5. **Account.** Which Google account and tenant owns the channel. Account display name so `{editor}` does not publish an email address (same item as NIYT open decision 3).
6. **Core rule.** Confirm or strike "popular version, then record" (section 2).
7. **Number of briefs.** The ideas doc has ten; the request said 19.
8. **Thumbnails.** Who makes them, and the custom-thumbnail 403 (P2).
9. **Cadence.** Shorts-first from 30 Oct; the first Long under the crime direction waits for the day-7 data.
10. **Private rule.** Inherit NIYT's: Long videos stay Private until Task 6 merges; a Short may go Public after one manual check. Check STATUS.

**Change log**
- 2026-10-30 v1.1: crime direction; section 8 profile simplified and rewritten (niche, guide with a narrator paragraph, shorter style and negative prompts, `secondsPerStill` 3, legend-first title guidance, hashtags, "calm" dropped from the voice for Shorts); Short format revised (about 40 s, pace line); case types The Trial added; gaps N3 and N4 added (to verify). Git `main` must receive the same change by pull request.
- 2026-10-21 v1.0 draft: created for the new Cold Open channel from the ideas doc and the NIYT spec structure.

---

# Appendix A: Channel setup checklist (manual)

1. Create the channel (name Cold Open), set the handle (section 15, item 1).
2. About text: the tagline, and one line that pictures are AI reconstructions and the voice is synthetic.
3. Avatar and banner by hand.
4. Studio upload defaults: altered or synthetic content = Yes; made for kids = No; category Education; language English.
5. Check in Studio whether the new channel needs its own verification before relying on custom thumbnails (NIYT's channel was phone-verified on 2026-10-11).
6. Connect the channel in the app (YouTube connect) and enter the section 8 settings. Save as a new profile version, reopen and check.
7. First Private upload: check the description (`{editor}`, sources, disclaimer) before anything goes Public.

# Appendix B: Sources for this doc

- `NIYT_CHANNEL_CONFIG.md` v2.2 (structure, app fields, tags, level definitions, gap IDs) and `execution/sprint6/PLAN.md` (Test and Compare limits, "Imagined" tag decision).
- The ideas doc: a ChatGPT list pasted by the founder on 2026-10-21 (ten ideas, the 10-minute blueprint). Leads, not sources.
- YouTube inauthentic-content update, 15 July 2025: Search Engine Journal https://searchenginejournal.com/youtube-targets-mass-produced-content-in-monetization-update/550337/ · Social Media Today https://www.socialmediatoday.com/news/youtube-clarifies-monetization-update-inauthentic-repeated-content/752892/ · Mediaweek https://mediaweek.com.au/platforms-push-back-youtube-and-meta-crack-down-on-authentic-content
- Tracker notes: Antikythera, Wikipedia https://en.wikipedia.org/wiki/Antikythera_mechanism and Jones 2020, ISAW Papers 17 https://archive.nyu.edu/jspui/bitstream/2451/61000/2/Jones%202020%20Epoch%20dates%20of%20the%20Antikythera%20Mechanism%20ISAW%20Papers%2017.pdf · Alexandria, World History Encyclopedia https://www.worldhistory.org/article/207/what-happened-to-the-great-library-at-alexandria/ · Nalanda, Roerich 1959 translation of Dharmasvamin's biography (archive.org copy with Altekar's introduction) https://ia902809.us.archive.org/26/items/biographyofdharmasvaminvoliidr.a.s.altekarsmkbookno.2685/Biography%20of%20Dharmasvamin%20Vol%20II%20-Dr.%20A.%20S.%20Altekar%20SMK%20Book%20No.%202685_text.pdf
