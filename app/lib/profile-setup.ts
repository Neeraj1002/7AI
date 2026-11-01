// Whether the channel settings screen offers "Set up content profile".
// Only once the profile query has succeeded and returned no profile: never while
// loading, never on error, and never for a channel that already has one.
export type ProfileEntryState = 'loading' | 'error' | 'has_profile' | 'none';

// Sprint 6 Task 4 (R22): the four states of the entry at the top of channel settings. Loading draws nothing, so a channel that has a
// profile never flashes "Set up"; "none" is only a successful fetch that returned null.
export function profileEntryState(q: { isLoading: boolean; isError: boolean; isSuccess: boolean; data: unknown }): ProfileEntryState {
  if (q.isError) return 'error';
  if (q.isSuccess) return q.data ? 'has_profile' : 'none';
  return 'loading';
}

export const SETUP_ENTRY_SUBTITLE = 'Not set up yet. Voice and style guide are set here.';
export const ENTRY_LOAD_ERROR = "Couldn't load the content profile.";

export function shouldOfferProfileSetup(q: { isSuccess: boolean; data: unknown }): boolean {
  return q.isSuccess && !q.data;
}
