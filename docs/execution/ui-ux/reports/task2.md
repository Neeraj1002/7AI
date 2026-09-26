# UI/UX Task 2: UI Enhancement 2 — Channel Settings + New Brief Options

**Date**: 2026-09-27
**Branch / PR**: `UIUX_ENH2_FE` / draft PR #28 (branched from `origin/main` after #26 merged)
**Status**: Code complete; not verified on a device (none available), no screenshots.
**Tests**: `npm run lint` clean. `npm run typecheck` clean for `app/`; the only error reported is inside `studio/` (`defaultPrivacyStatus` missing from a stale locally generated Prisma client). I did not regenerate it because `studio/` must not be touched while the server runs.

| Item | Done | Notes |
|---|---|---|
| E1 pipeline-options | Yes | Misspelling a value makes typecheck fail (checked). Stale comment in feature-flags fixed. |
| E2 New brief options | Yes | Voice/Music sheets via new `OptionSheet`; Visuals via new `SegmentedControl`; only non-default picks sent; reset on channel change. Length hidden (`briefLength`). Channel default voice read from `channel.defaultVoice` (defaults to "Alloy" label if absent). |
| E3 Channel settings | Yes | All sections + single Save bar (changed fields only), Saved note, discard confirm (chevron and Android back). Uses real typed `channels.update`/`archive` (B2/B3 are merged in the backend; their flags stay false — not flipped here). |
| E4 Flags | Yes | `channelSettings`, `watermarkUpload`, `gateToggles`, `briefLength`, all false. |

## Deviations / open points
- **Watermark**: `expo-image-picker` isn't installed and would change the fingerprint, so the row is omitted (part of the next native build).
- **B5/B7 field names** (`styleGuide`, `defaultVoice`, `captionsEnabled`, `spendLimitUsd`, `gate1Enabled`, `gate2Enabled`) are working names in a `PendingFields` type; align with the merged backend tasks and delete that type in the commit that flips those flags.
- **Approvals captions** are neutral placeholders — the B7 task's verbatim wording wasn't available. The "disable Gate 2 unless Private" rule was not implemented (B7's restriction unknown).
- "Default: equal share of the pool" has no pool figure (none returned by `dashboard.cost`).
- Task 2's run-creation Verify (voice/visual/music in `video_generation` input) and the persistence Verify need the founder's device and a backend with B5.

## Shipping
Fingerprint (`expo-updates fingerprint:generate --platform android`) = `d9452ef2…`, identical to `main` → OTA-eligible. No flags are on at this point.
