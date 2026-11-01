import { expect, it } from 'vitest';
import { profileDirectionWarnings } from './warnings';
import { directionPreset } from './presets';

it('warns about prose limits and repeated preset sentences but does not reject the profile', () => {
  expect(profileDirectionWarnings({ script: { guide: 'Use at most 12 words in each sentence.' } })).toHaveLength(1);
  expect(profileDirectionWarnings({
    direction: { preset: 'neutral' },
    script: { guide: directionPreset('neutral').parts.persona },
  })).toHaveLength(1);
  expect(profileDirectionWarnings({ direction: { preset: 'neutral' }, script: { guide: 'Keep the tone kind.' } })).toEqual([]);
});
