// Sprint 6 Task 1 spike: can our current image generator and prompting make thumbnails a stranger clicks?
//
//   cd studio
//   npx tsx scripts/spikes/packaging/spike.ts                       # STUB: no provider calls, no spend
//   npx tsx scripts/spikes/packaging/spike.ts --live                # LIVE, all stages, ceiling $3.00
//   npx tsx scripts/spikes/packaging/spike.ts --live --stages scripts,packages,prune
//   npx tsx scripts/spikes/packaging/spike.ts --live --publish      # copy the finished assets into the report folder
//
// Stages, in order: scripts, packages, prune, render, letter, critic, sheet. Each reads the previous stage's JSON
// from scripts/spikes/packaging/out/<stub|live>/, and paid replies are cached, so a re-run costs nothing.
// Dev database and dev keys only (studio/.env.local); this script never writes to the database.
import { LIVE, OUT, SPEND_CEILING_USD, SpendCeilingError, ledger } from './common';
import { stageScripts, stagePackages, stagePrune, stageRender } from './stages';
import { stageLetter } from './lettering';
import { stageCritic } from './critic';
import { stageSheet } from './sheet';
import { publish } from './publish';

const STAGES = {
  scripts: stageScripts,
  packages: stagePackages,
  prune: stagePrune,
  render: stageRender,
  letter: stageLetter,
  critic: stageCritic,
  sheet: stageSheet,
} as const;

async function main() {
  const arg = process.argv.find((a, i, all) => all[i - 1] === '--stages');
  const names = (arg ? arg.split(',') : Object.keys(STAGES)) as Array<keyof typeof STAGES>;
  console.log(`mode=${LIVE ? 'LIVE' : 'STUB (no spend)'} out=${OUT} ceiling=$${SPEND_CEILING_USD.toFixed(2)} spentSoFar=$${ledger.total().toFixed(4)}`);
  for (const name of names) {
    if (!STAGES[name]) throw new Error(`unknown stage ${name}`);
    const before = ledger.total();
    const result = await STAGES[name]();
    console.log(`stage ${name}: ok (${Array.isArray(result) ? result.length : 1} items, +$${(ledger.total() - before).toFixed(4)})`);
  }
  if (process.argv.includes('--publish')) await publish();
  console.log(`total spent: $${ledger.total().toFixed(4)} of $${SPEND_CEILING_USD.toFixed(2)}`, JSON.stringify(ledger.byPrefix()));
}

main().catch((error) => {
  if (error instanceof SpendCeilingError) {
    console.error(`STOPPED AT CEILING: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
