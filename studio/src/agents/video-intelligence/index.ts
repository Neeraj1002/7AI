import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import { z } from 'zod';
import { callLLM, extractJsonText, type LLMResponse } from '../../llm';
import { env } from '../../config/env';
import { NonTransientStageError, withRetryAndCircuitBreaker } from '../../run-pipeline/retry-with-backoff';

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
  | { passed: true; meta: VideoMeta }
  | { passed: false; reason: string };

async function probeVideoMeta(videoPath: string): Promise<VideoMeta> {
  const { stdout } = await execFileAsync(env.FFPROBE_PATH, [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height:format=duration',
    '-of',
    'json',
    videoPath,
  ]);
  const parsed = JSON.parse(stdout) as {
    streams?: { width?: number; height?: number }[];
    format?: { duration?: string };
  };
  const stream = parsed.streams?.[0];
  if (!stream?.width || !stream.height || !parsed.format?.duration) {
    throw new Error(`ffprobe did not return expected video metadata for ${videoPath}`);
  }
  return { durationSeconds: parseFloat(parsed.format.duration), width: stream.width, height: stream.height };
}

async function probeMeanVolumeDb(videoPath: string): Promise<number> {
  // ffmpeg writes volumedetect's stats to stderr, not stdout, and exits 0
  // (the null muxer produces no real output file, which is expected here).
  const { stderr } = await execFileAsync(env.FFMPEG_PATH, ['-i', videoPath, '-af', 'volumedetect', '-f', 'null', '-']);
  const match = stderr.match(/mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/);
  if (!match) {
    throw new Error('Could not parse mean_volume from ffmpeg volumedetect output');
  }
  return parseFloat(match[1]);
}

// Zero LLM cost, zero UsageEvent row for this part — the cost-gate behavior
// this task exists to prove.
export async function runDeterministicChecks(videoPath: string): Promise<DeterministicCheckResult> {
  const meta = await probeVideoMeta(videoPath);

  if (meta.durationSeconds > MAX_DURATION_SECONDS) {
    return {
      passed: false,
      reason: `Duration ${meta.durationSeconds.toFixed(1)}s exceeds the ${MAX_DURATION_SECONDS}s Shorts limit`,
    };
  }

  const actualRatio = meta.width / meta.height;
  if (Math.abs(actualRatio - EXPECTED_ASPECT_RATIO_VALUE) > ASPECT_RATIO_TOLERANCE) {
    return {
      passed: false,
      reason: `Aspect ratio ${meta.width}x${meta.height} is not 9:16 (expected vertical Shorts format)`,
    };
  }

  const meanVolumeDb = await probeMeanVolumeDb(videoPath);
  if (meanVolumeDb < MIN_MEAN_VOLUME_DB) {
    return { passed: false, reason: `Audio is effectively silent (mean volume ${meanVolumeDb.toFixed(1)}dB)` };
  }

  return { passed: true, meta };
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

async function extractSampleFramesBase64(videoPath: string, durationSeconds: number): Promise<string[]> {
  const frames: string[] = [];
  for (const [index, fraction] of SAMPLE_FRACTIONS.entries()) {
    const timestamp = Math.max(0, durationSeconds * fraction);
    const framePath = `${videoPath}.frame${index}.jpg`;
    await execFileAsync(env.FFMPEG_PATH, [
      '-y',
      '-ss',
      timestamp.toFixed(2),
      '-i',
      videoPath,
      '-frames:v',
      '1',
      '-q:v',
      '3',
      framePath,
    ]);
    const buffer = await fs.readFile(framePath);
    frames.push(buffer.toString('base64'));
  }
  return frames;
}

const MultimodalVerdictSchema = z.object({
  verdict: z.enum(['pass', 'fail']),
  notes: z.string().min(1),
});

const SYSTEM_PROMPT = `You are reviewing ${SAMPLE_FRACTIONS.length} frames sampled at different points
(roughly 25%, 50%, and 75% through) from a short vertical video (a YouTube Short) before it's
approved for publishing, alongside the topic and script it's based on. Judge the video as a whole
across all the frames together — not blank, not corrupted, and roughly consistent with the
described topic and tone (the background is real licensed stock footage chosen for the topic, not
a custom shoot — judge whether it's a *reasonable* backdrop for this content, not whether it's
visually impressive).

A single frame catching a momentary presentation artifact (e.g. burned-in captions caught
mid-transition between cues, showing a partial word) should NOT by itself fail the video if the
other sampled frames look reasonable — judge the overall impression across all frames, not a
single worst instant. Only fail if the pattern is consistent across the frames, or if a frame
shows something genuinely wrong (blank/corrupted footage, content unrelated to the topic).

Respond with ONLY a JSON object: {"verdict": "pass" | "fail", "notes": string}
"notes" briefly explains the verdict; on a fail, give specific, actionable fix guidance.
Respond with raw JSON only — no markdown code fences, no commentary.`;

export type VideoIntelligenceOutcome = {
  verdict: 'pass' | 'fail';
  rationale: string;
  multimodalRan: boolean;
  llm?: LLMResponse;
};

export async function reviewVideo(params: {
  videoPath: string;
  topic: string;
  scriptText: string;
}): Promise<VideoIntelligenceOutcome> {
  const deterministic = await runDeterministicChecks(params.videoPath);
  if (!deterministic.passed) {
    return { verdict: 'fail', rationale: deterministic.reason, multimodalRan: false };
  }

  const framesBase64 = await extractSampleFramesBase64(params.videoPath, deterministic.meta.durationSeconds);

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
      purpose: 'video-intelligence-own-draft',
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Topic: ${params.topic}\nScript: ${params.scriptText}`,
          attachments: framesBase64.map((dataBase64) => ({ mediaType: 'image/jpeg', dataBase64 })),
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
      `Video Intelligence did not return valid JSON: ${llm.text.slice(0, 200)}`,
      error,
    );
  }

  const result = MultimodalVerdictSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new NonTransientStageError(
      `Video Intelligence output failed schema validation: ${result.error.message}`,
    );
  }

  return { verdict: result.data.verdict, rationale: result.data.notes, multimodalRan: true, llm };
}
