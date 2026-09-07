# 7AI — Week 1: Foundation

**Status**: Ready to execute
**Dates**: Sep 7–13, 2026
**Companion docs**: [`MVP_ROADMAP_OCT15.md`](../../roadmap/MVP_ROADMAP_OCT15.md) Section 12 (this week's source of truth for scope) · [`AGENT_FLEET_DESIGN.md`](../../design_doc/agents/all_agents/AGENT_FLEET_DESIGN.md) Section 6 (schema authority) · [`SCHEMA.md`](./SCHEMA.md) · [`BUSINESS_LOGIC.md`](./BUSINESS_LOGIC.md)

**This is the single document to hand to Claude Code to kick off Week 1.** Unlike Week 2 onward, Week 1's tasks aren't split into separate files — the sequencing here is tight enough (repo → DB → schema → skeleton → bot → external setup) that splitting it would just mean constantly flipping between files. From Week 2, each task gets its own file under `execution/week2/tasks/`, following [`TASK_TEMPLATE.md`](../templates/TASK_TEMPLATE.md) — the template itself is never pasted to Claude Code directly, it's the pattern used to *write* the Week 2+ task files.

## Before You Paste This to Claude Code

Already done, no action needed: `SCHEMA.md`, `BUSINESS_LOGIC.md`, this file, `MVP_ROADMAP_OCT15.md`, and `AGENT_FLEET_DESIGN.md` already live at their canonical paths under `7AI/docs/` (`execution/week1/`, `execution/templates/`, `roadmap/`, `design_doc/agents/all_agents/` — see `AGENT_FLEET_DESIGN.md` Section 10), so the relative links above resolve as-is. `7AI/` is the root for both the docs and the code, split cleanly in two: `docs/` (this document and everything like it) and `studio/` (the code — Task 1's folder, see below). Point Claude Code at the `7AI/` folder and paste this file's contents directly; it doesn't need access to the Claude project this was drafted in.

This document also talks *to you*, not just to Claude Code — the section above, the founder-only parts of Tasks 7 and 8 (submitting the actual Google Cloud form, deciding the toolchain), and the "not founder-locked, flag if you deviate" notes throughout are for your review, not instructions for it to execute. That's fine to paste as one document — Claude Code reads task specs with human-facing context inline all the time (`yt_shorts`'s own weekly plans did the same), and it'll recognize a sentence addressed to "you" isn't a command to itself. The one thing worth doing yourself rather than delegating: Task 7's actual quota-request submission and Task 8's final toolchain pick are founder decisions: let Claude Code draft/research them, but don't expect it to click submit or decide for you.

Task 1 below includes scaffolding the project's `studio/` folder structure, not just `package.json`/tsconfig — Claude Code should create the actual directories as part of that task, following the tree given.

---

## Objective

Working repo, running Postgres with the five foundation tables, an Orchestrator skeleton that can accept a brief and run it through Intake with real resumability, a Telegram bot that can send and receive messages, and the two external, non-code dependencies (YouTube API quota request, TTS/video toolchain spike) moving in parallel. No real agents beyond Intake. No approval gates. No video.

## Deliverables Checklist

- [ ] New repo scaffolded (TypeScript + Postgres), no code reused from `yt_shorts`
- [ ] Postgres running locally, connection verified
- [ ] Migration applied: `tenants`, `channels`, `pipeline_runs`, `pipeline_stages`, `review_logs`
- [ ] Orchestrator: `PipelineRun`/`PipelineStage` state machine + Intake parsing, resumable across a restart
- [ ] Telegram bot: send/receive loop proven working
- [ ] YouTube API quota increase request submitted; OAuth set up for channel #1
- [ ] TTS + video-assembly toolchain spike complete, with a written recommendation

---

## Task 1: Repo Scaffolding & Tooling

**Objective**: A clean TypeScript project with linting, env config, and a working build — nothing reused from `yt_shorts`'s codebase (`MVP_ROADMAP_OCT15.md` Section 18).

**Depends On**: nothing

**What to do**:
- `npm init`, TypeScript, ESLint, `.gitignore`, `.env.example` / `.env.local`.
- Recommended (not founder-locked — flag if you deviate): Prisma as the DB client/migration tool, since it's a *tool choice*, not reused code, and keeps the "cron + Postgres, no magic" philosophy consistent with what `yt_shorts` already validated. Plain `pg` + hand-written SQL migrations is an equally acceptable alternative if Prisma's schema-first style fights the multi-table JSONB-heavy shape in `SCHEMA.md`.
- No web framework is required yet — the UI is Telegram-first (`MVP_ROADMAP_OCT15.md` Section 7), so don't scaffold Next.js or an HTTP server unless a later task needs one. A plain long-running Node process (scheduler + bot) is enough for Week 1.
- **Create this folder structure** (this is the deliverable of this task, not just `package.json`). The code folder is named `studio/`, not `src/` — a plain business noun for "the thing that runs script → video → review → publish," deliberately not "Orchestrator" or generic architecture-speak. It sits at the `7AI/` root, a sibling of `docs/`, not nested under it:

```
7AI/
├── docs/                    # already in place — see the companion-docs links above
└── studio/                  # self-contained project — own package.json, tsconfig.json, node_modules/
    └── src/
        ├── types/                 # ALL TypeScript types, centralized — one place to see every shape in the system
        │   ├── tenant.types.ts
        │   ├── channel.types.ts
        │   ├── pipeline.types.ts        # PipelineRun, PipelineStage, StageName, StageStatus
        │   ├── review-log.types.ts
        │   └── index.ts                 # barrel export — import from '@/types', not individual files
        │
        ├── models/                 # ALL database access, centralized — schema, migrations, repositories
        │   ├── migrations/              # or schema.prisma, per the Prisma-vs-raw-SQL choice above
        │   └── repositories/
        │       ├── tenant.repository.ts
        │       ├── channel.repository.ts
        │       ├── pipeline-run.repository.ts
        │       ├── pipeline-stage.repository.ts
        │       └── review-log.repository.ts
        │
        ├── run-pipeline/            # business capability: taking a run from brief to done
        │   ├── state-machine.ts         # PipelineRun/PipelineStage transitions (BUSINESS_LOGIC.md §1)
        │   ├── resume-on-startup.ts     # idempotent resume after a restart
        │   ├── retry-with-backoff.ts    # retry/circuit-breaker wrapper (BUSINESS_LOGIC.md §4)
        │   └── parse-brief.ts           # Intake — one stage of running the pipeline (BUSINESS_LOGIC.md §2)
        │
        ├── manage-channels/         # business capability: creating/configuring channels
        │   └── channel-cap.ts           # the 7-channel-cap rule (BUSINESS_LOGIC.md §3), wraps channel.repository.ts
        │
        ├── notify-founder/          # business capability: reaching the founder
        │   ├── bot.ts                   # Telegram bot setup
        │   └── send-receive-loop.ts
        │
        ├── config/
        │   └── env.ts
        │
        └── index.ts                 # entrypoint — wires the above together, starts the resume-on-startup routine
```

Naming rule going forward: a folder under `studio/src/` is named after the business action it performs (`run-pipeline`, `manage-channels`, `notify-founder`), not the architectural pattern (`orchestrator`, `service`, `handler`) — that's what makes it fast to scan the tree and know what the system *does*, not just how it's layered. The two exceptions are `types/` and `models/`, which stay centralized on purpose: types are what you check first when reviewing any change, and all database access living in one place makes "what does this touch in the DB" a one-folder question instead of a repo-wide search. If a piece of logic (e.g. the retry wrapper) turns out to be needed by a second business folder later, promote it into a `studio/src/shared/` folder at that point — don't create one preemptively for a single consumer. When a future agent's code (Script Generation, Video Generation, etc.) grows large enough to warrant its own top-level home, it gets its own self-contained project folder as a sibling of `studio/` — matching its `docs/design_doc/agents/<name>/` counterpart — rather than being folded into `studio/`, which is specifically the pipeline-running code, not a catch-all.

**tsconfig note**: `studio/` is a self-contained project — its own `package.json`, `tsconfig.json`, `node_modules/` — with the actual code nested one level deeper at `studio/src/`. Inside `studio/tsconfig.json`, set `"rootDir": "src"` and `"include": ["src/**/*"]` (relative to `studio/`, since commands run from inside that folder) — don't rely on defaults that assume the code sits directly under the project root.

**Acceptance criteria**: `npm run build` and `npm run lint` both pass on an empty-but-structured project, with the folder tree above in place (even if most files are still stubs).

---

## Task 2: PostgreSQL Local Setup

**Objective**: A running local Postgres, reachable from the app via `DATABASE_URL`.

**Depends On**: Task 1

**What to do**: Local install or Docker (`postgres:15`+), verify connection with a client, confirm `.env.local` has a working `DATABASE_URL`.

**Acceptance criteria**: A trivial query (`SELECT 1`) succeeds from the app's DB client.

---

## Task 3: Foundation Schema Migration

**Objective**: The five Week 1 tables exist, matching [`SCHEMA.md`](./SCHEMA.md).

**Depends On**: Task 2

**Schema Impact**: creates `tenants`, `channels`, `pipeline_runs`, `pipeline_stages`, `review_logs` — full DDL in `SCHEMA.md`. `Channel` and `ReviewLog` field lists are locked against `AGENT_FLEET_DESIGN.md`; `Tenant`/`PipelineRun`/`PipelineStage` are first-draft, flagged as such in `SCHEMA.md` — implement as written unless the founder has since revised them.

**What to do**:
- Write the migration (`studio/src/models/migrations/`, Prisma or raw SQL per Task 1's tooling choice) from `SCHEMA.md`'s DDL.
- Write the five type files under `studio/src/types/` from `SCHEMA.md`'s TypeScript definitions — these are what `studio/src/models/repositories/*` and every business folder import from, so get them right before anything else consumes them.
- Write the five repositories under `studio/src/models/repositories/` — plain CRUD + the specific query methods `SCHEMA.md`/`BUSINESS_LOGIC.md` call for (e.g. the channel-count-by-tenant-and-platform query).
- Seed the single MVP tenant row.
- Implement the 7-channel-cap check (`BUSINESS_LOGIC.md` Section 3) in `studio/src/manage-channels/channel-cap.ts`, calling `channel.repository.ts` — keep the rule itself out of the repository so the repository stays pure data access and the business rule stays in the business-named folder.

**Guarding against schema drift**: since `PipelineStage.input`/`output` are JSONB (deliberately, per `SCHEMA.md` Section 4 — payload shape varies by stage), nothing stops a future agent from writing a shape that doesn't match what `studio/src/types/pipeline.types.ts` claims. Cheap insurance now: validate each stage's output against a Zod schema (co-located with its type in `studio/src/types/`) before persisting it, so a mismatch fails loudly at write time instead of surfacing three stages later as a confusing bug. Worth wiring the pattern in Task 4/5 even though only `intake`'s shape exists to validate this week.

**Acceptance criteria**: migration applies cleanly to a fresh DB; re-running it is a no-op; a repository-level test confirms the 8th channel on a (tenant, platform) is rejected.

---

## Task 4: Orchestrator State Machine Skeleton

**Objective**: `PipelineRun`/`PipelineStage` transitions work as specified in [`BUSINESS_LOGIC.md`](./BUSINESS_LOGIC.md) Section 1, including resumability after a restart.

**Depends On**: Task 3

**Business Logic**: implements the full transition table in `BUSINESS_LOGIC.md` Section 1 — `pending → running → completed/needs_attention/failed`, persist-before-advance, and idempotent resume on startup (read `pipeline_runs` where `status = running`, resume or re-run the latest stage per its status).

**What to do**:
- `studio/src/run-pipeline/state-machine.ts`: create a run from a brief, advance stages, mark terminal states — calling `studio/src/models/repositories/pipeline-run.repository.ts` and `pipeline-stage.repository.ts` for persistence, never writing SQL directly from here.
- `studio/src/run-pipeline/resume-on-startup.ts`: scans for `running` runs on process start and resumes them — this is the piece worth the most care per `MVP_ROADMAP_OCT15.md` Section 14, Risk #4.
- `studio/src/run-pipeline/retry-with-backoff.ts`: the retry/circuit-breaker wrapper from `BUSINESS_LOGIC.md` Section 4, as reusable middleware around a stage's execution — even though only Intake uses it this week.

**Acceptance criteria**: create a `PipelineRun`, run it through a stub stage, kill the process mid-stage, restart, and confirm it resumes rather than duplicating or losing the run. This is the single most important test in Week 1 — don't skip the actual kill-and-restart, a passing unit test alone doesn't prove resumability.

---

## Task 5: Intake Parsing

**Objective**: A brief (`tenantId`, `channelId`, `briefText`) becomes `intakeParsed: { topic, constraints }`, per [`BUSINESS_LOGIC.md`](./BUSINESS_LOGIC.md) Section 2.

**Depends On**: Task 4

**Business Logic**: owned directly by the Orchestrator, not a separate agent (`MVP_ROADMAP_OCT15.md` Section 5.1). A single LLM call. Unparseable/too-vague briefs fail the stage into `needs_attention`, not `failed`.

**What to do**: implement `studio/src/run-pipeline/parse-brief.ts`, using the state machine and retry wrapper from Task 4. Keep the prompt simple — extraction only, no niche-matching, no auto-discovery (explicitly out of scope, see `BUSINESS_LOGIC.md` Section 2). Validate its output against a Zod schema per the schema-drift note in Task 3 before writing to `pipeline_runs.intakeParsed`.

**Acceptance criteria**: a real brief produces a sensible `{ topic, constraints }`; a nonsense/empty brief routes the run to `needs_attention` rather than crashing or silently succeeding with garbage output.

---

## Task 6: Telegram Bot Scaffold

**Objective**: Bidirectional messaging proven working, per [`BUSINESS_LOGIC.md`](./BUSINESS_LOGIC.md) Section 5.

**Depends On**: Task 1 (independent of Tasks 2–5, can run in parallel)

**What to do**: `studio/src/notify-founder/bot.ts` + `send-receive-loop.ts` — create the bot via @BotFather, wire a minimal send/receive loop (a library like `grammy` or `node-telegram-bot-api` is a reasonable default — not founder-locked). No gate logic, no reply-command parsing, no per-run threading — those are Week 2 (`BUSINESS_LOGIC.md` Section 5 explicitly defers them).

**Acceptance criteria**: the bot sends a message to the founder's Telegram and logs a reply sent back.

---

## Task 7: YouTube API Quota Request + OAuth Setup

**Objective**: Quota increase request submitted (1–2 week lead time — start now), OAuth working for channel #1.

**Depends On**: nothing (external/parallel — start Day 1)

**What to do**: this is mostly outside the codebase. Submit the Google Cloud quota increase request. Set up a Google Cloud project + OAuth client for channel #1, and get a working OAuth flow far enough to obtain a token — full Publishing integration is Week 4, but the credential plumbing shouldn't be a Week 4 surprise.

**Note**: per `SCHEMA.md` Section 2, don't build the `AgentCredential` table this week — store the channel #1 credential in environment variables as a stopgap, revisit once a second channel makes that unworkable.

**Acceptance criteria**: quota request submitted (confirmation received or pending); a token can be obtained and used for a trivial authenticated API call.

---

## Task 8: TTS + Video-Assembly Toolchain Spike

**Objective**: A recommendation for the TTS/captions/visual-assembly toolchain, per `MVP_ROADMAP_OCT15.md` Section 14 (Risk #1 — the biggest unknown).

**Depends On**: nothing (parallel, start early)

**What to do**: evaluate 2–3 candidate approaches against the MVP's deliberately simple bar — TTS voiceover, auto-captions, template/stock visuals, *not* full generative video (Section 14). Time-boxed to 1–2 days per the roadmap. Output is a short written recommendation (not code) — resolves Open Question 1 in `MVP_ROADMAP_OCT15.md` Section 15, so once decided, that section should be updated from 🟡 to ✅.

**Acceptance criteria**: a written recommendation exists with enough detail for Video Generation's design (Week 3) to lock to it.

---

## Reporting

Each task's completion gets a short report at `execution/week1/reports/task[N].md` (same shape as the [`TASK_TEMPLATE.md`](../templates/TASK_TEMPLATE.md) report section). At the end of the week, roll these up into `execution/week1/reports/week1-summary.md` — what got built, what deviated from `SCHEMA.md`/`BUSINESS_LOGIC.md` (and whether those docs were updated to match), and anything that should feed into Week 2's planning.

## Explicitly Not This Week

Script Generation, Script Review, any approval gate, Video Generation, Video Intelligence, Publishing, Performance Analytics — all Week 2+. Trend Identification, Content Prediction, Continuous Learning, `competitor`-mode Video Intelligence — all deferred past the Oct 15 MVP entirely (`MVP_ROADMAP_OCT15.md` Section 11). Resist pulling any of this forward even if it looks quick — see Section 14, Risk #3.
