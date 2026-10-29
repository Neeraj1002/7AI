import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { LLMResponse } from '../llm';
import { buildPackaging, thumbnailsDir, type BuildDeps, type BuildHooks, type PackagingOutput } from './build';
import type { ColdReaderReply, Concept, CuriosityBrief } from './schemas';
import type { CriticRead, DefectCheck, PayoffCheck } from './vision';
import { coldReadSelection } from './select';
import { EIFFEL_CHAPTERS, EIFFEL_SCRIPT, SUPPORT_QUOTE, makeBrief, makeConcept } from './testkit';

const llm = (costUsd = '0.01'): LLMResponse => ({ costUsd, usage: { inputTokens: 1, outputTokens: 1 }, text: '', stopReason: 'stop', provider: 'anthropic', model: 'test', maxOutputTokens: 1 }) as LLMResponse;

const DEVICES = ['stake', 'scale', 'mystery', 'correction', 'how', 'person'] as const;
const TAGS = ['iron', 'rivets', 'permit', 'crane', 'fairground', 'scrap'] as const;
const titleOf = (i: number) => `Why the tower of ${TAGS[i]} stayed`;
function sixConcepts(): Concept[] {
  return DEVICES.map((device, i) => {
    const c = makeConcept({ device, title: titleOf(i), supportQuote: SUPPORT_QUOTE });
    c.thumbnail.lettering = { words: `ALL ${TAGS[i].toUpperCase()}`, subline: i === 0 ? 'A SMALL SUBLINE' : null, zone: 'top' };
    return c;
  });
}
const reader = (over: Partial<ColdReaderReply> = {}): ColdReaderReply => ({
  reads: [0, 1, 2, 3, 4, 5].map((index) => ({ index, guessedAbout: 'a tower', curiosity: 4, wouldClick: 'yes' as const, answerGivenAway: false })),
  ranking: [0, 1, 2, 3, 4, 5],
  ...over,
});

const GOOD_PAYOFF: PayoffCheck = {
  visibleThings: [{ what: 'a tower', supportedByScript: true }], contradicts: false, contradictsWhy: '', questionAnswered: true,
  answerQuote: "Eiffel turned his tower into a scientific tool the city couldn't afford to lose", arrives: true, arrivesWhy: 'it explains', fakeLabelOrUnearnedWord: false, labelWhy: '',
};
const GOOD_CRITIC: CriticRead = { about: 'a tower', expectsToSee: 'a tower', wantsToKnow: 'why', wouldClick: 'yes', whyNot: '', wouldDisappoint: 'nothing', connects: true, connectsWhy: 'same idea' };
const CLEAN_DEFECT: DefectCheck = { faceVisible: false, uncannyAtFeed: false, uncannyAtSidebar: false, defects: [], handsOk: true, faceBoxes: [], subjectBox: { x0: 0.3, y0: 0.3, x1: 0.7, y1: 0.8 } };
const llmOf = (cost = '0.002') => llm(cost);

type Over = {
  brief?: CuriosityBrief; concepts?: Concept[] | ((call: number, feedback?: string[]) => Concept[]); reader?: ColdReaderReply; imagesAllowed?: number;
  // R10: the second round's room; the default is no room, so the older tests see one round only.
  roundTwoRoom?: BuildHooks['roundTwoRoom'];
  // Throws inside this paid step (a crash) the first time it is reached: 'payoff:2' is the second payoff call.
  crashAt?: string;
  payoff?: (title: string) => PayoffCheck; critic?: (title: string) => CriticRead; defect?: DefectCheck;
  // The lettering box each zone gets from the fake compose (default: top-left corner, away from the subject).
  boxFor?: (zone: string) => { x0: number; y0: number; x1: number; y1: number };
  compare?: (aTitle: string, bTitle: string) => 'a' | 'b' | 'tie';
};

function setup(over: Over = {}) {
  const calls: string[] = [];
  const composed: string[] = [];
  const feedbackSeen: Array<string[] | undefined> = [];
  let conceptCalls = 0;
  let crashed = false;
  const seen: Record<string, number> = {};
  const maybeCrash = (step: string) => {
    seen[step] = (seen[step] ?? 0) + 1;
    if (!crashed && over.crashAt === `${step}:${seen[step]}`) {
      crashed = true;
      throw new Error(`crash at ${over.crashAt}`);
    }
  };
  const deps: BuildDeps = {
    generateBrief: vi.fn(async () => { calls.push('brief'); return { brief: over.brief ?? makeBrief(), calls: [llm()] }; }),
    generateConcepts: vi.fn(async (p) => {
      calls.push('concepts');
      feedbackSeen.push(p.feedback);
      conceptCalls += 1;
      const value = typeof over.concepts === 'function' ? over.concepts(conceptCalls, p.feedback) : (over.concepts ?? sixConcepts());
      return { value, llm: llm('0.04') };
    }),
    coldRead: vi.fn(async () => { calls.push('cold'); return { value: over.reader ?? reader(), llm: llm('0.003') }; }),
    generateStills: vi.fn(async (p) => {
      calls.push('image');
      await p.onStillGenerated?.({ index: 0, costUsd: 0.0065, model: 'img' });
      return { imagePaths: ['raw.png'], provider: 'openai' as const, model: 'img', costUsd: '0.006500' };
    }),
    composeThumbnail: vi.fn(async (p) => {
      composed.push(`${p.baseName}:${p.zone}`);
      return {
        words: p.words, subline: p.subline, sublineDropped: false, typeface: p.typeface, fontFamily: 'Anton', zone: p.zone, requestedZone: p.zone,
        zonesByCalm: ['top', 'bottom', 'left', 'right'] as ('top' | 'bottom' | 'left' | 'right')[],
        textBox: over.boxFor ? over.boxFor(p.zone) : { x0: 0.02, y0: 0.02, x1: 0.2, y1: 0.12 }, lines: 1,
        mainPxFull: 160, mainPxFeed: 45, mainPxSidebar: 21, readableAtSidebar: true,
        files: { full: `/x/${p.baseName}-full.jpg`, feed: `/x/${p.baseName}-feed.jpg`, sidebar: `/x/${p.baseName}-sidebar.jpg` },
        plain: { feed: `/x/${p.baseName}-plain-feed.jpg`, sidebar: `/x/${p.baseName}-plain-sidebar.jpg` },
      };
    }),
    defectCheck: vi.fn(async () => { calls.push('defect'); return { value: over.defect ?? CLEAN_DEFECT, llm: llmOf('0.006') }; }),
    payoffCheck: vi.fn(async (p) => { calls.push('payoff'); maybeCrash('payoff'); return { value: (over.payoff ?? (() => GOOD_PAYOFF))(p.title), llm: llmOf('0.012') }; }),
    criticRead: vi.fn(async (_f, title) => { calls.push('critic'); return { value: (over.critic ?? (() => GOOD_CRITIC))(title), llm: llmOf() }; }),
    compareHeadToHead: vi.fn(async (p) => {
      calls.push('compare');
      const winner = (over.compare ?? (() => 'tie'))(p.a.title, p.b.title);
      return { winner, reasons: ['r1', 'r2'], calls: [{ value: { winner: 'A' as const, reason: 'r1' }, llm: llmOf() }, { value: { winner: 'B' as const, reason: 'r2' }, llm: llmOf() }] };
    }),
  };
  const checkpoints: Array<Partial<PackagingOutput>> = [];
  const booked: string[] = [];
  const hooks: BuildHooks = {
    onText: async (label, _calls, meta) => { booked.push(`text:${label}${meta?.round === 2 ? ':r2' : ''}`); },
    onImage: async (info) => { booked.push(`image:${info.packageId}`); },
    checkpoint: async (p) => { checkpoints.push(p); },
    roundTwoRoom: over.roundTwoRoom ?? (async () => ({ ok: false, imagesAllowed: 0, reason: 'test: no second round' })),
  };
  const run = (resume?: Partial<PackagingOutput>) =>
    buildPackaging({
      runId: '00000000-0000-4000-8000-000000000001',
      scriptText: EIFFEL_SCRIPT,
      chapters: EIFFEL_CHAPTERS,
      look: { stylePrompt: 'documentary frame', titleGuidance: 'Plain, specific. Never over 60 characters.' },
      imagesAllowed: over.imagesAllowed ?? 3,
      hooks,
      deps,
      resume,
    });
  // What the stage would have saved by now: every checkpoint merged in order.
  const saved = () => checkpoints.reduce<Partial<PackagingOutput>>((acc, c) => ({ ...acc, ...c }), {});
  return { run, deps, calls, composed, checkpoints, booked, feedbackSeen, saved };
}

describe('buildPackaging', () => {
  it('makes six concepts, keeps three, renders three and books every paid call', async () => {
    const s = setup();
    const out = await s.run();
    expect(out.status).toBe('ready');
    expect(out.concepts).toHaveLength(6);
    expect(out.packages).toHaveLength(3);
    expect(new Set(out.packages.map((p) => p.device)).size).toBe(3);
    expect(s.calls.filter((c) => c === 'image')).toHaveLength(3);
    expect(s.calls.filter((c) => c === 'defect' || c === 'payoff' || c === 'critic')).toHaveLength(9);
    expect(s.booked.filter((b) => b.startsWith('image:'))).toHaveLength(3);
    expect(s.booked).toEqual(expect.arrayContaining(['text:brief', 'text:concepts', 'text:cold-reader', 'text:defect-check', 'text:payoff', 'text:critic', 'text:compare']));
    expect(out.dropped.filter((d) => d.stage === 'cold-reader')).toHaveLength(3);
    expect(out.imageCostUsd).toBeCloseTo(0.0195, 4);
    // Text calls: brief .01, concepts .04, cold reader .003, three packages x (defect .006, payoff .012, critic .002), three pairs x two compares .002.
    expect(out.textCostUsd).toBeCloseTo(0.053 + 3 * 0.02 + 6 * 0.002, 4);
  });

  it('renders only two when the spend limit allows two, and none when it allows less', async () => {
    expect((await setup({ imagesAllowed: 2 }).run()).packages).toHaveLength(2);
    const none = await setup({ imagesAllowed: 1 }).run();
    expect(none.status).toBe('skipped');
    expect(none.packages).toHaveLength(0);
  });

  it('a script with no honest gap stops at the brief with the reason and pays for nothing else', async () => {
    const s = setup({ brief: makeBrief({ weakGap: 'The script lists facts and never answers a question.' }) });
    const out = await s.run();
    expect(out.status).toBe('weak_gap');
    expect(out.reason).toContain('never answers a question');
    expect(s.calls).toEqual(['brief']);
  });

  it('drops concepts that break the code checks, with the reasons, and never repairs them', async () => {
    const bad = sixConcepts();
    bad[0].title = 'Why did 25,000 pieces of iron nearly go to scrap?'; // invented figure
    bad[1].thumbnail.lettering.words = 'ALL THE IRON WE HAD'; // five words
    bad[2].supportQuote = 'a child plays with a wooden toy'; // an invented object
    const s = setup({ concepts: bad });
    const out = await s.run();
    const codeDrops = out.dropped.filter((d) => d.stage === 'code-check');
    expect(codeDrops).toHaveLength(3);
    expect(codeDrops.map((d) => d.reasons.join(' ')).join(' ')).toMatch(/25,000/);
    expect(out.packages.map((p) => p.title)).not.toContain(bad[0].title);
    expect(s.deps.coldRead).toHaveBeenCalledOnce();
  });

  it('drops a title that gives its answer away', async () => {
    const r = reader();
    r.reads[0].answerGivenAway = true;
    const out = await setup({ reader: r }).run();
    expect(out.dropped.find((d) => d.title === titleOf(0))?.reasons[0]).toMatch(/gives its answer away/);
    expect(out.packages.map((p) => p.title)).not.toContain(titleOf(0));
  });

  it('every concept failing the checks ends in none_passed without paying for a cold reader or any picture', async () => {
    const all = sixConcepts().map((c) => ({ ...c, supportQuote: 'an invented scene with a toy' }));
    const s = setup({ concepts: all });
    const out = await s.run();
    expect(out.status).toBe('none_passed');
    expect(s.calls).toEqual(['brief', 'concepts']);
  });

  it('records the recipe and the answer place, read from the chapter that answers the question', async () => {
    const out = await setup().run();
    const p = out.packages[0];
    expect(p.recipe.faceMode).toBe('none'); // an iconic subject needs no face
    expect(p.recipe.typeface).toBe('stakes');
    expect(p.recipe.prompt).toContain('Style: documentary frame');
    expect(p.recipe.prompt).not.toMatch(/\bnegative\b/i);
    expect(p.answeredAt.chapter).toBe(3);
    expect(p.answeredAt.chapterTitle).toBe(EIFFEL_CHAPTERS[2].title);
    expect(p.files.full).toMatch(/-full\.jpg$/);
    expect(path.isAbsolute(p.files.full)).toBe(false);
  });

  it('resumes from a checkpoint without paying for the brief again', async () => {
    const s = setup();
    const first = await s.run();
    expect(first.status).toBe('ready');
    const again = setup();
    await buildPackaging({
      runId: 'r', scriptText: EIFFEL_SCRIPT, chapters: EIFFEL_CHAPTERS, look: {}, imagesAllowed: 3, hooks: { onText: async () => undefined, onImage: async () => undefined, checkpoint: async () => undefined }, deps: again.deps,
      resume: { brief: makeBrief(), concepts: sixConcepts() },
    });
    expect(again.calls).not.toContain('brief');
    expect(again.calls).not.toContain('concepts');
  });
});

describe('PR B: the picture checks (R4)', () => {
  const badPayoff = (title: string): PayoffCheck => ({
    ...GOOD_PAYOFF,
    visibleThings: [{ what: 'a toy horse on the floor', supportedByScript: false }],
    ...(title === titleOf(0) ? {} : { visibleThings: GOOD_PAYOFF.visibleThings }),
  });

  it('drops a package whose picture shows something the script lacks, with the reason, and keeps the honest ones', async () => {
    const out = await setup({ payoff: badPayoff }).run();
    const gone = out.dropped.find((d) => d.stage === 'payoff');
    expect(gone?.title).toBe(titleOf(0));
    expect(gone?.reasons.join(' ')).toMatch(/toy horse/);
    expect(out.packages.map((p) => p.title)).not.toContain(titleOf(0));
    expect(out.packages.length).toBe(2);
  });

  it('drops a picture that contradicts its words, an unanswered question, a fake label, an answer not in the script', async () => {
    const cases: Array<[string, Partial<PayoffCheck>, RegExp]> = [
      ['contradiction', { contradicts: true, contradictsWhy: 'the boat is still there' }, /contradicts/],
      ['unanswered', { questionAnswered: false }, /never answers/],
      ['fake label', { fakeLabelOrUnearnedWord: true, labelWhy: '4K badge' }, /not earned/],
      ['made-up answer place', { answerQuote: 'a sentence the script never contains' }, /not a quotation/],
      ['no payoff', { arrives: false, arrivesWhy: 'it dodges' }, /pay off/],
    ];
    for (const [label, change, pattern] of cases) {
      const out = await setup({ payoff: (t) => (t === titleOf(1) ? { ...GOOD_PAYOFF, ...change } : GOOD_PAYOFF) }).run();
      const reason = out.dropped.find((d) => d.title === titleOf(1) && d.stage === 'payoff')?.reasons.join(' ');
      expect(reason, label).toMatch(pattern);
    }
  });

  it('passes the props the script never names to the payoff check as a hint, not a verdict', async () => {
    const concepts = sixConcepts();
    concepts[0].props = ['rivets', 'wooden toy'];
    const s = setup({ concepts });
    const out = await s.run();
    const hints = (s.deps.payoffCheck as unknown as { mock: { calls: Array<[{ title: string; unnamedProps?: string[] }]> } }).mock.calls.map(([p]) => [p.title, p.unnamedProps]);
    expect(hints.find(([t]) => t === titleOf(0))?.[1]).toEqual(['wooden toy']);
    expect(out.packages.map((p) => p.title)).toContain(titleOf(0));
  });

  it('drops a picture that does not connect to its title, and says so', async () => {
    const out = await setup({ critic: (t) => (t === titleOf(2) ? { ...GOOD_CRITIC, connects: false, connectsWhy: 'a castle under a Lego title' } : GOOD_CRITIC) }).run();
    expect(out.dropped.find((d) => d.title === titleOf(2))?.reasons.join(' ')).toMatch(/castle under a Lego title/);
    expect(out.packages.map((p) => p.title)).not.toContain(titleOf(2));
  });

  it('when every package fails a check Gate 2 gets status none_passed with the reasons, not a silent empty list', async () => {
    const out = await setup({ payoff: () => ({ ...GOOD_PAYOFF, questionAnswered: false }) }).run();
    expect(out.status).toBe('none_passed');
    expect(out.packages).toHaveLength(0);
    expect(out.reason).toMatch(/Nothing passed/);
    expect(out.reason).toMatch(/never answers/);
  });

  it('lettering that covers a face is moved to a clear zone with no new model call, and the founder is told', async () => {
    const face = { x0: 0.3, y0: 0.05, x1: 0.6, y1: 0.4 };
    const s = setup({
      defect: { ...CLEAN_DEFECT, faceVisible: true, faceBoxes: [face] },
      // the first zone (top) lands on the face; every other zone is clear
      boxFor: (zone) => (zone === 'top' ? { x0: 0.05, y0: 0.06, x1: 0.95, y1: 0.35 } : { x0: 0.05, y0: 0.7, x1: 0.8, y1: 0.93 }),
    });
    const out = await s.run();
    expect(out.status).toBe('ready');
    expect(out.packages[0].lettering.zone).not.toBe('top');
    expect(out.packages[0].lettering.requestedZone).toBe('top');
    expect(out.packages[0].warnings?.join(' ')).toMatch(/moved to the .* so it does not cover a face/);
    expect(s.calls.filter((c) => c === 'defect')).toHaveLength(3); // one per picture, not one per try
  });

  it('lettering that covers the face in every zone drops the package', async () => {
    const out = await setup({
      defect: { ...CLEAN_DEFECT, faceVisible: true, faceBoxes: [{ x0: 0, y0: 0, x1: 1, y1: 1 }] },
      boxFor: () => ({ x0: 0.2, y0: 0.2, x1: 0.8, y1: 0.8 }),
    }).run();
    expect(out.status).toBe('none_passed');
    expect(out.dropped.filter((d) => d.stage === 'picture-check')[0].reasons[0]).toMatch(/covers a face wherever/);
  });

  it('an uncanny face is reported, not hidden: the package stays with a warning', async () => {
    const out = await setup({ defect: { ...CLEAN_DEFECT, faceVisible: true, uncannyAtSidebar: true, defects: ['waxy skin'] } }).run();
    expect(out.packages).toHaveLength(3);
    expect(out.packages[0].warnings?.join(' ')).toMatch(/uncanny at sidebar size: waxy skin/);
  });

  it('the head to head only orders: the package that wins its pairs is listed first and nothing is picked', async () => {
    const out = await setup({ compare: (a, b) => (b === titleOf(2) ? 'b' : a === titleOf(2) ? 'a' : 'tie') }).run();
    expect(out.packages[0].title).toBe(titleOf(2));
    expect(out.packages[0].checks?.headToHead).toMatchObject({ wins: 2, losses: 0 });
    expect(out.choice).toBeUndefined();
  });
});

describe('R10: one more round when every package fails', () => {
  const TAGS2 = ['girders', 'workers', 'fair', 'permit', 'antenna', 'paris'] as const;
  const titleTwo = (i: number) => `A different angle on the ${TAGS2[i]} story`;
  const badQuote = 'an invented scene with a toy';
  const allBad = (): Concept[] => sixConcepts().map((c) => ({ ...c, supportQuote: badQuote }));
  const roundTwoConcepts = (): Concept[] =>
    DEVICES.map((device, i) => {
      const c = makeConcept({ device, title: titleTwo(i), supportQuote: SUPPORT_QUOTE });
      c.thumbnail.lettering = { words: `ALL ${TAGS2[i].toUpperCase()}`, subline: null, zone: 'top' };
      return c;
    });
  const room = async () => ({ ok: true, imagesAllowed: 3, reason: null });
  // Round one's concepts fail the code checks; the second call (with feedback) returns good ones.
  const twoRounds = (n: number, feedback?: string[]) => (n === 1 || !feedback ? allBad() : roundTwoConcepts());

  it('a seeded brief whose six concepts all fail runs round two exactly once, and its packages are marked second round', async () => {
    const s = setup({ concepts: twoRounds, roundTwoRoom: room });
    const out = await s.run();
    expect(s.calls.filter((c) => c === 'concepts')).toHaveLength(2);
    expect(out.status).toBe('ready');
    expect(out.packages.length).toBeGreaterThan(0);
    expect(out.packages.every((p) => p.round === 2)).toBe(true);
    expect(out.packages.every((p) => p.id.startsWith('r2-'))).toBe(true);
    expect(out.roundTwo?.state).toBe('finished');
    expect(out.rounds).toHaveLength(2);
    expect(out.concepts).toHaveLength(12);
    // the second round's calls are booked as their own rows, marked as round two
    expect(s.booked).toEqual(expect.arrayContaining(['text:concepts:r2', 'text:cold-reader:r2', 'text:payoff:r2']));
    expect(s.booked.filter((b) => b === 'text:concepts')).toHaveLength(1);
  });

  it('feeds back only rule names and fixed advice, never the dropped text', async () => {
    const s = setup({ concepts: twoRounds, roundTwoRoom: room });
    await s.run();
    const feedback = s.feedbackSeen[1]!;
    expect(feedback.join(' ')).toMatch(/support_not_in_script \(6\)/);
    for (const text of [badQuote, 'toy', 'iron', ...sixConcepts().map((c) => c.title)]) expect(feedback.join(' ')).not.toContain(text);
    expect(s.feedbackSeen[0]).toBeUndefined();
  });

  it('a rule that came from the picture checks is fed back by name, without the invented object', async () => {
    const toy = (): PayoffCheck => ({ ...GOOD_PAYOFF, visibleThings: [{ what: 'a toy horse on the floor', supportedByScript: false }] });
    const s = setup({ concepts: (n) => (n === 1 ? sixConcepts() : roundTwoConcepts()), payoff: (t) => (t.startsWith('A different angle') ? GOOD_PAYOFF : toy()), roundTwoRoom: room });
    const out = await s.run();
    expect(out.status).toBe('ready');
    const feedback = s.feedbackSeen[1]!.join(' ');
    expect(feedback).toMatch(/scene_not_in_script \(3\)/);
    expect(feedback).not.toMatch(/toy|horse|floor/);
  });

  it('a double failure shows the empty result with every reason and makes no third round', async () => {
    const s = setup({ concepts: () => allBad(), roundTwoRoom: room });
    const out = await s.run();
    expect(s.calls.filter((c) => c === 'concepts')).toHaveLength(2);
    expect(out.status).toBe('none_passed');
    expect(out.packages).toHaveLength(0);
    expect(out.reason).toMatch(/Nothing passed, even after a second try/);
    expect(out.dropped.filter((d) => d.round === 2)).toHaveLength(6);
    expect(out.dropped.filter((d) => d.round !== 2).length).toBe(6);
    expect(out.roundTwo?.state).toBe('finished');
    // reopening Gate 2 (a build over the finished record) does not start another round
    const again = await setup({ concepts: () => allBad(), roundTwoRoom: room }).run(s.saved());
    expect(again.status).toBe('none_passed');
    expect(again.rounds).toHaveLength(2);
  });

  it('round two never shows a package that round one rules would drop', async () => {
    const sneaky = roundTwoConcepts();
    sneaky[0].title = 'Official 4K tower film'; // a fake badge
    sneaky[1].supportQuote = badQuote; // support not in the script
    const out = await setup({ concepts: (n) => (n === 1 ? allBad() : sneaky), roundTwoRoom: room }).run();
    expect(out.packages.map((p) => p.title)).not.toContain('Official 4K tower film');
    expect(out.dropped.filter((d) => d.round === 2 && d.stage === 'code-check').flatMap((d) => d.rules ?? [])).toEqual(expect.arrayContaining(['badge', 'support_not_in_script']));
  });

  it('is skipped, with the reason shown, when the budget does not allow it', async () => {
    const s = setup({ concepts: () => allBad(), roundTwoRoom: async () => ({ ok: false, imagesAllowed: 0, reason: "the run's spend limit leaves no room for another round of pictures" }) });
    const out = await s.run();
    expect(s.calls.filter((c) => c === 'concepts')).toHaveLength(1);
    expect(out.status).toBe('none_passed');
    expect(out.roundTwo?.state).toBe('skipped');
    expect(out.reason).toMatch(/a second try was not made: the run's spend limit/);
  });

  it('no second round when round one found packages, or when the script has no gap', async () => {
    const ok = setup({ roundTwoRoom: room });
    await ok.run();
    expect(ok.calls.filter((c) => c === 'concepts')).toHaveLength(1);
    const weak = setup({ brief: makeBrief({ weakGap: 'nothing to ask' }), roundTwoRoom: room });
    await weak.run();
    expect(weak.calls).toEqual(['brief']);
  });

  it('a restart in the middle of round two resumes and never repeats a paid step that finished', async () => {
    // round one fails at the code checks (no pictures); round two's second payoff call crashes
    const first = setup({ concepts: twoRounds, roundTwoRoom: room, crashAt: 'payoff:2' });
    await expect(first.run()).rejects.toThrow(/crash at payoff:2/);
    const saved = first.saved();
    expect(saved.roundTwo?.state).toBe('started');
    expect(saved.rounds?.[1]?.processed.length).toBe(1);
    // the process restarts: same object, resume from what was saved
    const out = await first.run(saved);
    expect(out.status).toBe('ready');
    const count = (name: string) => first.calls.filter((c) => c === name).length;
    expect(count('brief')).toBe(1);
    expect(count('concepts')).toBe(2); // one per round, none repeated
    expect(count('cold')).toBe(1); // round one never reached the cold reader; round two's was not repeated
    // the package finished before the crash was not checked again: 3 packages, one payoff repeated (the crashed one)
    expect(count('payoff')).toBe(4);
    expect(count('defect')).toBe(4);
    // and its cost rows: one concepts row for round two in total
    expect(first.booked.filter((b) => b === 'text:concepts:r2')).toHaveLength(1);
    expect(out.packages).toHaveLength(3);
  });
});

describe('coldReadSelection', () => {
  const cands = [
    { id: 'a', title: 'A', device: 'stake' as const },
    { id: 'b', title: 'B', device: 'stake' as const },
    { id: 'c', title: 'C', device: 'scale' as const },
    { id: 'd', title: 'D', device: 'how' as const },
  ];
  it('prefers different devices among the top ranked, keeping rank order', () => {
    const { kept } = coldReadSelection(cands, { reads: [], ranking: [0, 1, 2, 3] });
    expect(kept.map((k) => k.id)).toEqual(['a', 'c', 'd']);
  });
  it('fills with the next best when there are not enough devices', () => {
    const { kept } = coldReadSelection(cands.slice(0, 2), { reads: [], ranking: [1, 0] });
    expect(kept.map((k) => k.id)).toEqual(['b', 'a']);
  });
});

describe('channel-agnostic (task rule 1)', () => {
  it('no channel name appears in any packaging source, prompt or fixture', () => {
    const dir = __dirname;
    const files = fs.readdirSync(dir, { recursive: true, withFileTypes: false }) as string[];
    const hits: string[] = [];
    for (const rel of files) {
      const file = path.join(dir, rel);
      if (!fs.statSync(file).isFile() || /\.(woff|jpg|png)$/.test(file) || rel.endsWith('build.test.ts')) continue;
      const text = fs.readFileSync(file, 'utf8');
      if (/\bNIYT\b|Not In Your Textbook|Cold Open|Underdogs/i.test(text)) hits.push(rel);
    }
    expect(hits).toEqual([]);
  });
  it('thumbnail files live under one per-run folder', () => {
    expect(thumbnailsDir('abc').endsWith(path.join('thumbnails', 'abc'))).toBe(true);
  });
});
