// Whether the channel settings screen offers "Set up content profile".
// Only once the profile query has succeeded and returned no profile: never while
// loading, never on error, and never for a channel that already has one.
export function shouldOfferProfileSetup(q: { isSuccess: boolean; data: unknown }): boolean {
  return q.isSuccess && !q.data;
}
