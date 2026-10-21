// Sprint 5 Task 8: the budgeted real-model checks (ceiling $2 in total, no database, no publish).
//   R9   Sonnet 5.5 is accepted by the API; one long script on 5.5 against 5.
//   R6   picture prompts for the Lego brief, before and after the no-marks rule, with the picture check.
//   R10A voice samples: tts-1-hd coral, gpt-4o-mini-tts ballad and marin (no ElevenLabs key is configured).
// Usage: npx tsx scripts/task8-acceptance.ts [r9] [r6] [r10]   (default: all). Writes to
// docs/execution/sprint5/reports/task8-assets/.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import OpenAI from 'openai';
import { env } from '../src/config/env';
import { STUDIO_ROOT } from '../src/config/paths';
import { callLLM, resolvePricing } from '../src/llm';
import { LLM_REGISTRY } from '../src/llm/registry';
import { generateScript } from '../src/agents/script-generation';
import { countWords } from '../src/agents/script-generation/long-form';
import { planLongVideoProduction } from '../src/agents/video-generation/plan-long';
import { generateStills } from '../src/ai-visuals';
import { STILL_SIZE_LANDSCAPE } from '../src/ai-visuals/sizes';
import { buildStyledScenePrompts } from '../src/agents/video-generation/scene-prompts';
import { checkStills, strongerPrompt, type StillIssue } from '../src/agents/video-generation/still-check';
import { forecastLength } from '../src/run-pipeline/length-forecast';

const exec = promisify(execFile);
const OUT = path.resolve(STUDIO_ROOT, '..', 'docs', 'execution', 'sprint5', 'reports', 'task8-assets');
const CEILING_USD = 1.6;
let spent = 0;
const ledger: Array<{ what: string; usd: number }> = [];
function book(what: string, usd: number) {
  spent += usd;
  ledger.push({ what, usd: Number(usd.toFixed(5)) });
  if (spent > CEILING_USD) throw new Error(`Budget ceiling $${CEILING_USD} reached ($${spent.toFixed(3)}), stopping`);
}

const BRIEF =
  "Lego's recovery from financial crisis to market leader, 2003-2015. Allowed facts and nothing else: in 2003 a shortfall of about 1.4 billion Danish kroner, roughly 220 million dollars; in 2004 almost a thousand workers laid off and the owner put about 800 million kroner of his own money in; instead of chasing growth it went back to basics; in 2005 it sold its four Legoland theme parks for 375 million euros, to focus on its core toys; ten years later, in the first half of 2015, it outsold Mattel, 2.1 billion dollars against 1.9 billion, becoming the world's biggest toy company by sales. First sentence exactly: In 2003, Lego was losing money fast. Last sentence exactly: Lego won by going back to the brick. Each chapter opens with a question. Hedge words: about, roughly, almost, by sales. No logos or brand lettering in pictures.";

// A control script made only from the allowed facts (the founder's edited script is not in the repository).
const CHAPTERS = [
  {
    title: 'The crisis',
    text: "How bad was it? In 2003, Lego was losing money fast. The company faced a shortfall of about 1.4 billion Danish kroner, roughly 220 million dollars. Bricks that had once felt unbeatable were no longer enough to cover the costs of everything built around them. The following year, almost a thousand workers were laid off. It was a hard time for everyone involved. The owner stepped in and put about 800 million kroner of his own money into the company. Nobody could say yet whether it would be enough, but the company had bought itself some time.",
  },
  {
    title: 'Back to basics',
    text: "What did Lego do with that time? Instead of chasing growth, it went back to basics. It stopped trying to be everything and asked what it was really for. In 2005 it sold its four Legoland theme parks for 375 million euros, to focus on its core toys. The parks were not a failure, but they were not the brick. The company chose to make the brick the center of everything again, and trust it. Quiet offices, plain plastic bricks, and a smaller, simpler plan took the place of the big ambitions.",
  },
  {
    title: 'The comeback',
    text: "And did it work? Ten years later, in the first half of 2015, Lego outsold Mattel: 2.1 billion dollars against 1.9 billion. That made it the world's biggest toy company by sales. Children were building with bricks again, and busy toy store shelves showed it. The lesson was not to grow faster, but to remember what the company was for. Lego won by going back to the brick.",
  },
];

async function r9() {
  console.log('--- R9: Sonnet 5.5');
  const originalModel = LLM_REGISTRY['script-generation'].model;
  const rows: Array<Record<string, unknown>> = [];
  for (const model of ['claude-sonnet-5', 'claude-sonnet-5-5']) {
    LLM_REGISTRY['script-generation'].model = model;
    const started = Date.now();
    try {
      const { output, calls } = await generateScript({
        topic: "Lego's recovery from financial crisis to market leader, 2003-2015",
        constraints: [],
        briefText: BRIEF,
        targetSeconds: 120,
        videoKind: 'long',
        sources: [],
      });
      const cost = calls.reduce((s, c) => s + Number(c.costUsd), 0);
      book(`script ${model}`, cost);
      const words = countWords(output.scriptText);
      rows.push({ model, accepted: true, calls: calls.length, words, chapters: output.chapters?.length, lengthOutOfRange: Boolean((output as { lengthOutOfRange?: boolean }).lengthOutOfRange), usd: Number(cost.toFixed(4)), seconds: Math.round((Date.now() - started) / 1000), firstSentenceOk: output.scriptText.startsWith('In 2003, Lego was losing money fast.'), lastSentenceOk: output.scriptText.trim().endsWith('Lego won by going back to the brick.') });
      await fs.writeFile(path.join(OUT, `script-${model}.txt`), output.scriptText);
    } catch (error) {
      rows.push({ model, accepted: false, error: error instanceof Error ? error.message.slice(0, 300) : String(error) });
    }
  }
  LLM_REGISTRY['script-generation'].model = originalModel;
  // The id is also accepted by a bare one-token call (what preflight does).
  const probe = await callLLM({ purpose: 'script-generation', system: 'Reply OK.', messages: [{ role: 'user', content: 'ping' }], maxTokens: 4 });
  book('probe sonnet-5-5', Number(probe.costUsd));
  rows.push({ probe: probe.model, ok: true, usd: probe.costUsd, pricing: resolvePricing(probe.model) });
  await fs.writeFile(path.join(OUT, 'r9-sonnet-5-5.json'), JSON.stringify(rows, null, 2));
  console.log(JSON.stringify(rows));
}

async function contactSheet(files: string[], out: string, cols = 6) {
  const args = ['-y', '-hide_banner', '-loglevel', 'error', ...files.flatMap((f) => ['-i', f])];
  const scaled = files.map((_, i) => `[${i}:v]scale=320:-2[s${i}]`).join(';');
  const layout = files.map((_, i) => `${(i % cols) * 320}_${Math.floor(i / cols) * 214}`).join('|');
  const filter = `${scaled};${files.map((_, i) => `[s${i}]`).join('')}xstack=inputs=${files.length}:layout=${layout}[v]`;
  await exec(env.FFMPEG_PATH, [...args, '-filter_complex', filter, '-map', '[v]', '-frames:v', '1', '-q:v', '4', out], { maxBuffer: 64 * 1024 * 1024 });
}

// Scene prompts written the way the planner writes them, for the scene types of the 18 Oct run (used when the
// Anthropic account cannot plan or check: the pictures then go through OpenAI only and are judged by eye).
const FIXED_SCENES: Array<{ chapterIndex: number; words: string; prompt: string }> = [
  'A wide view of a large toy factory exterior at dawn, rows of windows lit, a long loading dock with colorful plastic crates stacked outside, soft mist.',
  'Workers in plain jackets leaving a factory gate at the end of a shift, seen from behind in warm evening light, a quiet road ahead.',
  'A quiet empty open-plan office with rows of desks, chairs pushed in, afternoon light across blank monitors.',
  'A financial report page and a calculator on a desk beside a coffee cup, shot from above, a pen resting on the paper.',
  'A group of executives around a boardroom table studying documents, a city skyline through the window behind them.',
  'An older businessman handing a heavy folder across a desk to a younger manager, a warm lamp, a sense of a decision being made.',
  'A theme park with a Ferris wheel, roller coaster and colorful buildings on a bright day, families walking along the main path.',
  'A theme park entrance gate with a large arch and a crowd of visitors streaming in under blue sky.',
  'A designer at a workbench arranging plain plastic bricks into a simple model, a lamp, tidy tools, close crop space.',
  'A close view of a pile of plain red, blue and yellow plastic bricks on a wooden table, soft side light.',
  'Children building with bricks on a living room floor, laughing, a tower half built, afternoon sun.',
  'Busy toy store shelves stacked with boxed building sets and shoppers browsing the aisle, bright store light.',
  'A world map with glowing markers across continents beside a stack of toy boxes, cool studio light.',
  'Two toy company towers facing each other across a city street, one slightly taller in golden light.',
  'A trophy on a podium next to a pile of building bricks, spotlight from above, dark background.',
  'A single plain brick on a clean table in front of a window, quiet morning light, plenty of empty space.',
].map((prompt, i) => ({ chapterIndex: Math.min(2, Math.floor(i / 6)), words: `scene ${i}`, prompt }));

async function r6() {
  console.log('--- R6: pictures for the Lego brief, before and after');
  const cache = path.join(OUT, 'work-stills');
  await fs.mkdir(cache, { recursive: true });
  const plannerCalls: number[] = [];
  const llmAvailable = !process.argv.includes('--no-llm');
  type PlannedPlan = { longScenes?: typeof FIXED_SCENES; sceneMeanings?: { scenes: Array<{ narrationSpan: { chapterIndex: number; startWord: number; endWordExclusive: number } }> } };
  const plan: PlannedPlan = llmAvailable
    ? (await planLongVideoProduction({
        chapters: CHAPTERS, topic: "Lego's recovery from financial crisis to market leader, 2003-2015", targetSeconds: 120, secondsPerStill: 5,
        visualStyle: 'muted cinematic documentary illustration, soft natural light', scriptGuide: null,
        onCall: async (llm) => { plannerCalls.push(Number(llm.costUsd)); book('planner', Number(llm.costUsd)); },
      })).plan
    : { longScenes: FIXED_SCENES };
  const scenes = plan.longScenes!;
  console.log(`planned ${scenes.length} scenes`);
  const narrationFor = (i: number) => {
    const span = plan.sceneMeanings?.scenes[i]?.narrationSpan;
    const text = span ? CHAPTERS[span.chapterIndex].text : undefined;
    return span && text ? text.trim().split(/\s+/).slice(span.startWord, span.endWordExclusive).join(' ') : scenes[i].words;
  };
  const results: Record<string, unknown> = { scenes: scenes.length, plannerUsd: Number(plannerCalls.reduce((a, b) => a + b, 0).toFixed(4)) };

  for (const variant of ['before', 'after'] as const) {
    // before = the prompt as it was built when the platform safety flag was off (the E6 run); after = this change.
    const styled = buildStyledScenePrompts(scenes.map((s) => s.prompt), variant === 'before' ? { stylePrompt: 'muted cinematic documentary illustration, soft natural light', allowBrandMarks: true } : { stylePrompt: 'muted cinematic documentary illustration, soft natural light' });
    const dir = path.join(cache, variant);
    await fs.mkdir(dir, { recursive: true });
    let imageUsd = 0;
    const gen = await generateStills({ scenePrompts: styled, size: STILL_SIZE_LANDSCAPE, cacheDir: dir, onStillGenerated: (info) => { imageUsd += info.costUsd; book(`still ${variant}`, info.costUsd); } });
    const indexes = gen.promptIndexes ?? gen.imagePaths.map((_, i) => i);
    const toCheck = () => indexes.map((sceneIndex, k) => ({ sceneIndex, imagePath: gen.imagePaths[k], narration: narrationFor(sceneIndex) }));
    let checkUsd = 0;
    if (!llmAvailable) {
      results[variant] = { pictures: gen.imagePaths.length, skipped: gen.skippedPromptCount ?? 0, imageUsd: Number(imageUsd.toFixed(4)), checker: 'not run (Anthropic account unavailable); pictures judged by eye from the contact sheet' };
      await contactSheet(gen.imagePaths, path.join(OUT, `contact-sheet-${variant}.jpg`), 4);
      continue;
    }
    const first = await checkStills({ topic: 'Lego', stills: toCheck(), cacheDir: dir, onCall: async (llm) => { checkUsd += Number(llm.costUsd); book(`check ${variant}`, Number(llm.costUsd)); } });
    const flagged = first.filter((r) => r.issues.length > 0);
    const summary: Record<string, unknown> = {
      pictures: gen.imagePaths.length, skipped: gen.skippedPromptCount ?? 0, imageUsd: Number(imageUsd.toFixed(4)), checkUsd: Number(checkUsd.toFixed(4)),
      flaggedFirstPass: flagged.length, byKind: countKinds(flagged.flatMap((r) => r.issues)),
      flagged: flagged.map((r) => ({ scene: r.sceneIndex, issues: r.issues })),
    };
    if (variant === 'after' && flagged.length > 0) {
      let retryUsd = 0;
      const retry = await generateStills({
        scenePrompts: flagged.map((r) => strongerPrompt(styled[r.sceneIndex], r.issues)), size: STILL_SIZE_LANDSCAPE, cacheDir: dir,
        onStillGenerated: (info) => { retryUsd += info.costUsd; book('still retry', info.costUsd); },
      });
      const idx = retry.promptIndexes ?? retry.imagePaths.map((_, k) => k);
      const replaced = idx.map((fi, k) => ({ sceneIndex: flagged[fi].sceneIndex, imagePath: retry.imagePaths[k], narration: narrationFor(flagged[fi].sceneIndex) }));
      idx.forEach((fi, k) => { gen.imagePaths[indexes.indexOf(flagged[fi].sceneIndex)] = retry.imagePaths[k]; });
      const second = await checkStills({ topic: 'Lego', stills: replaced, cacheDir: dir, onCall: async (llm) => { checkUsd += Number(llm.costUsd); book('check retry', Number(llm.costUsd)); } });
      summary.regenerated = replaced.length;
      summary.stillFlaggedAfterRetry = second.filter((r) => r.issues.length > 0).length;
      summary.stillFlagged = second.filter((r) => r.issues.length > 0).map((r) => ({ scene: r.sceneIndex, issues: r.issues }));
      summary.retryUsd = Number(retryUsd.toFixed(4));
      summary.checkUsdTotal = Number(checkUsd.toFixed(4));
    }
    results[variant] = summary;
    await contactSheet(gen.imagePaths, path.join(OUT, `contact-sheet-${variant}.jpg`));
  }
  await fs.writeFile(path.join(OUT, 'r6-pictures.json'), JSON.stringify({ ...results, prompts: scenes.map((s) => s.prompt) }, null, 2));
  console.log(JSON.stringify(results));
}

function countKinds(issues: StillIssue[]) {
  const out: Record<string, number> = {};
  for (const i of issues) out[i.kind] = (out[i.kind] ?? 0) + 1;
  return out;
}

async function r10() {
  console.log('--- R10 Part A: voice samples');
  const text = CHAPTERS[1].text.split(/\s+/).slice(0, 90).join(' ');
  const direction = 'Calm documentary narrator, human pauses, heavier on loss, lifting at recovery.';
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY, maxRetries: 0 });
  const cases = [
    { file: 'sample-tts-1-hd-coral.mp3', model: 'tts-1-hd', voice: 'coral', instructions: undefined, perChar: 30 / 1e6 },
    { file: 'sample-gpt-4o-mini-tts-ballad.mp3', model: 'gpt-4o-mini-tts', voice: 'ballad', instructions: direction, perChar: 0.015 / (155 * 6) },
    { file: 'sample-gpt-4o-mini-tts-marin.mp3', model: 'gpt-4o-mini-tts', voice: 'marin', instructions: direction, perChar: 0.015 / (155 * 6) },
  ];
  const rows: Array<Record<string, unknown>> = [];
  const wordCount = countWords(text);
  for (const c of cases) {
    const response = await client.audio.speech.create({
      model: c.model, voice: c.voice as never, input: text, response_format: 'mp3',
      ...(c.instructions && { instructions: c.instructions }),
    } as never);
    const buffer = Buffer.from(await response.arrayBuffer());
    const file = path.join(OUT, c.file);
    await fs.writeFile(file, buffer);
    const { stdout } = await exec(env.FFPROBE_PATH, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file]);
    const seconds = Number(stdout.trim());
    const usd = text.length * c.perChar;
    book(`voice ${c.model} ${c.voice}`, usd);
    const wpm = (wordCount / seconds) * 60;
    const forecast = forecastLength({ text: CHAPTERS.map((ch) => ch.text).join(' '), targetSeconds: 120, wordsPerMinute: wpm, paceSource: 'measured' });
    rows.push({
      file: c.file, model: c.model, voice: c.voice, words: wordCount, characters: text.length, seconds: Number(seconds.toFixed(1)), wordsPerMinute: Number(wpm.toFixed(1)),
      sampleUsd: Number(usd.toFixed(4)),
      // 2 minutes of this voice: about 2 x its words per minute, at the same characters per word as the sample.
      fullTwoMinuteVideoUsd: Number((2 * wpm * (text.length / wordCount) * c.perChar).toFixed(4)),
      controlScriptForecast: { words: forecast.wordCount, expectedSeconds: forecast.expectedSeconds, status: forecast.status },
    });
  }
  await fs.writeFile(path.join(OUT, 'r10-voice-samples.json'), JSON.stringify({ text, direction, rows }, null, 2));
  console.log(JSON.stringify(rows));
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const which = process.argv.slice(2);
  const run = (name: string) => which.length === 0 || which.includes(name);
  try {
    if (run('r9')) await r9();
    if (run('r10')) await r10();
    if (run('r6')) await r6();
  } finally {
    await fs.writeFile(path.join(OUT, 'spend-ledger.json'), JSON.stringify({ totalUsd: Number(spent.toFixed(4)), ceilingUsd: CEILING_USD, items: ledger }, null, 2));
    console.log(`total real-model spend: $${spent.toFixed(4)} (ceiling $${CEILING_USD})`);
  }
}
main().catch((error) => { console.error(error); process.exit(1); });
