// This project's own audio-bed types. No underlying provider to mirror the
// boundary of — F1's whole point is a curated local library, not an API —
// so this is simpler than llm/media/stock-footage/ai-visuals's types.ts.

export const MOOD_TAGS = ['upbeat', 'calm', 'mysterious', 'inspirational', 'tense'] as const;
export type MoodTag = (typeof MOOD_TAGS)[number];

export type AudioBedTrack = {
  moodTag: MoodTag;
  filePath: string;
  label: string;
  // Required in practice for every real manifest entry — typed optional
  // specifically so F2's license gate (client.ts's pickTrackByMood) has a
  // real, representable "missing" case to refuse, not just a hypothetical
  // one the type system rules out before the check can ever run.
  license?: string;
};
