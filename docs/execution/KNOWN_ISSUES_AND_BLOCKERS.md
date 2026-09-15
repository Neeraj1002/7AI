# Known Issues & Blockers Tracker

**Purpose**: one place to check instead of re-reading every week's/sprint's reports/summaries. Covers everything flagged across Weeks 1–5 and Sprint 2 onward, as of this doc's last update.

**Last updated**: 2026-09-15, after Sprint 2 Task 2 (a second visual-source backend — AI-generated
stills + synthetic-content disclosure). See `docs/execution/sprint2/reports/task2.md`.

**How to keep this current**: whenever a new week closes out, or an item below gets resolved, update this file — don't just fix the thing and let this doc go stale. Each item cites its source report so you can go deeper if needed.

---

## 1. Founder action required (external, blocking)

**All four rows previously here are now closed** — Week 5 Task 1 ran a real, credentialed,
founder-gated end-to-end test: real YouTube OAuth (upload confirmed `private` via a direct API
check), real `OPENAI_API_KEY`/`PEXELS_API_KEY` (real TTS + real, on-topic Pexels footage), and both
Gate 1/Gate 2 answered live by the founder over actual Telegram (`"Approve"`, in real time) —
closing the live-human-reply item open since Week 2 as well. See `week5/reports/task1.md` for the
full evidence trail (real `youtubeVideoId`, real review verdicts, real spend).

Nothing founder-blocking remains open as of this update. New items, if any arise, get a fresh row
here rather than reviving the closed ones below (kept for history):

<details>
<summary>Closed items (click to expand)</summary>

| Item | Status | Closed by |
|---|---|---|
| YouTube OAuth + quota submission | Closed — real upload + real privacy-status check succeeded | `week5/reports/task1.md` |
| Live Gate 1/Gate 2 human-reply round trip | Closed — both gates answered live over real Telegram | `week5/reports/task1.md` |
| Real `OPENAI_API_KEY`/`PEXELS_API_KEY` | Closed — real TTS + real stock footage used and verified | `week5/reports/task1.md` |
| The first genuinely real end-to-end dry run | Closed — `PipelineRun.status='completed'` reached for real | `week5/reports/task1.md` |

</details>

---

## 2. Fixed in Week 5 (Tasks 2-5)

Twelve real, previously-open items, all fixed with evidence — see `week5/reports/task2.md`/
`task3.md`/`task4.md`/`task5.md` for the full verification detail (real forced-rollback tests, real
render comparisons, real regression runs, a real restart-recovery test, real fixture-channel budget
scenarios, real planted-error script reviews, a real public YouTube upload) behind each one:

- **B1 — `completeStage`/`currentStage` write race.** Every one of the ~9 stage-completion call
  sites in `state-machine.ts` (plus the `ReviewLog` insert that sits between them, where one
  exists) now commits inside a single `prisma.$transaction`, via `tx`-aware repository functions
  (`completeStage`, `failStage`, `updatePipelineRun`, `insertReviewLog`). Verified with a real
  forced-rollback test: a deliberate DB `CHECK` constraint violation partway through a transaction
  left the stage `running`, not orphaned as `completed` — proving atomicity, not just code review.
- **B2 — `resume()` sweeps every stale `running` run.** New `RESUME_STALE_WINDOW_MS` (default 30
  minutes, sized from real observed `video_generation` durations — max 113s across Weeks 3-5 real
  runs, ~16x headroom). A run whose latest stage hasn't moved in longer than the window is no
  longer auto-resumed; it's moved to `needs_attention` with a `[stale-resume-skip]`-prefixed
  `lastError`. Verified with two real fixture runs (one recent, one backdated 2 hours) — only the
  recent one produced new stage rows.
- **B3 — Video Intelligence's multimodal call had no retry-with-backoff.** Now wraps just the
  `callLLM` call (not the whole `reviewVideo` function, which doesn't compose with the retry
  wrapper's throw-based semantics). Verified: a simulated transient error retries 3x before
  succeeding; a simulated non-transient error doesn't retry at all; a real live `video_review`
  call confirms the normal pass/fail path is unaffected.
- **B4 — Publishing upload retry could double-upload.** A `videos.insert` retry after an ambiguous
  failure (response lost, but the request may have already reached YouTube) risked creating a
  second real video. Narrowed the upload's own error classification: only a failure that *proves*
  the request never reached YouTube (`ECONNREFUSED`/`ENOTFOUND`/`EAI_AGAIN` — the connection itself
  never established) is retried; everything else — including a 429/5xx HTTP response, which for a
  read would be safely retryable — now routes straight to `needs_attention`, never auto-retried.
  Verified with realistic error shapes through the real classification function.
- **B5 — Captions made optional; the caption/frame-sampling conflict actually fixed.**
  `Channel.brandAssets.captionsEnabled` (default `true`, no migration — existing `Json` column) now
  genuinely skips SRT writing and the `subtitles` filter stage when `false` — confirmed by
  extracting and viewing frames from both a captions-on and captions-off render. Separately, Video
  Intelligence now samples 3 frames (25%/50%/75%) instead of 1 and judges across all of them,
  instead of further suppressing `word-flash` as a caption choice — a real forced-`word-flash`
  regression run showed 2 of 3 frames with a genuine partial word, and the reviewer correctly
  passed the video anyway, recognizing it as a normal mid-transition artifact rather than failing
  on one bad instant. This is the item Section 3 used to track as "Video Generation's caption style
  fights Video Intelligence's frame-sampling" — now resolved, not just theorized about.
- **B6 — a restart while a run sat at `paused_gate1`/`paused_gate2` stranded it forever.** The DB
  status was durable, but the in-memory `pendingByThreadKey` map (`telegram-channel.ts`) that a
  real Telegram reply or the app's gate1/gate2 API call resolves against lived only in the crashed
  process's memory — nothing re-established it. `resume-on-startup.ts` now re-invokes the matching
  gate function for every `paused_gate1`/`paused_gate2` run on boot; `runGate1Stage`/`runGate2Stage`
  reuse the existing `running` stage attempt rather than creating a new one, so this is safe to run
  on every boot regardless of whether a gate was actually affected by a crash. A "you haven't
  answered in a while" nudge (`GATE_REMINDER_THRESHOLD_MS`, default 4h) also pings Telegram
  independent of any restart. Verified live: a real fixture run at each of `paused_gate1`/
  `paused_gate2`, a real restart (`resumeOnStartup()` called directly) re-sent a real Telegram
  message and re-established the pending state (`peekPendingMessageId` returned a real id), and the
  app's `resolvePendingApproval` path resolved it end-to-end (`{ resolved: true }`, the run
  correctly advanced). A second immediate restart while still pending did not create a duplicate
  `PipelineStage` attempt. The reminder nudge fired for a gate open past its threshold and not for
  one answered promptly, verified both ways.

  **A real, live side-effect of testing this fix, worth knowing about**: the very first real test
  of this fix also picked up ~8 genuine leftover `paused_gate1`/`paused_gate2` runs from Weeks 2-3
  testing (accumulated dev-DB debris, never cleaned up) and correctly — if noisily — re-sent real
  Telegram messages for every one of them, since the fix has no way to distinguish "paused because
  of an actual restart just now" from "paused and abandoned weeks ago." Cleaned up immediately
  (`close-stale-test-runs.ts`); see the new tech-debt item just below.

- **C1 (2026-09-13) — Intake-parsing moved to the cheap/fast model tier.** `src/llm/registry.ts`'s
  `intake-parsing` entry now resolves to `claude-haiku-4-5`, matching `script-review`/
  `video-intelligence-own-draft`'s existing correct tiering instead of the inherited-by-accident
  premium `claude-sonnet-5` default from Week 1. The stale registry comment describing this as an
  open deviation was removed. Verified two ways (the task's own suggested check — a `UsageEvent` row
  recording the new model — doesn't apply; see the new tech-debt item below for why): a direct
  `callLLM({purpose: 'intake-parsing', ...})` call confirmed the real response comes back from
  `claude-haiku-4-5`, and a full real intake call through `dry-run.ts` confirmed the cheaper model
  still produces a structurally valid parsed brief. Locked in by a real regression test
  (`src/llm/registry.test.ts`) asserting `resolvePurpose('intake-parsing')` never silently reverts.
  — *`week5/reports/task4.md`*

- **C2 — Pooled per-platform budget now has a fair-access policy across channels.** Every active
  channel on a platform starts with an equal share of `AgentQuota.budgetCeilingUsd`; a new,
  persisted `Channel.budgetOverrideUsd` (nullable `Decimal(10,2)`, real Prisma migration) lets a
  specific channel's ceiling be set independently, with the remaining pool split equally among the
  rest. `isBudgetAvailable(tenantId, channelId, platform)` now checks both this channel's own spend
  against its effective ceiling and the pool total, replacing the old pool-only check. Overrides
  that exceed the pool floor the default-share channels at $0 and log a loud warning rather than
  silently dividing by a negative number. Set via a new founder-facing
  `scripts/set-channel-budget-override.ts <channelId> <usdAmount|clear>`. Verified live with real
  fixture channels: equal split ($5/$5 on a $10 pool), an $8 override leaving $2 for the other
  channel, the overridden channel's `isBudgetAvailable` correctly flipping to `false` once its real
  spend passed $8, and a pathological override-exceeds-pool case producing the warning with no
  throw/NaN. The pure allocation math (`computeChannelBudgetCeilings`) is now also unit-tested (see
  C4). — *`week5/reports/task4.md`*

- **C3 — Script Review now flags factual concerns (plausibility check, not a verified fact-check).**
  `ScriptReviewOutputSchema` gained `factualConcerns: string[]` (empty when nothing looks off);
  `SYSTEM_PROMPT` explicitly tells the model this is based on its own knowledge only — `llm/client.ts`
  has no tool use/retrieval wired in, so nothing is actually looked up or verified. Surfaced in the
  `ReviewLog` rationale reaching Gate 1, same call and same cheap tier as the rest of the review (no
  new `purpose`, no added cost). Verified with two real, contrasting LLM calls on the same
  niche/style inputs Week 2's hummingbird test used: a script with planted factual errors produced
  specific, correct concerns; a clean script produced an empty array. A real search-grounded
  fact-check (a distinct `purpose` once the LLM layer supports tool use) is explicitly deferred —
  see Section 6. — *`week5/reports/task4.md`*

- **C4 — A real automated test harness now exists.** `vitest` adopted (`npm test` now runs it,
  replacing the old `echo "Error: no test specified" && exit 1` stub); 4 test files, 27 real
  assertions, covering `parseGateReply` (gate1 approve/reject/edit parsing), `mapGoogleError`
  (Publishing's transient/non-transient upload-error classification, previously verified only by
  manual testing), `resolvePurpose`/`resolvePricing` (including the C1 regression test above), and
  `computeChannelBudgetCeilings`'s pure allocation math (including the override-exceeds-pool and
  all-channels-overridden edge cases). A real build/test-config bug was found and fixed along the
  way: `npm run build` was compiling `.test.ts` files into `dist/**/*.test.js`, and `npm test` then
  picked up both the source and the CommonJS-compiled duplicates, failing on the latter — fixed with
  a dedicated `tsconfig.build.json` (excludes test files from `dist/`, `typecheck` still covers them)
  and an explicit `vitest.config.mts` `include`/`exclude`. DB-backed integration testing is
  explicitly deferred — see Section 6. — *`week5/reports/task4.md`*

- **D1 (2026-09-14) — Intake's real spend is now metered.** `runIntakeStage` never called
  `insertUsageEvent` at all, unlike every other stage since Week 1 (found during Task 4's C1
  verification, logged as a tech-debt item below at the time). `parseBrief`/`stubParseBrief` now
  return `{ output, llm }` (mirroring every other agent call's shape) and `runIntakeStage` writes a
  real `UsageEvent` row on both success and failure, same per-attempt metering pattern as
  Script Generation/Review. Verified live: a real Intake call through `dry-run.ts` produced a real
  `UsageEvent` row (`agent: 'intake'`, `model: 'claude-haiku-4-5'`, real token counts, real cost) —
  confirmed by direct query, not code review. This also means C2's pool-total budget check
  (`sumUsageCostForTenantPlatform`) no longer undercounts real spend by Intake's share.
  — *`week5/reports/task5.md`*

- **D2 (2026-09-14) — Privacy status is now a real per-run choice, and the first genuinely public
  Short is live.** `publishing/types.ts`'s hardcoded `PRIVACY_STATUS = 'private'` constant is gone,
  replaced by a real `PrivacyStatus` (`'private' | 'unlisted' | 'public'`) threaded from Gate 2's own
  reply — `parseGate2Reply` recognizes `"approve public"`/`"approve unlisted"`/`"approve private"`
  (exact match, same no-fuzzy-matching discipline as the rest of Gate 1/2), defaulting to `private`
  on a bare `"approve"` exactly as before. The choice is recorded in the `gate2` stage output (so
  Publishing can read it) and, when non-default, in the `ReviewLog.editedOutput` — same "audit trail
  shows what was actually approved" pattern as Gate 1's edited-script logging. Verified live,
  end-to-end, for real: a real brief about GPT-6 Astra went through real Intake → Script Generation
  → Script Review (flagging real factual concerns per C3 — a genuine plausibility-check finding, see
  `week5/reports/task5.md`) → a live Gate 1 approval over real Telegram → real video generation
  (after a real, unrelated finding — see the new tech-debt item below) → a live Gate 2 approval
  (`"Approve public"`, real, over real Telegram, after actually watching the video) → a real
  YouTube upload. The resulting video (`youtubeVideoId` in the report) was confirmed `privacyStatus:
  'public'` via a direct YouTube Data API call — not inferred from the DB row — with no burned-in
  captions (channel's `captionsEnabled` set to `false` for this run only, then restored). A separate
  fixture run approved with a bare `"approve"` was confirmed to still publish `private`, proving the
  default didn't quietly change. This closes the last open item from the original Oct 15 MVP
  roadmap (§12's "a genuinely public test") — **Sprint 1 is now genuinely closed.**
  — *`week5/reports/task5.md`, `docs/roadmap/SPRINT_ROADMAP.md`*

---

## 3. Known implementation gaps / tech debt (code-level, no founder action needed)

- **On Windows, stopping a background *task* does not reliably stop the *process tree* it spawned** — `npx tsx <script>` chains through several `node.exe` processes (npx → the tsx CLI → the actual runtime executing the script); killing only the outermost shell/task leaves the real work running undetected in the background. Bit Week 3 Task 5's live kill-and-resume test once already, and bit Week 4 Task 4's mid-`publishing` kill test the same way on a first attempt — caught both times by checking `tasklist`/`Get-CimInstance Win32_Process` for the actual PIDs and force-killing the whole tree directly, not the wrapper. Correctly applied on the first attempt in Week 5 Task 1's real re-run of this same test. Not a code bug, a testing-methodology note worth remembering before the next live kill test. — *`week3/reports/task5.md`, `week4/reports/task4.md`, `week5/reports/task1.md`*

- **`dry-run.ts`'s live gate commands (`gate1-live`/`gate2-live`) can't coexist with a persistent `npm run dev` instance** on the same Telegram bot token — both start a long-poll loop, and Telegram allows only one active `getUpdates` poller per token, so the second one to start gets a `409 Conflict`. Worked around in Week 5 Task 1 by stopping the persistent instance for the duration of testing and restarting it after. Not fixed — worth a real fix (detect an already-running poller and defer to it, or share one process) if live-gate testing becomes routine rather than occasional. — *`week5/reports/task1.md`*

- **`videos.delete` needs a broader OAuth scope than what's currently granted** — the token only has `youtube.upload`/`youtube.readonly` (Week 1 Task 7's original scope request), so a throwaway test video uploaded during Week 5 Task 1's real kill-test (`nnY46b0vOCw`, private, harmless) couldn't be cleaned up programmatically. Low priority — a manual YouTube Studio delete closes it, or a future task can re-request the broader `youtube`/`youtube.force-ssl` scope if programmatic video cleanup becomes worth having. — *`week5/reports/task1.md`*

- **Restart-safe gate reopening (Week 5 Task 3, B6) has no staleness filter, unlike B2's stale-`running`-run window** — deliberately so: a legitimate human approval can take hours or days, so reusing `RESUME_STALE_WINDOW_MS`'s 30-minute logic for gates would be wrong (per the task's own framing, `GATE_REMINDER_THRESHOLD_MS` is *longer* than the resume window for exactly this reason). But this means a boot with years of accumulated, genuinely-abandoned `paused_gate1`/`paused_gate2` dev-DB rows will re-send a real Telegram message for every single one, with no way to distinguish "abandoned" from "the founder just hasn't replied yet" — confirmed live during this task's own testing (~8 old runs, cleaned up manually). Worth a real decision later (an explicit "abandon this run" action, or a much longer "probably dead" threshold measured in days/weeks) once real production volume makes this more than a dev-DB-hygiene issue. — *`week5/reports/task3.md`*

- **`pipeline_runs.retryCount` is dead schema** — the column exists but nothing has ever written to it, across all three weeks. Flagged Week 1, never revisited.

- **No lint rule enforces the "only `client.ts`/`registry.ts` are imported directly" boundary** in either `studio/src/llm/` or `studio/src/media/` — held by convention and manual grep-checks only so far, correctly followed each time but not mechanically enforced. — *`week2/reports/task1.md`*

- **Publishing's upload has no idempotency guarantee for the exact moment the HTTP request is in flight.** Distinct from Week 5 Task 2's B4 fix (Section 2, above — that closed the *retry-after-an-ambiguous-error* risk within one invocation). This is a narrower, still-open window: Week 4 Task 2 added a durable checkpoint (`recordStageProgress`) that closes the crash window *after* a real `youtubeVideoId` comes back but before the stage/run rows are marked complete, so a resume never re-uploads in that case. But if the process dies while the upload request has literally been sent and no response has come back yet — before any error even has a chance to be classified — there's no checkpoint yet to detect that on resume; the simple multipart `videos.insert` endpoint doesn't accept a client-supplied idempotency key either. Narrowest possible window, not closed. — *`week4/reports/task2.md`, `week5/reports/task2.md`*

- **7-channel cap has no automated test** — verified by code review and live exercise, never by a dedicated "create 7, assert the 8th throws" test. A `vitest` harness now exists (Week 5 Task 4), but this would need real DB fixtures (deferred integration-testing scope, Section 5), not a pure-function unit test. — *`week1/reports/task3.md`*

- **Video Generation's automatic regen loop can't reliably fix a duration overrun by itself.** Found
  live during Week 5 Task 5's D2 real public test: a real, dense 3-angle script (GPT-6 Astra's
  capabilities/hype/safety) rendered to 68.2s, 68.6s, then 67.8s across all 3 attempts (1 original +
  the full `MAX_VIDEO_REGEN_ATTEMPTS=2` regen budget) — every attempt over the 60s Shorts limit,
  despite each regen's production-planning step genuinely trying (shorter pacing notes, phrase-
  grouped captions). Root cause: video duration is driven by TTS narrating the actual
  `sanctionedScriptText` word-for-word, which is fixed at Gate 1 approval time — the regen loop can
  change caption style/pacing *notes*, but has no mechanism to actually shorten the narration itself.
  So a script that's simply too long to fit in 60s exhausts the entire regen budget and lands in
  `needs_attention` no matter how many attempts it gets. Worked around operationally for the test
  (a fresh run with an explicit "keep it under 40s" brief constraint, which produced a properly-fitting
  script from Script Generation directly) rather than fixed in code — genuinely out of D1/D2's scope.
  Worth a real fix later: either Script Generation enforces an estimated-narration-duration budget
  up front (word count ÷ speaking rate), or the regen loop's fix notes explicitly ask for a shorter
  *script*, not just different pacing/captions for the same one. — *`week5/reports/task5.md`*

- **`llm/extract-json.ts`'s `extractJsonText` doesn't reliably strip a markdown code fence in every
  case.** Found live during Sprint 2 Task 2's regression testing (unrelated to that task's own
  visual-source work): a real Video Intelligence multimodal review call returned
  `` ```json\n{"verdict": "pass", ...} `` despite `SYSTEM_PROMPT`'s explicit "no markdown code
  fences" instruction, and the parser didn't strip it, throwing `NonTransientStageError` and
  escalating an otherwise-fine run to `needs_attention`. Every other real call across five weeks and
  Sprint 2 so far has apparently avoided this exact wrapping, or `extractJsonText` handles the
  common case and missed this one — not root-caused or fixed as part of Task 2 (genuinely out of
  scope, a general LLM-output-parsing robustness gap, not a visual-source issue). Worth a real,
  isolated fix: a more defensive fence-stripping regex, or retrying once specifically on a JSON
  parse failure before escalating. — *`sprint2/reports/task2.md`*

---

## 4. Real design findings worth a decision (not bugs — open questions surfaced by live testing)

- **The aggregated Video Generation `UsageEvent` row's `provider`/`model` fields are a judgment call, not a confirmed convention.** One row covers two different (provider, model) pairs (TTS + transcription), so `provider` is hardcoded `'openai'` and `model` becomes a composite string (`"tts-1-hd+whisper-1"`), with the real breakdown in `metadata`. Flagged for confirmation the same way the $2.00 budget ceiling was — never explicitly confirmed by you. — *`week3/reports/task2.md`*

---

## 5. Verified-but-not-exercised (built and reviewed, but never actually hit by a real test)

- **Gate 2's too-large-video fallback** (link/local-path notice instead of attaching the file when a video exceeds Telegram's ~50MB bot-upload limit) — implemented, code-reviewed, never exercised, since every real test video so far is ~1.3MB. — *`week3/reports/task4.md`*
- **Video Generation's watermark/brand overlay** — wired into the FFmpeg filter graph, untested, since no channel in the dev DB has `brandAssets.watermarkUrl` set. — *`week3/reports/task2.md`*
- **The LLM/media layers' transient-error retry path** (rate limits, 5xx) — both `studio/src/llm/` and `studio/src/media/` have only had their *non-transient* (auth failure) error mapping verified against a real API error. The transient path inherits from the SDKs' own retryability flags rather than custom logic, so risk is judged low, but it's genuinely untested. — *`week2/reports/task1.md`, `week3/reports/task1.md`*

---

## 6. Not yet built

- **Deferred agents per the locked design** (not gaps — deliberately out of MVP scope): Trend Identification, Content Prediction, Continuous Learning, and Video Intelligence's "competitor" mode. All wait on real performance history or later product phases — see `AGENT_FLEET_DESIGN.md` Section 3 for the full status table.
- **Real YouTube Analytics API integration** (`watchTimeMinutes`/`retentionPct`) — deliberately deferred; needs a separate `yt-analytics.readonly` OAuth scope never requested. `views`/`likes`/`comments` (Data API) are real and working as of Week 5.
- **`videos.delete` scope** — see Section 3. Not a blocker, just unavailable with the current token.
- **A real, search-grounded fact-check pass for Script Review** — Week 5 Task 4's C3 added
  `factualConcerns`, explicitly framed as a plausibility check against the model's own knowledge, not
  a verified fact-check, since `llm/client.ts` has no tool use/retrieval wired in. A genuinely
  grounded version (the model actually looking claims up) would need a distinct `purpose`
  (`script-review-factcheck` or similar) once the LLM layer supports tool use — new integration
  scope, deliberately out of Task 4's reach. — *`week5/reports/task4.md`*
- **DB-backed integration tests** — Week 5 Task 4 stood up `vitest` and covered four pure-logic
  functions (`parseGateReply`, `mapGoogleError`, `resolvePurpose`/`resolvePricing`,
  `computeChannelBudgetCeilings`), deliberately scoped away from anything needing a live database.
  The fixture-`PipelineRun`-style tests Task 2/3 already do manually (forced-rollback transactions,
  stale-resume sweeps, restart recovery) are real, valuable candidates for an actual integration
  suite — needs test-DB setup (a real decision: a dedicated test schema/database, transaction
  rollback per test, or something else) that Task 4 didn't attempt. A natural next-week candidate.
  — *`week5/reports/task4.md`*
- **Full generative AI video** — Sprint 2 Task 2 added a second `visualSource` (`ai-stills`:
  AI-generated stills animated Ken-Burns-style), the smaller-lift option
  `MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` Section 2 explicitly recommended over jumping
  straight to generative video. A true third `visualSource` (an actual generative-video model, not
  animated stills) is a distinct, larger future task — different provider landscape, different cost
  profile, different content-generation pipeline entirely — deliberately not attempted here.
  — *`sprint2/reports/task2.md`*
