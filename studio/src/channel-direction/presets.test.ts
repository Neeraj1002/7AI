import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DIRECTION_PART_KEYS, DIRECTION_PRESETS, directionPreset } from './presets';

function approvedPresets() {
  const doc = readFileSync(resolve(__dirname, '../../../docs/decisions/PROMPT_LAYERS.md'), 'utf8').replace(/\r\n/g, '\n');
  const section = doc.split('## Presets\n')[1]?.split('\n## ')[0] ?? '';
  const blocks = section.split(/^### preset: /m).slice(1);
  return blocks.map((block) => {
    const split = block.indexOf('\n');
    const key = block.slice(0, split);
    const body = block.slice(split + 1);
    const fields = Object.fromEntries([...body.matchAll(/^- \*\*([^*]+):\*\* (.*)$/gm)].map(([, k, v]) => [k, v]));
    return {
      key, version: Number(fields.version), label: fields.label, summary: fields.summary,
      parts: Object.fromEntries(DIRECTION_PART_KEYS.map((part) => [part, fields[part] === '(empty)' ? '' : fields[part]])),
    };
  });
}

describe('approved creative direction data', () => {
  it('matches the decision document character for character', () => {
    expect(DIRECTION_PRESETS).toEqual(approvedPresets());
  });
  it('has complete, concise, channel-generic parts', () => {
    expect(DIRECTION_PRESETS.map((preset) => preset.key)).toEqual(['history', 'story-first', 'explainer', 'neutral']);
    for (const preset of DIRECTION_PRESETS) {
      expect(directionPreset(preset.key)).toBe(preset);
      for (const key of DIRECTION_PART_KEYS) {
        const part = preset.parts[key];
        expect(part).toBeDefined();
        expect(lintPart(part)).toEqual([]);
      }
      for (const required of ['persona', 'hookRule', 'endingRule', 'pacingCues', 'avoid', 'visualReviewTone'] as const) {
        expect(preset.parts[required]).not.toBe('');
      }
    }
  });
  it('fails the preset lint on deliberately bad text', () => {
    expect(lintPart('Say this in 12 words for Netflix.')).toContain('digit');
    expect(lintPart('Say this in 12 words for Netflix.')).toContain('channel, brand or topic name');
    expect(lintPart(Array(121).fill('word').join(' '))).toContain('over 120 words');
  });
});

function lintPart(part: string): string[] {
  const errors: string[] = [];
  if (part.split(/\s+/).filter(Boolean).length > 120) errors.push('over 120 words');
  if (/\d/.test(part)) errors.push('digit');
  if (/Not In Your Textbook|Cold Open|Start to Shelf|Lego|Netflix|Roman/i.test(part)) errors.push('channel, brand or topic name');
  if (/\b(?:bannedOpeners|bannedEndings)\b|\bNever say ["']/i.test(part)) errors.push('banned-phrase list');
  return errors;
}
