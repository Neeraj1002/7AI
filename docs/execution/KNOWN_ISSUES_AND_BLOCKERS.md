# Known Issues & Blockers Tracker

**Purpose**: one place to check instead of re-reading every week's reports/summaries. Covers everything flagged across Weeks 1–3 (all complete) as of this doc's last update. Week 4 has task docs written but **zero reports exist yet — not started**.

**Last updated**: 2026-09-08, after Week 3 close-out (Task 5) and Week 1's `BUSINESS_LOGIC.md`/`AGENT_FLEET_DESIGN.md` doc-reconciliation pass.

**How to keep this current**: whenever a new week closes out, or an item below gets resolved, update this file — don't just fix the thing and let this doc go stale. Each item cites its source report so you can go deeper if needed.

---

## 1. Founder action required (external, blocking)

| Item | Status | Why it matters | Source |
|---|---|---|---|
| **YouTube OAuth + quota submission** | Still open — Google Cloud Console steps (project, consent screen, OAuth client, quota increase request) never done. Approval has historically taken 1–2 weeks. | **Hard blocker for Week 4 Task 1 (Publishing)** — without it, the first real end-to-end dry run (brief → published-private video) can't happen for real; Publishing runs against a stub `youtubeVideoId` instead. | `week1/reports/task7.md`, carried in every subsequent week's STATUS.md |
| **Live Gate 1 human-reply round trip** | Still open as of Week 3's close — confirmed explicitly unchanged in `week3/reports/task5.md` ("checked and confirmed still open... every Gate 1/Gate 2 test this week continued to use a simulated reply"). All three reply outcomes (approve/reject/edit) are proven via simulated Telegram updates, never an actual phone tap. | Low urgency — the mechanism is proven — but it's the one criterion nobody has actually closed by doing it for real. Worth 60 seconds whenever you're on Telegram: run any brief to `paused_gate1` and reply for real. | `week2/reports/task6.md`, `week3/reports/task5.md` |
| **Real `OPENAI_API_KEY`** | Not in `.env.local`. All of Week 3's TTS/transcription runs against `MEDIA_STUB=1` — a synthesized tone clip standing in for real speech, fabricated word timings from a text sidecar instead of real ASR. | Blocks closing Week 3 Task 1/2's "real smoke call succeeds" acceptance criteria, and means **no real audio has ever been produced** — everything watched/reviewed so far is placeholder audio. Also blocks a genuinely real Week 4 dry run alongside the YouTube key above. | `week3/reports/task1.md`, `task2.md` |

---

## 2. Known implementation gaps / tech debt (code-level, no founder action needed)

- **`completeStage`/`currentStage` write race** — a stage's completion and the pipeline's advance to the next stage are two separate database writes, not one transaction, despite Week 1's `BUSINESS_LOGIC.md` describing it as atomic. A crash between the two writes could leave `currentStage` one step behind. Flagged Week 2 Task 7, **not fixed as of Week 3 close**. Now noted directly in `week1/BUSINESS_LOGIC.md` Section 1 so the doc doesn't overstate the guarantee. Low probability today; worth a real fix (transaction-aware repository writes) before stage count/call volume grows further. — *`week2/reports/task7.md`*

- **`resume()` sweeps every stale `running` run, not just the intended target** — by design (that's what resumability means), but it's bitten real testing twice now: Week 2 Task 7 incurred ~$0.03 of incidental spend resuming leftover test runs, and Week 3 Task 5 hit a "wider blast radius" recurrence that had to be worked around by manually closing out unrelated stale runs first. **Explicitly carried into Week 4 as something needing a deliberate decision** before a `publishing` resumer gets wired in — right now nothing distinguishes "genuinely stuck mid-stage" from "deliberately waiting at a frontier stage that just doesn't have a processor yet" (e.g., an approved run sitting at `currentStage='publishing'` before Week 4 exists gets treated as stale). — *`week2/reports/task7.md`, `week3/reports/task5.md`, `week3/STATUS.md`*

- **Intake-parsing is on the wrong model tier** — `AGENT_FLEET_DESIGN.md` Section 8.1 classifies extraction tasks as cheap/fast, but `intake-parsing`'s registry entry still resolves to premium `claude-sonnet-5`, inherited from Week 1's original default and never a deliberate choice. Low cost impact today (one small call per run), flagged for whoever picks up model-tiering work. — *`week2/reports/task3.md`, now noted in `AGENT_FLEET_DESIGN.md` 8.1*

- **No automated test runner exists anywhere in the project.** Every verification across all three weeks has been live/manual (real calls, direct DB queries, `ffprobe`, etc.) — genuinely rigorous, but there is no regression suite. Flagged as worth deciding in Week 1's summary ("early in Week 2"), never actually set up. Worth a real decision before more business logic accumulates.

- **`pipeline_runs.retryCount` is dead schema** — the column exists but nothing has ever written to it, across all three weeks. Flagged Week 1, never revisited.

- **Video Intelligence's multimodal call isn't wrapped in retry-with-backoff** — every other LLM call site uses `withRetryAndCircuitBreaker`; `runVideoReviewStage` doesn't, because the deterministic-check path returns normally rather than throwing, which doesn't compose cleanly with the retry wrapper's assumptions. A transient LLM failure during video review currently routes straight to `needs_attention` instead of retrying. Flagged as a real gap, not fixed. — *`week3/reports/task3.md`*

- **No lint rule enforces the "only `client.ts`/`registry.ts` are imported directly" boundary** in either `studio/src/llm/` or `studio/src/media/` — held by convention and manual grep-checks only so far, correctly followed each time but not mechanically enforced. — *`week2/reports/task1.md`*

- **7-channel cap has no automated test** — verified by code review and live exercise, never by a dedicated "create 7, assert the 8th throws" test. Same root cause as the missing test runner above. — *`week1/reports/task3.md`*

---

## 3. Real design findings worth a decision (not bugs — open questions surfaced by live testing)

- **Video Generation's caption style fights Video Intelligence's frame-sampling.** Video Generation burns one-word "flashing" captions; Video Intelligence's own-draft review extracts a single frame at the video's midpoint to hand to the multimodal check. Combined, the extracted frame usually shows a partial caption word, not representative content — a real Week 3 test genuinely tripped the regen circuit breaker three times in a row over exactly this, even though the underlying video was otherwise fine (a separate organic run did pass normally, so it's not a guaranteed failure, just a real recurring risk). Nobody has decided whether to fix this in Video Generation (different caption style, or a caption-free moment to sample from) or Video Intelligence (multi-frame sampling instead of one midpoint frame). Worth resolving before this channel runs unattended — right now a real video could burn real regen attempts (and real spend) on a presentation artifact rather than an actual quality problem. — *`week3/reports/task3.md`*

- **Script Review has no factual-accuracy check.** The rubric covers quality/engagement/clarity/brand/video-gen-fit, not truth. Surfaced by a real script about hummingbird flight biomechanics that happened to hold up under manual inspection — nothing in the pipeline would have caught it if it hadn't. Already logged as an open question in `AGENT_FLEET_DESIGN.md` Section 4.5 (added this session); still undecided whether it becomes a rubric addition or stays your manual responsibility at the gates.

- **Pooled per-platform budget has no fair-access policy across channels.** Fine with one channel; the moment channel #2 goes live (Week 5+), one channel could exhaust the shared ceiling before the others ever get scheduled. Flagged in `AGENT_FLEET_DESIGN.md` Section 6.4 as needing an allocation policy (equal reservation / round-robin / priority weighting) before multiple channels run simultaneously. Not urgent yet.

- **The aggregated Video Generation `UsageEvent` row's `provider`/`model` fields are a judgment call, not a confirmed convention.** One row covers two different (provider, model) pairs (TTS + transcription), so `provider` is hardcoded `'openai'` and `model` becomes a composite string (`"tts-1-hd+whisper-1"`), with the real breakdown in `metadata`. Flagged for confirmation the same way the $2.00 budget ceiling was — never explicitly confirmed by you. — *`week3/reports/task2.md`*

---

## 4. Verified-but-not-exercised (built and reviewed, but never actually hit by a real test)

- **Gate 2's too-large-video fallback** (link/local-path notice instead of attaching the file when a video exceeds Telegram's ~50MB bot-upload limit) — implemented, code-reviewed, never exercised, since every real test video so far is ~1.3MB. — *`week3/reports/task4.md`*
- **Video Generation's watermark/brand overlay** — wired into the FFmpeg filter graph, untested, since no channel in the dev DB has `brandAssets.watermarkUrl` set. — *`week3/reports/task2.md`*
- **The LLM/media layers' transient-error retry path** (rate limits, 5xx) — both `studio/src/llm/` and `studio/src/media/` have only had their *non-transient* (auth failure) error mapping verified against a real API error. The transient path inherits from the SDKs' own retryability flags rather than custom logic, so risk is judged low, but it's genuinely untested. — *`week2/reports/task1.md`, `week3/reports/task1.md`*

---

## 5. Not yet built

- **Week 4** (Publishing, Performance Analytics, first real end-to-end dry run) — task docs exist and are reviewed, but Claude Code hasn't started execution; no `week4/reports/` folder exists.
- **Deferred agents per the locked design** (not gaps — deliberately out of MVP scope): Trend Identification, Content Prediction, Continuous Learning, and Video Intelligence's "competitor" mode. All wait on real performance history or later product phases — see `AGENT_FLEET_DESIGN.md` Section 3 for the full status table.
