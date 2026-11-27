import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveChannelConfig } from '../channel-profile/resolve';
import { DIRECTION_PRESETS } from './presets';
import { directionBlock, REVIEW_PARTS, WRITER_PARTS } from './prompts';
import { buildSystemPrompt as shortWriter, buildUserMessage as writerUser } from '../agents/script-generation';
import { buildLongSystemPrompt as longWriter } from '../agents/script-generation/long-form';
import { buildReviewSystemPrompt as reviewer } from '../agents/script-review';
import { buildSystemPrompt as shortPlanner } from '../agents/video-generation/plan';
import { buildSystemPrompt as longPlanner, longPlanningInputHash } from '../agents/video-generation/plan-long';
import { buildSystemPrompt as frameReview } from '../agents/video-intelligence';
import { buildStillCheckSystemPrompt as stillCheck } from '../agents/video-generation/still-check';
import { findFormat } from '../formats/manifest';
import { buildPipelineTags } from '../story-tests/learning';

describe('one resolved direction through every consumer', () => {
  for (const preset of DIRECTION_PRESETS) {
    it(`${preset.key}: writers and reviewers use the same approved parts, followed by the note`, () => {
      const { direction } = resolveChannelConfig({ profile: { direction: { preset: preset.key, note: 'Use a measured voice.' } } });
      const writers = [shortWriter('brief-only', false, direction), longWriter(false, undefined, direction)];
      const reviews = [reviewer({ direction }), reviewer({ direction, videoKind: 'long' })];
      for (const prompt of writers) expect(prompt).toContain(directionBlock(direction, WRITER_PARTS));
      for (const prompt of reviews) expect(prompt).toContain(directionBlock(direction, REVIEW_PARTS));
      for (const part of ['hookRule', 'endingRule', 'pacingCues'] as const) {
        for (const prompt of [...writers, ...reviews]) expect(prompt).toContain(`${part}: ${preset.parts[part]}`);
      }
      expect(directionBlock(direction, WRITER_PARTS).endsWith('Channel direction note: Use a measured voice.')).toBe(true);
      for (const prompt of [shortPlanner(undefined, undefined, 6, direction), longPlanner({ direction })]) {
        expect(prompt).toContain(directionBlock(direction, ['domain']));
        expect(prompt).not.toContain(`persona: ${preset.parts.persona}`);
      }
      for (const prompt of [frameReview('ai-stills', true, undefined, direction, 'Watercolour'), stillCheck(direction, 'Watercolour')]) {
        expect(prompt).toContain(preset.parts.visualReviewTone);
        expect(prompt).toContain('Visual style: Watercolour');
        if (preset.key !== 'history') expect(prompt).not.toMatch(/histor/i);
      }
      const format = findFormat('chaptered-explainer')!;
      expect(format.scriptStructure).toBe('Ordered chapters with a title and spoken narration for each chapter, within the target length.');
      expect(writers[1]).not.toMatch(/NEVER start a chapter|Thanks for watching|future topic/);
      expect(writers[1]).toContain(preset.parts.chapterStyle);
      expect(buildPipelineTags({ storyTestsOn: true, buildCommit: 'abc', direction })).toMatchObject({ presetKey: preset.key, presetVersion: preset.version });
    });
  }

  it.each(['puzzle-reveal', 'explainer'] as const)('%s keeps selected formats and optional note independent', (preset) => {
    for (const note of [undefined, 'Inspect the evidence.']) {
      for (const formatKey of ['question-surprising-answer', 'chaptered-explainer']) {
        const config = resolveChannelConfig({ profile: { direction: { preset, note }, script: { guide: 'A distinct guide.' } }, formatKey });
        expect(config.direction.note).toBe(note ?? null);
        expect(config.scriptGuide).toBe('A distinct guide.');
        expect(config.formatScriptStructure).toBe(findFormat(formatKey)?.scriptStructure);
        for (const prompt of [shortWriter('brief-only', false, config.direction), longWriter(false, undefined, config.direction), reviewer({ direction: config.direction }), reviewer({ direction: config.direction, videoKind: 'long' })]) {
          expect(prompt).toContain(config.direction.parts.storyShape);
          if (note) expect(prompt).toContain(note);
          else expect(prompt).not.toContain('Channel direction note:');
        }
      }
    }
  });

  it.each([
    ['process walkthrough', 'Follow the return, scan and shelving steps.', 'Explain the sequence clearly.'],
    ['causal service', 'Explain why a full cart remains unavailable until scanning.', 'Emphasize the state change.'],
    ['hybrid', 'Trace the return steps and explain how scanning changes availability.', 'Connect steps to their effects.'],
  ])('delivers an Explainer %s brief and channel emphasis to the writer', (_name, brief, note) => {
    const config = resolveChannelConfig({ profile: { direction: { preset: 'explainer', note }, script: { guide: 'Speak to a curious beginner.' } } });
    const system = shortWriter('brief-only', false, config.direction);
    const user = writerUser({ direction: config.direction, topic: 'A fictional library', constraints: [], briefText: brief, styleGuide: config.scriptGuide ?? undefined });
    expect(system).toContain(config.direction.parts.storyShape);
    expect(system).toContain(note);
    expect(user).toContain(brief);
    expect(user).toContain('Speak to a curious beginner.');
  });

  it('an absent profile and an explicit neutral preset build identical prompts', () => {
    const { direction } = resolveChannelConfig({ profile: null });
    expect(shortWriter()).toBe(shortWriter(undefined, false, direction));
    expect(longWriter()).toBe(longWriter(false, undefined, direction));
    expect(reviewer({})).toBe(reviewer({ direction }));
  });

  it('a different direction or note invalidates the long planner checkpoint', () => {
    const input = { chapters: [{ title: 'One', text: 'A simple test.' }], topic: 'A topic', targetSeconds: 120 };
    const direction = resolveChannelConfig({ profile: { direction: { preset: 'explainer' } } }).direction;
    expect(longPlanningInputHash(input)).not.toBe(longPlanningInputHash({ ...input, direction }));
    expect(longPlanningInputHash({ ...input, direction })).not.toBe(longPlanningInputHash({ ...input, direction: { ...direction, note: 'Measured.' } }));
  });
});

// Scan consumers, not profile persistence, validation or the single run bundle loader.
// styleGuide/defaultVoice on consumer parameter objects are resolved fields and remain valid.
function rawProfileReads(source: string): string[] {
  const patterns = [
    /\bchannel\s*(?:\?\.)?\.?\s*(?:styleGuide|defaultVoice)\b/,
    /\b(?:profile|profileData|profileVersion|version|activeProfileVersion)\s*(?:\?\.)?\.?\s*(?:data|script|visual|audio|packaging|direction)\b/,
    /\.activeProfileVersion\s*(?:\?\.)?\.?\s*data\b/,
    /\b(?:findProfileVersionById|findActiveProfileForChannel|findActiveProfileDataByChannelIds)\s*\(/,
  ];
  return source.split(/\r?\n/).filter(line => !line.trimStart().startsWith('//') && patterns.some(p => p.test(line)));
}

function consumerFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? consumerFiles(path) : entry.name.endsWith('.ts') && !entry.name.includes('.test.') ? [path] : [];
  });
}

it('consumers use the resolved bundle rather than raw channel/profile fields', () => {
  for (const folder of ['agents', 'packaging', 'story-tests']) {
    for (const file of consumerFiles(resolve(__dirname, '..', folder))) {
      expect(rawProfileReads(readFileSync(file, 'utf8')), file).toEqual([]);
    }
  }
});

it('the bundle scan rejects direct, optional and raw JSON reads', () => {
  for (const bad of ['channel.styleGuide', 'channel?.defaultVoice', 'profile.script.guide', 'version?.data.visual', 'channel.activeProfileVersion.data', 'findProfileVersionById(run.profileVersionId)']) {
    expect(rawProfileReads(bad), bad).toHaveLength(1);
  }
  expect(rawProfileReads('config.scriptGuide; params.styleGuide; config.direction.parts;')).toEqual([]);
});
