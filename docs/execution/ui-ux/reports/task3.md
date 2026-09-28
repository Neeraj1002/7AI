# UI/UX Task 3: UI-E2 Bug Fixes — Device Review Fixes + Switch On Enhancement 2

**Date**: 2026-09-28
**Branch / PR**: `UI-e2-bug` / draft PR #41 (cut fresh from `origin/main` at `a667425`)
**Status**: Code complete for tasks 3 and 5. **Not "Done" per the new Definition of Done** — no phone
was available, so there are no screenshots beside the locked boards. Every item below is
"Built, unverified on device" unless marked otherwise.
**Tests**: `npm run typecheck` and `npm run lint` clean in `app/` (typecheck still reports pre-existing,
unrelated errors inside `studio/`'s own Prisma-client/repository types — not touched, not caused by this
branch; `studio/` was left alone throughout per instruction, including not regenerating its Prisma
client). Fingerprint (`expo-updates fingerprint:generate --platform android`, run from `app/`) =
`d9452ef2…`, identical to `origin/main` → OTA-eligible.

## Task 3 — Device review fixes (R1–R7, R9)

| Item | Result |
|---|---|
| R1 cold-start truncation | Built. `useFonts` now blocks (`if (!fontsLoaded && !fontError) return null`) instead of racing the system font against Archivo. Dropped `numberOfLines={1}` from tab labels and the three `Buttons.tsx` labels. (Sign-in's segmented tabs had no `numberOfLines` to remove.) |
| R2 Script review scores | Built. Plain-`View` bucketed bar chart (`≤5,6,7,8,9,10`), count above / score below, 28px bars, height = `count×24` capped at 104px, ≥7 accent / <7 `chartLow`. `BarChart` import dropped; `LineChart` kept for Content performance. |
| R3 Gate 1 decisions | Built. Header now shows "{n} total"; 12px 3-segment bar with 2px gaps; swatch legend row. |
| R4 Success rate copy | Built — and this surfaced a real bug worth flagging: `totalRuns` (and Channel detail's run count, R7) were computed by filtering `dashboard.operational.stageFunnel` for `stage === 'intake'`, but `stageFunnel` buckets by a run's **current** stage, so a run essentially never sits at `intake` — the count was almost always 0 regardless of how many runs actually existed. Fixed by summing every bucket in `stageFunnel` instead (every run is in exactly one bucket, terminal or not). This also fixes Dashboard's "No runs on this channel yet" empty state, which had the same bug. |
| R5 Inbox cards | Built. Message clamps to 3 lines; a threaded notification gets an "Open run →" link to Run detail. Inline gate actions unchanged. |
| R6 Tab bar pill | Built. `radius.pill` (999, a full capsule) → `radius.xl` (16). |
| R7 small fixes | Built. Queue subtitle: "{n} is/are waiting on you · {n} need(s) attention". `selectionColor`/`cursorColor` = `color.accent` added to all 14 `TextInput`s across 6 files. Channel detail runs count — same root cause and fix as R4. |
| R9 picker copy | Built. "Not connected — can't publish yet" → "Not connected — connect to run"; selection was already allowed (no change needed there). |

## Task 5 — pending items now switched on + long-text clamp

### R1 — Channel settings saved-value reading + flag flips
Rewrote `app/app/(app)/channel/[id].tsx`: deleted `PendingFields` and every cast; the draft type is now
`Partial<Omit<inferRouterInputs<AppRouter>['channels']['update'], 'channelId'>>`, and every read goes
through the real path (`approvalGateConfig.gate1Enabled`/`gate2Enabled`,
`brandAssets.captionsEnabled` ?? `true`, `budgetOverrideUsd` parsed with `Number()`, `styleGuide` sent as
`null` to clear). The B7 invariant (Gate 2 off requires Private, and Private can't be left while Gate 2
is off) is mirrored in the UI: the Gate 2 switch disables with the caption "Set default visibility to
Private to turn this off." whenever visibility isn't Private, and the Unlisted/Public segments disable
(new `SegmentedControl.disabledValues` prop) with "Turn Gate 2 back on to change this." whenever Gate 2
is off. A server `BAD_REQUEST` still shows under the Save bar with edits intact, as a backstop.
Final Approvals copy is in place verbatim. The loose `as typeof input` / `defaultPrivacyStatus` /
`defaultVoice` casts in `run/[id].tsx`, `(tabs)/notifications.tsx` and `new-brief.tsx` are gone — all
three fields are real now, and Gate 2's `privacyStatus` payload is built from a proper
`inferRouterInputs<AppRouter>['runs']['gate2']` type instead of a cast.

**Flags flipped, one commit each**: `gate2Visibility`, `channelEdit`, `channelDelete`, `channelSettings`,
`gateToggles`, `briefLength` — all now `true`. `watermarkUpload` stays `false` (native, task 4 E8).

Picker copy (was task 3 R9): done above.

### R2 — Run detail long-text clamp
New `components/ClampedText.tsx`: clamps to N lines, shows a toggle only when `onTextLayout` reports more
lines than the clamp (Android reports the true layout line count even under `numberOfLines`). Applied to:
Script review notes (3 lines, "Read full review"/"Show less"), Script text (6 lines, "Show full
script"/"Show less"; added "~{sec} sec · {words} words" beside the title), Gate 2 video-review rationale
(3 lines), and the needs-attention "What went wrong" body (3 lines). The Edit sheet (`GateActionBar`)
still gets the full, unclamped script — no change there.

## Deviations
- No screenshots — no device was available during this session. Per the new Definition of Done, this
  row should **not** be marked "Done" until the founder verifies on the OnePlus and screenshots are added
  here.
- `studio/` was not touched or reinstalled at any point (explicit instruction: the server was running).
  `npm install` was run in `app/` only, because `app/node_modules` was missing entirely at the start of
  this session (unrelated to `studio/`).
- Business Logic note carried over from the spec, not re-verified here: an auto-approved Gate 2 (Gate 2
  off) sets the run to `publishing`, but the live pipeline loop doesn't drive `publishing` until the next
  server restart — a Gate-2-off test may look stuck for that reason, not because of this branch.

## Flags at merge time
`gate2Visibility`, `channelEdit`, `channelDelete`, `channelSettings`, `gateToggles`, `briefLength`: **on**.
`watermarkUpload`: **off** (task 4).

## Verify still owed (founder's OnePlus)
All of task 3's R1–R9 device checks, plus task 5's: set every Channel settings field → save → kill/reopen
→ persisted; Public blocked while Gate 2 off; delete a throwaway channel; New Brief Length 45s → run shows
`targetDurationSec: 45`; Gate 2 visibility selector pre-set from channel default; the octopus run's Gate 1
fits on one screen with both clamp toggles working.
