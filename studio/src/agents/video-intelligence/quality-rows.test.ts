import { describe, it, expect } from 'vitest';
import { collectSoftWarnings, evaluateQualityRows, withQualityRows } from './quality-metrics';
import { deriveQualityMetrics } from '../../api/routers/runs';
import { QUALITY_ROW_KEYS, type QualityMetrics } from '../video-generation/quality-spec';

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

describe('evaluateQualityRows', () => {
  it('a clean ai-stills render has every applicable row present with warn:false and no message', () => {
    const rows = evaluateQualityRows(good, 'ai-stills');
    expect(Object.keys(rows).sort()).toEqual(
      ['loudness', 'truePeak', 'videoCodec', 'videoProfile', 'pixelFormat', 'audioSampleRate', 'audioBitrate', 'longestShot', 'captions'].sort(),
    );
    for (const row of Object.values(rows)) expect(row).toEqual({ warn: false, message: null });
    expect(rows.shotCount).toBeUndefined(); // stock-only row is absent, not false
  });

  it('flags exactly the rows that missed, each with its message', () => {
    const rows = evaluateQualityRows(
      { ...good, integratedLufs: -16.5, truePeakDb: -0.2, longestShotSeconds: 5, audioBitrateKbps: 152, captionsDetected: false },
      'ai-stills',
    );
    expect(rows.loudness).toEqual({ warn: true, message: 'Loudness -16.5 LUFS is outside -14 ±1' });
    expect(rows.truePeak?.warn).toBe(true);
    expect(rows.longestShot).toEqual({ warn: true, message: 'Longest single shot is 5.0s (spec: ≤ 4s)' });
    expect(rows.audioBitrate?.warn).toBe(true);
    expect(rows.captions?.warn).toBe(true);
    expect(rows.videoCodec?.warn).toBe(false);
    expect(rows.pixelFormat?.warn).toBe(false);
  });

  it('boundary values use the existing thresholds (inclusive tolerance, no new ones)', () => {
    expect(evaluateQualityRows({ ...good, integratedLufs: -15 }, 'ai-stills').loudness?.warn).toBe(false);
    expect(evaluateQualityRows({ ...good, integratedLufs: -15.01 }, 'ai-stills').loudness?.warn).toBe(true);
    expect(evaluateQualityRows({ ...good, longestShotSeconds: 4 }, 'ai-stills').longestShot?.warn).toBe(false);
    expect(evaluateQualityRows({ ...good, longestShotSeconds: 4.01 }, 'ai-stills').longestShot?.warn).toBe(true);
    expect(evaluateQualityRows({ ...good, audioBitrateKbps: 160 }, 'ai-stills').audioBitrate?.warn).toBe(false);
  });

  it('stock footage: shotCount row replaces longestShot', () => {
    expect(evaluateQualityRows({ ...good, shotCount: 2 }, 'stock-footage').shotCount).toEqual({
      warn: true,
      message: 'Only 2 distinct shot(s) detected in a stock-footage video (spec: a cut per beat)',
    });
    expect(evaluateQualityRows({ ...good, shotCount: 3 }, 'stock-footage').shotCount?.warn).toBe(false);
    expect(evaluateQualityRows(good, 'stock-footage').longestShot).toBeUndefined();
  });

  it('rows that could not be evaluated are absent, never warn:false', () => {
    const rows = evaluateQualityRows(
      { ...good, integratedLufs: null, truePeakDb: null, videoProfile: null, captionsDetected: null },
      'ai-stills',
    );
    expect(rows.loudness).toBeUndefined();
    expect(rows.truePeak).toBeUndefined();
    expect(rows.videoProfile).toBeUndefined();
    expect(rows.captions).toBeUndefined();
    expect(evaluateQualityRows({ ...good, captionsExpected: false, captionsDetected: null }, 'ai-stills').captions).toBeUndefined();
    expect(evaluateQualityRows(good, undefined).longestShot).toBeUndefined();
  });

  it('softWarnings text and the row flags can never disagree', () => {
    const m = { ...good, integratedLufs: -17, truePeakDb: -0.5, videoProfile: 'Main', longestShotSeconds: 6, captionsDetected: false };
    const rows = evaluateQualityRows(m, 'ai-stills');
    const flagged = QUALITY_ROW_KEYS.flatMap((k) => (rows[k]?.warn ? [rows[k]!.message] : []));
    expect(collectSoftWarnings(m, 'ai-stills')).toEqual(flagged);
    expect(flagged.length).toBe(5);
  });
});

describe('withQualityRows / runs.get qualityMetrics (older runs)', () => {
  const stage = (attemptNumber: number, qualityMetrics: unknown, visualSource: string | undefined, status = 'completed') =>
    ({ stageName: 'video_review', status, attemptNumber, input: visualSource ? { visualSource } : {}, output: qualityMetrics ? { qualityMetrics } : { verdict: 'pass' } }) as never;

  it('keeps rows that are already stored', () => {
    const stored = { ...good, rows: { loudness: { warn: true, message: 'stored' } } };
    expect(withQualityRows(stored, 'ai-stills')).toBe(stored);
  });

  it('derives rows for an older run that has metrics but no rows', () => {
    const old = { ...good, integratedLufs: -17, softWarnings: ['Loudness -17.0 LUFS is outside -14 ±1'] };
    const derived = deriveQualityMetrics([stage(1, old, 'ai-stills')]);
    expect(derived?.rows?.loudness).toEqual({ warn: true, message: 'Loudness -17.0 LUFS is outside -14 ±1' });
    expect(derived?.rows?.videoCodec).toEqual({ warn: false, message: null });
  });

  it('without a known visual source the shot rows are absent, others still derived', () => {
    const derived = deriveQualityMetrics([stage(1, good, undefined)]);
    expect(derived?.rows?.longestShot).toBeUndefined();
    expect(derived?.rows?.shotCount).toBeUndefined();
    expect(derived?.rows?.loudness).toEqual({ warn: false, message: null });
  });

  it('metrics too incomplete to evaluate come back without rows (absent, not false)', () => {
    const empty = { ...good, integratedLufs: null, truePeakDb: null, videoCodec: null, videoProfile: null, pixFmt: null, audioSampleRate: null, audioBitrateKbps: null, longestShotSeconds: null, shotCount: null, captionsDetected: null };
    expect(deriveQualityMetrics([stage(1, empty, 'ai-stills')])?.rows).toBeUndefined();
  });

  it('a run with no measured metrics, or no video_review at all, returns null', () => {
    expect(deriveQualityMetrics([stage(1, undefined, 'ai-stills')])).toBeNull();
    expect(deriveQualityMetrics([])).toBeNull();
    expect(deriveQualityMetrics([stage(1, good, 'ai-stills', 'running')])).toBeNull();
  });

  it('uses the latest completed attempt', () => {
    const first = { ...good, integratedLufs: -20 };
    const second = { ...good, integratedLufs: -14 };
    expect(deriveQualityMetrics([stage(1, first, 'ai-stills'), stage(2, second, 'ai-stills')])?.rows?.loudness?.warn).toBe(false);
  });
});
