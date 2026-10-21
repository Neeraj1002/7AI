import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ callLLM: vi.fn() }));
vi.mock('../../llm', async (orig) => ({ ...(await orig<object>()), callLLM: mocks.callLLM }));

import { generateScript, buildUserMessage } from './index';
import {
  formatChapterSheet,
  parseChapterSheet,
  validateChapters,
  isLengthInRange,
  LONG_WORDS_PER_MINUTE,
  countWords,
  measuredWordsPerMinute,
  lengthRange,
  targetWordCount,
  joinChapterTexts,
  CHAPTER_EDIT_TOO_FEW_MESSAGE,
} from './long-form';

const words = (n: number, w = 'word') => Array.from({ length: n }, () => w).join(' ');
const chapter = (title: string, n: number) => ({ title, text: `${title}? ${words(n)}.` });

describe('length rule', () => {
  it('plans 155 words per minute and accepts +-10% (hard limit +-20%)', () => {
    expect(LONG_WORDS_PER_MINUTE).toBe(155);
    expect(targetWordCount(600)).toBe(1550);
    expect(targetWordCount(120)).toBe(310);
    expect(lengthRange(600)).toEqual({ min: 1395, max: 1706 });
    expect(isLengthInRange(1395, 600)).toBe(true);
    expect(isLengthInRange(1394, 600)).toBe(false);
    expect(isLengthInRange(1706, 600)).toBe(true);
    expect(isLengthInRange(1707, 600)).toBe(false);
    expect(lengthRange(600, 0.2)).toEqual({ min: 1240, max: 1860 });
  });

  it('a script at the lowest accepted word count narrates well above the 96 s review floor', () => {
    const { min } = lengthRange(120);
    expect((min / LONG_WORDS_PER_MINUTE) * 60).toBeGreaterThan(105);
  });

  it('measures words per minute from a narration', () => {
    expect(measuredWordsPerMinute(276, 106.662)).toBeCloseTo(155.3, 1);
    expect(measuredWordsPerMinute(10, 0)).toBe(0);
  });
});

describe('chapter structure rules', () => {
  it('needs the allowed number of chapters, each with at least 10 seconds of words', () => {
    expect(validateChapters([chapter('a', 30), chapter('b', 30)])).toMatch(/has 2 chapters, but this video needs 3 to 20 chapters/);
    expect(validateChapters(Array.from({ length: 7 }, (_, i) => chapter(`c${i}`, 30)))).toBeNull();
    expect(validateChapters(Array.from({ length: 21 }, (_, i) => chapter(`c${i}`, 30)))).toMatch(/has 21 chapters/);
    expect(validateChapters([chapter('a', 30), chapter('b', 5), chapter('c', 30)])).toMatch(/chapter 2/);
    expect(validateChapters([chapter('a', 30), chapter('b', 30), chapter('c', 30)])).toBeNull();
  });

  it('parseChapterSheet applies the same bounds to a Gate 1 edit', () => {
    const sheet = (n: number) => formatChapterSheet(Array.from({ length: n }, (_, i) => chapter(`c${i}`, 30)));
    expect(parseChapterSheet(sheet(8), 600)).toMatchObject({ ok: true });
    expect(parseChapterSheet(sheet(13), 120)).toMatchObject({ ok: false, message: expect.stringMatching(/has 13 chapters, but this video needs 3 to 12 chapters/) });
    expect(parseChapterSheet(sheet(21), 900)).toMatchObject({ ok: false });
  });
});

describe('Gate 1 chapter edit sheet', () => {
  const chapters = [chapter('Why it stands', 30), chapter('The quarry', 30), chapter('What next', 30)];

  it('round-trips chapters through "## Title" sections', () => {
    const sheet = formatChapterSheet(chapters);
    expect(sheet).toContain('## Why it stands\n');
    const parsed = parseChapterSheet(sheet);
    expect(parsed).toEqual({ ok: true, chapters });
  });

  it('rejects fewer than 3 chapters with a plain message', () => {
    expect(parseChapterSheet(formatChapterSheet(chapters.slice(0, 2)))).toEqual({ ok: false, message: CHAPTER_EDIT_TOO_FEW_MESSAGE });
    expect(parseChapterSheet('just one blob of text')).toMatchObject({ ok: false });
  });

  it('rejects text before the first heading and drops empty chapters', () => {
    expect(parseChapterSheet(`stray line\n${formatChapterSheet(chapters)}`)).toMatchObject({ ok: false });
    const withEmpty = `${formatChapterSheet(chapters)}\n\n## Empty one\n`;
    const parsed = parseChapterSheet(withEmpty);
    expect(parsed.ok && parsed.chapters).toHaveLength(3);
  });

  it('script text is the chapter texts joined, so existing readers keep working', () => {
    expect(joinChapterTexts(chapters)).toBe(chapters.map((c) => c.text).join('\n\n'));
  });
});

describe('buildUserMessage', () => {
  const base = { topic: 'Bridges', constraints: [], targetSeconds: 45 };

  it('a Short is unchanged: no sources, the Shorts length line', () => {
    const msg = buildUserMessage({ ...base, sources: ['https://e.com/a'] });
    expect(msg).toContain('(never more than 60)');
    expect(msg).not.toContain('Sources');
  });

  it('a long script states its length, range and sources', () => {
    const msg = buildUserMessage({ ...base, targetSeconds: 600, videoKind: 'long', sources: ['https://e.com/a'] });
    expect(msg).toContain('Write around 1550 words');
    expect(msg).toContain('between 1395 and 1706');
    expect(msg).toContain('- https://e.com/a');
    expect(msg).not.toContain('never more than 60');
  });
});

describe('generateScript (long)', () => {
  const reply = (text: string) => ({
    text,
    usage: { inputTokens: 1000, outputTokens: 2000 },
    stopReason: 'stop',
    costUsd: '0.030000',
    provider: 'anthropic',
    model: 'claude-sonnet-5',
  });
  const body = (perChapter: number) =>
    JSON.stringify({ chapters: [chapter('One', perChapter), chapter('Two', perChapter), chapter('Three', perChapter), chapter('Four', perChapter)], hashtags: ['a'] });
  // 600 s => 1550 words (range 1395-1705). Four chapters of 380 words is 1524 with the heading words.
  const params = { topic: 'Bridges', constraints: [], targetSeconds: 600, videoKind: 'long' as const };

  beforeEach(() => mocks.callLLM.mockReset());

  it('returns chapters, with scriptText as their concatenation and no captions', async () => {
    mocks.callLLM.mockResolvedValueOnce(reply(body(380)));
    const { output, calls } = await generateScript(params);
    expect(calls).toHaveLength(1);
    expect(output.chapters).toHaveLength(4);
    expect(output.scriptText).toBe(joinChapterTexts(output.chapters!));
    expect(output.captions).toBe('');
    expect(output.lengthOutOfRange).toBeUndefined();
  });

  it('asks for a length repair when outside +-10% and uses the repaired script', async () => {
    mocks.callLLM.mockResolvedValueOnce(reply(body(100))).mockResolvedValueOnce(reply(body(380)));
    const { output, calls } = await generateScript(params);
    expect(calls).toHaveLength(2);
    expect(mocks.callLLM.mock.calls[1][0].messages.at(-1).content).toContain('too short');
    expect(output.lengthOutOfRange).toBeUndefined();
  });

  it('tries at most two repairs, then continues and records lengthOutOfRange when still outside +-20%', async () => {
    mocks.callLLM.mockResolvedValueOnce(reply(body(100))).mockResolvedValueOnce(reply(body(120))).mockResolvedValueOnce(reply(body(150)));
    const { output, calls } = await generateScript(params);
    expect(calls).toHaveLength(3);
    expect(output.lengthOutOfRange).toBe(true);
    expect(output.chapters).toHaveLength(4);
  });

  it('proceeds without a flag when two repairs leave it outside +-10% but within +-20%', async () => {
    // 4 x 331 = 1324 words: 14.6% under 1550.
    mocks.callLLM.mockResolvedValue(reply(body(330)));
    const { output, calls } = await generateScript(params);
    expect(calls).toHaveLength(3);
    expect(output.lengthOutOfRange).toBeUndefined();
  });

  it('a repair that lands further from the target is not kept', async () => {
    mocks.callLLM.mockResolvedValueOnce(reply(body(330))).mockResolvedValueOnce(reply(body(100))).mockResolvedValueOnce(reply(body(100)));
    const { output } = await generateScript(params);
    expect(countWords(output.scriptText)).toBe(4 * 331);
  });

  it('a script inside +-10% is accepted with no repair', async () => {
    mocks.callLLM.mockResolvedValueOnce(reply(body(330 + 40)));
    const { calls } = await generateScript(params);
    expect(calls).toHaveLength(1);
  });

  it('keeps the first script if the repair call itself fails', async () => {
    mocks.callLLM.mockResolvedValueOnce(reply(body(100))).mockRejectedValueOnce(new Error('boom'));
    const { output } = await generateScript(params);
    expect(output.lengthOutOfRange).toBe(true);
  });

  it('retries once on an unusable reply (too few chapters), then fails with the usual error', async () => {
    const twoChapters = JSON.stringify({ chapters: [chapter('One', 400), chapter('Two', 400)], hashtags: [] });
    mocks.callLLM.mockResolvedValueOnce(reply(twoChapters)).mockResolvedValueOnce(reply(twoChapters));
    await expect(generateScript(params)).rejects.toThrow(/has 2 chapters, but this video needs 3 to 20 chapters/);
    expect(mocks.callLLM).toHaveBeenCalledTimes(2);
  });

  describe('a brief that lists its chapter titles', () => {
    const titles = ['An Imagined Morning', 'The Street and the Hearth', 'The Market and the Stones', 'The Traveller and the Beads', 'The Signs Nobody Can Read', 'What Came After', 'What We Know, and What I Made Up'];
    const briefText = `Constraint: about 1,500 words for a 10 minute video.
Constraint: seven chapters, titles exactly: ${titles.map((t) => `"${t}"`).join(', ')}. Each chapter opens with a question it answers.`;
    const chapters = (n: number) => JSON.stringify({ chapters: Array.from({ length: n }, (_, i) => chapter(titles[i] ?? `Extra ${i}`, Math.round(1500 / n))), hashtags: ['a'] });

    it('tells the model the exact count and titles, with no unfilled placeholders', async () => {
      mocks.callLLM.mockResolvedValueOnce(reply(chapters(7)));
      await generateScript({ ...params, briefText });
      const system: string = mocks.callLLM.mock.calls[0][0].system;
      expect(system).toContain('Write exactly 7 chapters');
      expect(system).toContain('7. "What We Know, and What I Made Up"');
      expect(system).toContain('at least 26 words');
      expect(system).not.toMatch(/\{LONG_|\$\{/);
    });

    it('accepts the seven chapters the brief lists', async () => {
      mocks.callLLM.mockResolvedValueOnce(reply(chapters(7)));
      const { output, calls } = await generateScript({ ...params, briefText });
      expect(calls).toHaveLength(1);
      expect(output.chapters).toHaveLength(7);
    });

    it('sends back a reply with a different count, naming the count it returned and the allowed range', async () => {
      mocks.callLLM.mockResolvedValueOnce(reply(chapters(9))).mockResolvedValueOnce(reply(chapters(7)));
      const { output, calls } = await generateScript({ ...params, briefText });
      expect(calls).toHaveLength(2);
      const retry: string = mocks.callLLM.mock.calls[1][0].messages.at(-1).content;
      expect(retry).toContain('has 9 chapters');
      expect(retry).toContain('exactly 7');
      expect(retry).toContain('1. "An Imagined Morning"');
      expect(output.chapters).toHaveLength(7);
    });
  });

  it('with no titles, lengths from 2 to 15 minutes accept the counts the length allows', async () => {
    const of = (n: number) => JSON.stringify({ chapters: Array.from({ length: n }, (_, i) => chapter(`C${i}`, 40)), hashtags: [] });
    mocks.callLLM.mockResolvedValue(reply(of(12)));
    const { output } = await generateScript({ ...params, targetSeconds: 120 });
    expect(output.chapters).toHaveLength(12);
    const system: string = mocks.callLLM.mock.calls[0][0].system;
    expect(system).toContain('between 3 and 12 chapters');
  });

  it('a Short never takes the long path or sends a chapters schema', async () => {
    mocks.callLLM.mockResolvedValueOnce(reply(JSON.stringify({ scriptText: 'Hello there.', captions: 'x', hashtags: [] })));
    const { output } = await generateScript({ topic: 'T', constraints: [], targetSeconds: 45 });
    expect(output.chapters).toBeUndefined();
    expect(mocks.callLLM.mock.calls[0][0]).not.toHaveProperty('maxTokens');
  });
});
