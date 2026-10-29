import { describe, expect, it } from 'vitest';
import { buildDisclaimerCardAss, wrapSentence } from './card-ass';
import { DISCLAIMER_SENTENCE } from './sentence';
import { DISCLAIMER_PAD_SEC, findHookEndSec, planInsertion, shiftChapters, shiftTimed } from './splice';

const w = (text: string, s: number, e: number) => ({ text, startMs: s, endMs: e });

describe('hook and insertion', () => {
  it('the hook ends at the first sentence end', () => {
    expect(findHookEndSec([w('One', 0, 400), w('thing.', 400, 900), w('Next', 1000, 1400)])).toBe(0.9);
  });
  it('the card covers the whole clip and lasts at least two seconds', () => {
    const p = planInsertion(3, 3.2);
    expect(p.cardEndSec - p.cardStartSec).toBeGreaterThanOrEqual(3.2);
    const short = planInsertion(3, 1);
    expect(short.cardEndSec - short.cardStartSec).toBeGreaterThanOrEqual(2 - 1e-9);
    expect(p.gapSec).toBeCloseTo(3.2 + 2 * DISCLAIMER_PAD_SEC, 5);
  });
  it('shifts later words so captions stay aligned with the audio', () => {
    expect(shiftTimed([w('a.', 0, 900), w('b', 1000, 1400)], 0.9, 4)).toEqual([w('a.', 0, 900), w('b', 5000, 5400)]);
  });
  it('shifts chapter markers and grows the chapter that contains the hook', () => {
    expect(shiftChapters([{ startSec: 0, endSec: 20 }, { startSec: 20, endSec: 40 }], 5, 4)).toEqual([
      { startSec: 0, endSec: 24 },
      { startSec: 24, endSec: 44 },
    ]);
  });
});

describe('card', () => {
  it('uses the shared sentence, fades, and is a boxed top-centre style', () => {
    const ass = buildDisclaimerCardAss({ layout: 'portrait', startSec: 3, endSec: 6.5 });
    expect(ass.replace('\\N', ' ')).toContain(DISCLAIMER_SENTENCE);
    expect(ass).toContain('\\fad(250,250)');
    expect(ass).toMatch(/,3,12,0,8,/);
  });
  it('wraps in two balanced lines', () => {
    const [a, b] = wrapSentence(DISCLAIMER_SENTENCE).split('\\N');
    expect(Math.abs(a.length - b.length)).toBeLessThan(10);
  });
});
