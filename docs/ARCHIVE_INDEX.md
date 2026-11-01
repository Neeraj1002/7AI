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

### Removed later (branch `DOCS_CLEANUP_P3`, 2026-11-01)

Same tag, same restore command. Each file's links in live docs already carry the archived marker, or point at the `ui-ux` copy.

| Group | What | Path | Tag | Restore |
| ----- | ---- | ---- | --- | ------- |
| a | Week 1 instructions | `docs/execution/week1/WEEK1_INSTRUCTIONS.md` | `docs-archive-2026-10-26` | `git checkout docs-archive-2026-10-26 -- docs/execution/week1/WEEK1_INSTRUCTIONS.md` |
| a | Week 1 summary | `docs/execution/week1/reports/week1-summary.md` | `docs-archive-2026-10-26` | `git checkout docs-archive-2026-10-26 -- docs/execution/week1/reports/week1-summary.md` |
| f | UI/UX protocol pointer (stub; the live copy is `docs/execution/ui-ux/UI_UX_AGENT_PROTOCOL.md`) | `docs/execution/UI_UX_AGENT_PROTOCOL.md` | `docs-archive-2026-10-26` | `git checkout docs-archive-2026-10-26 -- docs/execution/UI_UX_AGENT_PROTOCOL.md` |

### Removed later, part 2 (same PR, 2026-11-01)

Same tag, same restore command. Every live link to these pages now carries the archived marker. The `STATUS.md` and protocol lines that pointed at `sprint3/STATUS.md`, `sprint4/STATUS.md` and the roadmaps were rewritten.

| Group | Path | Tag | Restore |
| ----- | ---- | --- | ------- |
| b | `docs/execution/sprint3/STATUS.md` | `docs-archive-2026-10-26` | `git checkout docs-archive-2026-10-26 -- docs/execution/sprint3/STATUS.md` |
| b | `docs/execution/sprint3/tasks/task9.md` | `docs-archive-2026-10-26` | `git checkout docs-archive-2026-10-26 -- docs/execution/sprint3/tasks/task9.md` |
| b | `docs/execution/sprint3/tasks/hardening-tenant-check.md` | `docs-archive-2026-10-26` | `git checkout docs-archive-2026-10-26 -- docs/execution/sprint3/tasks/hardening-tenant-check.md` |
| b | `docs/execution/sprint3/reports/hardening-tenant-check.md` | `docs-archive-2026-10-26` | `git checkout docs-archive-2026-10-26 -- docs/execution/sprint3/reports/hardening-tenant-check.md` |
| b | `docs/execution/bugs/Sprint3/closureTask.md` | `docs-archive-2026-10-26` | `git checkout docs-archive-2026-10-26 -- docs/execution/bugs/Sprint3/closureTask.md` |
| b | `docs/execution/bugs/Sprint3/closureTask2.md` | `docs-archive-2026-10-26` | `git checkout docs-archive-2026-10-26 -- docs/execution/bugs/Sprint3/closureTask2.md` |
| b | `docs/execution/bugs/Sprint3/reports/closure.md` | `docs-archive-2026-10-26` | `git checkout docs-archive-2026-10-26 -- docs/execution/bugs/Sprint3/reports/closure.md` |
| b | `docs/execution/bugs/Sprint3/reports/closure2-phone-verification.md` | `docs-archive-2026-10-26` | `git checkout docs-archive-2026-10-26 -- docs/execution/bugs/Sprint3/reports/closure2-phone-verification.md` |
| b | `docs/execution/bugs/Sprint3/reports/task1.md` | `docs-archive-2026-10-26` | `git checkout docs-archive-2026-10-26 -- docs/execution/bugs/Sprint3/reports/task1.md` |
| b | `docs/execution/bugs/Sprint3/tasks/task1.md` | `docs-archive-2026-10-26` | `git checkout docs-archive-2026-10-26 -- docs/execution/bugs/Sprint3/tasks/task1.md` |
| b | `docs/execution/bugs/Sprint3/tasks/task3.md` | `docs-archive-2026-10-26` | `git checkout docs-archive-2026-10-26 -- docs/execution/bugs/Sprint3/tasks/task3.md` |
| b | `docs/execution/bugs/Sprint3/tasks/hardening-gpt-image-migration.md` | `docs-archive-2026-10-26` | `git checkout docs-archive-2026-10-26 -- docs/execution/bugs/Sprint3/tasks/hardening-gpt-image-migration.md` |
| a | `docs/execution/frontend/STATUS.md` | `docs-archive-2026-10-26` | `git checkout docs-archive-2026-10-26 -- docs/execution/frontend/STATUS.md` |
| d | `docs/roadmap/SPRINT_ROADMAP.md` | `docs-archive-2026-10-26` | `git checkout docs-archive-2026-10-26 -- docs/roadmap/SPRINT_ROADMAP.md` |
| d | `docs/roadmap/MVP_ROADMAP_OCT15.md` | `docs-archive-2026-10-26` | `git checkout docs-archive-2026-10-26 -- docs/roadmap/MVP_ROADMAP_OCT15.md` |
| f | `docs/execution/sprint4/STATUS.md` | `docs-archive-2026-10-26` | `git checkout docs-archive-2026-10-26 -- docs/execution/sprint4/STATUS.md` |

## Not removed

These stay on purpose.

| Group | Path | Why it stays |
| ----- | ---- | ------------ |
| c | `docs/execution/ui-ux/STATUS.md`, `docs/execution/ui-ux/tasks/task1.md` | the live UI/UX track uses them |
| g | `docs/channel_bibles/NOT_IN_YOUR_TEXTBOOK.md` | named by `NIYT_CHANNEL_CONFIG.md`; its price-fact Gate 1 items and upload sequence are not in the new spec yet. It goes once the channel lead carries them over |

Group e (old forecasting app) was not on `main`, so nothing was removed for it.
