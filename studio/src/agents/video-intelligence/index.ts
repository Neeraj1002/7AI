import type { ResolvedDirection } from '../../channel-profile/resolve';
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import { z } from "zod";
import { env } from "../../config/env";
import { type LLMResponse, type RetryGuard } from "../../llm";
import { callLLMJson, type CallLLMJsonResult, type JsonAttemptFailure } from "../../llm/json";
import type { ChapterTiming } from "../../long-form/chapters";
import { withRetryAndCircuitBreaker } from "../../run-pipeline/retry-with-backoff";
import type { VisualSource } from "../video-generation/plan";
import {
  qualityProfileFor,
  FRAME_REVIEW_SAMPLE_FRACTIONS,
  type QualityMetrics,
} from "../video-generation/quality-spec";
import { classifyHardFailure, hardFailureReason, measureQualityMetrics, type HardFailureCode } from "./quality-metrics";
import { VisualDefectSchema, type VisualDefect } from '../../run-pipeline/visual-repair';
import { buildFrameReviewSystemPrompt as buildSystemPrompt } from '../../prompts/system-prompts';
export { SAFETY_CHECK_INSTRUCTION, buildFrameReviewSystemPrompt as buildSystemPrompt } from '../../prompts/system-prompts';

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
    // The rendered length of each scene (long AI-stills), used for the shot figures instead of cut detection.
    plannedShotSeconds?: number[];
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
    plannedShotSeconds: options.plannedShotSeconds,
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

// Sprint 4 Task 10 (R2): long-form frames are taken inside every chapter (its midpoint), so no
// chapter goes unseen. Capped so a many-chapter video does not send an unbounded number of images;
// when over the cap the chapters are thinned evenly (first and last always kept).
export const MAX_REVIEW_FRAMES = 12;
export function locatedVisualDefects(defects: VisualDefect[] | undefined, sampleTimestamps: number[],
  sceneMap?: Array<{ sceneId: string; startSec: number; endSec: number }>): VisualDefect[] {
  return defects?.filter(defect => defect.sceneId && defect.timestampSeconds !== undefined &&
    sampleTimestamps.some(t => Math.abs(t - defect.timestampSeconds!) <= 0.25) &&
    sceneMap?.some(scene => scene.sceneId === defect.sceneId &&
      scene.startSec <= defect.timestampSeconds! && defect.timestampSeconds! < scene.endSec)) ?? [];
}
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
  const points = timestamps ?? FRAME_REVIEW_SAMPLE_FRACTIONS.map((f) => durationSeconds * f);
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

export const MultimodalVerdictSchema = z.object({
  verdict: z.enum(["pass", "fail"]),
  notes: z.string().min(1),
  visualDefects: z.array(VisualDefectSchema).max(1).optional(),
});

// Sprint 2 Task 2 (E3) — the rubric was written and tuned entirely against
// real photographic stock footage; an 'ai-stills' render needs a different
// visual-quality bar, same shape as the caption-style word-flash carve-out
// above (don't fail a video for a known, expected characteristic of the
// visual style it deliberately chose).
// Sprint 4 Task 3 (R11): only for AI-generated stills. Real stock footage can
// legitimately show real people, so none of this applies there.
// Sprint 6 Task 1 (PR 2): 'not_run' means the automated review could not be completed (the model's reply was
// still unusable after the one re-ask). It is never 'pass' and never 'fail': a reader that treats it as either
// is a bug, so every reader switches on this type.
export const REVIEW_VERDICTS = ["pass", "fail", "not_run"] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

export type VideoIntelligenceOutcome = {
  verdict: ReviewVerdict;
  rationale: string;
  multimodalRan: boolean;
  llm?: LLMResponse;
  // Every billed model call (the first, and the re-ask when there was one); `llm` is the last of them.
  llmCalls?: LLMResponse[];
  // Each unusable reply, capped, kept in the stage output (the whole reason a verdict is 'not_run').
  reviewFailures?: JsonAttemptFailure[];
  // Sprint 4 Task 8 (R7) — present whenever measurement ran (including on a
  // deterministic fail); undefined only when the failure came before it.
  qualityMetrics?: QualityMetrics;
  visualDefects?: VisualDefect[];
  // Sprint 5 Task 8 (R3/R5): why a deterministic check failed, as a stable code. Absent when the
  // verdict came from the multimodal pass.
  reasonCode?: HardFailureCode;
};

export async function reviewVideo(params: {
  direction?: ResolvedDirection;
  visualStyle?: string | null;
  // LLM Registry task (R5): the stage's budget check, asked before every extra provider call.
  retryGuard?: RetryGuard;
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
  sceneMap?: Array<{ sceneId: string; startSec: number; endSec: number }>;
  // Sprint 5 Task 8 (R6): pictures the pre-render check still flagged after their one regeneration. The
  // sampled frames cannot see them all, so the reviewer is told.
  flaggedStills?: Array<{ sceneId: string; issues: Array<{ kind: string; detail: string }> }>;
}): Promise<VideoIntelligenceOutcome> {
  const deterministic = await runDeterministicChecks(params.videoPath, {
    captionsEnabled: params.captionsEnabled ?? true,
    visualSource: params.visualSource,
    videoKind: params.videoKind,
    secondsPerStill: params.secondsPerStill,
    enforceLongShotPacing: params.enforceLongShotPacing,
    narrationSeconds: params.narrationSeconds,
    ...(params.videoKind === 'long' && params.visualSource === 'ai-stills' && params.sceneMap && params.sceneMap.length > 0 && {
      plannedShotSeconds: params.sceneMap.map((scene) => scene.endSec - scene.startSec),
    }),
  });
  if (!deterministic.passed) {
    return {
      verdict: "fail",
      rationale: deterministic.reason,
      reasonCode: classifyHardFailure(deterministic.reason),
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
  const sampleTimestamps = chapterTimestamps ?? FRAME_REVIEW_SAMPLE_FRACTIONS.map(f => deterministic.meta.durationSeconds * f);
  const sampledSceneMap = params.sceneMap?.filter(s => sampleTimestamps.some(t => s.startSec <= t && t < s.endSec));

  // B3 fix (KNOWN_ISSUES_AND_BLOCKERS.md §2): only this one call is wrapped,
  // not the whole function — runDeterministicChecks above returns a result
  // object rather than throwing, which is exactly why a whole-function wrap
  // wouldn't compose with withRetryAndCircuitBreaker's retry-on-throw
  // semantics. A transient provider error here retries with backoff; a real
  // 'fail' verdict never throws at all (unaffected); an unusable reply is
  // callLLMJson's one re-ask and then a 'not_run' verdict, not a throw.
  const json = await withRetryAndCircuitBreaker(() =>
    callLLMJson({
      purpose: "video-intelligence-own-draft",
      retryGuard: params.retryGuard,
      schema: MultimodalVerdictSchema,
      system: buildSystemPrompt(
        params.visualSource,
        params.safetyChecks,
        params.videoKind === "long"
          ? { frameCount: framesBase64.length }
          : undefined,
        params.direction,
        params.visualStyle,
      ),
      messages: [
        {
          role: "user",
          content: `Topic: ${params.topic}
Script: ${params.scriptText}${params.flaggedStills?.length ? `
Pictures flagged before the render and not fixed (mention them in your notes if a sampled frame shows one): ${JSON.stringify(params.flaggedStills)}` : ''}${sampledSceneMap ? `
Scene map for sampled frames (actual rendered seconds): ${JSON.stringify(sampledSceneMap)}
Sampled frame timestamps: ${JSON.stringify(sampleTimestamps)}` : ''}`,
          attachments: framesBase64.map((dataBase64) => ({
            mediaType: "image/jpeg",
            dataBase64,
          })),
        },
      ],
    }),
  );
  return outcomeFromJson(json, deterministic.metrics, sampleTimestamps, sampledSceneMap);
}

// The model's reply (or its absence) as an outcome. Pure, so the not_run and re-ask paths are testable without a render.
export function outcomeFromJson(
  json: CallLLMJsonResult<z.infer<typeof MultimodalVerdictSchema>>,
  qualityMetrics: QualityMetrics | undefined,
  sampleTimestamps: number[],
  sampledSceneMap?: Array<{ sceneId: string; startSec: number; endSec: number }>,
): VideoIntelligenceOutcome {
  const llm = json.calls[json.calls.length - 1];
  // Still unusable after the one re-ask: no throw. The review did not run, and every reader of the verdict
  // decides what that means (it is never a pass and never an automatic approval).
  if (!json.ok) {
    return {
      verdict: "not_run",
      rationale: `Automated review did not run: the reviewer's reply could not be used after one retry (${json.reason}).`,
      multimodalRan: true,
      llm,
      llmCalls: json.calls,
      reviewFailures: json.failures,
      qualityMetrics,
    };
  }
  // The provider takes the array bound, but a bound the model overshoots must not cost the review: keep the first.
  const visualDefects = json.value.visualDefects?.slice(0, 1);
  const locatedDefects = locatedVisualDefects(visualDefects, sampleTimestamps, sampledSceneMap);
  return {
    verdict: json.value.verdict,
    rationale: json.value.notes,
    ...(json.value.verdict === 'fail' && locatedDefects?.length && { visualDefects: locatedDefects }),
    multimodalRan: true,
    llm,
    llmCalls: json.calls,
    ...(json.failures.length > 0 && { reviewFailures: json.failures }),
    qualityMetrics,
  };
}
