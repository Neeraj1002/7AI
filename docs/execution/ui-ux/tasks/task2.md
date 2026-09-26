# UI/UX Task 2: UI Enhancement 2 — Channel Settings + New Brief Options

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting**, plus
`docs/execution/ui-ux/UI_UX_AGENT_PROTOCOL.md` and `docs/execution/ui-ux/tasks/task1.md` (Enhancement 1
— this task builds directly on its theme, components and screens). The template governs the Git
Workflow, the Hard rules (never push/merge to `main`, only commit to a branch you created, record the
branch in `STATUS.md` the moment it exists) and this file's structure.

**Objective**: Turn the Channel detail screen into a full Channel settings screen, and add per-run
Options (voice, visuals, music, length) to New brief — per the founder-approved "7AI Studio — Future
Screens" canvas.
**Duration**: ~1.5–2 dev days
**Depends On**: **UI Enhancement 1 merged to `main`** (PR #26, branch `UIUX_ENH1_FE`) — this task uses
its `theme.ts`, shared components (`Screen`, `FormScreen`, `Card`, `BottomActionBar`, `BottomSheet`,
`ConfirmSheet`, `ChannelAvatar`), `feature-flags.ts` and `app/app/(app)/channel/[id].tsx`. Do not start
from `UIUX_ENH1_FE`; branch from `origin/main` after #26 merges. Backend items B5–B7 and B10 (handed to
the architect chat 2026-09-26) for flag-gated parts only — **nothing in this task blocks on them**;
the New brief voice/visuals/music options need **no** backend change.
**Owning Component**: `app/` only. No `studio/` changes.
**Role**: `FE` (JS-only, OTA-eligible — re-run the fingerprint check from task 1's Shipping section).
**Branch**: `UIUX_ENH2_FE` — one branch, one commit per `E#` item (`UIUX_ENH2_E<X>_FE: ...`), a closing
commit for report + `STATUS.md` (`UIUX_ENH2_REPORT_FE: ...`), one draft PR opened with the first push.
**Success Criteria**: a run created with a chosen voice / visual source / music mood actually uses them
(check the run's `video_generation` stage input); every Channel settings control either saves for real
or is hidden; nothing on either screen offers a choice the API can't honour.

---

## Design source of truth

Canvas **"7AI Studio — Future Screens"** (founder's design artifact), boards **"Channel settings
(full)"** and **"New brief — advanced options"**, direction C tokens from task 1's `theme.ts`.
**Deviations from the canvas, decided 2026-09-26 (implement these, not the canvas):**
- Channel settings: **remove "Default visuals"** (no per-channel field exists) and **hide "Posting
  rhythm"** (nothing reads `postingCadence`; scheduling is a later enhancement).
- Channel settings Approvals copy: the canvas's "Off = scripts scoring 8+ go straight to video" is a
  placeholder — use the wording the backend task for B7 defines (see E3).
- New brief: the visuals option is **"AI images"** (backend value `ai-stills`), not "AI visuals".
- New brief: **drop** the "Publish · next free slot" row (no scheduling yet), the voice **play/preview**
  button (no preview audio exists), the "From idea · Predicted 82" subtitle (no Ideas yet — keep task 1's
  "Last used" subtitle) and the "Estimated cost ~$0.25 · ready in ~1 min" line (no estimate exists).
- Music moods come from the backend list (below), not the canvas's "Curious · low volume".

---

## Items

### E1 — Pipeline options (new `app/lib/pipeline-options.ts`)
Typed option lists the app can render without a backend call, checked against the API's own input
types so a renamed/removed backend value fails `typecheck`:
```ts
import type { inferRouterInputs } from '@trpc/server';
import type { AppRouter } from '../../studio/src/api/router';
type CreateInput = inferRouterInputs<AppRouter>['runs']['create'];
type Voice = NonNullable<CreateInput['voice']>;
type VisualSource = NonNullable<CreateInput['visualSource']>;
type AudioLayer = NonNullable<CreateInput['audioLayer']>;

export const VOICES = [
  { value: 'alloy', label: 'Alloy' }, { value: 'ash', label: 'Ash' }, { value: 'ballad', label: 'Ballad' },
  { value: 'coral', label: 'Coral' }, { value: 'echo', label: 'Echo' }, { value: 'fable', label: 'Fable' },
  { value: 'onyx', label: 'Onyx' }, { value: 'nova', label: 'Nova' }, { value: 'sage', label: 'Sage' },
  { value: 'shimmer', label: 'Shimmer' }, { value: 'verse', label: 'Verse' }, { value: 'marin', label: 'Marin' },
  { value: 'cedar', label: 'Cedar' },
] as const satisfies readonly { value: Voice; label: string }[];
export const VISUAL_SOURCES = [
  { value: 'stock-footage', label: 'Stock footage' }, { value: 'ai-stills', label: 'AI images' },
] as const satisfies readonly { value: VisualSource; label: string }[];
export const MUSIC_MOODS = [
  { value: 'upbeat', label: 'Upbeat' }, { value: 'calm', label: 'Calm' }, { value: 'mysterious', label: 'Mysterious' },
  { value: 'inspirational', label: 'Inspirational' }, { value: 'tense', label: 'Tense' }, { value: 'none', label: 'No music' },
] as const satisfies readonly { value: AudioLayer; label: string }[];
export const LENGTHS = [30, 45, 60] as const; // used only when flags.briefLength (B10)
```
Values verified against `studio/src/media/registry.ts` (`TTS_VOICES`),
`agents/video-generation/plan.ts` (`VISUAL_SOURCES`) and `audio-bed/types.ts` (`MOOD_TAGS` + `'none'`) on
2026-09-26. If the backend later ships an options query (optional B9), switch to it then.
Also fix the stale comment in `app/lib/feature-flags.ts` (it points at the deleted
`ENH1_BACKEND_REQUIREMENTS.md` — say "backend items B1–B3, owned by the architect chat" instead) and add
the new flags from E4.
**Verify**: temporarily misspell one `value` → `npm run typecheck` fails.

### E2 — New brief: Options section (canvas: "New brief — advanced options")
In `app/app/(app)/new-brief.tsx`, below the brief input and above "Create run", add an **Options**
header (15/800) with the right-aligned meta "Channel defaults unless changed", then:
- **Length** (only when `flags.briefLength`, B10): segmented control `30s | 45s | 60s | Auto`, default
  Auto. Auto = field omitted.
- **Visuals**: segmented control `Auto | Stock footage | AI images`, default Auto (= omitted, the
  planner decides as today).
- **Voice**: a row (mic icon, "Voice" caption, value) → `BottomSheet` with a radio list: first row
  "Channel default ({channel default label or 'Alloy'})" then `VOICES`. Default = channel default
  (= field omitted). No preview button.
- **Background music**: a row (music icon, "Background music", value) → `BottomSheet` radio list:
  "Auto (let the pipeline pick)" then `MUSIC_MOODS`. Default Auto (= omitted).
Rows use task 1's row pattern (radius 14, 1.5px `#CFCFCF` border, chevron-right). `runs.create` sends
`voice` / `visualSource` / `audioLayer` **only when the user picked a non-default value** (so channel
defaults and the planner keep working), plus `targetDurationSec` only when `flags.briefLength` and a length
is picked. Options reset when the channel changes (voice default depends on channel).
The whole screen stays inside `FormScreen` (task 1/E8) — the brief input must stay above the keyboard.
**Verify**: create one run with defaults and one with Onyx + AI images + Calm; in Run detail's "Details"
disclosure (or the DB) the second run's creation options show exactly those three values and the first
shows none.

### E3 — Channel settings (canvas: "Channel settings (full)")
Extend `app/app/(app)/channel/[id].tsx` (task 1's Channel detail) into the full settings screen. Keep its
header block (avatar + name + runs/published/spend meta). Sections are `Card`s in this order; each field
is shown only when its flag is on — a section with no visible fields is hidden entirely:
1. **Identity** — Name, Niche (existing, `flags.channelEdit` / B2); **Style guide** multiline
   (placeholder "Tone, words to avoid, how hooks should sound, audience…", max height with scroll)
   `flags.channelSettings` / B5.
2. **Voice & look** — **Default voice** row → same voice `BottomSheet` as E2 (without the "Channel
   default" row); **Captions** switch (default on); **Watermark** row: "Upload logo" (dashed button) or,
   when set, a 40×40 thumbnail + "Replace" + "Remove" — `flags.channelSettings` for voice + captions,
   `flags.watermarkUpload` / B6 for watermark. Upload uses `expo-image-picker` **only if it's already
   installed and doesn't change the fingerprint**; otherwise leave the watermark row hidden and note it in
   the report (it becomes part of the next native build).
3. **Publishing** — **Default visibility** segmented Private | Unlisted | Public (task 1's B1 field,
   `flags.gate2Visibility && flags.channelEdit`); **YouTube** connection status + Connect/Disconnect
   (existing, unchanged). No posting-rhythm row.
4. **Approvals** — two switches, "Gate 1 · approve scripts" and "Gate 2 · approve videos", each with a
   one-line sub-caption taken verbatim from the B7 backend task's agreed behaviour. `flags.gateToggles`
   / B7. If B7 restricts Gate 2 off to Private-only channels, disable the Gate 2 switch with a caption
   explaining why when visibility isn't Private.
5. **Budget** — "Spend limit" numeric input (`$` prefix, blank = "auto"), caption "Default: equal share of
   the {pool} pool" when a pool ceiling is known, else "Default: equal share of the pool"; under it an 8px
   bar + "$x used of $y this period" from `dashboard.cost({ channelId })` (`totalSpendUsd` vs the
   override, or omit the bar when no override and no per-channel ceiling is returned). Validation: blank
   or a number > 0 with ≤ 2 decimals. `flags.channelSettings` / B5.
6. **Delete channel** — unchanged from task 1 (`flags.channelDelete`).
**Save**: one `BottomActionBar` "Save changes", disabled until something changed; sends **only the
changed fields** in a single `channels.update` call; on success toast "Saved" + invalidate
`channels.list` and this channel's query; on error keep edits and show the message under the bar.
Leaving with unsaved changes → `ConfirmSheet` "Discard changes?".
Typing: use the real `AppRouter` types for `channels.update`. The loosely typed client from task 1 may
stay only for procedures whose backend item hasn't merged when you build, and must be removed in the same
commit that flips that flag (per `feature-flags.ts`).
**Verify**: with all flags on against a backend that has B2+B5: change style guide + captions off +
spend limit $1.00, save, kill the app, reopen → values persisted; create a run on that channel →
captions absent in the rendered video.

### E4 — Feature flags
Add to `app/lib/feature-flags.ts` (all `false`):
`channelSettings` (B5 — extended `channels.update`), `watermarkUpload` (B6), `gateToggles` (B7),
`briefLength` (B10). Each gets a one-line comment naming its backend item. Flip each in a one-line
follow-up once the item merges — never before.

---

## Schema Impact
No schema changes (FE only). Backend items B5, B6, B7, B10 were handed to the architect chat
(2026-09-26) and are not part of this branch.

## Business Logic / State Transition
No new control flow in the app. Gate on/off behaviour (B7) is defined entirely by the backend task; the
app only displays and toggles the stored flag.

## Shipping
JS-only → `eas update --branch preview` if the fingerprint still matches `main`. Only risk: a native
image picker for watermark upload — if it changes the fingerprint, drop it from this branch (E3 says how).

## Testing
```bash
cd app && npm run typecheck && npm run lint
npx expo-updates fingerprint:generate   # compare with main
```
Plus every item's Verify on the founder's OnePlus (keyboard must not cover the style-guide field or the
Save bar), with before/after screenshots in the report.

## Report
`docs/execution/ui-ux/reports/task2.md` — per item: done / deviations / screenshot; which flags are on at
merge time; fingerprint result.

## Links & References
- Canvas: "7AI Studio — Future Screens" (boards "Channel settings (full)", "New brief — advanced options")
- `docs/execution/ui-ux/tasks/task1.md` (Enhancement 1 — components, flags, Channel detail)
- Backend B5 (extended `channels.update`), B6 (watermark upload), B7 (gate switches), B10 (target
  length) — owned by the architect chat; link their task docs here once written. Optional B9 (options
  query) — not required by this task.
