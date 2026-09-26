# UI Enhancement 1 — Backend Requirements (for the system architect)

**From**: UI/UX track (`docs/execution/ui-ux/`), 2026-09-26
**Frontend task this supports**: `docs/execution/ui-ux/tasks/task1.md` (branch `UIUX_ENH1_FE`)
**Status**: requirements only — the architect analyses these and writes the backend task(s). The UI/UX
track never touches `studio/`.

The frontend ships **without waiting** for any of this: every control that depends on an item below is
hidden behind a flag in `app/lib/feature-flags.ts` and turned on in a one-line follow-up once that
item is merged. Code references below were checked against `origin/main` on 2026-09-26 (after Bugs Task 3).

---

## Paste-ready prompt for the system architect

> You're the system architect for 7AI Studio (Fastify + tRPC backend in `studio/`, Prisma/Postgres, Expo
> app in `app/`). The founder has locked a UI redesign ("UI Enhancement 1", frontend task
> `docs/execution/ui-ux/tasks/task1.md`, branch `UIUX_ENH1_FE`). The frontend is FE-only and ships on
> its own; three of its controls are hidden behind feature flags until the backend supports them. Please
> analyse the requirements below against the current code, confirm or correct each "current state"
> claim, resolve the open decisions with the founder, and write the backend task doc(s) in this
> project's normal format (`docs/execution/templates/TASK_TEMPLATE.md`, Hard rules apply — never push or
> merge to `main`). Keep each change as small as the reason for it; don't redesign anything the UI
> doesn't need.
>
> **B1 — Let the app choose YouTube visibility at Gate 2 (small; highest value)**
> - *UI need*: Gate 2 screen has a Private / Unlisted / Public selector; the approve button says
>   "Approve & upload as private|unlisted" or "Approve & publish publicly".
> - *Current state*: the pipeline already supports this end-to-end — `agents/gate2/index.ts`
>   `parseGate2Reply` accepts `approve public|unlisted|private` (Week 5 Task 5/D2), and publishing uses
>   the resolved `privacyStatus` (`agents/publishing/types.ts`, default `private`). But the app's only
>   path, `runs.gate2` in `api/routers/runs.ts`, accepts `{ action: 'approve' }` with no privacy field and
>   always sends the bare reply `approve` → every app approval uploads **private**.
> - *Direction*: add optional `privacyStatus: PrivacyStatusSchema` to the `approve` branch of
>   `runs.gate2`'s input; build `replyText = privacyStatus ? \`approve ${privacyStatus}\` : 'approve'`.
>   Nothing else changes. Unknown values are rejected by zod at the edge (same posture as `voice` /
>   `visualSource` on `runs.create`).
> - *Reason*: the founder asked for an explicit private/public choice at approval; the capability exists
>   but is unreachable from the app.
> - *Decision for the founder*: is the default always Private, or a per-channel default (would need a
>   `Channel.defaultPrivacyStatus` column — only if the founder wants it)?
>
> **B2 — Edit a channel's name and niche (new mutation)**
> - *UI need*: new "Channel detail" screen with editable Name + Niche description and a Save button.
> - *Current state*: `api/routers/channels.ts` has `list`, `get`, `create`, `getYoutubeConnectUrl`,
>   `disconnectYoutube` — no update. `channel.repository.ts` has no update function.
> - *Direction*: `channels.update({ channelId, name?, nicheDescription? })` — at least one field; trim;
>   non-empty; `name` ≤ 255 (DB `VarChar(255)`). Same authorization as connect/disconnect:
>   tenant match + `canResolveGate(ctx, channel)`, `NOT_FOUND` for another tenant's channel, `FORBIDDEN`
>   for a non-owner. Returns the channel via `withHasYoutubeCredential` like the other procedures.
>   Reject updates to an archived channel (see B3).
> - *Reason*: 7 channels are planned; niches will be tuned over time and today the only way to change
>   one is a DB edit.
> - *Please confirm*: the UI promises "Scripts for new runs use this. Runs already in progress keep the
>   old version." Check whether the pipeline snapshots the niche at run creation or re-reads
>   `Channel.nicheDescription` at each stage. If it re-reads, either snapshot it (preferred) or tell the
>   UI track so the copy changes — the copy must not lie.
>
> **B3 — Soft-delete (archive) a channel (new mutation, reuses an existing column)**
> - *UI need*: "Delete channel" on Channel detail → confirmation → channel disappears from the channel
>   list, New Brief's picker and the Dashboard picker; its past runs, videos and spend history stay.
> - *Current state*: `Channel.isActive` already exists, and `listActiveChannelsByTenant`,
>   `listActiveChannelsByTenantAndPlatform` and the 7-channel cap count
>   (`countActiveChannelsByTenantAndPlatform`) already filter `isActive: true`. So archiving =
>   `isActive = false`; list and cap behave correctly with no further change. Nothing sets it today.
> - *Direction*: `channels.archive({ channelId })` (same auth as B2) sets `isActive = false`
>   (optionally add `archivedAt timestamptz` for audit — architect's call). Plus these guards:
>   1. `runs.create` must reject an inactive channel (`BAD_REQUEST`, "Channel is archived") —
>      today it only checks existence + tenant.
>   2. `channels.update` / `getYoutubeConnectUrl` reject inactive channels.
>   3. `runs.get` / `runs.list` / dashboards keep working for runs on archived channels (history) —
>      `findChannelById` doesn't filter `isActive`, so this should already hold; please confirm.
> - *Reason*: founder asked for soft delete; hard delete would destroy run/spend history the dashboard
>   and the learning loop rely on.
> - *Decisions for the founder*:
>   a. In-flight runs on an archived channel (running / paused at a gate): cancel them (→ `failed` with
>      `lastError "Channel archived"`), or let them finish? (UI shows one warning line with the answer.)
>   b. Does an archived channel free one of the 7 slots? (With `isActive=false` it does automatically.)
>   c. Keep or delete its YouTube credential (`agent_credentials`) on archive? Recommendation: delete —
>      an archived channel should never be able to upload.
>   d. Is un-archive needed now? (UI has no restore button in Enhancement 1.)
>
> **B4 — Optional, low priority: who is signed in**
> - *UI need*: Account section shows "Signed in as {email}".
> - *Current state*: the verify response / app session stores `userId`, `tenantId`, `role` — no email.
>   The UI will store the typed email locally as a stopgap.
> - *Direction (optional)*: include `email` in the verify response, or add a tiny `auth.me` query.
>
> **Explicitly NOT needed from backend** (so nobody builds them):
> - Channel names on Queue rows — the app joins `runs.list[].channelId` with `channels.list`
>   client-side. (Optional later: `channelName` on `runs.list`, only because archived channels drop out of
>   `channels.list` and show as "Deleted channel".)
> - Per-channel stats on Channel detail — derived from existing `dashboard.operational` /
>   `dashboard.cost` with `channelId`.
> - Friendly error reasons on Queue — mapped client-side from `lastError` prefixes. (Recommended
>   later: a structured `lastErrorCode` enum on `PipelineRun`, so the UI stops pattern-matching
>   prose. Architect's call on timing.)
> - Telegram chat ID on sign-in — already shipped (Bugs Task 3/R5).
>
> Deliverable: backend task doc(s) with branch name(s) recorded per the Hard rules, and for each of
> B1–B3 the exact tRPC input/output so the frontend can flip its flag without guessing.

---

## Summary table

| # | Change | Size | Unblocks (FE flag) | Needs founder decision |
|---|---|---|---|---|
| B1 | `runs.gate2` approve accepts optional `privacyStatus` | XS (≈5 lines) | `gate2Visibility` | default policy |
| B2 | `channels.update` (name, niche) | S | `channelEdit` | — (confirm niche snapshot behaviour) |
| B3 | `channels.archive` (sets `isActive=false`) + 2 guards | S | `channelDelete` | in-flight runs, credential, restore |
| B4 | email in session / `auth.me` | XS, optional | — | — |
