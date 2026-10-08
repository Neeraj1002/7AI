'use strict';
// `npm run ota:check` - will an OTA update reach the installed APK?
// Prints OTA OK / NEEDS A NEW APK and exits non-zero on anything but OK.
const { currentFingerprint, readBaseline, installMismatches } = require('./ota-io');
const { compareFingerprints, formatReport } = require('./ota-lib');

function runCheck() {
  const baseline = readBaseline();

  // The build server installs from the lockfile with `npm ci`; a node_modules that drifted from it
  // gives a runtime nobody else would compute. Say so first - it is the usual cause.
  const drift = installMismatches();
  if (drift.length) {
    const shown = drift.slice(0, 12).map((d) => `  - ${d.name}: lockfile ${d.locked}, installed ${d.installed ?? 'missing'}`);
    return {
      ok: false,
      text: [
        'NOT CHECKED: node_modules does not match package-lock.json, so the runtime computed here would not be the one a clean build gets.',
        ...shown,
        drift.length > 12 ? `  ... and ${drift.length - 12} more` : null,
        'Run `npm ci` in app/ and try again. (Never delete package-lock.json to "fix" this: commit any lockfile change that is intended.)',
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  const current = currentFingerprint();
  const result = compareFingerprints(baseline, current);
  return { ok: result.same, text: formatReport(result, baseline, current), current };
}

if (require.main === module) {
  try {
    const { ok, text } = runCheck();
    console.log(text);
    process.exit(ok ? 0 : 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }
}

module.exports = { runCheck };
