# Sprint 4 Frontend Task 3 (NEXT 2): Formats Per Channel: Report

**Branch**: `SPRINT4_FE_N2`, **stacked on `SPRINT4_FE_N1_RUN`** (Frontend Task 2 is not merged: no PR, branches local only; the founder chose to stack on 2026-10-12). `origin/main` was merged in (Task 9 PR A is on `main`: `offeredFormatKeys`, `channels.listFormats({ channelId, videoKind })`). One commit per requirement. Role `FE`, JS-only.
**Status**: code complete for R1 to R5; checked in the browser pane against a mock API (below). **Not done: the phone screenshots from the OnePlus after the OTA.** So the Definition of Done is not met yet; everything is "Built, awaiting device screenshots".

## How it was checked (and what that does not prove)

The real studio API would not start in this worktree (`Cannot find module '@aws-sdk/client-s3'`, studio `node_modules` incomplete), so I did **not** run against the real backend. I ran the Expo web build in the browser pane at 390 x 844 and pointed it at a throw-away mock tRPC server (kept outside the repo). The mock uses the **real** format manifest (`studio/src/formats/manifest.ts`) and the **real** `ChannelProfileDataSchema` (so a bad profile gets the real Zod message), and canned data for everything else; it logs each `createProfileVersion` and `runs.create` input. This proves the app's behaviour and the wire payloads; it does **not** prove the server-side behaviour (`listFormats` filtering, `BAD_REQUEST` for an unlisted key), which comes from Task 9 PR A's own tests. Screenshots are web renders, not device renders. Browser-pane clicks by coordinate did not register under viewport emulation; I used element refs.

`cd studio && npx vitest run --root ../app`: 8 files, 50 tests pass (new: formats, profile-form additions, brief-extras). `cd app && npx tsc --noEmit`: no errors in `app/` (pre-existing errors only under `studio/`). `npx expo lint`: clean. No `package.json`, lockfile, `app.json` or native change.

## R0. Read the code first

| BUILT board this task replaces | App before this task | Verdict |
|---|---|---|
| "Content profile — full screen" | `channel/[id]/profile.tsx`: four always-open cards (Script, Visuals, Audio, Packaging), no Formats section, no `offeredFormatKeys` anywhere in the form or the save | **differs**: no Formats section; sections not foldable; Shorts length label was "Target length (15–60 s)"; limits said "Max length 60 s" |
| "Channel settings — Content profile entry" | one "Content profile ›" card, subtitle `profileSummary` = "v3 · script, visuals, audio" (sections that hold something) | **differs**: subtitle did not show formats or a date |
| "New brief — format picker + sources" | Freeform + 2 chips + "More formats ▾"; chips = the channel's most-used formats (from `dashboard.comparison.byFormat`) topped up from the library's first formats; sheet and chips listed **all** 9 library formats; Length control **hidden** when a format is picked | **differs**: not per channel; all 9 formats offered |
| "Format picker sheet — 9 formats" | Freeform + all formats with `{n}s` pill, no check mark, no footer link | **differs** |

**What PR #53 shipped and this task replaced** (E4 and E5): (1) `chipFormatKeys` (most-used + library top-up, 2 chips), the `dashboard.comparison` query it needed, and the all-formats `channels.listFormats()` call on New brief: removed, replaced by `channels.listFormats({ channelId, videoKind: 'short' })`. (2) The format sheet listing every library format: now only the channel's. (3) The Content profile had **no format picking at all** (the PENDING page described a Formats section, but it was never built); now it has one. (4) Kept as built: placeholder = `briefTemplate`, helper = `scriptStructure`, Freeform sends no `formatKey`, `formatKey` sent only when picked.

**How the app decides who may edit a channel's profile**: it does not. Channel settings' `canEdit` is `flags.channelEdit || flags.channelSettings || flags.gateToggles` (feature flags, all `true`); the profile screen has no check either. The only gate is the server: `channels.createProfileVersion` uses `loadManageableChannel` = `canResolveGate`: the tenant's `owner` role, or the channel's `ownerUserId`. For the R4/R5 links I added `canEditChannelProfile` (`app/lib/formats.ts`), which mirrors that rule from `useAuth().role`/`userId` and `channels.list`'s `ownerUserId` (both already on the client). The server stays the real gate. If you would rather have the backend return a `canEdit` flag, that is a small task and this helper gets deleted.

## R1. Content profile (`N_S4ChannelProfile`), commit `R1`

- Formats card first, open by default: checkbox list from `channels.listFormats()`, grouped "Shorts" / "Video"; helper "Pick 2 to 4 formats this channel uses."; length per row ("45 s", "10 min"); count note in the three wordings (amber at 5 or more, still allowed); "Freeform is always available and isn't in this list." Nothing selected is allowed.
- Saving sends `offeredFormatKeys` through the normal "Save as v{n+1}" with every other field. Selection is saved in the library's order. Wire check: the profile (v1 with only `script.guide`) saved with 2 ticks sent `{"offeredFormatKeys":["origin-story","underdog-vs-giant"],"script":{"guide":"Dry, fast"}}`: untouched field kept. Empty selection omits the field (same meaning as absent).
- Script, Visuals, Audio, Packaging fold with "{set} of {total} set" or "uses defaults" (totals 5, 4, 2, 7).
- After a failed Save the section holding the first error (screen order) opens, the screen scrolls to the field and the error shows inline. Checked: Script folded with length 99 → Save → Script opened, scrolled, "Too big: expected number to be <=60" under the field. Needed one small addition: `FormScreen` takes an optional `scrollRef`.
- "Target length for Shorts (15–60 s)"; limits line "Shorts: 60 s max · Videos: 2 to 15 min".
- Screenshots: `frontend-task3/r1-profile-formats.jpg`, `r1-profile-two-selected.jpg`, `r1-profile-five-selected-amber.jpg`, `r1-profile-folded.jpg`, `r1-profile-error-reveals-section.jpg`.

## R2. Channel settings entry (`N_S4ChannelSettingsEntry`), commit `R2`

"Content profile ›" row: "v{n} · {k} formats · saved {date}" ("1 format" singular), or "Not set up — uses channel defaults" (unchanged). The date is formatted by hand ("12 Oct") because `Intl` abbreviations differ between engines (Node gave "Sept"). A version without the field counts 0. Checked: after saving 2 formats the row read "v2 · 2 formats · saved 12 Oct". Screenshot: `r2-channel-settings-entry.jpg`.

## R3. New brief chips (`N_S4NewBriefFormat`), commit `R3`

Chips = Freeform (default) + the channel's formats from `channels.listFormats({ channelId, videoKind: 'short' })` (Type field is Frontend Task 4); the channel is in the query key so it refetches on change; changing channel also resets a picked format. Chip row scrolls sideways; a trailing chip opens the sheet: "More ▾" when the channel has more than 3 formats, "All {n} ▾" otherwise (as on the board, so the sheet and its edit link stay reachable for small lists). Helper text as specified. A picked format keeps `briefTemplate` as placeholder (not pre-filled) and `scriptStructure` as helper; the Length control becomes a disabled box reading "Length: 45 s (from format). Pick Freeform to choose your own." (minutes for a long format, unit-tested). Freeform sends no `formatKey`: `formatKeyField` (`lib/brief-extras.ts`, unit-tested) also drops a picked key the channel does not offer.
Checked in the browser: profile saved with 2 formats → chips = Freeform, Origin Story, Underdog vs. Giant, "All 3 ▾" and nothing else; 5 formats → 5 chips + "More ▾", row scrolls; **Freeform submit**: the mock logged `runs.create` input `{"channelId":"…","briefText":"30 sec on why octopuses have three hearts"}`, no `formatKey` key; switching channel A (2 formats) → B (none) changed the chips with no reload. Screenshots: `r3-new-brief-chips.jpg`, `r3-new-brief-format-picked.jpg`.
Not exercised: a format submit on the wire (only covered by the unit test), and the server's `BAD_REQUEST` text above the Create button (the existing `onError → setError(err.message)` path is unchanged, but the UI cannot send an unlisted key, so I could not trigger it).

## R4. Format sheet (`N_S4FormatSheet`), commit `R4`

Only this channel's formats, Freeform first ("default"), ✓ on the selected row (Freeform included), length pill ("45 s"), subtitle "Formats this channel uses. Sets the structure and length; you can still edit the brief.", footer link "Edit this channel's formats in Content profile ›" shown only when `canEditChannelProfile` is true; it closes the sheet and opens the profile (Formats is open by default, so no extra param). Screenshot: `r4-format-sheet.jpg`.

## R5. Channel with no formats (`FmtBriefFreeformOnly`), commit `R5`

Only the Freeform chip, with "This channel has no formats yet." and, for editors, "Add formats in Content profile ›" (a 44 px row). Not shown while the query loads or fails (it would wrongly claim "no formats"). A version without the field (the mock's v1) showed exactly this. Hidden for a user who cannot edit: checked with a session whose role is `approver` on a channel owned by someone else (Freeform chip and the sentence, no link). Screenshots: `r5-freeform-only-editor.jpg`, `r5-freeform-only-non-editor.jpg`.

## Differences found, not changed

- Board "Seconds per still (2–6)"; the app says "(1–10)". Not outlined; left alone.
- Board also folds Platform limits and Version history; the task lists only the four editable sections, so those two stay open as built.
- Board's limits block has a third line "Safety negative prompt is added to AI images"; the app shows it only when the profile's own default source is AI images (E1 note: no resolved source in the API).
- Format sheet title: the task says header "Formats this channel uses…"; the board has title "Pick a format" with that sentence as the subtitle. I kept the board's title and used the sentence as the subtitle; say if the sentence should be the title.
- The real format is "Chaptered Explainer" (capital E); the task text says "Chaptered explainer". Real data used.
- With a format picked, "Options" still shows "Length: 45s (from format)" on its right (as built, matches the board) and the new locked Length box repeats it. Delete the header text if that is too much.
- **Until Frontend Task 4 adds the Type field**, a channel that offers only Video formats shows the "no formats yet" line on New brief, which is misleading for it. The board notes the same case. Worth a one-line check in Task 4.
- Channel settings and the profile screen have no client permission check (see R0).
- The "Fix the highlighted fields." line under the save bar stays until the next save (as built).
- Branch is stacked on Frontend Task 2's `SPRINT4_FE_N1_RUN`; when that merges, this branch's PR will show only this task's commits; merge Task 2 first.

## Open items

1. Phone screenshots on the OnePlus after the OTA beside each board (Definition of Done).
2. A real run through the actual API: save a profile with 2 formats, see exactly those chips plus Freeform, submit one format and one Freeform and read the real `runs.create` body.
