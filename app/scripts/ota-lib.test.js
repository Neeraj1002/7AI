'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { compareFingerprints, formatReport, lockMismatches, packageOfPath, jsonDiffPaths } = require('./ota-lib');

const load = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
const baseline = load('baseline.json');

test('same runtime hash: OTA OK, no changes listed', () => {
  const result = compareFingerprints(baseline, baseline);
  assert.equal(result.same, true);
  assert.deepEqual(result.changes, []);
  const text = formatReport(result, baseline, baseline);
  assert.match(text, /^OTA OK: runtime aaaaaaaa matches the APK built from de9cd170/);
});

test('one package changed: NEEDS A NEW APK and names the package with old and new version', () => {
  const current = load('changed-package.json');
  const result = compareFingerprints(baseline, current);
  assert.equal(result.same, false);
  assert.ok(result.changes.includes('package expo-notifications: 57.0.21 -> 57.0.22'), result.changes.join('\n'));
  const text = formatReport(result, baseline, current);
  assert.match(text, /^NEEDS A NEW APK/);
  assert.match(text, /expo-notifications: 57\.0\.21 -> 57\.0\.22/);
  assert.match(text, /npm run native:baseline/);
});

test('one asset and the app.json version changed: names the file and the config key', () => {
  const current = load('changed-asset.json');
  const result = compareFingerprints(baseline, current);
  assert.equal(result.same, false);
  assert.ok(result.changes.includes('file changed: assets/icon.png'), result.changes.join('\n'));
  assert.ok(result.changes.some((l) => l.startsWith('Expo config (app.json) changed') && l.includes('version')), result.changes.join('\n'));
});

test('a differing hash is never reported as OK even when no single source explains it', () => {
  const current = { ...baseline, hash: 'dddddddd44444444444444444444444444444444' };
  const result = compareFingerprints(baseline, current);
  assert.equal(result.same, false);
  assert.ok(result.changes.length > 0);
});

test('packageOfPath handles plain and scoped packages and ignores other paths', () => {
  assert.equal(packageOfPath('node_modules/expo/android'), 'expo');
  assert.equal(packageOfPath('node_modules/@expo/ui/android'), '@expo/ui');
  assert.equal(packageOfPath('assets/icon.png'), null);
});

test('jsonDiffPaths lists the changed keys', () => {
  assert.deepEqual(jsonDiffPaths({ a: { b: 1, c: 2 } }, { a: { b: 1, c: 3 } }), ['a.c']);
  assert.deepEqual(jsonDiffPaths({ a: 1 }, { a: 1 }), []);
});

test('lockMismatches reports a version drift and a missing package, ignores optional and nested entries', () => {
  const lock = {
    'node_modules/expo': { version: '57.0.25' },
    'node_modules/expo-notifications': { version: '57.0.22' },
    'node_modules/left-pad': { version: '1.0.0' },
    'node_modules/fsevents': { version: '2.3.3', optional: true },
    'node_modules/a/node_modules/b': { version: '9.9.9' },
  };
  const installed = { expo: '57.0.25', 'expo-notifications': '57.0.21' };
  const out = lockMismatches(lock, (n) => installed[n]);
  assert.deepEqual(out, [
    { name: 'expo-notifications', locked: '57.0.22', installed: '57.0.21' },
    { name: 'left-pad', locked: '1.0.0', installed: undefined },
  ]);
});
