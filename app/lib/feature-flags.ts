// UI Enhancement 1 — controls hidden until their backend item merges. Flip
// each to true in a one-line follow-up once B1/B2/B3
// (docs/execution/ui-ux/ENH1_BACKEND_REQUIREMENTS.md) land. While a flag is
// false, the related UI is hidden entirely, never shown-but-disabled — the
// app must never offer an action the API can't perform.
export const flags = {
  gate2Visibility: false, // B1 — runs.gate2 accepting privacyStatus
  channelEdit: false, // B2 — channels.update
  channelDelete: false, // B3 — channels.archive
};
