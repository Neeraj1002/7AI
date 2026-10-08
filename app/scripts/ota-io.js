'use strict';
// I/O side of the OTA safety net: computes the current runtime the same way
// `eas update` does, and reads the baseline. Dependency-free (Node built-ins only).
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { compactSources, packageOfPath, lockMismatches } = require('./ota-lib');

const APP_DIR = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(APP_DIR, 'native-baseline.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function installedVersion(name) {
  try {
    return readJson(path.join(APP_DIR, 'node_modules', name, 'package.json')).version;
  } catch {
    return undefined;
  }
}

// `expo-updates runtimeversion:resolve` is the very computation `eas update` uses for the
// "fingerprint" policy, so its hash is the runtime the update would be published to.
function currentFingerprint() {
  const cli = path.join(APP_DIR, 'node_modules', 'expo-updates', 'bin', 'cli.js');
  if (!fs.existsSync(cli)) throw new Error('node_modules is missing: run `npm ci` in app/ first.');
  const stdout = execFileSync(process.execPath, [cli, 'runtimeversion:resolve', '--platform', 'android'], {
    cwd: APP_DIR,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const result = JSON.parse(stdout.slice(stdout.indexOf('{')));
  if (!result.runtimeVersion || !Array.isArray(result.fingerprintSources)) {
    throw new Error('Unexpected output from expo-updates runtimeversion:resolve');
  }
  // Versions of every package that shows up in the sources, plus the direct dependencies:
  // this is what lets a report say "expo-notifications 57.0.21 -> 57.0.22".
  const names = new Set(Object.keys(readJson(path.join(APP_DIR, 'package.json')).dependencies || {}));
  for (const s of result.fingerprintSources) {
    const pkg = s.filePath ? packageOfPath(s.filePath) : null;
    if (pkg) names.add(pkg);
  }
  const installed = {};
  for (const name of [...names].sort()) {
    const v = installedVersion(name);
    if (v) installed[name] = v;
  }
  return { hash: result.runtimeVersion, sources: compactSources(result.fingerprintSources), installed };
}

function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) {
    throw new Error('app/native-baseline.json is missing. Run `npm run native:baseline` right after building an APK.');
  }
  return readJson(BASELINE_PATH);
}

function writeBaseline(current, apk) {
  const baseline = {
    schema: 1,
    note: 'The native runtime of the APK installed on the phone. Rewritten by `npm run native:baseline` right after each APK build.',
    runtimeVersion: current.hash,
    hash: current.hash,
    apk,
    installed: current.installed,
    sources: current.sources,
  };
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
  return baseline;
}

// node_modules vs package-lock.json. A mismatch makes the local runtime differ from the
// build server's (which runs `npm ci`), which is exactly how this problem started.
function installMismatches() {
  const lock = readJson(path.join(APP_DIR, 'package-lock.json'));
  return lockMismatches(lock.packages || {}, installedVersion);
}

function git(args) {
  return execFileSync('git', args, { cwd: APP_DIR, encoding: 'utf8' }).trim();
}

module.exports = { APP_DIR, BASELINE_PATH, currentFingerprint, readBaseline, writeBaseline, installMismatches, git };
