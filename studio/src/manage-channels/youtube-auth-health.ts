import { findChannelById, updateChannelBrandAssets } from '../models/repositories/channel.repository';

// Bugs Task 12 (R13) - "YouTube connected" used to mean only "a credential row exists". In Google's
// Testing mode a refresh token dies after 7 days (invalid_grant), and nothing showed it. The last
// invalid_grant per channel is recorded in the existing Channel.brandAssets JSON (no migration) as
// brandAssets.youtubeAuthError; channels.get/list expose it as youtubeNeedsReconnect and a successful
// reconnect (the OAuth exchange) clears it.

export function isInvalidGrant(error: unknown, depth = 0): boolean {
  if (error === null || error === undefined || depth > 4) return false;
  if (typeof error === 'string') return error.includes('invalid_grant');
  const e = error as {
    message?: unknown;
    cause?: unknown;
    originalError?: unknown;
    lastError?: unknown;
    response?: { data?: { error?: unknown } };
  };
  if (e.response?.data?.error === 'invalid_grant') return true;
  if (typeof e.message === 'string' && e.message.includes('invalid_grant')) return true;
  return [e.cause, e.originalError, e.lastError].some((inner) => isInvalidGrant(inner, depth + 1));
}

export const YOUTUBE_RECONNECT_MESSAGE =
  'The YouTube connection for this channel has expired. Reconnect the channel in Channel settings, then tap Retry.';

// Records the failure once (returns true when it was newly recorded). Never throws.
export async function noteYoutubeAuthFailure(channelId: string, error: unknown): Promise<boolean> {
  try {
    if (!isInvalidGrant(error)) return false;
    const channel = await findChannelById(channelId);
    if (!channel || channel.brandAssets.youtubeAuthError) return false;
    await updateChannelBrandAssets(channelId, { youtubeAuthError: { at: new Date().toISOString(), code: 'invalid_grant' } });
    console.warn(`[youtube-auth] channel ${channelId}: refresh token rejected (invalid_grant) - marked "Reconnect needed"`);
    return true;
  } catch (recordError) {
    console.error('[youtube-auth] could not record the auth failure:', recordError);
    return false;
  }
}

export async function clearYoutubeAuthFailure(channelId: string): Promise<void> {
  try {
    const channel = await findChannelById(channelId);
    if (channel?.brandAssets.youtubeAuthError) await updateChannelBrandAssets(channelId, { youtubeAuthError: undefined });
  } catch (error) {
    console.error('[youtube-auth] could not clear the auth failure:', error);
  }
}
