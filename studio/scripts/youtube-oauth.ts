// One-time helper: obtains a YouTube OAuth refresh token for channel #1.
//
// Per SCHEMA.md Section 2, raw OAuth credentials are NOT stored on the Channel
// row for Week 1 — they live in .env.local as a stopgap until a second channel
// makes env-var-per-channel unworkable (AgentCredential table, Week 2+).
//
// Prerequisites (founder-owned, see execution/week1/reports/task7-youtube-setup.md):
//   1. A Google Cloud project with the YouTube Data API v3 enabled.
//   2. An OAuth 2.0 Client ID (type "Desktop app" or "Web application" with
//      http://localhost:3000/oauth2callback registered as a redirect URI).
//   3. YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REDIRECT_URI set in .env.local.
//
// Usage: npx tsx scripts/youtube-oauth.ts
// Opens a local server, prints a consent URL to visit, then prints the
// resulting refresh token to paste into .env.local as YOUTUBE_REFRESH_TOKEN.

import http from 'node:http';
import { URL } from 'node:url';
import { OAuth2Client } from 'google-auth-library';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const REDIRECT_URI = process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:3000/oauth2callback';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
];

async function main(): Promise<void> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      'YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET not set in .env.local. Create an OAuth client in Google Cloud Console first — see execution/week1/reports/task7-youtube-setup.md.',
    );
  }

  const redirectUrl = new URL(REDIRECT_URI);
  const port = Number(redirectUrl.port || 3000);

  const client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // forces a refresh_token even on repeat runs
    scope: SCOPES,
  });

  console.log('\nOpen this URL in a browser signed into the YouTube channel #1 Google account:\n');
  console.log(authUrl);
  console.log(`\nWaiting for the OAuth redirect on ${REDIRECT_URI} ...\n`);

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url) return;
      const url = new URL(req.url, REDIRECT_URI);
      const authCode = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        res.end(`OAuth error: ${error}. You can close this tab.`);
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }
      if (authCode) {
        res.end('Authorization received — you can close this tab and return to the terminal.');
        server.close();
        resolve(authCode);
      }
    });
    server.listen(port);
  });

  const { tokens } = await client.getToken(code);
  console.log('\nSuccess. Add this to .env.local:\n');
  console.log(`YOUTUBE_REFRESH_TOKEN="${tokens.refresh_token}"`);

  if (tokens.access_token) {
    client.setCredentials(tokens);
    console.log('\nSanity-checking the token with a trivial authenticated call (channels.list mine=true)...');
    const res = await client.request({
      url: 'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
    });
    console.log('API call succeeded:', JSON.stringify(res.data, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
