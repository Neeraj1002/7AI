import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ callLLM: vi.fn() }));
vi.mock('../llm', async original => ({ ...(await original<object>()), callLLM: mocks.callLLM }));
import { generateScript, buildUserMessage as writerMessage } from '../agents/script-generation';
import { buildLongSystemPrompt } from '../agents/script-generation/long-form';
import { reviewScript, buildUserMessage as reviewerMessage, LONG_FORM_SYSTEM_PROMPT } from '../agents/script-review';
import { buildEvidencePacket, renderEvidenceBlock } from './packet';

const packet = buildEvidencePacket({ briefText: 'The date may be 1812, according to the supplied brief.',
  factPolicy: 'brief-only', sources: ['https://example.test/unfetched'] });
const response = (text: string) => ({ text, usage: { inputTokens: 20, outputTokens: 20 },
  stopReason: 'stop', costUsd: '0.000001', provider: 'anthropic', model: 'mock' });
const review = JSON.stringify({ score: 8, notes: 'ok', hookScore: 8, hookNotes: 'ok',
  videoGenFit: { fitsLengthLimit: true, pacingRealistic: true, visualsProducible: true, flags: [] },
  factualConcerns: [], styleGuideViolations: [] });
beforeEach(() => mocks.callLLM.mockReset());

it.each(['short', 'long'] as const)('gives %s writer and reviewer the identical factual block', videoKind => {
  const block = renderEvidenceBlock(packet);
  const writer = writerMessage({ topic: 'bridge', constraints: [], videoKind, evidence: packet });
  const reviewer = reviewerMessage({ scriptText: 'The date may be 1812.', captions: '', nicheDescription: 'history', videoKind, evidence: packet });
  expect(writer).toContain(block);
  expect(reviewer).toContain(block);
  expect(writer).not.toContain('Sources (with the brief');
  expect(reviewer).not.toContain('Original brief:\n');
  expect(block).toContain(packet.hash);
  expect(block).toContain('unfetched; no factual text supplied');
  if (videoKind === 'long') {
    expect(buildLongSystemPrompt(true)).toContain('Citation-only URLs are unfetched and provide no facts');
    expect(LONG_FORM_SYSTEM_PROMPT).toContain('FFmpeg pan/zoom');
  }
});

it('validates before either paid call and retains the existing reviewer result shape', async () => {
  await expect(generateScript({ topic: 'bridge', constraints: [], evidence: { ...packet, briefText: 'tampered' } })).rejects.toThrow(/hash/);
  await expect(reviewScript({ scriptText: 's', captions: '', nicheDescription: 'n', evidence: packet, briefText: 'conflict' })).rejects.toThrow(/brief conflicts/);
  expect(mocks.callLLM).not.toHaveBeenCalled();
  const common = buildEvidencePacket({ briefText: 'Fact', factPolicy: 'brief-plus-common' });
  await expect(generateScript({ topic: 'bridge', constraints: [], videoKind: 'long', evidence: common })).rejects.toThrow(/brief-only policy/);
  await expect(reviewScript({ scriptText: 's', captions: '', nicheDescription: 'n', videoKind: 'long', evidence: common })).rejects.toThrow(/brief-only policy/);
  expect(mocks.callLLM).not.toHaveBeenCalled();
  mocks.callLLM.mockResolvedValueOnce(response('{"scriptText":"The date may be 1812.","captions":"","hashtags":[]}'))
    .mockResolvedValueOnce(response(review));
  await generateScript({ topic: 'bridge', constraints: [], evidence: packet });
  const result = await reviewScript({ scriptText: 'The date may be 1812.', captions: '', nicheDescription: 'history', evidence: packet });
  expect(mocks.callLLM.mock.calls).toHaveLength(2);
  expect(mocks.callLLM.mock.calls[0][0].messages[0].content).toContain(renderEvidenceBlock(packet));
  expect(mocks.callLLM.mock.calls[1][0].messages[0].content).toContain(renderEvidenceBlock(packet));
  expect(result.output).toMatchObject({ score: 8, factualConcerns: [], styleGuideViolations: [] });
  expect(Object.keys(result).sort()).toEqual(['llm', 'output']);
});
