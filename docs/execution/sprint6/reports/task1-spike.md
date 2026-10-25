# Sprint 6 Task 1 Spike: packaging quality test

**Date**: 2026-10-25
**Status**: Complete, except the founder's blind ratings (section 8). The recommendation in section 9 is provisional until they are in.
**Branch / worktree / PR**: `SPRINT6_TASK1_SPIKE` · `D:\Study Material\7AI-SPRINT6\spike1` · [PR #117](https://github.com/Neeraj1002/7AI/pull/117)
**Task doc**: committed alone in `05d91a9` (`SPRINT6_TASK1_SPIKE_DOC: add task doc`), byte-identical to the source (r1); revisions picked up: none
**Files Created**: 107 (1 task doc, 22 spike files under `studio/scripts/spikes/packaging/`, 83 asset files, this report) · **Files Modified**: 0 (nothing in `studio/src`, `app/` or any other doc)
**Tests**: no product tests touched. Stub run twice from a clean `out/`, no spend; one live run; typecheck and eslint clean on the spike folder (section 11).
**Spend**: **$0.6405 of the $3.00 ceiling** (section 5).

> **Founder: rate first, read after.** Open only `task1-spike-assets/sheet/` (`contact-sheet.html` or `contact-sheet.png`, then fill `ratings.csv`). Everything that names a card's concept, device, look or font is in this report and in `after-rating/`.

## 1. Answer in four lines

1. Our current generator **can** produce rich, clean 16:9 thumbnails on our own content. When the concept has one big subject, a scale contrast and strong light, the cards look like key art (Lego brick and child, Eiffel riveters, Eiffel lab). I read the richness from the 12 cards; whether it matches your references is your rating, not mine.
2. The weak card is weak because of the **concept** (a ship at 10% of the frame), not the model: the same model at medium and high quality, and a richer ceiling prompt, barely changed it.
3. What broke is **honesty and limits**, not pictures: invented objects, a hedge dropped from a figure, an image contradicting its own words, and the model breaking its own length rules in 2 of 18 packages. Task 1's checks need to be code, not trust.
4. Provisional recommendation: **go** (build Task 1 as designed) with the changes in section 9; no model change is indicated by this evidence, and no other image model was tested.

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
| **Total** | **$0.6405 of $3.00** (about $0.44 without the probe and the discarded critic pass) |

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

## 8. S6. Blind sheet and what the critic said vs what you rate

Sheet: `task1-spike-assets/sheet/` (`contact-sheet.html`, `contact-sheet.png`, `A.jpg` to `L.jpg`, `ratings.csv`). Order shuffled with seed 20261025; key in `after-rating/KEY.csv`. Three concepts appear twice by design (channel-look and ceiling, same title): A/F, E/I, G/K, so you can compare them directly.

| Label | Card | Look | Device | Font | Critic: click | Critic: tiny words read | **Founder: click (1-5)** | **Founder: richness (1-5)** |
|---|---|---|---|---|---|---|---|---|
| A | lego-4 | ceiling | scale/stake | Anton | maybe | yes | _to fill_ | _to fill_ |
| B | eiffel-p1 | neutral | stake/countdown | Playfair | yes | yes | _to fill_ | _to fill_ |
| C | eiffel-p3 | neutral | scale/how | Anton | yes | yes | _to fill_ | _to fill_ |
| D | mary-p6 | NIYT | mystery | Cinzel | yes | yes | _to fill_ | _to fill_ |
| E | eiffel-p2 | ceiling | how/stake | Cinzel | yes | yes | _to fill_ | _to fill_ |
| F | lego-4 | neutral | scale/stake | Anton | maybe | yes | _to fill_ | _to fill_ |
| G | mary-p1 | NIYT | mystery/scale | Playfair | yes | yes | _to fill_ | _to fill_ |
| H | lego-1 | neutral | stake/countdown | Cinzel | yes | yes | _to fill_ | _to fill_ |
| I | eiffel-p2 | neutral | how/stake | Cinzel | yes | yes | _to fill_ | _to fill_ |
| J | lego-5 | neutral | how/countdown | Playfair | maybe | yes | _to fill_ | _to fill_ |
| K | mary-p1 | ceiling | mystery/scale | Playfair | yes | yes | _to fill_ | _to fill_ |
| L | mary-p3 | NIYT | correction | Anton | yes | yes | _to fill_ | _to fill_ |

Not guessed: the two founder columns stay empty until you rate. A is the Lego ceiling card.

## 9. S7. Recommendation (provisional) and decision rule

**Go: build Task 1 as designed**, with these changes to its design, all supported by what broke above:

1. A **code validator** on every package (title length, 4-word and 5-word lettering limits, badge words) with one repair call; the model broke its own limits in 2 of 18.
2. A **scene honesty check** that compares each object and person in the concept to the script, not just the supporting quote (the invented toy and the contradicting boat).
3. **Hedge and figure check** applied to title and lettering with the same rule as the script check.
4. Keep stills at the pipeline's `low`. Offer `medium` ($0.012) for the one chosen thumbnail only if you rate the probe worth it.
5. Spend your concept effort on the **concept fields** (one dominant subject, a scale contrast, a named light direction, a calm lettering zone), not on a generic "make it richer" sentence.
6. Make the critic harder (below) before trusting it as a gate.

**What your ratings change:** if the mean "as rich as my references" is below 3 on both channel-look and ceiling cards, the generator is the limit and the next step is to test other image models (none tested here); if ceiling cards beat channel-look cards by about one point, change the prompting for thumbnails (loosen the channel style text for packaging); if both are 3.5 or more, go as above.

## 10. Inputs Task 1 needs

**Prompt skeleton (concept fields to image prompt)**, from `prompts.ts` `conceptScene`, then the pipeline's own `buildStyledScenePrompts` adds `Style:` and `Avoid:`:

```
Wide 16:9 thumbnail image of one dominant subject: {subject}. {gazeOrGesture}. Scale: {scale}. {threatOrMystery}.
Light: {light}. Composition: {foreground / middle / background, calm zone}. Keep every important element inside the
central horizontal band, and keep the {top|bottom|left side|right side} calm, simple and darker so lettering can be
added later.   +  "Style: {profile stylePrompt}"  +  "Avoid: {profile negativePrompt}; {safety clause?}; {no-marks clause}"
```

Generate at 1536x1024 and centre-crop to 16:9. **Packages prompt** (`PACKAGES_SYSTEM` in `prompts.ts`): the seven-device grammar, honest-curiosity rules, "supportQuote", per-package `deviceNote`, zone for lettering. **Font set:** Anton, Playfair Display Black, Cinzel Black (OFL 1.1). **Critic prompts:** `COLD_READER_SYSTEM` (title and lettering only; rank six) and `CRITIC_SYSTEM` plus `criticUser` (thumbnail plus tiny version; about, expects, wants to know, would click, why not, disappointment, words readable at 170 px). To harden: force a 1-to-5 score, require one reason to scroll past, and compare with your ratings.

## 11. Testing

```
cd studio
npx tsx scripts/spikes/packaging/spike.ts                       # stub: no provider calls, no spend (run twice from an empty out/stub; both: stages ok, $0.0000)
npx tsx scripts/spikes/packaging/spike.ts --live --stages scripts,packages,prune
npx tsx scripts/spikes/packaging/spike.ts --live --stages render
npx tsx scripts/spikes/packaging/spike.ts --live --stages letter,critic,sheet --publish
npx tsx scripts/spikes/packaging/spike.ts --live --stages probe --qualities medium,high
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
- Mary Celeste script is 1662 words against 1500 (flagged by the generator itself); irrelevant to thumbnails.

## 13. Hard rule 5 and 6 record

Task doc identical to the source at every commit. Pulled `origin/main` before marking ready (`git fetch origin`, `git pull origin main`); result and the `git diff --name-only origin/main...HEAD -- docs/` listing are recorded in the PR description when I mark it ready. Hard rule 9 does not apply (no bug fixed).

## 14. Sign-Off

- Task Objective: Met, pending your ratings
- Schema Impact: None
- Business Logic: No new control flow in the product
- Tests: Stub twice, live once; typecheck and lint clean
- Ready for Integration: Yes (no product code)
