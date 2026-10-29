// Sprint 6 Task 1 PR C (R7): the live check of a Short's opening. Builds the opening from the curiosity brief with the real
// registry calls, renders a short video with the real narration and real stills (the first still is the brief's frame zero and
// the hook line is drawn on the first frame), then writes frame 0 and frames at 0.5 s, 2 s, 4 s and 8 s as pictures.
//
//   npx tsx scripts/short-opening-check.ts --live
//
// Spends real money: the brief and one cold-reader read (about $0.01), narration and transcription (a few cents) and four
// stills (about $0.03). The cap below stops it before a paid step that would pass it. Without --live it prints the plan and exits.
// No database. Output (gitignored): studio/data/short-opening-check/.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import '../src/config/env'; // loads .env.local before anything reads the environment
import { buildShortOpening, frameZeroScene, type ShortOpening } from '../src/packaging/opening';
import { makeBrief } from '../src/packaging/testkit';
import { generateVideo } from '../src/agents/video-generation';
import { emptyVideoSpend } from '../src/agents/video-generation/spend';
import type { ProductionPlan } from '../src/agents/video-generation/plan';
import { DATA_DIR } from '../src/config/paths';

// This script's own cap; the whole task's live-check ceiling is $2.00 and every run counts against it.
const MAX_SPEND_USD = 0.25;

const SCRIPT_FILE = path.resolve(__dirname, '../src/packaging/fixtures/eiffel-script.json');

function shortScript(): string {
  const full = (JSON.parse(fs.readFileSync(SCRIPT_FILE, 'utf8')) as { scriptText: string }).scriptText;
  // The first two chapters, about 130 words: a Short's worth.
  return full.split('\n\n').slice(0, 2).join(' ');
}

async function main() {
  if (!process.argv.includes('--live')) {
    console.log(`dry run: pass --live (cap $${MAX_SPEND_USD}).`);
    return;
  }
  const scriptText = shortScript();
  let spent = 0;
  // --offline-opening: the brief call needs the language model; when its provider is unavailable the render is still checked, with
  // a fixed opening written from the same brief shape (the hook line and picture checks are unit-tested separately).
  const offline = process.argv.includes('--offline-opening');
  const fixed = (): ShortOpening => {
    const brief = makeBrief({ lookAt: 'The iron tower at the world fair, workers small beneath it', hookLine: 'Why was it nearly torn down?' });
    return { scriptHash: 'offline', hookLine: brief.hookLine, firstStillPrompt: frameZeroScene(brief), question: brief.question, device: brief.primaryDevice, answerQuote: brief.answeredIn.quote, reasons: [], note: null, textCostUsd: 0, builtAt: new Date().toISOString(), brief };
  };
  const opening = offline ? fixed() : await buildShortOpening({
    scriptText,
    look: { stylePrompt: 'Cinematic documentary still, 35mm look, soft natural light, muted natural colours.', titleGuidance: 'Plain and specific.' },
    onText: async (label, calls) => {
      const cost = calls.reduce((s, c) => s + Number(c.costUsd), 0);
      spent += cost;
      console.log(`text ${label} $${cost.toFixed(4)}`);
    },
  });
  console.log(`hook line: ${JSON.stringify(opening.hookLine)}`);
  console.log(`question: ${opening.question} | device ${opening.device}`);
  console.log(`frame zero prompt: ${opening.firstStillPrompt ?? '(none, the planner keeps its own first picture)'}`);
  console.log(`reasons: ${opening.reasons.join(' | ') || '(none)'}`);
  console.log(`advisory note: ${opening.note ?? '(the question is opened within five seconds)'}`);
  if (spent >= MAX_SPEND_USD) throw new Error('spend cap reached after the opening');

  const runId = 'short-opening-check';
  const plan: ProductionPlan = {
    visualSource: 'ai-stills',
    stockFootageQuery: 'tower',
    stillScenePrompts: [
      'An iron tower at the 1889 Paris world fair, workers below, warm daylight.',
      'A close view of rivets in the iron lattice of a large tower.',
      'A tall tower rising over a city skyline at dusk.',
      'Engineers with instruments on a high platform of a tower.',
    ],
    captionStyle: 'phrase-grouped',
    audioLayer: 'none',
    pacingNotes: 'steady',
    rationale: 'live check of the Short opening',
  };
  fs.rmSync(path.join(DATA_DIR, 'videos', runId), { recursive: true, force: true });
  const result = await generateVideo({
    pipelineRunId: runId,
    attemptNumber: 1,
    scriptText,
    brandAssets: { captionsEnabled: true },
    plan,
    spend: emptyVideoSpend({ media: false, stockFootage: false, aiVisuals: false }),
    sceneStyle: { stylePrompt: 'Cinematic documentary still, 35mm look, soft natural light, muted natural colours.', allowBrandMarks: false },
    opening: { hookLine: opening.hookLine, firstStillPrompt: opening.firstStillPrompt },
  });
  const video = result.output.videoPath;
  const cost = Number(result.usage.costUsd ?? 0);
  spent += cost;
  console.log(`rendered ${video} (${result.output.durationSeconds.toFixed(1)} s), video cost about $${cost.toFixed(4)}, total $${spent.toFixed(4)} of $${MAX_SPEND_USD}`);

  const outDir = path.join(DATA_DIR, 'short-opening-check');
  fs.mkdirSync(outDir, { recursive: true });
  for (const t of [0, 0.5, 2, 4, 8]) {
    const out = path.join(outDir, `frame-${String(t).replace('.', '_')}s.png`);
    execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-y', '-ss', String(t), '-i', video, '-frames:v', '1', out], { stdio: 'ignore' });
    console.log(`frame at ${t}s -> ${out}`);
  }
  fs.writeFileSync(path.join(outDir, 'opening.json'), JSON.stringify(opening, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
