// Bugs (chapter bounds) real check, on dev. One live Script Generation call for a long-form brief that
// lists its chapter titles, to see that the model is told the exact count and returns those chapters.
//   npx tsx scripts/chapter-bounds-real-check.ts --brief <file> [--seconds 600]            (offline: intake check and prompt only)
//   npx tsx scripts/chapter-bounds-real-check.ts --brief <file> [--seconds 600] --live     (one real call, about 10 cents)
//   --spent-before <usd>  what the task has already spent, only added to the total this prints. Nothing stops a call part-way:
//                         Script Generation makes up to three (one reply and two length repairs), about 5 to 7 cents each.
//
// The brief file is the founder's brief text as typed into the app. It never touches the database.
// It spends real money only with --live, and refuses to start when the cost estimate is over the ceiling.
import { readFileSync } from 'node:fs';
import { generateScript, buildUserMessage } from '../src/agents/script-generation';
import { buildLongSystemPrompt } from '../src/agents/script-generation/long-form';
import { checkBriefChapterPlan } from '../src/long-form/brief-chapter-plan';
import { estimateRunCost } from '../src/run-pipeline/cost-estimate';

const CEILING_USD = 0.3;

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const briefPath = arg('--brief');
if (!briefPath) throw new Error('Pass --brief <file> with the brief text.');
const targetSeconds = Number(arg('--seconds') ?? 600);
const live = process.argv.includes('--live');
const spentBefore = Number(arg('--spent-before') ?? 0);

async function main() {
  const briefText = readFileSync(briefPath!, 'utf8').replace(/\r\n/g, '\n').trim();

  const intake = checkBriefChapterPlan(briefText, targetSeconds);
  console.log('Intake check:', JSON.stringify(intake.ok ? { ok: true, bounds: intake.bounds, warnings: intake.warnings } : intake, null, 2));
  if (!intake.ok) return;

  const params = {
    topic: briefText.split('\n').find((l) => l.startsWith('Topic:'))?.replace(/^Topic:\s*/, '') ?? 'the brief',
    constraints: briefText
      .split('\n')
      .filter((l) => l.startsWith('Constraint:'))
      .map((l) => l.replace(/^Constraint:\s*/, '')),
    briefText,
    factPolicy: 'brief-only' as const,
    targetSeconds,
    videoKind: 'long' as const,
  };
  console.log('\nSystem prompt, structure and word rules:');
  console.log(buildLongSystemPrompt(false, intake.bounds).split('\n').filter((l) => /^- (Structure|Word Count)/.test(l)).join('\n'));
  console.log(`\nUser message is ${buildUserMessage(params).length} characters.`);

  const estimate = estimateRunCost({ videoKind: 'long', targetSeconds }).breakdown.llmUsd;
  console.log(`Rough LLM cost for the whole pipeline's text steps: $${estimate.toFixed(4)} (this check makes only the script call).`);
  if (!live) {
    console.log('\nOffline only: pass --live to make the one real call.');
    return;
  }
  if (estimate > CEILING_USD) throw new Error(`Estimate $${estimate} is over the $${CEILING_USD} ceiling; not calling.`);

  const { output, calls } = await generateScript(params);
  const spent = calls.reduce((sum, c) => sum + Number(c.costUsd), 0);
  console.log(`\nCalls: ${calls.length}  spent: $${spent.toFixed(4)} (ceiling $${CEILING_USD})`);
  for (const [i, c] of calls.entries()) {
    console.log(`  call ${i + 1}: model=${c.model} outputTokens=${c.usage.outputTokens}/${c.maxOutputTokens} stop=${c.stopReason} cost=$${c.costUsd}`);
  }
  console.log(`\nChapters returned: ${output.chapters?.length}`);
  const wanted = intake.bounds.titles;
  for (const [i, c] of (output.chapters ?? []).entries()) {
    const words = c.text.split(/\s+/).filter(Boolean).length;
    const match = wanted ? (wanted[i] === c.title ? 'title matches' : `TITLE DIFFERS (brief: ${wanted[i] ?? 'none'})`) : '';
    console.log(`  ${i + 1}. ${c.title}  (${words} words) ${match}`);
  }
  console.log(`Total words: ${output.scriptText.split(/\s+/).filter(Boolean).length}  lengthOutOfRange: ${output.lengthOutOfRange ?? false}`);
  if (spentBefore + spent > CEILING_USD) console.log(`OVER THE CEILING: $${(spentBefore + spent).toFixed(4)} > $${CEILING_USD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
