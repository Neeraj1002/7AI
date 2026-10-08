'use strict';
// `npm run ota` - publish an OTA update to the preview channel, but only when it can reach the APK.
//   node scripts/ota.js [--dry-run]
// Refuses a dirty tree and a runtime mismatch, then runs `eas update --branch preview --message "<sha> <subject>"`.
const { spawnSync } = require('node:child_process');
const { APP_DIR, git } = require('./ota-io');
const { runCheck } = require('./ota-check');
const { shortHash } = require('./ota-lib');

const dryRun = process.argv.includes('--dry-run');

try {
  // The update is built from the working tree, so anything uncommitted would ship without being in git.
  const dirty = git(['status', '--porcelain', '--', '.']);
  if (dirty) {
    console.error('Refusing to publish: the app/ working tree has uncommitted changes. Commit or discard them first.\n' + dirty);
    process.exit(1);
  }

  const { ok, text, current } = runCheck();
  console.log(text);
  if (!ok) {
    console.error('\nNot publishing.');
    process.exit(1);
  }

  const sha = git(['rev-parse', '--short', 'HEAD']);
  const subject = git(['log', '-1', '--pretty=%s']);
  const message = `${sha} ${subject}`.slice(0, 200);
  console.log(`\nPublishing to runtime ${current.hash} (${shortHash(current.hash)}) on branch "preview": ${message}`);
  if (dryRun) {
    console.log('(dry run: `eas update` not run)');
    process.exit(0);
  }

  const result = spawnSync('npx', ['--yes', 'eas-cli@latest', 'update', '--branch', 'preview', '--message', message], {
    cwd: APP_DIR,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`\nPublished for runtime ${current.hash}. On the phone: Channels -> Account -> App build -> "Check for update".`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
}
