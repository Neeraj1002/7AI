import { FALLBACK_PRESET, type ResolvedDirection } from '../channel-profile/resolve';
import { directionPreset, type DirectionParts } from './presets';

export function effectiveDirection(direction?: ResolvedDirection): ResolvedDirection {
  const preset = directionPreset(FALLBACK_PRESET);
  return direction ?? { presetKey: preset.key, presetVersion: preset.version, parts: preset.parts, note: null };
}

export const WRITER_PARTS: (keyof DirectionParts)[] = [
  'persona', 'domain', 'hookRule', 'storyShape', 'endingRule', 'chapterStyle', 'pacingCues', 'avoid',
];
export const REVIEW_PARTS: (keyof DirectionParts)[] = [
  'hookRule', 'storyShape', 'endingRule', 'chapterStyle', 'pacingCues', 'avoid',
];

// Layer 3 has one wording owner. Consumers select parts without paraphrasing them;
// the layer 5 note follows the parts and never replaces them.
export function directionBlock(direction: ResolvedDirection | undefined, parts: (keyof DirectionParts)[]): string {
  const resolved = effectiveDirection(direction);
  const lines = parts.filter(key => resolved.parts[key]).map(key => `${key}: ${resolved.parts[key]}`);
  if (resolved.note) lines.push(`Channel direction note: ${resolved.note}`);
  return `\n\nCreative direction (defaults; explicit brief constraints and content-profile rules take precedence within the platform contract):\n${lines.join('\n')}`;
}
