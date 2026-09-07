# Week 1 Task 7: YouTube API Quota Request + OAuth Setup

**Date**: 2026-09-07
**Status**: Code/plumbing complete. Google Cloud Console steps (project creation, quota
request submission) are **founder-owned** — per the Week 1 instructions, "Task 7's actual
quota-request submission... [is a] founder decision," since it needs your own Google
account and can't be delegated.

## What's done

- `scripts/youtube-oauth.ts` — a ready-to-run OAuth flow: opens a local callback server,
  prints a consent URL, exchanges the resulting code for tokens, sanity-checks the token
  with a trivial `channels.list` call, and prints the refresh token to save.
- `.env.example` / `.env.local` have the five `YOUTUBE_*` variables it reads.
- Per `SCHEMA.md` Section 2, credentials stay in env vars for Week 1 (no `AgentCredential`
  table yet) — a deliberate stopgap until channel #2 exists.

## What you need to do (steps 1–4 require your Google account)

### 1. Create/select a Google Cloud project
Go to [console.cloud.google.com](https://console.cloud.google.com) → create a new project
(e.g. "7AI") or reuse an existing one.

### 2. Enable the YouTube Data API v3
In the project: **APIs & Services → Library** → search "YouTube Data API v3" → **Enable**.

### 3. Configure the OAuth consent screen
**APIs & Services → OAuth consent screen**:
- User type: **External** (unless you have a Google Workspace org to use Internal).
- App name, support email, developer contact — any values, this stays in Testing mode.
- Scopes: add `youtube.upload` and `youtube.readonly` (or add them at consent time — the
  script requests both).
- Test users: add the Google account that owns channel #1 (required while the app is in
  "Testing" publishing status — unverified apps only allow test users to authorize).

### 4. Create an OAuth 2.0 Client ID
**APIs & Services → Credentials → Create Credentials → OAuth client ID**:
- Application type: **Web application**.
- Authorized redirect URI: `http://localhost:3000/oauth2callback` (must match
  `YOUTUBE_REDIRECT_URI` in `.env.local` exactly).
- Save the generated **Client ID** and **Client Secret** into `.env.local`
  (`YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`).

### 5. Run the OAuth script
```bash
npx tsx scripts/youtube-oauth.ts
```
Open the printed URL, sign in as the channel #1 account, approve. The script prints a
`YOUTUBE_REFRESH_TOKEN` — paste it into `.env.local`. It also runs one trivial
authenticated API call to confirm the token actually works.

### 6. Submit the quota increase request
**APIs & Services → YouTube Data API v3 → Quotas** (or **IAM & Admin → Quotas**, filtered to
the YouTube Data API) → select the relevant quota → **Edit Quotas** / request increase.
Google's own guidance: submit this **now**, not in Week 4 — approval has historically taken
1–2 weeks (flagged in `MVP_ROADMAP_OCT15.md` Section 14, Risk #2). The default quota
(10,000 units/day) is enough for light testing but not for daily multi-channel publishing —
each video upload costs ~1,600 units, so the default caps you at roughly 6 uploads/day
across all channels combined.

## Acceptance criteria status

- [ ] Quota increase request submitted — **pending your action** (step 6 above).
- [ ] A token can be obtained and used for a trivial authenticated API call — **code ready,
  pending your Google Cloud project/OAuth client (steps 1–5) before it can run for real.**

## Why this isn't fully done in this session

Steps 1, 3, 4, and 6 require signing into your own Google account through a browser — I
don't have access to it, and Task 7 explicitly calls out the quota submission as your call
to make, not something to automate around. Once you've done steps 1–4 and dropped the
client ID/secret into `.env.local`, step 5 (running the script) takes under a minute.

## Sign-Off

- Task Objective: Code/plumbing complete; quota submission and OAuth client creation pending your action
- Tests: `npm run build` / `npm run lint` clean (script isn't type-checked as part of `src/`, but reviewed by hand)
- Ready for Integration: Yes, once steps 1–6 above are done
