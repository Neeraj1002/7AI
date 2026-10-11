// App tests have no runner of their own; run with the server's vitest:
//   cd studio && npx vitest run --root ../app
import { test, assert } from 'vitest';
import { parseQualityMetrics } from './quality-checks';

const ok = { warn: false, message: null };
const base = {
  fps: 30, width: 1080, avgFps: 30, height: 1920, pixFmt: 'yuv420p', hasAudio: true, shotCount: 16,
  audioCodec: 'aac', truePeakDb: -1.4, videoCodec: 'h264', videoProfile: 'High', integratedLufs: -14,
  audioSampleRate: 48000, audioBitrateKbps: 193, captionsDetected: true, captionsExpected: true, longestShotSeconds: 4.9,
};
// Real run 75f69faa-… : the longest shot is over spec, so the server flags that row.
const warnRun = {
  ...base,
  softWarnings: ['Longest single shot is 4.9s (spec: ≤ 4s)'],
  rows: {
    loudness: ok, truePeak: ok, longestShot: { warn: true, message: 'Longest single shot is 4.9s (spec: ≤ 4s)' }, captions: ok,
  },
};
// Real run dc2062a2-… : all clear.
const clearRun = {
  ...base, shotCount: 17, truePeakDb: -1.3, integratedLufs: -14.3, longestShotSeconds: 3.23, softWarnings: [],
  rows: { loudness: ok, truePeak: ok, longestShot: ok, captions: ok },
};

const byKey = (c: NonNullable<ReturnType<typeof parseQualityMetrics>>) => Object.fromEntries(c.rows.map((r) => [r.key, r]));

test('run 75f69faa: longest shot is amber from rows.longestShot.warn, message carried, others green', () => {
  const r = byKey(parseQualityMetrics(warnRun)!);
  assert.strictEqual(r.longestShot.status, 'warn');
  assert.strictEqual(r.longestShot.value, '4.9 s');
  assert.strictEqual(r.longestShot.message, 'Longest single shot is 4.9s (spec: ≤ 4s)');
  assert.strictEqual(r.loudness.value, '−14 LUFS');
  assert.strictEqual(r.truePeak.value, '−1.4 dBTP');
  assert.strictEqual(r.format.value, '1080×1920 · 30 fps');
  assert.strictEqual(r.captions.value, 'Present');
  for (const k of ['loudness', 'truePeak', 'format', 'captions']) assert.strictEqual(r[k].status, 'ok');
});

test('run dc2062a2: all clear', () => {
  const c = parseQualityMetrics(clearRun)!;
  assert.strictEqual(c.rows.length, 5);
  assert.ok(c.rows.every((x) => x.status === 'ok' && x.message === null));
  assert.strictEqual(byKey(c).loudness.value, '−14.3 LUFS');
  assert.strictEqual(byKey(c).longestShot.value, '3.2 s');
});

test('a warn flag on any row colours that row, whatever its text says', () => {
  const r = byKey(parseQualityMetrics({ ...clearRun, rows: { ...clearRun.rows, loudness: { warn: true, message: 'x' }, captions: { warn: true, message: null } } })!);
  assert.strictEqual(r.loudness.status, 'warn');
  assert.strictEqual(r.captions.status, 'warn');
  assert.strictEqual(r.captions.value, 'Present'); // value is data; only `warn` sets the colour
  assert.strictEqual(r.captions.message, null);
});

test('an absent row is hidden (not applicable)', () => {
  const c = parseQualityMetrics({ ...clearRun, captionsExpected: false, rows: { loudness: ok, truePeak: ok, longestShot: ok } })!;
  assert.deepEqual(c.rows.map((x) => x.key), ['loudness', 'truePeak', 'format', 'longestShot']);
});

test('no audio is a red failure and hides true peak', () => {
  const c = parseQualityMetrics({ ...clearRun, hasAudio: false, integratedLufs: null, truePeakDb: null })!;
  const r = byKey(c);
  assert.strictEqual(r.loudness.status, 'fail');
  assert.strictEqual(r.loudness.value, 'No audio');
  assert.isUndefined(r.truePeak);
});

test('metrics without `rows` show only what needs no server flag and never throw', () => {
  const c = parseQualityMetrics({ ...base, softWarnings: [] })!;
  assert.deepEqual(c.rows.map((x) => x.key), ['format']);
});

test('absent or malformed metrics return null', () => {
  assert.strictEqual(parseQualityMetrics(null), null);
  assert.strictEqual(parseQualityMetrics(undefined), null);
  assert.strictEqual(parseQualityMetrics('x'), null);
  assert.strictEqual(parseQualityMetrics([]), null);
  assert.strictEqual(parseQualityMetrics({}), null);
});
