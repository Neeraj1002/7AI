# Known Issues & Blockers Tracker

**Purpose**: one place to check instead of re-reading every week's/sprint's reports/summaries. Covers everything flagged across Weeks 1–5 and Sprint 2 onward, as of this doc's last update.

**Last updated**: 2026-10-11 (status block at the top of Section 1, new findings at the top of Section 4, the P5 item in Section 5, and the new Section 7). Before that: 2026-09-22, after the Sprint 3 Hardening fix (run creation-time tenant ownership
check). See `docs/execution/sprint3/reports/hardening-tenant-check.md`. **Sprint 3 is being closed by one task, `docs/execution/bugs/Sprint3/tasks/task12.md` (Bugs Task 12); the "Task 12" notes below name the item that handles each entry.**

**How to keep this current**: whenever a new week closes out, or an item below gets resolved, update this file — don't just fix the thing and let this doc go stale. Each item cites its source report so you can go deeper if needed.

---

## 1. Founder action required (external, blocking)

### Status update, 2026-10-11 (read this first; the older items below are kept as history)

| Item | State on 2026-10-11 | Handled by |
|---|---|---|
| O1: real push delivery on a physical device | **Partly verified.** Gate 2 pushes reach the founder's OnePlus. Gate 1 pushes do not arrive for the tenant user, and Expo's receipts for that user show `DeveloperError` ("malformed or contained invalid parameters"). A server restart loop on 2026-10-10 also re-sent a Gate 2 push on every boot (about 8 stacked in a minute). | Bugs Task 12 R5, R6; founder check F8 |
| M2/M3: a fresh Google consent for a per-channel token | **Done in practice.** Channels connected through the in-app flow publish on preview (real publishes on 2026-10-10 went through the per-channel credential). What remains is the weekly expiry below. | R13, F7 |
| Redirect URI and the OAuth client type (found 2026-09-27/28) | **Closed.** The old client was a *Desktop app* client, which Google restricts to loopback redirects, so no registration could ever work for a phone or the VPS. A *Web application* client was created on 2026-09-28 and the env was switched; connect now works through `https://7aistudio.tech/oauth2callback`. Every channel connected before the switch had to re-consent. | - |
| **Consent screen still in Testing: tokens expire 7 days after consent** (found 2026-09-28) | **Open, not fixable by code.** Google's own documentation: in Testing, every authorisation expires exactly 7 days after consent (refresh token included), and the project is capped at 100 listed test users. This is why `invalid_grant` appears in the PM2 error log, why the analytics poll snapshots only some published runs, and why "YouTube connected" can be wrong. The earlier note that Testing apps can only upload privately is **retracted**: a public video was uploaded while in Testing. Moving to Production needs Google's "sensitive scope" verification for `youtube.upload` / `youtube.readonly` (domain ownership, a privacy policy, accurate consent-screen details, and a demo video of the consent flow; a few business days to a few weeks once submitted). Until then the app can only *say* the access has expired. | **Accepted 2026-10-11 (founder, F7 done):** reconnect each channel weekly; Google production verification is out of scope. Bugs Task 12 R13 ("Reconnect needed") |
| L2: Console quota numbers | **Open (small).** On 2026-10-11 the founder confirmed "100 accounts for testing", which is the Testing-mode test-user cap. The YouTube API quota page itself (`videos.insert` bucket, Data API units) has still not been read. | Founder F7 |
| H1: custom-thumbnail permission (403) | **Moved to Sprint 4.** Needs YouTube phone verification of each channel (founder action outside the code); `Sprint4/tasks/hardening-thumbnail-phone-verification.md`. | Sprint 4; Section 7 |
| G1: YouTube Analytics API (watch time, retention) | **Not built.** Needs the `yt-analytics.readonly` scope and a fresh consent. | Sprint 4 |
| **New 2026-10-08: `gpt-image-1.5` shuts down 2026-12-01** | **Open.** The default `ai-stills` path calls it. Replacements: `gpt-image-2.5-sunburst` / `gpt-image-2.5-flare`. Blockers: the new per-image price at 1024x1536 is not published (token billing), supported sizes and the `sunburst` / `flare` difference are undocumented, the OpenAI key's access is untested, and the stills will look different, so the founder must approve contact sheets for each channel. Plan and blocker table: `Sprint3/tasks/hardening-gpt-image-migration.md`. Target: deployed by 2026-11-15. Not part of Bugs Task 12. | Own task |
| **New 2026-10-11: restart loop after Revise then Retry at Gate 2** | **Open.** A normal founder action (Revise, Retry, then `pm2 restart`) put the preview server into a restart loop with no stack trace in the error log; closed by hand in SQL. The Task 3 "resume-loop edge case" in `sprint3/STATUS.md` is the same failure class and has now recurred. | Bugs Task 12 R5 (first item) |
| `PUBLIC_API_BASE_URL` not set on the VPS | **Open (one line).** Production logs `[boot] PUBLIC_API_BASE_URL not set` on every start and magic-link text points at localhost. Set `PUBLIC_API_BASE_URL=https://7aistudio.tech` in `/var/www/7AI/studio/.env`, then restart. | Founder F1; R10.11 |

### Open — O1: confirm real push delivery on a real physical device (Sprint 3 Task 7)
Every backend piece of real push notification infrastructure is built and verified as far as this
agent can verify it without a physical device: `User.expoPushToken` (real migration),
`notifications.registerPushToken` (real mutation, verified via a real, validly-shaped test token),
`ExpoPushChannel` (real `expo-server-sdk` integration — a real send was confirmed to reach Expo's own
push API and receive a real, specific `DeviceNotRegistered` response for the fake test token used,
proving the integration itself is genuine, not mocked). **What this agent cannot do**: register a
real device's push token (that requires the frontend's own `expo-notifications` work — Sprint 3
frontend Task 3's rewritten FE11 — running on a real physical device; simulators don't deliver real
push) and confirm actual on-device delivery via Expo's push-receipt API, the task's own explicitly
required verification bar (a send succeeding isn't the same as the real notification arriving).
Founder action: install the app on a real device, sign in, let it register a real push token, open a
real gate with the app backgrounded, and confirm the notification arrives — then check Expo's
push-receipt API for that ticket to confirm real delivery, not just acceptance. See
`sprint3/reports/task7.md`.

### Open — M2/M3: complete a real Google OAuth consent to get a fresh, valid per-channel refresh token (Sprint 3 Task 5)
`AgentCredential` storage, the real in-app connect flow (`channels.getYoutubeConnectUrl` →
`/oauth2callback`), and all three YouTube client modules' migration off `env.YOUTUBE_REFRESH_TOKEN`
are all built, migrated, and verified as far as this agent can verify them — but two of the task's
three real-verification requirements are blocked on the same real, external fact, confirmed live, not
assumed: **the founder's existing `YOUTUBE_REFRESH_TOKEN` (migrated into their channel's
`AgentCredential` row) is itself expired or revoked at Google's end.** Confirmed two ways: (1) a real
publish attempt with the env var genuinely unset reached Google using the migrated credential and got
a real `invalid_grant` / *"Token has been expired or revoked"* response; (2) independently, a raw
`curl` POST of the exact plaintext token straight to `https://oauth2.googleapis.com/token` (outside
this project's code entirely) produced the identical error. Most likely cause: this OAuth client is
still in Google's "Testing" publishing status, where test-user refresh tokens expire after a fixed
window, regardless of use. **Founder action**: sign in with your Google account and complete a fresh
consent — either by re-connecting your own existing channel through the new in-app flow
(`GET /channels/:id/youtube/connect`, then follow the returned URL — replaces re-running
`scripts/youtube-oauth.ts` and re-pasting into `.env.local`), or by connecting a genuinely new second
channel the same way. This agent cannot do this step itself: it requires signing in to a real Google
account, which is categorically out of scope regardless of authorization. Once done, re-run a real
publish and a real stats poll (both already coded and ready) to close out Task 5's M3 verification —
no further code changes are expected to be needed. See `sprint3/reports/task5.md`.

### Open — the YouTube OAuth client's registered redirect URI needs updating once a real deployed callback URL exists (Sprint 3 Task 5)
M2's real in-app connect flow moves `YOUTUBE_REDIRECT_URI` from `scripts/youtube-oauth.ts`'s dev-only
`http://localhost:3000/oauth2callback` default to the real deployed API's own `/oauth2callback` route.
Once a real deployed URL exists, the founder must also update the registered redirect URI in the
Google Cloud Console's OAuth client settings (APIs & Services → Credentials → this OAuth 2.0 Client
ID → Authorized redirect URIs) — the same "external console step, hand this off" posture Week 1 Task
7 and Sprint 3 Task 4/L2 both already use. Not blocking today (local dev still uses the working
localhost default); blocking only once a real deployment target exists. See
`sprint3/reports/task5.md`.

### Open — L2: confirm the real YouTube API quota console numbers match the assumed defaults (Sprint 3 Task 4)
Not a blocking request — a real, quick verification. Live research (Google's own current developer
docs, fetched directly) found the task's own assumed cost model was stale: `videos.insert` now costs
~1 unit in its own dedicated 100-calls/day bucket (changed 2025-12-04 and again 2026-06-01), not the
~1,600 units from the shared pool the task text described. At a realistic ~10-tester cadence, the
real estimate is comfortable headroom against the documented default 10,000-units/day shared pool —
**but this project's own actual Google Cloud Console quota numbers were never checked live**, since
that page requires the founder's own Google login (confirmed live: no authenticated session exists in
this environment, and entering credentials on the founder's behalf is out of scope regardless). A
real 2-minute check — `console.cloud.google.com` → APIs & Services → YouTube Data API v3 → Quotas —
confirms whether this project's real numbers match the assumed defaults (a prior increase or
restriction would change the estimate). No quota-increase request is warranted by the real math as
computed; this is a verification item, not a founder-action-required-to-unblock item. See
`sprint3/reports/task4.md`.

### Open — H1: custom-thumbnail permission — a separate eligibility gate from long-uploads verification (Sprint 2 Task 5)
`setThumbnail`/`thumbnails.set` is built, wired into Publishing (isolated — see §5), and confirmed
**live** to fail every real attempt so far with a real `403`:
```
{"error":{"code":403,"message":"The authenticated user doesn't have permissions to upload and set custom video thumbnails.","errors":[{"reason":"forbidden","domain":"youtube.thumbnail","location":"Authorization","locationType":"header"}]}}
```
This corrects an assumption `sprint2/tasks/task5.md` itself made before implementation: a real
`channels.list?part=status` check showed `longUploadsStatus: "eligible"` (phone-verified for long
uploads) and that was taken as proof the channel could also set custom thumbnails. Live testing
proves that's a **separate eligibility gate** — the OAuth token already carries `youtube.upload`
(one of the scopes Google's own docs list as sufficient for this endpoint), and `longUploadsStatus`
is genuinely unrelated to it. The real, most likely fix: YouTube Studio → Settings → Channel →
Feature eligibility → Custom thumbnails, which can require its own (separate) verification step or
a brief review period even on an otherwise phone-verified channel — not confirmed live yet, since
it's a founder-side Studio UI action, not something checkable via the API itself.
Not blocking: `setThumbnail`'s failure isolation is itself real-verified (see §5) — the run that hit
this real 403 still completed publishing successfully, with `coverFrameSet: false` recorded
truthfully in the stage output. Once the founder confirms/enables the feature in Studio, re-run a
fresh private test upload and confirm `thumbnails.set` succeeds with a `videos.list?part=snippet`
read-back showing the real custom thumbnail URL. — *`sprint2/reports/task5.md`*

### Open — G1: the YouTube Analytics API, two real, distinct actions (Sprint 2 Task 4)
`watchTimeMinutes`/`retentionPct`/the new `retentionCurve` (G2) all stay `null` for every real video
until this closes. Confirmed **live**, against this project's own real credentials, not guessed —
two separate blockers, not one:

1. **The YouTube Analytics API itself is not enabled** for this project's Google Cloud console. A
   real call today returns a real `403 PERMISSION_DENIED` (`reason: SERVICE_DISABLED` /
   `accessNotConfigured`): *"YouTube Analytics API has not been used in project 714472645139 before
   or it is disabled. Enable it by visiting
   https://console.developers.google.com/apis/api/youtubeanalytics.googleapis.com/overview?project=714472645139
   then retry."* — a one-click enablement in Cloud Console, same account already used for the
   existing YouTube OAuth app.
2. **The OAuth token doesn't carry the `yt-analytics.readonly` scope** — the original grant
   (Week 1 Task 7) only requested `youtube.upload`/`youtube.readonly`. Re-authorizing the existing
   OAuth app with the added scope is same-day once the founder clicks through consent (same posture
   `sprint2/tasks/task4.md` itself describes) — not yet confirmed live, since (1) blocks the request
   from even reaching a scope check today.

Not blocking the rest of the sprint or this task — `sprint2/reports/task4.md`'s G2 work is built and
verified against a real stub matching the Analytics API's documented response shape
(`YOUTUBE_ANALYTICS_STUB=1`), and the real call path is verified to fail loudly and specifically
(not a generic auth error) rather than silently, so this is obviously a founder-action gap if
someone runs it prematurely. Once both actions above are done, re-run the real (non-stub) path
against a real published video and confirm a genuinely non-null, monotonic-shaped `retentionCurve`
— see `sprint2/reports/task4.md`'s Verify section for the exact steps.

**All four rows previously here are closed** — Week 5 Task 1 ran a real, credentialed,
founder-gated end-to-end test: real YouTube OAuth (upload confirmed `private` via a direct API
check), real `OPENAI_API_KEY`/`PEXELS_API_KEY` (real TTS + real, on-topic Pexels footage), and both
Gate 1/Gate 2 answered live by the founder over actual Telegram (`"Approve"`, in real time) —
closing the live-human-reply item open since Week 2 as well. See `week5/reports/task1.md` for the
full evidence trail (real `youtubeVideoId`, real review verdicts, real spend).

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

- **`script_review` has no budget check of its own** — only `script_generation`'s retry entry point
  (`state-machine.ts`, its `isBudgetAvailable` call) and `video_generation`'s regen entry point call
  `isBudgetAvailable`; a review call itself is ungated on both loops. Confirmed real: a run could in
  principle overshoot its ceiling by exactly one review call's worth of spend (a Haiku-class call,
  ~$0.0025 per existing usage-row evidence) before the next check catches it. Not fixed: the maximum
  possible overshoot across Bugs Task 3/R3's own bounded retry loop (at most ~4 review calls per run) is
  on the order of a cent — not worth a third `isBudgetAvailable` call site at current scale. Revisit if
  review-call volume or cost per call ever changes materially. — *`bugs/Sprint3/reports/task6.md`*

- **On Windows, stopping a background *task* does not reliably stop the *process tree* it spawned** — `npx tsx <script>` chains through several `node.exe` processes (npx → the tsx CLI → the actual runtime executing the script); killing only the outermost shell/task leaves the real work running undetected in the background. Bit Week 3 Task 5's live kill-and-resume test once already, and bit Week 4 Task 4's mid-`publishing` kill test the same way on a first attempt — caught both times by checking `tasklist`/`Get-CimInstance Win32_Process` for the actual PIDs and force-killing the whole tree directly, not the wrapper. Correctly applied on the first attempt in Week 5 Task 1's real re-run of this same test. Not a code bug, a testing-methodology note worth remembering before the next live kill test. — *`week3/reports/task5.md`, `week4/reports/task4.md`, `week5/reports/task1.md`*

- **Closed by Sprint 3 Task 7 (O2)** — `dry-run.ts`'s live gate commands (`gate1-live`/`gate2-live`) used to be unable to coexist with a persistent `npm run dev` instance on the same Telegram bot token (both started a long-poll loop, and Telegram allowed only one active `getUpdates` poller per token). Moot now that Telegram is retired entirely — no bot, no poller, no possible conflict. See `sprint3/reports/task7.md`.

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

- **CLOSED — both gate *resolution* ownership (Sprint 3 Task 2, K1) and run/channel *creation*-time
  ownership (Sprint 3 Hardening) are now checked.** Originally flagged in Task 1 as one combined
  "gate/channel ownership" gap; live work on Task 2 clarified these are two genuinely separate checks,
  not one — both are now closed. **Closed (K1)**: `runs.gate1`/`gate2` reject a gate-resolution
  attempt from a session that doesn't own the run's channel (`FORBIDDEN`, not a generic 401/403) —
  real, live-verified against a genuinely separate second tenant, a same-tenant non-owner, and an
  ownerless channel (fail-closed to "tenant owner-role only"). See `sprint3/reports/task2.md`.
  **Closed (Sprint 3 Hardening)**: `runs.create` now checks `channel.tenantId === ctx.tenantId`
  immediately after the existing not-found check, reusing `assertGateOwnership`'s own `FORBIDDEN`
  shape/message convention rather than a second authorization-error style. Real, live-verified: a
  genuinely separate second tenant's session attempting `runs.create` against the first tenant's real
  channel got a real `403 FORBIDDEN`, confirmed by a direct Postgres read that zero `PipelineRun` rows
  were created for that attempt; the same session's own channel, and the first tenant's own channel
  from its own session, both still succeeded normally (the regression check). See
  `sprint3/reports/task1.md`, `sprint3/reports/task2.md`, `sprint3/reports/hardening-tenant-check.md`.

- **The API server's CORS registration stays permissive (`origin: true`) through Sprint 3 Task 1.**
  Real per-user sessions now exist (magic-link JWTs), but any origin can still send a request carrying
  one — the registration's own comment has called this "dev-only, single-operator" since the frontend
  track first added it, and that framing is now slightly stale (a stolen/leaked session token is a
  more real risk with actual per-user credentials than with one shared ops token). Not tightened this
  task (explicitly noted as a natural follow-on once a real deployed frontend origin exists to build
  an allow-list from, not blocking). Worth prioritizing once real testers carry real sessions, not
  indefinitely. — *`sprint3/reports/task1.md`*

---

## 3a. Where the open items in Section 3 are handled (added 2026-10-11)

| Item | Handled by |
|---|---|
| `script_review` has no budget check of its own | Bugs Task 12 R10.3 |
| Restart-safe gate reopening has no staleness filter (old paused gates re-send on every boot) | R6.2 and R6.4 (R10.9) |
| `pipeline_runs.retryCount` is dead schema | R10.6 (comment and note; no migration) |
| No lint rule for the `client.ts` / `registry.ts` import boundary | R10.2 |
| 7-channel cap has no automated test | R10.12 |
| API boot gates on `API_AUTH_TOKEN` alone | R10.5 |
| `.env.example` is stale | R10.1 |
| Watermarks uploaded before Task 12 have no R2 mirror | R10.8 |
| Intake parsing is on the premium tier (the repo's C1 note in Section 2 says it was moved; re-check the registry) | R10.4 |
| `videos.delete` needs a broader scope; publishing upload idempotency window | Section 7 (not fixable by code) |

---

## 4. Real design findings worth a decision (not bugs — open questions surfaced by live testing)

**Found 2026-10-10 and 2026-10-11 on the preview server and the phone** (evidence: `docs/execution/bugs/Sprint3/reports/closure2-phone-verification.md`; all handled by Bugs Task 12, `Sprint3/tasks/task12.md`):

- **Stock footage cannot cover abstract topics, and the run just stops (F1).** A Lego brief on Underdogs (stock footage) had its middle frame rejected by video review on all three attempts as generic business footage; the regeneration cap (2) was reached and the run parked as "Video retry limit reached". **Decided**: one extra attempt with AI stills after the cap (Task 12 R1). Other directions (feed the reviewer's replacement text into the next search, concrete search terms for stock channels, plain-language reason on the Run screen) stay candidates. Whether the clips changed between attempts is answered from the Task 13 attempt bundle (F4, C2).
- **Manual Retry has no cap (F2).** A cancelled 29 Sept run has 11 failed `video generation` attempts. **Decided**: cap manual Retry and Revise at 3 per stage per run (Task 12 R2).
- **Cancelled runs and rejections were counted as failed on the Dashboard (F4, confirmed 2026-10-11).** 42 runs: 18 completed, 21 failed (16 cancelled, 5 rejected), 2 needs_attention, 1 paused. **Decided**: cancelled out of the count; rejections kept and labelled "rejected" (Task 12 R3).
- **Revise then Retry at Gate 2 after the regeneration cap leaves a zombie run and can crash-loop the server (2026-10-11).** Task 12 R5.
- **Push: Gate 1 never arrives, Gate 2 repeats on every boot, Expo receipts show `DeveloperError`.** Task 12 R6.
- **The stock path raises no longest-shot warning (F5).** Exempt on purpose or a bug; Task 12 R8 answers it.
- **Underdogs rendered without captions (F6): intended**, nothing to fix.
- **"YouTube connected" only means a credential exists.** It stays true after the token expires. Task 12 R13.

- **The aggregated Video Generation `UsageEvent` row's `provider`/`model` fields are a judgment call, not a confirmed convention.** One row covers two different (provider, model) pairs (TTS + transcription), so `provider` is hardcoded `'openai'` and `model` becomes a composite string (`"tts-1-hd+whisper-1"`), with the real breakdown in `metadata`. Flagged for confirmation the same way the $2.00 budget ceiling was — never explicitly confirmed by you. — *`week3/reports/task2.md`*
- **Handled by Task 12 R10.7 (cap the window, skip channels that need reconnecting).** **Performance Analytics polls every historical published video, forever — a real, unbounded quota-cost growth pattern (Sprint 3 Task 4, L2).** `runPeriodicPoll` (`performance-analytics/index.ts`) queries every completed run with a published video on each tick (default every 6h), not just recently-published ones. Each poll is cheap (`videos.list`, 1 unit) and today's volume is a non-issue, but the cost grows with the *cumulative* count of ever-published videos, not daily upload volume — at a real ~10-tester cadence, a few months of sustained use could put this in the thousands-of-units/day range purely from polling old videos whose metrics have long since stabilized. Not urgent (real near-term headroom is comfortable against the 10,000-unit/day shared pool), but worth a real fix before it becomes one — e.g. stop polling a video N days/weeks after publish. — *`sprint3/reports/task4.md`*
- **Superseded 2026-10-11 (Task 12 R7): the new-tenant default is now $10 a week, split equally across the channels that have YouTube connected.** (Closure part 1 had already removed the $2.00 default; `invite-tenant.ts` required `--weekly-budget` until R7.) Original item: **The default new-tenant `AgentQuota.budgetCeilingUsd` ($2.00, Sprint 3 Task 4, L1) reuses the founder's own original, never-explicitly-confirmed figure** rather than a fresh number — a deliberate choice (consistency over guessing a new one), but still genuinely unconfirmed by you, same as the original. — *`sprint3/reports/task4.md`*
- **CLOSED, not viable as scoped — Title/thumbnail A/B testing (H2, Sprint 2 Task 5).**
  `MVP_PART3_CONTENT_QUALITY_AND_GROWTH_LOOP.md` §2 proposed Publishing drive YouTube's native
  title/thumbnail "Test and Compare" feature directly. Live research against Google's own current
  (2026) documentation found two disqualifying facts, not one: (a) **Shorts are explicitly
  excluded** — "You are not able to A/B test Shorts... A/B testing is not available for Shorts" —
  this project's entire content type; (b) the feature has **no programmatic API surface at all** —
  it's accessed "only available on computers through YouTube Studio," confirmed against the YouTube
  Data API v3 reference (no `videos.update` field or endpoint for it). Closed with a real, cited
  reason rather than built blind or silently dropped — see
  [YouTube Help: A/B test titles and thumbnails](https://support.google.com/youtube/answer/16391400).
  If this is ever revisited, it would need a genuinely different, non-native mechanism (e.g.
  publishing two variants and switching manually based on early performance), a real design change,
  not the original recommendation. — *`sprint2/reports/task5.md`*

---

## 5. Verified-but-not-exercised (built and reviewed, but never actually hit by a real test)

- **Obsolete since Sprint 3 Task 7 (Telegram was retired; Gate 2 now lives in the app).** **Gate 2's too-large-video fallback** (link/local-path notice instead of attaching the file when a video exceeds Telegram's ~50MB bot-upload limit) — implemented, code-reviewed, never exercised, since every real test video so far is ~1.3MB. — *`week3/reports/task4.md`*
- **Closed by Sprint 3 Task 9 R3 (a real PNG was rendered and seen by raw-pixel inspection, then removed).** **Video Generation's watermark/brand overlay** — wired into the FFmpeg filter graph, untested, since no channel in the dev DB has `brandAssets.watermarkUrl` set. — *`week3/reports/task2.md`*
- **The LLM/media layers' transient-error retry path** (rate limits, 5xx) — both `studio/src/llm/` and `studio/src/media/` have only had their *non-transient* (auth failure) error mapping verified against a real API error. The transient path inherits from the SDKs' own retryability flags rather than custom logic, so risk is judged low, but it's genuinely untested. — *`week2/reports/task1.md`, `week3/reports/task1.md`*

---

- **Failed-render usage booking (Bugs Closure part 2, P5)** — merged in PR #57 with mock tests (a failure after narration, one after image generation); never hit by a real render failure. When one happens, check `usage_events` for a `video-generation` row with the real provider, model and cost instead of `unknown`. — *`bugs/Sprint3/closureTask2.md`, `bugs/Sprint3/reports/closure2-phone-verification.md`* (Task 12 C4)

## 6. Not yet built

- **Deferred agents per the locked design** (not gaps — deliberately out of MVP scope): Trend Identification, Content Prediction, Continuous Learning, and Video Intelligence's "competitor" mode. All wait on real performance history or later product phases — see `AGENT_FLEET_DESIGN.md` Section 3 for the full status table.
- **Real YouTube Analytics API integration for `watchTimeMinutes`/`retentionPct`** (the single-number
  summary fields, distinct from the new `retentionCurve` — see §1's G1 for that) — Sprint 2 Task 4
  built the real timestamp-level `retentionCurve` capture, but the two older summary fields would
  need their own separate Analytics API report (a different metric/dimension pair) not attempted in
  this task. `views`/`likes`/`comments` (Data API) are real and working as of Week 5.
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
- **A real, live Content-ID/licensing-risk API check** — Sprint 2 Task 3's F2 is deliberately a
  manifest-integrity check only (does the curated `audio-bed/manifest.ts` entry this project itself
  authored carry a `license` field), not a call to any real Content-ID service — no such public API
  exists to call synchronously at generation time. Real exposure today is low (every current track
  is self-synthesized, genuinely `CC0`), but the moment a non-curated audio or visual source is ever
  added (a real music API, a stock-footage vendor beyond Pexels, user uploads), a real risk check
  against whatever that source's own platform offers becomes worth building — not attempted here,
  per the design doc's own "expensive way to learn this" framing for why it's worth getting ahead
  of, not urgent to solve immediately. — *`sprint2/reports/task3.md`*

---

---

## 7. Not fixable by code (and why) — added 2026-10-11

These need something outside the codebase: a Google review, a provider's published information, another account's settings, or the founder. Each says what is needed and who does it.

| Item | Why code cannot fix it | What would close it |
|---|---|---|
| **OAuth consent screen in Testing: 7-day token expiry, 100 test-user cap** | Google enforces both on projects in Testing. Code can only detect the expiry and say "Reconnect needed" (Bugs Task 12 R13). | Accepted 2026-10-11 (founder, F7): weekly reconnect. Google's production (sensitive-scope) verification is out of scope; it would need domain ownership, a privacy policy, consent-screen details and a demo video. |
| **Free stock libraries hold no concrete footage for abstract topics** (the Lego example) | A library cannot return clips it does not have. R1 limits the damage with one AI-stills attempt. | Use `ai-stills` for such channels, or a paid or curated library. A founder product choice. |
| **`videos.delete` and other broader YouTube scopes** | The granted scope is `youtube.upload` / `youtube.readonly`; Google requires a fresh consent for more. | Re-consent with a broader scope, only if programmatic video deletion becomes worth having. |
| **Upload-in-flight idempotency window** | `videos.insert` takes no client idempotency key, so a process death while the request is in flight cannot be detected on resume. | Nothing short of YouTube adding an idempotency key. Accepted narrow risk. |
| **Custom thumbnails return 403 (H1)** | YouTube grants custom thumbnails only to channels that pass its own phone verification. | The founder verifies each channel's phone with YouTube (Sprint 4 hardening note). |
| **`gpt-image-1.5` shutdown (2026-12-01): new price unpublished, look must be approved** | OpenAI has not published the new per-image price or size support; the founder must approve the new look of the stills. | OpenAI's publication, then the migration task and the founder's contact-sheet approval. |
| **Expo push delivery** | Delivery depends on Expo's and Google's services; receipts arrive after the send and cannot be forced. Code can send correct payloads and read the receipts (Task 12 R6). | Nothing further; verify on the device (F8). |
| **Windows kills only the outer shell of a test process** | A methodology note for live kill tests (`npx` spawns a process tree), not a code defect. | Check `tasklist` for the real PIDs before a kill test. |

