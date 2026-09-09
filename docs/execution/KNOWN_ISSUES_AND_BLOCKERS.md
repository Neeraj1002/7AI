# Known Issues & Blockers Tracker

**Purpose**: one place to check instead of re-reading every week's reports/summaries. Covers everything flagged across Weeks 1–3 (all complete) plus Week 4 in progress, as of this doc's last update.

**Last updated**: 2026-09-09, after Week 4 Task 4 (Week 4 close-out).

**How to keep this current**: whenever a new week closes out, or an item below gets resolved, update this file — don't just fix the thing and let this doc go stale. Each item cites its source report so you can go deeper if needed.

---

## 1. Founder action required (external, blocking)

| Item | Status | Why it matters | Source |
|---|---|---|---|
| **YouTube OAuth + quota submission** | Still open — Google Cloud Console steps (project, consent screen, OAuth client, quota increase request) never done. Approval has historically taken 1–2 weeks. | **Hard blocker for a genuinely real Week 4 Task 2/3/4** — without it, Publishing/Performance Analytics run against `YOUTUBE_STUB=1` (fake `youtubeVideoId`, fake stats) and the first real end-to-end dry run (brief → published-private video) can't happen for real yet. Expected to land "tonight" per the founder as of 2026-09-09. | `week1/reports/task7.md`, carried in every subsequent week's STATUS.md |
| **Live Gate 1 human-reply round trip** | Still open as of Week 4's close — every Gate 1/Gate 2 test through Week 4 continued to use a simulated reply (a `gate1-live` dry-run command exists, ready whenever the founder is on Telegram). | Low urgency — the mechanism is proven — but it's the one criterion nobody has actually closed by doing it for real. Worth 60 seconds whenever you're on Telegram: run any brief to `paused_gate1` and reply for real. | `week2/reports/task6.md`, `week3/reports/task5.md` |
| **Real `OPENAI_API_KEY`/`PEXELS_API_KEY`** | Not in `.env.local` as of Week 4's close. All of Weeks 3–4's TTS/transcription runs against `MEDIA_STUB=1`; all of Week 4's stock-footage fetches against `STOCK_FOOTAGE_STUB=1` (a synthetic moving test pattern, not real footage). | Blocks closing Week 3 Task 1/2's and Week 4 Task 1's "real call succeeds" acceptance criteria — **no real audio or real stock footage has ever been produced**. Also blocks a genuinely real Week 4 Task 4 dry run alongside the YouTube key above. Expected "tonight" per the founder as of 2026-09-09. | `week3/reports/task1.md`, `task2.md`, `week4/reports/task1.md` |
| **The first genuinely real end-to-end dry run** (Week 4 Task 4) | Not done — depends on all three credentials above landing. Everything through Week 4 close-out ran against stubs (`MEDIA_STUB=1`/`STOCK_FOOTAGE_STUB=1`/`YOUTUBE_STUB=1`); the full nine-stage chain and the mid-`publishing` kill/resume test are both proven mechanically, but not with real audio, real footage, or a real upload, and not with the founder answering the gates live. | This is the actual milestone `MVP_ROADMAP_OCT15.md` Section 12 calls for — code-complete is not the same as proven. | `week4/reports/task4.md` |

---

## 2. Known implementation gaps / tech debt (code-level, no founder action needed)

- **`completeStage`/`currentStage` write race** — a stage's completion and the pipeline's advance to the next stage are two separate database writes, not one transaction, despite Week 1's `BUSINESS_LOGIC.md` describing it as atomic. A crash between the two writes could leave `currentStage` one step behind. Flagged Week 2 Task 7, **not fixed as of Week 3 close**. Now noted directly in `week1/BUSINESS_LOGIC.md` Section 1 so the doc doesn't overstate the guarantee. Low probability today; worth a real fix (transaction-aware repository writes) before stage count/call volume grows further. — *`week2/reports/task7.md`*

- **`resume()` sweeps every stale `running` run, not just the intended target** — by design (that's what resumability means), but it's bitten real testing three times now. Week 2 Task 7 incurred ~$0.03 of incidental spend resuming leftover test runs; Week 3 Task 5 hit a "wider blast radius" recurrence; **Week 4 Task 4 is the predicted scenario actually happening**: two genuine leftover Week 3 test runs, sitting at `currentStage='publishing'` since before any resumer existed for that stage, were swept up and completed for real (a small real `metadata-generation` Anthropic spend plus two stub YouTube uploads) the moment a `publishing` resumer got wired in — exactly what this entry predicted before Week 4 started. Outcome was harmless (both completed cleanly, no duplicate uploads — Task 2's checkpoint mechanism, below, held), but the risk is now demonstrated live, not theoretical. **Still not fixed** — nothing yet distinguishes "genuinely stuck mid-stage" from "deliberately waiting at a stage that just didn't have a processor wired up yet at the time it stalled." Worth a real decision (e.g. a max-staleness window, or an explicit "abandoned" status) before a channel #2 or higher call volume makes accidental resumes costlier. — *`week2/reports/task7.md`, `week3/reports/task5.md`, `week3/STATUS.md`, `week4/reports/task4.md`*

- **On Windows, stopping a background *task* does not reliably stop the *process tree* it spawned** — `npx tsx <script>` chains through several `node.exe` processes (npx → the tsx CLI → the actual runtime executing the script); killing only the outermost shell/task leaves the real work running undetected in the background. Bit Week 3 Task 5's live kill-and-resume test once already, and bit Week 4 Task 4's mid-`publishing` kill test the same way on a first attempt — caught both times by checking `tasklist`/`Get-CimInstance Win32_Process` for the actual PIDs and force-killing the whole tree directly, not the wrapper. Not a code bug, a testing-methodology note worth remembering before the next live kill test. — *`week3/reports/task5.md`, `week4/reports/task4.md`*

- **Intake-parsing is on the wrong model tier** — `AGENT_FLEET_DESIGN.md` Section 8.1 classifies extraction tasks as cheap/fast, but `intake-parsing`'s registry entry still resolves to premium `claude-sonnet-5`, inherited from Week 1's original default and never a deliberate choice. Low cost impact today (one small call per run), flagged for whoever picks up model-tiering work. — *`week2/reports/task3.md`, now noted in `AGENT_FLEET_DESIGN.md` 8.1*

- **No automated test runner exists anywhere in the project.** Every verification across all three weeks has been live/manual (real calls, direct DB queries, `ffprobe`, etc.) — genuinely rigorous, but there is no regression suite. Flagged as worth deciding in Week 1's summary ("early in Week 2"), never actually set up. Worth a real decision before more business logic accumulates.

- **`pipeline_runs.retryCount` is dead schema** — the column exists but nothing has ever written to it, across all three weeks. Flagged Week 1, never revisited.

- **Video Intelligence's multimodal call isn't wrapped in retry-with-backoff** — every other LLM call site uses `withRetryAndCircuitBreaker`; `runVideoReviewStage` doesn't, because the deterministic-check path returns normally rather than throwing, which doesn't compose cleanly with the retry wrapper's assumptions. A transient LLM failure during video review currently routes straight to `needs_attention` instead of retrying. Flagged as a real gap, not fixed. — *`week3/reports/task3.md`*

- **No lint rule enforces the "only `client.ts`/`registry.ts` are imported directly" boundary** in either `studio/src/llm/` or `studio/src/media/` — held by convention and manual grep-checks only so far, correctly followed each time but not mechanically enforced. — *`week2/reports/task1.md`*

- **Publishing's upload has no idempotency guarantee for the exact moment the HTTP request is in flight.** Week 4 Task 2 added a durable checkpoint (`recordStageProgress`) that closes the much more likely crash window — after a real `youtubeVideoId` comes back but before the stage/run rows are marked complete — so a resume never re-uploads in that case. But if the process dies while the upload request has been sent and no response has come back yet, there's no way to know whether YouTube received it; the simple multipart `videos.insert` endpoint doesn't accept a client-supplied idempotency key. Narrow window, not closed this task. — *`week4/reports/task2.md`*

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

- **A genuinely real Week 4 end-to-end run** — Week 4 (Publishing, Performance Analytics, video-generation loop fix + stock footage) is code-complete and tested against stubs (see Section 1's founder-action rows above); the real run itself is what's not yet done.
- **Deferred agents per the locked design** (not gaps — deliberately out of MVP scope): Trend Identification, Content Prediction, Continuous Learning, and Video Intelligence's "competitor" mode. All wait on real performance history or later product phases — see `AGENT_FLEET_DESIGN.md` Section 3 for the full status table.
