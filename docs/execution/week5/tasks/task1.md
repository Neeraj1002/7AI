# Week 5 Task 1: The First Genuinely Real End-to-End Dry Run

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.** It defines the Git Workflow, the `STATUS.md` update, and the section structure this file follows.

**Objective**: Run the actual first end-to-end test with real credentials — real LLM calls, real TTS, real stock footage, real YouTube upload — closing out `KNOWN_ISSUES_AND_BLOCKERS.md` Section 1's "first genuinely real end-to-end dry run" item.
**Duration**: 2-3 hours engineering + however long render/upload actually takes
**Depends On**: Week 4 (all tasks) complete. Ideally Week 5 Task 2 (resume-sweep fix) also landed first — if it hasn't, follow the pre-flight cleanup step below without skipping it.
**Owning Component**: Orchestrator (integration, no new code expected)
**Success Criteria**: One real brief reaches `completed` — real audio, real footage, real private YouTube upload, both gates answered live by the founder through the actual Telegram bot, not simulated.

## Task Requirement

Week 4 Task 4 already proved this loop mechanically, but against stubs (`MEDIA_STUB`, `STOCK_FOOTAGE_STUB`, `YOUTUBE_STUB`) because `OPENAI_API_KEY`/`PEXELS_API_KEY`/`YOUTUBE_REFRESH_TOKEN` weren't confirmed in place. This task is the same milestone, done for real, now that those credentials should be available. **If any of the three is still missing, stop and report exactly which one rather than letting a stub silently stand in — do not declare this task done against a partial-stub run.**

### Pre-flight: credentials
Confirm each of these is a real, non-empty value in `.env.local`, and that every `*_STUB` flag is unset (`INTAKE_STAGE_STUB`, `MEDIA_STUB`, `STOCK_FOOTAGE_STUB`, `YOUTUBE_STUB`):
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `PEXELS_API_KEY`
- `YOUTUBE_REFRESH_TOKEN` (implies Week 1 Task 7's OAuth is actually done — verify, don't assume)
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_FOUNDER_CHAT_ID`

### Pre-flight: stale-run cleanup (do this even if Task 2's fix has landed — it's cheap insurance)
`resumeOnStartup()` runs unconditionally on every boot of `src/index.ts` and (as currently written, or with a staleness window if Task 2 landed) can still pick up leftover `running` `PipelineRun`s from old testing and re-execute them for real. This is exactly what happened during Week 4 Task 4 (real `metadata-generation` spend + two stub uploads from swept-up Week 3 fixtures). Before starting the real app:
1. `npx tsx scripts/list-stale-running-runs.ts` — see what's currently `running`.
2. For anything that isn't the run you're about to create, `npx tsx scripts/close-stale-test-runs.ts <runId...>`.
3. Confirm `AgentQuota.budgetCeilingUsd` for the real platform is back at a genuine production value, not left at whatever low number a prior budget-gate test set via `scripts/set-budget-ceiling.ts` — check this directly, don't assume the prior session restored it.

### Acceptance Criteria
- [ ] All five credentials above confirmed real and all stub flags unset.
- [ ] Pre-flight stale-run cleanup done and confirmed empty (or intentionally left, with reason noted).
- [ ] One real brief, submitted through the actual running Telegram bot (not `dry-run.ts`'s simulate helpers), flows `intake → script_generation → script_review → gate1 → video_generation → video_review → gate2 → publishing → analytics`.
- [ ] Gate 1 and Gate 2 both answered live by the founder in real Telegram, in real time — no `simulateIncomingTelegramMessage`.
- [ ] Published video confirmed `private` on YouTube Studio directly (not inferred from a DB row).
- [ ] Video actually watched/listened to: real voiceover (not the placeholder tone), real stock footage (not the synthetic test pattern).
- [ ] Performance Analytics confirmed polling (`runPeriodicPoll` or the interval) against the real video.
- [ ] Kill-and-restart resumability re-verified mid-`publishing`, on a **separate** test run created explicitly for this purpose — confirm clean resume, no duplicate upload. Clean that test run out afterward with `close-stale-test-runs.ts` so it doesn't become the next stale-sweep incident.
- [ ] `docs/execution/week5/STATUS.md` created (new week).
- [ ] `docs/execution/week5/SCHEMA.md`/`BUSINESS_LOGIC.md` — "No schema changes" / "No new control flow" unless something unexpected surfaces.
- [ ] `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md` Section 1 updated: close out the YouTube OAuth, OpenAI/Pexels-keys, and "first real dry run" rows if genuinely resolved; leave any that aren't with an honest note.

## Testing
```bash
npm run build && npm run lint && npm run typecheck
npx tsx scripts/dry-run.ts status <runId>   # inspect run/stage/usage_event/review_log rows after
```

### How to Verify
1. Run the test commands above.
2. Check YouTube Studio directly for privacy status, title/description/tags, and actually watch the video.
3. Inspect `pipeline_runs`/`pipeline_stages`/`usage_events` for the run — confirm no duplicate stages/uploads from the kill-resume test.
4. Confirm the stale-run cleanup log from the pre-flight step is included in the report, not just implied.

## Report Template
Generate at `execution/week5/reports/task1.md`, same shape as every prior week's task reports (Status/Files/Deviations/Sign-Off). Be explicit in "Deviations from Spec" if any credential was still missing and you had to fall back to a stub for part of the chain — this is the one report where an honest partial result matters more than a clean-looking pass.

## Links & References
- `docs/roadmap/MVP_ROADMAP_OCT15.md` Sections 12-13
- `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md` Section 1
- `docs/execution/week4/tasks/task4.md` — the stub version of this same test
- `scripts/list-stale-running-runs.ts`, `scripts/close-stale-test-runs.ts`, `scripts/set-budget-ceiling.ts`
