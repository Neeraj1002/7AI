import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from '../config/env';
import type { GenerateStillsParams, GeneratedStillsResult } from './types';
import { DATA_DIR } from '../config/paths';
import { STILL_SIZE_PORTRAIT } from './sizes';

// Testing-only stand-in for the real OpenAI-backed image generation, used
// only when AI_VISUALS_STUB=1. Same reasoning as stock-footage/stub.ts: a
// deterministic, genuinely distinct-per-still generated pattern (not a
// flat/identical placeholder), so the Ken-Burns assembly and caption-cue
// timing sync downstream has real, distinguishable images to animate
// between, not indistinguishable frames.

const execFileAsync = promisify(execFile);
const AI_VISUALS_TMP_DIR = path.resolve(DATA_DIR, 'ai-visuals-tmp');

async function ensureTmpDir(): Promise<void> {
  await fs.mkdir(AI_VISUALS_TMP_DIR, { recursive: true });
}

// Best-effort — Arial ships with every real-world Windows install this
// project has run on so far; if it's ever missing, ffmpeg's drawtext call
// below fails loudly (a real error, not a silently blank stub image),
// which is the correct behavior for a stub whose whole job is standing in
// for real content. Copied into AI_VISUALS_TMP_DIR once and referenced by
// plain relative filename (via `cwd`) — same trick video-generation/
// index.ts's own `subtitles` filter already uses, avoiding FFmpeg's
// notoriously fiddly drive-letter-colon escaping in a filter argument on
// Windows (`C:/Windows/Fonts/...` directly in `fontfile=` fails to parse).
const SYSTEM_FONT_PATH = 'C:/Windows/Fonts/arial.ttf';
const STUB_FONT_FILENAME = 'stub-font.ttf';

async function ensureStubFont(): Promise<void> {
  const dest = path.join(AI_VISUALS_TMP_DIR, STUB_FONT_FILENAME);
  try {
    await fs.access(dest);
  } catch {
    await fs.copyFile(SYSTEM_FONT_PATH, dest);
  }
}

export async function stubGenerateStills(params: GenerateStillsParams): Promise<GeneratedStillsResult> {
  await ensureTmpDir();
  await ensureStubFont();
  const imagePaths: string[] = [];
  const size = params.size ?? STILL_SIZE_PORTRAIT;

  params.onProgress?.({ done: 0, total: params.scenePrompts.length });
  for (let i = 0; i < params.scenePrompts.length; i += 1) {
    const imageFilename = `${randomUUID()}.png`;
    // A solid, per-still-distinct color background with the real scene
    // prompt drawn as text — genuinely topic-identifiable (if crude),
    // unlike an earlier version of this stub that used a testsrc2 test-card
    // pattern, which produced generic noise a real reviewer correctly
    // couldn't connect to any topic (a live finding from this task's own
    // end-to-end verification). This lets Video Intelligence's own-draft
    // review (E3) actually exercise its ai-stills-aware carve-out against
    // content that looks like a legitimate (if crude) attempt at the
    // scene, not against meaningless placeholder noise.
    const safeText = params.scenePrompts[i].replace(/['";:()%]/g, ' ');
    // A simple pictogram (two rectangles — a tower body + a lit cap) above
    // the text, not just a bare text card — enough for a real reviewer to
    // treat this as an attempted illustration rather than a text-only
    // slide, without needing a real generated image.
    const pictogram = [
      'drawbox=x=(iw-100)/2:y=560:w=100:h=460:color=white@0.85:t=fill',
      'drawbox=x=(iw-160)/2:y=500:w=160:h=70:color=yellow@0.9:t=fill',
    ].join(',');
    await execFileAsync(
      env.FFMPEG_PATH,
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        `color=c=0x${((i * 47) % 256).toString(16).padStart(2, '0')}3355:size=${size}:rate=1`,
        '-vf',
        `${pictogram},drawtext=fontfile=${STUB_FONT_FILENAME}:text='${safeText}':fontcolor=white:fontsize=40:x=(w-text_w)/2:y=1100:line_spacing=12:box=1:boxcolor=black@0.4:boxborderw=20`,
        '-frames:v',
        '1',
        imageFilename,
      ],
      { cwd: AI_VISUALS_TMP_DIR },
    );
    imagePaths.push(path.join(AI_VISUALS_TMP_DIR, imageFilename));
    params.onProgress?.({ done: i + 1, total: params.scenePrompts.length });
  }

  return {
    imagePaths,
    provider: 'openai',
    model: 'stub',
    costUsd: '0.000000',
  };
}
