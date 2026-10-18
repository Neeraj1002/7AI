# Sprint 5 Shared Directory, Task PRs and Sprint 4 Closure

**2026-10-18 revised owner workflow (supersedes older closure holds below):** integrate technically ready task PRs individually, then perform one combined Sprint 4–5 acceptance pass after Task 5. Sprint 4 closure is no longer a prerequisite for PR #91 readiness. Latest-main integration, conflict resolution, affected checks and explicit production-verification limits still apply. Task 1's publishing-summary Admin adapter remains pending until #92 lands and does not block this diagnostics PR. Founder review/merge and deployment remain separate; this direction authorizes neither merge/deployment nor production generation or budget changes.

**Authority:** owner clarification, 2026-10-14. This supplements the [task template](../templates/TASK_TEMPLATE.md) and applies to all five Sprint 5 tasks. Each task has its own draft PR. The first task agent establishes one Sprint 5 root; other agents reuse that root. Sprint 4 testing/triage/closure precedes marking Sprint 5 PRs ready for review. No application implementation or Git mutation was performed while writing this workflow.

## One Sprint 5 root, separate task worktrees

Proposed shared root: **`D:\Study Material\7AI-SPRINT5`**. It did not exist when checked during planning. **Task 1's agent creates it first**, records the actual path/ownership in Sprint 5 STATUS, and establishes its task worktree. Later agents reuse the recorded root, not another sibling Sprint 5 directory.

```text
D:\Study Material\7AI-SPRINT5\
  task1\   full Git worktree, branch SPRINT5_TASK1_BE
  task2\   full Git worktree, branch SPRINT5_TASK2_BE
  task3\   full Git worktree, branch SPRINT5_TASK3_BE
  task4\   full Git worktree, branch SPRINT5_TASK4_BE
  task5\   full Git worktree, branch SPRINT5_TASK5_BE
```

The top-level Sprint 5 directory is a shared container. Each agent works inside its own task checkout underneath it. Each checkout contains the same repository-relative `docs/execution/sprint5/` planning directory. Git cannot keep multiple active PR branches checked out in a single working tree; this layout fulfills the shared-root requirement and the existing mandatory worktree isolation. No Git commands are run against the container itself. No second agent switches, rebases, merges, stashes or resets another agent's checkout.

These are proposed branch/path names, not created branches. Check current worktree/branch ownership and STATUS before setup. Task 1 records root, its branch/worktree and the plan-baseline commit immediately. Later agents record only their own rows and worktree paths. All branches start from current `origin/main` containing merged **PR #90 (`5b04a7a`)** or a verified descendant; preserve #89/#90 and any newer Sprint 4 fixes. Read current task dependencies: root creation does not release a blocked task to implement features.

### Mandatory first commit — planning documents before task work

The current planning packet is under `D:\Study Material\7AI\docs\execution\sprint5\`; it is uncommitted during this planning exercise. A new worktree will not inherit it automatically.

**Owner instruction: Task 1's agent commits these documents first, then proceeds with Task 1.** After reading instructions and establishing its root/branch/worktree, its first commit is a dedicated documentation-only commit of the current Sprint 5 planning packet. Do not combine it with application changes or begin task-specific diagnostics/implementation before this step. If a file already exists on main, reconcile the current approved document rather than creating a duplicate copy.

The initial packet contains all **nine** Sprint 5 Markdown files: `STATUS.md`, `WORKFLOW.md`, `SCHEMA.md`, `BUSINESS_LOGIC.md`, and `tasks/task1.md` through `tasks/task5.md`. If the referenced `docs/audits/2026-10-14/7AI-STUDIO-AUDIT.md` is not already tracked on main, include that existing audit Markdown so task links resolve in new checkouts. Do not automatically stage audit logs, images, private exports, credentials or other untracked files. Check the staged file list and links before committing; it must contain documentation only.

Suggested commit title: `SPRINT5_TASK1_BE: Commit Sprint 5 planning documents`. Push this commit on the agent's own Task 1 branch and open **Task 1's draft PR** with this initial documentation change. The same PR later receives Task 1 implementation/report commits; this does not create an umbrella implementation PR or an extra documentation PR.

Record the real bootstrap SHA in the draft PR immediately; record it in STATUS in the next task commit (a commit cannot contain its own resulting SHA). Other task agents can use the pushed documentation baseline after this setup is complete. Only then proceed with Task 1 diagnostics/implementation, preserving the task's existing dependencies and production boundaries. No commit is made by this planning chat.

Other task agents create their own branches from current main. Until the packet is on main, they may apply that exact verified documentation-only commit to their own branches, or use the committed packet already integrated on main. Verify that it contains only Sprint 5 planning files. Do not copy/cherry-pick Task 1's application implementation or rewrite a competing set of task specifications. This is a future implementation-time Git workflow; no bootstrap commit is made now.

Every agent reads the same task definitions. Working copies can differ only in owned implementation/report/own-row updates; integration reconciles STATUS and shared deltas. The directory is shared in organization and planning baseline, not as a mutable Git index or a cross-agent source-file editing location.

## One draft PR per task

Create **five distinct task PRs**, one per implemented task, targeting main. Do not create a single umbrella implementation PR for the sprint, and do not combine another task's implementation because it is waiting for review.

- Each agent commits only on the branch it created, from its own task worktree, and opens its own PR with `--draft` once reviewable work is pushed.
- PR title identifies Sprint 5, task number and role, e.g. `SPRINT5_TASK2_BE: Durable publishing recovery`.
- PR body links its task/report, states dependencies and Sprint 4 closure hold, and reports concrete tests/remaining uncertainties. Use a body file for multiline GitHub descriptions.
- Record actual PR URL/number and exact branch/worktree in that task's STATUS row. Do not fabricate a PR before creation.
- Keep the PR draft while prerequisites, tests, Sprint 4 triage/closure or conflicts remain unresolved. The template's generic “mark ready at the end of a track” step is overridden by this per-task readiness gate.
- Merging remains the founder's action; main merge auto-deploys. Neither a finished task nor “ready for review” authorizes merge, migration application, deployment or production generation.

Task 1 and Task 2 have independent implementation ownership and may run concurrently **after Task 1 establishes the root, commits/pushes the common documentation baseline and opens its draft PR**. Tasks 3/4 implement after reliability gate R and integrate shared files in the existing order. Task 5 follows both. The directory/PR arrangement changes no schema/state-machine ownership.

## Owner-led Sprint 4 test, fix or carry over

Sprint 4 remains open for the owner's test pass. This planning update does not close Sprint 4 or change any bug's production triage status.

1. Record the tested server SHA, app build/OTA revision, actual run/channel/issue, reproduction steps and observed result. The current server is live-reported at #90, but a code merge does not prove every device behavior.
2. Inspect the existing issue/report and relevant current source before deciding it still needs fixing. Reuse the Admin UI/`admin.bugs.list` read API and existing bug records; do not invent a new bug tracker, endpoint or unrestricted SQL workflow. The list has bounded filters; returned text is tenant content and must be sanitized in exports.
3. If already fixed and owner verification passes, record that evidence and close through the existing triage workflow. If a fix is built but testing is outstanding, use its existing awaiting-verification state; do not label it verified.
4. If the **complete** defect and its acceptance test are explicitly covered by Sprint 5, skip duplicate Sprint 4 implementation. Record the exact task/R-number/acceptance criterion, owner and dependency, and carry the issue forward. A thematic resemblance is insufficient.
5. If not covered, fix it under the existing Sprint 4/bugs ownership and Git rules, then retest. A new scope/migration/workflow contract is reviewed normally. Do not add an unrelated sixth Sprint 5 task automatically.
6. Close Sprint 4 only when the owner confirms the pass and every remaining item is verified, explicitly accepted/deferred, or carried forward with a named owner and test. The outstanding Script Review enhancement remains the same existing item; if carried at closure, retain its owner/rules and link Task 4's evidence integration dependency instead of creating another reviewer task.

### Closure record

The closure owner writes one report using existing conventions, e.g. proposed `docs/execution/sprint4/reports/closure.md` if that file is not already owned. Check existing closure records first and reuse the actual path. This file is **not created by this planning update**. Reference it from Sprint 5 STATUS once it exists.

| Issue / existing ID | Test SHA + device/OTA | Verified result | Disposition | Sprint 5 task + exact criterion | Owner / remaining test |
|---|---|---|---|---|---|
| Populate from actual tests | Actual revisions | Reproduced / passed / untested | Fixed and verified / awaiting verification / carried / accepted | Required for carryover | Named owner; no invented completion |

The current bug statuses are `open`, `fixed`, `wontfix`, `awaiting_verification`. There is no “transferred” database status. **A carried defect stays open with a triage note linking its Sprint 5 task until its fix is verified.** Sprint 4's sprint-level closure can record the accepted handoff; do not mark the bug fixed or wontfix merely to close the sprint. Existing triage mutations/audits are used only when authorized for the closure work, never by this planning exercise.

### Candidate overlap checks, not a verified open-bug list

| Candidate from existing reports | Evidence / ownership check | Likely disposition if reproduced |
|---|---|---|
| Legacy planner Retry disabled after #89 | #90 fixes JSONB property-order hash mismatch; actual fifth attempt now exists | Verify #90 behavior; no duplicate Sprint 5 planner fix |
| Upload receipt/overlap/ambiguous restart behavior | Task 2 R1–R5 and its fault matrix explicitly cover it | Carry to Task 2 with the exact reproducer/criterion; keep issue open |
| Unsupported moving-video assumptions or scene/asset alignment | Task 3 R1/R3 | Carry only the covered defect; unrelated preview-player bugs do not belong here |
| Reviewer factual misses / evidence asymmetry | Existing SR enhancement owns rules; Task 4 owns packet parity | Preserve original SR ownership; link Task 4 only for its integration scope |
| Visual defect needing valid-asset-preserving repair | Task 5 R1–R3 | Carry if its defect is visual-only and eligible; script/audio repair is outside Task 5 |
| Real-device preview playback/seeking, subtitle-link or unrelated UI bugs | Sprint 4 frontend report has unperformed device checks and historical differences | Owner tests current app/server; an uncovered reproduced defect stays a Sprint 4 fix |

Older pending/status/report prose is evidence to investigate, not proof an item is still open. Source references: [Sprint 4 pending](../sprint4/PENDING.md), [frontend Task 4 report](../sprint4/reports/frontend-task4.md), [Task 10 report](../sprint4/reports/task10.md), [Admin bugs router](../../../studio/src/api/routers/admin/bugs.ts), [triage repository](../../../studio/src/models/repositories/bug-report.repository.ts).

## Conflict resolution and per-task ready-for-review gate

Sprint 5 code may be prepared in draft while the owner tests/fixes Sprint 4. Do not mark ready based on the pre-closure main snapshot.

After the owner confirms Sprint 4 closure and its fixes are merged:

1. In the task's **own** worktree, fetch the updated origin/main and integrate it according to the established Git rules. Merge main into the task branch to avoid rewriting other sessions' history; no reset or automatic main merge. Include #90 and all Sprint 4 closure fixes.
2. Resolve conflicts preserving both the verified Sprint 4 fixes and task acceptance contracts. If the newer implementation already covers part/all of this task, remove duplicate implementation and document the scope reduction. Recheck shared schema/migration ownership and rebuild against the final contracts; do not keep whichever side happens to compile.
3. Run the task's required checks and interaction tests affected by integration. Update the report with actual tested HEAD/main SHA, conflict decisions, revised scope, closure link and unresolved production checks.
4. Recheck the PR for conflicts, passing required checks and satisfied prerequisites; correct title/body to the final implementation. A task waiting for an unmerged dependency stays draft or records an explicitly approved fixture/interface development boundary; it cannot claim integration complete.
5. When these checks pass, mark **that task's PR** ready for review (`gh pr ready <actual-number>`). Record readiness in its row/report; do not merge. If main changes materially afterward, repeat affected integration/checks and return to draft when readiness no longer holds.

Required readiness evidence: owner-confirmed Sprint 4 closure/carryover record; actual task branch/worktree/PR; latest integrated main; resolved conflicts; acceptance/interaction tests; named migration owner/compatibility approval where relevant; report/doc consistency; explicit live-verification limits. This is a release gate, not permission for paid tests or production writes.
