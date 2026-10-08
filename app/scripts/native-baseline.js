'use strict';
// `npm run native:baseline` - record the native runtime of the APK that is now installed.
// Run it right after every APK build, from the commit the APK was built from, after `npm ci`.
//   node scripts/native-baseline.js [--commit <sha>] [--date <YYYY-MM-DD>] [--build <eas build id>]
const { currentFingerprint, writeBaseline, installMismatches, git } = require('./ota-io');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

try {
  const drift = installMismatches();
  if (drift.length) {
    console.error('node_modules does not match package-lock.json (e.g. ' + drift[0].name + '). Run `npm ci` in app/ first; a baseline from a drifted install would be wrong.');
    process.exit(1);
  }
  const current = currentFingerprint();
  const baseline = writeBaseline(current, {
    gitCommit: arg('commit') || git(['rev-parse', 'HEAD']),
    builtAt: arg('date') || new Date().toISOString().slice(0, 10),
    ...(arg('build') ? { easBuildId: arg('build') } : {}),
  });
  console.log(`Baseline written: runtime ${baseline.hash} for the APK built from ${baseline.apk.gitCommit.slice(0, 8)} (${baseline.apk.builtAt}).`);
  console.log('Commit app/native-baseline.json.');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
}
