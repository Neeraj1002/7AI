// Sprint 5 Task 7 follow-up R1 — the Edit settings sheet has two pages inside one sheet: the settings list and the voice
// list. Going to the voice page and back must keep everything the user has typed or chosen but not saved, so the draft
// lives in one reducer that both pages read; the page is only which part of it is shown.
export type PrivacyChoice = 'private' | 'unlisted' | 'public';

export type CurrentSettings = {
  voice: string | null;
  audioLayer: string | null;
  visualSource: string | null;
  privacyStatus: PrivacyChoice;
  maxCostUsd: number | null;
};

export type EditPage = 'settings' | 'voice';
export type EditState = { page: EditPage; draft: CurrentSettings; spendText: string };

export type EditAction =
  | { type: 'openVoice' }
  | { type: 'back' }
  /** "Use {voice}": keep the choice and return to the settings page. */
  | { type: 'useVoice'; voice: string | null }
  | { type: 'setAudio'; value: string }
  | { type: 'setVisual'; value: string }
  | { type: 'setPrivacy'; value: PrivacyChoice }
  | { type: 'setSpend'; text: string };

export const spendTextOf = (maxCostUsd: number | null) => (maxCostUsd !== null ? String(maxCostUsd) : '');

export function initialEditState(current: CurrentSettings): EditState {
  return { page: 'settings', draft: current, spendText: spendTextOf(current.maxCostUsd) };
}

export function editReducer(state: EditState, action: EditAction): EditState {
  switch (action.type) {
    case 'openVoice':
      return { ...state, page: 'voice' };
    case 'back':
      return { ...state, page: 'settings' };
    case 'useVoice':
      return { ...state, page: 'settings', draft: { ...state.draft, voice: action.voice } };
    case 'setAudio':
      return { ...state, draft: { ...state.draft, audioLayer: action.value } };
    case 'setVisual':
      return { ...state, draft: { ...state.draft, visualSource: action.value } };
    case 'setPrivacy':
      return { ...state, draft: { ...state.draft, privacyStatus: action.value } };
    case 'setSpend':
      return { ...state, spendText: action.text };
  }
}
