import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runScriptStep } from '../src/story-tests/script-step';
import { PART_B_CAP_USD } from '../src/story-tests/constants';

// Sprint 6 Task 3 Part B wiring check, live: the approved cold-reader and promise-match prompts on three real saved scripts.
// The scripts are read from files, not written here. The "promise" for each is the subject line of that script's own brief
// (a stand-in for a chosen angle's promise, since no Part A run exists for these scripts). No database, no switch.
const ASSETS = join(__dirname, '..', '..', 'docs', 'execution', 'sprint6', 'reports', 'task1-spike-assets', 'after-rating', 'scripts');
const BODY = (name: string) => readFileSync(join(ASSETS, `${name}.txt`), 'utf8').split(/\r?\n\r?\n/).slice(1).join('\n\n').trim();

const CASES = [
  { label: 'eiffel (2-minute video, format short; Gate-1-approved dev run)', file: 'eiffel', format: 'short' as const,
    angle: { title: 'The Eiffel Tower', promise: 'How the Eiffel Tower was built, and why it was not torn down.' } },
  { label: 'lego (2-minute video, format short; real generateScript output, not approved)', file: 'lego', format: 'short' as const,
    angle: { title: 'The Lego recovery', promise: "Lego's recovery from financial crisis to market leader, 2003-2015." } },
  { label: 'mary-celeste (long-form; real generateScript output, not approved)', file: 'mary-celeste', format: 'long' as const,
    angle: { title: 'The Mary Celeste', promise: 'The Mary Celeste, found deserted in the Atlantic in December 1872, and what the record does and does not show.' } },
];

async function main() {
  let total = 0;
  for (const c of CASES) {
    if (total > 0.35) { console.log('stopping: running total near the step budget'); break; }
    const scriptText = BODY(c.file);
    const out = await runScriptStep({ scriptText, format: c.format, persona: null, angle: c.angle, deps: { meter: async () => undefined, bookFailure: async () => undefined } });
    total += out.costUsd;
    console.log(`\n=== ${c.label} | ${scriptText.split(/\s+/).length} words ===`);
    console.log(`status: ${out.status}${out.notRunReason ? ' (' + out.notRunReason + ')' : ''} | verdict: ${out.verdict} | reasons: ${out.reasons.join(', ') || 'none'}`);
    const r = out.reader;
    if (r) {
      const swipe = r.swipe_line.trim();
      const exact = swipe && !/^none\.?$/i.test(swipe) ? scriptText.indexOf(swipe) : null;
      console.log(`about: ${r.about}\nwhy_care: ${r.why_care}\nswipe_line: ${swipe}\n  exact match: ${exact === null ? 'n/a (none)' : exact >= 0 ? 'yes at ' + exact : 'NO'} | swipeAtPercent: ${out.swipeAtPercent}\nremembered: ${r.remembered}\nfirst_sentence: ${r.first_sentence_keeps_me.keeps} - ${r.first_sentence_keeps_me.why}\nweakest: "${r.weakest_sentence.quote}" - ${r.weakest_sentence.why}`);
      const w = r.weakest_sentence.quote.trim();
      console.log(`  weakest quote exact in script: ${scriptText.includes(w)}`);
    }
    console.log(`promise match: ran=${out.promiseMatch.ran} about=${out.promiseMatch.about?.match} remembered=${out.promiseMatch.remembered?.match} | ${out.promiseMatch.note}`);
    for (const k of out.calls) console.log(`  call ${k.purpose} ${k.model} in=${k.inputTokens} out=${k.outputTokens} $${k.costUsd.toFixed(5)} ${k.durationMs}ms`);
    console.log(`  run cost $${out.costUsd.toFixed(5)} (cap $${PART_B_CAP_USD}) | calls: ${out.calls.length}`);
  }
  console.log(`\nTOTAL $${total.toFixed(5)} (step budget $0.50; PR running total before: $0.0215)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
