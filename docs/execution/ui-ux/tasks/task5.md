# UI/UX Task 5: Pending from UI Enhancement 2 — Locked-Design Items Not Visible on the Phone

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting**, plus
`UI_UX_AGENT_PROTOCOL.md`, `tasks/task1.md`, `tasks/task2.md` and `tasks/task3.md`. The template's Hard rules
apply (never push/merge to `main`, only commit to a branch you created, record the branch in `STATUS.md`).

**Why this task exists (founder device check, 2026-09-28)**: these are in the locked "Visual Directions"
canvas and in tasks 1–2, but are not on the phone:
| Seen on the phone | Why it's missing | Fixed by |
|---|---|---|
| New brief has no Length | Built, but hidden: `flags.briefLength` is still `false` although B10 merged | R1 |
| Channel settings shows only Name and Niche | Built, but hidden: `channelSettings`, `gateToggles`, `gate2Visibility` still `false`; the screen also reads the saved values from the wrong fields | R1 |
| No Delete channel | Built, but hidden: `flags.channelDelete` still `false` although B3 merged | R1 |
| Run detail: Script review and Script print the whole text and fill the screen | **Spec gap**: task 1/E3 said "review notes" and "script text" with no length limit; the locked board only showed short sample text | R2 |

**This task supersedes `tasks/task3.md` R8 and R9** (flag flips + Channel settings fix + picker copy).
Build them here, not there; task 3 is now R1–R7 only.

**Order — strict**: task 3 (R1–R7) → **this task** → task 6 → task 4. Tasks 3 and 5 ship together.
**Objective**: every Enhancement 1/2 control on the locked canvas is visible and works on the phone.
**Duration**: ~1 dev day
**Depends On**: task 3's commits (same branch). All backend items are on `main` (B1, B2, B3, B5, B7, B10).
**Owning Component**: `app/` only.
**Role**: `FE` — JS-only, OTA-eligible.
**Branch**: `UI-e2-bug` — the **same branch and PR as task 3**, commits after task 3's
(`UI-e2-bug_T5_R<N>: ...`). One report covers both (`reports/task3.md`, with a "Task 5" section).
**Success Criteria (Definition of Done — new, applies to every UI task from now on)**: the PR is not "Done"
until the report has a **phone screenshot next to each locked board it implements**, taken on the
founder's OnePlus after the OTA, with every feature flag the task depends on stated as on/off. Code that is
built but hidden behind a flag is reported as **"Built — hidden (flag X off)"**, never "Done".

---

## Items

### R1 — Channel settings: fix saved-value reading, then switch everything on
(Moved verbatim in intent from task 3 R8.) The screen (`app/app/(app)/channel/[id].tsx`) reads fields the
backend doesn't return — checked against `studio/src/types/channel.types.ts` on `main`:
| Field | Screen reads today | Backend returns |
|---|---|---|
| Gate 1 / Gate 2 | `channel.gate1Enabled` / `gate2Enabled` | `channel.approvalGateConfig.gate1Enabled` / `.gate2Enabled` |
| Captions | `channel.captionsEnabled` | `channel.brandAssets.captionsEnabled` (missing = `true`) |
| Spend limit | a number | a **string** or `null` — parse with `Number()` |
| Style guide | `''` when empty | `null` — send `null` to clear |
Delete the `PendingFields` type and its cast; type from `inferRouterOutputs<AppRouter>['channels']['list'][number]`
and `inferRouterInputs<AppRouter>['channels']['update']`. "Changed fields only" must compare like with like.
**Gate 2 rule (B7 as built)**: server rejects Gate 2 off unless default visibility is Private, and rejects
leaving Private while Gate 2 is off. UI: visibility ≠ Private → Gate 2 switch disabled, caption "Set default
visibility to Private to turn this off."; Gate 2 off → Unlisted/Public disabled, caption "Turn Gate 2 back
on to change this."; a `BAD_REQUEST` shows its message under the Save bar.
**Final Approvals copy**: Gate 1 — "Off: scripts that pass review (7+/10) go straight to video. A script
that still fails after 3 retries waits for you." Gate 2 — "Off: videos that pass review publish
automatically as Private."
**Flip, one commit each**: `gate2Visibility`, `channelEdit`, `channelDelete`, `channelSettings`,
`gateToggles`, `briefLength`, removing the loose casts they guard (e.g. `as typeof input` around
`privacyStatus` in `run/[id].tsx`, the `defaultPrivacyStatus` cast). `watermarkUpload` stays off (task 4 E8).
Picker copy (was task 3 R9): unconnected channels read "Not connected — connect to run".
**Verify** (dev server restarted onto `main`): set every Channel settings field, save, kill and reopen →
all values persist; Public is blocked while Gate 2 is off; delete a throwaway channel → gone from Channels
and the picker; New brief Length 45s → run's options show `targetDurationSec: 45`; Gate 2 shows the
visibility selector pre-set from the channel default.

### R2 — Run detail: long review notes and script
Board **"Run detail — Gate 1 with real-length text"** (Future Screens canvas, row 6 — under review; move to
the locked canvas once the founder approves, then build that version).
- **Script review** card: score + bar unchanged; notes `numberOfLines={3}` with a "Read full review" /
  "Show less" text button (13/800 accent) — only shown when the text is actually longer than 3 lines
  (`onTextLayout` line count).
- **Script** card: meta "~{sec} sec · {words} words" on the right of the title; text `numberOfLines={6}` with
  "Show full script" / "Show less".
- Same rule on Gate 2's video-review rationale (3 lines) and the "What went wrong" error body (3 lines).
- The Edit sheet keeps the full script (no clamp inside it).
**Verify**: the octopus run's Gate 1 fits on one screen with the action bar visible; both toggles expand and
collapse.

---

## Schema Impact / Business Logic
None.

## Shipping
JS-only → one `eas update --branch preview` for tasks 3 + 5 together (fingerprint = `main`).

## Report
Add a **"Task 5"** section to `reports/task3.md`: per item done / screenshot beside the locked board; flags
on at merge (expected: all except `watermarkUpload`). `STATUS.md`: this row → "Done" only with those
screenshots.

## Links
- `tasks/task3.md` (R8/R9 superseded by R1 here) · locked "Visual Directions" canvas rows 2–3 ·
  Future Screens canvas row 6 (R2 board)
