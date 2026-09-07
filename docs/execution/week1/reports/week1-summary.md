# Week 1 Summary: Foundation

**Dates**: Sep 7–13, 2026 (executed 2026-09-07)
**Status**: Core deliverables complete and verified; two items pending founder action
(Telegram bot token, Google Cloud OAuth/quota steps); real-LLM verification deliberately
deferred pending an LLM abstraction layer redesign.

## What Got Built

- **Repo**: TypeScript + Prisma + Postgres project scaffolded fresh at `7AI/` (git initialized
  this session — the folder wasn't a git repo before). No code reused from `yt_shorts`.
  `npm run build` and `npm run lint` both pass clean throughout.
- **Database**: Postgres 18 (already installed locally as a Windows service) — created a
  dedicated `sevenai_app` role + `sevenai_dev` database rather than using the superuser
  directly. All five foundation tables (`tenants`, `channels`, `pipeline_runs`,
  `pipeline_stages`, `review_logs`) migrated exactly per `SCHEMA.md`, including the five
  hand-added `CHECK` constraints and the MVP tenant seed row. Migration confirmed idempotent.
- **Orchestrator skeleton**: `PipelineRun`/`PipelineStage` state machine with real
  persist-before-advance semantics, a generic retry/circuit-breaker wrapper, and idempotent
  resume-on-startup. **Proved resumability with an actual kill-and-restart**, not just a unit
  test (see Task 4's report) — no duplicate runs, no lost work, clean re-attempt from
  persisted state.
- **Intake parsing**: Wired to a real Anthropic Messages API call with Zod-validated output
  and a proper transient/non-transient error split (`needs_attention`, never `failed`, on a
  bad brief). Verified end-to-end against a stub (see Deviations below for why not a real key).
- **Telegram bot**: Code complete (`grammy`-based send/receive loop, no gate logic per this
  week's scope) but **not run against a real bot token** — founder chose to defer bot creation.
- **YouTube OAuth**: A ready-to-run OAuth script (`scripts/youtube-oauth.ts`) plus a
  step-by-step checklist for the founder's own Google Cloud Console steps (project, API
  enablement, OAuth consent screen, client creation, quota increase submission) — the actual
  submission is explicitly a founder action per the Week 1 brief.
- **TTS/video toolchain spike**: Researched and recommended — OpenAI TTS (cost) + hosted
  word-level-timestamp transcription (captions) + FFmpeg (assembly, no paid rendering SaaS),
  deferring ElevenLabs to a later per-channel voice upgrade. `MVP_ROADMAP_OCT15.md` Section 15
  updated from 🟡 to ✅.

## What Deviated from the Docs, and Why

1. **Prisma version pinned to 6.19.3, not "latest."** `latest` resolved to a Prisma 8
   release candidate with a breaking datasource-config change; pinned to the last stable 6.x
   line instead. Doesn't affect `SCHEMA.md`'s field-level shape — flagged in Task 1's report.
2. **Two `.env` files** (`.env` for the Prisma CLI, `.env.local` for the app), both holding
   `DATABASE_URL`, because Prisma's CLI doesn't auto-load `.env.local`. Minor duplication to
   keep in sync — flagged in Task 2's report, not fixed silently.
3. **Real-LLM verification for Task 4 (resumability) and Task 5 (Intake) is deferred, not
   skipped.** No Anthropic API key was available this session, and — per direct founder
   instruction mid-session — we're about to redesign the LLM call layer to be
   provider-agnostic and per-capability-configurable, which will likely replace
   `parse-brief.ts`'s current direct `@anthropic-ai/sdk` call. Verifying against a real key
   today, on code expected to be rewritten, wasn't worth the cost. Instead, both tasks were
   verified against a deliberately minimal stub (`stubParseBrief` in `parse-brief.ts`,
   gated by `INTAKE_STAGE_STUB=1`) that proves the state-machine mechanics, schema validation,
   and both success/failure paths — everything except "is the LLM output actually sensible."
   **Both criteria are flagged as pending — blocked on the LLM abstraction layer** in Task 4's
   and Task 5's reports, so this doesn't get silently lost. Once that layer exists (or a key
   is supplied), re-run `scripts/dry-run.ts` without the stub flag to close this out.
4. **Telegram send/receive not proven live.** Code is written and reviewed; the founder chose
   to skip creating a bot token this session. Task 6's report has exact steps to close this
   out in under 5 minutes once a token exists.
5. **YouTube quota submission and OAuth client creation not done.** Both explicitly require
   the founder's own Google account — per the Week 1 brief's own framing, this was never
   expected to be delegated. Task 7's report has the full checklist.

None of these deviations required changing `SCHEMA.md` or `BUSINESS_LOGIC.md` — the schema
and control-flow rules as documented were implemented as written.

## Deliverables Checklist (from the Week 1 brief)

- [x] New repo scaffolded (TypeScript + Postgres), no code reused from `yt_shorts`
- [x] Postgres running locally, connection verified
- [x] Migration applied: `tenants`, `channels`, `pipeline_runs`, `pipeline_stages`, `review_logs`
- [x] Orchestrator: state machine + Intake parsing, resumable across a restart (real kill/restart test performed)
- [ ] Telegram bot: send/receive loop proven working — **code complete, live proof pending your bot token**
- [ ] YouTube API quota increase request submitted; OAuth set up for channel #1 — **plumbing complete, submission pending your Google Cloud steps**
- [x] TTS + video-assembly toolchain spike complete, with a written recommendation

## What Should Feed Into Week 2 Planning

- The LLM abstraction layer redesign (mentioned above) should land, or at least have its
  interface shape decided, before Week 2's Script Generation task — otherwise Script
  Generation risks the same "built against a call site that's about to be replaced" situation
  as this week's Intake parsing.
- `pipeline_runs.retryCount` exists on the schema but nothing increments it yet — low-priority,
  but worth deciding in Week 2 whether it should track total retries across all stage attempts
  or something narrower, before more stages start writing to it.
- No automated test runner was set up this week (out of scope — Week 1 has no CI requirement).
  The 7-channel cap and the resumability mechanics were verified by direct exercise against
  real Postgres state, not by a test suite. Worth deciding on a test runner early in Week 2
  before Script Generation/Script Review add more business logic worth regression-testing.
- Once you complete Task 6 and Task 7's founder-side steps, it's worth a quick end-to-end
  smoke test (real brief -> real Intake call -> Telegram notification) before Week 2 builds
  Gate 1 on top of it.

## Separate Item Found, Not Acted On

A file named `RESTRUCTURE_DOCS_AND_CODE.md` was found at the `7AI/` root — pre-existing, not
something created this session. It's a self-contained task (written to be "pasted into Claude
Code") proposing a folder restructure: wrapping `decisions/`, `design_doc/`, `execution/`,
`roadmap/` under a new `docs/` folder, and renaming `src/` to `studio/`. Since it wasn't
something you asked me to execute in this conversation, I left it alone rather than assuming
it was live instructions — flagging it back to you so you can decide whether and when to hand
it over as its own task.
