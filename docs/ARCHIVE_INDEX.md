# Archive index

Docs removed from `main` on 2026-10-26 (branch `DOCS_BULK_CLEANUP`). Nothing is lost: every file is in git history and in the tag below.

**Tag:** `docs-archive-2026-10-26` (the last `main` commit that still had these files: `59c7ef9`).

## Restore

One file or folder:

```bash
git checkout docs-archive-2026-10-26 -- <path>
```

Everything in a group, for example group a, week1:

```bash
git checkout docs-archive-2026-10-26 -- docs/execution/week1
```

To only read a file without restoring it: `git show docs-archive-2026-10-26:<path>`.

## Removed

| Group | What | Path | Files | Tag | Restore |
| ----- | ---- | ---- | ----- | --- | ------- |
| a | Sprint 1 week 1 | `docs/execution/week1` | 11 | `docs-archive-2026-10-26` | `git checkout docs-archive-2026-10-26 -- docs/execution/week1` |
| a | Sprint 1 week 2 | `docs/execution/week2` | 18 | `docs-archive-2026-10-26` | `git checkout docs-archive-2026-10-26 -- docs/execution/week2` |
| a | Sprint 1 week 3 | `docs/execution/week3` | 13 | `docs-archive-2026-10-26` | `git checkout docs-archive-2026-10-26 -- docs/execution/week3` |
| a | Sprint 1 week 4 | `docs/execution/week4` | 11 | `docs-archive-2026-10-26` | `git checkout docs-archive-2026-10-26 -- docs/execution/week4` |
| a | Sprint 1 week 5 | `docs/execution/week5` | 17 | `docs-archive-2026-10-26` | `git checkout docs-archive-2026-10-26 -- docs/execution/week5` |
| a | Sprint 2 | `docs/execution/sprint2` | 17 | `docs-archive-2026-10-26` | `git checkout docs-archive-2026-10-26 -- docs/execution/sprint2` |
| a | Frontend track | `docs/execution/frontend` | 8 | `docs-archive-2026-10-26` | `git checkout docs-archive-2026-10-26 -- docs/execution/frontend` |
| b | Sprint 3 | `docs/execution/sprint3` | 33 | `docs-archive-2026-10-26` | `git checkout docs-archive-2026-10-26 -- docs/execution/sprint3` |
| b | Bugs track, Sprint 3 | `docs/execution/bugs/Sprint3` | 19 | `docs-archive-2026-10-26` | `git checkout docs-archive-2026-10-26 -- docs/execution/bugs/Sprint3` |
| c | UI/UX tasks, reports, status | `docs/execution/ui-ux` | 10 | `docs-archive-2026-10-26` | `git checkout docs-archive-2026-10-26 -- docs/execution/ui-ux` |

Total removed: 157 (group a 95, b 52, c 10).

## Not removed

These files were in the clean-up list but are still linked from a kept status, plan, template, protocol or channel bible, so they stay until those docs are updated. Restore is not needed for them.

| Group | Path | Why it stays |
| ----- | ---- | ------------ |
| a | `docs/execution/week1/WEEK1_INSTRUCTIONS.md`, `docs/execution/week1/reports/week1-summary.md`, `docs/execution/frontend/STATUS.md` | linked from `TASK_TEMPLATE.md` |
| b | `docs/execution/sprint3/STATUS.md`, `docs/execution/sprint3/tasks/task9.md`, `docs/execution/bugs/Sprint3/closureTask.md`, `closureTask2.md`, `reports/closure.md`, `reports/closure2-phone-verification.md`, `reports/task1.md`, `tasks/task1.md`, `tasks/hardening-gpt-image-migration.md` | linked from `bugs/STATUS.md` (`closureTask.md` also from `admin/sprint1/STATUS.md`) |
| b | `docs/execution/sprint3/tasks/hardening-tenant-check.md`, `docs/execution/sprint3/reports/hardening-tenant-check.md`, `docs/execution/bugs/Sprint3/tasks/task3.md` | linked from `HOTFIXER_AGENT_PROTOCOL.md` / `UI_UX_AGENT_PROTOCOL.md` |
| c | `docs/execution/ui-ux/STATUS.md`, `docs/execution/ui-ux/tasks/task1.md` | linked from `TASK_TEMPLATE.md`, the UI/UX protocol and `bugs/STATUS.md` |
| d | `docs/roadmap/SPRINT_ROADMAP.md`, `docs/roadmap/MVP_ROADMAP_OCT15.md` | linked from `TASK_TEMPLATE.md` |
| f | `docs/execution/UI_UX_AGENT_PROTOCOL.md` (stub), `docs/execution/sprint4/STATUS.md` | linked from `TASK_TEMPLATE.md`, `docs/STATUS.md`, `sprint5/STATUS.md` and both protocols |
| g | `docs/channel_bibles/NOT_IN_YOUR_TEXTBOOK.md` | named by `NIYT_CHANNEL_CONFIG.md`; its price-fact Gate 1 items and upload sequence are not in the new spec |

Group e (old forecasting app) was not on `main`, so nothing was removed for it.
