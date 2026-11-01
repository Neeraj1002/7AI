// READ-ONLY diagnostic: why is a render shorter than its script or its voiceover, and are the brief's fixed sentences in it?
//   npx tsx scripts/diagnose-run-duration.ts <runId> [--attempt N] [--voice <voice.mp3>] [--replay-mux]
//   npx tsx scripts/diagnose-run-duration.ts --brief-contains "text" [--attempt N] [--voice <voice.mp3>] [--replay-mux]
//   npx tsx scripts/diagnose-run-duration.ts --frame-table --dir <studio/data/videos/runId> [--attempt N]   (no database needed)
//   npx tsx scripts/diagnose-run-duration.ts --recent-runs [N]
// Reads the database (SELECT only) and the files in the data directory, and runs ffprobe. No paid calls.
// --replay-mux re-runs the saved ffmpeg command with its output discarded. --frame-table re-renders the saved command into
// a temporary directory under the system temp dir and deletes it afterwards. Nothing else is written.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { prisma } from '../src/models/prisma-client';
import { DATA_DIR } from '../src/config/paths';
import { env } from '../src/config/env';
import { END_TAIL_SECONDS } from '../src/agents/video-generation/quality-spec';

// The same limits as src/agents/video-generation/duration-guards.ts and quality-spec.ts, repeated here on purpose: this script
// must run on a server that does not have those guards yet, to show what they would have said about its real renders.
const VOICE_LENGTH_TOLERANCE_SECONDS = 1;
const FINAL_LENGTH_TOLERANCE_SECONDS = 1;
const SHORT_MIN_NARRATION_FRACTION = 0.97;

const execFileAsync = promisify(execFile);
const asObject = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const fmt = (n: number | null | undefined): string => (typeof n === 'number' && Number.isFinite(n) ? `${n.toFixed(2)}s` : 'n/a');
const words = (t: string): string[] => t.split(/\s+/).filter(Boolean);
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
// Whisper writes "12" where the script says "twelve", and drops apostrophes: compare on a spelling-neutral form.
const normalize = (t: string): string =>
  t.toLowerCase().replace(/[‘’']/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
    .split(' ').map((w) => (NUMBER_WORDS.includes(w) ? String(NUMBER_WORDS.indexOf(w)) : w)).join(' ');
const line = (label: string, value: string): void => console.log(`  ${label.padEnd(44)} ${value}`);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function exists(p: string): Promise<boolean> {
  return fs.stat(p).then(() => true, () => false);
}

async function ffprobe(args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(env.FFPROBE_PATH, ['-v', 'error', ...args]);
    return stdout.trim();
  } catch {
    return null;
  }
}

async function probeFormatSeconds(p: string): Promise<number | null> {
  const out = await ffprobe(['-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', p]);
  const n = out === null ? NaN : parseFloat(out);
  return Number.isFinite(n) ? n : null;
}

// Decodes the whole video stream to nothing: how many frames really come out, and any decode errors. Read-only.
async function decodeCheck(p: string): Promise<string> {
  try {
    const { stderr } = await execFileAsync(env.FFMPEG_PATH, ['-v', 'error', '-i', p, '-map', '0:v:0', '-f', 'null', '-'], { maxBuffer: 16 * 1024 * 1024 });
    const counted = await ffprobe(['-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames,r_frame_rate,time_base,start_time', '-of', 'default=noprint_wrappers=1', p]);
    const fields = Object.fromEntries((counted ?? '').split('\n').map((l) => l.split('=')));
    const [num, den] = String(fields.r_frame_rate ?? '30/1').split('/').map(Number);
    const frames = Number(fields.nb_read_frames);
    return `${frames} frames = ${(frames / (num / (den || 1))).toFixed(2)}s decoded at ${fields.r_frame_rate}; time_base ${fields.time_base}; start ${fields.start_time}; decode errors: ${stderr.trim() ? stderr.trim().slice(0, 300) : 'none'}`;
  } catch (error) {
    return `decode failed: ${error instanceof Error ? error.message.slice(0, 300) : String(error)}`;
  }
}

// Re-runs ONLY the audio part of the saved mux with its output thrown away (-f null): free, writes nothing.
// Shows how long the mixed audio really is, and how long each input is.
async function replayAudio(ff: Record<string, unknown>, cwd: string): Promise<void> {
  const args = (ff.args as string[] | undefined) ?? [];
  const graph = String(ff.filterComplex ?? '');
  const cut = graph.indexOf(';[1:a]');
  const inputs: Array<{ path: string; looped: boolean }> = [];
  args.forEach((a, i) => {
    if (a === '-i') inputs.push({ path: args[i + 1], looped: args[i - 2] === '-stream_loop' });
  });
  for (const [i, inp] of inputs.entries()) {
    const abs = path.resolve(cwd, inp.path);
    line(`input ${i}${inp.looped ? ' (stream_loop)' : ''} length`, `${fmt(await probeFormatSeconds(abs))}  ${path.basename(inp.path)}`);
  }
  if (cut < 0) return;
  try {
    const replay = ['-v', 'error', '-nostats', ...args.slice(1, args.indexOf('-filter_complex')), '-filter_complex', graph.slice(cut + 1), '-map', '[outa]', '-progress', 'pipe:1', '-f', 'null', '-'];
    const { stdout } = await execFileAsync(env.FFMPEG_PATH, replay, { cwd, maxBuffer: 16 * 1024 * 1024 });
    const outTime = [...stdout.matchAll(/out_time_us=(\d+)/g)].pop();
    line('audio-only replay: mixed audio length', outTime ? fmt(Number(outTime[1]) / 1e6) : 'n/a');
  } catch (error) {
    line('audio-only replay', `failed: ${error instanceof Error ? error.message.slice(0, 300) : String(error)}`);
  }
}

// Re-runs the WHOLE saved mux with its output thrown away (-f null), at the fastest x264 preset: free, writes nothing.
// Same command as saved, then the same without -shortest, then the picture alone: which of them ends at the real length?
async function replayMux(ff: Record<string, unknown>, cwd: string): Promise<void> {
  const saved = (ff.args as string[] | undefined) ?? [];
  const version = await execFileAsync(env.FFMPEG_PATH, ['-version']).then((r) => r.stdout.split('\n')[0], () => 'unknown');
  line('ffmpeg version', version);
  const base = saved.slice(0, -1);
  const strip = (a: string[]): string[] => a.flatMap((x, i) => (x === '-movflags' || a[i - 1] === '-movflags' ? [] : [x === 'veryfast' || x === 'medium' || x === 'slow' ? 'ultrafast' : x]));
  const variants: Array<[string, string[]]> = [
    ['as saved (fast preset)', strip(base)],
    ['without -shortest', strip(base.filter((x) => x !== '-shortest'))],
    // The fix: the same command with the setpts step taken out of the video chain. Expect about voice + tail.
    ['setpts removed (the fix), as saved otherwise', strip(base).map((x) => x.replace(/,setpts=[^,;[]+/, ''))],
    ['picture only (no audio map)', strip(base.filter((x) => x !== '-shortest')).flatMap((x, i, a) => (x === '-map' && a[i + 1] === '[outa]') || (a[i - 1] === '-map' && x === '[outa]') ? [] : [x])],
  ];
  for (const [label, args] of variants) {
    try {
      const { stdout } = await execFileAsync(env.FFMPEG_PATH, ['-v', 'error', '-nostats', ...args, '-progress', 'pipe:1', '-f', 'null', '-'], { cwd, maxBuffer: 64 * 1024 * 1024, timeout: 540000 });
      const t = [...stdout.matchAll(/out_time_us=(\d+)/g)].pop();
      line(`mux replay ${label}`, t ? fmt(Number(t[1]) / 1e6) : 'n/a');
    } catch (error) {
      line(`mux replay ${label}`, `failed: ${error instanceof Error ? error.message.slice(0, 300) : String(error)}`);
    }
  }
}

async function probeStreamSeconds(p: string, type: 'v' | 'a'): Promise<number | null> {
  const out = await ffprobe(['-select_streams', type, '-show_entries', 'stream=duration', '-of', 'default=noprint_wrappers=1:nokey=1', p]);
  const n = out === null ? NaN : parseFloat(out.split('\n')[0] ?? '');
  return Number.isFinite(n) ? n : null;
}

// The brief fixes sentences with: first|last sentence [must be] exactly: "..."  (same wording brief-checks.ts reads).
function fixedSentences(brief: string): Array<{ which: string; text: string }> {
  return [...brief.matchAll(/\b(first|last) sentence\s+(?:must be\s+)?exactly\s*:?\s*[“”"]([^“”"]+)[“”"]/gi)].map((m) => ({ which: m[1].toLowerCase(), text: m[2] }));
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 0);
}

// The voice MP3 path is not stored in the stage row. It is DATA_DIR/media-tmp/<uuid>.mp3, written just before the
// transcript, so take the newest MP3 not newer than the transcript file (a guess, flagged as such).
async function findVoiceFile(transcriptPath: string): Promise<{ path: string; note: string } | null> {
  const tmp = path.join(DATA_DIR, 'media-tmp');
  const tStat = await fs.stat(transcriptPath);
  const files = (await fs.readdir(tmp).catch(() => [] as string[])).filter((f) => f.endsWith('.mp3'));
  const cand: Array<{ f: string; m: number }> = [];
  for (const f of files) cand.push({ f, m: (await fs.stat(path.join(tmp, f))).mtimeMs });
  const before = cand.filter((c) => c.m <= tStat.mtimeMs + 2000).sort((a, b) => b.m - a.m)[0];
  if (!before) return null;
  return { path: path.join(tmp, before.f), note: `guessed by mtime, ${((tStat.mtimeMs - before.m) / 1000).toFixed(0)}s before the transcript was written` };
}

// Per-frame timing of a video: frame count, smallest and largest gap between frames, repeated and missing frames.
type FrameStats = { frames: number; first: number; last: number; minGapMs: number; maxGapMs: number; duplicated: number; dropped: number };

async function frameStats(p: string): Promise<FrameStats | null> {
  const rate = await ffprobe(['-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate', '-of', 'default=noprint_wrappers=1:nokey=1', p]);
  const [num, den] = (rate ?? '30/1').split('/').map(Number);
  const nominal = (den || 1) / (num || 30);
  // Packet timestamps (one packet per frame in these files): the frame=pts_time query is empty on ffmpeg 8.0.1.
  const out = await ffprobe(['-select_streams', 'v:0', '-show_entries', 'packet=pts_time', '-of', 'csv=p=0', p]);
  const pts = (out ?? '').split('\n').map((l) => Number(l.split(',')[0])).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (pts.length < 2) return null;
  const gaps = pts.slice(1).map((t, i) => t - pts[i]);
  return {
    frames: pts.length,
    first: pts[0],
    last: pts[pts.length - 1],
    minGapMs: Math.min(...gaps) * 1000,
    maxGapMs: Math.max(...gaps) * 1000,
    duplicated: gaps.filter((g) => g < nominal / 100).length,
    dropped: gaps.reduce((sum, g) => sum + Math.max(0, Math.round(g / nominal) - 1), 0),
  };
}

function printFrameRow(label: string, s: FrameStats | null): void {
  const cell = (v: string, w: number): string => v.padStart(w);
  const cols = s
    ? [cell(String(s.frames), 7), cell(`${s.first.toFixed(3)}..${s.last.toFixed(3)}`, 17), cell(s.minGapMs.toFixed(2), 10), cell(s.maxGapMs.toFixed(2), 10), cell(String(s.duplicated), 6), cell(String(s.dropped), 8)].join(' ')
    : 'unreadable';
  console.log(`  ${label.padEnd(40)} ${cols}`);
}

// Frame timing of the saved final file, of the saved mux re-rendered unchanged, and re-rendered with the setpts step
// removed (the fix). The two re-renders are written to a temporary directory under the system temp dir and deleted
// afterwards; nothing in the data directory or database is touched, and nothing is paid for.
async function frameTable(dir: string, n: number): Promise<void> {
  const ff = asObject(JSON.parse(await fs.readFile(path.join(dir, `${n}.ffmpeg-args.json`), 'utf8')));
  const args = (ff.args as string[] | undefined) ?? [];
  const at = args.indexOf('-filter_complex');
  if (at < 0) throw new Error('the saved ffmpeg args have no -filter_complex');
  const cwd = typeof ff.cwd === 'string' && (await exists(ff.cwd)) ? ff.cwd : dir;
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'diagnose-frames-'));
  console.log(`\n-- Frame timing (${dir}, attempt ${n}) --`);
  console.log(`  ${'render'.padEnd(40)} ${['frames'.padStart(7), 'first..last (s)'.padStart(17), 'min gap ms'.padStart(10), 'max gap ms'.padStart(10), 'dupl.'.padStart(6), 'dropped'.padStart(8)].join(' ')}`);
  try {
    printFrameRow('picture fed to the mux (input 0)', await frameStats(path.resolve(cwd, args[args.indexOf('-i') + 1])));
    printFrameRow(`saved final file (${n}.mp4)`, await frameStats(path.join(dir, `${n}.mp4`)));
    for (const [label, fixed] of [['replay, as saved', false], ['replay, setpts removed (the fix)', true]] as const) {
      const out = path.join(tmp, fixed ? 'fixed.mp4' : 'as-saved.mp4');
      const replay = [...args.slice(0, -1), out];
      replay[at + 1] = fixed ? String(args[at + 1]).replace(/,setpts=[^,;[]+/, '') : String(args[at + 1]);
      try {
        await execFileAsync(env.FFMPEG_PATH, ['-v', 'error', '-nostats', ...replay], { cwd, maxBuffer: 64 * 1024 * 1024, timeout: 900000 });
        printFrameRow(label, await frameStats(out));
      } catch (error) {
        console.log(`  ${label.padEnd(40)} failed: ${error instanceof Error ? error.message.slice(-200) : String(error)}`);
      }
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

// The newest completed Shorts, each measured against the three length guards (the same functions the pipeline uses).
async function recentRuns(limit: number): Promise<void> {
  const stages = await prisma.pipelineStage.findMany({
    where: { stageName: 'video_generation', status: 'completed' },
    orderBy: { createdAt: 'desc' },
    take: limit * 3,
    select: { pipelineRunId: true, attemptNumber: true, output: true },
  });
  console.log(`\n-- Last ${limit} completed Shorts against the length guards (end tail ${END_TAIL_SECONDS}s, minimum ${SHORT_MIN_NARRATION_FRACTION} of the voice) --`);
  const head = ['run', 'att', 'final', 'transcript', 'voice file', 'voice-asr', 'final-(v+tail)', 'final/voice', '(a)', '(b)', '(c)'];
  console.log(`  ${head.map((h, i) => (i === 0 ? h.padEnd(9) : h.padStart(i === 1 ? 4 : 13))).join(' ')}`);
  let shown = 0;
  for (const s of stages) {
    if (shown >= limit) break;
    const out = asObject(s.output);
    if (out.videoKind === 'long' || typeof out.durationSeconds !== 'number') continue;
    const transcriptPath = path.join(DATA_DIR, 'videos', s.pipelineRunId, `${s.attemptNumber}.transcript.json`);
    if (!(await exists(transcriptPath))) continue;
    shown += 1;
    const asr = asObject(JSON.parse(await fs.readFile(transcriptPath, 'utf8'))).audioDurationSeconds as number;
    const voiceFile = await findVoiceFile(transcriptPath);
    const voice = voiceFile ? await probeFormatSeconds(voiceFile.path) : null;
    const basis = voice ?? asr;
    const verdictA = voice === null ? 'n/a' : Math.abs(voice - asr) > VOICE_LENGTH_TOLERANCE_SECONDS ? 'FAIL' : 'ok';
    const verdictB = Math.abs(out.durationSeconds - (basis + END_TAIL_SECONDS)) > FINAL_LENGTH_TOLERANCE_SECONDS ? 'FAIL' : 'ok';
    const verdictC = out.durationSeconds < basis * SHORT_MIN_NARRATION_FRACTION ? 'FAIL' : 'ok';
    const cols = [
      s.pipelineRunId.slice(0, 8).padEnd(9),
      String(s.attemptNumber).padStart(4),
      out.durationSeconds.toFixed(2).padStart(13),
      asr.toFixed(2).padStart(13),
      (voice === null ? 'n/a' : voice.toFixed(2)).padStart(13),
      (voice === null ? 'n/a' : (voice - asr).toFixed(2)).padStart(13),
      (out.durationSeconds - (basis + END_TAIL_SECONDS)).toFixed(2).padStart(13),
      (out.durationSeconds / basis).toFixed(3).padStart(13),
      verdictA.padStart(13),
      verdictB.padStart(13),
      verdictC.padStart(13),
    ];
    console.log(`  ${cols.join(' ')}`);
  }
  if (shown === 0) console.log('  no completed Short with a transcript on disk');
}

async function pickRun(): Promise<string> {
  const positional = process.argv.slice(2).find((a, i, all) => !a.startsWith('--') && !(i > 0 && all[i - 1].startsWith('--')));
  const search = arg('--brief-contains');
  if (!search) {
    if (!positional) throw new Error('give a <runId> or --brief-contains "text"');
    return positional;
  }
  const runs = await prisma.pipelineRun.findMany({
    where: { briefText: { contains: search, mode: 'insensitive' } },
    orderBy: { createdAt: 'desc' },
    include: { channel: { select: { name: true } }, stages: { select: { stageName: true } } },
  });
  console.log(`Runs whose brief contains ${JSON.stringify(search)} (newest first): ${runs.length}`);
  for (const r of runs) {
    const attempts = r.stages.filter((s) => s.stageName === 'video_generation').length;
    console.log(`  ${r.id}  channel=${JSON.stringify(r.channel.name)}  created=${r.createdAt.toISOString()}  status=${r.status}  video_generation attempts=${attempts}`);
  }
  if (runs.length === 0) throw new Error('no run matches');
  if (runs.length > 1) console.log('More than one match: diagnosing the newest only.');
  return runs[0].id;
}

async function main(): Promise<void> {
  if (process.argv.includes('--frame-table') && arg('--dir')) {
    await frameTable(path.resolve(arg('--dir') as string), Number(arg('--attempt') ?? 1));
    return;
  }
  if (process.argv.includes('--recent-runs')) {
    const asked = Number(arg('--recent-runs'));
    await recentRuns(Number.isInteger(asked) && asked > 0 ? asked : 8);
    return;
  }
  const runId = await pickRun();
  const run = await prisma.pipelineRun.findUniqueOrThrow({ where: { id: runId }, include: { channel: { select: { name: true } } } });
  const stages = await prisma.pipelineStage.findMany({ where: { pipelineRunId: runId, stageName: 'video_generation' }, orderBy: { attemptNumber: 'asc' } });
  if (stages.length === 0) throw new Error(`run ${runId} has no video_generation stage`);
  const wanted = arg('--attempt');
  const stage = wanted ? stages.find((s) => s.attemptNumber === Number(wanted)) : stages[stages.length - 1];
  if (!stage) throw new Error(`no video_generation attempt ${wanted}; have ${stages.map((s) => s.attemptNumber).join(',')}`);
  const n = stage.attemptNumber;
  const input = asObject(stage.input);
  const output = asObject(stage.output);
  const creation = asObject(run.creationOptions);

  console.log(`\n=== Run ${runId} attempt ${n} ===`);
  line('channel', JSON.stringify(run.channel.name));
  line('run status / current stage', `${run.status} / ${run.currentStage ?? 'n/a'}`);
  line('stage status / error', `${stage.status} / ${stage.error ?? 'none'}`);
  line('creationOptions', JSON.stringify(creation));
  line('brief', JSON.stringify(run.briefText.length > 300 ? `${run.briefText.slice(0, 300)}...` : run.briefText));

  const dir = path.join(DATA_DIR, 'videos', runId);
  const transcriptPath = path.join(dir, `${n}.transcript.json`);
  const transcript = (await exists(transcriptPath)) ? asObject(JSON.parse(await fs.readFile(transcriptPath, 'utf8'))) : null;
  const segments = Array.isArray(transcript?.segments) ? (transcript!.segments as Array<{ text: string; startMs: number; endMs: number }>) : [];
  const asrSeconds = typeof transcript?.audioDurationSeconds === 'number' ? transcript.audioDurationSeconds : null;

  console.log('\n-- Voice --');
  let voicePath = arg('--voice') ?? null;
  let voiceNote = 'given with --voice';
  if (!voicePath && transcript) {
    const guess = await findVoiceFile(transcriptPath);
    if (guess) {
      voicePath = guess.path;
      voiceNote = guess.note;
    }
  }
  const voiceSeconds = voicePath && (await exists(voicePath)) ? await probeFormatSeconds(voicePath) : null;
  line('voice MP3 path', voicePath ? `${voicePath} (${voiceNote})` : 'not found (media-tmp cleaned, or other server): pass --voice <file>');
  line('voice MP3 length (ffprobe)', fmt(voiceSeconds));
  line('transcript.json audioDurationSeconds', fmt(asrSeconds));
  const lastEnd = segments.length ? segments[segments.length - 1].endMs / 1000 : null;
  line('transcript word count / last word end', `${segments.length} / ${fmt(lastEnd)}`);
  if (voiceSeconds !== null && asrSeconds !== null) {
    line('voice minus transcription duration', `${(voiceSeconds - asrSeconds).toFixed(2)}s ${Math.abs(voiceSeconds - asrSeconds) > 1 ? '  <-- DIFFER by more than 1s' : '(ok)'}`);
  }
  const usage = await prisma.usageEvent.findMany({ where: { stageId: stage.id }, select: { characterCount: true, audioDurationSeconds: true, metadata: true } });
  for (const u of usage) {
    line('usage row characterCount / audioSeconds', `${u.characterCount ?? 'n/a'} / ${u.audioDurationSeconds?.toString() ?? 'n/a'}`);
  }

  console.log('\n-- Picture and final file --');
  const stockPath = path.join(dir, `${n}-stock.mp4`);
  const stillsPath = path.join(dir, `${n}-stills.mp4`);
  for (const [label, p] of [['stock picture', stockPath], ['stills picture', stillsPath]] as const) {
    line(`${label} length (container)`, (await exists(p)) ? fmt(await probeFormatSeconds(p)) : 'file not on disk');
    if (await exists(p)) {
      line(`${label} really decoded`, await decodeCheck(p));
    }
  }
  const finalPath = path.join(dir, `${n}.mp4`);
  if (await exists(finalPath)) {
    line('final mp4 container / video / audio length', `${fmt(await probeFormatSeconds(finalPath))} / ${fmt(await probeStreamSeconds(finalPath, 'v'))} / ${fmt(await probeStreamSeconds(finalPath, 'a'))}`);
  } else {
    line('final mp4', 'not on disk');
  }
  if (await exists(finalPath)) line('final mp4 really decoded', await decodeCheck(finalPath));
  const ffArgsPath = path.join(dir, `${n}.ffmpeg-args.json`);
  if (await exists(ffArgsPath)) {
    const ff = asObject(JSON.parse(await fs.readFile(ffArgsPath, 'utf8')));
    line('-shortest in ffmpeg args', String((ff.args as string[] | undefined)?.includes('-shortest')));
    line('filter_complex', String(ff.filterComplex));
    await replayAudio(ff, dir);
    if (process.argv.includes('--replay-mux')) await replayMux(ff, dir);
  }

  console.log('\n-- Stage output --');
  line('output.durationSeconds', fmt(typeof output.durationSeconds === 'number' ? output.durationSeconds : null));
  line('output.voiceDurationSeconds', typeof output.voiceDurationSeconds === 'number' ? fmt(output.voiceDurationSeconds) : 'absent from this stage row');
  const planFile = path.join(dir, `${n}.plan.json`);
  const plan = asObject(output.plan ?? ((await exists(planFile)) ? JSON.parse(await fs.readFile(planFile, 'utf8')) : null));
  const queries = Array.isArray(plan.stockFootageQueries) ? (plan.stockFootageQueries as string[]) : null;
  const prompts = Array.isArray(plan.stillScenePrompts) ? (plan.stillScenePrompts as string[]) : null;
  line('plan visualSource / captionStyle / audioLayer', `${plan.visualSource ?? 'n/a'} / ${plan.captionStyle ?? 'n/a'} / ${plan.audioLayer ?? 'n/a'}`);
  line('plan stock queries (beats)', queries ? `${queries.length}: ${queries.map((q) => JSON.stringify(q)).join(' | ')}` : `none (single query ${JSON.stringify(plan.stockFootageQuery ?? null)})`);
  line('plan still prompts', prompts ? String(prompts.length) : 'none');
  for (const u of usage) {
    const m = asObject(u.metadata);
    if (m.stockFootageClipCount !== undefined) line('stock clips actually used', String(m.stockFootageClipCount));
  }

  console.log('\n-- Script and brief sentences --');
  const scriptText = typeof input.scriptText === 'string' ? input.scriptText : '';
  line('scriptText word count', scriptText ? String(words(scriptText).length) : 'EMPTY: stage input has no scriptText');
  const heard = normalize(segments.map((s) => s.text).join(' '));
  const scriptNorm = normalize(scriptText);
  if (segments.length && scriptText) {
    line('transcript words / script words', `${segments.length} / ${words(scriptText).length}  (${((segments.length / words(scriptText).length) * 100).toFixed(0)}% heard)`);
  }
  const fixed = fixedSentences(run.briefText);
  if (fixed.length === 0) console.log('  (the brief has no `first/last sentence exactly: "..."` clause)');
  for (const f of fixed) {
    const inScript = scriptNorm.includes(normalize(f.text));
    const inVoice = heard.includes(normalize(f.text));
    const atEdge = f.which === 'first' ? scriptText.trimStart().startsWith(f.text) : scriptText.trimEnd().endsWith(f.text);
    console.log(`  FIXED ${f.which.toUpperCase()}: ${JSON.stringify(f.text)}`);
    line('  in scriptText / at the right end, verbatim', `${inScript ? 'PRESENT' : 'MISSING'} / ${atEdge ? 'yes' : 'no'}`);
    line('  in the narration the transcript heard', inVoice ? 'PRESENT' : 'MISSING');
  }
  const lastFixed = fixed.find((f) => f.which === 'last');
  if (lastFixed && segments.length && !heard.includes(normalize(lastFixed.text))) {
    const tail = normalize(lastFixed.text).split(' ').slice(-3).join(' ');
    console.log(`  ==> The video ENDS BEFORE the last fixed sentence: the transcript's final words are ${JSON.stringify(segments.slice(-6).map((s) => s.text).join(' '))} (expected tail "${tail}").`);
  }
  console.log('  Other brief sentences (informational, a brief is instructions so most will not appear verbatim):');
  for (const s of splitSentences(run.briefText)) {
    line(`  ${JSON.stringify(s.length > 60 ? `${s.slice(0, 60)}...` : s)}`, scriptNorm.includes(normalize(s)) ? 'present in scriptText' : 'not in scriptText');
  }

  console.log('\nRead-only: nothing was written or paid for.');
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
