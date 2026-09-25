# 7AI — Pending / Carried Forward

Consolidated punch list across sprints — everything each sprint closed out as "real, but not fully
finished" or "deliberately deferred," pulled together so it doesn't need re-deriving from
`KNOWN_ISSUES_AND_BLOCKERS.md`/`STATUS.md` each time. That doc stays the actual source of truth per
item; update both in place as items get picked up or closed, don't let this one drift.

---

# Sprint 1 — Pending / Carried Forward

**Status**: Sprint 1 is genuinely closed (`week5/reports/task5.md`, independently re-confirmed by
`week5/reports/task6.md`) — nothing below is a blocker or an open MVP-closure item. Pulled together
from `KNOWN_ISSUES_AND_BLOCKERS.md` §3/§5/§6 and `week5/STATUS.md`'s "Open items carried out of Week 5."
**Created**: 2026-09-14, after Week 5 Task 6's audit.

## Worth prioritizing first — real consequences already surfaced

- **Video Generation's regen loop can't fix a duration overrun by itself.** Found live during Task
  5's D2 real public test: a dense 3-angle script rendered to 68.2s / 68.6s / 67.8s across all 3
  attempts (1 original + the full regen budget), every one over the 60s Shorts limit. Root cause:
  duration is driven by TTS narrating the `sanctionedScriptText` word-for-word, fixed at Gate 1
  approval — the regen loop can change caption style/pacing *notes*, but has no mechanism to actually
  shorten the narration. A script that's simply too long exhausts the whole regen budget and lands in
  `needs_attention` no matter what. Worked around operationally (a tighter brief) for the one real
  test; not fixed in code. Real fix candidates: Script Generation enforces an estimated-narration-
  duration budget up front (word count ÷ speaking rate), or the regen loop's fix notes explicitly ask
  for a shorter *script*, not just different pacing/captions for the same one.
  — *`week5/reports/task5.md`, `KNOWN_ISSUES_AND_BLOCKERS.md` §3*

- **Publishing's upload has no idempotency guarantee for the exact moment the HTTP request is in
  flight.** Distinct from Week 5 Task 2's B4 fix (which closed the retry-after-an-ambiguous-error
  risk within one invocation) and from Week 4 Task 2's durable checkpoint (which closes the crash
  window *after* a real `youtubeVideoId` comes back). The narrowest remaining window: if the process
  dies while the upload request has literally been sent and no response has come back yet — before
  any error even has a chance to be classified — there's no checkpoint yet to detect that on resume,
  and the simple multipart `videos.insert` endpoint doesn't accept a client-supplied idempotency key.
  Real uploads are now involved (D2's public test), not just private test artifacts — worth closing
  before this becomes routine.
  — *`week4/reports/task2.md`, `week5/reports/task2.md`, `KNOWN_ISSUES_AND_BLOCKERS.md` §3*

## Deliberate tradeoffs, not oversights

- **Restart-safe gate reopening (B6) has no staleness filter**, unlike B2's stale-`running`-run
  window — deliberately so, since a legitimate human approval can take hours or days.
  `GATE_REMINDER_THRESHOLD_MS` is intentionally longer than the resume window for this reason. Means
  a boot with years of genuinely-abandoned `paused_gate1`/`paused_gate2` dev-DB rows will re-send a
  real Telegram message for every one, with no way to distinguish "abandoned" from "founder hasn't
  replied yet." Worth a real decision later (an explicit "abandon this run" action, or a much longer
  "probably dead" threshold) once real production volume makes this more than a dev-DB-hygiene issue.
  — *`week5/reports/task3.md`, `KNOWN_ISSUES_AND_BLOCKERS.md` §3*

- **`videos.delete` needs a broader OAuth scope** than currently granted (`youtube.upload`/
  `youtube.readonly` only) — a throwaway test video (`nnY46b0vOCw`) can't be cleaned up
  programmatically. Low priority; manual YouTube Studio delete closes it, or re-request
  `youtube`/`youtube.force-ssl` if programmatic cleanup becomes worth having.
  — *`week5/reports/task1.md`, `KNOWN_ISSUES_AND_BLOCKERS.md` §3*

- **`dry-run.ts`'s live gate commands can't coexist with a persistent `npm run dev` instance** on the
  same Telegram bot token — both long-poll, Telegram allows only one active poller per token. Worked
  around by stopping the persistent instance during live-gate testing. Worth a real fix (detect an
  already-running poller and defer to it, or share one process) if live-gate testing becomes routine.
  — *`week5/reports/task1.md`, `KNOWN_ISSUES_AND_BLOCKERS.md` §3*

## Smaller tech debt, low urgency

- **`pipeline_runs.retryCount` is dead schema** — the column exists, nothing has ever written to it.
- **No lint rule enforces the "only `client.ts`/`registry.ts` are imported directly" boundary** in
  `llm/`/`media/` — convention and manual grep-checks only so far, correctly followed but not
  mechanically enforced.
- **7-channel cap has no automated test** — **closed by Sprint 3 Task 6**: a real `channels.create`
  API mutation now exists, and the cap was exercised live against real DB fixtures — 7 real channels
  created through the real API for a genuinely fresh tenant, an 8th real attempt rejected with a
  structured error, no partial row left behind (both confirmed via direct Postgres reads). See
  `docs/execution/sprint3/reports/task6.md`.
- **On Windows, stopping a background task doesn't reliably stop the process tree it spawned**
  (`npx tsx` chains through several `node.exe` processes) — a testing-methodology note, not a code
  bug; caught each time by killing the real PIDs directly, not the wrapper.
— *`KNOWN_ISSUES_AND_BLOCKERS.md` §3*

## Verified-but-never-exercised (built and reviewed, never actually hit by a real test)

- **Gate 2's too-large-video fallback** (link/local-path notice instead of attaching the file past
  Telegram's ~50MB bot-upload limit) — every real test video so far is well under that.
- **Video Generation's watermark/brand overlay** — wired into the FFmpeg filter graph, untested,
  since no channel in the dev DB has `brandAssets.watermarkUrl` set.
- **The LLM/media layers' transient-error retry path** (rate limits, 5xx) — only the *non-transient*
  (auth failure) mapping has been verified against a real API error; the transient path inherits from
  the SDKs' own retryability flags rather than custom logic.
— *`KNOWN_ISSUES_AND_BLOCKERS.md` §5*

## Explicitly deferred, no scheduled owner yet

- **A real, search-grounded fact-check pass for Script Review** — Task 4's C3 added `factualConcerns`
  as a plausibility check against the model's own knowledge only (`llm/client.ts` has no tool
  use/retrieval wired in). A genuinely grounded version needs a distinct `purpose` once the LLM layer
  supports tool use — new integration scope.
- **DB-backed integration tests** — `vitest` (Task 4) covers pure-logic functions only. The
  fixture-`PipelineRun`-style tests Tasks 2/3 already do manually (forced-rollback transactions,
  stale-resume sweeps, restart recovery) are real candidates for an actual integration suite, needing
  test-DB setup Task 4 didn't attempt.
- **The aggregated Video Generation `UsageEvent` row's `provider`/`model` fields** are a judgment call
  (`provider` hardcoded `'openai'`, `model` a composite `"tts-1-hd+whisper-1"` string) never
  explicitly confirmed by the founder, the same way the $2.00 budget ceiling was.
— *`KNOWN_ISSUES_AND_BLOCKERS.md` §4, §6*

## Deferred to a later sprint by design (not oversights)

- **Channel #2/#3 expansion** — deferred to Sprint 3, where multi-channel becomes central anyway
  (`SPRINT_ROADMAP.md`). **Closed** — see `docs/execution/sprint3/reports/task6.md`.
- **Real YouTube Analytics API integration** (`watchTimeMinutes`/`retentionPct`) — needed the
  `yt-analytics.readonly` OAuth scope. Sprint 2 Task 4 picked this up for real — see the Sprint 2
  section below (G1) for its actual, current, still-open status.
- **Deferred fleet agents per the locked design** — Trend Identification, Content Prediction,
  Continuous Learning, Video Intelligence's "competitor" mode. All wait on real performance history or
  later product phases (`AGENT_FLEET_DESIGN.md` §3, Sprint 4 per `SPRINT_ROADMAP.md`).

---

# Sprint 2 — Pending / Carried Forward

**Status**: Sprint 2 is complete (Tasks 1-6, `sprint2/reports/task6.md`) — all of Track B (voice,
visual, audio) and Track C (retention, hook scoring, cover frame, A/B testing, digest, post-hoc
tagging) shipped with real, live verification. Two genuine founder-action blockers surfaced along the
way (G1, H1) — both tracked here, neither silently glossed over in the sprint's own reports. Pulled
together from `sprint2/STATUS.md`'s "Open items carried forward" and `KNOWN_ISSUES_AND_BLOCKERS.md`.
**Created**: 2026-09-18, after Sprint 2 Task 6.

## Founder action required — genuinely blocking real data/functionality

- **G1 — YouTube Analytics API, two separate real actions, both still open.** (1) The API itself is
  **not enabled** for this project's Google Cloud console — a real, live-confirmed `403
  SERVICE_DISABLED`/`accessNotConfigured` today (the exact enable-it-here Cloud Console URL is in the
  error body, see `KNOWN_ISSUES_AND_BLOCKERS.md` §1). (2) The OAuth token also doesn't carry
  `yt-analytics.readonly` (original Week 1 Task 7 grant only requested `youtube.upload`/
  `youtube.readonly`) — not yet independently confirmed as its own blocker, since (1) stops the
  request before a scope check is even reached. Until both close, `retentionCurve` stays `null` for
  every real video — the capture code itself is fully built and stub-verified (Task 4's G2), isolated
  so this doesn't break the existing views/likes/comments capture in the meantime.
  — *`sprint2/reports/task4.md`, `KNOWN_ISSUES_AND_BLOCKERS.md` §1*

- **H1 — Custom-thumbnail permission, a real 403 on every `thumbnails.set` attempt.** The channel's
  `longUploadsStatus: "eligible"` (phone verification) was checked and confirmed live before
  building, but turned out to be a *different* eligibility gate from custom-thumbnail permission —
  every real attempt gets `403 forbidden`, `"doesn't have permissions to upload and set custom video
  thumbnails"`. The OAuth token already carries a scope Google's own docs list as sufficient, so this
  isn't a scope problem — most likely fix is a separate Studio-side step (Settings → Channel →
  Feature eligibility → Custom thumbnails) that hasn't been completed on this channel. The
  extraction/upload code and its failure isolation are both fully built and real-verified (a real run
  that hit this exact 403 still published successfully, `coverFrameSet: false` recorded truthfully).
  — *`sprint2/reports/task5.md`, `KNOWN_ISSUES_AND_BLOCKERS.md` §1*

## Real, unrelated bug found along the way — not fixed in Sprint 2

- **`extractJsonText` doesn't strip a markdown code fence around a JSON response.** Found during
  Task 2's regression testing: a real Video Intelligence multimodal review call returned its JSON
  wrapped in a ```` ```json ```` fence despite the system prompt's explicit "no markdown code fences"
  instruction — the fence wasn't stripped, throwing `NonTransientStageError` and escalating an
  otherwise-fine run to `needs_attention`. A general LLM-output-parsing robustness gap, unrelated to
  `visualSource`/Task 2's actual scope — worth a real fix (strip fenced JSON before parsing) since it
  can hit any structured LLM call in the pipeline, not just Video Intelligence.
  — *`sprint2/reports/task2.md`, `KNOWN_ISSUES_AND_BLOCKERS.md` §3*

## Explicitly deferred, no scheduled owner yet

- **A real, live Content-ID/licensing-risk API check.** Task 3's F2 is deliberately a
  manifest-integrity check only (refuses a curated track missing a `license` field) — no public
  synchronous Content-ID API exists to call at generation time. Worth building the moment a
  non-curated audio or visual source is ever added.
  — *`sprint2/reports/task3.md`, `KNOWN_ISSUES_AND_BLOCKERS.md` §6*

- **`watchTimeMinutes`/`retentionPct` (the single-number summary fields) still unbuilt.** Task 4
  built the real timestamp-level `retentionCurve`, not these — they'd need their own separate
  Analytics API report (a different metric/dimension pair), and are gated on G1 the same way.
  — *`sprint2/reports/task4.md`, `KNOWN_ISSUES_AND_BLOCKERS.md` §6*

- **Full generative AI video** — deliberately not attempted. `ai-stills` (animated Ken-Burns stills)
  was Task 2's real, scoped choice per the design doc's own "smaller lift" recommendation; full
  generative video remains a distinct, larger future option.
  — *`sprint2/reports/task2.md`, `KNOWN_ISSUES_AND_BLOCKERS.md` §6*

## Smaller tech debt, low urgency

- **`Channel.defaultVoice` has no in-app settings UI** — set via a founder-operator script
  (`scripts/set-channel-default-voice.ts`), same posture as every other channel-level MVP setting
  (`budgetOverrideUsd`, `postingCadence`). Real settings UI is Part 2 territory, not this sprint's
  scope.
- **No DB-level `CHECK` constraint validates `Channel.defaultVoice` against `TTS_VOICES`'s known
  keys** — enforced at the API edge and at the one script that writes it, not by Postgres itself.
  Same posture as every other free-text-ish nullable `Channel` column already in this schema.
— *`sprint2/reports/task1.md`, `sprint2/STATUS.md`*

## Closed, not pending — noted for completeness

- **Title/description A/B testing (H2)** — investigated before building anything, then closed with a
  real, cited reason: YouTube's "Test and Compare" feature explicitly excludes Shorts (this project's
  entire content type) and has no API surface at all (Studio-UI-only, per Google's own current 2026
  docs). Not a gap — a structurally inapplicable feature for what this project makes.
  — *`sprint2/reports/task5.md`, `KNOWN_ISSUES_AND_BLOCKERS.md` §4*
