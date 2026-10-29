import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from '../config/env';
import { measureIntegratedLufs } from '../agents/video-generation/audio-mix';
import {
  DISCLAIMER_CLIP_PATH, DISCLAIMER_FADE_IN_SEC, DISCLAIMER_FADE_OUT_SEC, DISCLAIMER_LEVEL_DB_UNDER_NARRATION,
  DISCLAIMER_MIN_CARD_SECONDS,
} from './asset-spec';

const execFileAsync = promisify(execFile);

// Silence either side of the clip, so it does not run into the hook or the next line.
export const DISCLAIMER_PAD_SEC = 0.35;
// The hook is the first sentence; if no sentence end shows up early, cut at the end of the first word past this.
const HOOK_MAX_SEC = 12;

type Timed = { text: string; startMs: number; endMs: number };

// End of the hook, in seconds: the first word that ends a sentence, else the first word that ends after HOOK_MAX_SEC.
export function findHookEndSec(words: Timed[]): number {
  if (words.length === 0) return 0;
  const stop = words.find((w) => /[.!?]["')\]]*$/.test(w.text.trim()));
  if (stop && stop.endMs / 1000 <= HOOK_MAX_SEC * 2) return stop.endMs / 1000;
  const late = words.find((w) => w.endMs / 1000 >= HOOK_MAX_SEC) ?? words[words.length - 1];
  return late.endMs / 1000;
}

export type DisclaimerInsertion = {
  atSec: number; // the end of the hook, where the pad before the clip starts
  clipStartSec: number; // clip start in the new timeline
  clipEndSec: number;
  cardStartSec: number;
  cardEndSec: number;
  gapSec: number; // total seconds added to the video
};

export function planInsertion(hookEndSec: number, clipSeconds: number): DisclaimerInsertion {
  const clipStartSec = hookEndSec + DISCLAIMER_PAD_SEC;
  const clipEndSec = clipStartSec + clipSeconds;
  const cardEndSec = Math.max(clipEndSec, clipStartSec + DISCLAIMER_MIN_CARD_SECONDS);
  const gapSec = cardEndSec - hookEndSec + DISCLAIMER_PAD_SEC;
  return { atSec: hookEndSec, clipStartSec, clipEndSec, cardStartSec: clipStartSec, cardEndSec, gapSec };
}

// Everything after the hook moves later by the gap; a span that contains the hook end grows by it.
export function shiftTimed<T extends { startMs: number; endMs: number }>(items: T[], atSec: number, gapSec: number): T[] {
  const atMs = atSec * 1000;
  const gapMs = gapSec * 1000;
  return items.map((i) => ({
    ...i,
    startMs: i.startMs >= atMs ? i.startMs + gapMs : i.startMs,
    endMs: i.endMs > atMs ? i.endMs + gapMs : i.endMs,
  }));
}

export function shiftChapters<T extends { startSec: number; endSec: number }>(chapters: T[], atSec: number, gapSec: number): T[] {
  return chapters.map((c) => ({
    ...c,
    startSec: c.startSec >= atSec ? c.startSec + gapSec : c.startSec,
    endSec: c.endSec > atSec ? c.endSec + gapSec : c.endSec,
  }));
}

// New narration track: narration up to the hook end, pad, the clip (DISCLAIMER_LEVEL_DB_UNDER_NARRATION under the measured
// narration, fading in and out), pad, the rest. The result is the "voice" the rest of the mix uses, so the music bed ducks
// under the clip like under speech, and the final loudness stage keeps the clip's distance from the narration.
export async function spliceDisclaimerIntoNarration(params: { narrationPath: string; hookEndSec: number; clipSeconds: number; outputPath: string }): Promise<DisclaimerInsertion> {
  const narrationLufs = await measureIntegratedLufs(params.narrationPath);
  const clipLufs = await measureIntegratedLufs(DISCLAIMER_CLIP_PATH);
  // Unmeasurable audio: keep the clip at a fixed offset rather than guess.
  const gainDb = narrationLufs !== null && clipLufs !== null ? narrationLufs - DISCLAIMER_LEVEL_DB_UNDER_NARRATION - clipLufs : -DISCLAIMER_LEVEL_DB_UNDER_NARRATION;
  const plan = planInsertion(params.hookEndSec, params.clipSeconds);
  const fadeOutAt = Math.max(0, params.clipSeconds - DISCLAIMER_FADE_OUT_SEC);
  const hook = params.hookEndSec.toFixed(3);
  // The clip is delayed by the pad and padded to the full gap, so [head][clip][tail] joins without a seam.
  const graph = [
    `[0:a]aformat=sample_rates=44100:channel_layouts=mono,asplit=2[n1][n2]`,
    `[n1]atrim=0:${hook},asetpts=PTS-STARTPTS[head]`,
    `[n2]atrim=start=${hook},asetpts=PTS-STARTPTS[tail]`,
    `[1:a]aformat=sample_rates=44100:channel_layouts=mono,volume=${gainDb.toFixed(2)}dB,afade=t=in:st=0:d=${DISCLAIMER_FADE_IN_SEC},afade=t=out:st=${fadeOutAt.toFixed(3)}:d=${DISCLAIMER_FADE_OUT_SEC},adelay=${Math.round(DISCLAIMER_PAD_SEC * 1000)},apad=whole_dur=${plan.gapSec.toFixed(3)}[clip]`,
    `[head][clip][tail]concat=n=3:v=0:a=1[out]`,
  ].join(';');
  await execFileAsync(env.FFMPEG_PATH, ['-y', '-i', params.narrationPath, '-i', DISCLAIMER_CLIP_PATH, '-filter_complex', graph, '-map', '[out]', '-b:a', '128k', params.outputPath]);
  return plan;
}
