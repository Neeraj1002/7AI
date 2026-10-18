import { describe, it, expect } from 'vitest';
import { evaluateQualityRows, hardFailureReason, collectSoftWarnings } from './quality-metrics';
import { qualityProfileFor, SHORT_PROFILE, QUALITY_SPEC } from '../video-generation/quality-spec';
import { buildSystemPrompt, chapterSampleTimestamps, locatedVisualDefects, MAX_REVIEW_FRAMES } from './index';
import { buildUserMessage, LONG_FORM_SYSTEM_PROMPT, SYSTEM_PROMPT, ScriptReviewOutputSchema } from '../script-review';
import type { QualityMetrics } from '../video-generation/quality-spec';

const longProfile = qualityProfileFor('long', 6);

const metrics = (over: Partial<QualityMetrics> = {}): QualityMetrics => ({
  integratedLufs: -14,
  truePeakDb: -2,
  width: 1920,
  height: 1080,
  fps: 30,
  avgFps: 30,
  videoCodec: 'h264',
  videoProfile: 'High',
  pixFmt: 'yuv420p',
  audioCodec: 'aac',
  audioSampleRate: 48000,
  audioBitrateKbps: 192,
  hasAudio: true,
  longestShotSeconds: 6,
  shotCount: 40,
  captionsExpected: false,
  captionsDetected: null,
  softWarnings: [],
  ...over,
});

describe('quality profile selection', () => {
  it('short is the existing spec', () => {
    expect(qualityProfileFor('short')).toBe(SHORT_PROFILE);
    expect(qualityProfileFor(undefined)).toBe(SHORT_PROFILE);
    expect(SHORT_PROFILE).toMatchObject({ width: 1080, height: 1920, fps: 30, checkCaptions: true, maxShotSeconds: QUALITY_SPEC.shot.maxSeconds });
  });

  it('long is 1920x1080 at 30 fps, 120-900 s, no caption check, shots up to 1.5 x secondsPerStill', () => {
    expect(longProfile).toMatchObject({ width: 1920, height: 1080, fps: 30, checkCaptions: false, minDurationSec: 96, maxDurationSec: 918, maxShotSeconds: 9 });
    expect(qualityProfileFor('long').maxShotSeconds).toBe(7.5); // default 5 s per still
  });
});

describe('long-form rows', () => {
  it('a 6 s still held 9 s is fine, 9.5 s warns', () => {
    expect(evaluateQualityRows(metrics({ longestShotSeconds: 9 }), 'ai-stills', longProfile).longestShot?.warn).toBe(false);
    const warn = evaluateQualityRows(metrics({ longestShotSeconds: 9.5 }), 'ai-stills', longProfile).longestShot;
    expect(warn?.warn).toBe(true);
    expect(warn?.message).toContain('9s');
  });

  it('the same 6 s shot warns for a Short (4 s limit): Shorts unchanged', () => {
    expect(evaluateQualityRows(metrics({ longestShotSeconds: 6, width: 1080, height: 1920 }), 'ai-stills').longestShot?.warn).toBe(true);
  });

  it('has no captions row for long, even when metrics say captions were expected', () => {
    const rows = evaluateQualityRows(metrics({ captionsExpected: true, captionsDetected: false }), 'ai-stills', longProfile);
    expect(rows.captions).toBeUndefined();
    const shortRows = evaluateQualityRows(metrics({ captionsExpected: true, captionsDetected: false }), 'ai-stills');
    expect(shortRows.captions?.warn).toBe(true);
  });

  it('every present row carries a warn flag and warnings match', () => {
    const m = metrics({ integratedLufs: -11.5 });
    const rows = evaluateQualityRows(m, 'ai-stills', longProfile);
    for (const r of Object.values(rows)) expect(typeof r.warn).toBe('boolean');
    expect(collectSoftWarnings(m, 'ai-stills', longProfile)).toEqual(
      Object.values(rows).flatMap((r) => (r.warn && r.message ? [r.message] : [])),
    );
  });
});

describe('long-form hard failures', () => {
  it('passes a good 1920x1080 video that follows the narration', () => {
    expect(hardFailureReason(metrics(), longProfile, { videoSeconds: 121, narrationSeconds: 120 })).toBeNull();
  });

  it('blocks the portrait Short size, bad fps, no audio, bad loudness', () => {
    expect(hardFailureReason(metrics({ width: 1080, height: 1920 }), longProfile)).toMatch(/Wrong resolution/);
    expect(hardFailureReason(metrics({ fps: 25 }), longProfile)).toMatch(/Wrong frame rate/);
    expect(hardFailureReason(metrics({ avgFps: 20 }), longProfile)).toMatch(/Variable frame rate/);
    expect(hardFailureReason(metrics({ hasAudio: false }), longProfile)).toMatch(/no audio/);
    expect(hardFailureReason(metrics({ integratedLufs: -20 }), longProfile)).toMatch(/Loudness/);
  });

  it('blocks a duration out of range and a video more than 2% off the narration', () => {
    expect(hardFailureReason(metrics(), longProfile, { videoSeconds: 90 })).toMatch(/minimum/);
    expect(hardFailureReason(metrics(), longProfile, { videoSeconds: 950, narrationSeconds: 950 })).toMatch(/maximum/);
    expect(hardFailureReason(metrics(), longProfile, { videoSeconds: 125, narrationSeconds: 120 })).toMatch(/narration/);
    expect(hardFailureReason(metrics(), longProfile, { videoSeconds: 122.3, narrationSeconds: 120 })).toBeNull();
  });

  it('keeps long-shot pacing warning-only by default and can opt into a targeted AI-stills retry', () => {
    const overlong = metrics({ longestShotSeconds: 9.5 });
    expect(hardFailureReason(overlong, longProfile)).toBeNull();
    expect(hardFailureReason(overlong, longProfile, undefined, { enforceLongShotPacing: true })).toMatch(
      /Longest AI still shot is 9\.5s.*redistribute scene starts more evenly/,
    );
    expect(hardFailureReason(metrics({ longestShotSeconds: 9 }), longProfile, undefined, { enforceLongShotPacing: true })).toBeNull();
    expect(hardFailureReason(
      metrics({ longestShotSeconds: 9.5, width: SHORT_PROFILE.width, height: SHORT_PROFILE.height }),
      SHORT_PROFILE,
      undefined,
      { enforceLongShotPacing: true },
    )).toBeNull();
  });

  it('a Short ignores the long-form duration rules and still wants 1080x1920', () => {
    const short = metrics({ width: 1080, height: 1920 });
    expect(hardFailureReason(short)).toBeNull();
    expect(hardFailureReason(short, SHORT_PROFILE, { videoSeconds: 30, narrationSeconds: 50 })).toBeNull();
    expect(hardFailureReason(metrics())).toMatch(/Wrong resolution/);
  });
});

describe('frame sampling for visual review', () => {
  it('only exposes a defect when its scene ID and timestamp match a sampled mapped scene', () => {
    const map = [{ sceneId: '0:0', startSec: 0, endSec: 2 }, { sceneId: '1:0', startSec: 2, endSec: 4 }];
    const defect = { sceneId: '1:0', timestampSeconds: 3, kind: 'continuity' as const,
      reason: 'outfit changed', requiredVisualConstraints: ['same coat'] };
    expect(locatedVisualDefects([defect], [1, 3], map)).toEqual([defect]);
    expect(locatedVisualDefects([{ ...defect, timestampSeconds: 1 }], [1, 3], map)).toEqual([]);
    expect(locatedVisualDefects([{ ...defect, timestampSeconds: 2.5 }], [1, 3], map)).toEqual([]);
    expect(locatedVisualDefects([{ ...defect, sceneId: undefined }], [1, 3], map)).toEqual([]);
  });
  it('takes one frame inside every chapter', () => {
    const chapters = [
      { title: 'a', startSec: 0, endSec: 40 },
      { title: 'b', startSec: 40, endSec: 100 },
      { title: 'c', startSec: 100, endSec: 120 },
    ];
    const ts = chapterSampleTimestamps(chapters, 120.7);
    expect(ts).toEqual([20, 70, 110]);
    ts.forEach((t, i) => {
      expect(t).toBeGreaterThanOrEqual(chapters[i].startSec);
      expect(t).toBeLessThan(chapters[i].endSec);
    });
  });

  it('caps the number of frames and keeps the first and last chapter', () => {
    const chapters = Array.from({ length: 30 }, (_, i) => ({ title: String(i), startSec: i * 20, endSec: i * 20 + 20 }));
    const ts = chapterSampleTimestamps(chapters, 600);
    expect(ts).toHaveLength(MAX_REVIEW_FRAMES);
    expect(ts[0]).toBe(10);
    expect(ts[ts.length - 1]).toBe(590);
  });

  it('the Short prompt is unchanged and the long prompt names the chapter frames', () => {
    expect(buildSystemPrompt('ai-stills')).toContain('3 frames sampled at different points');
    expect(buildSystemPrompt('ai-stills')).toContain('short vertical video (a YouTube Short)');
    const long = buildSystemPrompt('ai-stills', false, { frameCount: 5 });
    expect(long).toContain('5 key frames, one sampled within each chapter');
    expect(long).toContain('generated still compositions animated by supported FFmpeg pan/zoom');
    expect(long).not.toMatch(/Runway|Hunyuan|organic physical motion/);
    expect(long).not.toContain('YouTube Short)');
    expect(buildSystemPrompt('stock-footage')).toContain('real licensed stock footage');
  });
});

describe('script review rubric selection', () => {
  const base = { scriptText: 's', captions: 'c', nicheDescription: 'n' };

  it('a Short message and prompt are unchanged', () => {
    expect(buildUserMessage({ ...base, targetSeconds: 45 })).toContain('(never more than 60)');
    expect(buildUserMessage({ ...base, targetSeconds: 45 })).not.toContain('Chapters');
    expect(SYSTEM_PROMPT).toContain('YouTube Shorts');
  });

  it('long lists the chapters, the minutes and the length flag', () => {
    const msg = buildUserMessage({
      ...base,
      videoKind: 'long',
      targetSeconds: 600,
      chapterTitles: ['Open', 'Why'],
      lengthOutOfRange: true,
    });
    expect(msg).toContain('Chapters, in order: 1. Open; 2. Why');
    expect(msg).toContain('10 minutes');
    expect(msg).not.toContain('never more than 60');
    expect(msg).toContain('word count was outside');
    expect(LONG_FORM_SYSTEM_PROMPT).toContain('Open loops');
    expect(LONG_FORM_SYSTEM_PROMPT).toContain('Closing line');
  });

  it('chapterNotes are optional in the output', () => {
    const out = {
      score: 8,
      notes: 'n',
      hookScore: 7,
      hookNotes: 'h',
      videoGenFit: { fitsLengthLimit: true, pacingRealistic: true, visualsProducible: true, flags: [] },
      factualConcerns: [],
    };
    expect(ScriptReviewOutputSchema.parse(out).chapterNotes).toBeUndefined();
    const withNotes = ScriptReviewOutputSchema.parse({ ...out, chapterNotes: [{ chapterTitle: 'a', note: 'b' }] });
    expect(withNotes.chapterNotes).toEqual([{ chapterTitle: 'a', note: 'b' }]);
  });
});
