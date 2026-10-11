# UI/UX Task 1: UI Enhancement 1 — Visual Foundation + Core Screen Redesign

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting**, plus
`docs/execution/ui-ux/UI_UX_AGENT_PROTOCOL.md`. They define the Git Workflow, the Hard rules (never
push/merge to `main`, only commit to a branch you created, record the branch in `STATUS.md` the moment
it exists) and the section structure this file follows. This file states only this task's specifics.

**Objective**: Replace the app's default-scaffold look with one locked visual system and a proper
navigation shell, and apply it to every screen — per the founder-approved design canvas.
**Duration**: ~3–4 dev days (E0–E2 ~1 day, E3–E8 ~2–3 days)
**Founder decisions (2026-09-26)**: direction C locked; Gate 2 visibility defaults per channel; deleting
a channel cancels its in-progress runs (logged "Channel deleted") and removes its YouTube connection; no
restore UI.
**Depends On**: Bugs Task 3 (merged — this file was written against the checkout that already contains
its R1/R2/R4/R5 code). Backend items B1–B3 (handed to the architect chat 2026-09-26 — B1 Gate 2 visibility +
per-channel default, B2 `channels.update`, B3 `channels.archive`) for three feature-flagged parts only — **nothing in this task blocks on them**.
**Owning Component**: `app/` only (Expo/React Native). No `studio/` changes.
**Role**: `FE` (JS-only, OTA-eligible — see "Shipping" below for the one check that could flip it).
**Branch**: `UIUX_ENH1_FE` — one branch for the whole enhancement (founder direction 2026-09-26: one
branch per UI enhancement unless it's too large). One commit per `E#` item
(`UIUX_ENH1_E<X>_FE: ...`), one closing commit for the report + `STATUS.md` (`UIUX_ENH1_REPORT_FE: ...`),
one draft PR opened with the first push, marked ready when every item is done.
**Success Criteria**: every screen listed below matches the design canvas on a real Android 16 device
(OnePlus Nord CE4 Lite, the founder's test phone), including with the keyboard open; no raw internal
strings (`paused_gate1`, `[stale-resume-skip] …`, stage enum names, `$0.0000`) are visible anywhere;
backend-dependent controls are hidden behind flags and never offer an action the API can't perform.

---

## Design source of truth

**Canvas**: the "7AI Studio — Visual Directions" design artifact (claude.ai, private to the founder — ask
the founder for the link/screenshots if you can't open it). **Locked direction: C · "Bold red"** — every
row-2 screen on the canvas was switched to C by the founder before lock. The Queue board on row 1 still
shows A by default; implement the Queue in **C** too (it's identical to the "C · Bold red — Queue" board).

Screens on the canvas this task implements (canvas board name → app file):

| Canvas board | App route/file |
|---|---|
| C · Bold red — Queue | `app/app/(app)/index.tsx` |
| Run detail — Gate 1 | `app/app/(app)/run/[id].tsx` (status `paused_gate1`) |
| Run detail — Gate 2 | `app/app/(app)/run/[id].tsx` (status `paused_gate2`) |
| New brief | `app/app/(app)/new-brief.tsx` |
| Channel picker — 7 channels | new `app/components/ChannelPickerSheet.tsx` |
| Dashboard | `app/app/(app)/dashboard.tsx` |
| Channels + account | `app/app/(app)/channels.tsx` |
| Channel detail — view & edit | new `app/app/(app)/channel/[id].tsx` |
| Delete channel — confirm | new `app/components/ConfirmSheet.tsx` (generic) |
| Sign in | `app/app/login.tsx` |

Not on the canvas, restyle only (same tokens/components, no layout change of behavior):
`notifications.tsx` (becomes the **Inbox** tab), `verify.tsx`, the post-hoc tag form in `run/[id].tsx`.

---

## Design tokens (direction C) — `app/lib/theme.ts` (new)

Every color/size in the app must come from here. No hex literals in screen files after this task.

```ts
export const color = {
  bg: '#FFFFFF',          // screen background
  surface: '#FFFFFF',     // cards
  surface2: '#F1F1F1',    // secondary buttons, segmented-control track, icon-button fill
  border: '#E4E4E4',      // hairlines, tab bar top border, bottom-bar top border
  ink: '#0F0F0F',         // primary text, card outline (see card.border)
  muted: '#595959',       // secondary text (4.5:1+ on white)
  accent: '#C8261F',      // primary buttons, active tab, FAB, badges
  onAccent: '#FFFFFF',
  accentSoft: '#FDEBEA',  // "waiting on you" chips, active-tab pill, selected rows
  accentText: '#A81E18',  // text on accentSoft, links
  warnBg: '#FFF2CC', warnText: '#784A00',   // needs attention / not connected / public-visibility hint
  okBg: '#E2F5E8',   okText: '#146C3A',     // passed / connected / score bar
  failBg: '#0F0F0F', failText: '#FFFFFF',   // FAILED status chip — deliberately black, NOT red (red = accent)
  danger: '#A81E18',      // Reject / Delete / Sign out text + icons
  dangerBorder: '#A81E18',
  inputBorder: '#0F0F0F',
  ring: '#0F0F0F',        // unselected radio ring
  future: '#CFCFCF',      // not-yet-reached stepper dots
  scrim: 'rgba(10,10,14,0.5)',
};
export const card = { borderWidth: 1.5, borderColor: color.ink, borderRadius: 16, backgroundColor: color.surface }; // no shadow in C
export const radius = { sm: 10, md: 12, lg: 14, xl: 16, sheet: 24, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 };
export const font = { regular: 'Archivo_400Regular', semibold: 'Archivo_600SemiBold', bold: 'Archivo_700Bold', black: 'Archivo_800ExtraBold' };
export const type = {
  screenTitle: { fontFamily: font.black, fontSize: 30, letterSpacing: -0.6 },   // tab-root screens
  stackTitle:  { fontFamily: font.black, fontSize: 20 },                         // pushed screens
  sectionTitle:{ fontFamily: font.bold, fontSize: 15 },
  body:        { fontFamily: font.regular, fontSize: 15, lineHeight: 21 },
  bodyStrong:  { fontFamily: font.semibold, fontSize: 15, lineHeight: 21 },
  meta:        { fontFamily: font.regular, fontSize: 13, color: '#595959' },
  chip:        { fontFamily: font.bold, fontSize: 12 },
  button:      { fontFamily: font.black, fontSize: 16 },
  stat:        { fontFamily: font.black, fontSize: 30 },
};
// Fixed per-channel identity colors, index = channel's position in channels.list (createdAt asc).
export const channelColors = [
  ['#FDEBEA','#A81E18'], ['#0F0F0F','#FFFFFF'], ['#E2F5E8','#146C3A'], ['#FFF2CC','#784A00'],
  ['#E7EEF9','#1D4F91'], ['#F1F1F1','#0F0F0F'], ['#FCE3EC','#8E1B4B'],
] as const; // [background, foreground] of the avatar tile; the small dot uses the foreground
```

**Font**: Archivo via `@expo-google-fonts/archivo` (weights 400/600/700/800), loaded with `useFonts` in
`app/app/_layout.tsx`, keeping the splash screen up (`expo-splash-screen` `preventAutoHideAsync`) until
fonts resolve. **Icons**: `@expo/vector-icons` → `Feather` set only (matches the canvas's stroke icons):
`list` (Queue), `bell` (Inbox), `bar-chart-2` (Dashboard), `tv` (Channels), `plus`, `chevron-right`,
`chevron-left`, `chevron-down`, `check`, `x`, `edit-2`, `rotate-cw` (Revise), `arrow-up` (approve &
publish), `alert-triangle`, `trash-2`, `log-out`, `server`, `play`. **The 🐞 emoji is replaced** by an
icon button (Feather has no bug glyph — use `MaterialCommunityIcons` `bug-outline`, the one exception).

---

## Shared components (new, `app/components/`)

- **`Screen`** — `SafeAreaView` (react-native-safe-area-context) + `color.bg`; props `title`, `subtitle?`,
  `variant: 'tabRoot' | 'stack'`, `right?`. Tab-root header = big `screenTitle` left, `subtitle` meta line
  under it, bug `IconButton` right (canvas Queue/Dashboard/Channels). Stack header = back chevron (44×44),
  `stackTitle`, optional 12px meta subtitle, bug button right (canvas Run/New brief/Channel).
  **Replaces the native Stack headers** — set `headerShown: false` everywhere inside `(app)`.
- **`FormScreen`** — `Screen` + keyboard handling; see **E8**. Every screen with a `TextInput` uses it.
- **`Card`** — `card` tokens, padding 16, `gap` 8–12.
- **`StatusChip`** — `kind: 'waiting' | 'attention' | 'failed' | 'ok' | 'neutral'` → (accentSoft/accentText,
  warnBg/warnText, failBg/failText, okBg/okText, surface2/ink); pill, `type.chip`, optional leading icon.
- **`PrimaryButton` / `SecondaryButton` / `DangerTextButton`** — height 54 (primary) / 46 (secondary),
  radius 14, centered row `[icon][label]` with `gap: 8` and **`flexShrink: 1` + `numberOfLines={1}` on the
  label** (this is the fix for the "arrow stuck to the left" issue the founder caught on Gate 2).
- **`IconButton`** — 44×44 circle, `surface2` fill, `muted` icon; requires `accessibilityLabel`.
- **`BottomActionBar`** — absolutely positioned, `bg` + top `border`, padding `12 16 (20 + insets.bottom)`;
  screens using it add matching `paddingBottom` to their scroll content so nothing hides under it.
- **`BottomSheet`** — RN `Modal` (`transparent`, `animationType="slide"`), `scrim` backdrop (tap to close),
  top-rounded 24 sheet, 40×4 grab handle, `onRequestClose` for Android back. Used by ChannelPickerSheet,
  ConfirmSheet, and the Gate Reject/Edit/Revise text entry (E4).
- **`ConfirmSheet`** — BottomSheet with icon tile, title, body, optional warning line, destructive or
  primary confirm button + Cancel. Canvas "Delete channel — confirm" is the reference.
- **`ChannelAvatar`** — rounded-square tile (40/44/60 px), number = channel's 1-based position,
  colors from `channelColors[index]`.
- **`Stepper`** — 7 steps: `Brief, Script, Review, Gate 1, Video, Gate 2, Publish`, mapped from stage
  names (`intake`→Brief, `script_generation`→Script, `script_review`→Review, `gate1`→Gate 1,
  `video_generation`+`video_review`→Video, `gate2`→Gate 2, `publishing`→Publish; `analytics` not shown).
  Done = filled accent + white check; current = accentSoft fill + 3px accent ring; future = 2px `future`
  ring. Current step = the run's `currentStage` (or Gate 1/Gate 2 when paused there).

## Shared logic (new, `app/lib/`)

- **`run-labels.ts`** — the only place raw run/stage values become words:
  - `statusLabel(status)`: `paused_gate1`→"Waiting on you · Gate 1 script review", `paused_gate2`→"Waiting
    on you · Gate 2 video review", `needs_attention`→"Needs attention", `running`→"In progress",
    `pending`→"Starting", `completed`→"Published", `failed`→"Failed". Chip kind per status.
  - `queueChip(status)`: `paused_gate1`→"Gate 1 · Script", `paused_gate2`→"Gate 2 · Video".
  - `humanizeRunError(lastError)` → short reason. Covers every `lastError` shape written by
    `studio/src/run-pipeline/state-machine.ts` / `resume-on-startup.ts` today (checked 2026-09-26), in
    this order:
    - starts with `[stale-resume-skip]` → "Stalled — no progress 30+ min"
    - starts with `Video Intelligence regen cap` → "Video retry limit reached"
    - starts with `Gate 2 regen cap` → "Revision limit reached"
    - starts with `Rejected at Gate 1` → "Rejected at Gate 1"; `Rejected at Gate 2` → "Rejected at Gate 2"
    - contains `budget ceiling` → "Budget ceiling reached"
    - starts with `Channel deleted` (written by B3 when a channel is deleted mid-run) → "Channel deleted"
    - otherwise → first sentence of `lastError`, max 60 chars, leading `[tag]` stripped.
    Put the patterns in one ordered table so a new backend message is a one-line addition.
    The **full raw `lastError`** stays visible on Run detail under a "Details" disclosure (for debugging).
  - `relativeTime(date)`: "just now", "12m ago", "3h ago", "5d ago", then `26 Sep`.
- **`channel-context.tsx`** (modify) — add `channelIndex(id)` + `channelById(id)` helpers (used for
  avatar colors and the Queue's channel names), and **persist `selectedChannelId`** via
  `lib/storage.ts` (`sevenai.lastChannelId`) so New Brief can say "Last used".
- **`feature-flags.ts`** (new) — `export const flags = { gate2Visibility: false, channelEdit: false,
  channelDelete: false }`. Each flag flips to `true` in a one-line follow-up once its backend item
  (B1/B2/B3) is merged. While `false`, the related UI is **hidden, not disabled** (see items below).

---

## Items

### E0 — Foundation: theme, fonts, icons, shared components
Create `lib/theme.ts`, `lib/run-labels.ts`, `lib/feature-flags.ts` and the shared components above. Load
Archivo in `app/_layout.tsx`. Set `StatusBar style="dark"`. No screen changes yet besides compiling.
**Verify**: app boots on device with Archivo visible on the sign-in title; typecheck/lint pass.

### E1 — Navigation shell: bottom tabs
Restructure `app/app/(app)/` into a tabs group + stack screens:
```
app/app/(app)/_layout.tsx        → Stack (headerShown:false): (tabs), run/[id], new-brief, channel/[id]
app/app/(app)/(tabs)/_layout.tsx → Tabs: index (Queue), notifications (Inbox), dashboard, channels
```
Move `index.tsx`, `notifications.tsx`, `dashboard.tsx`, `channels.tsx` into `(tabs)/` (URLs stay the
same — route groups don't appear in paths, so `/run/<id>` deep links and `ReportBugButton`'s pathname
regex keep working; re-check both). Tab bar per canvas: height 76 + safe-area inset, `bg`, top `border`;
each tab = icon inside a 60×32 pill (active: `accentSoft` fill, `accentText` icon+label, bold) + 12px
label. Queue tab shows a count badge (accent circle, white 11px) = number of runs in
`paused_gate1`+`paused_gate2`; Inbox tab badge = unresolved notifications (move the count from the old
Queue top row). `ChannelProvider` stays above both layouts.
**Remove**: the Queue's top text row (Sign out / Notifications / Channels / View Dashboard →) entirely,
and `HeaderRight`/`ChannelSwitcher` from `(app)/_layout.tsx` (`ChannelSwitcher.tsx` is deleted — its job
moves to ChannelPickerSheet on Dashboard).
**Verify**: all four tabs reachable; back from Run detail returns to the tab you came from; tapping a push
notification still deep-links to `/run/<id>` or `/notifications`.

### E2 — Queue (canvas: "C · Bold red — Queue")
`Screen variant="tabRoot" title="Queue"` with subtitle `"{n} waiting on you · {m} need attention"`.
Two sections from the same `runs.list` query (statuses unchanged), each with a header + count pill:
**"Waiting on you"** (`paused_gate1`, `paused_gate2`; count pill accent) and **"Needs attention"**
(`needs_attention`; count pill warn). Hide a section when empty; if both are empty show the empty state
"Nothing needs you right now." + secondary "New brief" button.
Row = pressable `Card` → `/run/{id}`:
- top line: waiting → `StatusChip waiting` with `queueChip()`; attention → `alert-triangle` +
  `humanizeRunError(lastError)` in `warnText` bold 13; right side `relativeTime(updatedAt)`
- brief text `bodyStrong`, `numberOfLines={2}`
- meta line: channel dot (`channelColors[i][1]`) + channel name (from `channelById(run.channelId)`;
  unknown/deleted channel → "Deleted channel") + for Gate 1 "· Scored {score}/10" **only if** the list
  payload has it (it doesn't today — omit, don't fetch per-row)
- `chevron-right` at the far right.
FAB "New brief" (`plus` + label), accent pill, `right:16`, sits **above** the tab bar; list
`contentContainerStyle.paddingBottom` = FAB height + 32 so the last card is never covered (fixes the
overlap seen in the founder's screenshot). Keep pull-to-refresh.
**Verify**: with 5+ runs the last card scrolls fully clear of the FAB; the three real `lastError`
strings from the founder's DB render as the short reasons above.

### E3 — Run detail (canvas: "Run detail — Gate 1" / "Gate 2")
`Screen variant="stack" title="Run"` + subtitle `"{channel name} · started {relativeTime(createdAt)}"`.
Scroll content, top to bottom: `StatusChip` with `statusLabel()` → Brief (12px muted "Brief" label +
17px semibold text) → `Stepper` card → gate-specific cards → "Details" disclosure (raw `lastError`, raw
stage history list `stageName · attempt n · status`, for debugging) → post-hoc tag card (terminal runs
only, restyled).
**Gate 1** (`paused_gate1`): "Script review" card — score big (`8` + `/10` muted), 8px bar filled to
score×10% in `okText` (<7 → `warnText`), review notes; "Script" card — `~{n} sec · {beats} beats` only if
available in stage output (else omit), script text `body`. `BottomActionBar`: `[x Reject]` danger text ·
`[edit-2 Edit]` secondary · `[check Approve script]` primary (flex 1).
**Gate 2** (`paused_gate2`): one card with the portrait `VideoView` (118×210, radius 10, left) and, on
the right, "Video review" title + `StatusChip ok "Passed"`/`failed "Failed"` from `video_review` verdict +
rationale + "Regenerations used: {n} of 2" (n = count of `video_generation` attempts − 1; omit if not
derivable). `BottomActionBar` (column): **visibility block** (only when `flags.gate2Visibility`) — label
"YouTube visibility", segmented control Private | Unlisted | Public, **pre-selected to the run's channel
default** (`channel.defaultPrivacyStatus`, founder decision 2026-09-26: each channel has its own default;
B1 adds the field), changeable per run; hint line (Public hint in `warnText`); row `[x Reject] [rotate-cw Revise]` (secondary, equal width); full-width primary
`[arrow-up] {label}` where label = "Approve & upload as private|unlisted" / "Approve & publish publicly"
(flag off → always "Approve & upload as private"). **Public** approve opens a `ConfirmSheet`
("Publish publicly?" / "It goes live on the channel for everyone as soon as it uploads.") before firing.
**Reject / Edit / Revise** open a `BottomSheet` (inside `FormScreen` behaviour) with the existing
GateActionBar semantics — Reject: "Reason for rejection" (required); Gate 1 Edit: "Edited script text"
prefilled with the current script; Gate 2 Revise: "Revision notes". Cancel/Submit. `GateActionBar.tsx`
is refactored into these sheets (Notifications/Inbox uses the same sheets).
Mutation wiring unchanged (`runs.gate1`/`runs.gate2`), except Gate 2 approve passes
`privacyStatus` **only when `flags.gate2Visibility` is true** (needs B1).
**Verify**: Gate 2 primary button label never wraps and the arrow is centered on a 360dp-wide screen;
Public approve asks for confirmation; Reject sheet stays above the keyboard.

### E4 — New brief + Channel picker (canvas: "New brief", "Channel picker — 7 channels")
`FormScreen variant="stack" title="New brief"`. Replace the chip row with one **channel field**: bordered
row (radius 14) = `ChannelAvatar 40` + channel name + meta "Last used · tap to change" (only if it came
from the persisted last channel) + `chevron-down`. Tap → `ChannelPickerSheet`:
- title "Run this brief on…", **no edit/manage link** (founder direction — editing belongs on the Channel
  detail screen)
- one row per channel: avatar 40, name, status line ("YouTube connected" `okText` / "Not connected —
  can't publish yet" `warnText`), radio on the right (selected: accent fill + white check; row
  `accentSoft` background). Rows are radio buttons (`accessibilityRole="radio"`, `accessibilityState`).
- tapping a row **only selects**; the primary button **"Use {channel name}"** (label follows selection)
  confirms, closes the sheet and sets the field. Sheet dismissed without confirming = no change.
Below: label "What's the short about?", multiline input (min height 168, radius 14, 2px accent border
when focused / `inputBorder` otherwise), placeholder `Topic, angle and length — e.g. "30 sec on why
octopuses have three hearts"`, tip line in `meta`. Primary "Create run" pinned under the input (not a
bottom bar). Empty-channels state keeps Bugs Task 1/R4's "Set up a channel →" link (now → Channels tab).
**Verify**: picking a channel then backing out keeps the old one; 7 channels fit in the sheet without
scrolling on the test phone; keyboard never covers "Create run" (E8).

### E5 — Dashboard (canvas: "Dashboard")
`Screen variant="tabRoot" title="Dashboard"`. Under the title, a channel pill button (dot + name +
`chevron-down`) → `ChannelPickerSheet` in **filter mode**: adds an **"All channels"** row on top, and
selection applies immediately (no "Use" button). All four `dashboard.*` queries pass the chosen
`channelId` (or none for All). **No "Sample data" chip** — that was mock-only.
Layout: 2-col grid of stat cards — "Success rate" (`stat` value + "`{completed} of {total}` runs
finished"), "Video regen rate" (value + "`{n} of {m}` needed a redo"); full-width "Spend this period"
card — value `$x.xx` + "of $y.yy" muted + 8px bar (accent, width = spend/ceiling) + right meta "$z per
published video"; "Script review scores" card — simple bar chart (keep `react-native-gifted-charts`,
restyled: bars ≥7 accent, <7 `#F6C3C0`, axis text `muted` 11); "Gate 1 decisions" card — one 12px
stacked bar (approve accent / edit `#F2A19D` / reject ink) + legend "Approved n · Edited n · Rejected
n"; keep Content performance (restyled) at the end.
**Empty/error states (required)**: money always `$0.00` format (2 decimals; 4 only when 0 < x < 0.01);
a rate with no denominator shows "—" with sub "No runs yet" (never "0 of 0"); when the selected channel
has zero runs show **one** card "No runs on this channel yet" + "New brief" button instead of the grid;
when every query fails with the same network error show **one** banner "Can't reach the server at
{apiUrl}" + Retry (never raw Java exception text). Remove "(Week 4 Task 3)" from copy.
**Verify**: a brand-new channel shows the single empty card; airplane mode shows the single banner.

### E6 — Channels, Channel detail, Delete (canvas: "Channels + account", "Channel detail — view & edit", "Delete channel — confirm")
**Channels tab** (`Screen tabRoot`, title "Channels", subtitle "{n} of 7 channels used"; no second
in-page heading). One `Card` per channel: top row is a **pressable link to `/channel/{id}`** — avatar 44,
name, niche (2 lines), `chevron-right`; bottom row: connection `StatusChip` ("YouTube connected" ok /
"YouTube not connected" attention) + **Connect** (accent, `play` icon) when not connected. **No delete
button on the card** (moved to detail). Then a dashed "+ Add channel" button that opens the existing
create form in a `BottomSheet` (`FormScreen`, fields Name + Niche description + create; keeps
`ChannelCapExceededError` message); disabled with "7 of 7 used" when at the cap. Then **"Account"**
section card: "Signed in as {email}" row, "Server {host:port}" row, and **Sign out** row (`log-out`,
danger) → `ConfirmSheet` ("Sign out?") → existing `signOut()` + `router.replace('/login')`. `lib/auth.tsx`
only stores `userId`/`tenantId`/`role` today, not the email — so either save the email the user typed on
the Sign-in screen into SecureStore at successful verify (`sevenai.email`, FE-only, preferred) or omit the
"Signed in as" row. Don't add a backend call for it (optional B4 covers a proper `me` query later).
**Channel detail** (new `app/app/(app)/channel/[id].tsx`, `FormScreen stack title="Channel"`): header
block = avatar 60 + name (22 black) + meta "{runs} runs · {published} published · ${spend} spent" — all
from existing endpoints with `channelId`, no new endpoint: runs = `dashboard.operational.stageFunnel`
count for stage `intake`, published = `dashboard.cost.costPerPublishedVideo.publishedCount`, spend =
`dashboard.cost.totalSpendUsd`; omit any value that's missing; **Details** card (Name input, Niche description multiline, helper "Scripts for new runs use
this. Runs already in progress keep the old version.") — **editable only when `flags.channelEdit`**,
otherwise rendered as read-only text and no Save bar; **YouTube** card (status + Connect/Disconnect using
the existing `channels.getYoutubeConnectUrl`/`disconnectYoutube` flow, moved here from the list);
**Delete channel** row (danger outline, `trash-2`) — **only when `flags.channelDelete`** → `ConfirmSheet`
(copy from the canvas: "Delete "{name}"?" / "It's removed from your channel list, New Brief and the
Dashboard picker. Its past runs, videos and spend history are kept." + warning line in `warnText` on
`warnBg`: "Runs still in progress on this channel will be cancelled, and its YouTube connection will be
removed." — founder decisions 2026-09-26; there is **no restore** in this enhancement) → on success `router.replace('/channels')` + invalidate `channels.list`.
**Default YouTube visibility** row inside the Details card — segmented Private | Unlisted | Public, saved
with the other fields (only when `flags.channelEdit` **and** `flags.gate2Visibility`, since it needs B1's
column and B2's update). `BottomActionBar` "Save changes" (only with `flags.channelEdit`, disabled until a
field changes).
**Verify**: tapping a card opens its detail; Connect still round-trips through Google; with flags off,
no edit/delete controls are visible anywhere.

### E7 — Sign in (canvas: "Sign in")
`FormScreen` without header chrome: brand tile (56×56, radius 16, accent, white "7" in `font.black` 30),
"7AI Studio" (32 black), subtitle "Sign in to review and ship your Shorts.". **Server row**: bordered
row (`server` icon, "Server" label, current URL, "Change" link) — tapping "Change" reveals the existing
API-URL input + LAN-IP hint inline; if no URL is stored yet the input is shown expanded by default.
**Segmented tabs**: "1 · Get a token" | "2 · Enter token" (default 1; auto-switch to 2 after a
successful request). Tab 1 = Email input (`keyboardType="email-address"`, **client-side format check**
before sending — invalid → inline error under the field, no request) + "Telegram chat ID (optional)"
input (`keyboardType="number-pad"`, keeps Bugs Task 3/R5's SecureStore prefill/save exactly as built) +
helper "Send /start to {bot} on Telegram — it replies with your ID. Needed once; this phone remembers
it." + primary "Send my token"; success message in `okText` under the button. Tab 2 = paste input +
primary "Verify & sign in". **Each tab has its own error line directly under its own button** (split the
shared `error` state). Bot name: read from `process.env.EXPO_PUBLIC_TELEGRAM_BOT_NAME`; if unset, say
"the 7AI Telegram bot".
**Verify**: an invalid email never shows the green "link was sent" message; a Verify failure shows
under Verify, not under Request.

### E8 — Keyboard handling for every input (builds on Bugs Task 3/R4)
Bugs Task 3/R4 added `KeyboardAvoidingView` to login/new-brief/channels but kept
`behavior={Platform.OS === 'ios' ? 'padding' : undefined}` — **on Android that is a no-op**, and the
founder's Android 16 screenshots show the window does not resize for the keyboard (edge-to-edge is
mandatory on Android 15+/SDK 57): the keyboard simply covers the lower ~38% of the screen. `FormScreen`
fixes this once, for every screen:
- `KeyboardAvoidingView behavior="padding"` on **both** platforms, `keyboardVerticalOffset` = header
  height (0 for screens using our own `Screen` header, since the native header is gone after E1)
- inner `ScrollView` with `keyboardShouldPersistTaps="handled"` (so a button tap while the keyboard is up
  fires on the **first** tap instead of just dismissing the keyboard) and
  `keyboardDismissMode="interactive"`
- `BottomActionBar` and `BottomSheet` content sit inside the avoiding view so they rise with the keyboard
- every multiline input that can grow gets `scrollEnabled` + max height so the primary button stays
  reachable.
**Fallback (only if the padding approach fails the Verify below on the real phone)**: switch `FormScreen`
to `react-native-keyboard-controller` (`KeyboardAwareScrollView` + `KeyboardProvider`). That is a native
dependency → it changes the runtime fingerprint → needs a fresh `eas build` (role becomes `APP`, bundle
with the next native build per `docs/execution/bugs/STATUS.md`). Do not add it pre-emptively.
**Verify** (real OnePlus, Android 16): focus every input on Sign in (both tabs), New brief, Channels
create sheet, Channel detail, Gate Reject/Edit/Revise sheets, Inbox gate sheets — the field, its label
and its submit button are all visible above the keyboard, and one tap on the submit button submits.

---

## Schema Impact
No schema changes (FE only). Backend items B1–B3 were handed to the architect chat
(2026-09-26) and are **not** part of this branch; flip each flag once its backend task merges.

## Business Logic / State Transition
No new control flow. Gate semantics unchanged; Gate 2 approve gains an optional `privacyStatus` only
behind `flags.gate2Visibility` (backend already supports the privacy choice end-to-end — see B1).

## Shipping
All items are JS/asset-only → `eas update --branch preview`, **provided the runtime fingerprint doesn't
change**. Adding `@expo-google-fonts/archivo` (JS + .ttf assets) and using `@expo/vector-icons`,
`expo-font`, `expo-splash-screen` and expo-router `Tabs` should not change it, because those native
modules ship with the `expo`/`expo-router` packages already installed — **confirm before shipping**:
run `npx expo-updates fingerprint:generate` (or `eas fingerprint:compare`) on `main` vs this branch. If
it differs, or `npm ls @react-navigation/bottom-tabs expo-font @expo/vector-icons expo-splash-screen`
shows any of them missing and needing a fresh install, this enhancement ships in the next `eas build`
instead (role `APP`) — record that in `STATUS.md` and the report.

## Testing
```bash
cd app && npm run typecheck && npm run lint
npx expo-updates fingerprint:generate   # compare with main — see Shipping
```
Then the per-item **Verify** steps on the real device. Include before/after screenshots of every screen
in the report (the founder will compare them to the canvas).

## Report
`docs/execution/ui-ux/reports/task1.md` — per item: done / deviations (with reason) / screenshot. State
plainly whether the fingerprint changed and how it shipped.

## Links & References
- Canvas: "7AI Studio — Visual Directions" (founder's design artifact, direction C)
- Backend B1 (Gate 2 visibility + per-channel default), B2 (edit channel), B3 (soft-delete channel) —
  owned by the architect chat; their task docs will be linked here once written
- `docs/execution/bugs/Sprint3/tasks/task3.md` — R2 (bug report), R4 (keyboard), R5 (Telegram field) this builds on
- `docs/execution/ui-ux/UI_UX_AGENT_PROTOCOL.md`, `docs/execution/templates/TASK_TEMPLATE.md`
