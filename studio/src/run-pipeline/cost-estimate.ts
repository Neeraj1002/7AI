import { resolvePurpose, resolvePricing } from '../llm';
import { resolveMediaPurpose, resolveTtsPricing, resolveTranscriptionPricing } from '../media';
import { resolveAiVisualsPurpose, resolveImagePricing } from '../ai-visuals/registry';
import type { VideoKind } from '../formats/manifest';
import { LONG_WORDS_PER_MINUTE } from '../agents/script-generation/long-form';
import { longStillCount } from '../agents/video-generation/plan-long';
import { RENDER_MAX } from '../packaging/constants';

// Sprint 4 Task 9 (R7): a pre-flight cost estimate from the real unit prices
// (never hard-coded rates), so the brief screen can suggest a per-video limit and
// runs.create can refuse a video the channel cannot afford. The token and
// character counts are planning assumptions. Checked against the real 2-minute run of
// 2026-10-11: estimated $0.4125, actually paid $0.4032 (reports/task9.md).

// One pace for the script target and the estimate (calibrated from a real run; see long-form.ts).
export { LONG_WORDS_PER_MINUTE };
const SHORT_WORDS_PER_MINUTE = 150;
const CHARS_PER_WORD = 6; // average English word plus its space
const TOKENS_PER_WORD = 1.4;
const SHORT_SECONDS_PER_STILL = 2.5;
const ATTEMPTS_WORST_CASE = 3;
// Sprint 5 Task 8 (D1): automatic retries may spend up to this many times the estimate in total; past it the
// run pauses and asks. Also what a new run's default spend limit is built from.
export const RETRY_ALLOWANCE_FACTOR = 2;

// One rule for how many stills a long video gets, shared with the planner that actually asks for them.
export const longFormStillCount = longStillCount;

export type CostEstimate = {
  estimateUsd: number; // one attempt
  worstCaseUsd: number; // three attempts; the still cache means stills are paid once
  suggestedMaxUsd: number;
  // Sprint 5 Task 8 (R8.1): what a run may spend including automatic retries, and the range to show.
  retryAllowanceUsd: number;
  rangeUsd: { minUsd: number; maxUsd: number };
  // packagingUsd (Sprint 6 Task 1): a long video's curiosity packages and thumbnails, or a Short's opening; paid once per run.
  breakdown: { stillsUsd: number; narrationUsd: number; transcriptionUsd: number; llmUsd: number; stillCount: number; packagingUsd: number };
};

function llmUsd(purpose: Parameters<typeof resolvePurpose>[0], inputTokens: number, outputTokens: number): number {
  const price = resolvePricing(resolvePurpose(purpose).model);
  return (inputTokens * price.inputPerMillionUsd + outputTokens * price.outputPerMillionUsd) / 1_000_000;
}

const roundUsd = (n: number) => Math.round(n * 10_000) / 10_000;

// The retry allowance (estimate x RETRY_ALLOWANCE_FACTOR), rounded up to the next $0.50: the default
// per-video spend limit.
export function suggestMaxUsd(estimateUsd: number): number {
  return Math.ceil((estimateUsd * RETRY_ALLOWANCE_FACTOR) / 0.5 - 1e-9) * 0.5;
}

export function estimateRunCost(params: {
  videoKind: VideoKind;
  targetSeconds: number;
  secondsPerStill?: number | null;
}): CostEstimate {
  const long = params.videoKind === 'long';
  const words = Math.round((params.targetSeconds / 60) * (long ? LONG_WORDS_PER_MINUTE : SHORT_WORDS_PER_MINUTE));
  const stillCount = long
    ? longStillCount(params.targetSeconds, params.secondsPerStill)
    : Math.min(20, Math.max(6, Math.ceil(params.targetSeconds / (params.secondsPerStill ?? SHORT_SECONDS_PER_STILL))));

  const imageModel = resolveAiVisualsPurpose('still-generation').model;
  const stillsUsd = stillCount * resolveImagePricing(imageModel).perImageUsd;
  const narrationUsd = words * CHARS_PER_WORD * resolveTtsPricing(resolveMediaPurpose('tts').model).perCharacterUsd;
  const transcriptionUsd =
    params.targetSeconds * resolveTranscriptionPricing(resolveMediaPurpose('transcription').model).perSecondUsd;

  const scriptTokens = Math.round(words * TOKENS_PER_WORD);
  const sceneTokens = stillCount * 80; // one planner prompt per still
  const llm =
    llmUsd('intake-parsing', 600, 150) +
    llmUsd('script-generation', 3_000 + (long ? 1_500 : 0), scriptTokens + 200) +
    llmUsd('script-review', scriptTokens + 1_500, 700) +
    llmUsd('video-production-planning', scriptTokens + 2_000, sceneTokens + 500) +
    // The Video Review call: up to 12 key frames (about 1,600 tokens each) and a short verdict.
    llmUsd('video-intelligence-own-draft', 12 * 1_600 + 800, 300);

  // Sprint 6 Task 1 (decision 4): the packaging step is part of what a video costs. Its text calls are the
  // brief, six concepts and the cold reader; its pictures are RENDER_MAX stills at the same price the video's
  // stills use. It runs once at Gate 2 and is reused by a Revise, so it is added once and not per attempt.
  const packagingUsd = long
    ? llmUsd('packaging-brief', scriptTokens + 1_200, 700) +
      llmUsd('packaging-concepts', scriptTokens + 2_200, 3_500) +
      llmUsd('packaging-cold-reader', 1_200, 600) +
      // PR B: per picture a defect check, the payoff check (the script and one image) and the critic; then every
      // pair of survivors is compared in both orders.
      RENDER_MAX * (llmUsd('packaging-defect-check', 1_800, 400) + llmUsd('packaging-payoff', scriptTokens + 1_800, 700) + llmUsd('packaging-critic', 1_800, 300)) +
      RENDER_MAX * 2 * llmUsd('packaging-compare', 1_800, 150) +
      RENDER_MAX * resolveImagePricing(imageModel).perImageUsd
    // R7: a Short's opening is the curiosity brief and one cold-reader read of its hook line; its picture replaces the first still.
    : llmUsd('packaging-brief', scriptTokens + 1_200, 700) + llmUsd('packaging-cold-reader', 300, 150);

  const perAttempt = stillsUsd + narrationUsd + transcriptionUsd + llm;
  const rest = narrationUsd + transcriptionUsd + llm;
  const estimateUsd = roundUsd(perAttempt + packagingUsd);
  return {
    estimateUsd,
    worstCaseUsd: roundUsd(stillsUsd + rest * ATTEMPTS_WORST_CASE + packagingUsd),
    suggestedMaxUsd: suggestMaxUsd(estimateUsd),
    retryAllowanceUsd: roundUsd(estimateUsd * RETRY_ALLOWANCE_FACTOR),
    rangeUsd: { minUsd: estimateUsd, maxUsd: roundUsd(estimateUsd * RETRY_ALLOWANCE_FACTOR) },
    breakdown: {
      stillsUsd: roundUsd(stillsUsd),
      narrationUsd: roundUsd(narrationUsd),
      transcriptionUsd: roundUsd(transcriptionUsd),
      llmUsd: roundUsd(llm),
      stillCount,
      packagingUsd: roundUsd(packagingUsd),
    },
  };
}
