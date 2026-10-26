import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ callJson: vi.fn() }));
vi.mock('./generate', async (orig) => ({ ...(await orig<object>()), callJson: mocks.callJson }));
vi.mock('node:fs/promises', async (orig) => ({ ...(await orig<object>()), default: { readFile: async () => Buffer.from('x') }, readFile: async () => Buffer.from('x') }));

import { compareHeadToHead, criticReasons, defectWarnings, lettersCover, payoffReasons, type DefectCheck, type PayoffCheck } from './vision';
import { EIFFEL_SCRIPT } from './testkit';

const defect = (over: Partial<DefectCheck> = {}): DefectCheck => ({
  faceVisible: false, uncannyAtFeed: false, uncannyAtSidebar: false, defects: [], handsOk: true, faceBoxes: [], subjectBox: null, ...over,
});
const payoff = (over: Partial<PayoffCheck> = {}): PayoffCheck => ({
  visibleThings: [], contradicts: false, contradictsWhy: '', questionAnswered: true, answerQuote: 'Its construction permit was only for 20 years',
  arrives: true, arrivesWhy: '', fakeLabelOrUnearnedWord: false, labelWhy: '', ...over,
});

describe('lettersCover: the covering is worked out in code from the model\'s boxes and the lettering\'s own box', () => {
  const top = { x0: 0.05, y0: 0.06, x1: 0.95, y1: 0.35 };
  it('a face under the lettering is covered; a face clear of it is not', () => {
    expect(lettersCover(top, defect({ faceBoxes: [{ x0: 0.33, y0: 0, x1: 0.64, y1: 0.45 }] }))).toEqual({ covers: true, what: 'a face' });
    expect(lettersCover(top, defect({ faceBoxes: [{ x0: 0.4, y0: 0.5, x1: 0.6, y1: 0.9 }] })).covers).toBe(false);
  });
  it('a slight overlap with a face is allowed, a big one is not', () => {
    // the face box is 0.4 tall and the lettering ends 0.02 into it: 5% of the face
    expect(lettersCover({ ...top, y1: 0.42 }, defect({ faceBoxes: [{ x0: 0.3, y0: 0.4, x1: 0.7, y1: 0.8 }] })).covers).toBe(false);
    expect(lettersCover({ ...top, y1: 0.5 }, defect({ faceBoxes: [{ x0: 0.3, y0: 0.4, x1: 0.7, y1: 0.8 }] })).covers).toBe(true);
  });
  it('the main subject is covered only when most of it is under the lettering', () => {
    expect(lettersCover(top, defect({ subjectBox: { x0: 0.1, y0: 0.2, x1: 0.9, y1: 0.9 } })).covers).toBe(false);
    expect(lettersCover(top, defect({ subjectBox: { x0: 0.2, y0: 0.1, x1: 0.8, y1: 0.3 } }))).toEqual({ covers: true, what: 'the main subject' });
  });
  it('no faces and no subject covers nothing', () => {
    expect(lettersCover(top, defect()).covers).toBe(false);
  });
});

describe('payoffReasons: what drops a package', () => {
  it('passes a package whose picture, question and answer all hold', () => {
    expect(payoffReasons(payoff({ visibleThings: [{ what: 'the tower', supportedByScript: true }] }), EIFFEL_SCRIPT)).toEqual([]);
  });
  it('names each failure in plain words', () => {
    const reasons = payoffReasons(
      payoff({
        visibleThings: [{ what: 'a toy horse', supportedByScript: false }, { what: 'a flag', supportedByScript: false }],
        contradicts: true, contradictsWhy: 'the boat is still in the davit', questionAnswered: false, arrives: false, arrivesWhy: 'a dodge',
        fakeLabelOrUnearnedWord: true, labelWhy: 'the word untold',
      }),
      EIFFEL_SCRIPT,
    );
    expect(reasons.join(' ')).toMatch(/toy horse; a flag/);
    expect(reasons.join(' ')).toMatch(/boat is still in the davit/);
    expect(reasons.join(' ')).toMatch(/never answers/);
    expect(reasons.join(' ')).toMatch(/a dodge/);
    expect(reasons.join(' ')).toMatch(/untold/);
  });
  it('an answer quote that is not in the script is a failure even when the model says the question is answered', () => {
    expect(payoffReasons(payoff({ answerQuote: 'the tower was a secret radio station' }), EIFFEL_SCRIPT).join(' ')).toMatch(/not a quotation/);
  });
});

describe('critic and defect rules', () => {
  it('a picture that does not connect to its title is a reason; one that does is not', () => {
    expect(criticReasons({ about: '', expectsToSee: '', wantsToKnow: '', wouldClick: 'maybe', whyNot: '', wouldDisappoint: '', connects: true, connectsWhy: '' })).toEqual([]);
    expect(criticReasons({ about: '', expectsToSee: '', wantsToKnow: '', wouldClick: 'no', whyNot: '', wouldDisappoint: '', connects: false, connectsWhy: 'a castle under a Lego title' })[0]).toMatch(/castle under a Lego title/);
  });
  it('an uncanny face and odd hands are warnings, a clean picture has none', () => {
    expect(defectWarnings(defect())).toEqual([]);
    expect(defectWarnings(defect({ faceVisible: true, uncannyAtFeed: true, defects: ['waxy skin'] }))).toEqual(['A face may look uncanny at feed size: waxy skin.']);
    expect(defectWarnings(defect({ faceVisible: true, handsOk: false }))).toEqual(['Hands in the picture may look wrong.']);
    // an uncanny flag with no face in the picture is ignored
    expect(defectWarnings(defect({ faceVisible: false, uncannyAtFeed: true }))).toEqual([]);
  });
});

describe('compareHeadToHead: both orders, so position cannot decide', () => {
  beforeEach(() => mocks.callJson.mockReset());
  const files = { dir: '/x', full: 'a.jpg', feed: 'a.jpg', sidebar: 'a.jpg' };
  const sides = { a: { files, title: 'A title' }, b: { files, title: 'B title' } };
  const answer = (first: 'A' | 'B', second: 'A' | 'B') => {
    mocks.callJson.mockResolvedValueOnce({ value: { winner: first, reason: 'r1' }, llm: {} });
    mocks.callJson.mockResolvedValueOnce({ value: { winner: second, reason: 'r2' }, llm: {} });
  };
  it('a package wins only when it wins in both orders', async () => {
    answer('A', 'B'); // first call: a shown first, picks first (a); second call: b shown first, picks second (a)
    expect((await compareHeadToHead(sides)).winner).toBe('a');
    answer('B', 'A');
    expect((await compareHeadToHead(sides)).winner).toBe('b');
  });
  it('the same position winning both times is a tie, not a win', async () => {
    answer('A', 'A'); // always the first one shown: position bias
    expect((await compareHeadToHead(sides)).winner).toBe('tie');
    answer('B', 'B');
    expect((await compareHeadToHead(sides)).winner).toBe('tie');
  });
});
