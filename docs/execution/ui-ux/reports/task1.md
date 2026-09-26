# UI/UX Task 1: UI Enhancement 1 — Visual Foundation + Core Screen Redesign

**Date**: 2026-09-26
**Status**: Code complete — **on-device verification and screenshots still owed (see below)**
**Branch / PR**: `UIUX_ENH1_FE` / draft PR #26
**Tests**: `npm run typecheck` and `npm run lint` clean (typecheck needed `npm install` + `prisma generate` in `studio/` locally so `AppRouter` types resolve; no `studio/` source touched)

## Per item

| Item | Done | Notes / deviations |
|---|---|---|
| E0 Foundation | Yes | theme, run-labels, feature-flags, all shared components, Archivo loaded via `useFonts`. **Deviation**: no `expo-splash-screen` hold — see Shipping. Root renders `null` until fonts load. |
| E1 Tabs | Yes | Custom tab bar with Queue/Inbox badges. **Deviation**: expo-router SDK 57 vendors its own bottom-tabs navigator, so `@react-navigation/bottom-tabs` is not needed/added; `BottomTabBarProps` imported from `expo-router/build/react-navigation/bottom-tabs`. ChannelSwitcher deleted. |
| E2 Queue | Yes | Two sections, humanized errors, FAB clear of last card. Gate 1 "Scored x/10" omitted (not in list payload, per spec). |
| E3 Run detail | Yes | Gate 1/2 layouts, Stepper, sheets. Script `~sec · beats` reads `estimatedDurationSec`/`beats` from script_generation output if present (field names unverified — omitted when absent). Video verdict pass/fail inferred by regex on `verdict`. Gate 2 visibility + public confirm behind `flags.gate2Visibility`. Inbox restyled, shares GateActionBar. |
| E4 New brief + picker | Yes | Select mode with confirm button; "Last used" from persisted channel. |
| E5 Dashboard | Yes | Filter pill (local state, default All channels), empty/error states per spec. |
| E6 Channels / detail / delete | Yes | Detail edit/delete UI wired to `channels.update`/`archive` via a loosely-typed client because those procedures don't exist until B2/B3; hidden while flags are false. Email for "Signed in as" saved at verify (`sevenai.email`), cleared on sign-out. |
| E7 Sign in | Yes | Per-tab errors, email format check, server row, bot name env var. |
| E8 Keyboard | Yes | `FormScreen`/`FormScreenPlain`/`BottomSheet` use `KeyboardAvoidingView behavior="padding"` on both platforms, `keyboardShouldPersistTaps="handled"`. **Not yet verified on the OnePlus** — if it fails, fallback is `react-native-keyboard-controller` (native → APP build). |

## Shipping
Fingerprint (`expo-updates fingerprint:generate --platform android`): `main` = `d9452ef2…`; this branch = `d9452ef2…` (identical) → **OTA-eligible (`FE`)**. An earlier attempt using `expo-splash-screen` + the `expo-font` config plugin changed the fingerprint, so both were dropped. New deps are JS/asset only: `@expo-google-fonts/archivo`, `@expo/vector-icons`.

## Not done / needs the founder
- No before/after screenshots and no on-device run: I had no Android device. Every per-item **Verify** step is still to be run.
- Flags `gate2Visibility`, `channelEdit`, `channelDelete` stay `false` until B1/B2/B3 merge; the per-channel `defaultPrivacyStatus` field is read defensively.

## Sign-Off
- Objective: code met; device verification pending
- Ready for Integration: after on-device check
