Links to removed docs: see docs/ARCHIVE_INDEX.md (tag docs-archive-2026-10-26).

# 7AI Mobile App: Design Direction

**Status**: Proposed — framework and v1 scope below reflect founder confirmation (2026-09-09). Not yet broken into buildable tasks; see "Next step" at the bottom.
**Owner**: Neeraj Singh (founder)
**Relationship to the backend build**: this is a new, parallel track, not a "Week 5" continuation of the weekly backend cadence — the founder's own framing was building it "side by side" with Claude Code. Task numbering for this track should live under its own path (proposed: `docs/execution/frontend/`), not squeezed into the week-N structure the backend uses.

## 1. Why this exists

Everything built so far is reviewed through Telegram (Gates 1/2) or by directly querying Postgres. The founder wants to test the actual product through a real app UI instead — and, longer-term, this is the actual operating surface for running up to 7 channels, so it needs to be built with that scale in mind from the start even though v1 will only ever look at one channel's data.

## 2. Framework: React Native (via Expo)

**Decision**: React Native, using Expo (not bare React Native) for the build/deploy tooling.

**Why, given the founder explicitly said language isn't a deciding factor and ruled out separate native codebases:**
- One TypeScript codebase covers iOS and Android both — no separate Swift/Kotlin UIs to keep in sync, satisfying "not into separate UI."
- It stays in TypeScript, matching every other line of code in this project (`studio/`'s Prisma models, Zod schemas, the whole backend). That's not just consistency for its own sake — it means Claude Code, which already knows this codebase's conventions, can move between backend and app work without a context switch, and any shared types (a `PipelineRun` shape, a `ReviewLog` verdict enum) can genuinely be shared, not hand-translated into a second language.
- It renders real native components, not a webview — it actually feels like an app, which matters given the founder specifically wants to "test through app UI," not a mobile website.
- Expo specifically (over bare React Native) means no fighting Xcode/Android Studio project setup directly — `expo go` gets something on a real phone in minutes during development, and Expo's build service (EAS) handles the eventual real builds without needing a Mac for iOS builds.

**Honest trade-offs, since this was asked for:**
- Flutter is a legitimate alternative and arguably has an edge on custom animation/UI polish — it lost out here specifically because Dart is a genuinely different language from the rest of this project's stack, which matters more for a solo-operator + AI-pair-programming setup than it might for a bigger team.
- A Progressive Web App would ship fastest and could reuse React components directly, but push notifications (the natural replacement for "a gate needs your decision") are meaningfully weaker on iOS PWAs, and it wouldn't feel like a real installed app — working against the actual goal here.
- React Native's real limitation: occasional friction on exotic native-hardware features. Nothing in this app's scope (lists, forms, video playback, charts, push notifications) is exotic — this isn't expected to bite.

## 3. The real prerequisite: there is no API layer yet

This is worth stating plainly rather than skipping past: `studio/` today is an orchestrator process plus a Telegram bot. Nothing exposes `PipelineRun`s, gate decisions, or dashboard data over HTTP. Before any app screen can show real data, `studio/` needs a new API layer — REST or tRPC (tRPC is the more natural fit here, actually: same TypeScript types shared end-to-end between the API and the app, no separate OpenAPI/schema layer to maintain) — covering at minimum: create a run (submit a brief), list/get run status, respond to Gate 1/Gate 2, and the dashboard's aggregate queries.

This also means **authentication**, even for a single operator: this API can trigger real spend (LLM calls, video generation) and real actions (a YouTube upload), so it can't be an open unauthenticated endpoint reachable by anyone who finds the URL. A single long-lived token or passcode stored in the app is enough for v1 — this is not a multi-user auth system, just a lock on the door.

This isn't scope creep on the app — it's a real, necessary piece of backend work that has to happen first (or alongside) the app's own build.

## 4. v1 screen structure

Per the founder's own scope answer — the frontend should cover whatever the backend currently supports, and grow as the backend does. Mapped against the actual current/Week 4 backend surface:

- **Queue** — list of runs needing a human decision right now (`paused_gate1`, `paused_gate2`, `needs_attention`), across channels. This is the screen the founder actually opens most.
- **Run Detail** — one screen, sectioned by whichever gate is currently active (confirmed 2026-09-09, see note below): the brief and stage history are always shown; below that, either a Script Review section (script text + Script Review's score/notes, while paused at Gate 1) or a Video Review section (real video playback + Video Intelligence's verdict, while paused at Gate 2) renders — never both at once, since a run is only ever paused at one gate at a time. Once a gate is passed, its section collapses to a read-only summary rather than disappearing, so the full history stays visible on the same screen. Both sections use the same three-action pattern: **Approve**, **Reject** (with a reason), **Edit/Revise** (opens a feedback sheet) — at Gate 1 that sheet offers editing the script text directly *or* leaving notes for regeneration; at Gate 2, notes only, since there's no way to hand-edit a video frame-by-frame. This replaces the Telegram reply grammar with real UI controls.

  **Confirmed design note (2026-09-09)**: combined single screen over two separate Script Review / Video Review screens — a run only needs one active review at a time, so splitting the screen wouldn't add real capability, and combining keeps the screen count down per the founder's own "keep it minimal" scoping. Splitting later, if it turns out to be wanted, is a low-cost UI change (the data-fetching and gate-action logic stay identical either way — it's mostly moving JSX into its own route). Video playback specifically is unaffected by the combined layout: only one media section is ever mounted for a given run's current stage, so there's no dual-rendering or performance concern from combining.

  **Real technical requirement this surfaces**: the generated video file lives on the orchestrator's local filesystem (`videoPath`), which the app can't reach directly — the API needs an actual video-serving endpoint (`GET /runs/:id/video`, see `docs/execution/frontend/BUSINESS_LOGIC.md` Section 3), and the app needs a real player component. Recommend `expo-video` (Expo's current library — `expo-av`'s video API is being phased out) with the `API_AUTH_TOKEN` attached as a request header on the video source, keeping one auth mechanism across the whole app rather than a special case for video.
- **New Brief** — submit a brief and pick a channel, triggering a new `PipelineRun`. (Backend-side: this is genuinely new — Week 1–4's briefs were all submitted via `dry-run.ts` from a terminal; there's no programmatic "start a run" entry point yet either.)
- **Dashboard** — the four groups already discussed: operational health (stage funnel, `needs_attention` count/list, recent completions, success rate), cost (spend vs. `AgentQuota.budgetCeilingUsd`, by channel and by stage, cost-per-published-video), content performance (from `PerformanceSnapshot`, once real data exists), and quality signal (`ReviewLog` score distribution, video regen rate, gate approve/edit/reject rates).
- **Channel switcher** — even with one channel active today, every screen above is channel-scoped in the data model already (`tenant_id`/`channel_id` on everything) — the UI should reflect that from day one rather than hardcoding a single channel, so adding channel #2 later is a data change, not a UI rewrite.

**Explicitly out of v1**, consistent with "minimal": channel creation/settings management (channel config stays a backend/config-file concern for now, same "Principle 10" reasoning the backend itself has followed all along), any multi-user roles or permissions (this is a single-operator tool), push-notification infrastructure choices (real, but an implementation detail for whoever builds this, not a design fork worth resolving here).

## 5. Next step

This document is the design direction, not a task breakdown. Given the real API-layer prerequisite in Section 3, the natural first task is that layer, not the app itself — the app has nothing to render without it. Recommend: confirm this structure, then this gets broken into real task docs (API layer first, then the app scaffold + Queue/Detail, then Dashboard) the same way every week of the backend build has been — just under its own `docs/execution/frontend/` path rather than a week number, since it runs in parallel rather than in the weekly sequence.
