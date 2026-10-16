// npx tsx scripts/inspect-run.ts --run <uuid> [--attempt 5]
// Existing credential: INSPECT_RUN_TOKEN, API_AUTH_TOKEN, or INSPECT_RUN_TOKEN_FILE.
// Explicit audited content: --content approved_script | bundle_manifest | production_plan (summary only).
import { writeFile } from 'node:fs/promises';
import { inspectRun, loadInspectCredential, parseInspectArguments, InspectError } from '../src/api/inspect-run-client';

async function main(): Promise<void> {
  const options = parseInspectArguments(process.argv.slice(2));
  const credential = await loadInspectCredential();
  const result = await inspectRun(options, credential);
  const output = JSON.stringify(result); // Same sanitized, byte-capped JSON for console/export.
  if (options.exportFile) await writeFile(options.exportFile, output + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  console.log(output);
  if (result.status.some(s => !s.available)) process.exitCode = 2;
}
main().catch(error => {
  console.error(JSON.stringify({ available: false, code: error instanceof InspectError ? error.code : 'INSPECTION_FAILED_DETAILS_OMITTED' }));
  process.exitCode = 1;
});
