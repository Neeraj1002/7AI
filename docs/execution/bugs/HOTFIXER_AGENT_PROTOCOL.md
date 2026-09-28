# Bugs Track: Hot-Fixer Agent Protocol

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting** — this protocol governs
*which* tasks a dedicated hot-fixer chat picks up and *how it coordinates with other chats*; the
template still governs the shape of the work itself (branch/commit steps, report format, `STATUS.md`
upsert). This file is the missing piece that makes it safe to run a hot-fixer chat concurrently with
whatever other chat (planning, sprint work) is also touching this repo.

## Environment — verify against preview, not local dev (added 2026-09-28)

**Founder decision, 2026-09-28**: testing has moved to the preview deployment
(`https://7aistudio.tech`, database `sevenai_preview` on the VPS) — this is now the environment a
hot-fixer's live-verification step targets, replacing local dev (`sevenai_dev`) as the default. This
changes **where a fix is verified**, not **how it's built or shipped**:

- Code edits, commits, and the `BUGS_TASK<N>` branch/PR still happen exactly as this protocol already
  describes, from the local checkout (`D:\Study Material\7AI-bugs`). Nothing about the git workflow
  changes.
- "Real, live verification" (see **Definition of done** below) now means reproducing the bug and
  confirming the fix against the live preview app/API (`https://7aistudio.tech`), not a locally-run dev
  server — unless a specific task doc says otherwise (e.g. a fix that's genuinely local-dev-only, like
  something in `.env.local`'s own handling).
- **Never connect directly to `sevenai_preview` from a local checkout** — there is no tooling set up for
  that, and the deployment doc's own rules (`docs/server/deployment/preview/detail.md`) treat the
  preview DB as reachable only from the VPS itself (`psql` over SSH, per `docs/server/usefulcmds.md`).
  Verification against preview means exercising the live app/API from outside (real HTTP calls, the real
  UI), the same way a founder would use it — never a direct DB read/write from a hot-fixer's own machine.
- A fix still merges to `main` the same way; `main`'s existing auto-deploy is what actually ships it to
  preview. This protocol's existing hard rule against pushing to `main` directly is unchanged.
- The pre-existing "real dev server vs. ad-hoc server" warning below (from Bugs Task 9) is about local
  dev specifically and still applies if any work genuinely stays on local dev — it isn't retired, just
  superseded as the *default* verification target.

## Why this exists
A second chat, attached to the same "7AI" Project and linked to the same computer as any other active
chat, can genuinely work independently — it has its own copy of every tool, reads/writes the same
Project docs, and can read/edit/build/test/commit on the shared codebase on its own. It is **not**
sandboxed from other chats touching the same files at the same time. The two real risks are: (1) two
chats picking up the *same* task and duplicating or conflicting work, and (2) a hot-fixer chat's branch
or edits colliding with sprint work in progress on the same files. This protocol exists to prevent both,
not to prevent the setup itself — the setup is fine.

## Purpose
A chat operating under this protocol is a **hot fixer**: it exists to pick up already-documented items
in `docs/execution/bugs/tasks/`, implement them, verify them live, and report — nothing more. It does
not plan features, does not restructure sprints, and does not invent scope beyond what a task doc
already states.

## Scope — in and out

**In scope**:
- Any task under `docs/execution/bugs/tasks/` whose `STATUS.md` row is `Not started`.
- Writing a *new* minimal task doc for a genuinely new, small, founder-reported bug, following this
  same folder's conventions (Task doc shape from `TASK_TEMPLATE.md`, `R1/R2/...` requirements with
  Where/Fix/Verify) — only when the founder hands it a bug directly and no task doc for it exists yet.
  It still writes the doc before touching code, same as every other track in this repo — "just fix it"
  is not a license to skip the paper trail everything else here has.
- This track covers backend, non-native app, and native app bugs, tagged with a `BE`/`FE`/`APP` **role**
  per item — see **Role Tags** below for what each means and, critically, what they no longer mean
  (they stopped determining branch choice as of the **Release & Branch Model** change below).

**Out of scope — never touched by a hot-fixer chat**:
- Anything under `docs/execution/sprint[N]/` or `docs/execution/frontend/` — planned feature work
  belongs to whichever chat/track owns that sprint, not to the bug queue.
- Any task whose fix would require a schema migration, a new external credential/OAuth scope, or a
  change to auth/security logic beyond what's explicitly described in an existing bug task's Fix — stop
  and hand it back to the founder as "needs a real task doc + design decision, not a hot-fix."
- **Merging to `main`, or pushing to `main` directly, under any circumstance — including "just to
  resolve a conflict I hit mid-task."** This is a hard rule with no exceptions, added after a real
  incident: a session resolving a merge conflict pushed the result straight to `main` without a
  branch or PR, entirely out of this protocol's own scope. Whatever you are doing — resolving a
  conflict, fixing a broken lockfile, anything — the result goes on this release's `BUGS_TASK<N>`
  branch and becomes a draft PR. If finishing a task requires touching `main` directly, stop and ask the
  founder first; do not treat "the conflict forced my hand" as an exception. `main`'s branch protection
  on GitHub is a backstop for this rule, not a substitute for following it.
- **Opening a second pull request for the same release, under any circumstance.** One `BUGS_TASK<N>`
  branch, one PR, for the whole release, from the moment its first item is picked up until the whole
  release is verified and the PR is marked ready. See **Release & Branch Model** below — this replaced
  the old per-role branch split specifically because it was producing multiple concurrent, conflicting
  PRs for what should have been one reviewable unit.
- **Any direct connection to `sevenai_preview` from a local checkout** — see the Environment note above.
  Preview is now where real, public-facing content is posted (a real channel, real audience) — treat it
  with the same care the existing "touching the production DB directly" guardrail already describes, now
  that preview genuinely is that production DB.

## Release & Branch Model *(replaced 2026-09-26 — see below for why)*

**One branch per release, one commit per item, one PR for the whole release.** A "release" is one
numbered Bugs Task (`task1.md`, `task2.md`, `task3.md`, ...) — the unit that already gets one report and
one `STATUS.md` row. Starting with **Task 3 onward**:

- **Branch**: `BUGS_TASK<N>` — one branch for the entire release, covering every `R#` item in that
  task doc regardless of role (`BE`, `FE`, or `APP` — see Role Tags below). Branch fresh from a
  just-pulled `origin/main` when the release's first item is picked up, and record that name in
  `STATUS.md`'s `Branch` column immediately (`TASK_TEMPLATE.md` Hard rule 3).
- **Commits**: one commit per `R#` item, in whatever order they're actually implemented — commit
  message shape `BUGS_TASK<N>_R<X>: <short description>`, e.g. `BUGS_TASK3_R1: Fix cross-tenant leak in
  runs.list/runs.get`. Implement, test, and commit each item as it's finished — don't batch multiple
  items into one commit, and don't wait until the whole release is done to make the first commit.
- **Report + `STATUS.md` closure**: once every item in the release is implemented and verified, write
  `reports/task<N>.md`, upsert the `STATUS.md` row (status, final notes, the `Branch` value), and commit
  that as one more commit on the same branch — `BUGS_TASK<N>_REPORT: <release name>`.
- **PR**: open the draft PR the moment the branch is created (the release's first item's commit, same
  timing `TASK_TEMPLATE.md`'s "Starting a new track-iteration" already describes for other tracks), push
  every subsequent commit to it, and mark it ready (`gh pr ready`) only once the whole release — every
  item, plus the report/`STATUS.md` commit — is done. Never open a second PR for the same release, and
  never open one at all unless the founder asked for it or this protocol's own timing (first commit of a
  new release) says to.

**Why this replaced the old per-role (`BUGS_BE`/`BUGS_FE`/`BUGS_APP_b<N>`) branch split**: that model
produced multiple sibling branches all cut from `main` around the same time for the same release,
frequently touching the same shared files (`STATUS.md` above all) — which is exactly what caused five
open PRs to pile up in conflict with each other and with `main`. Collapsing to one branch per release
removes the sibling-branch collision entirely, and matches how `TASK_TEMPLATE.md` already works for
every other track (one branch per track-iteration, one commit per task) — this was a deviation from that
existing pattern, not something the bugs track needed to justify having in the first place.

**What if one item is urgent and the rest of the release isn't ready?** Don't split the branch to solve
this — that's exactly the problem being removed. Flag it to the founder and let them decide whether to
fast-track that one item as its own small release (a new, separate `BUGS_TASK<N+1>` for just that item)
rather than improvising a branch split mid-release.

**Task 1 and Task 2 predate this change and are not retroactively renamed** — their existing branches
(`BUGS_TASK1_REPORT`, `BUGS_APP_b2`) and PRs stay exactly as they are, same "historical units aren't
renamed" principle `TASK_TEMPLATE.md` already applies to `week[N]` vs `sprint[N]`.

## Role Tags — BE / FE / APP *(informational only — no longer determine branch choice)*

Every `R#` item in a task doc still tags itself with exactly one role, because the *shipping and
verification* implications are still real and still differ — this just no longer decides which branch
an item's commit lands on (see Release & Branch Model above; every role's commits land on the same
`BUGS_TASK<N>` branch).

- **`BE`** — backend/API code (`studio/`). No native build concept applies — it's deployed by running
  the server, not installed as a package. Verification bar: a real API call / log line — **against
  preview by default now**, see the Environment note above.
- **`FE`** — JS/React-Native **logic-only** changes inside `app/` that touch no native config: no new
  native dependency, no new permission, no `app.json` plugin, nothing in the `android`/`ios` blocks.
  This is the set of changes that ship via `eas update --branch preview` once merged — **no new APK, no
  reinstall.**
- **`APP`** — changes to `app/` that touch native config: a new native dependency, a new permission, an
  `app.json` `plugins` entry, anything under `android`/`ios`, or the `runtimeVersion`/`updates` block
  itself. These can only ever ship via a fresh `eas build` + reinstall — OTA is structurally incapable of
  delivering them, no matter how OTA is configured. State the target Android version code for an `APP`
  item directly in that item's own Fix/Verify section (`eas build:version:get --platform android`, plus
  1) — this used to live in the branch name (`BUGS_APP_b<N>`); now it's just a fact recorded in the task
  doc/report, since the branch itself no longer encodes it.

**Why this still matters in practice**: a hot-fixer chat that doesn't check which role an item falls
into risks telling the founder "this will go out with the next OTA update" for a change that
structurally never can (a native one), or bundling a trivial JS tweak into an unnecessary native
rebuild. Tag every `R#` item with its role regardless of the (now unified) branch it commits to.

## Coordination — how it avoids colliding with other chats

1. **Before claiming a task**, read the current `docs/execution/bugs/STATUS.md` fresh from the Project
   (not from memory/context — another chat may have updated it since this chat last looked). If a
   task's row already says `In Progress` with a different owner, do not touch it — pick the next
   `Not started` row instead, or stop and tell the founder if none are available.
2. **Claim before starting**: update that task's row to `In Progress`, with an `Owner` value identifying
   this chat (e.g. `Hot-fixer chat, started 2026-09-25`) — this doubles as the lock other chats check in
   step 1. Do this as its own small commit/write before any code changes, so the claim is visible even
   if the fix itself takes a while.
3. **Before touching any file on the linked computer**, run `git status` and `git log -1` in the repo.
   If the working tree isn't clean, or `HEAD` isn't what `STATUS.md`/the task doc expects, stop and
   report the discrepancy rather than guessing — another chat may be mid-edit.
4. **Worktree**: use a single shared worktree for this entire track — `D:\Study Material\7AI-bugs`.
   **Write this track's docs (task files, `STATUS.md`, this protocol) into this worktree** — not only
   into the main checkout (`D:\Study Material\7AI`). A doc committed only to the main checkout is
   invisible to a session working from the bugs worktree until that worktree is separately
   pulled/merged; this exact gap caused Task 1's report to never get written anywhere durable the first
   time. The Project (read via the docs tool) is the cross-checkout source of truth, but the local
   worktree's own `docs/execution/bugs/` should match it too.
5. **Branch**: one `BUGS_TASK<N>` branch for the whole release currently being worked — see **Release &
   Branch Model** above for the full rule. Branch fresh from a just-pulled `origin/main` for a new
   release unless that exact release's branch already exists and is unmerged, in which case check it out
   and continue on it rather than branching again.
6. **Only ever commit to a branch you created yourself this release** (`TASK_TEMPLATE.md`'s Hard rule 2,
   binding here too) — never rebase, force-push, or add commits to a `BUGS_TASK<N>` branch you didn't
   create. Confirm via `git log`/`git branch -vv` and `STATUS.md`'s `Branch` column before touching an
   existing branch. If it has commits you don't recognize, treat it as another chat's in-flight work —
   stop and ask rather than overwriting.
7. **Document the branch name the instant you create it**: write the exact branch name into
   `STATUS.md`'s `Branch` column (`TASK_TEMPLATE.md`'s Hard rule 3) before or immediately after
   `git checkout -b`, not only once the release finishes — so the next session (this chat resumed, or a
   different one) checks there first instead of guessing or creating a duplicate.
8. **After finishing** (report written, `STATUS.md` row updated to its final status including the real
   `Branch` value, all commits pushed to the `BUGS_TASK<N>` branch, draft PR marked ready), re-read
   `STATUS.md` one more time before ending the session's work, in case another chat's concurrent write
   needs merging in by hand rather than being silently overwritten.

## Per-task workflow
For each `R#` item in the release: read it in full, implement, test (`npm run build`/`lint`/`typecheck`
plus that item's own real-verification bar — **against preview by default now**, see the Environment
note above), commit immediately (`BUGS_TASK<N>_R<X>: ...`), push. Once every item in the release is
done: write the report at `docs/execution/bugs/reports/task[N].md`, upsert the `STATUS.md` row, commit
that (`BUGS_TASK<N>_REPORT: ...`), push, and mark the PR ready for review — never merge, never push to
`main`.

## Definition of done / verification bar
Matches this repo's existing standard, not a lower one because it's "just a bug fix": every task doc in
this folder requires **real, live verification** (a real device, a real API call, a real log line —
never "should work" or a simulated check standing in for it). **As of 2026-09-28, "live" means the
preview deployment (`https://7aistudio.tech`) by default** — see the Environment note at the top of this
file — not a locally-run dev server, unless a task doc explicitly says otherwise. A hot-fixer chat does
not mark a task's `STATUS.md` row `Done` until it has actually reproduced the fix working there, the same
bar `hardening-tenant-check.md` and every sprint task doc already hold themselves to.

## Guardrails — when to stop and ask the founder
- The fix, once started, turns out to need a schema change, a new dependency with licensing/cost
  implications, or touches `auth.tsx`/session/token logic beyond what the task doc already specifies.
- A `BUGS_TASK<N>` branch already has unrecognized commits (see Coordination §6).
- Two task rows in `STATUS.md` look contradictory (e.g. both `In Progress` with different owners on
  what reads like the same underlying issue) — resolve by asking, not by picking one silently.
- Anything that would require deleting user data, rotating a live credential, or touching the
  production DB (`sevenai_preview`, and the `sevenai_dev` DB it superseded) directly rather than through
  the app's own code paths.
- Anything that would require pushing to `main` directly, or opening a second PR for the same release —
  see Scope above. Always stop and ask first.

## New-bug intake
The founder (or a planning chat) is the normal source of new task docs here, same as this session wrote
`task1.md`. A hot-fixer chat may draft a new minimal task doc itself only for a small, directly
founder-reported bug with no existing doc — see Scope above — and should default to *asking* rather
than assuming when a report is ambiguous enough that the Fix isn't obvious from the report alone.

## Kickoff message
To start a hot-fixer chat, open a new chat attached to this same "7AI" Project, link it to the same
computer this repo lives on (same "Link to this computer" step used for any session that needs to touch
real files), and open with something like:

> You are the hot-fixer for the 7AI project's `docs/execution/bugs/` track. Read
> `docs/execution/bugs/HOTFIXER_AGENT_PROTOCOL.md` in full and follow it exactly — especially the
> **Environment** note (verify against preview, `https://7aistudio.tech`, by default now — not local
> dev), the **Release & Branch Model** (one `BUGS_TASK<N>` branch and one PR for the whole release, one
> commit per `R#` item — never a branch or PR per item, never a second PR for the same release) and
> Coordination, since other chats may be working on this repo at the same time. Read
> `docs/execution/bugs/STATUS.md`, claim the next task per the protocol, and work it end to end:
> implement each item, verify it live against preview, commit it immediately on the release's one
> branch, and once every item is done write the report, update `STATUS.md`, and mark the PR ready. Stop
> and ask me before merging anything, before touching sprint-track files, before pushing to `main` under
> any circumstance, before opening a second PR for the same release, or if you hit any of the Guardrails
> in the protocol doc.

## Links & References
- [TASK_TEMPLATE.md](../templates/TASK_TEMPLATE.md)
- [STATUS.md](STATUS.md)
- [hardening-tenant-check.md](../sprint3/tasks/hardening-tenant-check.md) — precedent for a real,
  live-verification bar on a non-sprint-numbered fix
- `docs/server/deployment/preview/detail.md`, `docs/server/usefulcmds.md` — the preview VPS itself:
  what it is, how to reach it, and its own "never run" list (never touch `sevenai_preview` directly
  except through the app's own code paths, per the Guardrails above)
