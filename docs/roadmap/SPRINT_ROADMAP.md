# Sprint Roadmap

**Status**: Active. "Sprint" replaces "Week" as the execution unit starting Sprint 2 — see
`docs/execution/templates/TASK_TEMPLATE.md`'s 2026-09-13 update for the full convention. Sprint 1's
folders/branches (`week[N]`) are not renamed retroactively.
**Date**: 2026-09-13
**Sources**: `MVP_ROADMAP_OCT15.md`, `KNOWN_ISSUES_AND_BLOCKERS.md`, `week5/STATUS.md`,
`MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md`, `MVP_PART3_CONTENT_QUALITY_AND_GROWTH_LOOP.md`.

---

## Sprint 1 — the Oct 15 MVP (Week 1-5 + frontend) — CLOSED (2026-09-14)

All three real open items from the original roadmap's own MVP definition (§12-13) are now closed,
via Week 5 Task 5. See `docs/execution/week5/reports/task5.md` and `week5-summary.md` for the full
evidence trail.

### Closed — Week 5 Task 4
Implemented and verified: Intake model tier fixed, budget fair-access system built (with a real
Prisma migration), Script Review fact-check flag added, first test-harness slice (`vitest`, 27
assertions) stood up. See `week5/reports/task4.md`.

### Closed — a genuinely public test video
Week 5 Task 5 (D2) made privacy status a real, per-run Gate 2 choice (`"approve public"`/
`"approve unlisted"`/bare `"approve"` → private default), replacing the old hardcoded
`PRIVACY_STATUS` constant. One real Short about GPT-6 Astra is now live and public:
**https://youtu.be/Tju034tqrrY** — confirmed `privacyStatus: 'public'` via a direct YouTube Data API
call, both gates answered live over real Telegram. Task 5 also closed a related real gap found while
verifying this (D1): Intake's own LLM spend was never metered — it now writes a real `UsageEvent`
on every call.

### Deferred to Sprint 3, not a gap — channel #2/#3
§12 lists this under Week 5, explicitly conditional ("if Week 4 went cleanly... don't force it").
Still only 1 channel exists in the dev DB. Since Sprint 3 (below) makes multi-channel central anyway,
folded into Sprint 3 rather than forced into Sprint 1 — this was always optional, not a closing gate.

### Closed — week5-summary.md
Written as part of Task 5's close-out — `docs/execution/week5/reports/week5-summary.md`.

---

## Sprint 2 — Content Quality (recommended next, right after Sprint 1 closes)

Flexible creation (`MVP_PART2` §2: voice selection, second visual-source backend) + what folds into it
(`MVP_PART3` §1: audio layer, synthetic-content disclosure, licensing/Content-ID check) + all of Track C
(`MVP_PART3` §2: retention-curve capture, hook-first script rubric, custom cover frame, title/description
A/B testing, founder daily digest, post-hoc "why didn't it work" tagging).

**Why this before multi-user**: none of it needs the harder auth/OAuth lift, all of it compounds
immediately on the existing channel(s), and several items (retention capture, tagging) are
cheap-now/expensive-later captures — the sooner they start, the more history exists once Continuous
Learning (Sprint 4) gets built. Handing 10 testers a product that still sounds like a slideshow would
burn first impressions Sprint 3 can't get back.

---

## Sprint 3 — Multi-User / Application Layer — CLOSED (2026-09-20)

`MVP_PART2` §1 in full: real `User` table, per-user YouTube OAuth (off env vars), per-tenant budget
enforcement, gate ownership, per-user notification routing. Channel #2/#3 expansion (deferred from
Sprint 1, above) naturally lands here too, since multi-channel becomes the default shape — **closed**
by Task 6: a real `channels.create` mutation exercises the existing 7-channel cap for the first time
against real app-created channels (previously verified only by code review and a pure-function unit
test), with a derived `hasYoutubeCredential` field surfacing Task 5's connection state. See
`docs/execution/sprint3/STATUS.md` and `docs/execution/sprint3/reports/task6.md`. One real
founder-action item carries forward (Task 5 — a fresh YouTube OAuth consent needed; see
`docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md` §1).

**Why after Sprint 2, not before**: bigger lift, higher risk, and what you hand to 10 people is a
better product after Sprint 2 lands first.

---

## Sprint 4 — Deferred Fleet Agents + Cross-Posting

Trend Identification, Content Prediction, Continuous Learning, Video Intelligence's competitor mode
(`AGENT_FLEET_DESIGN.md` §3) — now genuinely worth building, since Sprint 2's retention/tagging capture
and Sprint 3's multi-channel volume together give them real history to learn from. Cross-posting
(`MVP_PART3` §4) rides Sprint 3's credential-storage pattern rather than building OAuth storage twice.
