# Start to Shelf: Channel Spec

**Version 0.2 (draft for founder review) · 2026-11-01 · Owner: Neeraj · written by the Start to Shelf channel owner session.**
**Read this first.** Any chat that writes a brief, sets a channel option or judges a video for this channel starts here. It is deliberately short and loose: guardrails, not a template. Git `main` must receive this doc by pull request (the architect or docs agent opens it).

**App state caveat.** Tags are based on the Project mirror (STATUS of 24 Oct, the Cold Open and NIYT specs). Re-check against the latest `main` and the code before relying on any ✅.

**Tags:** ✅ wired (a field in the app) · 📝 text (carried in the guide or brief, a person checks it) · ⬜ future (needs an app or sound feature; never treat as active).

---

## 1. The concept

| Field | Value |
|---|---|
| Name | **Start to Shelf** (YouTube search 30 Oct: no channel with this name exists; trademark check still to do) |
| Handle | `@starttoshelf` planned; record the handle actually set in Studio here |
| Tagline | How everyday things are made, in under a minute. |
| Domain | One everyday object per Short, told as its journey from raw material to the shop shelf, in 5 to 6 physical steps. |
| Promise | You will never look at a pencil, a bar of chocolate or a pair of jeans the same way again, and it takes 45 seconds. |
| Audience | English-speaking, global, 16 to 45. Curious people who watch Shorts for "how does that work". |
| Tone | Friendly, curious, a little amazed. A friend who just found out how this works. Lively, never stiff, never hype. |
| Product | **Short only**, 30 to 60 s, 9:16. No Long: long-form uses AI images only, no stock (decision of 11 Oct). |
| Language | English only (no Hindi audio yet). |
| Disclosure | The voice is synthetic and the footage is licensed stock, said in the description. See section 5. |
| Not this channel | Brand claims ("how Brand X makes it") · a named factory or company as fact · real named people · DIY or dangerous instructions · food-safety or health claims · politics · content aimed at children · hype words |

---

## 2. Sound limits until the upgrade (Monday or Wednesday)

The settings below are written for what the app can do **today**. When the sound backend improves, only the "after" column changes, in the profile, not the scripts.

| Area | Today (assumed from the 6 and 11 Oct snapshots, to verify) | After the upgrade (⬜) |
|---|---|---|
| Voice | OpenAI speech model (GPT model switch implemented 30 Oct; all voices work). The app has no voice direction field, so no control of emotion, pace or pauses. The founder dislikes the stock voice. | Voice direction per step, a different voice or provider |
| Pace | Carried by the script (short sentences, punctuation) and by clip cut length. | Same, plus voice pace by beat |
| Music | One mood for the whole Short, real YouTube Audio Library tracks; possible repeat inside a Short if the track is shorter than the video. Moods: upbeat, calm, mysterious, inspirational, tense. | Music that follows each step |
| Sound effects | None. | Machine clunks, pours, snips. This channel gains the most from them. |
| Captions | Burned in for Shorts. | Same |

**What this means for the settings:**
1. **Write for the ear.** Short sentences, commas where a voice should breathe, contractions, no semicolons or brackets, no hard names. Punctuation is the only pacing control we have.
2. **Energy comes from cuts and captions, not the voice.** Clip changes about every 2.5 s, a new step about every 7 s, captions on.
3. **Music stays quiet and light.** `upbeat` as default, ducked under the voice by the pipeline. If the track audibly loops inside a 45 s Short, switch to `calm` and log it.
4. **Pick the voice for liveliness, then test it** (section 7). Do not lock it by name.

---

## 3. The format: the Step Chain

A Short is a hook, 4 to 7 steps, and a closing line. Word budget for a 45 s Short at about 150 words a minute:

| Part | Time | Words | Job |
|---|---|---|---|
| Hook | 0 to 5 s | 15 | The object, plus the strangest true thing about where it starts |
| Steps (5 to 6) | 5 to 40 s | 70 | Each step is one physical action and one concrete detail a viewer can see |
| Close | 40 to 45 s | 15 | A line that echoes the hook. No call to action, no question, no moral |

15 + 70 + 15 = 100 words, target 100 to 110, hard limit 115 (a long brief makes the writer overshoot: see the role doc, section 6).

**Stay loose.** Vary the hook shape, the number of steps (4 to 7) and the order of surprise from video to video. YouTube treats templated, repetitive uploads as "inauthentic content". Hook shapes to rotate, not copy:
- The raw start: "A pencil starts as a plank of wood."
- The contrast: the thing in your hand against where it began.
- The odd step first, then back to the start.
- A number from the sources, if the brief has one.

---

## 4. Voice and tone

1. One narrator, friendly and curious, third person about the object. "You" is allowed sparingly for what the viewer holds or sees ("the jeans you're wearing").
2. One idea per sentence, at most 12 words. A new step or turn about every 7 seconds.
3. Contractions are fine. No exclamation marks, no "incredible, amazing, insane, mind-blowing, you won't believe", no questions to the viewer.
4. Interest shows in the writing: point at the oddest step and say why it matters. One gentle, dry joke per video is fine if it uses only facts in the brief.
5. Present tense for the process ("the beans are dried in the sun").
6. No hard names the voice may stumble on; if one is needed, the brief lists it.

---

## 5. Facts and honesty

- Fact policy `brief-only`: the script uses only the facts and numbers in the brief. Processes differ between factories, so the brief says "usually" or "in most factories" and the script keeps it.
- Never name a brand, a company or a factory as fact. Never claim the footage shows the real factory.
- Every Short brief has at least 2 source URLs (an industry body, a museum, a university or a manufacturer-neutral explainer). Encyclopedia pages are leads, not sources. The founder strikes any fact he does not trust.
- Disclosure: the description says the voice is synthetic and the footage is licensed stock that may not show the exact process described. Synthetic-media flag: the pipeline sets it for AI images; with stock only it is probably off (unverified). Set the Studio default to No while a Short has no AI-made picture, and to Yes for any that does. Re-read YouTube's current altered-or-synthetic-content rule before the first Public upload.
- Policy watch: mass-produced or repetitive content is not eligible for monetisation (YouTube Partner Program, since 15 July 2025). Defence: an original script per video, its own sources, varied structure.

---

## 6. Stock footage rules

- Visuals option: **Stock**, not Auto. Auto can switch to AI stills for named people and events; this channel has none and should never silently fall back.
- One clip idea per step, written in the brief (hands, machines, raw material, finished object).
- No readable text, logos or brand names in any clip. No people looking at the camera. No office, laptop, handshake or generic city skyline filler.
- Never reuse the same clip twice in a video, or from the last three videos.
- Footage licence: use only clips under the library's free commercial licence. A per-clip log of source and licence is expected; whether the app keeps one is unverified.
- Before briefing a topic, the founder does a one-minute check on the stock site: search 3 clip ideas from the brief (for example "cocoa beans drying"). If at least 2 of the 3 clip ideas find a fitting clip, go. If not, swap the topic.

---

## 7. Settings to enter in the app (the ✅ rows)

App → Channels → this channel. Per-run options on the New brief screen override these.

**Channel detail**

| Field | Value |
|---|---|
| Name | Start to Shelf |
| Niche | `Short, friendly explainers on how everyday things are made, step by step, over real stock footage of farms, workshops and factories. Curious and a little amazed. English, global audience 16 to 45.` |
| Default visibility | **Private** (set Public by hand after a check) |
| Gate 1 and Gate 2 | Both on |
| Captions | On |
| Watermark | Off |
| Spend limit | Check it before the first run |

**Content profile** (save as a new version, reopen and check the values)

| Group | Field | Value |
|---|---|---|
| Script | factPolicy | brief-only |
| | targetSeconds | 45 |
| | bannedOpeners | Did you know · In this video · Hey guys · Today we look at · Have you ever wondered · Ever wonder · Welcome back · Let's talk about · You won't believe · Imagine |
| | bannedEndings | Like and subscribe · Follow for more · Let me know in the comments · What do you think · Thanks for watching · Stay tuned |
| | guide | the box below |
| Visual | defaultSource | Stock |
| | secondsPerStill | 2.5 (to verify that it applies to stock clips and that the renderer honours it) |
| | stylePrompt | `Real footage, not illustration. Close shots of hands, machines, raw materials and the finished object, in bright, clean, natural light, with steady or slow movement. Each step matches one clear clip idea. Prefer farms, workshops and factory floors over offices and cities.` |
| | negativePrompt | `readable text, lettering, logos, brand names, signs, watermarks, cartoon, 3D render, AI-generated look, people looking at the camera, office, laptop, handshake, generic city skyline` |
| Audio | defaultVoice | provisional `nova`. All voices work since 30 Oct. Use `marin`, `nova` and `coral` on the first three Shorts, choose by ear at Gate 2, then lock one; try `cedar` or `fable` only if none wins. Not `onyx` (Cold Open) or `ash` (NIYT). |
| | defaultMoodTag | upbeat |
| Packaging | titleGuidance | the box below |
| | descriptionTemplate | the box below |
| | hashtagsBase | #howitsmade #manufacturing #process #satisfying |
| | editorCredit | on |
| | selfDeclaredMadeForKids | No |
| | categoryId | 27 |
| | defaultLanguage | en |

The stock-look fields (`stylePrompt`, `negativePrompt`) may be ignored by stock search. Harmless if so; note whether they matter after the first run.

**Style guide (`guide`, about 190 words)**
> Channel: short, friendly explainers on how everyday things are made, told step by step over real stock footage. Use only the facts and numbers in the brief. Processes differ, so where the brief says so, write "usually" or "in most factories". Never name a brand or claim a particular factory does it. Open with the strangest true thing about the object, in plain words. Then walk through the steps in order; each step is one physical action and one concrete detail a viewer could see on screen. Write for the ear: short sentences, never over 12 words, one idea each, contractions, commas where a voice should pause. A new step about every seven seconds. Narrator: a friend who just found out how this works and is a little amazed. Point at the oddest step and say why it matters. One dry, gentle joke is fine if the brief's facts allow it. No exclamation marks, no words like incredible, amazing or insane, no "you won't believe", no questions to the viewer, no call to action. End on a line that echoes the opening. Vary the opening shape and the number of steps from video to video. If the brief gives an exact first or last sentence, use it word for word.

**Title guidance (`titleGuidance`)**
> One title per video, built from the script. Lead with the everyday thing a stranger already knows, then one surprising turn from the script, never the whole answer. Shapes, not to copy: How [thing] is actually made / [Thing] starts as [raw material] / The [N] steps between [raw material] and [thing]. Use only words and facts the script contains. Under 45 characters. Sentence case, no all caps, no emoji, no hashtags. No hype words (shocking, insane, mind-blowing, secret, you won't believe). No brand names. Vary the shape from video to video.

**Description template (`descriptionTemplate`)**
```
{summary}

Sources:
{sources}

The narration voice is synthetic. The footage is licensed stock video chosen to match the script, so it may not show the exact factory or process described. Processes vary between makers.

Written and checked by {editor}.

{hashtags}
```
`{editor}` becomes the approving account's display name, or the email address if no name is set. Check the first Private upload's description before anything goes Public.

**Per-run options (New brief screen)**

| Option | Value |
|---|---|
| Type | Short |
| Format | Freeform |
| Length | 45 |
| Visuals | Stock |
| Voice | channel default |
| Music | upbeat (`calm` if the track loops) |
| Sources | the URLs under the brief |
| Max spend | not needed for a Short |

---

## 8. YouTube channel setup (by hand, in Studio)

| Item | Value |
|---|---|
| Channel name | Start to Shelf (Raw to Real was rejected: the @rawtoreal handle belongs to an active woodworking channel; fallback Made Step by Step) |
| Handle | `@starttoshelf` (check in Studio; fallbacks `@starttoshelfshorts`, `@starttoshelftv`) |
| About text | `How everyday things are made, one step at a time, in under a minute. From a pencil to a bar of chocolate: the raw material, the machines and the surprising steps in between. New Shorts every week. Narration is a synthetic voice over licensed stock footage, and each video lists its sources.` |
| Keywords | how it's made, how things are made, manufacturing, factory, process, everyday objects, explained |
| Default upload settings | Category Education · language English · made for kids No · altered or synthetic content per section 5 |
| Avatar | A dot connected by a line to a small box, flat bright colour, no text, no brand-like logo. Made by hand. |
| Banner | A row of plain outlines of everyday objects (pencil, bottle, jeans, bar of chocolate) with the tagline. Made by hand. |
| Links, contact | Optional; leave empty for the test |
| Connect in the app | YouTube connect on the channel screen; reconnect weekly (testing-mode tokens expire in 7 days) |

**This is the former Underdogs channel** (renamed 30 Oct; no Underdogs video was ever public). Captions must be on (Underdogs ran with them off on purpose). Ignore Underdogs-era runs when reading results. The 18 Oct Lego test video was Unlisted with a brand logo: set it to Private (to confirm).

---

## 9. The brief

Sent to the app as plain text: one `Topic:` line and `Constraint:` lines. Keep a Short brief small: the steps are short phrases, at most 2 numbers, and the word budget really adds up.

```
Topic: How [thing] is made, in [5 to 6] steps, as a 45 second Short. Pictures: real stock footage only, one clip idea per step ([step 1 clip], [step 2 clip], ...); no readable text, logos or brand names, no people looking at the camera, no AI images.
Constraint: 100 to 110 words, hard limit 115. One friendly, curious narrator. Sentences at most 12 words. A new step about every 7 seconds. Contractions are fine. No exclamation marks.
Constraint: first sentence must be exactly: "[...]".
Constraint: steps in order: 1. [..] 2. [..] 3. [..] 4. [..] 5. [..] 6. [..]. Use only these facts and numbers: [a], [b]. Processes differ, so say "usually" or "in most factories".
Constraint: last sentence echoes the first line. No call to action, no question to the viewer.
Sources (URLs, for the Sources field): [list of at least 2]. Run: Short, Freeform, 45, Stock, voice default, music upbeat.
```

Whether the "Pictures:" part of the Topic line reaches the video planner is unverified (the planner does not receive the style guide). Check at Gate 2 whether the clips followed it.

---

## 10. Checklists

**Gate 1 (script):**
- [ ] First and last sentences exact; the last echoes the first
- [ ] 100 to 115 words; no sentence over 12 words
- [ ] Every number and fact is in the brief; hedges ("usually") kept
- [ ] No brand or company named; no claim about a particular factory
- [ ] 4 to 7 steps in the right order; each step is one thing a viewer could see
- [ ] No banned opener or ending; no question, no call to action, no hype words
- [ ] Reads aloud smoothly, no hard names, punctuation where a voice should pause
- [ ] Edit in the sheet before Approve (narration is recorded from the approved text)

**Gate 2 (video):**
- [ ] Every step's clip shows what the narration says (rate each 1 to 5; a step below 3 is a miss)
- [ ] No readable text, logo or brand in any clip; no office or city filler; no AI-made picture slipped in
- [ ] No clip repeated inside the video; none repeated from the last three videos
- [ ] About 2.5 s per cut; a new step about every 7 s
- [ ] Music does not audibly loop; the voice sounds acceptable; captions readable at phone size
- [ ] Watched in full with sound

Anything the flow cannot do: send it as `G: <what>`.

---

## 11. Test plan: first 14 Shorts in 7 days (2 a day)

**Bet:** can stock footage plus an original script hold viewers on a process-explainer Short? Same channel, one change at a time.

**Cadence (from 30 Oct):** 2 Shorts a day at fixed slots, 18:30 and 23:30 IST (a guess aimed at UK and US viewers; do not change until there is data). Not 4 a day: repeated-format risk on a new channel and two gate reviews per Short. Decide on 3 a day only after the first 5 Shorts have been read at 48 to 72 hours. Vary the hook shape (number, contradiction, odd step first, inside reveal) so none repeats twice in a row, and vary the step count from 4 to 7.

**Topics, in order (honey first, 30 Oct):** honey · tea · maple syrup · salt · chocolate · glass bottle · cheese · dried pasta · olive oil · jeans · recycled paper · ice cream · pencil · car tyre · coin. Briefs for the first five are written and their facts are checked against sources; the rest are researched in batches before briefing. Swap any topic that fails the footage check in section 6.

**Read after 5 Shorts** (founder pastes Studio numbers): stayed to watch, average percent viewed, subscribers gained, and the Gate 2 clip-match ratings. Decide then: keep going, switch to food science as the topic family, or stop.

**To verify on the first Short (log as gaps only if they distort the result):**
1. Does the planner use the Pictures line, and does `secondsPerStill` apply to stock clips?
2. Does the pipeline avoid reusing clips across videos? Is there a per-clip licence log?
3. Does music loop inside 45 s? Track lengths against Short length.
4. Does any step fall back to an AI still?
5. How lively the chosen voice sounds on this script (the 3-voice test).

**Cost:** the founder's cap is $0.20 per Short. Check the first run's real cost.

---

## 12. Open decisions and change log

**Open (Neeraj):**
1. Trademark check on "Start to Shelf"; record the handle actually set in Studio.
2. Voice: result of the 3-voice test; whether to stay on OpenAI TTS after the sound upgrade.
3. Synthetic-media flag for stock-only Shorts (section 5).
4. Tenant slot: resolved 30 Oct. This channel replaces Underdogs.
5. Registry row in `CHANNEL_MANAGER_ROLE.md` section 10 (the founder approves; the architect or docs agent edits).

**Change log**
- 2026-11-01 v0.2: name settled as Start to Shelf (Raw to Real rejected); channel replaces Underdogs (section 8 note, open item 4 resolved); all voices work and the app has no voice direction field (sections 2 and 7); cadence set to 2 a day with a 15-topic order (section 11); footage check changed to 2 of 3 clip ideas (section 6). Git `main` must receive the same change by pull request.
- 2026-10-30 v0.1: first draft, Shorts-only stock-footage channel, written around today's sound limits.
