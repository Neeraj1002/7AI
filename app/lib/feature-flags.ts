// Controls hidden until their backend item merges. Flip each to true in a
// one-line follow-up once the item is merged, never before. While a flag is
// false, the related UI is hidden entirely, never shown-but-disabled — the
// app must never offer an action the API can't perform.
// Backend items B1–B3, B5–B7 and B10 are owned by the architect chat.
// When flipping a flag whose call goes through a loosely typed client, replace
// it with the real AppRouter types in the same commit.
export const flags = {
  gate2Visibility: true, // B1 — runs.gate2 accepting privacyStatus
  channelEdit: true, // B2 — channels.update
  channelDelete: true, // B3 — channels.archive
  channelSettings: true, // B5 — extended channels.update (style guide, voice, captions, spend limit)
  watermarkUpload: true, // B6 — watermark upload (native, needs the eas build this flag ships with)
  gateToggles: true, // B7 — per-channel Gate 1 / Gate 2 switches
  briefLength: true, // B10 — runs.create target length
};
