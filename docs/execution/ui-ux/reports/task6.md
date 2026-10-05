# UI/UX Task 6: Run Lifecycle — Retry, Cancel, Run Again, and What Happens After Gate 2

**Date**: 2026-09-28
**Branch / PR**: `UIEnhancement-3` / draft PR #43 (cut fresh from `origin/main` at `be686c1`, after PRs #41 and #42 merged)
**Status**: Code complete. **Not "Done" per the Definition of Done** — no phone was available this
session, so there are no screenshots beside the locked boards.
**Tests**: `npm run typecheck` and `npm run lint` clean in `app/` (`studio/` untouched throughout — its
own typecheck noise, from a stale locally-generated Prisma client in this worktree, predates this branch
and was left alone). Fingerprint (`expo-updates fingerprint:generate --platform android`, from `app/`) =
`d9452ef2…`, identical to `main` → OTA-eligible.
**Flags**: none — PR #42 landed B11–B14 and `runs.progress` before this task started, so `runAgain`,
`cancelRunning` and `gateOutcomeFields` were never added, per the task's own updated instructions.

## Items

| Item | Result |
|---|---|
| E1 Needs attention | Built. Warn icon tile + title, humanised error + "(at {stage})", helper copy, raw `lastError` moved behind a "Technical details" toggle (collapsed by default). Bottom bar: primary "Retry this step", danger-**outline** "Cancel run" (new `DangerOutlineButton`). Stepper marks the failed step with a warn ring (new `Stepper.attention` prop). |
| E2 Decision sent | Built. Dark (`ink`) card, check-circle + a summary of exactly what was sent ("Approved · upload as {visibility}" / "Approved script" / "Script edited and approved" / "Sent back with notes" / "Rejected") — derived from the mutation's own variables at submit time, not a later server read. Indeterminate 6px bar (new `IndeterminateBar`, `Animated` loop). "Still stuck after a few minutes? Answer again" re-shows the gate actions (unchanged behaviour). |
| E3 Three outcomes | Built from `runs.get`'s `lastGateDecision`/`endReason` (B13) and `run.status`/`currentStage`: **Approved → publishing** (dark card, live now per B14 — no server restart needed; footnote about the 10-minute Needs-attention fallback); **Revise → new version** (dark card, quoted notes, "Regenerations used: n of 2"); **ended** (rejected/cancelled/failed) with the reason and, for a Gate 2 rejection, whether it was the script or the video. The Published card is restyled: `okText` 2px border, play icon tile, visibility + "Uploaded {time}" chips, full-width dark "Open on YouTube ↗", footnote about the Dashboard. |
| E4 Run again | Built. Ended runs get "Run again" (`runs.rerun` → `router.replace` to the new run) and "Edit brief & run again" (→ New brief with `channelId`/`briefText`/creation options as query params, applied via lazy initial state, each value checked against the known option lists before being applied). |
| E5 Cancel while running | Built. Run detail shows a danger-outline "Cancel run" for any `running`/`pending` run, confirm copy "The current step stops and nothing is published." The 60s "couldn't cancel yet" window (in-memory cancellation registry caveat) is a `setTimeout` started in a `useEffect` keyed on a `'idle'\|'pending'\|'timedOut'` state — not a `Date.now()` comparison read during render, which the project's stricter React purity lint now flags as a hard error. |

## Deviations
- **"Your Gate 2 decision" card** (mentioned separately in the Approved → publishing board) was folded into
  the same dark card's body line ("You approved this video as {visibility} {time} ago…") rather than a
  second card — the spec gave no further content for a standalone card, and this reads as one unit.
- **Per-run spend** on the rejected/cancelled ended screen is omitted — no per-run cost figure is already
  wired into Run detail, and adding a new `dashboard.cost` call just for this one line felt like scope
  the task didn't ask for; the "Nothing was published" line stands alone instead.
- The E5 cancel button also renders during the Approved→publishing and Revise→new-version states (both are
  `status: 'running'` server-side, and B11 already accepts `running`) — not explicitly called out on those
  two boards, but consistent with E5's own "for any run still in flight" framing.

## Not verified
Every item's phone Verify step (needs-attention retry/cancel, approve→publishing→published with a working
YouTube link, revise with a note, reject with a reason, cancel a running run, run again with identical
options) — no device this session.

---

# UI/UX Task 4: UIEnhancement-3 (remainder — E1, E5–E8)

Same branch/PR (#43), commits after task 6's.

| Item | Result |
|---|---|
| E1 Queue "In progress" | Built. A third section lists `running`/`pending` runs (added to the same `runs.list` query's `statuses`, still on the existing 15s poll) — `surface2` card, no border, radius 16, 1-line brief, 6px progress bar (`stepperIndexForStage(currentStage) ÷ 7`), "{stage} · {channel}" meta, relative time. Subtitle gains "· n in progress". |
| E2–E4 | Superseded by task 6 (as directed). |
| E5 New brief — channel not connected | Built. Warn strip fused under the channel field (no gap/rounded top corners, matching border), dark inline "Connect" button running the OAuth flow in place (no navigation to Channel detail and back). Create run gets a grey fill (`surface2`, still at reduced opacity while disabled) and a "Connect YouTube or pick another channel to continue" helper. Options section wrapped in `opacity 0.4` + `pointerEvents="none"`, header meta swaps to "Available once connected". |
| E6 Can't reach the server | Built. 64px `accentSoft` icon tile, 28/800 title, a bordered/ellipsised Server row replacing the bare URL text; body copy, "Still unreachable…" and the two buttons unchanged. |
| E7 Pickers from `options.list` | Built. New `useOptionLists()` hook in `pipeline-options.ts` (kept as the offline fallback + `satisfies` checks) feeds the Voice/Music sheets and Visuals segments on New brief and the Voice sheet on Channel settings from the server's own list; label overrides kept only where the raw key reads poorly (`ai-stills` → "AI images", `none` → "No music"). |
| E8 Watermark upload | **Not built.** Native (`expo-image-picker` + an `app.json` permission plugin) — changes the fingerprint and needs a fresh `eas build`. Per the task's own instruction ("build it last… leave it out if no build can happen now"), it's left out of this PR entirely; nothing in the app hides behind a flag for it since the row was never added at all (Channel settings still has the "Watermark upload… not built" code comment from task 3/5). |

## Deviations
- **E1** doesn't call the new `runs.progress` endpoint per-row — it already has `currentStage` from the
  same `runs.list` response that drives the rest of the Queue, so a second per-run polling query for every
  in-progress card would be pure overhead for the same data `stepperIndexForStage` already turns into a
  fraction. `runs.progress` stays available for Run detail if a future task wants a tighter poll there.
- **E7** required loosening `voice`/`visualSource`/`audioLayer` state from the static lists' literal-union
  types to plain `string` (since `options.list` returns arbitrary server strings), with a cast at the two
  mutation call sites (`runs.create`, `channels.update`). The server's own zod enums remain the actual
  validation; nothing is worse-typed at the boundary that matters.

## Not verified
Every item's phone Verify step — no device this session. In particular E7 (whether `options.list` is
actually reachable and returns real data) and E1 (a fresh run appearing under "In progress" within 15s)
are both meaningfully unverified without a live device against a live server.

## Fingerprint
`d9452ef2…` — identical to `main` throughout both tasks. OTA-eligible for everything shipped (E8 excluded
entirely, not shipped hidden).

---

# Fixes before merge (PR #43, 2026-10-06)

One commit each, `app/` only.

| # | Fix | Commit | Fingerprint |
|---|---|---|---|
| 1 | Queue: Needs attention cards read "{channel} · tap to retry or cancel" | `UIEnhancement-3_FIX_1` | `d9452ef2…` (= main) |
| 2 | Run detail: accent spinner; if the run isn't loaded after 10 s, or the request errors, "Couldn't load this run" with Retry (refetch) and Back — no endless spinner. The 10 s timer sets state only from its own callback; the Retry handler resets it. | `FIX_2,3` | `d9452ef2…` |
| 3 | "Cancel run" hidden while `currentStage === 'publishing'` (a cancel mid-upload could leave a video live while the app says "Cancelled") | `FIX_2,3` | `d9452ef2…` |
| 4 | Channels → Account: "Version" row = `{nativeApplicationVersion} · {Updates.updateId (8) or built-in}`. `expo-application` was already in `node_modules`; it is now declared explicitly in `package.json` — fingerprint verified unchanged before and after. | `FIX_4` | `d9452ef2…` |
| 6 | Report-a-bug icon: `okText` on `okBg` (`#E2F5E8`, the token the brief calls "okSoft") circle, via new optional `iconColor`/`backgroundColor` props on `IconButton`, set once in `ReportBugButton` | `FIX_6` | `d9452ef2…` |
| 5 | Watermark upload (task 4 E8): `expo-image-picker` + `app.json` plugin with a photo-library permission string; Channel settings Watermark row (dashed "Upload logo", PNG only → multipart POST with bearer header; when set, 40×40 authed thumbnail + Replace + Remove (DELETE); server error message shown on rejection); `watermarkUpload` flag now `true` | `FIX_5` | **`08da3cef…` — changed (native)** |

## Shipping — what is and isn't done
- **OTA (fixes 1–4, 6): NOT published.** `eas update` pushes to the live `preview` channel; I did not run it without your explicit go-ahead. **Publish it from commit `80554e5` (`FIX_6`), not from branch head:** head now includes fix 5, whose runtime version (`08da3cef…`) the currently installed APK does not match, so an update published from head would never reach it.
- **Native build (fix 5): NOT run.** No other native change is queued in `docs/execution/bugs/STATUS.md` to bundle with. Needs `eas build -p android --profile preview`; the new runtime version to record once built is **`08da3cef743fc8bfb00a1cee68721a418b44b741`** (from `expo-updates fingerprint:generate`; EAS should print the same value).
- Fix 5 code is on the branch but untested on a device; the upload path (RN multipart `FormData` with a `{uri,name,type}` part) in particular needs a real phone against the real server.

## Status
Not "Done" per the Definition of Done — no phone screenshots. Watermark: "Built — awaiting native build".
