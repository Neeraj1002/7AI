import { ChannelProfileDataSchema, type ChannelProfileData } from '../channel-profile/schema';
import { DIRECTION_PRESET_KEYS, type DirectionPresetKey } from './presets';
import { isDeepStrictEqual } from 'node:util';

export type Assignment = { channelName: string; preset: DirectionPresetKey };

export function parseAssignments(args: string[]): Assignment[] {
  if (args.length !== 3) throw new Error('Give exactly three --channel "name=preset" assignments.');
  const assignments = args.map((arg) => {
    const split = arg.lastIndexOf('=');
    const channelName = arg.slice(0, split).trim();
    const preset = arg.slice(split + 1);
    if (split < 1 || !channelName || !DIRECTION_PRESET_KEYS.includes(preset as DirectionPresetKey) || preset === 'neutral') {
      throw new Error(`Invalid channel assignment: ${arg}`);
    }
    return { channelName, preset: preset as DirectionPresetKey };
  });
  if (new Set(assignments.map((item) => item.channelName)).size !== assignments.length ||
      new Set(assignments.map((item) => item.preset)).size !== assignments.length) {
    throw new Error('Channel names and preset keys must each be unique.');
  }
  return assignments;
}

export function withDirection(data: ChannelProfileData, preset: DirectionPresetKey): ChannelProfileData {
  return ChannelProfileDataSchema.parse({
    ...data,
    direction: { ...data.direction, preset },
  });
}

export function onlyDirectionChanged(before: ChannelProfileData, after: ChannelProfileData): boolean {
  return isDeepStrictEqual({ ...before, direction: undefined }, { ...after, direction: undefined });
}
