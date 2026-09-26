# Sprint 3 Backend Task 8: UI Enhancement 1 — Backend Requirements (Gate 2 Visibility, Channel Edit, Channel Archive)

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.**

Condensed copy of the task as issued (2026-09-26/27). Branch: `UIENHANCEMENT1_BE` (own branch — not
`SPRINT3_BE`/`SPRINT4_BE`). Exists to unblock three feature-flagged controls in the UI/UX track's "UI
Enhancement 1" frontend build (`UIUX_ENH1_FE`). Commits: `UIENHANCEMENT1_TASK8_BE_R<X>: ...`, one per R-item.

## R1 — Gate 2 approval accepts a privacy choice; channel gets its own default
- Migration: `Channel.defaultPrivacyStatus VARCHAR(20) NOT NULL DEFAULT 'private'` + CHECK
  (`private|unlisted|public`); also `@updatedAt` on `Channel.updatedAt` (same migration).
- Map it in `toDomainChannel` / `Channel` type.
- `runs.gate2` approve branch: optional `privacyStatus`; handler sends `approve <privacyStatus>`, or
  `approve <channel.defaultPrivacyStatus>` when omitted (reuse the channel from `assertGateOwnership`).
- Verify: real pending Gate 2 with no privacy -> channel default applied; explicit `unlisted` wins.

## R2 — `channels.update`
- `updateChannel(id, patch)` repository fn (partial patch). Router `update`: `channelId`, optional
  `name`, `nicheDescription`, `defaultPrivacyStatus`; same ownership check as `disconnectYoutube`;
  `BAD_REQUEST` on archived channel; returns `withHasYoutubeCredential(updated)`.
- Finding to report (product question, not fixed here): stages re-read the channel fresh at execution,
  so a niche edit DOES affect in-progress runs' not-yet-executed stages — contrary to the UI copy.

## R3 — `channels.archive` (soft delete, one-way)
- `archiveChannel`; router `archive` (ownership check, idempotent): set `isActive=false`,
  `deleteForChannel`, then sweep runs in `pending|running|paused_gate1|paused_gate2`: pending gate ->
  `resolvePendingApproval(run.id, 'reject Channel deleted')`; otherwise
  `updatePipelineRun(id, {status:'failed', lastError:'Channel deleted'})`.
- `runPublishingStage`: refuse if `!channel.isActive` (the "never uploads" choke point).
- `pipeline-runner.ts` loop: per-iteration archived check -> mark failed, stop.
- `runs.create` and `getYoutubeConnectUrl`: reject archived channels. No restore path.
- History (runs.list/get/dashboard) must stay readable — confirm, don't assume.
- Known residual: a publish racing an archive after the isActive check but before upload is not closed.

## R4 (optional) — `auth.me`
- New `auth` tRPC router, `me` query -> `{ email }` (null for ops-token). No JWT shape change.

## Report
`docs/execution/sprint3/reports/task8.md`; state verified-live vs residual gaps honestly.
