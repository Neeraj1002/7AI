import { describe, expect, it } from 'vitest';
import { resolvePurpose, type LLMResponse, type Purpose } from '../llm';
import { validateAngles, figureFlagFor } from './angles';
import { applyAngleChoice } from './choice';
import { runAngleStep, worstCaseCostUsd, NO_EXTRA_CALLS, type AngleStepDeps } from './angle-step';
import { decideMark, mapReaderReply } from './pair-reader';
import { buildStoryTestsView } from './view';

const FIVE = ['One', 'Two', 'Three', 'Four', 'Five'].map((n) => ({ title: `Title ${n}`, promise: `Promise ${n}` }));

function llm(costUsd = '0.002'): LLMResponse {
  return {
    provider: 'anthropic', model: 'claude-sonnet-5-5', text: '', stopReason: 'stop', usage: { inputTokens: 100, outputTokens: 50 },
    costUsd, maxOutputTokens: 1500,
  };
}

type Seen = { purpose: Purpose; system: string; user: string };

// A scripted model: the angle reply first, then one reader reply per call. A reader reply is chosen by the title it should click.
function scripted(readers: Array<((items: string) => unknown) | Error>, angles: unknown = { angles: FIVE }, angleCost = '0.002') {
  const seen: Seen[] = [];
  let reader = 0;
  const call: NonNullable<AngleStepDeps['call']> = async (p) => {
    seen.push({ purpose: p.purpose, system: p.system, user: p.user });
    if (p.purpose === 'story-angles') return { value: p.schema.parse(angles), llm: llm(angleCost) } as never;
    const next = readers[reader++]!;
    if (next instanceof Error) throw next;
    return { value: p.schema.parse(next(p.user)), llm: llm() } as never;
  };
  return { call, seen };
}

// Clicks the video whose title contains `want`, skips the one containing `skip`.
const pick = (want: string, skip: string) => (user: string) => {
  const idOf = (needle: string) => user.split('\n\n').find((b) => b.includes(needle))!.split('.')[0];
  return { click: { id: idOf(want), why: 'sounds fresh' }, skip: { id: idOf(skip), why: 'sounds dull' } };
};

const noMeter = { meter: async () => undefined, bookFailure: async () => undefined };
const base = { format: 'short' as const, topic: 'Why tides happen', constraints: ['under a minute'], sourceText: 'tides', persona: null };

describe('validateAngles', () => {
  it('accepts four or five angles and gives each an id', () => {
    const ok = validateAngles({ angles: FIVE });
    expect(ok.ok && ok.angles.map((a) => a.id)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5']);
  });
  it('rejects 3 and 7 angles, a missing promise and a duplicate title with a reason', () => {
    expect(validateAngles({ angles: FIVE.slice(0, 3) })).toMatchObject({ ok: false });
    expect(validateAngles({ angles: [...FIVE, ...FIVE.slice(0, 2).map((a) => ({ ...a, title: a.title + 'x' }))] })).toMatchObject({ ok: false });
    expect(validateAngles({ angles: [{ title: 'T', promise: ' ' }, ...FIVE.slice(1)] })).toMatchObject({ ok: false, reason: expect.stringContaining('promise') });
    expect(validateAngles({ angles: [FIVE[0]!, { ...FIVE[1]!, title: 'title one' }, ...FIVE.slice(2)] })).toMatchObject({ ok: false, reason: expect.stringContaining('share the title') });
  });
});

describe('figure flag', () => {
  it('flags a figure the brief never gives and stays quiet otherwise', () => {
    expect(figureFlagFor('Learn the 7 causes', 'a video about causes')).toContain('7');
    expect(figureFlagFor('Learn the 7 causes', 'cover the 7 causes')).toBeNull();
    expect(figureFlagFor('No numbers here', 'anything')).toBeNull();
    expect(figureFlagFor('The two forces, answer one', 'a bridge video')).toBeNull();
    expect(figureFlagFor('Back in 1998, 40% of them', 'a bridge video')).toContain('1998');
  });
});

describe('runAngleStep', () => {
  it('both reads picking the same angle is a clear winner, and the second read is the first reversed', async () => {
    const { call, seen } = scripted([pick('Title Two', 'Title Four'), pick('Title Two', 'Title Five')]);
    const out = await runAngleStep({ ...base, deps: { ...noMeter, call } });
    expect(out.angleStep.status).toBe('waiting');
    expect(out.angleStep.mark).toBe('clear_winner');
    expect(out.angleStep.readerTopId).toBe('a2');
    const [r1, r2] = out.angleStep.readerRuns;
    expect(r2!.order).toEqual([...r1!.order].reverse());
    expect(seen.filter((s) => s.purpose === 'story-pair-reader')).toHaveLength(2);
    expect(out.tags).toEqual({ storyTests: 'on', partA: 'used' });
  });

  it('different picks is no clear winner and shows both', async () => {
    const { call } = scripted([pick('Title Two', 'Title Four'), pick('Title Three', 'Title Five')]);
    const out = await runAngleStep({ ...base, deps: { ...noMeter, call } });
    expect(out.angleStep.mark).toBe('no_clear_winner');
    expect(out.angleStep.readerTopId).toBeNull();
    expect(out.angleStep.readerRuns.map((r) => r.clickId)).toEqual(['a2', 'a3']);
  });

  it('an invented id makes the verdict a reader error, and there is no third call', async () => {
    const { call, seen } = scripted([() => ({ click: { id: 'ZZ', why: 'x' }, skip: { id: 'YY', why: 'y' } }), pick('Title Two', 'Title Four')]);
    const out = await runAngleStep({ ...base, deps: { ...noMeter, call } });
    expect(out.angleStep.mark).toBe('no_clear_winner_reader_error');
    expect(out.angleStep.readerRuns[0]!.error).toContain('not shown');
    expect(seen).toHaveLength(3);
  });

  it('the readers are blind: no brief, topic, constraints or channel text reaches either reader', async () => {
    const { call, seen } = scripted([pick('Title Two', 'Title Four'), pick('Title Two', 'Title Four')]);
    await runAngleStep({ ...base, persona: 'a busy commuter', deps: { ...noMeter, call } });
    for (const s of seen.filter((x) => x.purpose === 'story-pair-reader')) {
      const all = `${s.system}\n${s.user}`;
      expect(all).not.toMatch(/tides|under a minute/i);
      expect(all).toContain('a busy commuter');
      expect(all).not.toMatch(/<subject>/);
    }
    expect(seen[0]!.user).toContain('Why tides happen');
  });

  it('a call that throws is recorded and never retried', async () => {
    const { call, seen } = scripted([new Error('did not return valid JSON'), pick('Title Two', 'Title Four')]);
    const out = await runAngleStep({ ...base, deps: { ...noMeter, call } });
    expect(out.angleStep.readerRuns[0]!.error).toBe('the reader returned an unreadable reply');
    expect(out.angleStep.mark).toBe('no_clear_winner_reader_error');
    expect(seen).toHaveLength(3);
  });

  it('an unusable angle reply records "not run" with the reason and calls no reader', async () => {
    const { call, seen } = scripted([], { angles: FIVE.slice(0, 3) });
    const out = await runAngleStep({ ...base, deps: { ...noMeter, call } });
    expect(out.angleStep.status).toBe('not_run');
    expect(out.angleStep.notRunReason).toContain('4 to 5');
    expect(out.tags.partA).toBe('not_run');
    expect(seen).toHaveLength(1);
  });

  it('earlier Part A spend on the run counts against the per-run cap', async () => {
    const { call, seen } = scripted([]);
    const out = await runAngleStep({ ...base, priorSpentUsd: 0.0999, deps: { ...noMeter, call } });
    expect(seen).toHaveLength(0);
    expect(out.angleStep.notRunReason).toBe('the budget for this step was reached');
    expect(out.costUsd).toBe(0);
  });

  it('a tiny cap skips every call and says why', async () => {
    const { call, seen } = scripted([]);
    const out = await runAngleStep({ ...base, deps: { ...noMeter, call, capUsd: 0.001 } });
    expect(out.angleStep.status).toBe('not_run');
    expect(out.angleStep.notRunReason).toBe('the budget for this step was reached');
    expect(seen).toHaveLength(0);
  });

  it('a cap that fits the angle call but not a reader skips the readers and still lets the founder choose', async () => {
    const { call, seen } = scripted([], undefined, '0.03');
    const angleWorst = worstCaseCostUsd('story-angles', 'x', 'y');
    const out = await runAngleStep({ ...base, deps: { ...noMeter, call, capUsd: angleWorst + 0.001 } });
    expect(seen).toHaveLength(1);
    expect(out.angleStep.status).toBe('waiting');
    expect(out.angleStep.mark).toBe('no_clear_winner_reader_error');
    expect(out.angleStep.readerRuns.every((r) => r.error === 'the budget for this step was reached')).toBe(true);
  });

  it('meters every call and the recorded total equals the sum of the calls', async () => {
    const booked: Array<[Purpose, string]> = [];
    const { call } = scripted([pick('Title Two', 'Title Four'), pick('Title Two', 'Title Four')]);
    const out = await runAngleStep({ ...base, deps: { meter: async (l, p) => void booked.push([p, l.costUsd]), bookFailure: async () => undefined, call } });
    expect(booked.map(([p]) => p)).toEqual(['story-angles', 'story-pair-reader', 'story-pair-reader']);
    expect(out.costUsd).toBeCloseTo(0.006, 6);
    expect(out.calls.reduce((s, c) => s + c.costUsd, 0)).toBeCloseTo(out.costUsd, 6);
  });
});

describe('guards and registry', () => {
  it('the retry guard refuses every extra call', async () => {
    await expect(NO_EXTRA_CALLS({ purpose: 'story-angles', reason: 'cut-off-retry' as never, unbookedCostUsd: 0 })).resolves.toEqual(expect.any(String));
  });
  it('both purposes declare their own limit and reasoning and the worst case of Part A fits the cap', () => {
    for (const p of ['story-angles', 'story-pair-reader'] as const) {
      expect(resolvePurpose(p).maxOutputTokens).toBeGreaterThan(0);
      expect(resolvePurpose(p).reasoning).toBe('off');
    }
    const worst = worstCaseCostUsd('story-angles', 'a'.repeat(2000), 'b'.repeat(500)) + 2 * worstCaseCostUsd('story-pair-reader', 'a'.repeat(1000), 'b'.repeat(2000));
    expect(worst).toBeLessThan(0.1);
  });
});

describe('mapReaderReply and decideMark', () => {
  const shownAs = { a1: 'K', a2: 'M' };
  it('rejects a click equal to the skip', () => {
    const r = mapReaderReply({ click: { id: 'K', why: 'a' }, skip: { id: 'K', why: 'b' } }, 1, ['a1', 'a2'], shownAs);
    expect(r.error).toContain('same video');
    expect(decideMark([r, r]).mark).toBe('no_clear_winner_reader_error');
  });
});

describe('applyAngleChoice and the view', () => {
  async function waiting() {
    const { call } = scripted([pick('Title Two', 'Title Four'), pick('Title Two', 'Title Five')]);
    return runAngleStep({ ...base, deps: { ...noMeter, call } });
  }
  it('stores a choice that matches, differs from, and skips the reader pick', async () => {
    const w = await waiting();
    const same = applyAngleChoice(w, 'a2', new Date());
    const other = applyAngleChoice(w, 'a1', new Date());
    const skip = applyAngleChoice(w, null, new Date());
    expect(same.ok && same.next.angleStep.choseReaderPick).toBe(true);
    expect(other.ok && other.next.angleStep.choseReaderPick).toBe(false);
    expect(skip.ok && [skip.next.angleStep.status, skip.next.angleStep.chosenId, skip.next.tags.partA]).toEqual(['skipped', null, 'skipped']);
  });
  it('rejects a foreign angle id and a second choice', async () => {
    const w = await waiting();
    expect(applyAngleChoice(w, 'nope', new Date())).toEqual({ ok: false, error: 'unknown_angle' });
    const first = applyAngleChoice(w, 'a1', new Date());
    expect(first.ok && applyAngleChoice(first.next, 'a2', new Date())).toEqual({ ok: false, error: 'not_waiting' });
  });
  it('the view is null for an old run, "running" while angles are written, and carries plain labels', async () => {
    expect(buildStoryTestsView({ intakeOutput: { topic: 't' }, runStatus: 'paused_gate1', runStage: 'gate1', switchOn: true })).toBeNull();
    expect(buildStoryTestsView({ intakeOutput: null, runStatus: 'running', runStage: 'intake', switchOn: false })).toBeNull();
    expect(buildStoryTestsView({ intakeOutput: null, runStatus: 'running', runStage: 'intake', switchOn: true })?.angleStep.status).toBe('running');
    const w = await waiting();
    const v = buildStoryTestsView({ intakeOutput: { storyTests: w }, runStatus: 'paused_angle', runStage: 'intake', switchOn: true })!;
    expect(v.angleStep.status).toBe('waiting');
    expect(v.angleStep.markLabel).toBe('Both reads picked the same angle');
    expect(v.angleStep.readerPicks).toHaveLength(2);
    expect(v.angleStep.angles.map((a) => a.id)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5']);
    expect(v.scriptCheck).toBeNull();
    expect(v.angleStep.angles.find((a) => a.id === 'a2')!.readerTags).toEqual([{ kind: 'click', label: 'Reader would click · both reads' }]);
    expect(v.angleStep.angles.find((a) => a.id === 'a1')!.readerTags).toEqual([]);
  });
});



