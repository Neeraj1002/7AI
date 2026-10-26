import { describe, expect, it } from 'vitest';
import { checkTitle, parseTitleLimit, quoteInScript, unsupportedProps, validateConcept } from './check';
import { EIFFEL_SCRIPT, makeBrief, makeConcept } from './testkit';

const base = { scriptText: EIFFEL_SCRIPT, briefText: null, brief: makeBrief(), titleLimit: 70 };
const codes = (c: ReturnType<typeof makeConcept>, over: Partial<typeof base> = {}) =>
  validateConcept({ concept: c, ...base, ...over }).map((i) => i.code);

describe('quoteInScript', () => {
  it('finds a stretch of the script ignoring case, punctuation and spacing', () => {
    expect(quoteInScript(EIFFEL_SCRIPT, 'its construction PERMIT was only for 20 years!')).toBe(true);
  });
  it('rejects text that is not in the script, and quotes too short to mean anything', () => {
    expect(quoteInScript(EIFFEL_SCRIPT, 'the tower had a secret elevator')).toBe(false);
    expect(quoteInScript(EIFFEL_SCRIPT, 'tower')).toBe(false);
  });
});

describe('parseTitleLimit', () => {
  it("is the neutral limit with no guidance, and YouTube's when the guidance gives no number", () => {
    expect(parseTitleLimit(null)).toBe(70);
    expect(parseTitleLimit('Plain and specific.')).toBe(100);
  });
  it('reads the limit a channel states in words', () => {
    expect(parseTitleLimit('35 to 55 characters, never over 60; Shorts under 45.')).toBe(60);
    expect(parseTitleLimit('Keep titles at most 50 characters.')).toBe(50);
  });
});

describe('validateConcept: the checks that are code, not prompt hopes (spike regression cases)', () => {
  it('passes the Eiffel "SOLD FOR SCRAP?" concept', () => {
    expect(codes(makeConcept())).toEqual([]);
  });

  it('catches a title longer than the channel limit', () => {
    expect(codes(makeConcept({ title: 'Why was this enormous iron tower nearly torn down after only twenty years of standing?' }))).toContain('title_too_long');
  });

  it('catches lettering over four words and a subline over five (spike: 2 of 18 broke the limit)', () => {
    const c = makeConcept();
    c.thumbnail.lettering = { words: 'THE BIGGEST TOY COMPANY EVER', subline: 'ONE TWO THREE FOUR FIVE SIX', zone: 'top' };
    expect(codes(c)).toEqual(expect.arrayContaining(['lettering_words', 'subline_words']));
  });

  it('catches a figure the script does not state', () => {
    expect(codes(makeConcept({ title: 'Why did 25,000 pieces of iron nearly go to scrap?' }))).toContain('unsupported_number');
  });

  it('keeps a figure the script states', () => {
    expect(codes(makeConcept({ title: 'How do 18,038 iron pieces survive 20 years?' }))).not.toContain('unsupported_number');
  });

  it('catches a dropped hedge (spike: "about 220 million" became "220 million")', () => {
    const script = 'Lego lost about $220 million in 2003. The company nearly collapsed.';
    const c = makeConcept({
      title: 'How did Lego lose $220 million in one year?',
      answeredIn: { chapter: null, quote: 'The company nearly collapsed' },
      supportQuote: 'Lego lost about $220 million in 2003',
    });
    const issues = validateConcept({ concept: c, scriptText: script, briefText: null, brief: makeBrief(), titleLimit: 70 }).map((i) => i.code);
    expect(issues).toContain('hedge_dropped');
  });

  it('rejects "untold" and "what really happened" unless the script states the popular version and then the record', () => {
    const c = makeConcept({ title: 'The untold story of why it was nearly torn down' });
    expect(codes(c)).toContain('unearned_word');
    const earned = makeBrief({ correction: { popularVersion: 'built to last', record: '20 year permit', quote: 'Its construction permit was only for 20 years' } });
    expect(codes(c, { brief: earned })).not.toContain('unearned_word');
  });

  it('does not accept a correction whose quote is not in the script', () => {
    const fake = makeBrief({ correction: { popularVersion: 'x', record: 'y', quote: 'the tower was a secret military base' } });
    expect(codes(makeConcept({ title: 'The secret of the tower' }), { brief: fake })).toContain('unearned_word');
  });

  it('rejects fake badges in the title or the lettering', () => {
    const c = makeConcept();
    c.thumbnail.lettering = { words: 'FULL MOVIE 4K', subline: null, zone: 'top' };
    expect(codes(c)).toContain('badge');
    expect(codes(makeConcept({ title: 'Official: why it nearly came down' }))).toContain('badge');
  });

  it('rejects a quotation that is not in the approved script (answer place and picture support)', () => {
    expect(codes(makeConcept({ answeredIn: { chapter: 2, quote: 'a secret tunnel under the river' } }))).toContain('answer_not_in_script');
    expect(codes(makeConcept({ supportQuote: 'a child plays with a wooden toy on the table' }))).toContain('support_not_in_script');
  });

  it('rejects a picture with a prop the script never mentions (spike: an invented toy)', () => {
    expect(codes(makeConcept({ props: ['wooden toy'] }))).toContain('prop_not_in_script');
    expect(codes(makeConcept({ props: ['rivets', 'sky', 'tower'] }))).toEqual([]);
  });

  it('rejects a person who may be alive or is not in the script', () => {
    expect(codes(makeConcept({ namedPeople: [{ name: 'Gustave Eiffel', livingOrUnknown: true }] }))).toContain('living_person');
    expect(codes(makeConcept({ namedPeople: [{ name: 'Napoleon', livingOrUnknown: false }] }))).toContain('person_not_in_script');
    expect(codes(makeConcept({ namedPeople: [{ name: 'Gustave Eiffel', livingOrUnknown: false }] }))).toEqual([]);
  });

  it('rejects lettering that repeats the title', () => {
    const c = makeConcept({ title: 'Sold for scrap after twenty years' });
    c.thumbnail.lettering = { words: 'SOLD FOR SCRAP', subline: null, zone: 'top' };
    expect(codes(c)).toContain('repeats_title');
  });
});

describe('checkTitle (an edited title at Gate 2)', () => {
  it('refuses an unsupported figure and allows a supported one', () => {
    const args = { scriptText: EIFFEL_SCRIPT, brief: makeBrief(), titleLimit: 70 };
    expect(checkTitle({ ...args, title: 'The tower that 99 engineers saved' }).map((i) => i.code)).toContain('unsupported_number');
    expect(checkTitle({ ...args, title: 'The tower that 300 metres of iron saved' })).toEqual([]);
  });
});

describe('unsupportedProps', () => {
  it('matches the head noun with a plural or a short ending, and ignores plain scenery', () => {
    expect(unsupportedProps(['iron rivets', 'engineers', 'rivet', 'sunset', 'toy', 'carousel'], EIFFEL_SCRIPT)).toEqual(['toy', 'carousel']);
  });
  it('lets a compound prop through when a longer word of it is in the script, and still refuses a toy', () => {
    expect(unsupportedProps(['wrought iron frame'], EIFFEL_SCRIPT)).toEqual([]);
    expect(unsupportedProps(['wooden toy', 'toy horse'], EIFFEL_SCRIPT)).toEqual(['wooden toy', 'toy horse']);
  });
  it('reads the lettering and its subline as separate sentences, so a year is not glued to the next words', () => {
    const script = 'In 1889 the tower opened. Ten engineers worked on it.';
    const c = makeConcept({ title: 'Why did the tower open?', answeredIn: { chapter: null, quote: 'In 1889 the tower opened' }, supportQuote: 'In 1889 the tower opened', props: [] });
    c.thumbnail.lettering = { words: 'OPENED 1889', subline: 'Ten engineers', zone: 'top' };
    expect(validateConcept({ concept: c, scriptText: script, briefText: null, brief: makeBrief(), titleLimit: 70 }).map((i) => i.code)).toEqual([]);
  });
});
