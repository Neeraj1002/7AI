import { runAngleStep } from '../src/story-tests/angle-step';

// Sprint 6 Task 3 PR A: wiring check for the two Part A purposes. Two live runs (a Short, a long video) on neutral
// subjects: valid reply shapes, the cap, the cost per call. Not a judgment of whether the angles are any good.
const CASES = [
  { format: 'short' as const, topic: 'How to read a rental lease before signing', constraints: ['under a minute'] },
  { format: 'long' as const, topic: 'Why bridges do not fall down', constraints: ['about ten minutes', 'no jargon'] },
];

async function main() {
  let total = 0;
  for (const c of CASES) {
    const out = await runAngleStep({
      topic: c.topic, constraints: c.constraints, sourceText: `${c.topic}\n${c.constraints.join('\n')}`, persona: null, format: c.format,
      deps: { meter: async () => undefined, bookFailure: async () => undefined },
    });
    total += out.costUsd;
    console.log(`\n=== ${c.format}: ${c.topic} ===`);
    console.log('status:', out.angleStep.status, out.angleStep.notRunReason ?? '', '| mark:', out.angleStep.mark, '| top:', out.angleStep.readerTopId);
    for (const a of out.angleStep.angles) console.log(`  ${a.id} [${a.title.length}] ${a.title} :: ${a.promise}${a.figureFlag ? '  FLAG: ' + a.figureFlag : ''}`);
    for (const r of out.angleStep.readerRuns) console.log(`  read ${r.run}: shown ${r.order.join(',')} click=${r.clickId} skip=${r.skipId} err=${r.error}\n    +${r.clickWhy}\n    -${r.skipWhy}`);
    for (const k of out.calls) console.log(`  call ${k.purpose} ${k.model} in=${k.inputTokens} out=${k.outputTokens} $${k.costUsd.toFixed(5)} ${k.durationMs}ms`);
    console.log(`  run cost $${out.costUsd.toFixed(5)} (cap $0.10)`);
  }
  console.log(`\nTOTAL $${total.toFixed(5)} (ceiling $1.50)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
