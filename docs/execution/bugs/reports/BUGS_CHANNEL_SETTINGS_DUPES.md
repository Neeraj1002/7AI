# BUGS_CHANNEL_SETTINGS_DUPES — report

## Step 1 — confirmation
Read `app/app/(app)/channel/[id].tsx` at origin/main: the Style guide box (was `flags.channelSettings && !hasProfile`) and the Default voice row (was `!hasProfile`) were both gated on `hasProfile = Boolean(profile.data)`. A channel WITH a profile showed neither, only the "now come from the content profile" note. So the code does not show them on a profile channel. The one real path: `profile.data` is undefined while the profile query loads (or errors), so a channel with a profile briefly (or, on a failed fetch, persistently) rendered both. I could not reproduce against a specific live channel from here; the founder's channel/state is unconfirmed.

## Step 2 — change
Removed the Style guide box, its draft/changes handling, the Default voice row, voice picker (`OptionSheet`, `useOptionLists`) and the profile note with its styles. A channel with no profile (and not loading) shows one "Set up content profile" row opening `/channel/[id]/profile`. Captions, watermark, niche, etc. untouched; the screen no longer sends `styleGuide`/`defaultVoice`.

## Step 3 — checks
- eslint on the file: clean. `tsc --noEmit`: only pre-existing `studio/src/packaging/lettering.ts` missing `@napi-rs/canvas`; none in app code.
- `vitest run`: 30 files / 205 tests pass. No tests covered the removed boxes; the app has no component-render test setup, so no test was added for the new row (verify by eye on preview).

## Revision — gating and where each value lives
- The setup row now shows only via `shouldOfferProfileSetup` (`app/lib/profile-setup.ts`): query succeeded AND no profile. Loading, error and has-profile show nothing. Three unit tests (loading/error share one case) in `profile-setup.test.ts`. the "Voice & look" card still shows captions/watermark.
- Founder's symptom note: not provided (placeholder left unfilled), so the channel/state remains unknown.

### Style guide
- Read by: `resolveChannelConfig` (`studio/src/channel-profile/resolve.ts`): `scriptGuide = profile.script.guide ?? channel.styleGuide ?? null`.
- Set now: content profile screen, "Script guide" field.
- Stored value on a no-profile channel: untouched in the DB and still used as the fallback until a profile with a guide exists. It can no longer be edited from channel settings.

### Default voice
- Read by: same resolver, `audioDefaultVoice = runOverride ?? profile.audio.defaultVoice ?? channel.defaultVoice ?? DEFAULT_TTS_VOICE`; the new-brief and run screens also display `channel.defaultVoice`.
- Set now: content profile screen, "Default voice" field (`profile.tsx`, `defaultVoice`). No lost function.
- Stored value on a no-profile channel: untouched and still used as fallback; no longer editable from channel settings.
