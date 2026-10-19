# Sprint 6 (and 7 if needed): Planning Doc

**Living doc.** The founder brainstorms with the architect chat; each decision is added here. Task docs are written FROM this doc by a separate task-writer chat (prompt at the bottom), so the architect chat stays short and cheap. Only the architect edits this file. Started 2026-10-19. Last updated 2026-10-19 (priorities, P10, P11, decisions).

## 1. How we work (token rule)
- The founder's goal: save tokens to work the whole week. Brainstorm here in short turns; do not paste task text into chat.
- A plan item becomes a task doc only when its status is `Ready`. The task-writer chat reads this file, the item, and the docs the item names, and writes the task doc.
- Bug-fix tasks live in the active sprint's folder (`sprint6/bugs/`), never in a closed sprint's. One row per bug in `docs/execution/bugs/BUG_LEDGER.md` (proposed 2026-10-19, not yet created).
- Sprint 5 is the active sprint until the founder closes it. P7 and P2 are filed there (founder decision 2026-10-19). Everything else starts in Sprint 6 once Sprint 5 closes; anything unfinished in Sprint 5 is carried here as a new item with a link back.

## 2. Backlog (status: Idea / Brainstorm / Ready / Task written / Done)

**Priority scale.** 1 = blocks the combined test, or keeps failing. 2 = core value, next in line. 3 = after that. 4 = later. Work goes by priority, then by item number.

| # | Pri | Item | Why | Source | Status |
|---|---|---|---|---|---|
| P7 | 1 | LLM Registry (one output-limit and failure policy) | Recurring cut-off failures; blocks the combined test | Urgent. One task with P2 as Part C: `sprint5/bugs/tasks/llm-registry.md` | Task written (Sprint 5) |
| P2 | 1 | Fix the custom-thumbnail 403 | Blocks any thumbnail upload. NIYT is phone verified since about 5 Oct, so Part C re-tests first and fixes only if still failing | Sprint 5 Task 8 R11.5; Sprint 4 hardening doc | Task written (Part C of the P7 task, Sprint 5) |
| P1 | 2 | Packaging: promise, title options, thumbnail options, first-seconds hook for Shorts | Clicks come from packaging; only titles are covered today | Gap G11, section 3 below | Brainstorm |
| P10 | 2 | One intake box: brief and sources pasted together | Separate brief and sources fields feel like an old form | Section 3 below; Sprint 4 Task 2 R5 | Brainstorm |
| P4 | 2 | Reviewer imagined allowance | Story-feel scripts must pass review; the Imagined tag depends on it | Gap G3 | Idea |
| P5 | 2 | Disclosure fields (includes the Imagined tag) | Compliance | Gap G5 | Idea |
| P8 | 2 | Bug structure: per-sprint bug folders plus one ledger | Trace stage and timeline of each bug | Brainstorm 2026-10-19 | Brainstorm |
| P11 | 3 | Publish extras as gate choices, resolved at Gate 2 (pinned comment, first reply, playlist, end screen, long-video link) | More watch time and engagement after the click, without old-style forms | Section 3 below | Brainstorm |
| P3 | 3 | Series as formats (first: "A Day in a Life") | Compare and repeatable channel identity | Gap G2, draft in NIYT spec | Idea |
| P6 | 3 | Look per series and still quality | Look test result decides | Gap G16 | Waiting for look test |
| P9 | 4 | Rest of the gap register | See `channel_bibles/NIYT_CHANNEL_CONFIG.md` section 13 (G1 to G16) | Spec | Idea |

Sprint 7 overflow: anything not `Ready` by the time Sprint 6 is full, lowest priority first.

## 3. Brainstorm log (add decisions here)

### 2026-10-19 Packaging (P1, P2)
- Long videos: thumbnail and title earn the click. Shorts: reports say the Shorts feed shows no thumbnail; the first 1 to 3 seconds decide. Custom Shorts thumbnails started rolling out 25 Jul 2026 for Partner Program channels, desktop upload, no A/B test (secondary report, not checked at source).
- Today: only a frame grab exists (Sprint 2 Task 5), never worked live (403). Long thumbnails are manual (Sprint 4 Task 9).
- Proposed build: after Gate 1, produce 3 title options and 2 thumbnail options per video. Thumbnail = generated image in the channel look + text added by code (4 words at most, house font, corner tag) + automatic readability checks; founder picks at Gate 2; auto-upload once the 403 is gone, otherwise hand over the file. Titles pass the same fact check as scripts (Task 8 item 6).
- Learning: store title shape and thumbnail recipe per video; Compare groups by them. Test & Compare is desktop Studio only, long-form only, no API; founder enters the winner.
- No trustworthy study of which thumbnail traits lift click-through was found, so the design tests instead of assuming.
- Test sequence has no thumbnail step; proposed: one step at T25 (set a hand-made thumbnail, read `coverFrameSet`).
- "Promise" idea (what keeps a viewer past 5 to 10 seconds): one promise sentence made at Gate 1 drives 3 title options, 2 thumbnail options, the hook line and the opening image. Script Review checks the promise starts being delivered within 5 seconds. Gate 2 shows a mock viewer card (thumbnail, title, first 10 seconds). Retention at 3, 10 and 30 seconds is stored per video.
- Shorts opening: strongest image and hook text at frame 0, a visible "Imagined" tag from frame 0. Hook spoken first and the full disclaimer a few seconds in is still a founder compliance call (the NIYT spec has the exact spoken disclaimer first).
- Open: who makes thumbnails in the interim (by hand, per the spec recipe).

### 2026-10-19 Bug structure (P8)
- Proposal: `sprintN/bugs/{tasks,reports}`; global `bugs/BUG_LEDGER.md`, one row per occurrence (ID, first seen, stage, family, symptom, fix task and PR, deployed, verified, recurred); families by root cause; IDs issued only by the architect; branches `SPRINT<N>_BUG_<NAME>`; agents never read or edit the ledger; closed sprint folders take no new files; Sprint 3 folder stays as closed history; backfill on touch.
- Open: confirm, then create ledger and amend the hot-fixer protocol.

### 2026-10-19 One intake box (P10)
- Cause (from docs, not code): intake extracts only `{topic, constraints}` from the brief text; `sources[]` was added as an explicit optional list on run creation (Sprint 4 Task 2 R5), which said inferring sources from free text was out of scope. So the two fields are a leftover, not a design.
- Build: one box; the founder pastes brief and links together. Plain code finds the links (no AI call, so it cannot invent a source). The existing intake step gives topic and constraints. The founder sees chips (topic, length, sources, constraints) to correct before the run spends money.
- Rules: a wrongly detected source feeds the fact check, so chips must show before the run starts. Links only at first; a pasted passage with no link is treated as brief text. Whether to keep pasted text as a source is a later item.
- Storage: no new table (founder decision). Use the existing `creationOptions` and `intakeParsed` columns. The task's R0 confirms how briefs are stored today; any schema change means stop and ask. A sources table is a later item only if per-source tracking is needed.

### 2026-10-19 Publish extras as gate choices (P11)
- Direction: optional extras are choices, never form fields. At Gate 1 the founder ticks the extras wanted (pinned comment, first reply, playlist, end screen, link to a long video). At Gate 2 one screen shows the finished extras next to the thumbnail and title, and the founder approves, edits or skips them all together.
- Limit 1: comments do not exist at Gate 2. Gate 2 approves the reply style and the first comment; each later reply is a short approval card after publish.
- Limit 2: the YouTube API can probably post a comment but not pin it (to verify in the task). If so, the pin is a one-tap handover to the founder.
- Needs a check of which API scopes the channel connection already has.

## 4. Decisions made
- 2026-10-19: P7 and P2 are one task in Sprint 5's bug folder: `docs/execution/sprint5/bugs/tasks/llm-registry.md` (Parts A and B for P7, Part C for P2). The old copy in `bugs/Sprint3/tasks/` is retired. Part C defers to Sprint 5 Task 8 R11.5 if that is already done or in progress.
- 2026-10-19: The visible "Imagined" tag from frame 0 is accepted for Shorts. (Spoken hook-versus-disclaimer order is still open.)
- 2026-10-19: Every plan item carries a priority 1 to 4.
- 2026-10-19: Brief and sources are entered in one box (P10), not separate fields.
- 2026-10-19: No separate table for briefs; use existing columns (P10).
- 2026-10-19: Publish extras are offered as choices at specific gates and resolved together at Gate 2 (P11).

## 5. Task-writer prompt (paste into a NEW chat attached to the 7AI Project)

```
You are the task writer for the 7AI project. Read docs/execution/sprint6/PLAN.md, docs/execution/templates/TASK_TEMPLATE.md and the item(s) I name, plus every doc that item's Source column points to. For each item I name, write one task doc at docs/execution/sprint6/tasks/task<N>.md (bug fixes: docs/execution/sprint6/bugs/tasks/<name>.md) in the template's shape: Objective, Depends On, Owning Component, Success Criteria, R-numbered requirements with Where / Fix / Verify, Schema Impact, Testing, Report. Rules: never assume code facts, put a "read the real code first and confirm" step (R0) in every task; mark unknowns instead of guessing; keep each task to what the plan item says; list founder decisions still open at the top. Keep every reply to me to 3 lines. Do not edit PLAN.md or any STATUS file; at the end, give me the one-line status for each task so the architect can update PLAN.md.
```
