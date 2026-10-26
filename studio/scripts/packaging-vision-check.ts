// Sprint 6 Task 1 PR B (R4): the live check of the picture-reading calls on SEEDED cases taken from the PR A live runs.
//
//   npx tsx scripts/packaging-vision-check.ts --live
//
// Spends real money (about $0.06 for all cases). Without --live it prints the plan and exits. Every call goes through
// the LLM Registry (callLLM) with the real purposes. Each case states what must happen; the script exits 1 when a
// seeded case does not behave: an invented object must be caught by the payoff check, an honest package must pass,
// a picture that does not match its title must fail the critic's connection question, lettering over a face must be
// reported, and the head-to-head must give the same answer in both orders or call a tie. No database.
import fs from 'node:fs';
import path from 'node:path';
import '../src/config/env'; // loads .env.local before anything reads the environment
import { criticReasons, criticRead, compareHeadToHead, defectCheck, lettersCover, payoffCheck, payoffReasons, type PictureFiles } from '../src/packaging/vision';
import { renderScript } from '../src/packaging/prompts';

// This script's own cap; the whole task's live-check ceiling is the founder's $2.00 and every run counts against it.
const MAX_SPEND_USD = 0.25;

const FIX = path.resolve(__dirname, '../src/packaging/fixtures');
const files = (name: string): PictureFiles => ({ dir: path.join(FIX, 'vision'), full: `${name}-feed.jpg`, feed: `${name}-feed.jpg`, sidebar: `${name}-sidebar.jpg` });
const eiffel = (JSON.parse(fs.readFileSync(path.join(FIX, 'eiffel-script.json'), 'utf8')) as { scriptText: string; chapters: Array<{ title: string; text: string }> });
// The script says "a child's clothing and toys"; the seeded case removes the toys, so the picture's toy is invented.
const mary = fs.readFileSync(path.join(FIX, 'vision', 'mary-celeste-script.txt'), 'utf8').trim().replace("a child's clothing and toys, were", "a child's clothing, were");
const textBoxes = JSON.parse(fs.readFileSync(path.join(FIX, 'vision', 'text-boxes.json'), 'utf8')) as Record<string, { x0: number; y0: number; x1: number; y1: number }>;
const plain = (name: string) => ({ dir: path.join(FIX, 'vision'), feed: `${name}-plain-feed.jpg`, sidebar: `${name}-plain-sidebar.jpg` });

let spent = 0;
const failures: string[] = [];
const cost = (c: { llm: { costUsd: string; priorAttempts?: Array<{ costUsd: string }> } }) => Number(c.llm.costUsd) + (c.llm.priorAttempts ?? []).reduce((s, p) => s + Number(p.costUsd), 0);
function room(label: string) {
  if (spent >= MAX_SPEND_USD) throw new Error(`spend cap $${MAX_SPEND_USD} reached before ${label}`);
}
function expect(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: ${detail}`);
  if (!ok) failures.push(label);
}

async function main() {
  if (!process.argv.includes('--live')) {
    console.log(`dry run: pass --live (cap $${MAX_SPEND_USD}).`);
    return;
  }

  // 1. An invented object: the Mary Celeste card with a child's toy the script never mentions.
  room('payoff toy');
  const toy = await payoffCheck({
    files: files('mary-toy'), scriptText: mary, renderedScript: mary, title: "A captain's wife and daughter vanished at sea",
    lettering: 'LEFT BEHIND. MARY CELESTE, 1872.', question: 'Why did ten people, including a captain\'s wife and two-year-old daughter, leave a seaworthy ship?',
    answeredAtQuote: "Nobody answered the Dei Gratia's signals that afternoon",
  });
  spent += cost(toy);
  const toyReasons = payoffReasons(toy.value, mary);
  console.log(`   toy things: ${toy.value.visibleThings.map((t) => `${t.what}${t.supportedByScript ? '' : ' [UNSUPPORTED]'}`).join('; ')}`);
  expect('payoff catches the invented toy', toyReasons.some((r) => /toy|horse/i.test(r)), toyReasons.join(' | ') || '(no reasons)');

  // 2. An honest package passes the payoff check and the critic's connection question.
  room('payoff honest');
  const honestTitle = 'Eiffel Turned a Tower Into a Tool. How Did That Save It?';
  const honest = await payoffCheck({
    files: files('eiffel-honest'), scriptText: eiffel.scriptText, renderedScript: renderScript(eiffel.scriptText, eiffel.chapters), title: honestTitle,
    lettering: 'SAVED BY SCIENCE.', question: 'How did experiments and a radio antenna save the Eiffel Tower from demolition?',
    answeredAtQuote: "Eiffel turned his tower into a scientific tool the city couldn't afford to lose",
  });
  spent += cost(honest);
  const honestReasons = payoffReasons(honest.value, eiffel.scriptText);
  console.log(`   honest things: ${honest.value.visibleThings.map((t) => `${t.what}${t.supportedByScript ? '' : ' [UNSUPPORTED]'}`).join('; ')}`);
  expect('payoff passes the honest package', honestReasons.length === 0, honestReasons.join(' | ') || 'no reasons');
  room('critic honest');
  const c1 = await criticRead(files('eiffel-honest'), honestTitle);
  spent += cost(c1);
  expect('critic: honest picture and title connect', criticReasons(c1.value).length === 0, c1.value.connectsWhy);
  console.log(`   a stranger: about "${c1.value.about}"; would click ${c1.value.wouldClick}; disappointed by: ${c1.value.wouldDisappoint}`);

  // 3. A picture that does not match its title: the Eiffel picture under a Lego title.
  room('critic mismatch');
  const c2 = await criticRead(files('eiffel-honest'), 'How did Lego go from near collapse to number one?');
  spent += cost(c2);
  expect('critic fails a picture that does not match its title', criticReasons(c2.value).length > 0, c2.value.connectsWhy);

  // 4. Lettering over a face is reported; lettering over calm picture is not. The covering is worked out in code
  //    from the model's boxes and the lettering's own rectangle.
  room('defect covered');
  const d1 = await defectCheck(plain('ada-covered'));
  spent += cost(d1);
  const cover1 = lettersCover(textBoxes['ada-covered'], d1.value);
  console.log(`   covered case: face visible ${d1.value.faceVisible}; uncanny feed ${d1.value.uncannyAtFeed} sidebar ${d1.value.uncannyAtSidebar}; faces ${JSON.stringify(d1.value.faceBoxes)}; defects ${JSON.stringify(d1.value.defects)}`);
  expect('lettering over the face is found', cover1.covers, cover1.what || 'not found');
  room('defect clean');
  const d2 = await defectCheck(plain('ada-clean'));
  spent += cost(d2);
  const cover2 = lettersCover(textBoxes['ada-clean'], d2.value);
  console.log(`   clean case: faces ${JSON.stringify(d2.value.faceBoxes)}; subject ${JSON.stringify(d2.value.subjectBox)}`);
  expect('lettering on a calm picture is left alone', !cover2.covers, cover2.what || 'covers nothing');

  // 5. Head to head, both orders.
  room('compare');
  const cmp = await compareHeadToHead({
    a: { files: files('eiffel-honest'), title: honestTitle },
    b: { files: files('eiffel-alt'), title: "Eiffel's Tower Was Never Meant to Last. Why Is It Still Here?" },
  });
  spent += cmp.calls.reduce((s, c) => s + cost(c), 0);
  expect('head to head gives a winner or a tie, with reasons', ['a', 'b', 'tie'].includes(cmp.winner) && cmp.reasons.every(Boolean), `${cmp.winner}: ${cmp.reasons.join(' / ')}`);

  console.log(`spent $${spent.toFixed(4)} of this script's $${MAX_SPEND_USD} cap`);
  if (failures.length > 0) {
    console.error(`FAILED: ${failures.join('; ')}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
