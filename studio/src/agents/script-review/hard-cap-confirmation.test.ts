import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { buildEvidencePacket } from '../../content-evidence/packet';
import { reviewScript } from './index';
import { CONFIRM_SYSTEM_PROMPT, quotedSentences } from './hard-cap-confirmation';
import { calibrateReview, reviewRules } from './rules';
import { TransientStageError } from '../../run-pipeline/retry-with-backoff';
import type { LLMRequest, LLMResponse } from '../../llm';

const evidence = JSON.parse(readFileSync('../docs/execution/sprint5/reports/task6-code-score-acceptance-evidence.json', 'utf8'));
const fixture = evidence.fixtures.find((f: { caseId: string }) => f.caseId === 'appendix-A-clean');
const run3 = evidence.calls.find((c: { id: number }) => c.id === 3).evidence.text as string;
const finding = JSON.parse(run3).factualConcerns[0] as string;
const params = { scriptText: fixture.scriptText, captions: '', nicheDescription: 'Historical stories', videoKind: fixture.videoKind, targetSeconds: fixture.targetSeconds, chapterTitles: fixture.chapterTitles, evidence: buildEvidencePacket({ briefText: fixture.briefText, factPolicy: fixture.factPolicy }) };
const response = (text: string): LLMResponse => ({ text, stopReason: 'stop', provider: 'anthropic', model: 'claude-sonnet-5-5', usage: { inputTokens: 100, outputTokens: 100 }, costUsd: '0.001200', maxOutputTokens: 16000 });
/** Review calls get the recorded reply; the confirmation call gets `confirm`. */
const routed = (review: string, confirm: (req: LLMRequest) => string | Promise<string>) =>
  vi.fn(async (req: LLMRequest) => response(req.system === CONFIRM_SYSTEM_PROMPT ? await confirm(req) : review)) as unknown as typeof import('../../llm').callLLM & ReturnType<typeof vi.fn>;
const verdict = (v: 'supported' | 'unsupported') => JSON.stringify({ verdict: v, reason: 'test' });

it('extracts the quoted script sentence even when the quote holds an apostrophe or a fragment', () => {
  expect(quotedSentences(finding, fixture.scriptText)).toEqual(["The operator's job did not remain as it had been, but the machine did not feel normal just because it had been invented."]);
  expect(quotedSentences("SR-9: 'Pay 777 coins' invents a number. Use 'Careful.'", 'He said. "Pay 777 coins," a neighbour says. Careful.')).toEqual(['"Pay 777 coins," a neighbour says.']);
  expect(quotedSentences('SR-9: nothing quoted here', 'A script sentence.')).toEqual([]);
});

it('replays the recorded run-3 reply: a paraphrase of a supplied fact is dismissed and uncapped', async () => {
  const complete = routed(run3, () => verdict('supported'));
  const r = await reviewScript(params, complete);
  expect(r.output.score).toBe(10);
  expect(r.output.factualConcerns).toEqual([]);
  expect(r.output.notes).toContain('supported by, or a paraphrase of, the brief facts');
  expect(r.hardCapChecks?.map(c => c.outcome)).toEqual(['dismissed']);
  expect(complete).toHaveBeenCalledTimes(2);
  expect(r.calls).toHaveLength(2);
  // The question carries the sentence and the brief's facts, not the reviewer's finding.
  const asked = complete.mock.calls[1][0] as LLMRequest;
  expect(asked.messages[0].content).toContain('today only a handful of operators');
  expect(asked.messages[0].content).toContain("The operator's job did not remain as it had been");
  expect(asked.messages[0].content).not.toContain('unsupported claim');
});

it('replays run 3 with the cap confirmed: the hard cap of 6 applies exactly as before', async () => {
  const r = await reviewScript(params, routed(run3, () => verdict('unsupported')));
  expect(r.output.score).toBe(6);
  expect(r.output.factualConcerns).toEqual([finding]);
  expect(r.output.notes).toContain('capped at 6: ' + finding);
  expect(r.hardCapChecks?.map(c => c.outcome)).toEqual(['confirmed']);
});

it('keeps an unreadable or unquotable finding visible but never hard-caps it', async () => {
  const garbled = await reviewScript(params, routed(run3, () => 'not json'));
  expect(garbled.output.score).toBe(8);
  expect(garbled.output.factualConcerns).toEqual([finding]);
  expect(garbled.output.notes).toContain('hard cap of 6 not applied');
  expect(garbled.hardCapChecks?.map(c => c.outcome)).toEqual(['unconfirmed']);
  const unquoted = JSON.parse(run3), f = 'SR-9: The elevator chapter invents a consequence the brief never states.';
  unquoted.factualConcerns = [f]; unquoted.scoreAudit.findings = [{ rule: 'SR-9', finding: f }];
  unquoted.scoreAudit.rubricSubscores[2].finding = f;
  const complete = routed(JSON.stringify(unquoted), () => verdict('unsupported'));
  const r = await reviewScript(params, complete);
  expect(r.output.score).toBe(8);
  expect(complete).toHaveBeenCalledTimes(1);
});

it('does not ask about findings that cannot hard-cap, or about code-computed violations', async () => {
  const soft = JSON.parse(run3), f = 'SR-8: "Today there are only a handful of operators." drops a hedge.';
  soft.factualConcerns = [f]; soft.scoreAudit.findings = [{ rule: 'SR-8', finding: f }]; soft.scoreAudit.rubricSubscores[2].finding = f;
  const complete = routed(JSON.stringify(soft), () => verdict('unsupported'));
  const r = await reviewScript(params, complete);
  expect(r.output.score).toBe(8);
  expect(complete).toHaveBeenCalledTimes(1);
  expect(r.hardCapChecks).toBeUndefined();
});

it('books the completed review call and fails when a confirmation call itself fails', async () => {
  const complete = routed(run3, () => { throw new TransientStageError('overloaded', new Error('529')); });
  await expect(reviewScript(params, complete)).rejects.toThrow('overloaded');
});

it('leaves the cap to code when the model finding is a numeric violation computed from the brief', () => {
  const out = { score: 10, notes: 'n', hookScore: 5, hookNotes: 'h', videoGenFit: { fitsLengthLimit: true, pacingRealistic: true, visualsProducible: true, flags: [] }, factualConcerns: ['SR-9: "x y z" is unsupported'], styleGuideViolations: [] };
  expect(calibrateReview(out, [], true, () => false, new Set()).score).toBe(8);
  expect(calibrateReview(out, [], true, () => false, new Set(['SR-9: "x y z" is unsupported'])).score).toBe(6);
  expect(calibrateReview(out, [], true).score).toBe(6);
  expect(calibrateReview({ ...out, factualConcerns: [] }, ['SR-1: number 777 not in brief'], true, () => false, new Set()).score).toBe(6);
});

it('adds the restatement rule line to both review prompts', () => {
  for (const long of [false, true]) expect(reviewRules(long)).toContain('A sentence that restates or summarises a supplied fact in other words is not a new claim');
});
