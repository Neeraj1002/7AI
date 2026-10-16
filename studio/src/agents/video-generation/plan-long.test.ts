import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ callLLM: vi.fn() }));
vi.mock('../../llm', async (orig) => ({ ...(await orig<object>()), callLLM: mocks.callLLM }));
import { planLongVideoProduction, LONG_CHAPTER_PLAN_MAX_TOKENS, type LongPlanningCheckpoint, longPlanningInputHash, reusableLongPlanningCheckpoint } from './plan-long';
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
  return llm(JSON.stringify({ scenes: Object.fromEntries(JSON.parse(req.messages[0].content.match(/Required scene slots: (\[[^\n]*\])/)![1]).map((slot: {id:string;anchor:string}) => [slot.id, {prompt: `A still composition of ${slot.anchor}, period clothing and drifting smoke.`, purpose: 'illustration'}])), audioLayer: 'mysterious' }));
}
const capped = () => llm('{"scenes":[', { stopReason: 'length', usage: { inputTokens: 500, outputTokens: LONG_CHAPTER_PLAN_MAX_TOKENS } });
describe('bounded long-form planning', () => {
  beforeEach(() => { mocks.callLLM.mockReset(); mocks.callLLM.mockImplementation(goodReply); });
  it('requests renderable still compositions without generated motion or video providers', async () => {
    await planLongVideoProduction(params);
    const system = mocks.callLLM.mock.calls[0][0].system;
    expect(system).toContain('meaningful frozen instant');
    expect(system).toContain('safe crop space for FFmpeg pan/zoom');
    expect(system).toContain('reconstruction is an illustration');
    expect(system).not.toMatch(/Runway|Hunyuan|Think in Motion|continuous, organic physical motion|drone shot rising/i);
  });
  it('plans a large chapter in bounded batches with exact order, context and required fields', async () => {
    const booked = vi.fn();
    const saved: LongPlanningCheckpoint[] = [];
    const { plan, calls } = await planLongVideoProduction({ ...params, onCall: booked, onCheckpoint: async c => { saved.push(c); } });
    expect(ProductionPlanSchema.safeParse(plan).success).toBe(true);
    expect(plan.longScenes).toHaveLength(120);
    expect(plan.audioLayer).toBe('mysterious');
    expect(plan.stillScenePrompts).toEqual(plan.longScenes!.map(s => s.prompt));
    expect(plan.sceneMeanings?.scenes).toHaveLength(120);
    expect(plan.sceneMeanings?.scenes[0]).toEqual({ sceneId: '0:0', narrationSpan: { chapterIndex: 0, startWord: 0, endWordExclusive: 8 }, purpose: 'illustration' });
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
    expect(mocks.callLLM.mock.calls[1][0].messages[2].content).toContain('Your previous reply was unusable');
    expect(anchors(mocks.callLLM.mock.calls[1][0])).toEqual(anchors(mocks.callLLM.mock.calls[0][0]));
  });
  it.each(['missing', 'extra', 'blank prompt'])('rejects %s scenes instead of dropping work', async kind => {
    mocks.callLLM.mockImplementation(req => {
      const reply = JSON.parse(goodReply(req).text);
      if (kind === 'missing') delete reply.scenes[Object.keys(reply.scenes)[0]];
      if (kind === 'extra') reply.scenes.scene_999 = {prompt:'unrequested beat'};
      if (kind === 'blank prompt') reply.scenes[Object.keys(reply.scenes)[0]].prompt = '';
      return llm(JSON.stringify(reply));
    });
    await expect(planLongVideoProduction(params)).rejects.toThrow(/unusable twice/);
    expect(mocks.callLLM).toHaveBeenCalledTimes(8);
  });
  it('preserves an explicit audio override without redundant mood requests', async () => {
    expect((await planLongVideoProduction({ ...params, audioLayerOverride: 'none' })).plan.audioLayer).toBe('none');
    expect(mocks.callLLM.mock.calls.every(([r]) => !r.system.includes('"audioLayer": string'))).toBe(true);
  });
  it('still accepts fenced JSON and repairs raw newlines in prompts', async () => {
    mocks.callLLM.mockImplementationOnce(req => {
      const reply = JSON.parse(goodReply(req).text);
      reply.scenes[Object.keys(reply.scenes)[0]].prompt = 'Tracking shot says "hello" beside C:\\maps\nSecond line';
      return llm('Here is the plan:\n```json\n' + JSON.stringify(reply).replace('\\nSecond line', '\nSecond line') + '\n```');
    });
    expect((await planLongVideoProduction(params)).plan.longScenes![0].prompt).toContain('\nSecond line');
  });
});

describe('planner paid-call guard', () => {
  it('checks the spend limit before every planner batch call', async () => {
    mocks.callLLM.mockReset().mockImplementation(goodReply);
    const beforeCall = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new NonTransientStageError('Spend limit reached'));
    await expect(planLongVideoProduction({ chapters, topic: 'T', targetSeconds: 120, beforeCall })).rejects.toThrow('Spend limit reached');
    expect(mocks.callLLM).toHaveBeenCalledTimes(1);
    expect(beforeCall).toHaveBeenCalledTimes(2);
  });
});

beforeEach(() => { mocks.callLLM.mockReset().mockImplementation(goodReply); });

it('strict native schema requires exactly the supplied IDs, independent of JSON property order', async () => {
  mocks.callLLM.mockImplementation(req => {
    const reply=JSON.parse(goodReply(req).text);
    reply.scenes=Object.fromEntries(Object.entries(reply.scenes).reverse());
    const checked=req.outputSchema.safeParse({...reply,scenes:{...reply.scenes,scene_999:{prompt:'extra'}}});
    expect(checked.success).toBe(false);
    return llm(JSON.stringify(reply));
  });
  const {plan}=await planLongVideoProduction(params);
  expect(plan.longScenes![0].words).toBe('opening0 opening1 opening2 opening3 opening4 opening5');
});
it('rejects duplicate textual IDs, including escaped spellings, and corrects against the rejected reply',async()=>{
  mocks.callLLM.mockImplementationOnce(req=>{
    const reply=goodReply(req).text;
    return llm(reply.replace('"scenes":{','"scenes":{"scene_\\u0030":{"prompt":"duplicate"},'));
  });
  const book=vi.fn();
  await planLongVideoProduction({...params,onCall:book});
  expect(book.mock.calls[0][1]).toMatchObject({validationOutcome:'duplicate_scene_id',recoveryStrategy:'correct'});
  expect(mocks.callLLM.mock.calls[1][0].messages[1].content).toContain('duplicate');
});
it('recovers persistent multi-slot schema failures by splitting into single-slot requests',async()=>{
  mocks.callLLM.mockImplementation(req=>anchors(req).length>1?llm('{"scenes":[]}'):goodReply(req));
  const {plan,calls}=await planLongVideoProduction(params);
  expect(plan.longScenes).toHaveLength(120);
  expect(calls.length).toBeLessThan(600); // finite tree, two calls per invalid internal node
  expect(mocks.callLLM.mock.calls.every(([r])=>anchors(r).length<=12)).toBe(true);
});
it('carries a validated legacy checkpoint before a cancelled call and preserves accepted prompts',async()=>{
  const legacy={inputHash:longPlanningInputHash(params,2),scenes:{'0:0':{words:'opening0 opening1 opening2 opening3 opening4 opening5',prompt:'already paid'}}};
  const onCheckpoint=vi.fn();const cancelled=new NonTransientStageError('Cancelled by user');
  mocks.callLLM.mockClear();
  await expect(planLongVideoProduction({...params,checkpoint:legacy,onCheckpoint,beforeCall:async()=>{throw cancelled;}})).rejects.toBe(cancelled);
  expect(mocks.callLLM).not.toHaveBeenCalled();
  expect(onCheckpoint.mock.calls[0][0]).toMatchObject({contractVersion:4,scenes:legacy.scenes});
  expect(reusableLongPlanningCheckpoint({...params,visualStyle:'changed'},legacy)).toBeUndefined();
});

it('reuses a version 3 fixed-slot checkpoint with explicit unknown purpose', async () => {
  const older = { inputHash: longPlanningInputHash(params, 3), contractVersion: 3,
    scenes: { '0:0': { words: 'opening0 opening1 opening2 opening3 opening4 opening5', prompt: 'previously paid still' } } };
  const result = await planLongVideoProduction({ ...params, checkpoint: older });
  expect(result.plan.longScenes?.[0].prompt).toBe('previously paid still');
  expect(result.plan.sceneMeanings?.scenes[0]).toMatchObject({ sceneId: '0:0', purpose: 'unspecified' });
  expect(mocks.callLLM.mock.calls[0][0].messages[0].content).toContain('Chapter scene range: 2-13');
});

// User-supplied approved narration, not an assertion of historical accuracy.
// Other chapters and prompts below are synthetic; no missing response tail is reconstructed.
import merchant from './fixtures/merchant-planning.json';
it.each(merchant.observedExtraAnchors)('repairs the incident extra anchor "%s" while retaining 27 legacy scenes and all narration spans',async extra=>{
  const incidentChapters=[
    {title:'Opening',text:Array.from({length:326},(_,i)=>`setup${i}`).join(' ')},
    {title:merchant.title,text:merchant.text},
    {title:'Commute',text:Array.from({length:281},(_,i)=>`commute${i}`).join(' ')},
    {title:'Groves',text:Array.from({length:288},(_,i)=>`groves${i}`).join(' ')},
  ];
  const input={chapters:incidentChapters,topic:'Borders and ordinary residents',targetSeconds:480};
  const savedScenes=Object.fromEntries(Array.from({length:27},(_,i)=>{
    const start=Math.floor(i*326/27);
    return [`0:${i}`,{words:incidentChapters[0].text.split(' ').slice(start,start+6).join(' '),prompt:`paid setup ${i}`}];
  }));
  const checkpoint={inputHash:longPlanningInputHash(input,2),scenes:savedScenes,audioLayer:'calm'};
  mocks.callLLM.mockImplementationOnce(req=>llm(JSON.stringify({scenes:[...anchors(req).map(words=>({words,prompt:'synthetic visual'})),{words:extra,prompt:'unrequested beat'}]})));
  const booked=vi.fn();const persisted=vi.fn();
  const {plan,calls}=await planLongVideoProduction({...input,checkpoint,onCall:booked,onCheckpoint:persisted});
  expect(plan.longScenes).toHaveLength(96);
  expect([0,1,2,3].map(i=>plan.longScenes!.filter(s=>s.chapterIndex===i).length)).toEqual([27,23,23,23]);
  expect(plan.longScenes!.slice(0,27).map(s=>s.prompt)).toEqual(Object.values(savedScenes).map(s=>s.prompt));
  expect(calls).toHaveLength(7);
  expect(persisted.mock.calls[0][0].scenes).toEqual(savedScenes);
  const req=mocks.callLLM.mock.calls[0][0];
  expect(req.messages[0].content).toContain('Chapter scene range: 1-12 of 23');
  expect(req.messages[0].content).toContain(merchant.text);
  expect(anchors(req)[11]).toBe("around at faces they didn't recognize,");
  const chapter2Requests=mocks.callLLM.mock.calls.filter(([r])=>r.messages[0].content.includes('This is chapter 2'));
  const slots=chapter2Requests.filter(([r])=>r.messages.length===1).flatMap(([r])=>JSON.parse(r.messages[0].content.match(/Required scene slots: (\[[^\n]*\])/)![1]));
  expect(slots.map(s=>s.narration).join(' ')).toBe(merchant.text);
  expect(mocks.callLLM.mock.calls[1][0].messages[1].content).toContain(extra);
  expect(booked.mock.calls[0][1]).toMatchObject({sceneCount:12,chapterIndex:1,reusedSceneCount:27,validationOutcome:'schema_violation',recoveryStrategy:'correct'});
});

it('accepts a complete, normally stopped reply at the cap instead of treating token usage alone as truncation',async()=>{
  mocks.callLLM.mockImplementation(req=>({...goodReply(req),usage:{inputTokens:500,outputTokens:8192}}));
  const {plan,calls}=await planLongVideoProduction(params);
  expect(plan.longScenes).toHaveLength(120);expect(calls).toHaveLength(10);
});
