import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const debt: Record<string, string[]> = {
  'agents/script-review/rules.ts': ['Lego rhetoric', 'salarium', 'Roman = Rome'],
};
const promptFiles = [
  'agents/script-generation/index.ts', 'agents/script-generation/long-form.ts',
  'agents/script-review/index.ts', 'agents/script-review/rules.ts',
  'agents/video-intelligence/index.ts', 'agents/video-generation/plan.ts',
  'agents/video-generation/plan-long.ts', 'agents/video-generation/still-check.ts',
  'story-tests/prompts.ts', 'formats/manifest.ts', 'agents/publishing/index.ts', 'packaging/prompts.ts',
  'packaging/prompts-vision.ts', 'agents/video-generation/scene-prompts.ts', 'run-pipeline/parse-brief.ts',
];
const pattern = /histor|heist|crime|textbook|cold open|niyt|lego|mary celeste|roman|shelf|boxing ring|netflix|documentary video|stockFootageQuery:.*"documentary"/i;

function unapprovedLines(path: string, source: string): string[] {
  return source.split(/\r?\n/).filter((line) => !line.trimStart().startsWith('//') && pattern.test(line) &&
    !debt[path]?.some((snippet) => line.includes(snippet)));
}

it('rejects channel or niche wording outside preset data and deferred review-rule examples', () => {
  for (const path of promptFiles) {
    const source = readFileSync(resolve(__dirname, '..', path), 'utf8');
    expect(unapprovedLines(path, source), path).toEqual([]);
    for (const snippet of debt[path] ?? []) expect(source, path).toContain(snippet);
  }
});

it('rejects an unlisted new niche sentence', () => {
  expect(unapprovedLines('agents/script-generation/long-form.ts', 'Use a historical hook for every channel.')).toHaveLength(1);
});
