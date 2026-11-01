# BUGS_CHANNEL_SETTINGS_DUPES — report

## Step 1 — confirmation
Read `app/app/(app)/channel/[id].tsx` at origin/main: the Style guide box (was `flags.channelSettings && !hasProfile`) and the Default voice row (was `!hasProfile`) were both gated on `hasProfile = Boolean(profile.data)`. A channel WITH a profile showed neither, only the "now come from the content profile" note. So the code does not show them on a profile channel. The one real path: `profile.data` is undefined while the profile query loads (or errors), so a channel with a profile briefly (or, on a failed fetch, persistently) rendered both. I could not reproduce against a specific live channel from here; the founder's channel/state is unconfirmed.

## Step 2 — change
Removed the Style guide box, its draft/changes handling, the Default voice row, voice picker (`OptionSheet`, `useOptionLists`) and the profile note with its styles. A channel with no profile (and not loading) shows one "Set up content profile" row opening `/channel/[id]/profile`. Captions, watermark, niche, etc. untouched; the screen no longer sends `styleGuide`/`defaultVoice`.

## Step 3 — checks
- eslint on the file: clean. `tsc --noEmit`: only pre-existing `studio/src/packaging/lettering.ts` missing `@napi-rs/canvas`; none in app code.
- `vitest run`: 30 files / 205 tests pass. No tests covered the removed boxes; the app has no component-render test setup, so no test was added for the new row (verify by eye on preview).
