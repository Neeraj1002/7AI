# Script Review Misses: Fine-Tuning Log

**Purpose:** a running log of real runs where the Script Review agent passed something a human editor had to fix at Gate 1. Each case records the brief, the generated script, what the reviewer said, what it missed, the human correction, and a **generic reviewer rule** (not tied to any one channel) that would have caught it. Use the rules to tune the Script Review prompt, and the cases as eval / few-shot examples.

**Owner:** Neeraj · **Started:** 2026-10-07 · **Cases:** 6 · **Last updated:** 2026-10-11

**How to add a case:** copy the case template at the bottom, fill in every field, and add any new rule to the Rule list (or bump the "seen" count of an existing one).

---

## Rule list (candidate additions to the Script Review prompt)

| ID | Rule (generic) | Category | Seen |
|---|---|---|---|
| SR-1 | Check every factual claim, not just the overall tone. For each named term, date, person, number or "X was Y" statement, ask: would a subject expert accept this exact wording? If not, list it in `factualConcerns` with the safer wording, and cap the score at 6 until fixed. | Fact accuracy | 1 |
| SR-2 | Check the brief's constraints one by one. For a "facts in order" constraint, confirm each listed fact appears **with its key term intact** (e.g. if the fact is "the word X comes from Y", the script must say both X and Y). A dropped or weakened fact is a constraint violation, not a style note. Qualifiers that change meaning count as key terms (e.g. "a dock labourer's full day" shortened to "wage"; "about" added to an exact figure like 2s 6d = 30 pence). | Brief compliance | 3 |
| SR-3 | Flag filler and redundancy: any sentence or phrase that adds no new fact, no tension and no payoff (e.g. "It made a neat tale", "Survivors who lived", repeating "301 AD" in back-to-back sentences). In a 30–60 s Short every sentence must earn its ~2.5 s. | Pacing / density | 3 |
| SR-4 | Flag unnatural or ambiguous wording a listener can't parse in one pass (e.g. "coins, minted denarii"; a pronoun like "These were…" with nothing for it to refer to yet). The script is heard, not read. | Clarity (spoken) | 2 |
| SR-5 | Flag words a TTS voice is likely to mispronounce or that sound wrong aloud (foreign/Latin terms, archaic spellings like "gaol", words with an unwanted second meaning like "asses" for the Roman coin, rare names, abbreviations) and suggest a plain substitute ("jail", "small bronze coins"). | TTS risk | 2 |
| SR-6 | Do not award 9–10 if any SR-1, SR-2, SR-7, SR-8 or SR-9 issue exists. A high score must mean "safe to publish as is". | Scoring calibration | 5 |
| SR-7 | A **conversion rule must not be stated as a fact**. If the brief or style guide defines a convention (e.g. "count one day's work as $120 today"), the script must present it as that convention ("a day's work, about $120 today"), never as the value of the coins or object ("a penny and a half was worth $120"). Check every currency figure. | Fact accuracy (conversions) | 1 |
| SR-8 | Flag **overclaims that drop a hedge**. If the brief or sources say "largely", "mostly", "estimates range", "could be", the script must not upgrade it to "none", "all", "always", "never" (e.g. "None of it worked" for "largely failed"; "a pint" for "about a pint"; "almost always against workers, rarely employers" for "mostly against workers"; "markets everywhere"; "Four eggs cost" for "at most"). Approximate units and conversions keep their "about"; legal maximums keep "at most"/"legal". A claim attributed to a source ("a writer claimed") must not continue as a free-standing fact in the next sentence. | Hedging | 4 |
| SR-9 | Flag **any claim not in the brief**. Every fact, number, generalisation or vivid detail must trace to a brief line; anything else goes in `factualConcerns` as "not in brief" (e.g. "Whole villages lost half their people", "survivors who dug graves", "rather than sell at a loss", "Blood was shed over bread and wine", "for every market to see", "it kept hungry families fed", "copper nails torn loose from ships"). Vivid invented colour is a fact risk, not a quality win. **Persists even when the brief says "use only the facts in these beats" (Case 6), so the reviewer must enforce it.** | Fact accuracy (invention) | 3 |

### Brief-writer lessons (fix the input, not just the output)

Some misses start in the brief. Apply these when writing briefs (they are also in the channel doc's §11 template):

| ID | Lesson | From |
|---|---|---|
| B-1 | Phrase money conversions as a **rule**, not a value: "count X as one day's work; by our rule a day's work is $120 today. Never say the coins themselves are worth dollars." | Case 2 |
| B-2 | Put the **exact hedge words** in the brief ("mostly range", "largely failed", "Mayhew estimated"). The writer copies hedges literally and drops any you leave implicit. | Case 2 |
| B-3 | Don't put TTS-risky words in the brief's facts (gaol, asses, rare Latin). Use the plain word in the brief so it never reaches the script. | Case 2 |
| B-4 | Ask for the key term explicitly when a fact depends on it ("say the word 'salary'"). | Case 1 |
| B-5 | Check every price against the **primary translation's exact item name** before it goes in a brief. Similar items can carry different prices (Edict: "Boots for soldiers, without hob nails" 100 vs "Soldier's shoes" 75). | Case 3 |
| B-6 | For story briefs, give each beat its own facts and say "use only the facts in these beats; add no other facts or details". A story format invites the writer to add colour. | Case 4 |

---

## Case 1 · 2026-10-07 · Not In Your Textbook · Q1 "Roman soldiers weren't paid in salt" (45 s, voice: fable)

**Brief (as submitted):**
```
Topic: Roman soldiers and the myth that they were paid in salt, Roman Empire, 1st century AD.
Constraint: about 110 words, short sentences.
Constraint: first sentence must be exactly: "You've heard Roman soldiers were paid in salt. They weren't."
Constraint: facts in order: (1) the word "salary" comes from Latin salarium, which in Roman texts simply means a money allowance (2) Pliny the Elder linked salt to the word, but no ancient source says soldiers were paid in salt (3) the "salt money" story was invented by 18th-century dictionary writers guessing at the word's origin (4, strongest) Roman soldiers were paid in coins, and the army deducted money for their food, clothes and weapons.
Constraint: frame the salt payment as a myth throughout; say "no ancient source" rather than "never".
Constraint: end on fact 4. No moral, no question, no call to action.
```

**Generated script (103 words, ~41 s):**
> You've heard Roman soldiers were paid in salt. They weren't. In the Roman army, around the 1st century AD, soldiers earned a salarium. In Latin texts, that word simply meant a money allowance. Pliny the Elder once linked it to salt, but no ancient source says soldiers were paid in salt. The salt-payment story was actually invented later. Eighteenth-century dictionary writers guessed at the word's origin and ran with salt. It made a neat tale, but it's a myth. The truth is plainer. Roman soldiers were paid in coins, minted denarii. From that pay, the army deducted money for food, clothing, and weapons.

**Reviewer output (visible at Gate 1):** score **9/10**. "Excellent myth-busting script that opens with an immediate contradiction (the hook), maintains crisp pacing throughout, and del…" (truncated in the app).

> ⚠️ **Check before blaming the reviewer:** the app does not currently show `factualConcerns` at Gate 1 (known gap, Sprint 4 Task 2). The reviewer *may* have flagged miss #1 there. Confirm from the run's Details / debug bundle and note the result here: _not yet checked_.

**What the reviewer missed:**

| # | Miss | Script text | Why it matters | Rule |
|---|---|---|---|---|
| 1 | **Factual slip** | "soldiers earned a salarium" | A Roman soldier's regular pay was the *stipendium*. *Salarium* appears in Roman texts as an allowance, not as ordinary army pay. The script states as fact the very link the video is meant to question. | SR-1 |
| 2 | **Brief fact dropped** | (missing) the word "salary" | Fact 1 required "salary comes from salarium". Without "salary", the viewer can't see why the myth exists, and the hook loses its payoff. | SR-2 |
| 3 | **Filler** | "It made a neat tale, but it's a myth." · "ran with salt" | Restates what was already said; about 3 s with no new information. | SR-3 |
| 4 | **Awkward spoken phrasing** | "paid in coins, minted denarii" | "Minted" is redundant and sounds odd aloud; "silver denarii" is clearer and adds a detail. | SR-4 |
| 5 | **TTS risk not flagged** | "salarium", "denarii" | Latin terms are often mispronounced by TTS; the editor should listen for them at Gate 2. | SR-5 |
| 6 | **Score too high** | 9/10 | With a factual slip and a dropped required fact, it was not publish-ready. | SR-6 |

**Human correction (applied at Gate 1 via Edit, ~104 words, ~42 s):**
> You've heard Roman soldiers were paid in salt. They weren't. The idea grew from our word salary. It comes from the Latin salarium. In Roman texts, that simply meant a money allowance. Pliny the Elder linked the word to salt. But no ancient source says soldiers were paid in salt. That story came much later. Eighteenth-century dictionary writers guessed at the word's origin, and the salt tale stuck. The truth is plainer. In the 1st century AD, Roman soldiers were paid in coins, silver denarii. And the army took some of it back. It deducted money for their food, their clothes, and their weapons.

**Change summary:**
- Removed "soldiers earned a salarium"; replaced with "The idea grew from our word salary. It comes from the Latin salarium." (fixes #1 and #2)
- Cut "It made a neat tale, but it's a myth" and "ran with salt"; replaced with "and the salt tale stuck" (fixes #3)
- "minted denarii" → "silver denarii" (fixes #4)
- Moved the date to the payoff line ("In the 1st century AD, Roman soldiers were paid…") so the era is stated where the fact is.
- Split the ending into "And the army took some of it back. It deducted money for…" for a stronger final beat (still ends on fact 4; no moral, question or CTA).

**What the reviewer got right:** exact first sentence; facts in the required order; "no ancient source" wording; ends on fact 4; no CTA; length within range.

**Sources used for the correction:** [Kiwi Hellenist (P. Gainsford), "Salt and salary"](https://kiwihellenist.blogspot.com/2017/01/salt-and-salary.html) · [The Conversation, "Our pay is called a salary, but were Roman soldiers really paid in salt?"](https://theconversation.com/our-pay-is-called-a-salary-but-were-roman-soldiers-really-paid-in-salt-290057)

**Outcome (fill after Gate 2 / publish):** Fable pronunciation of salarium/denarii: _tbd_ · Published: _tbd_ · 48-h views / retention: _tbd_

---

## Case 2 · 2026-10-08 · Not In Your Textbook · Q4 "The law against pay rises" (60 s, voice: ash)

**Brief (as submitted):**
```
Topic: English farm workers and craftsmen after the Black Death, medieval England, 1351.
Constraint: about 150 words, short sentences.
Constraint: first sentence must be exactly: "In 1351, England made it a crime for workers to take a pay rise."
Constraint: facts in order: (1) the Black Death of 1348 to 1350 killed a huge share of England's people; historians' estimates mostly range from 40 to 60 percent (2) with so few workers left, the survivors demanded higher pay (3) the Statute of Labourers fixed daily pay at the old pre-plague rates: a master carpenter 3 pence, a master mason 4 pence, their helpers a penny and a half, hay-makers one penny (4) a worker who broke the law could be put in the stocks for three days or more, or sent to gaol (5, strongest) the law largely failed: farm wages in England roughly doubled between 1350 and 1450.
Constraint: use the helper's penny and a half as one day's work, worth $120 today. A master mason's legal day was worth nearly three helper days, about $320 today. Use "about".
Constraint: say "estimates range" for the death toll and "could be" for the punishments.
Constraint: end on fact 5. No moral, no question, no call to action.
```

**Generated script (133 words, ~53 s):**
> In 1351, England made it a crime for workers to take a pay rise. The Black Death had just swept through, 1348 to 1350. Estimates range from forty to sixty percent of England's people dead. Survivors who lived saw their labor suddenly scarce. They demanded higher wages. Parliament answered with the Statute of Labourers, freezing pay at old rates. A master carpenter: three pence a day. A master mason: four pence. Helpers: a penny and a half. Hay-makers: one penny. That helper's wage, a penny and a half, was worth about one hundred twenty dollars today. The mason's legal maximum was worth about three hundred twenty. Breaking the law could mean the stocks for three days or more, or gaol. None of it worked. Between 1350 and 1450, farm wages roughly doubled anyway.

**Reviewer output (visible at Gate 1):** score **9/10**. "Excellent script. Opens with a genuine cold hook—the central paradox (criminalizing wage rises) lands immediately, followed by …" (truncated).

> ⚠️ `factualConcerns`: the run's **Details** panel shows only step statuses (intake / script generation / script review / gate1 / video generation), not review fields. Still unknown whether the reviewer raised any. Next check: the debug (bug) icon. Second run in a row where this couldn't be confirmed, which supports surfacing `factualConcerns` at Gate 1 (Sprint 4 Task 2).

**What the reviewer missed:**

| # | Miss | Script text | Why it matters | Rule |
|---|---|---|---|---|
| 1 | **Conversion rule stated as a fact** | "a penny and a half, was worth about one hundred twenty dollars today" | $120 is the channel's convention for one day's work, not a currency conversion. As written it's a false claim about the coins. | SR-7 |
| 2 | **Conversion incomplete** | "The mason's legal maximum was worth about three hundred twenty." | No unit ("dollars", "a day") and the "nearly three helper days" link the brief asked for is missing, so the comparison doesn't land. | SR-2 |
| 3 | **Hedge dropped → overclaim** | "None of it worked." | Sources: poorly enforced, *largely* failed; real wages didn't rise immediately after the plague. Brief said "largely failed". | SR-8 |
| 4 | **Hedge weakened** | "Estimates range from forty to sixty percent" | Estimates actually run ~20% to 62.5%; 40–60% is the *widely accepted* band, so "mostly" is needed. (Brief-side cause: the hedge constraint itself said only "estimates range"; see B-2.) | SR-1 |
| 5 | **Redundancy** | "Survivors who lived" | Filler words. | SR-3 |
| 6 | **TTS risk** | "gaol" | Likely misread as "gay-ol"; "jail" means the same. (Brief-side cause: "gaol" was in the brief; see B-3.) | SR-5 |
| 7 | **Score too high** | 9/10 | Two misses out of two runs at 9/10: the score is currently not a usable quality signal. | SR-6 |

**Brief-side causes (my error as brief writer):** the conversion constraint said "the helper's penny and a half … worth $120 today", which is close to the wrong sentence the script produced (#1); the hedge constraint said "estimates range" without "mostly" (#4); and "gaol" was in the brief (#6). Lessons B-1 to B-3 above.

**Human correction (supplied for Gate 1, 147 words, ~55–60 s):**
> In 1351, England made it a crime for workers to take a pay rise. The Black Death had just swept through, from 1348 to 1350. Historians' estimates mostly range from forty to sixty percent of England's people dead. Suddenly, workers were scarce. The survivors demanded higher wages. Parliament answered with the Statute of Labourers. It froze daily pay at the old, pre-plague rates. A master carpenter: three pence. A master mason: four pence. Their helpers: a penny and a half. Hay-makers: one penny. Count the helper's day as one day's work, about one hundred twenty dollars today. Then the mason's legal day was worth nearly three of those: about three hundred twenty dollars. Break the law, and a worker could be put in the stocks for three days or more, or sent to jail. It largely failed. Between 1350 and 1450, farm wages in England roughly doubled anyway.

> Whether this exact text was pasted before approval is not yet confirmed (run moved past Gate 1 at 01:02). Fill in: _tbd_.

**Change summary:**
- Conversion rewritten as a convention ("Count the helper's day as one day's work, about $120 today") (fixes #1)
- Mason line completed: "nearly three of those: about three hundred twenty dollars" (fixes #2)
- "None of it worked" → "It largely failed" (fixes #3)
- "Estimates range" → "Historians' estimates mostly range" (fixes #4)
- "Survivors who lived saw their labor suddenly scarce. They demanded…" → "Suddenly, workers were scarce. The survivors demanded…" (fixes #5)
- "gaol" → "jail"; "Breaking the law could mean" → "a worker could be put" (fixes #6, keeps "could be")
- Added "in England" to the final line.

**What the reviewer got right:** exact first sentence; all five facts in order; every pence figure correct; "could be" hedge kept; ends on fact 5; no CTA; length in range.

**Sources used for the correction:** [Statute of Labourers, 1351 (Fordham)](https://sourcebooks.web.fordham.edu/seth/statute-labourers.asp) · [Statute of Labourers 1351](https://en.wikipedia.org/wiki/Statute_of_Labourers_1351) · [Black Death in England](https://en.wikipedia.org/wiki/Black_Death_in_England)

**Outcome:** not published. This fact-list version was superseded by the story brief (see Case 4).

---

## Case 3 · 2026-10-08 · Not In Your Textbook · Q2 "Diocletian's price list" (~38 s, voice: ash)

**Brief:** the Q2 brief in the channel doc, revised by Neeraj before the run: boots dropped (the 75-denarii figure was attached to the wrong item; see B-5), new hook, "sack" and litre figure removed from the wheat, an eggs dollar line added (4/25 × $120 = $19.20, so about $20), straight double quotes throughout.

**Generated script (95 words, ~38 s):**
> In 301 AD, Rome's emperor tried to fix the price of eggs by law. These were the official maximum prices, set by Emperor Diocletian's Edict of 301 AD. The law was largely ignored. A farm labourer earned at most 25 denarii a day, plus meals. Count that as one day's work, about $120 in today's money. Four eggs cost 4 denarii, about $20 of work. A pint of ordinary wine cost 8 denarii, about one-third of a day's work. One army-measure of wheat cost 100 denarii. That took four full days of work, about $480.

**Reviewer output (visible at Gate 1):** score **8/10**. "Strong historical script with clear economic comparisons that work well for the channel. The Diocletian Edict opening is striking an…" (truncated). First run scored below 9; the cut reason isn't visible.

**Fact check against the primary translation (Univ. of Bergen):** labourer with maintenance 25/day ✅ · eggs, 4 for 4 ✅ (single-source flag cleared) · ordinary wine 8 per Italian sextarius ✅ · wheat 100 per army (k.) modius ✅. All numbers and conversions correct. **This is the first script with no factual or conversion errors**, which matches the lessons (B-1, B-2) being applied in the brief.

**What the reviewer missed:**

| # | Miss | Script text | Why it matters | Rule |
|---|---|---|---|---|
| 1 | **Dangling reference** | "These were the official maximum prices" | Said before any price is mentioned; "these" points at nothing. | SR-4 |
| 2 | **Repetition** | "In 301 AD … Edict of 301 AD" | Same date in back-to-back sentences; ~1 s wasted. | SR-3 |
| 3 | **Approximation dropped** | "A pint of ordinary wine" | The Roman sextarius is a bit over half a litre, not exactly a pint; the brief said "about a pint". | SR-8 |
| 4 | **Score not explained** | 8/10 | Lower score, but the visible summary doesn't say what cost the point, so the editor can't act on it. | SR-6 (calibration) |

**Human correction (supplied for Gate 1, ~95 words, ~38 s):**
> In 301 AD, Rome's emperor tried to fix the price of eggs by law. Emperor Diocletian's Edict set official maximum prices for well over a thousand goods. The law was largely ignored. A farm labourer could earn at most 25 denarii a day, plus meals. Count that as one day's work, about $120 in today's money. Four eggs: 4 denarii, about $20 of work. About a pint of ordinary wine: 8 denarii, a third of a day's work. One army-measure of wheat: 100 denarii. That's four full days of work, about $480.

**Change summary:**
- "These were the official maximum prices, set by Emperor Diocletian's Edict of 301 AD" → "Emperor Diocletian's Edict set official maximum prices for well over a thousand goods" (fixes #1, #2; adds one sourced fact: "well over a thousand products", Wikipedia)
- "earned at most" → "could earn at most" (it's a legal maximum)
- "A pint" → "About a pint" (fixes #3)
- Price lines shortened to "item: price, conversion" for pace.

**What the reviewer got right:** hedges "official maximum prices" and "largely ignored" kept; conversion phrased as a rule ("Count that as one day's work"), so SR-7 passed; all numbers correct; ends on the strongest fact; no CTA.

**Sources:** [Edict translation (Univ. of Bergen)](https://kark.uib.no/antikk/dias/priceedict.pdf) · [Edict on Maximum Prices](https://en.wikipedia.org/wiki/Edict_on_Maximum_Prices)

**Outcome:** not published. Superseded by the story brief "The emperor who fixed the price of eggs" (channel doc §13, Q2).

---

## Case 4 · 2026-10-09 · Not In Your Textbook · Q4 "The law against pay rises", story brief (45 s, voice: ash)

**Brief:** the first **story-format** brief (channel doc §13, Q4, v1.6): fixed first and last sentence, four beats joined by "but"/"so", exact hedge words ("historians' estimates mostly range", "could be fined or jailed", "poorly enforced"), one number only, no dollar figures, straight quotes (Bugs Task 11, PR #55).

**Generated script (~112 words):**
> In 1351, England made it a crime for workers to take a pay rise. The Black Death had swept through just years before. Historians' estimates mostly range from forty to sixty percent mortality. Whole villages lost half their people. So labour grew scarce, and survivors who dug graves and ploughed fields demanded higher wages. But Parliament pushed back. It passed the Statute of Labourers, freezing pay at pre-plague rates. A master carpenter's wage was capped at three pence a day, the official maximum. Violators could be fined or jailed. The law was poorly enforced, and almost always against workers, rarely employers. Resentment simmered for decades. Thirty years later, that anger helped fuel the Peasants' Revolt.

**Reviewer output (visible at Gate 1):** score **9/10** (summary not captured).

**What improved (story format working):** first and last sentence exact; clear turn ("But Parliament pushed back"); varied rhythm; ending is a kicker that pays off the hook instead of another list item; all three hedges present; no dollar figures; the only number (three pence) is correct.

**What the reviewer missed:**

| # | Miss | Script text | Why it matters | Rule |
|---|---|---|---|---|
| 1 | **Invented fact** | "Whole villages lost half their people." | Not in the brief or sources; village losses varied widely. A generalisation stated as fact. | SR-9 |
| 2 | **Invented detail** | "survivors who dug graves and ploughed fields" | Vivid but unsourced colour ("dug graves"). | SR-9 |
| 3 | **Hedge strengthened** | "almost always against workers, rarely employers" | Source: enforced "typically only against labourers"; brief said "mostly against workers, not employers". | SR-8 |
| 4 | **Phrase leaked from another brief / redundant** | "capped at three pence a day, the official maximum" | "Official maximum" is the Q2 hedge; here it repeats "capped". | SR-3 |
| 5 | **Textbook wording** | "forty to sixty percent mortality" | Reads as written prose, not speech; "of the people dead" is spoken. | SR-4 |
| 6 | **Concrete detail lost** | "just years before" | Brief gave "from 1348 to 1350"; the dates are more concrete. | SR-2 |
| 7 | **Score too high** | 9/10 | Invented facts present; three of four logged runs scored 9/10 with errors. | SR-6 |

**Human correction (supplied for Gate 1, ~105 words):**
> In 1351, England made it a crime for workers to take a pay rise. The Black Death had just swept through, from 1348 to 1350. Historians' estimates mostly range from forty to sixty percent of the people dead. So labour grew scarce, and the survivors who still worked the fields demanded higher wages. But Parliament pushed back. It passed the Statute of Labourers, freezing pay at pre-plague rates. A master carpenter could take no more than three pence a day. Workers who took more could be fined or jailed. The law was poorly enforced, and mostly against workers, not employers. Resentment simmered for decades. Thirty years later, that anger helped fuel the Peasants' Revolt.

**Change summary:**
- Cut "Whole villages lost half their people" (fixes #1)
- "survivors who dug graves and ploughed fields" → "the survivors who still worked the fields" (fixes #2)
- "almost always against workers, rarely employers" → "mostly against workers, not employers" (fixes #3)
- "A master carpenter's wage was capped at three pence a day, the official maximum. Violators could be fined or jailed." → "A master carpenter could take no more than three pence a day. Workers who took more could be fined or jailed." (fixes #4; matches the brief's wording)
- "forty to sixty percent mortality" → "forty to sixty percent of the people dead" (fixes #5)
- "just years before" → "just swept through, from 1348 to 1350" (fixes #6)

**Learning:** the story format fixed structure and endings but invites **invented colour**. Counter it on both sides: SR-9 for the reviewer, B-6 for the brief writer.

**Sources:** [Statute of Labourers, 1351 (Fordham)](https://sourcebooks.web.fordham.edu/seth/statute-labourers.asp) · [Statute of Labourers 1351](https://en.wikipedia.org/wiki/Statute_of_Labourers_1351) · [Black Death in England](https://en.wikipedia.org/wiki/Black_Death_in_England)

**Outcome (fill after Gate 2 / publish):** edit pasted before approval: _tbd_ · ending feels finished (founder's ear): _tbd_ · Ash on "Peasants' Revolt": _tbd_ · Images (no beak-mask plague doctors): _tbd_ · Published: _tbd_ · 48-h viewed-vs-swiped / APV: _tbd_

---

## Case 5 · 2026-10-10 · Not In Your Textbook · Q2 "The emperor who fixed the price of eggs", story brief (45 s, voice: ash)

**Brief:** the Q2 story brief (channel doc §13, v1.6): fixed first and last sentence, four beats, exact hedges ("official maximum prices", "a writer of the time claimed", "largely failed"), writer unnamed, no dollar figures. Straight quotes throughout; the run succeeded, so this is also the first live pass of the Bugs Task 11 fix (PR #55). **Did not yet include** the B-6 line ("use only the facts in these beats; add no other facts, numbers or details").

**Generated script (129 words, ~52 s):**
> In 301 AD, a Roman emperor made overcharging for eggs a crime punishable by death. Prices were soaring across the empire, and Diocletian blamed greedy sellers for the panic. So he set official maximum prices for over a thousand goods, carved in stone for every market to see. Four eggs cost four denarii — about one sixth of a laborer's daily pay. But the law did not calm the chaos. A writer of the time claimed sellers hid their goods rather than sell at a loss, and prices only worsened. Blood was shed over bread and wine. So by 305 AD, when Diocletian stepped down, the law had largely failed, quietly ignored in markets everywhere. An emperor who could order executions could not control the price of an egg.

**Reviewer output (visible at Gate 1):** score **9/10**. "Excellent script that nails the channel's core formula: a specific historical price control policy told through the lens of an ordinary l…" (truncated).

**What worked:** first and last sentence exact; clear turn; kicker lands; "claimed" and "largely failed" present; 4/25 = "about one sixth" correct.

**What the reviewer missed:**

| # | Miss | Script text | Why it matters | Rule |
|---|---|---|---|---|
| 1 | **Attributed claim restated as fact, with invented specifics** | "Blood was shed over bread and wine." | Stands outside "a writer of the time claimed", so it reads as established fact; the source (Lactantius, hostile) says "trifling and cheap articles", not bread and wine. | SR-8, SR-9 |
| 2 | **Invented reason** | "rather than sell at a loss" | Source gives fear, not loss. | SR-9 |
| 3 | **Overclaim** | "carved in stone for every market to see" | Surviving copies are mostly from the eastern provinces. | SR-9 |
| 4 | **Legal maximum stated as a price** | "Four eggs cost four denarii" | It was the official maximum, not a market price. | SR-8 |
| 5 | **"Legal" dropped** | "a laborer's daily pay" | 25 denarii was the legal maximum for a farm labourer. | SR-8 |
| 6 | **Overclaim** | "quietly ignored in markets everywhere" | "Everywhere" is unsupported. | SR-8 |
| 7 | **Colour / length** | "for the panic", "the chaos"; 129 words vs ~110 | Unsourced colour; over target length. | SR-3 |
| 8 | **Score too high** | 9/10 | Fourth 9/10 on a script with fact errors. | SR-6 |

**Human correction (supplied for Gate 1, ~120 words):**
> In 301 AD, a Roman emperor made overcharging for eggs a crime punishable by death. Prices were soaring across the empire, and Emperor Diocletian blamed greedy sellers. So he set official maximum prices for well over a thousand goods, and copies of the law were carved in stone. Even four eggs had a legal price: at most four denarii, about a sixth of a farm labourer's legal pay for a day. But the law did not calm prices. A writer of the time claimed that sellers hid their goods, prices got even worse, and blood was shed over cheap things. So by 305 AD, when Diocletian stepped down, his price law had largely failed and was being ignored. An emperor who could order executions could not control the price of an egg.

**Change summary:**
- Bloodshed folded back inside the "claimed" sentence, with the source's "cheap things" (fixes #1)
- Cut "rather than sell at a loss" (fixes #2)
- "carved in stone for every market to see" → "copies of the law were carved in stone" (fixes #3)
- "Four eggs cost four denarii" → "Even four eggs had a legal price: at most four denarii" (fixes #4)
- "a laborer's daily pay" → "a farm labourer's legal pay for a day" (fixes #5)
- "quietly ignored in markets everywhere" → "was being ignored" (fixes #6)
- Cut "for the panic"; "did not calm the chaos" → "did not calm prices" (fixes #7)

**Learning:** two story runs in a row added unsourced colour when the brief lacked the B-6 line. B-6 now goes into every story brief (channel doc §11 template, Q2, Q4).

**Sources:** [Edict translation (Univ. of Bergen)](https://kark.uib.no/antikk/dias/priceedict.pdf) · [Edict on Maximum Prices](https://en.wikipedia.org/wiki/Edict_on_Maximum_Prices) · [Imperium Romanum on the Edict](https://imperiumromanum.pl/en/article/edict-of-diocletian-on-maximum-prices-from-301-ce/) · Lactantius ch. 7 via [Conversable Economist](https://conversableeconomist.com/2016/12/29/the-diocletian-edict-price-fixing-in-history/)

**Outcome (fill after Gate 2 / publish):** edit pasted before approval: _tbd_ · Ash on "Diocletian" / "denarii": _tbd_ · Published: _tbd_ · 48-h viewed-vs-swiped / APV: _tbd_

---

## Case 6 · 2026-10-11 · Not In Your Textbook · Q5 "The Thames mudlarks", story brief (45 s, voice: ash)

**Brief:** Q5 story brief (channel doc §13, v1.8), **including** the B-6 line "use only the facts in these beats; add no other facts, numbers or details".

**Generated script:**
> In 1850s London, children waded into the Thames mud for about three pennies a day. At low tide they searched for coal, iron, rope, bones, and copper nails torn loose from ships. It was filthy work, but it kept hungry families fed. So when journalist Henry Mayhew came looking for stories, he found these children along the riverbank and wrote them into his book, London Labour and the London Poor. But the numbers he recorded were bleak. Mayhew estimated a mudlark earned about three pence a day, while he put a dock labourer's wage at two shillings sixpence, about thirty pence. So the arithmetic was brutal. A whole day in the Thames mud was worth a tenth of a day on the docks above it.

**Reviewer output:** not captured.

**What the reviewer missed:**

| # | Miss | Script text | Why it matters | Rule |
|---|---|---|---|---|
| 1 | **Invented claim** | "It was filthy work, but it kept hungry families fed." | Not in brief or sources; also softens the "bleak" point. | SR-9 |
| 2 | **Invented detail** | "copper nails torn loose from ships" | Brief and source: "dropped from ships". | SR-9 |
| 3 | **Invented framing** | "came looking for stories, he found these children along the riverbank" | Brief: he went to meet them for his survey of the city's poor. | SR-9 |
| 4 | **Key qualifier dropped** | "a dock labourer's wage" | Mayhew's figure is for a **full** day's work; "wage" overstates it. | SR-2 |
| 5 | **Hedge added to an exact figure** | "two shillings sixpence, about thirty pence" | 2s 6d is exactly 30 pence; brief said "which is 30 pence". | SR-2 |

**Human correction:**
> In 1850s London, children waded into the Thames mud for about three pennies a day. At low tide they searched for coal, iron, rope, bones, and copper nails dropped from ships, and sold whatever they found. So the journalist Henry Mayhew went to meet them for his survey of the city's poor, London Labour and the London Poor. But the numbers he recorded were bleak. Mayhew estimated a mudlark earned about three pence a day, while he put a dock labourer's full day at two shillings and sixpence, which is thirty pence. So the arithmetic was brutal. A whole day in the Thames mud was worth a tenth of a day on the docks above it.

**Learning:** the B-6 facts-only line did **not** stop invention (3 invented items). Brief wording alone is not enough; SR-9 must be enforced in the reviewer, and the script-generation prompt may need the same rule. Flag to the architect when the reviewer prompt is tuned.

**Outcome (fill after Gate 2 / publish):** edit pasted before approval: _tbd_ · Published: _tbd_ · 48-h viewed-vs-swiped / APV: _tbd_

---

## Case template

```
## Case N · YYYY-MM-DD · <channel> · <brief id / title> (<length>, voice: <voice>)
**Brief (as submitted):** <paste>
**Generated script (<words>, ~<sec>):** <paste>
**Reviewer output:** score <n>/10, summary, factualConcerns (from Details if not shown at Gate 1)
**What the reviewer missed:** table: # | Miss | Script text | Why it matters | Rule
**Human correction:** <final script>
**Change summary:** <bullets>
**What the reviewer got right:** <bullets>
**Sources used for the correction:** <links>
**Outcome:** <pronunciation, published?, 48-h metrics>
```
