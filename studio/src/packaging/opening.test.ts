import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { LLMResponse } from '../llm';
import { buildAss } from '../agents/video-generation/captions-ass';
import { EIFFEL_SCRIPT, makeBrief } from './testkit';
import { applyFrameZero, buildShortOpening, frameZeroScene, lookAtSupported, openingNote, openingWords, questionOpenedWithin, type OpeningDeps } from './opening';

const llm = (cost = '0.01'): LLMResponse => ({ costUsd: cost, usage: { inputTokens: 1, outputTokens: 1 }, text: '', stopReason: 'stop', provider: 'anthropic', model: 'test', maxOutputTokens: 1 }) as LLMResponse;

function deps(brief = makeBrief(), giveAway = false): { deps: OpeningDeps; booked: string[] } {
  const booked: string[] = [];
  return {
    booked,
    deps: {
      generateBrief: vi.fn(async () => ({ brief, calls: [llm('0.01')] })),
      coldRead: vi.fn(async () => ({ value: { reads: [{ index: 0, guessedAbout: 'x', curiosity: 4, wouldClick: 'yes' as const, answerGivenAway: giveAway }], ranking: [0] }, llm: llm('0.002') })),
    },
  };
}
const run = (d: OpeningDeps, booked: string[], brief?: Partial<ReturnType<typeof makeBrief>>) =>
  buildShortOpening({ scriptText: EIFFEL_SCRIPT, look: { stylePrompt: 'documentary', titleGuidance: null }, deps: d, onText: async (label) => { booked.push(label); }, now: new Date('2026-10-29T00:00:00Z'), ...(brief ? {} : {}) });

describe('buildShortOpening (R7)', () => {
  it('a good brief gives a hook line and a frame-zero picture, and every paid call is booked', async () => {
    const d = deps();
    const out = await run(d.deps, d.booked);
    expect(out.hookLine).toBe('Why was it nearly torn down?');
    expect(out.firstStillPrompt).toMatch(/Vertical 9:16 opening image/);
    expect(out.reasons).toEqual([]);
    expect(out.question).toBe('Why was the tower nearly torn down?');
    expect(d.booked).toEqual(['brief', 'cold-reader']);
    expect(out.textCostUsd).toBeCloseTo(0.012, 4);
  });

  it('a hook line over the word limit, with an invented figure or a dropped hedge is dropped with the reason, never repaired', async () => {
    for (const [hook, pattern] of [
      ['Why was this enormous iron tower nearly torn down so soon after opening', /words; the limit is 8/],
      ['Why did 25,000 men nearly lose it?', /25,000/],
      ['The untold story of the tower', /untold/],
    ] as const) {
      const d = deps(makeBrief({ hookLine: hook }));
      const out = await run(d.deps, d.booked);
      expect(out.hookLine, hook).toBeNull();
      expect(out.reasons.join(' '), hook).toMatch(pattern);
      // the picture is independent of the hook
      expect(out.firstStillPrompt).not.toBeNull();
    }
  });

  it('a hook line that gives its answer away is dropped', async () => {
    const d = deps(makeBrief(), true);
    const out = await run(d.deps, d.booked);
    expect(out.hookLine).toBeNull();
    expect(out.reasons.join(' ')).toMatch(/gives away the answer/);
  });

  it('a brief with no honest gap makes no hook and no frame zero, and says why', async () => {
    const d = deps(makeBrief({ weakGap: 'The script lists facts.' }));
    const out = await run(d.deps, d.booked);
    expect(out.hookLine).toBeNull();
    expect(out.firstStillPrompt).toBeNull();
    expect(out.reasons[0]).toMatch(/No honest gap/);
    expect(d.booked).toEqual(['brief']);
  });

  it("a frame-zero subject the script does not name leaves the planner's own first picture", async () => {
    const d = deps(makeBrief({ lookAt: 'a wooden pull toy on a cabin floor' }));
    const out = await run(d.deps, d.booked);
    expect(out.firstStillPrompt).toBeNull();
    expect(out.reasons.join(' ')).toMatch(/planner's own first picture stays/);
    expect(out.hookLine).not.toBeNull();
  });
});

describe('frame zero', () => {
  it('lookAtSupported needs the script to name the subject', () => {
    expect(lookAtSupported('The tower with a crane and hook at its top', EIFFEL_SCRIPT)).toBe(true);
    expect(lookAtSupported('a wooden pull toy on a cabin floor', EIFFEL_SCRIPT)).toBe(false);
    expect(lookAtSupported('the scene', EIFFEL_SCRIPT)).toBe(false);
  });
  it('only the first picture changes', () => {
    expect(applyFrameZero(['a', 'b', 'c'], 'FIRST')).toEqual(['FIRST', 'b', 'c']);
    expect(applyFrameZero(['a', 'b'], null)).toEqual(['a', 'b']);
    expect(applyFrameZero([], 'FIRST')).toEqual([]);
  });
  it('the scene asks for calm space at the top for the line and follows the face rule', () => {
    const none = frameZeroScene(makeBrief({ subjectKind: 'iconic-thing' }));
    expect(none).toMatch(/calm darker area at the top/);
    expect(none).toMatch(/show no face/);
    expect(frameZeroScene(makeBrief({ subjectKind: 'anonymous-person' }))).toMatch(/imagined, anonymous person/);
  });
});

describe('advisory: is the question opened in the first seconds?', () => {
  it('uses the first five seconds for a Short and ten for a long video', () => {
    expect(openingWords('one two three four five six seven eight nine ten eleven twelve thirteen fourteen', 'short').split(' ')).toHaveLength(13);
    expect(openingWords(EIFFEL_SCRIPT, 'long').split(' ')).toHaveLength(23);
  });
  it("the Eiffel script opens its own question at once; a script that wanders does not", () => {
    expect(questionOpenedWithin(EIFFEL_SCRIPT, 'What almost happened to the most famous tower in the world?', 'short')).toBe(true);
    const wandering = 'Good evening and welcome back to the channel. Before we begin, remember to subscribe and to like the video. Today we have a long story. The tower was built in Paris.';
    expect(questionOpenedWithin(wandering, 'Why was the tower nearly torn down?', 'short')).toBe(false);
    expect(openingNote(wandering, 'Why was the tower nearly torn down?', 'short')).toMatch(/does not open its question in the first 5 seconds.*Advisory only/);
    expect(openingNote(EIFFEL_SCRIPT, 'What almost happened to the most famous tower in the world?', 'short')).toBeNull();
  });
});

describe('the hook line on the first frame (captions-ass)', () => {
  const words = [{ text: 'Hello', startMs: 0, endMs: 400 }, { text: 'there', startMs: 400, endMs: 800 }];
  it('is drawn from time zero for the hook seconds, top-centre, above the caption band', () => {
    const { ass } = buildAss({ words, style: 'phrase-grouped', hook: { text: 'Why was it nearly torn down?', seconds: 3 } });
    expect(ass).toMatch(/Style: Hook,.*,8,\d+,\d+,330,1/);
    expect(ass).toContain('Dialogue: 1,0:00:00.00,0:00:03.00,Hook,,0,0,0,,{\\fad(0,300)}Why was it nearly torn down?');
  });
  it('works with captions off (no caption words) and with no hook at all', () => {
    expect(buildAss({ words: [], style: 'phrase-grouped', hook: { text: 'A hook', seconds: 3 } }).ass).toContain('Hook,,0,0,0,,{\\fad(0,300)}A hook');
    expect(buildAss({ words, style: 'phrase-grouped' }).ass).not.toContain('Dialogue: 1,');
  });
});

describe('channel-agnostic (Key Principle 11)', () => {
  it('no channel name or niche word in the opening code', () => {
    const text = fs.readFileSync(path.join(__dirname, 'opening.ts'), 'utf8') + fs.readFileSync(path.join(__dirname, 'rounds.ts'), 'utf8');
    expect(text).not.toMatch(/\bNIYT\b|Not In Your Textbook|Underdogs|Cold Open|Indus|Eiffel|Mary Celeste/i);
  });
});
