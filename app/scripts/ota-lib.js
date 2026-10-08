'use strict';
// Pure helpers for the OTA safety net (no I/O here, so they are unit-tested directly).
//
// Background: app.json uses runtimeVersion.policy = "fingerprint". The runtime an
// OTA update targets is a hash of everything that affects the native build. The
// phone only accepts an update whose runtime equals the one baked into its APK.
// These helpers compare the fingerprint of the current checkout with the baseline
// recorded when the installed APK was built, and say in plain words what moved.

// One comparable key per fingerprint source.
function sourceKey(source) {
  return source.type === 'contents' ? `contents:${source.id}` : `${source.type}:${source.filePath}`;
}

// Compact the sources of a runtimeversion:resolve / fingerprint:generate result for
// storing in the baseline. Only the two small `contents` sources whose text helps a
// human read a diff are kept in full.
const KEEP_CONTENTS = new Set(['expoConfig', 'packageJson:scripts']);
function compactSources(sources) {
  return sources.map((s) => ({
    key: sourceKey(s),
    hash: s.hash,
    reasons: s.reasons || [],
    ...(s.type === 'contents' && KEEP_CONTENTS.has(s.id) && typeof s.contents === 'string' ? { contents: s.contents } : {}),
  }));
}

// "node_modules/@expo/ui/android" -> "@expo/ui"; "node_modules/expo/x" -> "expo"; else null.
function packageOfPath(filePath) {
  const m = /^node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(filePath.replace(/\\/g, '/'));
  return m ? m[1] : null;
}

// Every key at which two parsed JSON values differ, as dotted paths.
function jsonDiffPaths(a, b, prefix = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  if (!isObj(a) || !isObj(b)) return [prefix || '(root)'];
  const out = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    out.push(...jsonDiffPaths(a[k], b[k], prefix ? `${prefix}.${k}` : k));
  }
  return out;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// Compare a baseline with the current state. Both: { hash, sources: [{key, hash, contents?}], installed: {pkg: version} }.
// Returns { same, changes: string[] }. `same` is decided by the runtime hash alone, because that is
// exactly what the phone compares; `changes` only explains.
function compareFingerprints(baseline, current) {
  if (baseline.hash === current.hash) return { same: true, changes: [] };

  const changes = [];
  const base = new Map(baseline.sources.map((s) => [s.key, s]));
  const cur = new Map(current.sources.map((s) => [s.key, s]));

  // Packages whose installed version differs - the readable explanation for most native changes.
  const baseInstalled = baseline.installed || {};
  const curInstalled = current.installed || {};
  const versionChanges = [];
  for (const name of [...new Set([...Object.keys(baseInstalled), ...Object.keys(curInstalled)])].sort()) {
    if (baseInstalled[name] !== curInstalled[name]) {
      versionChanges.push(`package ${name}: ${baseInstalled[name] ?? 'not installed'} -> ${curInstalled[name] ?? 'not installed'}`);
    }
  }
  const namedPackages = new Set();
  let unexplainedAutolinking = false;

  for (const key of [...new Set([...base.keys(), ...cur.keys()])].sort()) {
    const b = base.get(key);
    const c = cur.get(key);
    if (b && c && b.hash === c.hash) continue;

    const filePath = key.includes(':') ? key.slice(key.indexOf(':') + 1) : key;
    const pkg = key.startsWith('contents:') ? null : packageOfPath(filePath);
    if (pkg) {
      namedPackages.add(pkg);
      continue;
    }
    if (!b) {
      changes.push(`new native source: ${key}`);
    } else if (!c) {
      changes.push(`native source removed: ${key}`);
    } else if (key === 'contents:expoConfig') {
      const paths = b.contents && c.contents ? jsonDiffPaths(parseJson(b.contents), parseJson(c.contents)) : [];
      changes.push(`Expo config (app.json) changed${paths.length ? `: ${paths.join(', ')}` : ''}`);
    } else if (key === 'contents:packageJson:scripts') {
      changes.push(
        'the "scripts" in app/package.json changed (every script except android/ios counts toward the runtime; move new commands out of it)',
      );
    } else if (key.startsWith('contents:expoAutolinking') || key.startsWith('contents:rncoreAutolinking') || key.startsWith('contents:package:')) {
      unexplainedAutolinking = true;
    } else if (key.startsWith('file:')) {
      changes.push(`file changed: ${filePath}`);
    } else {
      changes.push(`native source changed: ${key}`);
    }
  }

  // Package changes first (the usual cause), then the rest.
  const lines = [];
  if (versionChanges.length) lines.push(...versionChanges);
  for (const pkg of [...namedPackages].sort()) {
    if (!versionChanges.some((l) => l.startsWith(`package ${pkg}:`))) lines.push(`package ${pkg}: files changed (same version number)`);
  }
  if (unexplainedAutolinking && !versionChanges.length && !namedPackages.size) {
    lines.push('native dependency set or autolinking config changed (compare node_modules with package-lock.json)');
  }
  lines.push(...changes);
  if (!lines.length) lines.push('the runtime hash differs but no single source explains it (regenerate the baseline and compare)');
  return { same: false, changes: lines };
}

function shortHash(h) {
  return String(h).slice(0, 8);
}

// The plain-language result printed by `npm run ota:check`.
function formatReport(result, baseline, current) {
  const apk = baseline.apk || {};
  const built = `${apk.gitCommit ? shortHash(apk.gitCommit) : 'unknown commit'}${apk.builtAt ? `, ${apk.builtAt}` : ''}`;
  if (result.same) {
    return `OTA OK: runtime ${shortHash(current.hash)} matches the APK built from ${built}`;
  }
  return [
    `NEEDS A NEW APK: the runtime would be ${shortHash(current.hash)} but the installed APK (built from ${built}) is ${shortHash(baseline.hash)}.`,
    'An OTA update would be ignored by the phone. These sources changed:',
    ...result.changes.map((l) => `  - ${l}`),
    'If a change above is not intended, undo it (e.g. run `npm ci`, restore the file). If it is intended, build a new APK, install it, then run `npm run native:baseline`.',
  ].join('\n');
}

// Lock vs node_modules: [{name, locked, installed}] for top-level packages that differ.
// `lockPackages` is package-lock.json's `packages` object; `readInstalledVersion(name)` returns a version or undefined.
function lockMismatches(lockPackages, readInstalledVersion) {
  const out = [];
  for (const [path, entry] of Object.entries(lockPackages)) {
    const m = /^node_modules\/((?:@[^/]+\/)?[^/]+)$/.exec(path);
    if (!m || !entry.version || entry.link) continue;
    const installed = readInstalledVersion(m[1]);
    if (installed === undefined) {
      if (!entry.optional && !entry.peer) out.push({ name: m[1], locked: entry.version, installed: undefined });
    } else if (installed !== entry.version) {
      out.push({ name: m[1], locked: entry.version, installed });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = {
  sourceKey,
  compactSources,
  packageOfPath,
  jsonDiffPaths,
  compareFingerprints,
  formatReport,
  lockMismatches,
  shortHash,
};
