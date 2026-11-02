import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const debt: Record<string, string[]> = {
  'agents/script-generation/long-form.ts': [
    'master historical documentary filmmaker', 'The Cold Open (Chapter 1)',
    'Micro-Pacing & Pacing Cues:', 'Chapter Transitions: NEVER', 'Narrative Loops:',
    'The Climax & Outro:', 'Strict Factual Grounding:', 'historical search terms',
  ],
  'agents/script-review/index.ts': ['A genuine cold open', 'judge the cold open',
    'SEPARATE 0-10 score judging ONLY the cold open', 'high-tension historical moment'],
  'agents/script-review/rules.ts': ['Lego rhetoric', 'salarium', 'Roman = Rome'],
  'agents/video-intelligence/index.ts': ['described historical topic', 'unrelated to the historical topic'],
  'agents/video-generation/plan.ts': ['a historical event', 'a boxing ring and gloves'],
  'agents/video-generation/plan-long.ts': ['inventing historical facts', 'stockFootageQuery: params.topic.slice(0, 80) || "documentary"'],
  'agents/video-generation/still-check.ts': ['still images for a documentary video'],
  'formats/manifest.ts': ['[Historical event/thing]', 'Cold open in the first'],
  'packaging/prompts.ts': ['historic (ancient or long-ago subjects)'],
};
const promptFiles = [
  ...Object.keys(debt),
  'agents/script-generation/index.ts',
  'agents/video-generation/still-check.ts',
  'agents/publishing/index.ts',
  'packaging/prompts-vision.ts',
  'agents/video-generation/scene-prompts.ts',
  'run-pipeline/parse-brief.ts',
];
const pattern = /histor|heist|crime|textbook|cold open|niyt|lego|mary celeste|roman|shelf|boxing ring|netflix|documentary video|stockFootageQuery:.*"documentary"/i;

function unapprovedLines(path: string, source: string): string[] {
  return source.split(/\r?\n/).filter((line) => !line.trimStart().startsWith('//') && pattern.test(line) &&
    !debt[path]?.some((snippet) => line.includes(snippet)));
}

it('tracks each existing channel or niche word in shared prompt sources as debt', () => {
  for (const path of promptFiles) {
    const source = readFileSync(resolve(__dirname, '..', path), 'utf8');
    expect(unapprovedLines(path, source), path).toEqual([]);
    for (const snippet of debt[path] ?? []) expect(source, path).toContain(snippet);
  }
});

it('rejects an unlisted new niche sentence', () => {
  expect(unapprovedLines('agents/script-generation/long-form.ts', 'Use a historical hook for every channel.')).toHaveLength(1);
});
