import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ callLLM: vi.fn() }));
vi.mock('../../llm', async (orig) => ({ ...(await orig<object>()), callLLM: mocks.callLLM }));

import { planLongVideoProduction } from './plan-long';

const chapters = [
  { title: 'Why it stands', text: 'Why does the bridge still stand? ' + Array(150).fill('stone').join(' ') },
  { title: 'The quarry', text: 'Where did the stone come from? ' + Array(150).fill('rock').join(' ') },
  { title: 'What next', text: 'What should you look at next? ' + Array(100).fill('look').join(' ') },
];

const llm = (text: string) => ({ text, usage: { inputTokens: 500, outputTokens: 400 }, stopReason: 'stop', costUsd: '0.001000', provider: 'anthropic', model: 'claude-haiku-4-5' });
const scenes = (n: number, chapter: string) => ({ scenes: Array.from({ length: n }, (_, i) => ({ words: `${chapter} words ${i}`, prompt: `${chapter} scene ${i}` })) });

describe('planLongVideoProduction (Sprint 4 Task 9, R5)', () => {
  beforeEach(() => mocks.callLLM.mockReset());

  it('plans chapter by chapter and ties every scene to its chapter and opening words', async () => {
    mocks.callLLM
      .mockResolvedValueOnce(llm(JSON.stringify({ ...scenes(10, 'a'), audioLayer: 'mysterious' })))
      .mockResolvedValueOnce(llm(JSON.stringify(scenes(10, 'b'))))
      .mockResolvedValueOnce(llm(JSON.stringify(scenes(4, 'c'))));
    const booked: string[] = [];
    const { plan, calls } = await planLongVideoProduction({
      chapters,
      topic: 'Bridges',
      targetSeconds: 120,
      onCall: async (l) => {
        booked.push(l.costUsd);
      },
    });
    expect(calls).toHaveLength(3);
    expect(booked).toHaveLength(3);
    expect(plan.visualSource).toBe('ai-stills');
    expect(plan.audioLayer).toBe('mysterious');
    expect(plan.longScenes).toHaveLength(24);
    expect(plan.stillScenePrompts).toEqual(plan.longScenes!.map((s) => s.prompt));
    expect(plan.longScenes!.filter((s) => s.chapterIndex === 0)).toHaveLength(10);
    // The first chapter's call also asks for the mood; the others do not.
    expect(mocks.callLLM.mock.calls[0][0].system).toContain('"audioLayer": string');
  });

  it('an explicit audio layer is used as is and not asked for', async () => {
    mocks.callLLM.mockResolvedValue(llm(JSON.stringify(scenes(12, 'x'))));
    const { plan } = await planLongVideoProduction({ chapters, topic: 'T', targetSeconds: 120, audioLayerOverride: 'none' });
    expect(plan.audioLayer).toBe('none');
    expect(mocks.callLLM.mock.calls[0][0].system).not.toContain('"audioLayer": string');
  });

  it('parses fenced planner JSON with prose, escaped quotes and backslashes, and raw multiline scene text', async () => {
    const prompt = 'Archivist says "the mandate fractured" beside C:\\maps\nA second line of narration context.';
    const firstChapter = scenes(10, 'a');
    firstChapter.scenes[0].prompt = prompt;
    const rawFirstReply = JSON.stringify({ ...firstChapter, audioLayer: 'mysterious' }).replace('\\nA second', '\nA second');
    mocks.callLLM
      .mockResolvedValueOnce(llm(`Here is the plan:\n\`\`\`json\n${rawFirstReply}\n\`\`\``))
      .mockResolvedValueOnce(llm(JSON.stringify(scenes(10, 'b'))))
      .mockResolvedValueOnce(llm(JSON.stringify(scenes(4, 'c'))));

    const { plan } = await planLongVideoProduction({ chapters, topic: 'Terminus', targetSeconds: 120 });

    expect(plan.longScenes![0].prompt).toBe(prompt);
    expect(mocks.callLLM.mock.calls[0][0].outputSchema).toBeDefined();
  });

  it('retries a chapter after an unescaped quotation mark in a scene prompt', async () => {
    const malformed = JSON.stringify({ ...scenes(10, 'bad'), audioLayer: 'calm' }).replace('bad scene 0', 'bad "scene" 0');
    mocks.callLLM
      .mockResolvedValueOnce(llm(malformed))
      .mockResolvedValueOnce(llm(JSON.stringify({ ...scenes(10, 'a'), audioLayer: 'calm' })))
      .mockResolvedValueOnce(llm(JSON.stringify(scenes(10, 'b'))))
      .mockResolvedValueOnce(llm(JSON.stringify(scenes(4, 'c'))));

    const { plan } = await planLongVideoProduction({ chapters, topic: 'Terminus', targetSeconds: 120 });

    expect(plan.longScenes).toHaveLength(24);
    expect(mocks.callLLM).toHaveBeenCalledTimes(4);
  });

  it('retries a chapter once when too few scenes come back, then fails with the chapter named', async () => {
    mocks.callLLM.mockResolvedValue(llm(JSON.stringify(scenes(1, 'z'))));
    await expect(planLongVideoProduction({ chapters, topic: 'T', targetSeconds: 120 })).rejects.toThrow(/chapter 1 .*unusable twice/);
    expect(mocks.callLLM).toHaveBeenCalledTimes(2);
  });
});
