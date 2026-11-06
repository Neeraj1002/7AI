// App tests have no runner of their own; run with the server's vitest:
//   cd studio && npx vitest run --root ../app
import { describe, it, expect } from 'vitest';
import {
  choiceTags,
  clampNote,
  counterAmber,
  counterText,
  directionDirty,
  directionPayload,
  effectiveDirection,
  NOTE_MAX,
  saveLabel,
  savedDirectionOf,
  withDirection,
} from './direction';
import { profileEntryState } from './profile-setup';
import { flags } from './feature-flags';

const neutral = { preset: 'neutral', note: '' };

describe('current choice and tags', () => {
  it('shows Neutral as the default when nothing is saved', () => {
    expect(effectiveDirection(null)).toEqual(neutral);
    expect(choiceTags('neutral', neutral, null)).toEqual(['Default, nothing saved']);
    expect(choiceTags('a', neutral, null)).toEqual([]);
  });
  it('shows a saved choice as Current and a different pick as Not saved yet', () => {
    const saved = { preset: 'a', note: '' };
    expect(choiceTags('a', saved, saved)).toEqual(['Current']);
    expect(choiceTags('a', { preset: 'b', note: '' }, saved)).toEqual(['Current']);
    expect(choiceTags('b', { preset: 'b', note: '' }, saved)).toEqual(['Not saved yet']);
  });
  it('reads the saved direction from the profile data', () => {
    expect(savedDirectionOf({ direction: { preset: 'a', note: 'n' } })).toEqual({ preset: 'a', note: 'n' });
    expect(savedDirectionOf({ direction: { preset: 'a' } })).toEqual({ preset: 'a', note: '' });
    expect(savedDirectionOf({})).toBeNull();
    expect(savedDirectionOf(null)).toBeNull();
  });
});

describe('Save enabled and disabled', () => {
  const saved = { preset: 'a', note: 'keep' };
  it('is disabled for the saved preset with the same note, trimmed', () => {
    expect(directionDirty({ preset: 'a', note: '  keep ' }, saved)).toBe(false);
    expect(directionDirty(neutral, null)).toBe(false);
  });
  it('is enabled by a different preset, and by a note-only edit, including on Neutral', () => {
    expect(directionDirty({ preset: 'b', note: 'keep' }, saved)).toBe(true);
    expect(directionDirty({ preset: 'a', note: 'changed' }, saved)).toBe(true);
    expect(directionDirty({ preset: 'neutral', note: 'a note' }, null)).toBe(true);
  });
  it('words the button', () => {
    const base = { saving: false, failed: false, nextVersion: 5, flagOn: true };
    expect(saveLabel({ ...base, dirty: false })).toBe('No changes to save');
    expect(saveLabel({ ...base, dirty: true })).toBe('Save as v5');
    expect(saveLabel({ ...base, dirty: true, saving: true })).toBe('Saving…');
    expect(saveLabel({ ...base, dirty: true, failed: true })).toBe('Try again');
    expect(saveLabel({ ...base, dirty: false, flagOn: false })).toBe('Save as v5');
  });
});

describe('note counter', () => {
  it('turns amber from 270 and says the limit at 300', () => {
    expect(counterAmber(269)).toBe(false);
    expect(counterAmber(270)).toBe(true);
    expect(counterText(269)).toBe('269 / 300');
    expect(counterText(270)).toBe('270 / 300');
    expect(counterText(299)).toBe('299 / 300');
    expect(counterText(300)).toBe('300 / 300 · limit reached');
  });
  it('blocks input past 300', () => {
    expect(clampNote('x'.repeat(305)).length).toBe(NOTE_MAX);
    expect(clampNote('short')).toBe('short');
  });
});

describe('the payload', () => {
  it('sends the trimmed note, and no note key when it is empty', () => {
    expect(directionPayload({ preset: 'a', note: '  hi ' })).toEqual({ preset: 'a', note: 'hi' });
    expect(directionPayload({ preset: 'a', note: '   ' })).toEqual({ preset: 'a' });
  });
  it('differs from the loaded data only in the direction, and keeps keys the app has no field for', () => {
    const loaded = { offeredFormatKeys: ['x'], script: { guide: 'g' }, storyTests: { readerPersona: 'p' }, direction: { preset: 'a' } };
    const built = { offeredFormatKeys: ['x'], script: { guide: 'g' } };
    expect(withDirection(built, loaded, { preset: 'b', note: 'n' })).toEqual({ ...built, storyTests: loaded.storyTests, direction: { preset: 'b', note: 'n' } });
    // direction unchanged: the loaded one goes back as read
    expect(withDirection(built, loaded, null)).toEqual({ ...built, storyTests: loaded.storyTests, direction: { preset: 'a' } });
    // nothing saved and unchanged: no direction key appears
    expect(withDirection(built, { offeredFormatKeys: ['x'], script: { guide: 'g' } }, null)).toEqual(built);
  });
});

describe('saving keeps the rest of the profile', () => {
  it('carries every key the app has no field for, deep and untouched, when only the form changed', () => {
    const extra = { a: { b: [1, 2, { c: 3 }] }, flag: false, n: null };
    const loaded = { offeredFormatKeys: ['x'], visual: { look: 'old' }, ...extra, direction: { preset: 'a', note: 'keep' } };
    const built = { offeredFormatKeys: ['x', 'y'], visual: { look: 'new' } };
    const out = withDirection(built, loaded, null);
    expect(out).toEqual({ ...built, ...extra, direction: { preset: 'a', note: 'keep' } });
    expect(out.a).toBe(loaded.a);
  });
  it('sends the changed direction (note only on Neutral too) and still keeps the other keys', () => {
    const loaded = { offeredFormatKeys: ['x'], extra: 1 };
    expect(withDirection({ offeredFormatKeys: ['x'] }, loaded, { preset: 'neutral', note: ' hi ' })).toEqual({
      offeredFormatKeys: ['x'],
      extra: 1,
      direction: { preset: 'neutral', note: 'hi' },
    });
  });
});

describe('settings entry states', () => {
  it('loading draws nothing, error and null and profile each have their own state', () => {
    expect(profileEntryState({ isLoading: true, isError: false, isSuccess: false, data: undefined })).toBe('loading');
    expect(profileEntryState({ isLoading: false, isError: true, isSuccess: false, data: undefined })).toBe('error');
    expect(profileEntryState({ isLoading: false, isError: false, isSuccess: true, data: null })).toBe('none');
    expect(profileEntryState({ isLoading: false, isError: false, isSuccess: true, data: { version: 1 } })).toBe('has_profile');
  });
});

describe('the flag', () => {
  it('is on', () => {
    expect(flags.creativeDirection).toBe(true);
  });
});
