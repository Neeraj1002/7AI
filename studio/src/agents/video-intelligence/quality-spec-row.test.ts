import { describe, it, expect } from 'vitest';
import { durationRow, qualitySpecFor, withQualitySpec } from './quality-metrics';
import { deriveQualityMetrics } from '../../api/routers/runs';
import { LONG_FORM_SPEC, QUALITY_SPEC, SHORT_PROFILE, qualityProfileFor, type QualityMetrics } from '../video-generation/quality-spec';

const metrics: QualityMetrics = {
  integratedLufs: -14,
  truePeakDb: -1.6,
  width: 1920,
  height: 1080,
  fps: 30,
  avgFps: 30,
  videoCodec: 'h264',
  videoProfile: 'High',
  pixFmt: 'yuv420p',
  audioCodec: 'aac',
  audioSampleRate: 48000,
  audioBitrateKbps: 192,
  hasAudio: true,
  longestShotSeconds: 6,
  shotCount: 100,
  captionsExpected: false,
  captionsDetected: null,
  softWarnings: [],
};

const stage = (m: QualityMetrics) =>
  ({ stageName: 'video_review', status: 'completed', attemptNumber: 1, input: { visualSource: 'ai-stills' }, output: { qualityMetrics: m } }) as never;

describe('qualitySpecFor (R6)', () => {
  it('a Short: its own profile numbers, no length window', () => {
    expect(qualitySpecFor(SHORT_PROFILE)).toEqual({
      loudnessLufs: { target: QUALITY_SPEC.loudness.targetLufs, tolerance: QUALITY_SPEC.loudness.toleranceLufs },
      truePeakMaxDb: QUALITY_SPEC.loudness.maxTruePeakDb,
      longestShotMaxSec: QUALITY_SPEC.shot.maxSeconds,
      resolution: { width: 1080, height: 1920 },
      fps: 30,
    });
  });

  it('a long video: landscape profile, shot allowance from seconds per still, 20% length window', () => {
    const spec = qualitySpecFor(qualityProfileFor('long', 5), 600);
    expect(spec.resolution).toEqual({ width: LONG_FORM_SPEC.width, height: LONG_FORM_SPEC.height });
    expect(spec.longestShotMaxSec).toBe(7.5);
    expect(spec.durationSec).toEqual({ target: 600, tolerance: 120 });
    expect(spec.loudnessLufs).toEqual({ target: -14, tolerance: 1 });
  });
});

describe('durationRow (R6)', () => {
  it('is fine inside target +/-20% and warns outside, with a plain message', () => {
    expect(durationRow(600, 600)).toEqual({ warn: false, message: null });
    expect(durationRow(720, 600).warn).toBe(false);
    expect(durationRow(481, 600).warn).toBe(false);
    expect(durationRow(479, 600)).toEqual({ warn: true, message: 'Video is 479s long, target 600s ±120s' });
    expect(durationRow(721, 600).warn).toBe(true);
  });
});

describe('deriveQualityMetrics with spec (R6)', () => {
  const long = qualityProfileFor('long', 5);

  it('a long run gets spec and rows.duration', () => {
    const derived = deriveQualityMetrics([stage({ ...metrics, durationSeconds: 590 })], long, 600);
    expect(derived?.spec?.durationSec).toEqual({ target: 600, tolerance: 120 });
    expect(derived?.rows?.duration).toEqual({ warn: false, message: null });
    expect(derived?.rows?.captions).toBeUndefined();
  });

  it('a long run measured before the length was recorded has spec but no duration row (absent, not false)', () => {
    const derived = deriveQualityMetrics([stage(metrics)], long, 600);
    expect(derived?.spec).toBeDefined();
    expect(derived?.rows?.duration).toBeUndefined();
  });

  it('a Short gets spec but never a duration row or length window', () => {
    const derived = deriveQualityMetrics([stage({ ...metrics, width: 1080, height: 1920, durationSeconds: 44 })]);
    expect(derived?.spec?.resolution).toEqual({ width: 1080, height: 1920 });
    expect(derived?.spec?.durationSec).toBeUndefined();
    expect(derived?.rows?.duration).toBeUndefined();
  });

  it('withQualitySpec leaves the stored metrics fields as they were', () => {
    const out = withQualitySpec(metrics, SHORT_PROFILE);
    expect(out).toMatchObject({ integratedLufs: -14, width: 1920 });
  });
});
