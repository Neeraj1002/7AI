import { describe, it, expect } from 'vitest';
import { buildChapterList, appendChapterList, formatTimestamp, stripShortsTag, stripShortsFromTags } from './chapters';
import { creditLinesForBeds, licenseRequiresAttribution, bedsUsed } from './credits';
import { buildPreviewArgs, previewPathFor, PREVIEW_SPEC } from './preview';
import { readChapterTimings } from './artifacts';
import { deriveLongFormRunFields, mergeChapters } from './run-fields';
import {
  subtitlesFailureMessage,
  SUBTITLES_RECONNECT_MESSAGE,
  SUBTITLES_REJECTED_MESSAGE,
  buildCaptionsMetadataPart,
} from '../agents/publishing/youtube-client';
import { formatGate2Message } from '../agents/gate2';

const t = (title: string, startSec: number, endSec: number) => ({ title, startSec, endSec });
const good = [t('Cold open', 0, 45), t('Why it happens', 45, 190), t('What it means', 190, 400), t('Closing', 400, 430)];

describe('chapter list', () => {
  it('formats m:ss and h:mm:ss', () => {
    expect(formatTimestamp(5)).toBe('0:05');
    expect(formatTimestamp(65)).toBe('1:05');
    expect(formatTimestamp(600)).toBe('10:00');
    expect(formatTimestamp(3600)).toBe('1:00:00');
    expect(formatTimestamp(3725.9)).toBe('1:02:05');
  });

  it('starts the list at 00:00 and uses each chapter start', () => {
    expect(buildChapterList(good)).toEqual({
      ok: true,
      text: '00:00 Cold open\n0:45 Why it happens\n3:10 What it means\n6:40 Closing',
    });
  });

  it('refuses fewer than 3 chapters', () => {
    expect(buildChapterList([t('a', 0, 60), t('b', 60, 120)]).ok).toBe(false);
    expect(buildChapterList(undefined).ok).toBe(false);
  });

  it('refuses a chapter shorter than 10 seconds', () => {
    const r = buildChapterList([t('a', 0, 60), t('b', 60, 65), t('c', 65, 200)]);
    expect(r.ok).toBe(false);
    expect((r as { warning: string }).warning).toContain('"b"');
  });

  it('refuses a list that does not start at 0', () => {
    expect(buildChapterList([t('a', 3, 60), t('b', 60, 120), t('c', 120, 200)]).ok).toBe(false);
  });

  it('appends once, after the description', () => {
    const list = (buildChapterList(good) as { text: string }).text;
    const once = appendChapterList('About this video.', list);
    expect(once).toBe(`About this video.\n\n${list}`);
    expect(appendChapterList(once, list)).toBe(once);
  });
});

describe('no #shorts on a long video', () => {
  it('strips the tag from text and tags', () => {
    expect(stripShortsTag('Great video #shorts #history')).toBe('Great video #history');
    expect(stripShortsTag('A title')).toBe('A title');
    expect(stripShortsFromTags(['history', 'Shorts', '#shorts', 'rome'])).toEqual(['history', 'rome']);
  });
});

describe('music credits', () => {
  it('reads attribution from the license text', () => {
    expect(licenseRequiresAttribution('YouTube Audio Library (no attribution required)')).toBe(false);
    expect(licenseRequiresAttribution('CC BY 4.0 - attribution required')).toBe(true);
    expect(licenseRequiresAttribution(undefined)).toBe(false);
  });

  it('credits only the beds that need it, once', () => {
    const manifest = [
      { label: 'A', moodTag: 'calm', license: 'no attribution required' },
      { label: 'B', moodTag: 'calm', license: 'CC BY - attribution required' },
    ];
    expect(creditLinesForBeds(bedsUsed({ plan: { audioLayer: 'calm' } }, manifest))).toEqual(['Music: B']);
    expect(creditLinesForBeds(bedsUsed({ audioBeds: ['A'] }, manifest))).toEqual([]);
    expect(creditLinesForBeds(bedsUsed({ audioBeds: ['B', 'B'] }, manifest))).toEqual(['Music: B']);
  });
});

describe('preview copy', () => {
  it('is 1280x720, 30 fps, 1.5 Mbps video, 96k audio, veryfast', () => {
    const args = buildPreviewArgs('in.mp4', 'out.mp4');
    const joined = args.join(' ');
    expect(args).toContain('scale=1280:720');
    expect(joined).toContain('-r 30');
    expect(joined).toContain('-b:v 1500k');
    expect(joined).toContain('-b:a 96k');
    expect(joined).toContain('-preset veryfast');
    expect(PREVIEW_SPEC.width).toBe(1280);
    expect(previewPathFor('/x/1.mp4')).toBe('/x/1.preview.mp4');
  });
});

describe('subtitle upload failures', () => {
  it('maps a permission 403 to the reconnect message', () => {
    expect(
      subtitlesFailureMessage({ response: { status: 403, data: { error: { errors: [{ reason: 'insufficientPermissions' }] } } } }),
    ).toBe(SUBTITLES_RECONNECT_MESSAGE);
  });

  it('maps everything else to the generic message', () => {
    expect(subtitlesFailureMessage({ response: { status: 400 } })).toBe(SUBTITLES_REJECTED_MESSAGE);
    expect(
      subtitlesFailureMessage({ response: { status: 403, data: { error: { errors: [{ reason: 'quotaExceeded' }] } } } }),
    ).toBe(SUBTITLES_REJECTED_MESSAGE);
    expect(subtitlesFailureMessage(new Error('boom'))).toBe(SUBTITLES_REJECTED_MESSAGE);
  });

  it('builds the captions snippet', () => {
    expect(buildCaptionsMetadataPart({ youtubeVideoId: 'v', language: 'en', name: 'English' })).toEqual({
      snippet: { videoId: 'v', language: 'en', name: 'English', isDraft: false },
    });
  });
});

describe('Gate 2 message', () => {
  it('shows warnings, and is unchanged without them', () => {
    const base = { channelName: 'C', verdict: 'pass', rationale: 'ok' };
    expect(formatGate2Message({ ...base, warnings: ['No chapters.'] })).toContain('Warning: No chapters.');
    expect(formatGate2Message(base)).not.toContain('Warning');
  });
});

describe('runs.get long-form fields', () => {
  const stages = [
    { stageName: 'script_generation', status: 'completed', attemptNumber: 1, output: {} },
    {
      stageName: 'video_generation',
      status: 'completed',
      attemptNumber: 1,
      output: { videoPath: '/v/1.mp4', r2DraftKey: 'd/1.mp4', chapterTimings: good },
    },
    {
      stageName: 'video_review',
      status: 'completed',
      attemptNumber: 1,
      output: { previewPath: '/v/1.preview.mp4', srtPath: '/v/1.srt', r2PreviewKey: 'd/1.preview.mp4', r2SrtKey: 'd/1.srt' },
    },
  ];
  const scriptChapters = good.map((c) => ({ title: c.title, text: 'words' }));

  it('signs preview, video and subtitle links and merges chapter starts', async () => {
    const out = await deriveLongFormRunFields({ runId: 'r', stages, scriptChapters, sign: async (k) => `signed:${k}` });
    expect(out.previewUrl).toBe('signed:d/1.preview.mp4');
    expect(out.videoUrl).toBe('signed:d/1.mp4');
    expect(out.subtitlesUrl).toBe('signed:d/1.srt');
    expect(out.chapters?.map((c) => c.startSec)).toEqual([0, 45, 190, 400]);
    expect(out.chapters?.[0].text).toBe('words');
    expect(out.subtitlesUploaded).toBeUndefined();
  });

  it('falls back to the local routes without R2', async () => {
    const out = await deriveLongFormRunFields({ runId: 'r', stages, scriptChapters });
    expect(out).toMatchObject({ previewUrl: '/runs/r/preview', subtitlesUrl: '/runs/r/subtitles', videoUrl: '/runs/r/video' });
  });

  it('reports the subtitle upload result from publishing', async () => {
    const withPublishing = (output: Record<string, unknown>) => [
      ...stages,
      { stageName: 'publishing', status: 'completed', attemptNumber: 1, output },
    ];
    const failed = await deriveLongFormRunFields({
      runId: 'r',
      stages: withPublishing({ subtitlesUploaded: false, subtitlesMessage: SUBTITLES_RECONNECT_MESSAGE }),
      scriptChapters,
    });
    expect(failed).toMatchObject({ subtitlesUploaded: false, subtitlesMessage: SUBTITLES_RECONNECT_MESSAGE });
    const ok = await deriveLongFormRunFields({ runId: 'r', stages: withPublishing({ subtitlesUploaded: true }), scriptChapters });
    expect(ok.subtitlesUploaded).toBe(true);
    expect(ok.subtitlesMessage).toBeUndefined();
  });

  it('keeps script chapters when there are no timings, and tolerates bad timings', () => {
    expect(mergeChapters([{ title: 'a', text: 'b' }], undefined)).toEqual([{ title: 'a', text: 'b' }]);
    expect(readChapterTimings({ chapterTimings: [{ title: 1 }] })).toBeUndefined();
    expect(readChapterTimings({})).toBeUndefined();
  });
});

describe('assembleLongFormMetadata', () => {
  const generated = { title: 'A title #shorts', description: 'About it. #Shorts', tags: ['history', 'shorts'], coverFrameTimestampRatio: 0.4 };

  it('adds the chapter list and credits and strips #shorts', async () => {
    const { assembleLongFormMetadata } = await import('./metadata');
    const out = assembleLongFormMetadata({ generated, chapterTimings: good, creditLines: ['Music: B'] });
    expect(out.chapterListIncluded).toBe(true);
    expect(out.metadata.title).toBe('A title');
    expect(out.metadata.tags).toEqual(['history']);
    expect(out.metadata.description).not.toMatch(/shorts/i);
    expect(out.metadata.description.split('\n').slice(-5)).toEqual([
      '00:00 Cold open',
      '0:45 Why it happens',
      '3:10 What it means',
      '6:40 Closing',
      'Music: B',
    ]);
  });

  it('publishes without the list and says why when the chapters break a rule', async () => {
    const { assembleLongFormMetadata } = await import('./metadata');
    const out = assembleLongFormMetadata({ generated, chapterTimings: good.slice(0, 2), creditLines: [] });
    expect(out.chapterListIncluded).toBe(false);
    expect(out.chapterWarning).toMatch(/at least 3 chapters/);
    expect(out.metadata.description).not.toContain('00:00');
  });
});

describe('runs.get chapterWarning', () => {
  it('is returned from the review stage output', async () => {
    const out = await deriveLongFormRunFields({
      runId: 'r',
      stages: [{ stageName: 'video_review', status: 'completed', attemptNumber: 1, output: { chapterWarning: 'Chapter list left out: x' } }],
      scriptChapters: undefined,
    });
    expect(out.chapterWarning).toBe('Chapter list left out: x');
  });
});
