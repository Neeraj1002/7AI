# Sprint 4 Frontend Task 3 (NEXT 2): Formats Per Channel

**Written**: 2026-10-11 by the architect chat, from the UI designer's hand-off of the same day. **Status**: not started. Picked up by the UI/UX code agent from this folder.

**Read `docs/execution/templates/TASK_TEMPLATE.md`, `UI_UX_AGENT_PROTOCOL.md` and the Definition of Done first, then the "Design source (read-only)" and "Shared rules" sections of `frontend-task2.md`; they apply here unchanged.** Hard rules apply (never push or merge to `main`, one worktree per session, record the branch in `docs/execution/sprint4/STATUS.md` when created).

**Objective**: each channel lists the content formats it uses (any mix of Shorts and Video formats). The Content profile gets a Formats section, Channel settings shows it, and New brief offers only that channel's formats plus Freeform.
**Owning Component**: `app/` only. **Role**: `FE`, JS-only, OTA-eligible.
**Depends On**: Frontend Task 2 merged (strict order, see Shared rules) and **Sprint 4 Task 9 PR A** (it contains R1b: `offeredFormatKeys` and `channels.listFormats({ channelId, videoKind })`) on `main`. Check `docs/execution/sprint4/STATUS.md`. PR A is small and ships first, so this will already be true when Task 2 is done. No backend task is needed beyond Task 9 R1b.
**Branch**: `SPRINT4_FE_N2`, fresh `origin/main`, own worktree. One commit per requirement.
**Duration**: 2 days.
**Success Criteria**: (1) a phone screenshot beside every board below; (2) a real profile saved with 2 formats appears in New brief as exactly those chips plus Freeform; (3) a Freeform submit sends no `formatKey`; (4) a channel with no formats shows Freeform only; (5) `tsc`, `expo lint` and app tests pass; no `package.json`, lockfile, `app.json` or native change.

## Data (Task 9 R1b, verify names in R0)

- Profile field `offeredFormatKeys?: string[]` in `ChannelProfileDataSchema`; saved with `channels.createProfileVersion`; read from `channels.getActiveProfile` / `listProfileVersions`. A version without the field means "none".
- `channels.listFormats()` (no input) returns all formats. `channels.listFormats({ channelId, videoKind? })` returns only this channel's formats, in the profile's order (empty list `[]` for none).
- Entry shape: `{ key, label, videoKind: 'short' | 'long', targetSeconds, briefTemplate, scriptStructure }`.
- Freeform is not an entry. It is the absence of `formatKey` on `runs.create`, always shown first and selected by default.
- `runs.create` with an unlisted `formatKey` for a channel that has a list returns `BAD_REQUEST` ("That format is not offered by this channel"). The app never sends one; if it happens, show the server message above the Create button.
- Format names on the boards are sample data. Use the real formats from `channels.listFormats()`: the 9 Shorts formats and "Chaptered explainer".

## R0. Read the code first

Table in the report: each BUILT board this task replaces, **matches** or **differs: what** (see Frontend Task 2 R0). Also find: how the app decides who may edit a channel's profile (needed for the link in R4), and what Frontend PR #53 actually shipped for the format chips and the profile screen, because this task replaces both.

## R1. Content profile

Board **"Content profile — replaces BUILT row 6 'Content profile' · Formats section first, other sections fold"** (`N_S4ChannelProfile`), replacing "Content profile — full screen".

1. **Formats section first.** Checkbox list of all formats from `channels.listFormats()`, grouped under "Shorts" and "Video". Helper: "Pick 2 to 4 formats this channel uses." Nothing selected is allowed.
2. **Count note** under the list:
   - 0 selected: "None selected: New brief shows only Freeform for this channel."
   - 1 to 4 selected: "{n} selected. New brief shows these (for the chosen Type) plus Freeform."
   - 5 or more (amber, still allowed): "{n} selected. More than 4 makes the New brief picker crowded; allowed, but consider fewer."
3. **Freeform line**: "Freeform is always available and isn't in this list."
4. **Saving** sends `offeredFormatKeys` in the normal "Save as v{n+1}" flow through `channels.createProfileVersion`, together with every other field the screen already sends. Never drop a field the user did not touch.
5. **Other sections fold** (Script, Visuals, Audio, Packaging). Folded summary per section: "{set} of {total} set", or "uses defaults" when nothing is set.
6. **After Save with an error**: the section holding the error opens by itself, scrolls to the field and shows the error inline (the built behaviour).
7. **Platform limits** (read-only block): "Shorts: 60 s max · Videos: 2 to 15 min". The Shorts length field is labelled "Target length for Shorts (15–60 s)".

## R2. Channel settings entry

Board **"Channel settings entry — replaces BUILT row 6 · 'v3 · 3 formats · saved 6 Oct'"** (`N_S4ChannelSettingsEntry`), replacing "Channel settings — Content profile entry". The "Content profile ›" row shows "v{n} · {k} formats · saved {date}", or "Not set up — uses channel defaults". Everything else on Channel settings stays as built.

## R3. New brief: format chips

Board **"New brief — replaces BUILT row 6 format picker · chips = this channel's formats"** (`N_S4NewBriefFormat`), replacing "New brief — format picker + sources".

- Chips row: **Freeform** (default, selected) plus the channel's formats from `channels.listFormats({ channelId, videoKind })`. The Type field arrives in Frontend Task 4, so for now send `videoKind: 'short'`. Refetch when the channel changes.
- Helper under the chips: "Freeform is the default. The chips are the formats this channel uses (set in Content profile)."
- Picking a format keeps the built behaviour: the brief placeholder becomes its `briefTemplate` (never pre-filled text), the helper shows its `scriptStructure`, and the Length control is disabled with the format's length. Copy: "Length: {n} s (from format). Pick Freeform to choose your own." (minutes for a Video format: "Length: 10 min (from format)…").
- More than about 4 chips: the row scrolls sideways; the chip "More ▾" opens the sheet in R4.
- Freeform sends **no `formatKey`**.

## R4. Format sheet

Board **"Format sheet — replaces BUILT row 6 · only this channel's formats, ✓, edit link"** (`N_S4FormatSheet`), replacing "Format picker sheet — 9 formats". Header "Formats this channel uses…". The selected format has a ✓. Footer link "Edit this channel's formats in Content profile ›", **hidden for users who cannot edit the profile** (use the same permission check Channel settings uses; R0 names it).

## R5. Channel with no formats

Board **"New brief — channel with no formats (Freeform only) · new state"** (`FmtBriefFreeformOnly`; no BUILT board). Only the Freeform chip shows, with the line "This channel has no formats yet. Add formats in Content profile ›". The link is hidden for users who cannot edit the profile.

## Not in this task

The Type field (Shorts | Video), cost block, long-form screens and the Compare Shorts/Videos switch are Frontend Task 4.

## Verify

Phone screenshot beside each board. Real checks: save a profile with 2 formats and confirm New brief shows exactly those plus Freeform; save with none and confirm Freeform only; an older profile version without the field behaves as none; a Freeform submit has no `formatKey` in the request (state how you checked); changing channel on New brief refetches the chips.

## Report

`docs/execution/sprint4/reports/frontend-task3.md`: R0 table, one section per requirement with screenshot reference, "Differences found, not changed", and what PR #53 had already built that this task replaced.
