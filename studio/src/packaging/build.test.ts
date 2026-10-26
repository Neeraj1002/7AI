import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { LLMResponse } from '../llm';
import { buildPackaging, thumbnailsDir, type BuildDeps, type BuildHooks, type PackagingOutput } from './build';
import type { ColdReaderReply, Concept, CuriosityBrief } from './schemas';
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

function setup(over: { brief?: CuriosityBrief; concepts?: Concept[]; reader?: ColdReaderReply; imagesAllowed?: number } = {}) {
  const calls: string[] = [];
  const composed: string[] = [];
  const deps: BuildDeps = {
    generateBrief: vi.fn(async () => { calls.push('brief'); return { brief: over.brief ?? makeBrief(), calls: [llm()] }; }),
    generateConcepts: vi.fn(async () => { calls.push('concepts'); return { value: over.concepts ?? sixConcepts(), llm: llm('0.04') }; }),
    coldRead: vi.fn(async () => { calls.push('cold'); return { value: over.reader ?? reader(), llm: llm('0.003') }; }),
    generateStills: vi.fn(async (p) => {
      calls.push('image');
      await p.onStillGenerated?.({ index: 0, costUsd: 0.0065, model: 'img' });
      return { imagePaths: ['raw.png'], provider: 'openai' as const, model: 'img', costUsd: '0.006500' };
    }),
    composeThumbnail: vi.fn(async (p) => {
      composed.push(p.baseName);
      return {
        words: p.words, subline: p.subline, sublineDropped: false, typeface: p.typeface, fontFamily: 'Anton', zone: p.zone, requestedZone: p.zone, lines: 1,
        mainPxFull: 160, mainPxFeed: 45, mainPxSidebar: 21, readableAtSidebar: true,
        files: { full: `/x/${p.baseName}-full.jpg`, feed: `/x/${p.baseName}-feed.jpg`, sidebar: `/x/${p.baseName}-sidebar.jpg` },
      };
    }),
  };
  const checkpoints: Array<Partial<PackagingOutput>> = [];
  const booked: string[] = [];
  const hooks: BuildHooks = {
    onText: async (label) => { booked.push(`text:${label}`); },
    onImage: async (info) => { booked.push(`image:${info.packageId}`); },
    checkpoint: async (p) => { checkpoints.push(p); },
  };
  const run = () =>
    buildPackaging({
      runId: '00000000-0000-4000-8000-000000000001',
      scriptText: EIFFEL_SCRIPT,
      chapters: EIFFEL_CHAPTERS,
      look: { stylePrompt: 'documentary frame', titleGuidance: 'Plain, specific. Never over 60 characters.' },
      imagesAllowed: over.imagesAllowed ?? 3,
      hooks,
      deps,
    });
  return { run, deps, calls, composed, checkpoints, booked };
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
    expect(s.booked.filter((b) => b.startsWith('image:'))).toHaveLength(3);
    expect(s.booked).toEqual(expect.arrayContaining(['text:brief', 'text:concepts', 'text:cold-reader']));
    expect(out.dropped.filter((d) => d.stage === 'cold-reader')).toHaveLength(3);
    expect(out.imageCostUsd).toBeCloseTo(0.0195, 4);
    expect(out.textCostUsd).toBeCloseTo(0.053, 4);
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
