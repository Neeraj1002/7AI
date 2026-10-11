import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ callLLM: vi.fn() }));
vi.mock('../../llm', async (orig) => ({ ...(await orig<object>()), callLLM: mocks.callLLM }));

import { generateScript, buildUserMessage } from './index';
import {
  formatChapterSheet,
  parseChapterSheet,
  validateChapters,
  isLengthInRange,
  lengthRange,
  targetWordCount,
  joinChapterTexts,
  CHAPTER_EDIT_TOO_FEW_MESSAGE,
} from './long-form';

const words = (n: number, w = 'word') => Array.from({ length: n }, () => w).join(' ');
const chapter = (title: string, n: number) => ({ title, text: `${title}? ${words(n)}.` });

describe('length rule', () => {
  it('is +-20% of 145 words per minute', () => {
    expect(targetWordCount(600)).toBe(1450);
    expect(lengthRange(600)).toEqual({ min: 1160, max: 1740 });
    expect(isLengthInRange(1160, 600)).toBe(true);
    expect(isLengthInRange(1159, 600)).toBe(false);
    expect(isLengthInRange(1740, 600)).toBe(true);
    expect(isLengthInRange(1741, 600)).toBe(false);
  });
});

describe('chapter structure rules', () => {
  it('needs 3 to 6 chapters of at least 25 words', () => {
    expect(validateChapters([chapter('a', 30), chapter('b', 30)])).toMatch(/expected 3 to 6/);
    expect(validateChapters(Array.from({ length: 7 }, (_, i) => chapter(`c${i}`, 30)))).toMatch(/expected 3 to 6/);
    expect(validateChapters([chapter('a', 30), chapter('b', 5), chapter('c', 30)])).toMatch(/chapter 2/);
    expect(validateChapters([chapter('a', 30), chapter('b', 30), chapter('c', 30)])).toBeNull();
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
    expect(msg).toContain('Write around 1450 words');
    expect(msg).toContain('1160 to 1740');
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
  // 600 s => 1450 words. Four chapters of 360 words is ~1456 with the heading words.
  const params = { topic: 'Bridges', constraints: [], targetSeconds: 600, videoKind: 'long' as const };

  beforeEach(() => mocks.callLLM.mockReset());

  it('returns chapters, with scriptText as their concatenation and no captions', async () => {
    mocks.callLLM.mockResolvedValueOnce(reply(body(360)));
    const { output, calls } = await generateScript(params);
    expect(calls).toHaveLength(1);
    expect(output.chapters).toHaveLength(4);
    expect(output.scriptText).toBe(joinChapterTexts(output.chapters!));
    expect(output.captions).toBe('');
    expect(output.lengthOutOfRange).toBeUndefined();
  });

  it('asks for one length repair when out of range and uses the repaired script', async () => {
    mocks.callLLM.mockResolvedValueOnce(reply(body(100))).mockResolvedValueOnce(reply(body(360)));
    const { output, calls } = await generateScript(params);
    expect(calls).toHaveLength(2);
    expect(mocks.callLLM.mock.calls[1][0].messages.at(-1).content).toContain('too short');
    expect(output.lengthOutOfRange).toBeUndefined();
  });

  it('continues and records lengthOutOfRange when the repair is still out of range', async () => {
    mocks.callLLM.mockResolvedValueOnce(reply(body(100))).mockResolvedValueOnce(reply(body(120)));
    const { output, calls } = await generateScript(params);
    expect(calls).toHaveLength(2);
    expect(output.lengthOutOfRange).toBe(true);
    expect(output.chapters).toHaveLength(4);
  });

  it('keeps the first script if the repair call itself fails', async () => {
    mocks.callLLM.mockResolvedValueOnce(reply(body(100))).mockRejectedValueOnce(new Error('boom'));
    const { output } = await generateScript(params);
    expect(output.lengthOutOfRange).toBe(true);
  });

  it('retries once on an unusable reply (too few chapters), then fails with the usual error', async () => {
    const twoChapters = JSON.stringify({ chapters: [chapter('One', 400), chapter('Two', 400)], hashtags: [] });
    mocks.callLLM.mockResolvedValueOnce(reply(twoChapters)).mockResolvedValueOnce(reply(twoChapters));
    await expect(generateScript(params)).rejects.toThrow(/expected 3 to 6 chapters/);
    expect(mocks.callLLM).toHaveBeenCalledTimes(2);
  });

  it('a Short never takes the long path or sends a chapters schema', async () => {
    mocks.callLLM.mockResolvedValueOnce(reply(JSON.stringify({ scriptText: 'Hello there.', captions: 'x', hashtags: [] })));
    const { output } = await generateScript({ topic: 'T', constraints: [], targetSeconds: 45 });
    expect(output.chapters).toBeUndefined();
    expect(mocks.callLLM.mock.calls[0][0].maxTokens).toBe(4096);
  });
});
