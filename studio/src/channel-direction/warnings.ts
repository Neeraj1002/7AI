import type { ChannelProfileData } from '../channel-profile/schema';
import { directionPreset, DIRECTION_PART_KEYS } from './presets';

// Advisory only: a guide may still contain a valid channel-specific exception.
export function profileDirectionWarnings(profile: ChannelProfileData): string[] {
  const guide = profile.script?.guide?.trim();
  if (!guide) return [];
  const warnings: string[] = [];
  if (/\b\d+\s*(?:words?|sentences?|seconds?)\b|\b(?:words?|sentences?|seconds?)\s*(?:under|over|up to|at least)?\s*\d+\b/i.test(guide)) {
    warnings.push('The script guide contains a numeric word, sentence or time limit. Put a machine-checkable limit in its own field when available.');
  }
  if (profile.direction) {
    const parts = directionPreset(profile.direction.preset).parts;
    const repeats = DIRECTION_PART_KEYS.some((key) =>
      parts[key].split(/(?<=[.!?])\s+/).some((sentence) => sentence.length >= 20 && guide.includes(sentence)),
    );
    if (repeats) warnings.push('The script guide repeats a creative-direction preset sentence. Keep that rule in the preset.');
  }
  return warnings;
}
