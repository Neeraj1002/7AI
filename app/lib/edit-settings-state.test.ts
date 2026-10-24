// Sprint 5 Task 7 follow-up R1. Run with the server's vitest: cd studio && npx vitest run --root ../app
import { describe, it, expect } from 'vitest';
import { editReducer, initialEditState, type CurrentSettings, type EditAction } from './edit-settings-state';

const current: CurrentSettings = { voice: 'ballad', audioLayer: 'calm', visualSource: 'ai-stills', privacyStatus: 'private', maxCostUsd: 0.5 };
const run = (...actions: EditAction[]) => actions.reduce(editReducer, initialEditState(current));

describe('Edit settings pages', () => {
  it('starts on the settings page with what the run has', () => {
    const s = initialEditState(current);
    expect(s.page).toBe('settings');
    expect(s.draft).toEqual(current);
    expect(s.spendText).toBe('0.5');
  });

  it('keeps unsaved choices when the user goes to the voice page and back', () => {
    const s = run(
      { type: 'setAudio', value: 'tense' },
      { type: 'setPrivacy', value: 'unlisted' },
      { type: 'setSpend', text: '1.25' },
      { type: 'openVoice' },
      { type: 'back' },
    );
    expect(s.page).toBe('settings');
    expect(s.draft).toMatchObject({ audioLayer: 'tense', privacyStatus: 'unlisted', voice: 'ballad' });
    expect(s.spendText).toBe('1.25');
  });

  it('"Use {voice}" keeps the voice and returns, with the other choices intact', () => {
    const s = run({ type: 'setVisual', value: 'stock-footage' }, { type: 'openVoice' }, { type: 'useVoice', voice: 'coral' });
    expect(s.page).toBe('settings');
    expect(s.draft).toMatchObject({ voice: 'coral', visualSource: 'stock-footage' });
  });

  it('going back from the voice page changes nothing; the channel default is a choice too', () => {
    expect(run({ type: 'openVoice' }, { type: 'back' }).draft).toEqual(current);
    expect(run({ type: 'openVoice' }, { type: 'useVoice', voice: null }).draft.voice).toBeNull();
  });

  it('a run with no limit starts with an empty spend field', () => {
    expect(initialEditState({ ...current, maxCostUsd: null }).spendText).toBe('');
  });
});
