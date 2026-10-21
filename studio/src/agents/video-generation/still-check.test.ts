import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkStills, strongerPrompt, STILL_CHECK_BATCH, type StillCheckDeps } from './still-check';
import { buildSystemPrompt as plannerPrompt } from './plan-long';
import type { LLMResponse } from '../../llm';

let dir: string;
beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'still-check-')); });
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

const llm = (text: string): LLMResponse => ({ text, usage: { inputTokens: 1500, outputTokens: 200 }, stopReason: 'stop', costUsd: '0.002', provider: 'anthropic', model: 'claude-haiku-4-5', maxOutputTokens: 4000 });
async function stills(n: number) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = path.join(dir, `s${i}.png`);
    await fs.writeFile(p, `image ${i}`);
    out.push({ sceneIndex: i, imagePath: p, narration: `line ${i}` });
  }
  return out;
}
const deps = (reply: (content: string) => string): StillCheckDeps & { ask: ReturnType<typeof vi.fn> } => ({
  thumbnail: async () => 'thumb',
  ask: vi.fn(async (_s: string, content: string) => llm(reply(content))),
});

describe('picture check (R6)', () => {
  it('flags a logo, invented text and a contradiction against the narration line', async () => {
    const d = deps(() => JSON.stringify({ results: [
      { image: 1, issues: [{ kind: 'logo', detail: 'LEGO sign on the factory' }] },
      { image: 2, issues: [] },
      { image: 3, issues: [{ kind: 'contradiction', detail: 'abandoned coaster for "parks sold"' }, { kind: 'invented_figure', detail: '-27% on a report' }] },
    ] }));
    const r = await checkStills({ topic: 'Lego', stills: await stills(3), cacheDir: dir, deps: d });
    expect(r.map((x) => x.issues.length)).toEqual([1, 0, 2]);
    expect(r.every((x) => x.checked)).toBe(true);
    expect(d.ask.mock.calls[0][1]).toContain('Image 3 narration: line 2');
  });

  it('checks six at a time: 24 stills are four calls, under the $0.02 budget at the cheap tier', async () => {
    const d = deps((content) => JSON.stringify({ results: Array.from({ length: content.split('\n').filter((l) => l.startsWith('Image')).length }, (_, i) => ({ image: i + 1, issues: [] })) }));
    const onCall = vi.fn();
    await checkStills({ topic: 'Lego', stills: await stills(24), cacheDir: dir, deps: d, onCall });
    expect(STILL_CHECK_BATCH).toBe(6);
    expect(d.ask).toHaveBeenCalledTimes(4);
    expect(onCall).toHaveBeenCalledTimes(4);
    const spent = onCall.mock.calls.reduce((sum, [call]) => sum + Number(call.costUsd), 0);
    expect(spent).toBeLessThanOrEqual(0.02);
  });

  it('a second attempt checks nothing again: results are cached with the stills', async () => {
    const reply = () => JSON.stringify({ results: [{ image: 1, issues: [{ kind: 'text', detail: 'sign' }] }, { image: 2, issues: [] }] });
    const first = deps(reply);
    const list = await stills(2);
    await checkStills({ topic: 't', stills: list, cacheDir: dir, deps: first });
    const second = deps(reply);
    const again = await checkStills({ topic: 't', stills: list, cacheDir: dir, deps: second });
    expect(second.ask).not.toHaveBeenCalled();
    expect(again.map((x) => x.issues.length)).toEqual([1, 0]);
  });

  it('a reply that cannot be read leaves the stills unchecked and does not fail the video', async () => {
    const r = await checkStills({ topic: 't', stills: await stills(2), cacheDir: dir, deps: deps(() => 'not json') });
    expect(r).toEqual([{ sceneIndex: 0, checked: false, issues: [] }, { sceneIndex: 1, checked: false, issues: [] }]);
  });

  it('stops before a call when the guard says so (a spend limit)', async () => {
    const d = deps(() => '{}');
    await expect(checkStills({ topic: 't', stills: await stills(2), cacheDir: dir, deps: d, beforeCall: async () => { throw new Error('limit'); } })).rejects.toThrow('limit');
    expect(d.ask).not.toHaveBeenCalled();
  });

  it('the regeneration prompt is stronger and names what failed', () => {
    const p = strongerPrompt('a factory', [{ kind: 'logo', detail: 'LEGO sign' }]);
    expect(p).toContain('a factory');
    expect(p).toContain('logo: LEGO sign');
    expect(p).toMatch(/No letters, no numbers, no logos/);
  });
});

describe('scene prompt writer (R6.1, R6.5)', () => {
  it('forbids brand marks even for a brand topic, invented figures, and unstated decay imagery', () => {
    const prompt = plannerPrompt({ visualStyle: null, scriptGuide: null, audioLayerOverride: undefined });
    expect(prompt).toMatch(/never ask for its logo, name, signs or lettering/);
    expect(prompt).toMatch(/readable numbers, charts with figures, slogans or posters/);
    expect(prompt).toMatch(/no ruins, decay, abandonment, disaster or mourning imagery/);
  });
});
