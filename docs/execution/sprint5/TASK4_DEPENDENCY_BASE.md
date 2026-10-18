# Task 4: Develop Against PRs #91 and #92 Before They Merge

**Owner direction:** 2026-10-16. Task 4 may implement and validate its adopted evidence-consumer scope against an isolated integration of PRs #91/#92 before they merge. This explicitly overrides the earlier Task 4 instruction limiting pre-gate work to documentation/fixtures. It changes Task 4 development sequencing, not production approval, other tasks' gates, dependency acceptance or final PR readiness.

## Evidence and decision

**Verified—GitHub, 2026-10-16:** #91 is open/draft, branch `SPRINT5_TASK1_BE`, head `cd0036a06cd7b61d2c0a4bcb8e31cc7ad1b98f9b`; #92 is open/draft, `SPRINT5_TASK2_BE`, head `b08925ecdbd87de730e0372315060107bc61150f`. Both target main and individually report CLEAN merge state. That does not prove they merge cleanly with each other or that combined acceptance passes. #94 is open/draft, `SPRINT5_TASK4_BE`, head `9e6d98d31de2b68ec99cab9e44be407f966d703a`, currently targeting main. Refresh the actual heads before setup; these are snapshots, not permanently pinned instructions.

**Verified locally / reported adoption:** Task 4's report records the owner-adopted [consumer v1 agreement](SCRIPT_REVIEW_EVIDENCE_CONTRACT.md), fixture work and no application implementation yet. The missing-consumer-definition blocker is resolved. Gate R was closed because dependency PRs remained unmerged.

**Inference:** merge status was an unnecessarily strict implementation prerequisite. Combining dependency revisions locally permits real compatibility work without changing their PRs or deploying them. Dependency drift remains something the owning agent must re-integrate and test.

**Authorized development approach:** Task 4's agent owns a temporary dependency integration branch plus its existing task branch. It can finish code, local/sandbox tests and its report against the recorded composite. State completion as **implementation complete against dependency snapshots**, while release integration remains pending. No automatic claim that gate R is globally satisfied.

## One integration base for two dependencies

A GitHub PR has one base branch. Do not pretend #94 can independently base on both #91 and #92, and do not simply merge both into #94 while leaving main as its base without checking the resulting diff.

1. In the existing shared Sprint 5 root, the Task 4 agent creates a dedicated dependency worktree, proposed `task4-deps`, on a new branch it owns, proposed `SPRINT5_TASK4_DEPS`, starting from current origin/main. Verify branch/path ownership and current main first; do not switch the shared base checkout or another task's worktree.
2. Fetch current #91/#92 heads and merge their commits into that **dependency-only integration branch**. Keep their code/receipts/diagnostic contracts intact. Resolve actual integration conflicts and record the resolution; main being clean for each alone is insufficient. Do not copy Task 4 code or fixture/report commits into this base.
3. Record main SHA, both dependency head SHAs and resulting integration SHA. Push this agent-owned base branch. It needs no new task or umbrella PR; it exists only to make the dependency comparison explicit. Do not push to, edit or mark ready PRs #91/#92/#93.
4. In its existing `task4` worktree, preserve #94's current commits and merge the integration base into `SPRINT5_TASK4_BE`. Do not reset away documentation/fixtures or force-push another session's history. Resolve conflicts under Task 4 ownership; exclude unrelated changes.
5. Retarget **draft #94** to the pushed dependency integration branch. Verify GitHub's changed-files diff contains only Task 4 work relative to that base. Its body must identify #91/#92, all tested SHAs and the temporary base. Do not merge #94 into that temporary branch as a substitute for eventual main integration.
6. Implement the adopted optional evidence input, common factual prompt renderer, stage snapshots/references and compatibility tests in #94. Full SR-1–SR-9 rules/retrieval/score changes remain outside scope. Recheck current Script Review ownership; Task 3 retains its production-fit/scene changes and shared-call-site coordination.

The agent performs these Git/PR actions in its own task worktrees/branches. This planning chat only writes instructions; it has not changed #94's branch/base or any dependency PR. The user's direction authorizes this Task 4 development arrangement, not other agents editing its checkout.

## Validation and dependency changes

Run Task 4's build/lint/typecheck, request-parity/policy/hash/legacy/restart/invalidation tests and relevant combined stage/route regressions against the actual composite. Preserve #91/#92 checks and report any dependency failures by owner; don't quietly reimplement publishing or diagnostics in #94. Task 2 alone owns its migration. Generate clients/apply required dependency migrations only in an isolated named test/sandbox database, with no production/shared DB changes or service startup that resumes other runs. Providers remain mocked; no paid calls, live retry, upload, migration deployment or production-data writes.

If #91/#92 move, update the dependency base by merging their newer heads, then merge that base into Task 4. Record new SHAs and rerun checks affected by the differences. Do not call tests of old dependency heads validation of the updated branch. If an integration conflict changes a dependency's product contract, coordinate that change with its owner rather than silently changing it in the temporary base.

## Final main integration and ready-for-review

Keep #94 draft while its dependency base is temporary. After #91/#92 are merged and reliability acceptance is confirmed:

1. Integrate latest origin/main, including any differing dependency revisions and Sprint 4 closure fixes, into Task 4's own branch. Preserve verified fixes and rerun affected acceptance/interaction tests; resolve any shared Task 3 integration as planned.
2. Retarget #94 back to main. Check the final diff: it must contain Task 4 changes only, with no duplicate dependency implementation, unrelated migration or accidental revert. Reconcile changed/squashed dependency history through integration rather than assuming commit ancestry guarantees the right diff.
3. Update report and PR body to the actual final source/main/tested SHAs, conflict decisions, remaining production limits and owner-confirmed Sprint 4 closure/carryover record.
4. Mark #94 ready for review only when the original release checks and Sprint 4 closure requirement are met. Founder merging/auto-deployment remains separate. No removal of the temporary branch/worktree until no PR depends on it and its owner is authorized to clean it up.

Task 4 can therefore finish implementation now against a tested dependency composite. It need not wait for dependency merges to write code, but it must not describe the dependency stack as already merged/deployed or claim final release acceptance prematurely.
