import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import { z } from "zod";
import { env } from "../../config/env";
import {
  callLLM,
  describeJsonError,
  extractJsonText,
  type LLMResponse,
} from "../../llm";
import type { ChapterTiming } from "../../long-form/chapters";
import {
  NonTransientStageError,
  withRetryAndCircuitBreaker,
} from "../../run-pipeline/retry-with-backoff";
import { llmUsageContext } from "../../run-pipeline/stage-failure";
import type { VisualSource } from "../video-generation/plan";
import {
  qualityProfileFor,
  type QualityMetrics,
} from "../video-generation/quality-spec";
import { hardFailureReason, measureQualityMetrics } from "./quality-metrics";

// Video Intelligence agent, own-draft mode — AGENT_FLEET_DESIGN.md Section
// 4.2. Deterministic checks (ffprobe/FFmpeg, zero LLM cost) run first and
// gate the materially more expensive multimodal pass — a video that's
// obviously wrong never reaches the LLM at all. Resolves 4.2's own open
// question ("how much of the own-draft rubric can be deterministic") in
// favor of "as much as possible, cheaply."

const execFileAsync = promisify(execFile);

// Proposed per docs/execution/week3/BUSINESS_LOGIC.md Section 1 — flagged
// for confirmation, same treatment as Week 2 Task 4's AgentQuota ceiling.
// This is the number of *regenerations* allowed, not total attempts — up to
// 3 total video_generation attempts per run before the circuit breaker trips.
export const MAX_VIDEO_REGEN_ATTEMPTS = 2;

const MAX_DURATION_SECONDS = 60;
const EXPECTED_ASPECT_RATIO_VALUE = 9 / 16;
const ASPECT_RATIO_TOLERANCE = 0.02;
const MIN_MEAN_VOLUME_DB = -45;

type VideoMeta = { durationSeconds: number; width: number; height: number };

export type DeterministicCheckResult =
  | { passed: true; meta: VideoMeta; metrics: QualityMetrics }
  | { passed: false; reason: string; metrics?: QualityMetrics };

async function probeVideoMeta(videoPath: string): Promise<VideoMeta> {
  const { stdout } = await execFileAsync(env.FFPROBE_PATH, [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height:format=duration",
    "-of",
    "json",
    videoPath,
  ]);
  const parsed = JSON.parse(stdout) as {
    streams?: { width?: number; height?: number }[];
    format?: { duration?: string };
  };
  const stream = parsed.streams?.[0];
  if (!stream?.width || !stream.height || !parsed.format?.duration) {
    throw new Error(
      `ffprobe did not return expected video metadata for ${videoPath}`,
    );
  }
  return {
    durationSeconds: parseFloat(parsed.format.duration),
    width: stream.width,
    height: stream.height,
  };
}

async function probeMeanVolumeDb(videoPath: string): Promise<number> {
  // ffmpeg writes volumedetect's stats to stderr, not stdout, and exits 0
  // (the null muxer produces no real output file, which is expected here).
  const { stderr } = await execFileAsync(env.FFMPEG_PATH, [
    "-i",
    videoPath,
    "-af",
    "volumedetect",
    "-f",
    "null",
    "-",
  ]);
  const match = stderr.match(/mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/);
  if (!match) {
    throw new Error(
      "Could not parse mean_volume from ffmpeg volumedetect output",
    );
  }
  return parseFloat(match[1]);
}

// Zero LLM cost, zero UsageEvent row for this part — the cost-gate behavior
// this task exists to prove.
export async function runDeterministicChecks(
  videoPath: string,
  options: {
    captionsEnabled?: boolean;
    visualSource?: VisualSource;
    // Sprint 4 Task 9/10: 'long' = 16:9 with its own profile; absent = a Short.
    videoKind?: "short" | "long";
    // Task 10: planned seconds per still (sets the longest-shot allowance) and the narration length
    // the video must follow within 2%.
    secondsPerStill?: number | null;
    // Optional long-form AI-stills pacing gate. Omitted callers retain the
    // warning-only behavior shown at Gate 2.
    enforceLongShotPacing?: boolean;
    narrationSeconds?: number;
  } = {},
): Promise<DeterministicCheckResult> {
  const meta = await probeVideoMeta(videoPath);
  const profile = qualityProfileFor(options.videoKind, options.secondsPerStill);
  const isLong = profile.videoKind === "long";

  if (!isLong && meta.durationSeconds > MAX_DURATION_SECONDS) {
    return {
      passed: false,
      reason: `Duration ${meta.durationSeconds.toFixed(1)}s exceeds the ${MAX_DURATION_SECONDS}s Shorts limit`,
    };
  }

  const expectedRatio = isLong ? 16 / 9 : EXPECTED_ASPECT_RATIO_VALUE;
  const actualRatio = meta.width / meta.height;
  if (
    Math.abs(actualRatio - expectedRatio) >
    ASPECT_RATIO_TOLERANCE * (isLong ? 16 / 9 : 1)
  ) {
    return {
      passed: false,
      reason: isLong
        ? `Aspect ratio ${meta.width}x${meta.height} is not 16:9 (expected a landscape long-form video)`
        : `Aspect ratio ${meta.width}x${meta.height} is not 9:16 (expected vertical Shorts format)`,
    };
  }

  // Sprint 4 Task 8 (R7) — measure the whole quality spec (LUFS/true peak,
  // fps/resolution/codec, longest shot, caption presence). Only HARD failures
  // block; everything else rides along in `metrics` to be recorded and shown
  // at Gate 2.
  const metrics = await measureQualityMetrics({
    videoPath,
    captionsEnabled: options.captionsEnabled ?? false,
    visualSource: options.visualSource,
    profile,
  });
  const hardFailure = hardFailureReason(metrics, profile, {
    videoSeconds: meta.durationSeconds,
    narrationSeconds: options.narrationSeconds,
  }, { enforceLongShotPacing: options.enforceLongShotPacing && options.visualSource === 'ai-stills' });
  if (hardFailure) {
    return { passed: false, reason: hardFailure, metrics };
  }

  const meanVolumeDb = await probeMeanVolumeDb(videoPath);
  if (meanVolumeDb < MIN_MEAN_VOLUME_DB) {
    return {
      passed: false,
      reason: `Audio is effectively silent (mean volume ${meanVolumeDb.toFixed(1)}dB)`,
      metrics,
    };
  }

  return { passed: true, meta, metrics };
}

// B5 fix, part 2 (KNOWN_ISSUES_AND_BLOCKERS.md §3, the caption/frame-sampling
// conflict): a single midpoint frame is a single point of failure — a
// caption cue's own timing landing that exact instant can show a partial
// word even when the video as a whole is fine, and word-flash is still a
// selectable (if discouraged) choice in plan.ts. The real fix is sampling
// multiple frames spread across the video and having the multimodal prompt
// judge the whole set, not further suppressing one caption style — that
// only reduces the odds of tripping the bug, it doesn't fix the underlying
// single-frame vulnerability, and doesn't help if a *different* momentary
// artifact (a stock-footage transition, a dropped frame) lands on the one
// sampled instant.
const SAMPLE_FRACTIONS = [0.25, 0.5, 0.75];

// Sprint 4 Task 10 (R2): long-form frames are taken inside every chapter (its midpoint), so no
// chapter goes unseen. Capped so a many-chapter video does not send an unbounded number of images;
// when over the cap the chapters are thinned evenly (first and last always kept).
export const MAX_REVIEW_FRAMES = 12;
export function chapterSampleTimestamps(
  chapters: ChapterTiming[],
  durationSeconds: number,
): number[] {
  const mids = chapters.map((c) =>
    Math.min(
      Math.max(0, (c.startSec + c.endSec) / 2),
      Math.max(0, durationSeconds - 0.1),
    ),
  );
  if (mids.length <= MAX_REVIEW_FRAMES) return mids;
  return Array.from(
    { length: MAX_REVIEW_FRAMES },
    (_, i) =>
      mids[Math.round((i * (mids.length - 1)) / (MAX_REVIEW_FRAMES - 1))],
  );
}

async function extractSampleFramesBase64(
  videoPath: string,
  durationSeconds: number,
  timestamps?: number[],
): Promise<string[]> {
  const frames: string[] = [];
  const points = timestamps ?? SAMPLE_FRACTIONS.map((f) => durationSeconds * f);
  for (const [index, point] of points.entries()) {
    const timestamp = Math.max(0, point);
    const framePath = `${videoPath}.frame${index}.jpg`;
    await execFileAsync(env.FFMPEG_PATH, [
      "-y",
      "-ss",
      timestamp.toFixed(2),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      framePath,
    ]);
    const buffer = await fs.readFile(framePath);
    frames.push(buffer.toString("base64"));
  }
  return frames;
}

const MultimodalVerdictSchema = z.object({
  verdict: z.enum(["pass", "fail"]),
  notes: z.string().min(1),
});

// Sprint 2 Task 2 (E3) — the rubric was written and tuned entirely against
// real photographic stock footage; an 'ai-stills' render needs a different
// visual-quality bar, same shape as the caption-style word-flash carve-out
// above (don't fail a video for a known, expected characteristic of the
// visual style it deliberately chose).
function visualContextInstruction(visualSource: VisualSource): string {
  if (visualSource === "ai-stills") {
    return `the visuals are a sequence of AI-generated cinematic video clips (e.g., Runway/Hunyuan) featuring organic physical motion and active camera work — NOT static imagery. Judge whether each video clip serves as an *atmospheric, historically immersive*, on-topic backdrop for this content, matching the bar of premium documentary b-roll. Do NOT fail a frame for looking heavily stylized, cinematic, or AI-rendered — that is the intentional, expected high-end aesthetic. Only fail if a clip's frame is completely blank, visually corrupted, contains severe physical glitches, or shows content genuinely unrelated to the topic.`;
  }
  return `the background is real licensed stock footage chosen for the topic, not a custom shoot — judge whether it's a *reasonable* backdrop for this content, not whether it's visually impressive.`;
}

// Sprint 4 Task 3 (R11): only for AI-generated video clips. Real stock footage can
// legitimately show real people, so none of this applies there.
export const SAFETY_CHECK_INSTRUCTION = `
This channel enforces a strict safety and compliance rule on AI-generated clips. Also fail the video if any sampled frame clearly shows any of: a recognisable brand logo or trademark; legible gibberish text baked directly into the visual landscape (other than the burned-in captions); a photoreal depiction of an identifiable real modern person; graphic blood, gore, or extreme violence. Name the offending frame in the notes so the next rendering attempt can steer away from it.`;

export function buildSystemPrompt(
  visualSource: VisualSource,
  safetyChecks = false,
  longForm?: { frameCount: number },
): string {
  const framesIntro = longForm
    ? `You are reviewing ${longForm.frameCount} key frames, each sampled from a distinct chapter's video clip, from a long-form 16:9 cinematic YouTube video before it's approved for publishing, alongside the topic and script it's based on.`
    : `You are reviewing ${SAMPLE_FRACTIONS.length} frames sampled at different points (roughly 25%, 50%, and 75% through) from a short vertical video (a YouTube Short) before it's approved for publishing, alongside the topic and script it's based on.`;

  return `${framesIntro} Judge the video as a whole across all the frames together — ensuring the visual narrative flows smoothly, is not blank, is free of severe AI artifacts, and is deeply consistent with the described historical topic and dramatic tone (${visualContextInstruction(visualSource)}).

A single frame catching a momentary presentation artifact (e.g. burned-in captions caught mid-transition between cues, showing a partial word) should NOT by itself fail the video if the other sampled frames look reasonable — judge the overall impression across all frames, not a single worst instant. Only fail if the pattern is consistent across the frames, or if a frame shows something genuinely wrong (blank/corrupted footage, severe physical clipping errors, or content completely unrelated to the historical topic).

Respond with ONLY a JSON object: {"verdict": "pass" | "fail", "notes": string}
"notes" briefly explains the verdict; on a fail, give specific, actionable fix guidance.
Respond with raw JSON only — no markdown code fences, no commentary.${
    safetyChecks && visualSource === "ai-stills" ? SAFETY_CHECK_INSTRUCTION : ""
  }`;
}

export type VideoIntelligenceOutcome = {
  verdict: "pass" | "fail";
  rationale: string;
  multimodalRan: boolean;
  llm?: LLMResponse;
  // Sprint 4 Task 8 (R7) — present whenever measurement ran (including on a
  // deterministic fail); undefined only when the failure came before it.
  qualityMetrics?: QualityMetrics;
};

export async function reviewVideo(params: {
  videoPath: string;
  topic: string;
  scriptText: string;
  // Sprint 2 Task 2 (E3) — which rubric variant to apply. Required, not
  // defaulted: the caller (state-machine.ts) always has a completed
  // video_generation stage's plan.visualSource by this point, and silently
  // defaulting here risks judging an 'ai-stills' render against the
  // stock-footage bar by accident.
  visualSource: VisualSource;
  // Sprint 4 Task 8 (R7) — whether this channel burns captions in; drives the
  // caption-presence measurement. Defaults to true, matching BrandAssets.
  captionsEnabled?: boolean;
  // Sprint 4 Task 3 (R11): the platform safety-negatives flag; applies to
  // ai-stills only.
  safetyChecks?: boolean;
  // Sprint 4 Task 10 (R2): long-form only. Absent for a Short, which then behaves exactly as before.
  videoKind?: "short" | "long";
  secondsPerStill?: number | null;
  // Opt-in: fail an overlong AI-stills shot so the bounded regen can adjust
  // scene placement. Defaults off for existing callers.
  enforceLongShotPacing?: boolean;
  chapterTimings?: ChapterTiming[];
  narrationSeconds?: number;
}): Promise<VideoIntelligenceOutcome> {
  const deterministic = await runDeterministicChecks(params.videoPath, {
    captionsEnabled: params.captionsEnabled ?? true,
    visualSource: params.visualSource,
    videoKind: params.videoKind,
    secondsPerStill: params.secondsPerStill,
    enforceLongShotPacing: params.enforceLongShotPacing,
    narrationSeconds: params.narrationSeconds,
  });
  if (!deterministic.passed) {
    return {
      verdict: "fail",
      rationale: deterministic.reason,
      multimodalRan: false,
      qualityMetrics: deterministic.metrics,
    };
  }

  const chapterTimestamps =
    params.videoKind === "long" &&
    params.chapterTimings &&
    params.chapterTimings.length > 0
      ? chapterSampleTimestamps(
          params.chapterTimings,
          deterministic.meta.durationSeconds,
        )
      : undefined;
  const framesBase64 = await extractSampleFramesBase64(
    params.videoPath,
    deterministic.meta.durationSeconds,
    chapterTimestamps,
  );

  // B3 fix (KNOWN_ISSUES_AND_BLOCKERS.md §2): only this one call is wrapped,
  // not the whole function — runDeterministicChecks above returns a result
  // object rather than throwing, which is exactly why a whole-function wrap
  // wouldn't compose with withRetryAndCircuitBreaker's retry-on-throw
  // semantics. A transient provider error here retries with backoff; a real
  // 'fail' verdict never throws at all (unaffected); the JSON/schema
  // validation below still throws NonTransientStageError, still uncaught by
  // this retry wrapper, still propagating to runVideoReviewStage's own
  // catch exactly as before.
  const llm = await withRetryAndCircuitBreaker(() =>
    callLLM({
      purpose: "video-intelligence-own-draft",
      system: buildSystemPrompt(
        params.visualSource,
        params.safetyChecks,
        params.videoKind === "long"
          ? { frameCount: framesBase64.length }
          : undefined,
      ),
      messages: [
        {
          role: "user",
          content: `Topic: ${params.topic}\nScript: ${params.scriptText}`,
          attachments: framesBase64.map((dataBase64) => ({
            mediaType: "image/jpeg",
            dataBase64,
          })),
        },
      ],
      maxTokens: 512,
    }),
  );

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(extractJsonText(llm.text));
  } catch (error) {
    throw new NonTransientStageError(
      `Video Intelligence did not return valid JSON (${describeJsonError(error)})`,
      error,
      llmUsageContext(llm),
    );
  }

  const result = MultimodalVerdictSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new NonTransientStageError(
      `Video Intelligence output failed schema validation: ${result.error.message}`,
      undefined,
      llmUsageContext(llm),
    );
  }

  return {
    verdict: result.data.verdict,
    rationale: result.data.notes,
    multimodalRan: true,
    llm,
    qualityMetrics: deterministic.metrics,
  };
}
