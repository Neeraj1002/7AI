import { describe, expect, it } from 'vitest';
import { resolvePurpose, type LLMResponse, type Purpose } from '../llm';
import { coldReaderSystem, coldReaderUser, promiseMatchSystem, promiseMatchUser } from './prompts';
import { runScriptStep, type ScriptStepDeps } from './script-step';
import { decideVerdict, locateSwipe, saysCantTell, scriptHash } from './script-check';
import { buildScriptCheckView, buildStoryTestsView } from './view';
import { notRunStoryTests } from './angle-step';
import type { ColdReaderReply, PromiseMatchReply } from './schemas';

const SHORT = 'It starts with a quiet door. Nobody knew who opened it. The key was never found. By morning the house was empty.';
// 20 sentences of equal length, so a position is easy to place.
const LONG = Array.from({ length: 20 }, (_, i) => `Sentence number ${String(i + 1).padStart(2, '0')} says one thing.`).join(' ');

function reply(over: Partial<ColdReaderReply> = {}): ColdReaderReply {
  return {
    about: 'A house that emptied overnight.',
    why_care: 'I want to know who opened the door.',
    swipe_line: 'none',
    remembered: 'The key was never found.',
    first_sentence_keeps_me: { keeps: 'yes', why: 'A quiet door is a hook.' },
    weakest_sentence: { quote: 'The key was never found.', why: 'It leaves things hanging.' },
    ...over,
  };
}
const yes: PromiseMatchReply = { about: { match: 'yes', note: 'Same subject.' }, remembered: { match: 'yes', note: 'Same payoff.' } };

function llm(costUsd = '0.01'): LLMResponse {
  return { provider: 'anthropic', model: 'claude-sonnet-5-5', text: '', stopReason: 'stop', usage: { inputTokens: 100, outputTokens: 50 }, costUsd, maxOutputTokens: 2000 };
}

type Seen = { purpose: Purpose; system: string; user: string };
function scripted(readerReply: unknown | Error, matchReply: unknown | Error = yes, cost = '0.01') {
  const seen: Seen[] = [];
  const call: NonNullable<ScriptStepDeps['call']> = async (p) => {
    seen.push({ purpose: p.purpose, system: p.system, user: p.user });
    const next = p.purpose === 'story-cold-reader' ? readerReply : matchReply;
    if (next instanceof Error) throw next;
    return { value: p.schema.parse(next), llm: llm(cost) } as never;
  };
  return { call, seen };
}
const noMeter = { meter: async () => undefined, bookFailure: async () => undefined };
const angle = { title: 'The empty house', promise: 'You will learn who opened the door.' };
const base = { scriptText: SHORT, format: 'short' as const, persona: null, angle };

describe('locateSwipe', () => {
  it('none, and a line that is not in the script', () => {
    expect(locateSwipe(SHORT, 'none', 'short')).toEqual({ kind: 'none' });
    expect(locateSwipe(SHORT, ' None. ', 'short')).toEqual({ kind: 'none' });
    expect(locateSwipe(SHORT, 'A line nobody wrote.', 'short')).toEqual({ kind: 'not_found' });
  });
  it('finds a line quoted with straight quotes when the script has curly ones, and maps back to the script', () => {
    const text = 'Hello there. “Don’t open it,” she said — too late. Then silence.';
    const out = locateSwipe(text, `"Don't open it," she said - too late.`, 'short');
    expect(out).toMatchObject({ kind: 'found', startIndex: text.indexOf('“Don'), early: true });
  });
  it('finds a line when the script breaks it across lines or double spaces', () => {
    const text = 'First line here.\nThe key was\n  never found.\nLast bit.';
    expect(locateSwipe(text, 'The key was never found.', 'short')).toMatchObject({ kind: 'found', startIndex: text.indexOf('The key') });
  });
  it('a line still absent after normalising stays not_found (a reader error)', () => {
    expect(locateSwipe('Hello “there” friend.', 'Hello "nobody" friend.', 'short')).toEqual({ kind: 'not_found' });
  });
  it('a Short: early inside the first two sentences, not in the third', () => {
    expect(locateSwipe(SHORT, 'It starts with a quiet door.', 'short')).toMatchObject({ kind: 'found', early: true });
    expect(locateSwipe(SHORT, 'Nobody knew who opened it.', 'short')).toMatchObject({ early: true });
    expect(locateSwipe(SHORT, 'The key was never found.', 'short')).toMatchObject({ early: false });
  });
  it('long-form: early below 15 percent by position, not above it', () => {
    const at = (pct: number) => {
      const index = Math.floor((LONG.length * pct) / 100);
      const start = LONG.lastIndexOf('Sentence', index);
      return LONG.slice(start, start + 34);
    };
    const early = locateSwipe(LONG, at(14), 'long');
    const late = locateSwipe(LONG, at(16), 'long');
    expect(early).toMatchObject({ kind: 'found' });
    expect(late).toMatchObject({ kind: 'found' });
    expect((early as { startIndex: number }).startIndex / LONG.length).toBeLessThan(0.15);
    expect((late as { startIndex: number }).startIndex / LONG.length).toBeGreaterThanOrEqual(0.15);
    expect((early as { early: boolean }).early).toBe(true);
    expect((late as { early: boolean }).early).toBe(false);
  });
});

describe('decideVerdict', () => {
  const decide = (r: ColdReaderReply, match: PromiseMatchReply | null = yes, script = SHORT) => decideVerdict({ scriptText: script, format: 'short', reader: r, match });
  it('PASS when nothing fires', () => {
    expect(decide(reply())).toMatchObject({ ok: true, verdict: 'pass', reasons: [] });
  });
  it('each FAIL reason alone makes a FAIL and is listed', () => {
    expect(decide(reply({ why_care: "can't tell" }))).toMatchObject({ verdict: 'fail', reasons: ['cant_tell'] });
    expect(decide(reply({ swipe_line: 'It starts with a quiet door.' }))).toMatchObject({ verdict: 'fail', reasons: ['swipe_early'] });
    expect(decide(reply({ first_sentence_keeps_me: { keeps: 'no', why: 'Flat.' } }))).toMatchObject({ verdict: 'fail', reasons: ['first_sentence_no'] });
    expect(decide(reply(), { ...yes, remembered: { match: 'no', note: 'Different.' } })).toMatchObject({ verdict: 'fail', reasons: ['promise_mismatch'] });
    expect(decide(reply(), { ...yes, about: { match: 'no', note: 'Different.' } })).toMatchObject({ verdict: 'fail', reasons: ['promise_mismatch'] });
  });
  it('lists every reason that fired', () => {
    const out = decide(reply({ why_care: "Can't tell.", swipe_line: 'Nobody knew who opened it.', first_sentence_keeps_me: { keeps: 'no', why: 'x' } }), { ...yes, about: { match: 'no', note: 'x' } });
    expect(out).toMatchObject({ verdict: 'fail', reasons: ['cant_tell', 'swipe_early', 'first_sentence_no', 'promise_mismatch'] });
  });
  it('a swipe line that is not in the script is a reader error, never a pass', () => {
    expect(decide(reply({ swipe_line: 'Made up line.' }))).toEqual({ ok: false, reason: 'the reader quoted a line that is not in the script' });
  });
  it('no match result (Part A skipped, or the check failed) cannot cause a FAIL', () => {
    expect(decide(reply(), null)).toMatchObject({ verdict: 'pass' });
  });
  it('recognises can not tell in its usual spellings only at the start', () => {
    expect(saysCantTell("can't tell")).toBe(true);
    expect(saysCantTell('Can’t tell, really.')).toBe(true);
    expect(saysCantTell('I cannot tell')).toBe(false);
    expect(saysCantTell('Because it is about a door, and I cannot tell more')).toBe(false);
  });
});

describe('runScriptStep', () => {
  it('a passing read with a chosen angle makes two calls and stores the match', async () => {
    const { call, seen } = scripted(reply());
    const out = await runScriptStep({ ...base, deps: { ...noMeter, call } });
    expect(seen.map((s) => s.purpose)).toEqual(['story-cold-reader', 'story-promise-match']);
    expect(out).toMatchObject({ status: 'ran', verdict: 'pass', reasons: [], tags: { partB: 'ran' }, promiseMatch: { ran: true } });
    expect(out.scriptHash).toBe(scriptHash(SHORT));
    expect(out.calls).toHaveLength(2);
  });

  it('Part A skipped or not run: no match call, and no FAIL from it', async () => {
    const { call, seen } = scripted(reply());
    const out = await runScriptStep({ ...base, angle: null, deps: { ...noMeter, call } });
    expect(seen.map((s) => s.purpose)).toEqual(['story-cold-reader']);
    expect(out).toMatchObject({ status: 'ran', verdict: 'pass', promiseMatch: { ran: false, note: 'Not compared: no angle was chosen' } });
  });

  it('the reader request holds the script text and the persona only', async () => {
    const { call, seen } = scripted(reply());
    await runScriptStep({ ...base, persona: 'a tired commuter, ready to swipe.', deps: { ...noMeter, call } });
    const reader = seen[0]!;
    expect(reader.system).toBe(coldReaderSystem('a tired commuter, ready to swipe.'));
    expect(reader.user).toBe(coldReaderUser(SHORT));
    // Nothing from the angle, the brief or a channel reaches it.
    expect(reader.system + reader.user).not.toContain(angle.title);
    expect(reader.system + reader.user).not.toContain(angle.promise);
  });

  it('the match request holds the promise and the two answers, not the script', async () => {
    const { call, seen } = scripted(reply());
    await runScriptStep({ ...base, deps: { ...noMeter, call } });
    expect(seen[1]!.system).toBe(promiseMatchSystem());
    expect(seen[1]!.user).toBe(promiseMatchUser(angle.promise, 'A house that emptied overnight.', 'The key was never found.'));
    expect(seen[1]!.user).not.toContain('quiet door');
  });

  it('an unreadable reply is recorded as not run (reader error), never a verdict', async () => {
    const { call, seen } = scripted(new Error('Model did not return valid JSON'));
    const out = await runScriptStep({ ...base, deps: { ...noMeter, call } });
    expect(seen).toHaveLength(1);
    expect(out).toMatchObject({ status: 'not_run', verdict: null, notRunReason: 'the reader returned an unreadable reply', tags: { partB: 'not_run' } });
  });

  it('a reply that breaks the six-field shape is an error, not a verdict', async () => {
    const { call } = scripted({ about: 'x' });
    const out = await runScriptStep({ ...base, deps: { ...noMeter, call } });
    expect(out.status).toBe('not_run');
    expect(out.verdict).toBeNull();
  });

  it('a quote not found is recorded as a reader error, not a pass', async () => {
    const { call } = scripted(reply({ swipe_line: 'Not in the script.' }));
    const out = await runScriptStep({ ...base, deps: { ...noMeter, call } });
    expect(out).toMatchObject({ status: 'not_run', verdict: null, notRunReason: 'the reader quoted a line that is not in the script' });
  });

  it('a failed match call does not fail the check', async () => {
    const { call } = scripted(reply(), new Error('network down'));
    const out = await runScriptStep({ ...base, deps: { ...noMeter, call } });
    expect(out).toMatchObject({ status: 'ran', verdict: 'pass', promiseMatch: { ran: false, note: 'Not compared: the match check could not run' } });
  });

  it('a tiny cap skips every call and says why', async () => {
    const { call, seen } = scripted(reply());
    const out = await runScriptStep({ ...base, deps: { ...noMeter, call, capUsd: 0.0001 } });
    expect(seen).toHaveLength(0);
    expect(out).toMatchObject({ status: 'not_run', notRunReason: 'the budget for this step was reached', costUsd: 0 });
  });

  it('earlier Part B spend on the run counts against the per-run cap', async () => {
    const { call, seen } = scripted(reply());
    const out = await runScriptStep({ ...base, priorSpentUsd: 0.1499, deps: { ...noMeter, call } });
    expect(seen).toHaveLength(0);
    expect(out).toMatchObject({ status: 'not_run', notRunReason: 'the budget for this step was reached', costUsd: 0 });
  });

  it('three re-reviews on one run never spend more than the cap in total', async () => {
    let total = 0;
    for (let i = 0; i < 3; i++) {
      // Each call costs 0.02, below its worst case (as a real call always is), against a cap of 0.05.
      const { call } = scripted(reply(), yes, '0.02');
      const out = await runScriptStep({ ...base, priorSpentUsd: total, deps: { ...noMeter, call, capUsd: 0.05 } });
      total += out.costUsd;
    }
    expect(total).toBeLessThanOrEqual(0.05);
    expect(total).toBeGreaterThan(0);
  });

  it('a small earlier spend leaves room, and the stored cost is this execution only', async () => {
    const { call, seen } = scripted(reply());
    const out = await runScriptStep({ ...base, priorSpentUsd: 0.01, deps: { ...noMeter, call } });
    expect(seen).toHaveLength(2);
    expect(out.costUsd).toBeCloseTo(out.calls.reduce((s, c) => s + c.costUsd, 0), 10);
  });

  it('a cap that fits the reader but not the match check skips only the match', async () => {
    const { call, seen } = scripted(reply(), yes, '0.148');
    const out = await runScriptStep({ ...base, deps: { ...noMeter, call, capUsd: 0.15 } });
    expect(seen.map((s) => s.purpose)).toEqual(['story-cold-reader']);
    expect(out).toMatchObject({ status: 'ran', promiseMatch: { ran: false, note: 'Not compared: the budget for this step was reached' } });
  });

  it('meters every call and the total equals the sum', async () => {
    const metered: string[] = [];
    const { call } = scripted(reply());
    const out = await runScriptStep({ ...base, deps: { meter: async (_l, p) => void metered.push(p), bookFailure: async () => undefined, call } });
    expect(metered).toEqual(['story-cold-reader', 'story-promise-match']);
    expect(out.costUsd).toBeCloseTo(out.calls.reduce((s, c) => s + c.costUsd, 0), 10);
  });

  it('refuses every extra provider call, so the part cannot exceed two calls', async () => {
    let guard: unknown;
    const call: NonNullable<ScriptStepDeps['call']> = async (p) => {
      guard = p.retryGuard;
      return { value: p.schema.parse(p.purpose === 'story-cold-reader' ? reply() : yes), llm: llm() } as never;
    };
    await runScriptStep({ ...base, deps: { ...noMeter, call } });
    await expect((guard as () => Promise<string | null>)()).resolves.toEqual(expect.any(String));
  });

  it('real worst-case cost for a long script stays under the Part B cap', async () => {
    const entry = resolvePurpose('story-cold-reader');
    const tokens = Math.ceil((coldReaderSystem(null).length + 'x'.repeat(30_000).length) / 4);
    const cost = (tokens * 2 + entry.maxOutputTokens * 10) / 1_000_000;
    expect(cost).toBeLessThan(0.15);
  });
});

describe('scriptCheck view', () => {
  it('shows the answers, server wording and the advisory note', async () => {
    const { call } = scripted(reply({ swipe_line: 'The key was never found.' }), { ...yes, remembered: { match: 'no', note: 'Different.' } });
    const stored = await runScriptStep({ ...base, deps: { ...noMeter, call } });
    const view = buildScriptCheckView(stored, SHORT);
    expect(view).toMatchObject({
      status: 'ran', verdict: 'fail', verdictLabel: 'A stranger may swipe away',
      reasons: [{ code: 'promise_mismatch', label: expect.any(String) }],
      swipeLine: 'The key was never found.', firstSentence: { keeps: true }, scriptChanged: false,
      promiseMatch: { ran: true },
    });
    expect(view.advisoryNote).toMatch(/text-only/);
    expect(view.swipeAtPercent).toBeGreaterThan(0);
  });

  it('a check that did not run shows no answers and never looks like a pass', async () => {
    const { call } = scripted(reply({ swipe_line: 'Not in the script.' }));
    const stored = await runScriptStep({ ...base, deps: { ...noMeter, call } });
    const view = buildScriptCheckView(stored, SHORT);
    expect(view).toMatchObject({ status: 'not_run', verdict: null, verdictLabel: null, about: null, whyCare: null, firstSentence: null, reasons: [] });
  });

  it('script changed since this check', async () => {
    const { call } = scripted(reply());
    const stored = await runScriptStep({ ...base, deps: { ...noMeter, call } });
    expect(buildScriptCheckView(stored, SHORT + ' An edit.').scriptChanged).toBe(true);
    expect(buildScriptCheckView(stored, null).scriptChanged).toBe(false);
  });

  it('runs.get shape: scriptCheck is null when the review has no storyTest, and present when it has', async () => {
    const { call } = scripted(reply());
    const stored = await runScriptStep({ ...base, deps: { ...noMeter, call } });
    const intake = { topic: 't', constraints: [], storyTests: notRunStoryTests('Gate 1 is off for this channel') };
    const without = buildStoryTestsView({ intakeOutput: intake, runStatus: 'paused_gate1', runStage: 'gate1', scriptReviewOutput: { score: 8 }, currentScriptText: SHORT });
    const withCheck = buildStoryTestsView({ intakeOutput: intake, runStatus: 'paused_gate1', runStage: 'gate1', scriptReviewOutput: { score: 8, storyTest: stored }, currentScriptText: SHORT });
    expect(without?.scriptCheck).toBeNull();
    expect(withCheck?.scriptCheck?.verdict).toBe('pass');
  });
});
