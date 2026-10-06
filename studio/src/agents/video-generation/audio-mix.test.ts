import { describe, it, expect } from 'vitest';
import { buildAudioFilterGraph, computeBedGainDb, parseLoudnormJson } from './audio-mix';

describe('buildAudioFilterGraph (Sprint 4 Task 8, R1)', () => {
  it('always masters: a voice-only render still gets loudnorm to -14 LUFS / -1.5 dBTP and 48 kHz stereo', () => {
    const g = buildAudioFilterGraph({ voiceInputIndex: 1 });
    expect(g).toContain('loudnorm=I=-14:TP=-1.5:LRA=11');
    expect(g).toContain('aresample=48000');
    expect(g).toContain('aformat=channel_layouts=stereo');
    expect(g).not.toContain('amix');
    expect(g.endsWith('[outa]')).toBe(true);
  });

  it('with a bed: the voice is the sidechain key, the mix is not renormalised, loudnorm is last', () => {
    const g = buildAudioFilterGraph({ voiceInputIndex: 1, bedInputIndex: 3, bedGainDb: -6.1 });
    expect(g).toContain('[1:a]aformat=channel_layouts=stereo,asplit=2[voice][key]');
    expect(g).toContain('[3:a]aformat=channel_layouts=stereo,volume=-6.1dB[bedq]');
    expect(g).toContain('[bedq][key]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=300[ducked]');
    expect(g).toContain('amix=inputs=2:duration=first:normalize=0');
    expect(g).not.toContain('weights');
    expect(g.indexOf('amix')).toBeLessThan(g.indexOf('loudnorm'));
  });

  it('pass 2 applies the pass-1 measurement linearly; pass 1 stops at a JSON-printing loudnorm', () => {
    const measured = { inputI: -25.3, inputTp: -9.1, inputLra: 4.2, inputThresh: -35.4, targetOffset: 0.3 };
    const two = buildAudioFilterGraph({ voiceInputIndex: 0, measured });
    expect(two).toContain('measured_I=-25.3:measured_TP=-9.1:measured_LRA=4.2:measured_thresh=-35.4:offset=0.3:linear=true');
    const one = buildAudioFilterGraph({ voiceInputIndex: 0, measureOnly: true });
    expect(one).toContain('print_format=json');
    expect(one).not.toContain('aresample');
  });
});

describe('parseLoudnormJson', () => {
  it('reads the measurement block ffmpeg prints at the end of stderr', () => {
    const stderr = `size=N/A
{
	"input_i" : "-25.31",
	"input_tp" : "-9.10",
	"input_lra" : "4.20",
	"input_thresh" : "-35.41",
	"output_i" : "-14.40",
	"target_offset" : "0.30"
}`;
    expect(parseLoudnormJson(stderr)).toEqual({ inputI: -25.31, inputTp: -9.1, inputLra: 4.2, inputThresh: -35.41, targetOffset: 0.3 });
  });

  it('returns undefined (single-pass fallback) when there is no parsable block', () => {
    expect(parseLoudnormJson('nothing here')).toBeUndefined();
    expect(parseLoudnormJson('{"input_i":"-inf"}')).toBeUndefined();
  });
});

describe('computeBedGainDb', () => {
  it('puts the bed 15 dB under the measured voice, for quiet and loud beds alike', () => {
    expect(computeBedGainDb(-25.7, -34.6)).toBe(-6.1); // quiet synthetic bed: raised
    expect(computeBedGainDb(-25.7, -14)).toBe(-26.7); // loud licensed track: pulled well down
  });

  it('clamps extreme measurements and falls back to 0 dB when unmeasurable', () => {
    expect(computeBedGainDb(-25, -90)).toBe(12);
    expect(computeBedGainDb(-25, 0)).toBe(-40);
    expect(computeBedGainDb(null, -30)).toBe(0);
    expect(computeBedGainDb(-25, null)).toBe(0);
  });
});
