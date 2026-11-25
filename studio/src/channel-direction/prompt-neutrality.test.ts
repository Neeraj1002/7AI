import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const promptFiles = [
  'prompts/system-prompts.ts', 'agents/script-generation/index.ts', 'agents/script-generation/long-form.ts',
  'agents/script-review/index.ts', 'agents/script-review/rules.ts',
  'agents/video-intelligence/index.ts', 'agents/video-generation/plan.ts',
  'agents/video-generation/plan-long.ts', 'agents/video-generation/still-check.ts',
  'story-tests/prompts.ts', 'formats/manifest.ts', 'agents/publishing/index.ts', 'packaging/prompts.ts',
  'packaging/prompts-vision.ts', 'agents/video-generation/scene-prompts.ts', 'run-pipeline/parse-brief.ts',
];
const pattern = /histor|heist|crime|textbook|cold open|niyt|lego|mary celeste|\broman\b|salarium|denarii|shelf|boxing ring|netflix|documentary video|stockFootageQuery:.*"documentary"/i;

function unapprovedLines(source: string): string[] {
  return source.split(/\r?\n/).filter((line) => !line.trimStart().startsWith('//') && pattern.test(line));
}

it('rejects channel or niche wording outside preset data', () => {
  for (const path of promptFiles) {
    const source = readFileSync(resolve(__dirname, '..', path), 'utf8');
    expect(unapprovedLines(source), path).toEqual([]);
  }
});

it('rejects an unlisted new niche sentence', () => {
  expect(unapprovedLines('Use a historical hook for every channel.')).toHaveLength(1);
});
