# 7AI Channel Portfolio: Competitor Analysis & Strategy (v1)

**Date:** 2026-09-25 · **Status:** v1.2, Wave 1 re-ranked after content analysis 2026-09-25 · **Owner:** Neeraj
**Purpose:** Decide which 7 channels 7AI should run, who they compete with, and what the pipeline has to do differently for each.

> **Data caveat:** Subscriber counts below come from third-party blogs (dated in the Sources section). Treat them as directional. Before any number drives a decision, re-pull it with YouTube Data API `channels.list`. That is the first real job for the Video Intelligence agent in `competitor` mode.

---

## 1. Three findings that change the plan

### 1.1 The biggest risk is policy, not competitors
- In July 2025 YouTube renamed "repetitious content" to **"inauthentic content"**. In January 2026 it terminated or wiped 16 AI-driven channels with about 35M subscribers and about 4.7B views between them. The hit categories were **templated animated stories, serialized AI-narrated stories, and AI compilations**.
- Enforcement is **per channel**. One misjudged pattern can demonetize a channel's whole catalog.
- YouTube says it does **not** penalize *labeled* AI content. What it targets is "mass-produced, templated content with no human creative input."
- **Implication for 7AI:** seven channels fed by one pipeline, with shared templates, a shared TTS voice, and a steady upload cadence, is the exact pattern the enforcement looks for. Each channel needs its own identity. Every video needs a recorded human editorial decision. See §5.

### 1.2 Shorts ad revenue alone won't fund this
- Reported Shorts RPM: **US ~$0.18–0.30 per 1K views; India ~$0.02–0.05 per 1K** (FluxNote, 2026).
- 10M monthly views comes to roughly $1,800–3,000 on a US-heavy audience, or $200–500 on an India-heavy one.
- **Implication:** Shorts are the top of the funnel. Each channel should have a planned second revenue layer (long-form compilations, affiliates, digital products), or the unit economics won't cover API and generation costs.

### 1.3 Narrative formats beat list and quote formats
Figures below come from an industry analysis of 500 viral faceless videos (Virvid, 2026). It's directional, not rigorous.

| Format | Avg retention | Verdict |
|---|---|---|
| Narrative psychology | 68–78% | ✅ Strong |
| Story-driven / dark history | 65–75% | ✅ Strong |
| True crime / mysteries | 70–82% | ✅ Strong, but legal risk |
| "What if" scenarios | 62–73% | ✅ Strong, fast to 1K subs |
| Generic lists | 35–48% | ⚠️ Weak |
| Motivation quotes | 28–42% | ❌ Avoid |
| Celebrity gossip | Among the worst performers | ❌ Avoid |

**Rule for Script Generation:** every Short is a **story with an open loop**: hook in the first 3 seconds, tension, payoff. Never a quote over stock footage.

---

## 2. Market recommendation

**Run a split portfolio: English (global) as the core, plus Hindi where India has a clear content advantage.**

- **English:** 5–10x the RPM. Needed for anything educational (psychology, history, money).
- **Hindi:** Shorts RPM is very low, but the reach is huge and some niches are culturally Indian (village and folk horror, mythology), where AI-template English channels can't compete. Treat Hindi channels as audience-building assets rather than revenue drivers in year 1.
- **Also:** 7AI's ideal first tenant is itself. English and Hindi channels test the multi-language path in the pipeline early.

---

## 3. Recommended 7-channel portfolio

> **Decision (2026-09-25):** Celebrity news is **dropped**. **Wave 1, in priority order = (1) Dark/Untold History, (2) Money & Business Stories, (3) Human Mind & Body Curiosities** (Psychology, reframed), all in English. This order was re-ranked after `WAVE1_CONTENT_ANALYSIS.md`. Wave 1 is chosen for fit with the 7AI pipeline and for monetization. The Hindi pipeline path is deliberately deferred to a later wave.

| # | Channel concept | Lang | Source | Launch wave |
|---|---|---|---|---|
| 1 | **Human Mind & Body Curiosities** (was Psychology & Philosophy): "why humans…", "what it feels like…" | EN | Yours (reframed) | **Wave 1 (#3)** |
| 2 | **Money & Business Stories**: underdog-vs-giant, origin stories, cost breakdowns | EN | Proposed (replaces celebrity) | **Wave 1 (#2)** |
| 3 | **Dark / Untold History**: famous figure/event + dark angle | EN | Yours | **Wave 1 (#1)** |
| 4 | **Horror**: Indian folk, village, and highway horror | HI | Yours | Wave 2 |
| 5 | **Indian Mythology & Itihas**: story-driven, character-focused | HI | Proposed | Wave 2 |
| 6 | **What If / Curiosity**: animated "what would happen if…" science | EN | Proposed | Wave 3 (needs stronger video generation) |
| 7 | **Self-Improvement**: evidence-backed habits, framed as mini-stories | EN | Yours | Wave 3 |

### Why these three for Wave 1 (re-ranked 2026-09-25, see `WAVE1_CONTENT_ANALYSIS.md`)
- **#1 History:** the strongest faceless proof. realhistorydude has 107K subscribers but a 1.9M median, with a visual and hook template 7AI can reproduce.
- **#2 Money:** proven story structures, the highest ad rates, and YouTube Shopping affiliate income. ⚠️ The proven faceless winners are Hindi-narrated, so English faceless is untested. Kill/pivot rule after 30 Shorts.
- **#3 Mind & Body:** "psychology facts" lists are dead (median views 150–5K). The channel is reframed as curiosity stories (thefossilfacts, SwishMic formats). Highest execution risk.
- **Not Wave 1:** Hindi Horror (India Shorts RPM is 5–10x lower, and templated animated stories were the category YouTube removed in its January shutdowns). What If (needs 3D-quality visuals the MVP can't produce yet).

### Why celebrity news was dropped (decided 2026-09-25)
1. **Rights.** Real clips and photos draw Content ID claims and DMCA strikes. Fair use rarely survives on compilation-style entertainment content.
2. **Likeness.** Since April 2026, YouTube's likeness detection covers celebrities through CAA, UTA, WME, and other agencies. AI-generated celebrity faces can be removed on privacy grounds.
3. **India law.** The IT Amendment Rules 2026 (in force Feb 20, 2026) require AI-content declaration and 3-hour takedowns of unlawful content. Gossip plus synthetic media sits right in that zone, and defamation risk comes on top.
4. **Fit.** News decays in hours. 7AI's trend cadence is batch (2–6h), and the data shows celebrity gossip has the weakest monetization.

Evergreen "rise and fall of famous people" stories (illustrated, no clips, no AI likenesses, public-record facts only) can live inside the Money & Business channel.

### Why launch in waves, not all 7 at once
- The Oct 15 MVP runs the pipeline end to end for the first time. Scaling a pipeline that hasn't been validated to 7 channels multiplies every bug by 7.
- Seven new channels going live on the same day from the same pipeline is a strong inauthentic-content signal.
- The Continuous Learning agent needs a clean comparison. Three distinct channels give three independent signals.
- **Gate from one wave to the next:** a channel moves on only when it has 30+ Shorts published, 2+ formats tested, and at least one format holding above 60% average viewed.

---

## 4. Per-niche competitor breakdown

### 4.1 Psychology & Philosophy (EN)
| Competitor | Size (reported) | Format | What to learn |
|---|---|---|---|
| Pursuit of Wonder | ~3.4M | Simple animation + calm narration, long-form | Applies philosophy to modern problems; saturated at the top |
| Psych2Go | Multi-million (verify) | Cute 2D animation, "signs you…" | Relatable second-person framing |
| Lazy Owl | ~311K | Animated philosophical short films | Story > lecture |
| What's The Next Level | ~56K | Stick-figure animation | A distinct, cheap visual identity cuts through AI sameness |
| Mr No Plan A | ~72K | Black screen + text, short | Proves minimal visuals work *if* the script is sharp; also a saturated style |

- **Gap:** specific psychological profiles and named effects (e.g. "the Zeigarnik effect is why you can't sleep"). These are under-served, high-intent topics.
- **Avoid:** "dark psychology / manipulation tactics." It is saturated, and a responsible channel shouldn't be building that brand.
- **Pipeline note:** pick one ownable visual style for this channel (e.g. a consistent illustrated character) and keep it locked. Don't mix stock footage into it.

### 4.2 Horror (HI)
| Competitor | Format | What to learn |
|---|---|---|
| HORROR PODCAST – Hindi Horror Stories | Narrated audio-first stories | Voice and atmosphere carry the whole thing |
| Hindi Horror Stories (several channels) | Animated/illustrated narration | Village, haveli, and highway settings recur |
| Llama Arts / animated "true horror" (EN reference) | Animated first-person stories | "This happened to me" framing drives retention |

- **Gap:** most Hindi horror is long-form. A tight 45–60s story ending on an open loop ("Part 2") is a proven Shorts mechanic that few Hindi channels run well.
- **Pipeline note:** the voice is the product here. Invest in one strong, consistent Hindi narrator voice and a sound-design layer. Keep visuals dark and illustrated. Avoid gore (advertiser-friendliness).

### 4.3 Dark / Untold History (EN)
| Competitor | Size (reported) | Format | What to learn |
|---|---|---|---|
| Weird History | ~4.7M | Listicles of strange events | Proves demand for "weird" history, but the list format is weaker on Shorts |
| Chat History | ~927K | Narration over archival imagery | Dark/weird angle; archival imagery is often public domain |
| Yarnhub | ~2.8M | Cinematic 2D animation | Single-event dramatization |
| The Infographics Show | ~14–15M | Fast kinetic 2D graphics | Pace and constant visual change |
| The Crusader | Shorts | Text overlay on movie clips | ⚠️ Anti-pattern: movie clips carry high strike risk |

- **Saturated:** WWII, generic ancient civilizations, "weird history" lists.
- **Gap:** non-Western and regional history, psychology of historical figures, economic and crime history. Use "Why did X do Y?" hooks.
- **Pipeline note:** public-domain archival images (Archive.org, Wikimedia) plus AI illustration, with a fact-check step in Script Review. History channels die on factual errors in the comments.

### 4.4 What If / Curiosity (EN)
| Competitor | Size (reported) | Format | What to learn |
|---|---|---|---|
| Zack D. Films | ~27.6M | 3D-animated curiosity Shorts under 60s | One irresistible question, answered fast. The benchmark format. |
| What If | Large | Animated hypotheticals | Scenario escalation |

- **Why propose it:** the fastest reported time to 1K subscribers, 80%+ completion when the hook lands, and globally evergreen.
- **Risk:** the look is heavily copied. Be distinctive through a signature art style and a recurring narrator persona, not by cloning the Zack D. look.

### 4.5 Indian Mythology & Itihas (HI)
- **Competitors:** not researched yet. The Trend agent's first discovery run should seed this list.
- **Why propose it:** huge evergreen Indian demand, character-driven stories (retention), no clip-rights problem, and a natural companion audience to Hindi horror.
- **Risk:** religious sensitivity. Script Review needs a specific rubric: no mocking and no contested reinterpretations, and sources must be cited (e.g. which Purana).

### 4.6 Money & Business Stories (EN)
| Competitor | Format | What to learn |
|---|---|---|
| MagnatesMedia, Company Man, Modern MBA | Long-form narrated business docs | "Rise and fall" narrative structure |
| ColdFusion, How Money Works | B-roll + calm narration | Investigative tone |

- **Why propose it:** the highest-CPM category (finance/business), it converts well to long-form and affiliates, and it absorbs the safe version of "celebrity" stories.
- **Gap:** most of these channels are long-form. A 50s Shorts spin-off ("How one decision killed Blockbuster") has fewer strong players.

### 4.7 Self-Improvement (EN)
- **Competitors:** Daily Stoic (human-led, strong brand), Mr No Plan A, and countless quote-over-footage channels.
- **Verdict:** the most saturated niche and the worst-retaining format (motivation quotes, 28–42%). That's why it's Wave 3.
- **How to make it work:** each Short = one study or technique + a 3-step mini-story ("She tried X for 30 days…"). Never quotes.

---

## 5. What this means for the 7AI pipeline

| Requirement | Agent / component | Why |
|---|---|---|
| **Channel Bible per channel** (voice, visual style, series formats, banned patterns) | New config entity, read by Script Gen, Video Gen, and Review | Stops 7 channels converging on one template, the main enforcement trigger |
| **Recorded human editorial decision per video** (who approved, what changed) | Orchestrator approval gate | Evidence of "human creative input" if a channel gets flagged |
| **AI disclosure flag set by default** on synthetic visuals and voices | Publishing agent | YouTube doesn't penalize labeled AI; India's rules require declaration |
| **Asset rights ledger** (source + license per image, clip, and track) | Video Generation | Avoids strikes; blocks movie/TV clips outright |
| **Fact-check step** for history, mythology, and money | Script Review | These niches get punished for errors |
| **Staggered, non-uniform publishing** across channels | Publishing / Orchestrator | Avoids a synchronized "content farm" footprint |
| **Competitor watchlist per channel** (seeded from §4) | Video Intelligence (`competitor` mode) | Replaces blog numbers with live API data |

---

## 6. Next steps
1. ~~Decide the 7-channel list and the celebrity question~~ ✅ Done 2026-09-25
2. ✅ Done 2026-09-25. **Competitor content analysis for Wave 1** (before any style guide): top-performing Shorts per competitor, covering hooks, length, title patterns, visual style, pacing, and cadence. Output: `competitor_analysis/WAVE1_CONTENT_ANALYSIS.md`
3. **Channel Bibles:** write one for each Wave 1 channel, derived from step 2, in the order History → Money → Mind & Body.
4. **Format tests:** 2–3 series formats per channel for the first 30 Shorts.

---

## Sources
- [YouTube's AI slop purge – The Next Web](https://thenextweb.com/news/youtube-ai-slop-crackdown-faceless-creators-collateral-damage)
- [YouTube AI Slop Crackdown 2026 – OutlierKit](https://outlierkit.com/resources/youtube-ai-slop-crackdown-2026/)
- [Faceless YouTube Growth Strategy 2026 – OutlierKit](https://outlierkit.com/resources/faceless-youtube-growth-strategy/)
- [YouTube Shorts India vs US 2026 – FluxNote](https://fluxnote.io/guides/youtube-shorts-revenue-india-vs-us-2026)
- [YouTube Shorts RPM 2026 – Miraflow](https://miraflow.ai/blog/youtube-shorts-rpm-2026-real-ranges-by-niche)
- [Best AI Niches for Faceless Channels (500 viral videos) – Virvid](https://virvid.ai/blog/best-ai-niches-faceless-channels-2026)
- [Faceless Psychology Channels 2026 – Autonolab](https://blog.autonolab.com/niches/2026-01-23-faceless-youtube-psychology/)
- [Faceless History Channels 2026 – Autonolab](https://blog.autonolab.com/niches/2025-12-10-faceless-youtube-history/)
- [Top Faceless YouTube Channels 2026 – faceless.my](https://faceless.my/youtube/top-faceless-youtube-channels/)
- [YouTube Copyright Mistakes for Faceless Creators – Virvid](https://virvid.ai/blog/youtube-copyright-mistakes-faceless-creators-2026)
- [YouTube expands likeness detection to celebrities – TechCrunch, Apr 2026](https://techcrunch.com/2026/04/21/youtube-expands-its-ai-likeness-detection-technology-to-celebrities/)
- [India AI labelling & 3-hour takedown – HLC](https://www.hlc.com/en/publications/india-introduces-mandatory-labelling-for-ai-and-3hour-takedown-for-illegal-content)
- [Hindi Horror Stories channel – vidIQ](https://vidiq.com/youtube-stats/channel/UC2LZSB4R7Gzlhnql7lkQkRg/)
