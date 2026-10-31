import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

vi.hoisted(() => {
  process.env.MEDIA_STUB = '1';
  process.env.AI_VISUALS_STUB = '1';
});

import { generateVideo } from './index';
import { DATA_DIR } from '../../config/paths';

// The inline snapshot covers the shared Shorts mux for both AI stills and
// stock footage. Paths and measured loudness values are normalised so it
// holds across machines; deliberate render changes must update this contract.
function normalise(args: string[], outputDir: string, ttsAudioPath: string): string[] {
  return args.map((a) =>
    a
      .split(ttsAudioPath).join('<tts>')
      .split(outputDir).join('<out>')
      .split(DATA_DIR).join('<data>')
      .replace(/(measured_\w+|offset)=-?[\d.]+/g, '$1=<n>')
      .replace(/voiceDurationSeconds=[\d.]+/g, 'x')
      .replace(/st=[\d.]+/g, 'st=<n>')
      .replace(/volume=-?[\d.]+dB/g, 'volume=<db>')
      .replace(/\\/g, '/'),
  );
}

describe('Shorts render command', () => {
  it('uses a constant frame clock and the shared AAC target', async () => {
    const runId = `shorts-golden-${Date.now()}`;
    const result = await generateVideo({
      pipelineRunId: runId,
      attemptNumber: 1,
      scriptText: 'The old bridge was built in 1412. It still carries every load that crosses it today. Stone remembers.',
      brandAssets: { captionsEnabled: true } as never,
      plan: {
        visualSource: 'ai-stills',
        stockFootageQuery: 'bridge',
        stillScenePrompts: ['a stone bridge at dawn', 'a stone bridge at dusk', 'a stone bridge in rain'],
        captionStyle: 'phrase-grouped',
        audioLayer: 'none',
        pacingNotes: 'golden',
        rationale: 'golden',
      },
    });
    const notes = JSON.parse(await fs.readFile(result.artifacts.ffmpegArgsJsonPath, 'utf-8')) as { args: string[]; cwd: string; filterComplex: string };
    const normalised = normalise(notes.args, notes.cwd, result.artifacts.ttsAudioPath);
    expect(normalised).toMatchInlineSnapshot(`
      [
        "-y",
        "-i",
        "<out>/1-stills.mp4",
        "-i",
        "<tts>",
        "-filter_complex",
        "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setpts=N/(30*TB),tpad=stop_mode=clone:stop_duration=1.20,ass=1.ass:fontsdir=../../fonts[outv];[1:a]aformat=channel_layouts=stereo,apad=pad_dur=0.700,loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=<n>:measured_TP=<n>:measured_LRA=<n>:measured_thresh=<n>:offset=<n>:linear=true,aresample=48000[outa]",
        "-map",
        "[outv]",
        "-map",
        "[outa]",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "20",
        "-profile:v",
        "high",
        "-pix_fmt",
        "yuv420p",
        "-r",
        "30",
        "-fps_mode",
        "cfr",
        "-video_track_timescale",
        "15360",
        "-movflags",
        "+faststart",
        "-c:a",
        "aac",
        "-b:a",
        "320k",
        "-ar",
        "48000",
        "-shortest",
        "1.mp4",
      ]
    `);
    expect(result.output.aspectRatio).toBe('9:16');
    
    await fs.rm(path.join(DATA_DIR, 'videos', runId), { recursive: true, force: true });
  }, 120_000);
});
