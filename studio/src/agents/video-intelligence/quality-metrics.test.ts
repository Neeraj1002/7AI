import { describe, it, expect } from 'vitest';
import {
  collectSoftWarnings,
  formatQualityMetrics,
  hardFailureReason,
  parseEbur128Summary,
  parseFrameRate,
  parseSceneCutTimes,
  summarizeShots,
} from './quality-metrics';
import type { QualityMetrics } from '../video-generation/quality-spec';
import { formatGate2Message } from '../gate2';

const good: QualityMetrics = {
  integratedLufs: -14.1,
  truePeakDb: -1.6,
  width: 1080,
  height: 1920,
  fps: 30,
  avgFps: 29.93,
  videoCodec: 'h264',
  videoProfile: 'High',
  pixFmt: 'yuv420p',
  audioCodec: 'aac',
  audioSampleRate: 48000,
  audioBitrateKbps: 192,
  hasAudio: true,
  longestShotSeconds: 3.2,
  shotCount: 9,
  captionsExpected: true,
  captionsDetected: true,
  softWarnings: [],
};

describe('hardFailureReason (R7: block only on hard failures)', () => {
  it('passes a normal render', () => {
    expect(hardFailureReason(good)).toBeNull();
  });

  it('blocks loudness outside -14 ±3 LUFS (the old ~-25 LUFS render), with a clear reason', () => {
    expect(hardFailureReason({ ...good, integratedLufs: -25.2 })).toMatch(/-25\.2 LUFS.*-14 ±3/);
    expect(hardFailureReason({ ...good, integratedLufs: -10.5 })).toMatch(/outside/);
  });

  it('does not block loudness inside the ±3 band even if outside the ±1 spec target', () => {
    expect(hardFailureReason({ ...good, integratedLufs: -16.5 })).toBeNull();
    expect(collectSoftWarnings({ ...good, integratedLufs: -16.5 }, 'ai-stills').join()).toMatch(/Loudness/);
  });

  it('blocks wrong resolution, wrong fps and missing audio', () => {
    expect(hardFailureReason({ ...good, width: 720, height: 1280 })).toMatch(/resolution/);
    expect(hardFailureReason({ ...good, fps: 25 })).toMatch(/frame rate/);
    expect(hardFailureReason({ ...good, fps: 30, avgFps: 24 })).toMatch(/Variable frame rate/);
    expect(hardFailureReason({ ...good, hasAudio: false })).toMatch(/no audio/i);
  });

  it('tolerates the ~0.2% concat rounding that leaves avg fps at 29.93', () => {
    expect(hardFailureReason({ ...good, fps: 30, avgFps: 29.929742 })).toBeNull();
  });

  it('never blocks on soft metrics (shot length, captions, codec profile)', () => {
    const soft = { ...good, longestShotSeconds: 9, captionsDetected: false, videoProfile: 'Main', truePeakDb: -0.2 };
    expect(hardFailureReason(soft)).toBeNull();
    expect(collectSoftWarnings(soft, 'ai-stills').length).toBeGreaterThanOrEqual(3);
  });
});

describe('parsers', () => {
  it('parses the ebur128 summary (integrated loudness and true peak)', () => {
    const stderr = `[Parsed_ebur128_0] t: 29.9 M: -14.2 S: -14.0 I: -13.9 LUFS LRA: 5.1 LU
[Parsed_ebur128_0 @ 0x1] Summary:

  Integrated loudness:
    I:         -14.1 LUFS
    Threshold: -24.1 LUFS

  Loudness range:
    LRA:         5.0 LU

  True peak:
    Peak:       -1.6 dBFS`;
    expect(parseEbur128Summary(stderr)).toEqual({ integratedLufs: -14.1, truePeakDb: -1.6 });
  });

  it('parses scene-cut times from showinfo output and derives the longest shot', () => {
    const stderr = 'x pts_time:3.5 y\nx pts_time:7.0 y\nx pts_time:9.2 y';
    const cuts = parseSceneCutTimes(stderr);
    expect(cuts).toEqual([3.5, 7, 9.2]);
    expect(summarizeShots(cuts, 12)).toEqual({ longestShotSeconds: 3.5, shotCount: 4 });
  });

  it('a video with no cuts is one shot as long as the video', () => {
    expect(summarizeShots([], 28)).toEqual({ longestShotSeconds: 28, shotCount: 1 });
  });

  it('parses ffprobe frame rates', () => {
    expect(parseFrameRate('30/1')).toBe(30);
    expect(parseFrameRate('30000/1001')).toBeCloseTo(29.97, 2);
    expect(parseFrameRate(undefined)).toBeNull();
  });
});

describe('Gate 2 message shows the numbers', () => {
  it('includes the quality line and notes when qualityMetrics is present', () => {
    const msg = formatGate2Message({
      channelName: 'Ch',
      verdict: 'pass',
      rationale: 'ok',
      qualityMetrics: { ...good, softWarnings: ['Longest single shot is 5.0s (spec: ≤ 4s)'] },
    });
    expect(msg).toContain('Quality: -14.1 LUFS / -1.6 dBTP');
    expect(msg).toContain('1080x1920@30fps');
    expect(msg).toContain('Quality notes: Longest single shot');
  });

  it('is unchanged for a review row without qualityMetrics', () => {
    const msg = formatGate2Message({ channelName: 'Ch', verdict: 'pass', rationale: 'ok' });
    expect(msg).not.toContain('Quality:');
    expect(formatQualityMetrics(good)).toContain('captions detected');
  });
});
