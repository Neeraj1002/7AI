import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env';
import { signOAuthStateToken, verifyOAuthStateToken } from '../auth/jwt';
import { clearYoutubeAuthFailure } from './youtube-auth-health';
import { upsertForChannel } from '../models/repositories/agent-credential.repository';

// Sprint 3 Task 5 (M2) — the real, app-triggered replacement for
// scripts/youtube-oauth.ts's one-time terminal flow. Builds the exact same
// generateAuthUrl call the script already uses (same two scopes —
// youtube.upload, youtube.readonly, no broader ask, per the design doc's
// explicit instruction) but returns the URL for the app to open, with the
// target channelId (and the requesting userId, for a defense-in-depth
// sanity check at the callback) encoded into OAuth's own `state` parameter
// via a short-lived, signed token — not relying on session/cookie
// continuity across the Google redirect, which a mobile app's in-app
// browser doesn't reliably preserve.
//
// Lives in manage-channels/ (channel administration), not agents/publishing/
// (content production) — this is account/credential management, not an
// agent that produces pipeline output, the same distinction
// manage-channels/channel-cap.ts already draws for channel creation itself.
// Builds its own OAuth2Client rather than importing one from
// agents/publishing/youtube-client.ts, matching the established convention
// every YouTube-touching client.ts in this codebase already follows
// (agents/performance-analytics/'s two client files each do the same).

const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  // Sprint 4 Task 10 (R4.4): captions.insert needs this wider scope. It can also delete videos;
  // nothing in this codebase calls a delete endpoint. Existing channels reconnect once.
  'https://www.googleapis.com/auth/youtube.force-ssl',
];

function getAppOAuthClient(): OAuth2Client {
  if (!env.YOUTUBE_CLIENT_ID || !env.YOUTUBE_CLIENT_SECRET) {
    throw new Error(
      'YOUTUBE_CLIENT_ID/YOUTUBE_CLIENT_SECRET are not set — the OAuth application identity is shared across every channel and must be configured before any channel can connect.',
    );
  }
  return new OAuth2Client(env.YOUTUBE_CLIENT_ID, env.YOUTUBE_CLIENT_SECRET, env.YOUTUBE_REDIRECT_URI);
}

export function buildYoutubeConnectUrl(params: { channelId: string; userId: string }): string {
  const state = signOAuthStateToken({ channelId: params.channelId, userId: params.userId });
  return getAppOAuthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // forces a real refresh_token even on a repeat connect
    scope: YOUTUBE_SCOPES,
    state,
  });
}

export type ExchangeYoutubeAuthCodeResult =
  | { ok: true; channelId: string }
  | { ok: false; error: string };

// GET /oauth2callback's own real work: verify the state (proves this
// callback corresponds to a real connect request this server itself
// issued, not a forged one), exchange the real code for real tokens, and
// store the real refresh token encrypted against the exact channel the
// original request named — never a client-supplied channelId at this
// point, only what the signed state itself carries.
export async function exchangeYoutubeAuthCode(params: { code: string; state: string }): Promise<ExchangeYoutubeAuthCodeResult> {
  const statePayload = verifyOAuthStateToken(params.state);
  if (!statePayload) {
    return { ok: false, error: 'This connect link is invalid or has expired. Start the connect flow again from the app.' };
  }

  const client = getAppOAuthClient();
  const { tokens } = await client.getToken(params.code);
  if (!tokens.refresh_token) {
    return {
      ok: false,
      error:
        'Google did not return a refresh token. This can happen if the channel already granted access before — disconnect and reconnect to force a fresh consent.',
    };
  }

  await upsertForChannel(statePayload.channelId, 'youtube', tokens.refresh_token);
  await clearYoutubeAuthFailure(statePayload.channelId);
  return { ok: true, channelId: statePayload.channelId };
}
