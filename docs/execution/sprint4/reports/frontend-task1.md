# Sprint 4 Frontend Task 1 — Report

## E1 — Gate 2 Quality checks

**Status: Built, awaiting founder device verification.** The board was seen after the first build and the card was aligned to it (subtitle line, labels "Resolution · frame rate" / "Longest single shot", true minus sign, bold green values, right-aligned). Not "Done" until the founder's phone screenshot sits beside the board.

**What changed (additive, `app/` only, JS-only)**
- `app/lib/quality-checks.ts` — pure parser: `video_review` output → rows (Loudness, True peak, Resolution, Longest shot, Captions) + `softWarnings`.
- `app/components/QualityChecksCard.tsx` — the card; renders nothing when `qualityMetrics` is absent.
- `app/app/(app)/run/[id].tsx` — one import and one line under the Video review card (Gate 2 only). Bugs Task 10's cancel UI is untouched.

**Rules implemented (founder decisions)**
- No thresholds anywhere in `app/`; no copy of `QUALITY_SPEC`. Resolution, fps and loudness are shown as measured values, never pass/fail.
- Red ✕ only when `hasAudio` is false. Amber ! when `captionsExpected` and `captionsDetected === false`. Everything else green ✓.
- `qualityMetrics.softWarnings` strings are shown verbatim in a card-level amber note; not parsed, no row coloured from them.
- Absent/malformed `qualityMetrics` → card hidden, nothing throws.

**Verification**
- `node --test lib/quality-checks.test.ts` → 6/6 pass. Fixtures: run `75f69faa-…` (one soft warning), run `dc2062a2-…` (all clear), plus no audio, captions expected but missing, captions not expected, and absent/malformed metrics. (The app has no test runner and no dependency was added; this uses Node's built-in `node:test`.)
- `cd app && npx tsc --noEmit`: no errors in `app/`. It reports 22 errors under `studio/` (stale generated Prisma client, missing `@aws-sdk/*` in this worktree), none from this change. `npm run lint` (expo lint) exits 0 with no output; the known `expo-image-picker` `import/no-unresolved` in `channel/[id].tsx` did not print here, and it is not from this change.
- `package.json`, `package-lock.json`, `app.json`, native code: unchanged → fingerprint matches `main`, OTA-eligible.

**Not exercised:** rendering on a device/emulator (no phone screenshots possible), and the live API path for the two preview runs (fixtures only; I did not connect to `sevenai_preview`).

**Founder actions**
1. Attach the board and compare; screenshot Gate 2 on the OnePlus (tenant account `7aistudiochannel@gmail.com`) beside it.
2. After installing the Task 10 APK: `eas update --branch preview`. Not run by the agent.

**Update 2026-10-11 (backend PR #64):** the card now reads `runs.get().qualityMetrics.rows.<row> = { warn, message }`. `warn` colours a row amber and `message` is shown under it; an absent row is hidden (not applicable); no text matching, no thresholds in the app. The previous card-level `softWarnings` note is gone (the row message replaces it). "Longest single shot" now matches the board.

## E2–E6 (same PR #53; backend PR #49 merged)

All status "Built, awaiting founder device verification". After the first build the boards were read from the canvas (artifact `WUXyvHqAfazmsDNEBMnagG`, files `S4*.dc.html`) and every screen was aligned to them (labels, colours, sizes, wording, order).

| Item | Built | Data source |
|---|---|---|
| E2 Compare | `app/(app)/compare.tsx`, "Compare channels ›" link at the top of Dashboard | `dashboard.comparison`, format labels from `channels.listFormats`; `formatKey: null` reads Freeform; zero-video channels shown |
| E3 Gate 1 cards | Factual concerns (amber), Style guide violations, Sources you gave; each hidden when empty; `ClampedText` 3 lines | `runs.get().scriptReview` |
| E3 Sources on New brief | "+ Add a source link", removable rows, URL-validated, sent only when non-empty | `runs.create` `sources` |
| E4 Format picker | Freeform + two most-used chips + "More formats ▾" sheet (label + seconds); placeholder = `briefTemplate`; helper = `scriptStructure`; "Length: {n}s (from format)"; `formatKey` sent only when not Freeform | `channels.listFormats`; most-used from `dashboard.comparison.byFormat` of the selected channel |
| E5 Content profile | `channel/[id]/profile.tsx`: Script / Visuals / Audio / Packaging, "Save as v{n+1}", Zod errors inline, Platform limits, version history, discard confirm; Channel settings row "Content profile ›", hides Default voice + Style guide and shows the amber note when a profile exists | `getActiveProfile`, `listProfileVersions`, `createProfileVersion` |
| E6 Repeat-topic | Amber banner at top of Gate 1, tap opens that run | `scriptReview.repeatTopic` (B16) |

**API gaps (nothing faked)**
- Version history: `listProfileVersions` returns `createdByUserId` only, no name. The app shows "system" / "you" / "a teammate".
- Platform limits: the app has no resolved-visual-source value. The safety-negative line shows only when the profile's own Default visual source is `ai-stills`; with it blank, the line is hidden.
- E4 "recent formats" uses the selected channel's own most-used formats (from `dashboard.comparison`) topped up from the library order. No dedicated "recent" API.

**Not exercised:** device rendering; a real `runs.create` with `formatKey`/`sources` and a real `createProfileVersion` (needs the paid pipeline / preview); E4 Freeform-sends-no-`formatKey` is by code (`...(format ? { formatKey } : {})`), not yet observed on the wire.

**Checks:** `cd studio && npx vitest run --root ../app` → 6 files, 25 tests pass (new: quality-checks, gate1-review, compare, brief-extras, profile-form). `cd app && npx tsc --noEmit` → no errors in `app/` (22 pre-existing under `studio/` in this worktree). `npx expo lint` → clean. No `package.json` / lockfile / `app.json` / native changes.


### Board alignment (2026-10-11) and remaining differences from the boards

Aligned to the `S4*.dc.html` boards: Quality checks (filled-circle badges, row dividers, intro line), Compare (subtitle, lowercase stat labels, uppercase table header, `18.4k`/`1.0k` numbers), Gate 1 (banner, lighter amber Factual card), New brief (chip size, note under chips, link-prefixed source rows, "Shown to you at Gate 1…" helper, `Length: {n}s (from format)` beside Options, dedicated Format sheet with seconds pills), Content profile (inline "leave blank to use the default", select fields, switches, intro line, 🔒 Platform limits, Save button above helper, `6 Oct · you` history), Channel settings (single "Content profile ›" card, amber note inside Voice & look, Style guide hidden).

Differences kept on purpose, need a founder decision:
1. **Seconds per still:** the board says 2–6; the schema (`ChannelProfileVisualSchema`) allows 1–10. The label shows 1–10 (the server is the validator).
2. **Category / Language:** the board shows names ("Education", "English (en)"); the schema stores a YouTube id string and a BCP-47 code. They are text fields (id / code); a name picker needs an id↔name list that does not exist in the API.
3. **Safety negative prompt line** in Platform limits is not shown. The board always shows it; the earlier spec said only when the resolved source is `ai-stills`; and `AI_VISUALS_SAFETY_NEGATIVES_ENABLED` is off, so the line would be untrue.
4. **Fact policy** is a picker with the two schema values ("Brief only", "Brief plus common knowledge"); the board shows free text, which the schema does not allow.
5. **Format chips** wrap onto a second line instead of clipping, because format names are long.
6. **Compare avatar** uses the app's existing numbered channel tile; the board's colours per channel come from the same palette.
