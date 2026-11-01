# MVP Part 2 — Multi-User Layer & Flexible Video Creation (Design Capture)

**Status**: Not in scope yet. This is a thinking-ahead capture, written so that when Week 5 Task 2's
bug-fix pass is done and the MVP is stable on one channel, a real task file can be written straight
from this doc instead of starting from a blank page. Nothing here should be built yet.

**Trigger for writing this now**: the plan to hand the app to ~10 test people, plus the goal of
making video creation flexible (voice choice, visual style — stock footage vs. anime/cartoon/etc.)
rather than the single hardcoded pipeline it runs today.

---

## 0. Decided: each tester connects their own YouTube channel; AI keys stay shared (yours)

Resolved (was an open question in the first draft of this doc): each of the ~10 testers brings and
connects their own YouTube channel — full per-user OAuth is genuinely needed, not the lighter
"everyone reviews one shared channel" version. Anthropic/OpenAI/Pexels calls run on your keys, not
theirs — testers don't need their own AI provider accounts to try the product.

This is a sensible, common shape (the thing that's *theirs* — channel, audience, monetization — stays
theirs; the thing that's shared infrastructure stays centralized) but it makes a few things
non-optional that weren't urgent before:

- **Per-tenant budget enforcement is now required, not someday — picked up by Sprint 3 Task 4 (L1).**
  `KNOWN_ISSUES_AND_BLOCKERS.md` Section 3 already flags "pooled per-platform budget has no
  fair-access policy across channels" as a future concern for a second channel of *yours*. With 10
  people sharing your keys, one tester without a real per-tenant ceiling can both overspend and starve
  the other nine. The existing approval-gate design (nothing renders or publishes without a human
  approving first) already limits runaway spend structurally — worth keeping that property, not
  something to relax later for convenience — but each tenant still needs its own real `AgentQuota`
  ceiling, enforced, before this goes to real testers.

  **Closed**: every real `Tenant` created via the real invite flow (`scripts/invite-tenant.ts`) now
  gets a real `AgentQuota` row in the same transaction, no longer only the founder's own hand-seeded
  one. Verified live: a genuinely new tenant's first real brief passed the real budget gate. See
  `docs/execution/sprint3/reports/task4.md`.
- **YouTube API quota is per Google Cloud project, not per connected channel — investigated by
  Sprint 3 Task 4 (L2).** If all 10 testers authorize through the one OAuth app already registered
  (`YOUTUBE_CLIENT_ID`), their uploads *and* Performance Analytics' polling all draw from one shared
  daily quota. Worth checking current quota and requesting an increase proactively (historically 1-2
  week lead time, same lesson as Week 1 Task 7) rather than discovering the ceiling live during the
  test.

  **Investigated, no increase requested**: real, primary-source research found this note's own cost
  assumption stale — `videos.insert` now costs ~1 unit in its own dedicated 100/day bucket (not
  ~1,600 units from the shared pool), a real API change in the last year. At a realistic ~10-tester
  cadence, the real estimate shows comfortable near-term headroom against the shared 10,000-unit/day
  pool; the actual longer-term risk is Performance Analytics' own unbounded "poll every historical
  video forever" design, not upload volume. This project's *actual* Cloud Console quota numbers
  couldn't be checked live (requires the founder's own Google login) — a real, quick verification
  item, not a blocking request. See `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md` §1/§4 and
  `docs/execution/sprint3/reports/task4.md`.
- **Other people's real OAuth refresh tokens need real security handling** — encrypted at rest (not
  stored the way the single env-var token is today), scoped to the minimum
  (`youtube.upload`/`youtube.readonly`, same as now, no broader ask), with a clear disconnect path in
  the app.
- **"AI costs on us" should be treated as a testing-phase decision, not the permanent model by
  default.** Worth a deliberate look later — subscription-plus-usage, or an optional bring-your-own-key
  path for power users — once this moves past 10 friendly testers, rather than letting the testing-phase
  default quietly become "the model" without anyone choosing it on purpose.

---

## 1. Multi-user / account layer

### What's already there (better starting point than it looks)
Every table in `schema.prisma` — `Channel`, `PipelineRun`, `UsageEvent`, all of them — already
carries a real `tenantId`. The data model was shaped multi-tenant from Week 1, even though the code
has only ever used one hardcoded `MVP_TENANT_ID`. That's the cheap part already done; what's missing
is everything *around* the data model.

### What's actually missing
- **No `User` model exists at all — picked up by Sprint 3 Task 1 (J1).** `Tenant` today stands in for
  "the founder's one account," not a real many-user structure. Needs: a real `User` table, and a
  decision on the User↔Tenant↔Channel relationship — one user per tenant? multiple users per tenant
  with roles (owner/approver/viewer)? Does a "tenant" become "one person's whole account" the way it
  conceptually already half-is, or does it become "one team," with users inside it?

  **Closed**: a real `User` table (`tenantId` FK, `email` unique, `role`). Decision made concrete: a
  `Tenant` is one account (an individual or small team), a `User` belongs to exactly one `Tenant` —
  not a many-to-many join, since each of the ~10 testers brings their own account per this doc's own
  §0. Two roles only — `owner` (everything) and `approver` (view + approve gates) — matching this
  section's own "probably just 'the channel's owner' to start" gate-ownership note. The founder's own
  `MVP_TENANT_ID` row was seeded with a real `User` (`owner`) in the same migration. See
  `docs/execution/sprint3/reports/task1.md`.
- **No real per-user auth — picked up by Sprint 3 Task 1 (J2).** The API is `publicProcedure` today,
  gated only by one blanket `API_AUTH_TOKEN` (a dev-only CORS story on top of that, per
  `KNOWN_ISSUES_AND_BLOCKERS.md`). Needs real sessions/identity — worth considering something
  lightweight first (magic-link email, or even Telegram-based login since Telegram's already wired
  in) rather than building a full auth system before it's needed.

  **Closed**: real magic-link email login — a signed, short-lived (15 min), single-use JWT
  (DB-tracked via a new `LoginToken` table, since a signature alone doesn't prove first-use), verified
  at `/auth/verify` and exchanged for a real session JWT (`userId`/`tenantId`/`role`, no DB session
  table needed). No transactional-email provider exists yet, so for now the real link is logged to
  the server console and relayed over the existing Telegram channel — a real, working flow, not a
  stub. `api/trpc.ts` gained a real `Context`; every `publicProcedure` that used to read the hardcoded
  `MVP_TENANT_ID` now reads `ctx.tenantId`, verified live against a genuinely separate second tenant
  (not just the founder's own, where the values would coincidentally match). `API_AUTH_TOKEN` is
  downgraded to an explicit ops/script fallback, not removed. See
  `docs/execution/sprint3/reports/task1.md`.
- **Per-user notification routing — picked up by Sprint 3 Task 3 (K2).** One hardcoded
  `TELEGRAM_FOUNDER_CHAT_ID` today. Ties directly into the Telegram-as-notify-only conversation
  already had — for a real multi-user product, in-app push through the dashboard is probably the
  right default channel, with Telegram as one optional channel a user links themselves, not *the*
  channel.

  **Closed**: exactly this shape — a real `InAppFounderChannel` (a new `Notification` table, a real
  `notifications.list` dashboard query), dispatched to always; Telegram dispatched to only if the
  recipient has linked it via a real `/link <code>` flow (`TelegramLinkCode` table), with a real
  disconnect path (`notifications.unlinkTelegram`). Verified live: a gate for an unlinked user
  produced only a real in-app row and resolved via the API alone; a real `/link` flow (simulated
  Telegram input) set a real `telegramChatId`; the founder's own existing flow (real Telegram message
  + real reply) still works, now also writing a real in-app row that gets marked resolved the same
  way. Found and fixed a real bug along the way (a reply-send failure could crash the message
  handler even after the underlying action succeeded) and a real privacy gap (every user's login link
  used to relay to the founder's own Telegram). See `docs/execution/sprint3/reports/task3.md`.
- **Gate ownership — picked up by Sprint 3 Task 2 (K1).** Right now "the founder" approves every gate
  for the one channel that exists. Multi-user needs an explicit answer to "who can approve gates for
  this channel" — not necessarily complex (probably just "the channel's owner" to start), but
  currently there's no concept of ownership to check at all.

  **Closed**: exactly the minimal shape this note anticipated — `Channel.ownerUserId` (nullable FK,
  backfilled to each tenant's seeded owner), checked before `gate1`/`gate2` resolve
  (`ctx.tenantId === channel.tenantId && (ctx.userId === channel.ownerUserId || ctx.role ===
  'owner')`), fail-closed on a null owner. Real, live-verified against a genuinely separate second
  tenant, a same-tenant non-owner, and an ownerless channel. Run/channel *creation*-time tenant
  ownership is a distinct, still-open gap (see `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md` §3). See
  `docs/execution/sprint3/reports/task2.md`.
- **Per-user YouTube credentials — decided above, was the biggest single piece of work. Picked up by
  Sprint 3 Task 5 (M1-M3).**

  **Closed, with one real founder-action item remaining.** A real `AgentCredential` table (encrypted
  at rest, AES-256-GCM), a real in-app connect flow (`channels.getYoutubeConnectUrl` →
  `/oauth2callback`, replacing the old one-time `scripts/youtube-oauth.ts` terminal script) with a
  real disconnect path (`channels.disconnectYoutube`), and all three YouTube client modules
  (Publishing, Performance Analytics' stats + retention-curve fetches) migrated off the single shared
  `env.YOUTUBE_REFRESH_TOKEN` onto real per-channel lookups — there is no code path left that reads
  the old env var for a real publish or stats poll. Encryption verified live via a direct raw-column
  DB read (genuine ciphertext, not the plaintext re-encoded). The connect flow's URL generation and
  Google-side wiring verified live (a real browser reached Google's actual consent screen, correctly
  identifying the app and scopes). **What's not yet proven live**: a real publish/stats-poll actually
  succeeding through the new path end-to-end — blocked on a real, external fact found during this
  task's own verification (the founder's existing refresh token is expired/revoked at Google's end,
  confirmed independently via a direct call to Google's own token endpoint, unrelated to this task's
  code). Closing this needs one real founder action: complete a fresh Google consent through the new
  in-app flow. See `docs/execution/sprint3/reports/task5.md` and
  `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md` §1.
- **Budget fairness across tenants — now required, see Section 0.**

---

## 2. Flexible video creation

### Why this is actually two different requests, not one
"Voice type" and "visual style" sound like one "more options" feature, but they're different in
kind: voice is a parameter within the pipeline that already exists (TTS is already happening — this
is just letting a choice through instead of always using the default). Visual style (anime/cartoon/
etc.) is a genuinely different *content-generation path* — today Video Generation only ever does one
thing: search real Pexels stock footage. That's not a parameter to add, it's a second (or third)
backend to build.

Worth knowing this was always the plan, not scope creep: `MVP_ROADMAP_OCT15.md` (archived, see docs/ARCHIVE_INDEX.md)'s own risk list
(Section 14) deliberately chose "TTS + captions + template/stock visuals" as the *simplest viable*
starting point specifically so the loop could be proven fast, with an explicit note to "upgrade the
visuals later once the pipeline itself is proven." This request is that later moment arriving on
schedule, not a detour.

### Voice
**Picked up and closed by Sprint 2 Task 1** (`docs/execution/sprint2/reports/task1.md`) —
`media/registry.ts` gained `TTS_VOICES` (OpenAI's real preset voices, sourced from the installed
SDK's own types), a per-channel `Channel.defaultVoice`, and a real per-brief override
(`PipelineRun.creationOptions.voice`, threaded through the API layer, never inferred from prose).
The three-step resolution order (override → channel default → hardcoded fallback) it establishes is
meant to be the pattern the "Visual style" and "Audio layer" items below reuse, not a
voice-specific one-off — see `docs/execution/sprint2/BUSINESS_LOGIC.md`.

~~Currently whatever `media/registry.ts` resolves as the default TTS voice for the `tts` purpose — no
choice exposed anywhere. Needs a voice selector (a per-channel default, overridable per brief),
probably starting with whatever preset voices OpenAI's TTS already offers before considering a
second provider. If a second provider ever becomes worth it, `llm/registry.ts` and `media/registry.ts`
already establish the provider-abstraction pattern to copy — no need to invent a new one.~~
*(original capture text, kept struck through rather than deleted — this doc stays a capture doc, not
a tracker, per its own stated posture; the note above is the actual current status.)*

### Visual style
**Picked up and closed by Sprint 2 Task 2** (`docs/execution/sprint2/reports/task2.md`) — took
exactly the "smaller lift" option this doc recommended: `ai-visuals/` (mirroring `stock-footage/`'s
`registry.ts`/`client.ts`/`types.ts`/`stub.ts` split) generates AI stills, animated Ken-Burns-style
via FFmpeg's `zoompan`, not full generative video (still open — see
`KNOWN_ISSUES_AND_BLOCKERS.md` §6). `ProductionPlan.visualSource` lives exactly where this doc said
it should, right alongside `captionStyle`. Video Intelligence's review rubric got the per-style
variant this doc anticipated ("a stylized/animated frame shouldn't be judged the same way a real
photographic stock frame is") — verified live via the reviewer's own language explicitly accepting
"stylized... illustrations" without penalty. User-uploaded footage as a third source remains
unbuilt, not scoped into this task.

~~This is the bigger piece. Needs a real `visualSource` concept — stock footage (what exists today) as
one option, AI-generated video/image as another (with its own real decision: full AI video generation
vs. the cheaper middle ground of AI-generated stills animated Ken-Burns-style, which is a much smaller
lift and worth seriously considering before jumping straight to generative video), and possibly
user-uploaded footage as a third. Each option has a genuinely different cost, latency, and quality
profile, and Video Intelligence's review rubric would likely need a per-style variant rather than one
rubric for everything (a stylized/animated frame shouldn't be judged the same way a real photographic
stock frame is).

Structurally, this fits naturally where `captionStyle` already lives — `ProductionPlan` (`plan.ts`)
is already the "plan-time creative decisions" object; `visualSource`-type choices belong right next
to it. And the module shape already used for `llm/`, `media/`, `stock-footage/` — a
`registry.ts`/`client.ts`/`types.ts`/`stub.ts` split with one boundary file per source — is exactly
the pattern a second/third visual-source backend should follow, not a new pattern.~~
*(original capture text, kept struck through rather than deleted — this doc stays a capture doc, not
a tracker, per its own stated posture; the note above is the actual current status.)*

### The UI layer these both imply
"Filter audio type, video type" is really: these choices should be explicit fields a user picks when
submitting a brief through the app, not something inferred from free-text prose by `parse-brief.ts`'s
LLM call. That's a more reliable design generally — an LLM guessing "this reads like it wants an
anime style" from a paragraph is a worse experience than a dropdown, and it keeps intake's actual job
(extracting topic/constraints) separate from these structured production choices.

---

## 3. Sequencing note

Everything above assumes Week 5 Task 2 (the bug-fix pass) and a real stable run on channel #1 happen
first — same reasoning as the deployment conversation: don't build a user layer or a second
content-generation backend on top of a resume-sweep bug or an unbounded caption/frame-sampling
failure mode. Once that's genuinely stable, this doc is the starting point for writing real task
files for Part 2 — Section 1 and Section 2 are independent enough that they could become separate
tracks (much like the backend/frontend `_BE`/`_FE` split already used in this repo) rather than one
giant task.
