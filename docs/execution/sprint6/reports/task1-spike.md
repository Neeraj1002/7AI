# Sprint 6 Task 1 Spike: packaging quality test

**Date**: 2026-10-25
**Status**: Round 1 rated (notes only, section 8) and the recommendation finalised (section 9). Round 2, the face test (section 8a), is built and waits for the founder's ratings ("rated 2").
**Branch / worktree / PR**: `SPRINT6_TASK1_SPIKE` · `D:\Study Material\7AI-SPRINT6\spike1` · [PR #117](https://github.com/Neeraj1002/7AI/pull/117) (merged). Follow-up: `SPRINT6_TASK1_SPIKE_R2` · `D:\Study Material\7AI-SPRINT6\spike1-r2` · [PR #118](https://github.com/Neeraj1002/7AI/pull/118)
**Task doc**: committed alone in `05d91a9` (`SPRINT6_TASK1_SPIKE_DOC: add task doc`), byte-identical to the source (r1); revisions picked up: none
**Files Created**: 107 (1 task doc, 22 spike files under `studio/scripts/spikes/packaging/`, 83 asset files, this report) · **Files Modified**: 0 (nothing in `studio/src`, `app/` or any other doc)
**Tests**: no product tests touched. Stub run twice from a clean `out/`, no spend; one live run; typecheck and eslint clean on the spike folder (section 11).
**Spend**: **$0.7568 of the $3.00 ceiling** ($0.6405 round 1, $0.1163 round 2 against its $1.00 cap; section 5).

> **Founder: rate round 2 first, read section 8a after.** Open only `task1-spike-assets/sheet2/` (`contact-sheet.png` or `.html`, cards M to X, then fill `ratings.csv`). Section 8a and `after-rating/round2/` say which card is which.

## 1. Answer in four lines

1. Our current generator **can** produce rich, clean 16:9 thumbnails on our own content. When the concept has one big subject, a scale contrast and strong light, the cards look like key art (Lego brick and child, Eiffel riveters, Eiffel lab). I read the richness from the 12 cards; whether it matches your references is your rating, not mine.
2. The weak card is weak because of the **concept** (a ship at 10% of the frame), not the model: the same model at medium and high quality, and a richer ceiling prompt, barely changed it.
3. What broke is **honesty and limits**, not pictures: invented objects, a hedge dropped from a figure, an image contradicting its own words, and the model breaking its own length rules in 2 of 18 packages. Task 1's checks need to be code, not trust.
4. Recommendation (section 9): **go**, with the founder's changes: belief versus record first, a "name the one thing you look at" check, a picture-title match check, a pairwise compare against the best candidate, a title that withholds the answer, code checks for limits, hedges and scene-versus-script, stills stay at `low`. The face decision waits for round 2. No model change is indicated, and no other image model was tested.

## 2. S0. Read first (confirmed from code and config)

| # | Question | Confirmed answer (file) |
|---|---|---|
| 1 | Stills generator and model | OpenAI Images, `gpt-image-2.5-flare-2026-09-08` (`ai-visuals/registry.ts:30`); only `ai-visuals/client.ts` calls the endpoint |
| 2 | Price per still | Token-billed (`ai-visuals/registry.ts` `priceStill`). Quality is fixed `'low'` (`ai-visuals/sizes.ts` `STILL_QUALITY`); long-form uses 1536x1024. **Measured: $0.0061 to $0.0073, mean $0.0065 per image** (12 images) |
| 3 | Registry model that reads images | Yes: `claude-haiku-4-5` through purpose `video-intelligence-own-draft` (attachments in `llm/types.ts`; same call shape as `agents/video-generation/still-check.ts` and `agents/video-intelligence`) |
| 4 | Look to generator | profile `visual.stylePrompt` / `negativePrompt` -> `sceneStyle` (`run-pipeline/state-machine.ts:1232`) -> `buildStyledScenePrompts` (`agents/video-generation/scene-prompts.ts:32`: scene, `Style:`, `Avoid:` with channel negative, safety clause if `AI_VISUALS_SAFETY_NEGATIVES_ENABLED=1`, no-marks clause) -> `generateStills`. The spike imports that same function. On dev the safety flag is **unset**, so the spike matched it |
| 5 | Scripts and profiles on dev (`sevenai_dev`) | 33 channels, **0 profile versions**; 91 completed script stages, 74 completed Gate 1 stages; **no run mentions Mary Celeste or Lego** (those ran on preview). Fixtures hold the two **briefs** only (`studio/src/long-form/fixtures/briefs/`). The only profile text in the repo is NIYT's, in `docs/channel_bibles/NIYT_CHANNEL_CONFIG.md` |
| 6 | Purposes available | Six fixed (`llm/types.ts`); none for packaging. Adding one is product code, so the spike reuses `script-generation` (Sonnet 5.5), `metadata-generation` (Haiku 4.5) and `video-intelligence-own-draft` (Haiku 4.5) |
| 7 | Cost recorded | `callLLM` returns `costUsd`; the spike books it in its own ledger and `llm-calls.json`, not `usage_events` (no run exists) |
| 8 | Fonts in repo | None; three OFL families shipped with the spike |

## 3. S1. The three scripts (your answer: generate from fixture briefs, NIYT text plus neutral)

| Id | Channel (key file only) | Source | Look | Words |
|---|---|---|---|---|
| `mary-celeste` | Not In Your Textbook | Real `generateScript()` (long, 600 s, brief-only) from `mary-celeste.txt`. **Not an approved script.** Flagged `lengthOutOfRange` after two repairs: 1662 words vs 1500 target | NIYT profile text, verbatim | 1662 |
| `lego` | Underdogs | Real `generateScript()` (long, 120 s, brief-only) from the Task 6 Appendix B brief. **Not an approved script** | neutral (no profile) | 324 |
| `eiffel` | Dry-run test channel | Dev DB run `d88d50b8`, script of attempt 2, Gate 1 approved (run sits at `paused_gate2`); read-only copy in `fixtures/` | neutral (no profile) | 276 |

Limit this puts on the result: two of three channels have the **same** neutral look, so "fit to each channel's look" is tested only for NIYT. Script texts: `after-rating/scripts/`.

## 4. S2 and S3. Packages, prune, renders

- Six packages per script, one call each. Devices used: Mary Celeste: mystery x2, how, correction, person, stake; Lego: stake, mystery, person, scale, how, correction; Eiffel: stake, how, scale, correction, mystery, countdown. Where a device was thin the model said so in `deviceNote` (9 of 18 packages), which is what we want from it.
- **Limit breaks (code check, not model trust):** 2 of 18 packages broke the hard limits (Lego 2: lettering 5 words; Lego 3: 75-character title and 5-word lettering). Both were pruned, but Task 1 needs a validator and one repair call.
- Every `supportQuote` appears verbatim in its script (18 of 18). That check passes and still misses the failures in section 7: a real quote can sit next to an invented object.
- Cold-reader prune (Haiku, title and lettering only) kept three per script. It gave 13 of 18 candidates a 3 or a 4 and none a 5; weak separation, though it did put the two weakest Mary Celeste ideas (a family on a pier, a boat of oarsmen) last.
- Twelve renders: nine channel-look, three ceiling (same concept as the top-ranked package; same pipeline quality `low`, no channel style or negative, a "layered depth, volumetric light, scale" sentence added). Prompts for every card: `after-rating/cards.json`.

## 5. Real price and spend

| Item | Cost |
|---|---|
| Scripts (Mary Celeste $0.1937 incl. 2 length repairs, Lego $0.0114, Eiffel $0) | $0.2050 |
| Packages (3 calls, Sonnet 5.5) | $0.1177 |
| Cold-reader prune (3 calls, Haiku) | $0.0066 |
| **12 images, `low`, 1536x1024** | **$0.0783 (mean $0.0065, range $0.0061 to $0.0073)** |
| Critic, final pass (12 calls, Haiku, 2 images each) | $0.0323 |
| Critic, first pass (discarded: lettering changed afterwards) | $0.0356 |
| Quality probe (6 images: medium **$0.0120**, high **$0.0429** each) | $0.1649 |
| Round 1 total | $0.6405 (about $0.44 without the probe and the discarded critic pass) |
| Round 2 (6 concept calls, 6 images at $0.0070 to $0.0081, 6 face checks) | $0.1163 of its $1.00 cap |
| **Total** | **$0.7568 of $3.00** |

Real price per image at the pipeline's setting is **$0.0065**; a full set of twelve costs $0.08. A packaging step that renders three candidates plus one final at medium is about $0.05.

## 6. S4 and S5. Lettering and critic

Lettering drawn in code (`@napi-rs/canvas`), main words at most 4 and subline at most 5, four safe zones (bottom-right left clear for the platform's own duration chip; no chip or badge is drawn), dark scrim plus outline and shadow. Fonts, all SIL OFL 1.1, licences in `fonts/`:

| Family | Role | Main text at 170 px wide (px tall) | Note |
|---|---|---|---|
| Anton | heavy condensed sans | 19 to 24 | biggest at small size; best for numbers and stakes |
| Playfair Display Black | serif | 14 to 16 | editorial; fine at feed size, thin at 170 px |
| Cinzel Black | display | 13 to 17 | suits history; smallest at 170 px |

- Feed size (360 px) and sidebar size (170 px) are produced for all 12 cards (`after-rating/cards/*-feed.jpg`, `*-side.jpg`). First lettering draft had a 24 px subline that was unreadable at feed size (6.8 px); the minimum is now 36 px at 1280 (10 px at feed).
- **Critic on the real image** (`claude-haiku-4-5`, feed image plus tiny image, sees only thumbnail and title): it transcribed the main words correctly from the 170 px version on **12 of 12** cards, so the lettering survives the sidebar. Its click answer was yes on 9, maybe on 3, no on 0. That is too generous to filter anything; Task 1's critic needs a harder prompt or a stronger model, and its use should be judged against your ratings below.

## 7. What worked and failed (my read of the 12 cards plus 6 probe images; not a rating)

| Area | Result |
|---|---|
| Richness | Strong where the concept has one dominant subject, a scale contrast and directional light: Lego brick and child, Eiffel construction, Eiffel "lab". Weak: Mary Celeste "nobody answered" (the ship is tiny against a grey sea, calm but low impact) in **both** the NIYT-look and the ceiling render |
| Faces and hands | No face toward the camera in any card (the NIYT negative was obeyed; others show people from behind or small). Hands on the Lego "back to the brick" card and the hammer hand on the Eiffel card look anatomically sound at full size. I did not inspect every card at full size |
| Clutter | Busy cards (Eiffel 18,038 pieces; Lego shelves) still read, because the model mostly kept the requested lettering zone calm. Two cards let the lettering run over picture detail (the yawl card's bow, the Lego monolith's edge); the scrim and outline kept both readable |
| Stray text | No readable stray lettering or logo on any of the 12 at sheet size, and none in the 7 I opened full size. The no-marks clause held. Lego shelf boxes are drawn in a Lego-like style, with no readable text |
| Consistency with look | NIYT cards are muted and film-like per its style text; neutral cards are saturated and commercial. The two looks are visibly different, and a third distinct look was not testable |
| Ceiling vs channel look | On my reading the three pairs (Mary Celeste G/K, Lego A/F, Eiffel E/I) are close. The ceiling versions have slightly more drama (G/K: livelier sea and sky), but I could not reliably rank any pair. The generic "richer" sentence added little; **the concept fields carry the quality**. Your blind ratings will tell us whether you see a gap |
| Quality tier | Low vs medium vs high on the three ceiling prompts (`after-rating/quality-probe.png`): high adds detail and a little depth, but at feed size the change is small. Not worth $0.043 versus $0.0065 on this evidence |

**Honest-curiosity failures found (these matter more than the pictures):**

1. **Invented object.** Mary Celeste "No warm meal / The record differs" puts a child's wooden toy on the table. The script mentions Sophia, never a toy; for this brief (family never shown beyond the facts) it also hints at the family's fate. Quote check passes; scene check would not.
2. **Image contradicts its words.** Mary Celeste "The yawl was gone" shows a boat hull still sitting in the davit, with white painted railings that look later than 1872.
3. **Hedge dropped.** Lego title "Losing 220 Million Dollars" drops "about/roughly" (the same failure Sprint 5 Task 8 recorded); "BIGGEST TOY COMPANY" drops "by sales". The title fact check Task 1 plans must cover lettering too.
4. **Imagined real person.** Eiffel "The tower's lab" draws a bearded engineer holding a sextant (plausibly Eiffel). Historical, not living; allowed only where the channel config allows it, and this test channel has none.

## 8. S6. Blind sheet (round 1) and what the critic said vs what the founder said

Sheet: `task1-spike-assets/sheet/` (`A.jpg` to `L.jpg`, `ratings.csv`; shuffled with seed 20261025; key in `after-rating/KEY.csv`). Three concepts appear twice by design (channel-look and ceiling, same title): A/F, E/I, G/K. The founder gave notes, no numbers; they are recorded as said, and cards with no comment are treated as middle.

| Label | Card | Look | Device | Font | Critic: click | Critic: tiny words read | Founder note (round 1) |
|---|---|---|---|---|---|---|---|
| A | lego-4 | ceiling | scale/stake | Anton | maybe | yes | no comment (middle) |
| B | eiffel-p1 | neutral | stake/countdown | Playfair | yes | yes | **liked in every way: image, title and curiosity** |
| C | eiffel-p3 | neutral | scale/how | Anton | yes | yes | no comment (middle) |
| D | mary-p6 | NIYT | mystery | Cinzel | yes | yes | no comment (middle) |
| E | eiffel-p2 | ceiling | how/stake | Cinzel | yes | yes | good picture that does not match the title |
| F | lego-4 | neutral | scale/stake | Anton | maybe | yes | no comment (middle) |
| G | mary-p1 | NIYT | mystery/scale | Playfair | yes | yes | nothing to look at |
| H | lego-1 | neutral | stake/countdown | Cinzel | yes | yes | no comment (middle) |
| I | eiffel-p2 | neutral | how/stake | Cinzel | yes | yes | good picture that does not match the title |
| J | lego-5 | neutral | how/countdown | Playfair | maybe | yes | too basic |
| K | mary-p1 | ceiling | mystery/scale | Playfair | yes | yes | nothing to look at |
| L | mary-p3 | NIYT | correction | Anton | yes | yes | plain |

**Critic versus founder.** The critic said yes to both "nothing to look at" cards (G, K), to both picture-title mismatches (E, I) and to the plain card (L). Its only "maybe" cards were A, F and J, and only J drew a founder complaint. It agreed with the founder on B and on little else that mattered. It reads the title and the picture separately and never asks whether they match, and it says yes to almost everything (9 yes, 3 maybe, 0 no). An absolute score from this critic is not a gate; a head-to-head compare is the fix (section 9).

**What the one winner has that the others lack.** B shows the threat itself (the tower, a crane and hook, a worker looking up), asks a question in its lettering ("SOLD FOR SCRAP?"), and its title ("allowed to tear down after 20 years") holds back what happened. G and K have no subject to look at. E and I are fine pictures of a man with an instrument, but the title promises a rescue the picture does not show. J is the how-device without any stake. L is a table and a plate.

The channel-look and ceiling versions of a concept drew the same founder note each time (G/K, E/I), which supports section 7's reading that the concept, not the prompt style or the look text, decides the card.

## 8a. Round 2: the face test (waits for the founder's ratings, "rated 2")

**What was asked.** Re-render the concepts of B, C, E, G, J and L with an imagined, unnamed face allowed (a person looking at the thing under threat; no likeness of any real person, living or dead; never "this is X"), the same channel look text and the same lettering, **without the channel's stills negative prompt**, keeping the no-logos, no-marks and honesty clauses. Then a second blind sheet of 12: the six originals and the six new cards, shuffled, labelled M to X.

**How it was done** (`round2.ts`):

- One revision call per card (`script-generation` purpose) turns the first concept into one with a person: the model must pick a role the script supports and quote it. All six quotes are verbatim in their scripts (6 of 6). Lettering (words, zone, font) is copied from round 1 in code, not trusted to the model.
- Prompt: the same scene skeleton plus one face sentence, then the pipeline's own `buildStyledScenePrompts` with the channel's **style** text only (NIYT's for the Mary Celeste cards; the neutral look has none) and **no channel negative**. The platform safety clause (no logos or trademarks, no photorealistic depiction of an identifiable real person) and the no-marks clause stay on. E's original was a ceiling render, so its face version uses the plain neutral look like B and C; the pair still differs only by the face concept.
- Six images at the pipeline's `low` quality, $0.0070 to $0.0081 each. Round 2 spend **$0.1163** (concept calls, images and face checks) against its **$1.00** cap; whole spike $0.7568 of $3.00.

**Sheet and key.** `task1-spike-assets/sheet2/` (`M.jpg` to `X.jpg`, `contact-sheet.png`, `contact-sheet.html`, `ratings.csv`). Seed 20261026. The key is separate and not on the sheet: `after-rating/round2/KEY-round2.csv` and `key-round2.json`, plus `round2.json` (revised concepts, prompts, costs, face checks).

| Label | Card | Face? | | Label | Card | Face? |
|---|---|---|---|---|---|---|
| M | J (lego) | new | | S | L (mary-celeste) | new |
| N | J (lego) | original | | T | G (mary-celeste) | new |
| O | L (mary-celeste) | original | | U | E (eiffel) | new |
| P | B (eiffel) | new | | V | E (eiffel) | original (ceiling) |
| Q | B (eiffel) | original | | W | C (eiffel) | new |
| R | C (eiffel) | original | | X | G (mary-celeste) | original |

**Uncanny faces at feed and sidebar size (a defect check, not a rating).** I looked at all six at full size and at feed (360 px) and sidebar (170 px) size side by side, and ran a Haiku defect check on the feed and sidebar images.

- **No uncanny face at feed or sidebar size on any of the six**, by my reading and by the check: no melted or lopsided eyes, no waxy skin, no bad teeth seen. At 170 px the faces are small but still read as faces.
- Hands that appear (B, C, G, J, L) look normal at full size. I did not count fingers card by card.
- C (the riveter) is the weakest face test: his face is small and turned to his work, and the check said no clear face was visible. The other five have a clear, large face.
- The NIYT style text still says faces should be "small, in shadow or turned away", yet with the negative left out the faces on G and L came out large and well lit. The face sentence outweighed the style line; worth knowing if a channel's style text is to be respected for people.
- Defects that are not face defects: the Lego bricks on M glow as if lit from inside; and **S (Mary Celeste "no warm meal") still shows the unsupported child's toy**, because the revision kept the toy from the first concept. That was flagged in section 7 and now sits on a card the founder will rate; the scene-versus-script check in section 9 would catch it.
- I cannot verify that no face resembles a real person; the prompts name no one. The Eiffel "lab" man (U) is a bearded engineer with a sextant, the same shape as in round 1. The founder judges likeness.

**Decision.** Not made here. After "rated 2" this section gets the founder's notes, and section 9's face line is finalised against them.

## 9. S7. Recommendation (final for round 1; face decision after round 2)

**Go: build Task 1 as designed**, with these changes. They come from the founder's notes (section 8) and from what broke (sections 4 and 7):

1. **Start from belief versus record.** Task 1's curiosity brief begins by looking for the popular belief and what the script's record shows, and builds the question from that contrast. B works because the threat and the record are the question.
2. **A "name the one thing you look at" check.** Every concept must name one dominant thing a viewer looks at (ideally a person looking at the thing under threat). G, K and L fail it ("nothing to look at", "plain"); B passes.
3. **A picture-title match check.** A separate call asks whether the picture shows what the title promises, and rejects the package if not (E and I fail it).
4. **A pairwise compare against the best candidate**, not an absolute score. The critic said yes to 9 of 12 cards and could not tell B from G; comparing each candidate head to head with the current best forces a choice.
5. **The title must withhold the answer.** B's title opens a question; E and I's title gives away the rescue.
6. **Code checks, not trust:** length and word limits and badge words (the model broke its own limits in 2 of 18 packages); the hedge and figure check on title and lettering (a dropped "roughly", a dropped "by sales"); and a scene-versus-script check on every object and person (the invented toy and the contradicting boat).
7. **Stills stay at the pipeline's `low`** ($0.0065 per image); the quality probe does not justify medium or high.
8. **Concept fields carry the quality** (one dominant subject, a scale contrast, a named light direction, a calm lettering zone), not a generic "richer" sentence or the channel look text.
9. **Face decision:** open until the founder rates round 2 (section 8a).

**Decision rule, as used.** The first draft's rule needed numeric ratings; the founder gave notes instead and decided go. Nothing here changes the model: the strongest cards are as rich as the pipeline needs, and the weak cards were weak for concept reasons. No other image model was tested, so "change the model" has no evidence either way.

## 10. Inputs Task 1 needs

**Prompt skeleton (concept fields to image prompt)**, from `prompts.ts` `conceptScene`, then the pipeline's own `buildStyledScenePrompts` adds `Style:` and `Avoid:`:

```
Wide 16:9 thumbnail image of one dominant subject: {subject}. {gazeOrGesture}. Scale: {scale}. {threatOrMystery}.
Light: {light}. Composition: {foreground / middle / background, calm zone}. Keep every important element inside the
central horizontal band, and keep the {top|bottom|left side|right side} calm, simple and darker so lettering can be
added later.   +  "Style: {profile stylePrompt}"  +  "Avoid: {profile negativePrompt}; {safety clause?}; {no-marks clause}"
```

Generate at 1536x1024 and centre-crop to 16:9. **Packages prompt** (`PACKAGES_SYSTEM` in `prompts.ts`): the seven-device grammar, honest-curiosity rules, "supportQuote", per-package `deviceNote`, zone for lettering. **Font set:** Anton, Playfair Display Black, Cinzel Black (OFL 1.1). **Critic prompts:** `COLD_READER_SYSTEM` (title and lettering only; rank six) and `CRITIC_SYSTEM` plus `criticUser` (thumbnail plus tiny version; about, expects, wants to know, would click, why not, disappointment, words readable at 170 px). The absolute-score critic is replaced in the design by the pairwise compare, the one-thing check and the picture-title check in section 9.

## 11. Testing

```
cd studio
npx tsx scripts/spikes/packaging/spike.ts                       # stub: no provider calls, no spend (run twice from an empty out/stub; both: stages ok, $0.0000)
npx tsx scripts/spikes/packaging/spike.ts --live --stages scripts,packages,prune
npx tsx scripts/spikes/packaging/spike.ts --live --stages render
npx tsx scripts/spikes/packaging/spike.ts --live --stages letter,critic,sheet --publish
npx tsx scripts/spikes/packaging/spike.ts --live --stages probe --qualities medium,high
npx tsx scripts/spikes/packaging/spike.ts --stages round2       # stub round 2, no spend
npx tsx scripts/spikes/packaging/spike.ts --live --stages round2 --publish2   # round 2 live, cap $1.00
npx tsc --noEmit -p tsconfig.json                               # clean
npx eslint scripts/spikes/packaging                             # clean
npx tsx scripts/spikes/packaging/s0-inspect.ts                  # read-only dev DB facts for S0
```

The spike installs its own dependencies in `studio/scripts/spikes/packaging/package.json` (`@napi-rs/canvas`, three `@fontsource` packages); `studio/package.json` is untouched. Ledger refuses a paid step that could cross $3.00; it was never close.

## 12. Deviations from spec

- Scripts: two are generated from fixture briefs, not approved (your decision); one is Gate-1-approved on a test channel.
- Looks: only NIYT had profile text; two channels share the neutral look (your decision).
- Cost "recorded" in the spike's ledger and `llm-calls.json`, not `usage_events` (no pipeline run).
- Ceiling renders use the pipeline's `low`; the quality question is the separate 6-image probe, which calls the image endpoint directly (spike only; the product client fixes quality).
- The NIYT `script.guide` was not passed to script generation; scripts are for packaging, not for publishing.
- One discarded critic pass ($0.0356) after changing the subline size.
- Round 2 follows the founder's brief of 2026-10-25 (face test, $1.00 more, whole spike still $3.00). Its image file names briefly contained a colon (a Windows alternate-data-stream slip); fixed and re-run from the cache with no new spend.
- Mary Celeste script is 1662 words against 1500 (flagged by the generator itself); irrelevant to thumbnails.

## 13. Hard rule 5 and 6 record

Task doc identical to the source at every commit (checked with `diff` before each one). Before marking ready, in my own worktree: `git fetch origin`, `git pull origin main` returned "Already up to date" (main was still at the branch point `1533d40`), so no conflicts to resolve; typecheck and eslint on the spike folder re-run clean; branch pushed. Docs scope, `git diff --name-only origin/main...HEAD -- docs/`: this task's doc (identical to the source), this report, and 83 files under `task1-spike-assets/`; nothing else. Outside `docs/`, only `studio/scripts/spikes/packaging/`. Hard rule 9 does not apply (no bug fixed).

## 14. Sign-Off

- Task Objective: Met; round 1 rated, round 2 (faces) waits for "rated 2", then the clean-up of `after-rating/cards/` and `quality-probe*` (kept: sheets, keys, JSON)
- Schema Impact: None
- Business Logic: No new control flow in the product
- Tests: Stub twice, live once; typecheck and lint clean
- Ready for Integration: Yes (no product code)
