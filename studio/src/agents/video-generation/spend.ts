import type { CreateUsageEventInput } from '../../types';

// Bugs Closure 2 (P5) — what one generateVideo attempt has already paid for.
// generateVideo threw away all of it when a later step failed (the ffmpeg
// assembly, a rate-limited still after the first ones were generated), so the
// catch in state-machine.ts booked provider/model 'unknown' at $0 for a
// render that really cost money, once per retry. The caller passes one of
// these in; generateVideo fills it as each paid call completes, and the
// failure path books it. Same intent as stage-failure.ts's LLM helpers
// (Bugs Task 11), but a render makes several different paid calls, so it is
// a running tally rather than one attached response.
export type VideoSpend = {
  ttsProvider?: string;
  ttsModel?: string;
  ttsCharacters: number;
  ttsCostUsd: number;
  transcriptionModel?: string;
  transcriptionSeconds: number;
  transcriptionCostUsd: number;
  stillsModel?: string;
  stillsCount: number;
  stillsCostUsd: number;
  stubFlags: { media: boolean; stockFootage: boolean; aiVisuals: boolean };
  // Sprint 4 Task 9: a long-form render books every paid call (narration chunk, still) the moment it
  // completes, so there is nothing left for the failure path to book (it would double count).
  bookedSeparately?: boolean;
};

export function emptyVideoSpend(stubFlags: VideoSpend['stubFlags']): VideoSpend {
  return {
    ttsCharacters: 0,
    ttsCostUsd: 0,
    transcriptionSeconds: 0,
    transcriptionCostUsd: 0,
    stillsCount: 0,
    stillsCostUsd: 0,
    stubFlags,
  };
}

export function totalVideoSpendUsd(spend: VideoSpend): number {
  return spend.ttsCostUsd + spend.transcriptionCostUsd + spend.stillsCostUsd;
}

// The usage-event fields for a render that failed after paying for something,
// or null when nothing was spent yet (then the caller keeps its old row).
export function failedRenderUsage(
  spend: VideoSpend,
  error: unknown,
): Pick<
  CreateUsageEventInput,
  'provider' | 'model' | 'characterCount' | 'audioDurationSeconds' | 'costUsd' | 'metadata'
> | null {
  if (spend.bookedSeparately) return null;
  const total = totalVideoSpendUsd(spend);
  if (total <= 0 && spend.ttsCharacters === 0 && spend.stillsCount === 0) return null;
  return {
    provider: 'openai',
    model: [spend.ttsModel, spend.transcriptionModel, spend.stillsModel].filter(Boolean).join('+') || 'unknown',
    characterCount: spend.ttsCharacters,
    audioDurationSeconds: spend.transcriptionSeconds.toFixed(2),
    costUsd: total.toFixed(6),
    metadata: {
      failedRender: true,
      failure: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
      ttsCostUsd: spend.ttsCostUsd.toFixed(6),
      transcriptionCostUsd: spend.transcriptionCostUsd.toFixed(6),
      aiVisualsStillCount: spend.stillsCount,
      aiVisualsCostUsd: spend.stillsCostUsd.toFixed(6),
      // A stubbed call is never mistaken for a real one.
      stubFlags: spend.stubFlags,
    },
  };
}
