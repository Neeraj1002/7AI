// One-off generator for the curated royalty-free audio-bed library
// (Sprint 2 Task 3, F1) — layered FFmpeg sine-wave pads, synthesized
// locally, not sourced from any external rights holder. Run once to
// (re)produce data/audio-beds/*.mp3; not part of src/, matching the
// project's other scripts/*.ts one-off tools. Re-run is safe/idempotent —
// it always overwrites the same 5 files with the same deterministic output.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import { env } from '../src/config/env';

const execFileAsync = promisify(execFile);
const OUT_DIR = path.resolve(process.cwd(), 'data', 'audio-beds');
const DURATION_SECONDS = 24;

type Track = {
  filename: string;
  // Each frequency becomes its own sine input, mixed together — a simple
  // layered pad, not a claim of real music production.
  frequencies: number[];
  tremoloRateHz?: number; // optional slow amplitude wobble for a less static pad
};

const TRACKS: Track[] = [
  // A bright, slightly faster wobble — the closest a few static sine layers
  // can get to "upbeat" without real melodic movement.
  { filename: 'upbeat.mp3', frequencies: [329.63, 392.0, 523.25], tremoloRateHz: 4 },
  // A slow, soft, closely-spaced pair — a gentle, static pad.
  { filename: 'calm.mp3', frequencies: [220.0, 224.0] },
  // A low, slightly dissonant interval with a slow wobble.
  { filename: 'mysterious.mp3', frequencies: [110.0, 116.5], tremoloRateHz: 0.4 },
  // A warm, sustained major triad (C4-E4-G4).
  { filename: 'inspirational.mp3', frequencies: [261.63, 329.63, 392.0] },
  // A low tone with a faster pulse — suspense-adjacent.
  { filename: 'tense.mp3', frequencies: [98.0, 100.0], tremoloRateHz: 2.5 },
];

async function generateTrack(track: Track): Promise<void> {
  const outputPath = path.join(OUT_DIR, track.filename);
  const inputArgs = track.frequencies.flatMap((freq) => [
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=${freq}:duration=${DURATION_SECONDS}`,
  ]);
  const mixLabel = track.frequencies.map((_, i) => `[${i}:a]`).join('');
  const tremolo = track.tremoloRateHz ? `,tremolo=f=${track.tremoloRateHz}:d=0.5` : '';
  // Mixed down, then a fixed low gain so this reads as a background bed,
  // never competing with narration even before generateVideo's own amix
  // weighting is applied on top.
  const filterComplex = `${mixLabel}amix=inputs=${track.frequencies.length}:duration=first${tremolo},volume=0.35[outa]`;

  await execFileAsync(env.FFMPEG_PATH, [
    '-y',
    ...inputArgs,
    '-filter_complex',
    filterComplex,
    '-map',
    '[outa]',
    '-c:a',
    'libmp3lame',
    '-b:a',
    '128k',
    outputPath,
  ]);
  console.log(`[generate-audio-beds] wrote ${outputPath}`);
}

async function main(): Promise<void> {
  await fs.mkdir(OUT_DIR, { recursive: true });
  for (const track of TRACKS) {
    await generateTrack(track);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
