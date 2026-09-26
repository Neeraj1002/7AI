# UI/UX Task 2: UI Enhancement 2 — Channel Settings + New Brief Options

Condensed copy of the spec handed to the implementer 2026-09-26 (the full text lived in the chat). Branch `UIUX_ENH2_FE`, FE-only, builds on task 1.

- **E1** `app/lib/pipeline-options.ts`: VOICES / VISUAL_SOURCES / MUSIC_MOODS / LENGTHS typed against `runs.create` input.
- **E2** New brief Options: Length (flag `briefLength`), Visuals (Auto | Stock footage | AI images), Voice and Music radio sheets; send only non-default picks; reset on channel change.
- **E3** Channel settings: Identity (name, niche, style guide), Voice & look (default voice, captions, watermark), Publishing (visibility, YouTube), Approvals (Gate 1/2 switches), Budget (spend limit + usage bar), Delete. Single Save bar sending only changed fields; discard-changes confirm. Canvas deviations: no "Default visuals", no "Posting rhythm", no voice preview, no schedule row, no cost estimate.
- **E4** Flags (all false): `channelSettings` (B5), `watermarkUpload` (B6), `gateToggles` (B7), `briefLength` (B10).
- Shipping: JS-only; fingerprint must match `main`. Report: `reports/task2.md`.
