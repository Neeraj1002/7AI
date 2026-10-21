import { LONG_LENGTH_TOLERANCE, LONG_WORDS_PER_MINUTE, countWords } from '../agents/script-generation/long-form';
import { findLatestMeasuredPace } from '../models/repositories/pipeline-stage.repository';

// Sprint 5 Task 8 (R7): the narration pace of the chosen voice, and what length a script will land at.
// Planning at one fixed pace (155) asked for 273 words that Coral (167 words per minute) narrated in 98 s
// against a 2:00 target: inside the floor by two seconds. The pace each voice really has comes from the
// narrations already made with it.

// A pace outside this range is a measurement error (a silent file, a stub), never a voice.
const MIN_PLAUSIBLE_WPM = 100;
const MAX_PLAUSIBLE_WPM = 220;

// The floor below which a long video is a broken render: 80% of its target. Not changed here.
export const LENGTH_FLOOR_FRACTION = 0.8;

export function plausiblePace(value: number | null | undefined): number | null {
  return typeof value === 'number' && value >= MIN_PLAUSIBLE_WPM && value <= MAX_PLAUSIBLE_WPM ? value : null;
}

// The latest measured pace for this voice, else the planning default.
export async function resolveVoicePace(
  tenantId: string,
  voice: string | null | undefined,
  lookup?: (tenantId: string, voice: string) => Promise<number | null>,
): Promise<{ wordsPerMinute: number; source: 'measured' | 'default' }> {
  if (voice) {
    try {
      const measured = plausiblePace(await (lookup ?? findLatestMeasuredPace)(tenantId, voice));
      if (measured !== null) return { wordsPerMinute: measured, source: 'measured' };
    } catch (error) {
      console.error(`[length-forecast] could not read the measured pace for voice ${voice}, using the default: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { wordsPerMinute: LONG_WORDS_PER_MINUTE, source: 'default' };
}

export type LengthStatus = 'ok' | 'short' | 'long' | 'under_floor';

export type LengthForecast = {
  wordCount: number;
  wordsPerMinute: number;
  paceSource: 'measured' | 'default';
  expectedSeconds: number;
  targetSeconds: number;
  floorSeconds: number;
  // (expected - target) / target; negative when short.
  deviation: number;
  status: LengthStatus;
  // True for every status except 'ok': the screen shows the message as a warning.
  warn: boolean;
  message: string;
};

function clock(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// Pure. Words at a pace give a length; the length is judged against the target (10% tolerance) and the
// floor (80% of target). Neither limit is changed here.
export function forecastLength(params: {
  text: string;
  targetSeconds: number;
  wordsPerMinute: number;
  paceSource?: 'measured' | 'default';
}): LengthForecast {
  const wordCount = countWords(params.text);
  const expectedSeconds = (wordCount / params.wordsPerMinute) * 60;
  const floorSeconds = params.targetSeconds * LENGTH_FLOOR_FRACTION;
  const deviation = (expectedSeconds - params.targetSeconds) / params.targetSeconds;
  const status: LengthStatus =
    expectedSeconds < floorSeconds ? 'under_floor'
    : deviation < -LONG_LENGTH_TOLERANCE ? 'short'
    : deviation > LONG_LENGTH_TOLERANCE ? 'long'
    : 'ok';
  const pct = `${deviation >= 0 ? '+' : ''}${(deviation * 100).toFixed(0)}%`;
  const head = `Expected length about ${clock(expectedSeconds)} against a ${clock(params.targetSeconds)} target (${pct}), from ${wordCount} words at ${params.wordsPerMinute.toFixed(0)} words per minute.`;
  const wordsToAdd = Math.ceil(((params.targetSeconds * (1 - LONG_LENGTH_TOLERANCE) - expectedSeconds) / 60) * params.wordsPerMinute);
  const message =
    status === 'under_floor' ? `${head} That is under the ${clock(floorSeconds)} minimum, so the video would be rejected. Add about ${wordsToAdd} words or more.`
    : status === 'short' ? `${head} That is more than 10% short of the target.`
    : status === 'long' ? `${head} That is more than 10% over the target.`
    : head;
  return {
    wordCount,
    wordsPerMinute: params.wordsPerMinute,
    paceSource: params.paceSource ?? 'default',
    expectedSeconds: Number(expectedSeconds.toFixed(1)),
    targetSeconds: params.targetSeconds,
    floorSeconds,
    deviation: Number(deviation.toFixed(4)),
    status,
    warn: status !== 'ok',
    message,
  };
}
