// App tests have no runner of their own; run with the server's vitest:
//   cd studio && npx vitest run --root ../app
import { test, assert } from 'vitest';
import { parseQualityMetrics } from './quality-checks';

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
  assert.strictEqual(r.loudness.value, '−14 LUFS');
  assert.strictEqual(r.truePeak.value, '−1.4 dBTP');
  assert.strictEqual(r.format.value, '1080×1920 · 30 fps');
  assert.strictEqual(r.longestShot.value, '4.9 s');
  assert.strictEqual(r.captions.value, 'Present');
  assert.ok(c.rows.every((x) => x.status === 'ok'));
});

test('run dc2062a2: all clear', () => {
  const c = parseQualityMetrics({ qualityMetrics: clearRun })!;
  assert.deepEqual(c.softWarnings, []);
  assert.strictEqual(byKey(c).loudness.value, '−14.3 LUFS');
  assert.strictEqual(byKey(c).longestShot.value, '3.2 s');
  assert.ok(c.rows.every((x) => x.status === 'ok'));
});

test('no audio is a red failure on loudness', () => {
  const r = byKey(parseQualityMetrics({ qualityMetrics: { ...clearRun, hasAudio: false, integratedLufs: null, truePeakDb: null } })!);
  assert.strictEqual(r.loudness.status, 'fail');
  assert.strictEqual(r.loudness.value, 'No audio');
  assert.strictEqual(r.truePeak.value, '—');
});

test('captions expected but not detected is amber', () => {
  const r = byKey(parseQualityMetrics({ qualityMetrics: { ...clearRun, captionsDetected: false } })!);
  assert.strictEqual(r.captions.status, 'warn');
  assert.strictEqual(r.captions.value, 'Not detected');
});

test('captions not expected stays ok', () => {
  const r = byKey(parseQualityMetrics({ qualityMetrics: { ...clearRun, captionsExpected: false, captionsDetected: null } })!);
  assert.strictEqual(r.captions.status, 'ok');
});

test('absent or malformed qualityMetrics returns null and never throws', () => {
  assert.strictEqual(parseQualityMetrics(null), null);
  assert.strictEqual(parseQualityMetrics(undefined), null);
  assert.strictEqual(parseQualityMetrics({}), null);
  assert.strictEqual(parseQualityMetrics({ qualityMetrics: null }), null);
  assert.strictEqual(parseQualityMetrics({ qualityMetrics: 'x' }), null);
  assert.strictEqual(parseQualityMetrics({ qualityMetrics: [] }), null);
  const sparse = parseQualityMetrics({ qualityMetrics: { softWarnings: 'bad' } })!;
  assert.deepEqual(sparse.softWarnings, []);
});
