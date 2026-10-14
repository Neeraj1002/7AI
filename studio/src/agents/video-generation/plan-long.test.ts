import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ callLLM: vi.fn() }));
vi.mock('../../llm', async (orig) => ({ ...(await orig<object>()), callLLM: mocks.callLLM }));
import { planLongVideoProduction, LONG_CHAPTER_PLAN_MAX_TOKENS, type LongPlanningCheckpoint } from './plan-long';
import { ProductionPlanSchema } from './plan';
import { getStageErrorContext, NonTransientStageError, TransientStageError } from '../../run-pipeline/retry-with-backoff';
const chapters = [
  { title: 'Opening', text: Array.from({ length: 200 }, (_, i) => `opening${i}`).join(' ') },
  { title: 'The quarry', text: Array.from({ length: 200 }, (_, i) => `quarry${i}`).join(' ') },
  { title: 'The Daily Commute: the workers who adjusted to the wall', text: Array.from({ length: 600 }, (_, i) => `commute${i}`).join(' ') },
];
const params = { chapters, topic: 'The wall', targetSeconds: 600 };
const llm = (text: string, extra: Record<string, unknown> = {}) => ({ text, usage: { inputTokens: 500, outputTokens: 400 }, stopReason: 'stop', costUsd: '0.001000', provider: 'anthropic', model: 'claude-sonnet-5', ...extra });
function anchors(req: { messages: { content: string }[] }): string[] {
  return JSON.parse(req.messages[0].content.match(/Required batch anchors in order: (\[[^\n]*\])/)![1]);
}
function goodReply(req: Parameters<typeof anchors>[0]) {
  return llm(JSON.stringify({ scenes: anchors(req).map(words => ({ words, prompt: `Tracking camera follows ${words}, period clothing and drifting smoke.` })), audioLayer: 'mysterious' }));
}
const capped = () => llm('{"scenes":[', { stopReason: 'length', usage: { inputTokens: 500, outputTokens: LONG_CHAPTER_PLAN_MAX_TOKENS } });
describe('bounded long-form planning', () => {
  beforeEach(() => { mocks.callLLM.mockReset(); mocks.callLLM.mockImplementation(goodReply); });
  it('plans a large chapter in bounded batches with exact order, context and required fields', async () => {
    const booked = vi.fn();
    const saved: LongPlanningCheckpoint[] = [];
    const { plan, calls } = await planLongVideoProduction({ ...params, onCall: booked, onCheckpoint: async c => { saved.push(c); } });
    expect(ProductionPlanSchema.safeParse(plan).success).toBe(true);
    expect(plan.longScenes).toHaveLength(120);
    expect(plan.audioLayer).toBe('mysterious');
    expect(plan.stillScenePrompts).toEqual(plan.longScenes!.map(s => s.prompt));
    let cursor = 0;
    [24, 24, 72].forEach((count, chapterIndex) => {
      const words = chapters[chapterIndex].text.split(' ');
      for (let slot = 0; slot < count; slot++) {
        const start = Math.floor(slot * words.length / count);
        expect(plan.longScenes![cursor++]).toMatchObject({ chapterIndex, words: words.slice(start, start + 6).join(' ') });
      }
    });
    expect(calls).toHaveLength(10);
    expect(booked).toHaveBeenCalledTimes(10);
    expect(saved).toHaveLength(10);
    expect(Object.keys(saved[0].scenes)).toHaveLength(12);
    for (const [req] of mocks.callLLM.mock.calls) {
      expect(anchors(req).length).toBeLessThanOrEqual(12);
      expect(req.maxTokens).toBe(8192);
      expect(req.outputSchema).toBeDefined();
      expect(req.messages[0].content).toContain('Chapters in order: 1. Opening; 2. The quarry; 3. The Daily Commute');
      if (req.messages[0].content.includes('This is chapter 3')) expect(req.messages[0].content).toContain(chapters[2].text);
    }
    expect(mocks.callLLM.mock.calls[0][0].system).toContain('"audioLayer": string');
    expect(mocks.callLLM.mock.calls[1][0].system).not.toContain('"audioLayer": string');
  });
  it('splits an exhausted batch without retrying an identical oversized request', async () => {
    mocks.callLLM.mockImplementationOnce(capped);
    const { plan, calls } = await planLongVideoProduction(params);
    expect(plan.longScenes).toHaveLength(120);
    expect(calls).toHaveLength(12);
    expect(mocks.callLLM.mock.calls.slice(0, 3).map(([r]) => anchors(r).length)).toEqual([12, 6, 6]);
    expect(plan.longScenes!.slice(0, 12).map(s => s.words)).toEqual(anchors(mocks.callLLM.mock.calls[0][0]));
  });
  it('detects cap exhaustion even with an unknown stop reason', async () => {
    mocks.callLLM.mockImplementationOnce(() => ({ ...capped(), stopReason: 'unknown' }));
    expect((await planLongVideoProduction(params)).plan.longScenes).toHaveLength(120);
    expect(anchors(mocks.callLLM.mock.calls[1][0])).toHaveLength(6);
  });
  it('recovers chapter 3 exhaustion after the first two chapters are already planned', async () => {
    let exhausted = false;
    mocks.callLLM.mockImplementation(req => {
      if (!exhausted && req.messages[0].content.includes('This is chapter 3')) {
        exhausted = true;
        return capped();
      }
      return goodReply(req);
    });
    const { plan } = await planLongVideoProduction(params);
    expect(exhausted).toBe(true);
    expect(plan.longScenes!.filter(s => s.chapterIndex === 2)).toHaveLength(72);
    expect(mocks.callLLM.mock.calls.slice(4, 7).map(([r]) => anchors(r).length)).toEqual([12, 6, 6]);
  });
  it('guards every call, including split requests and JSON correction retries', async () => {
    mocks.callLLM.mockImplementationOnce(capped).mockResolvedValueOnce(llm('{invalid'));
    const beforeCall = vi.fn();
    const { calls } = await planLongVideoProduction({ ...params, beforeCall });
    expect(beforeCall).toHaveBeenCalledTimes(calls.length);
  });
  it('terminates single-scene exhaustion with distinct diagnostics and books every call', async () => {
    mocks.callLLM.mockImplementation(capped);
    const book = vi.fn();
    const error = await planLongVideoProduction({ ...params, onCall: book }).catch(e => e);
    expect(error).toBeInstanceOf(NonTransientStageError);
    expect(error.message).toContain('cut off at the output cap');
    expect(mocks.callLLM.mock.calls.map(([r]) => anchors(r).length)).toEqual([12, 6, 3, 1]);
    expect(book).toHaveBeenCalledTimes(4);
    expect(getStageErrorContext(error)).toMatchObject({ failureKind: 'output_token_exhaustion', sceneCount: 1, stopReason: 'length', rawReply: '{"scenes":[', attempts: 1 });
  });
  it('reuses completed batches after provider failure, including the left half of a split', async () => {
    let checkpoint: LongPlanningCheckpoint | undefined;
    const failure = new TransientStageError('temporary provider outage');
    mocks.callLLM.mockImplementationOnce(capped).mockImplementationOnce(goodReply).mockRejectedValueOnce(failure);
    await expect(planLongVideoProduction({ ...params, onCheckpoint: async c => { checkpoint = c; } })).rejects.toBe(failure);
    expect(Object.keys(checkpoint!.scenes)).toHaveLength(6);
    mocks.callLLM.mockClear();
    const result = await planLongVideoProduction({ ...params, checkpoint });
    expect(result.plan.longScenes).toHaveLength(120);
    expect(anchors(mocks.callLLM.mock.calls[0][0])[0]).toBe('opening50 opening51 opening52 opening53 opening54 opening55');
    expect(result.plan.longScenes![0].prompt).toBe(checkpoint!.scenes['0:0'].prompt);
  });
  it('invalidates checkpoints after narration, count, style or review notes change', async () => {
    let checkpoint: LongPlanningCheckpoint | undefined;
    await planLongVideoProduction({ ...params, onCheckpoint: async c => { checkpoint = c; } });
    for (const change of [{ fixNotes: 'new review' }, { visualStyle: 'new style' }, { targetSeconds: 650 }, { chapters: [{ ...chapters[0], text: 'changed ' + chapters[0].text }, ...chapters.slice(1)] }]) {
      mocks.callLLM.mockClear();
      await planLongVideoProduction({ ...params, ...change, checkpoint });
      expect(mocks.callLLM.mock.calls[0][0].messages[0].content).toContain('Chapter scene range: 1-12');
    }
    mocks.callLLM.mockClear();
    expect((await planLongVideoProduction({ ...params, checkpoint })).calls).toHaveLength(0);
    expect(mocks.callLLM).not.toHaveBeenCalled();
  });
  it('retries malformed JSON once using the existing correction prompt', async () => {
    mocks.callLLM.mockResolvedValueOnce(llm('{invalid'));
    await planLongVideoProduction(params);
    expect(mocks.callLLM.mock.calls[1][0].messages[0].content).toContain('Your previous reply was unusable');
    expect(anchors(mocks.callLLM.mock.calls[1][0])).toEqual(anchors(mocks.callLLM.mock.calls[0][0]));
  });
  it.each(['missing', 'extra', 'reordered', 'blank prompt'])('rejects %s scenes instead of dropping work', async kind => {
    mocks.callLLM.mockImplementation(req => {
      const reply = JSON.parse(goodReply(req).text);
      if (kind === 'missing') reply.scenes.pop();
      if (kind === 'extra') reply.scenes.push(reply.scenes[0]);
      if (kind === 'reordered') reply.scenes.reverse();
      if (kind === 'blank prompt') reply.scenes[0].prompt = '';
      return llm(JSON.stringify(reply));
    });
    await expect(planLongVideoProduction(params)).rejects.toThrow(/unusable twice/);
    expect(mocks.callLLM).toHaveBeenCalledTimes(2);
  });
  it('preserves an explicit audio override without redundant mood requests', async () => {
    expect((await planLongVideoProduction({ ...params, audioLayerOverride: 'none' })).plan.audioLayer).toBe('none');
    expect(mocks.callLLM.mock.calls.every(([r]) => !r.system.includes('"audioLayer": string'))).toBe(true);
  });
  it('still accepts fenced JSON and repairs raw newlines in prompts', async () => {
    mocks.callLLM.mockImplementationOnce(req => {
      const reply = JSON.parse(goodReply(req).text);
      reply.scenes[0].prompt = 'Tracking shot says "hello" beside C:\\maps\nSecond line';
      return llm('Here is the plan:\n```json\n' + JSON.stringify(reply).replace('\\nSecond line', '\nSecond line') + '\n```');
    });
    expect((await planLongVideoProduction(params)).plan.longScenes![0].prompt).toContain('\nSecond line');
  });
});
