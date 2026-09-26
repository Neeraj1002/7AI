# Sprint 3 Task 8: UI Enhancement 1 — Backend Requirements (Gate 2 Visibility, Channel Edit, Channel Archive)

**Date**: 2026-09-27
**Status**: Complete — with the known residual gaps stated below
**Branch**: `UIENHANCEMENT1_BE` (own branch off `main`; PR "UIENHANCEMENT1_BE: Gate 2 Visibility, Channel Edit, Channel Archive")
**Commits**: `..._R1`, `..._R2`, `..._R3`, plus this report/STATUS/R4 commit
**Tests**: build, lint, typecheck clean; `npx vitest run` 104/104 (no new unit tests — verification below is live)

## What was built, per R-item

**R1 — Gate 2 privacy input + `Channel.defaultPrivacyStatus`.** One migration
(`channels_default_privacy_and_updated_at`): `defaultPrivacyStatus VARCHAR(20) NOT NULL DEFAULT 'private'` with a
CHECK on `private|unlisted|public`, plus `@updatedAt` on `Channel.updatedAt`. Mapped through `toDomainChannel` /
`Channel`. `runs.gate2`'s approve branch takes an optional `privacyStatus`; the handler always sends
`approve <explicit ?? channel.defaultPrivacyStatus>` (channel reused from `assertGateOwnership`, which now returns
it). The pipeline half (`parseGate2Reply` → stage output → `uploadVideo`) was already correct and untouched.

**R2 — `channels.update`.** `updateChannel(id, patch)` (partial patch) + a `channels.update` mutation (name,
nicheDescription, defaultPrivacyStatus). Shared `loadManageableChannel`: cross-tenant/missing → `NOT_FOUND`,
non-owner → `FORBIDDEN` (`canResolveGate`), archived → `BAD_REQUEST`. Returns the `withHasYoutubeCredential` shape.

**R3 — `channels.archive`.** Order: `isActive=false` → `deleteForChannel` → sweep of `pending|running|paused_gate1|
paused_gate2` runs (pending gate → `resolvePendingApproval(id, 'reject Channel deleted')`; otherwise
`updatePipelineRun(failed, 'Channel deleted')`). Idempotent (second call = success, sweep finds nothing).
`runPublishingStage` throws for an archived channel before any metadata/upload work; `pipeline-runner.ts` re-checks
before every stage; `runs.create` and `getYoutubeConnectUrl` reject archived channels. No restore path.

**R4 — `auth.me`.** New `auth` tRPC router, `me` → `{ email }` (null for the ops-token fallback). No JWT change.

## Verified live
- **R1**: real `runs.gate2` mutation against real pending-approval promises for two real runs, channel default set to
  `unlisted`: no privacy given → reply `approve unlisted` → `parseGate2Reply` = unlisted; explicit `public` → `approve
  public` → public. `updatedAt` confirmed advancing. *Caveat*: no run was at a pending Gate 2 at the time, so this
  exercised mutation → reply → `parseGate2Reply` (the unchanged downstream half was verified in Week 5 Task 5), not a
  fresh full pipeline through to an upload.
- **R2**: created a throwaway channel; `update` changed niche + default privacy, `get` round-tripped both and
  `updatedAt` advanced; another tenant's owner → `NOT_FOUND`; non-owner `approver` → `FORBIDDEN`. Archived → `BAD_REQUEST`
  confirmed under R3.
- **R3**: a real run driven (real LLM/TTS/stock footage) to a genuinely pending **Gate 2** on a throwaway channel with a
  credential row. `channels.archive` → run `failed`, `lastError = "Rejected at Gate 2: Channel deleted"`, no dangling
  pending approval (the gate's `await` resolved), `agent_credentials` row gone, second archive succeeded as a no-op,
  `runs.create` / `channels.update` / `getYoutubeConnectUrl` all `BAD_REQUEST … is archived`, `runs.list`/`runs.get` still
  return the archived channel's run, archived channel absent from `channels.list`. `runPublishingStage` on that run threw
  `Channel … is archived — refusing to publish`. A grep confirmed no history/dashboard code filters on `isActive`.
- **R4**: real session → the user's real email; ops fallback → `{ email: null }`.
- (A first R3 attempt failed at video review — stock footage mismatched an "otters" brief — unrelated to this change;
  rerun with a cats topic. A run on a tenant without an `AgentQuota` also hit `NoBudgetConfiguredError`; unrelated.)
- Temporary state reverted: founder tenant budget raised to $10 for the run then set back to $2; all throwaway channels archived.

## Deviations / notes to flag
- `lastError` for gate-held runs is the existing reject template ("Rejected at Gate 2: Channel deleted"), as the spec
  anticipated; only mid-automated-stage runs get the literal `"Channel deleted"`.
- The `pipeline-runner` per-stage guard is not separately live-tested (only the publishing guard and gate path were);
  it is a simple pre-stage `isActive` check.
- The `archive` sweep's `failed` write for a mid-stage run can be overwritten if that already-executing stage finishes
  afterwards; the runner's next-iteration check re-fails it, but only when driven by the live runner.

## Known residual gaps (stated honestly, not rounded up)
1. **Publish-time race is not closed.** An archive landing after `runPublishingStage`'s `isActive` check but before
   `uploadVideo` completes can still upload. Closing it needs a re-check adjacent to the upload or a DB lock.
2. **Product question (not decided here):** every stage re-reads the channel at execution time, so a niche/style edit via
   `channels.update` DOES affect not-yet-executed stages of runs already in progress — the opposite of what the UI copy
   currently tells users. Needs a wording fix or a real snapshot mechanism.
3. Pre-existing, out of scope: the live `pipeline-runner` loop never drives `publishing`/`analytics` (they only run via
   `resume-on-startup`).

## Schema
One migration, `20260926143250_channels_default_privacy_and_updated_at` (column + CHECK, `updatedAt` default dropped for
`@updatedAt`). `prisma migrate status`: up to date.
