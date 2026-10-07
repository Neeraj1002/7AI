// Run: node --test lib/quality-checks.test.ts   (the app has no test runner; this needs no dependency)
import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error node's type stripping needs the .ts extension; the app tsconfig does not allow it
import { parseQualityMetrics } from './quality-checks.ts';

const warnRun = {
  fps: 30, width: 1080, avgFps: 30, height: 1920, pixFmt: 'yuv420p', hasAudio: true, shotCount: 16,
  audioCodec: 'aac', truePeakDb: -1.4, videoCodec: 'h264', softWarnings: ['Longest single shot is 4.9s (spec: ≤ 4s)'],
  videoProfile: 'High', integratedLufs: -14, audioSampleRate: 48000, audioBitrateKbps: 193,
  captionsDetected: true, captionsExpected: true, longestShotSeconds: 4.9,
};
const clearRun = { ...warnRun, shotCount: 17, truePeakDb: -1.3, softWarnings: [], integratedLufs: -14.3, longestShotSeconds: 3.23 };

const byKey = (c: NonNullable<ReturnType<typeof parseQualityMetrics>>) => Object.fromEntries(c.rows.map((r) => [r.key, r]));

test('run 75f69faa: one soft warning, passed through verbatim, no row coloured by it', () => {
  const c = parseQualityMetrics({ qualityMetrics: warnRun })!;
  assert.deepEqual(c.softWarnings, ['Longest single shot is 4.9s (spec: ≤ 4s)']);
  const r = byKey(c);
  assert.equal(r.loudness.value, '-14 LUFS');
  assert.equal(r.truePeak.value, '-1.4 dBTP');
  assert.equal(r.format.value, '1080×1920 · 30 fps');
  assert.equal(r.longestShot.value, '4.9 s');
  assert.equal(r.captions.value, 'Present');
  assert.ok(c.rows.every((x) => x.status === 'ok'));
});

test('run dc2062a2: all clear', () => {
  const c = parseQualityMetrics({ qualityMetrics: clearRun })!;
  assert.deepEqual(c.softWarnings, []);
  assert.equal(byKey(c).loudness.value, '-14.3 LUFS');
  assert.equal(byKey(c).longestShot.value, '3.2 s');
  assert.ok(c.rows.every((x) => x.status === 'ok'));
});

test('no audio is a red failure on loudness', () => {
  const r = byKey(parseQualityMetrics({ qualityMetrics: { ...clearRun, hasAudio: false, integratedLufs: null, truePeakDb: null } })!);
  assert.equal(r.loudness.status, 'fail');
  assert.equal(r.loudness.value, 'No audio');
  assert.equal(r.truePeak.value, '—');
});

test('captions expected but not detected is amber', () => {
  const r = byKey(parseQualityMetrics({ qualityMetrics: { ...clearRun, captionsDetected: false } })!);
  assert.equal(r.captions.status, 'warn');
  assert.equal(r.captions.value, 'Not detected');
});

test('captions not expected stays ok', () => {
  const r = byKey(parseQualityMetrics({ qualityMetrics: { ...clearRun, captionsExpected: false, captionsDetected: null } })!);
  assert.equal(r.captions.status, 'ok');
});

test('absent or malformed qualityMetrics returns null and never throws', () => {
  assert.equal(parseQualityMetrics(null), null);
  assert.equal(parseQualityMetrics(undefined), null);
  assert.equal(parseQualityMetrics({}), null);
  assert.equal(parseQualityMetrics({ qualityMetrics: null }), null);
  assert.equal(parseQualityMetrics({ qualityMetrics: 'x' }), null);
  assert.equal(parseQualityMetrics({ qualityMetrics: [] }), null);
  const sparse = parseQualityMetrics({ qualityMetrics: { softWarnings: 'bad' } })!;
  assert.deepEqual(sparse.softWarnings, []);
});
