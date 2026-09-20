# Sprint 3 Task 5: Per-Channel YouTube OAuth — `AgentCredential` + Real Connect Flow

**Date**: 2026-09-20
**Status**: Complete — one real founder-action item remains (M2/M3's live blocker, see below)
**Files Created**: 8 (7 code/migration + this report)
**Files Modified**: 16
**Tests**: All Passing (`npm run build && npm run lint && npm run typecheck && npm test` — 109 tests,
all clean)

## Read this first

M1 and M2's connect-URL generation are **fully verified, live, real** — no caveats. M3's code
migration is complete and structurally airtight (no code path can read the old env var anymore for a
real call). But **the task's own core success criterion — "a real publish and a real stats poll both
succeed with `YOUTUBE_REFRESH_TOKEN` unset" — is honestly not provable right now**, for a real,
external reason found during this task's own live verification: **the founder's existing YouTube
refresh token is expired or revoked at Google's end**, confirmed independently of this project's code
by posting it directly to Google's own token endpoint. This is not a bug in this task's migration.
Closing it needs one real founder action — see `KNOWN_ISSUES_AND_BLOCKERS.md` §1.

## What Was Done

### M1 — `AgentCredential` table, encrypted at rest

New table (migration `sprint3_agent_credentials`): `id`, `channelId` (unique FK, plus compound
`@@unique([channelId, platform])` per the task's own spec), `platform` (`VarChar(20)` + `CHECK`,
currently only `'youtube'`), `refreshTokenEncrypted` (`Text`), `encryptionKeyVersion` (`Int`, default
1), timestamps. AES-256-GCM via Node's built-in `crypto` (no new dependency) —
`models/credential-crypto.ts` exports only `encryptRefreshToken`/`decryptRefreshToken`, keyed off a
new required env var `CREDENTIAL_ENCRYPTION_KEY` (32 random bytes, base64; generate with
`openssl rand -base64 32`). Stored format: `base64(iv(12) || authTag(16) || ciphertext)`.
`models/repositories/agent-credential.repository.ts` — `findByChannel`, `upsertForChannel` (encrypts
on write), `deleteForChannel`, plus `findDecryptedRefreshTokenForChannel` (one function beyond the
task's literal 3-function list — justified: all three of M3's client modules need "give me this
channel's real decrypted token or null," and this avoids duplicating decrypt-and-null-check logic
three times across two agent directories).

### M2 — Real per-channel OAuth connect flow

`channels.getYoutubeConnectUrl` (session-authenticated; ownership-checked via Task 2's own
`canResolveGate`, reused directly — connecting a credential is at least as sensitive as resolving a
gate) builds the exact same `generateAuthUrl` call `scripts/youtube-oauth.ts` already used
(`youtube.upload`/`youtube.readonly`, `access_type: offline`, `prompt: consent`), with the target
`channelId` signed into OAuth's `state` parameter as a new, short-lived (10 min) `purpose:
'oauth-state'` JWT — sharing `JWT_SECRET` with the existing magic-link/session tokens but never
interchangeable with either (same `purpose`-discriminator convention Task 1/J2 established).
`GET /oauth2callback` (added to `api/server.ts`'s auth-hook exemption list — a real Google redirect
can never carry our own `Authorization` header) verifies the state token and calls
`upsertForChannel`. `channels.disconnectYoutube` (same ownership check) calls `deleteForChannel` —
the design doc's own "clear disconnect path" requirement, which existed in no form before this task.

`YOUTUBE_REDIRECT_URI` stays pointed at the dev default (`http://localhost:3000/oauth2callback`) for
now; flagged plainly below and in `KNOWN_ISSUES_AND_BLOCKERS.md` that the founder must update the
registered redirect URI in Google Cloud Console once a real deployed callback URL exists.

### M3 — Migrate all three YouTube client modules off env vars

`agents/publishing/youtube-client.ts`, `agents/performance-analytics/youtube-stats-client.ts`, and
`.../youtube-analytics-client.ts` each had their own `getOAuthClient()` changed from a sync function
reading `env.YOUTUBE_REFRESH_TOKEN` to an async function taking `channelId` and calling
`findDecryptedRefreshTokenForChannel(channelId)`, throwing a clear `NonTransientStageError` ("has no
connected YouTube account") if null. Kept as three independent, near-identical implementations rather
than one shared helper — the existing, deliberate "agents don't share hidden state"
convention (`AGENT_FLEET_DESIGN.md` Principle 5) each file's own header comment already documents,
which this task's own Where section explicitly preserves.

Every call site threading a real `channelId` through already had one available:
`uploadVideoViaProvider`/`setThumbnailViaProvider` (Publishing), `fetchVideoStatsViaProvider`/
`fetchRetentionCurveViaProvider` (Performance Analytics), threaded from `runPublishingStage` and
`recordSnapshot` respectively — none of them previously passed one, since there was only ever one
implicit channel to assume. `agents/publishing/types.ts`'s `UploadParams` gained a required
`channelId`; `agents/performance-analytics/index.ts`'s `fetchVideoStats`/`fetchRetentionCurve` gained
one.

`scripts/migrate-founder-youtube-credential.ts` (new, mirrors `scripts/set-channel-default-voice.ts`'s
shape) moves the founder's own existing `env.YOUTUBE_REFRESH_TOKEN` into a real `AgentCredential` row
for their channel — run once, for real, against the founder's actual channel
(`5c6312d5-c478-47e9-959f-f9bd747dea5b`) as part of this task's own verification (see below).

## Verification — real, live, per the task's own bar

### M1 — PASS, no caveats
1. Ran `scripts/migrate-founder-youtube-credential.ts 5c6312d5-c478-47e9-959f-f9bd747dea5b` for
   real, against the founder's actual channel and actual token.
2. **Direct raw-SQL column read** (`prisma.$queryRaw`, deliberately bypassing
   `agent-credential.repository.ts`'s own decrypt path): the stored `refreshTokenEncrypted` value —
   `AptOl1D9Liy...OnmO7fMAlPtefc6DTBGf5a4l9hD4LxORyp0sHaw/63iCNyGgV7qx7HiXo6EfwDqiKlxZbjqmDh5Vk22B9BM+Y5HA=`
   — decodes to **131 raw bytes** (12-byte IV + 16-byte auth tag + ~103 ciphertext bytes, consistent
   with a real Google refresh token's length, not a fixed/dummy size) and **does not contain the real
   plaintext token as a substring** — confirmed programmatically (`.includes()` check against
   `env.YOUTUBE_REFRESH_TOKEN`, returned `false`).
3. The repository's own real decrypt path (`findDecryptedRefreshTokenForChannel`) was separately
   called and its return value compared byte-for-byte against `env.YOUTUBE_REFRESH_TOKEN` — **exact
   match**, confirming the round trip is lossless, not just "looks like ciphertext."

### M2 — connect-URL generation verified live and correct; consent completion is founder-blocked, confirmed live
1. Signed a real session JWT for a genuinely separate second tenant's real owner user (the same
   "Second Tenant Channel" `3462b504-...` created during earlier Sprint 3 verification).
2. Started the real dev API server (`npm run dev`, port 4000) and called the real
   `channels.getYoutubeConnectUrl` tRPC query with that session's `Authorization: Bearer` header
   against the real second channel. Got back a real, correctly-shaped URL: `client_id` matching
   `.env.local`'s real `YOUTUBE_CLIENT_ID`, `scope` containing exactly `youtube.upload` and
   `youtube.readonly` (URL-decoded), a real signed `state` JWT (verified structurally — three
   base64url segments), `redirect_uri` matching `.env.local`.
3. Navigated a real browser to that exact URL. It resolved to Google's real, live consent page —
   title `"Sign in - Google Accounts"`, page text `"Sign in to continue to 7AI"` — correctly
   identifying this project's real registered app name, confirming the entire chain up to that point
   (client id, redirect URI registration, scope request) is genuinely correct against Google's real
   infrastructure, not just internally self-consistent.
4. **Did not proceed past this screen.** Completing the round trip requires typing a real Google
   account's email/password and clicking "Allow" — entering account credentials on the founder's
   behalf is categorically out of scope for this agent, independent of any authorization already
   given for the rest of this task. This is a real, live-confirmed blocker, not an assumption — the
   exact same "navigate and observe the real redirect, don't assume the blocker" method Task 4's L2
   already used for the Cloud Console check.

### M3 — code migration fully verified; the "real publish/poll succeed" claim is genuinely not provable today
1. Temporarily raised the pooled `AgentQuota.budgetCeilingUsd` from $2.00 to $10.00 (cumulative real
   spend from this session's own testing had it at $1.80/$2.00, leaving no headroom for a fresh
   full pipeline run) — same documented, repeatable pattern Tasks 4/5 have already used this session.
2. Commented out `YOUTUBE_REFRESH_TOKEN` in `.env.local`.
3. Ran a complete real pipeline (`scripts/dry-run.ts setup/start/script-gen/script-review/gate1/
   video-gen/video-review/gate2/publish`) against the founder's own real channel — real Anthropic
   script-generation/review calls, real OpenAI TTS, real video assembly, both gates approved via the
   existing simulated-reply convention. Every invocation's own startup log
   (`◇ injected env (16) from .env.local`) confirmed one fewer var than the usual 17 — the env var was
   genuinely absent for the whole run, not just edited and forgotten.
4. The `publishing` stage's real attempt correctly reached Google using the migrated, decrypted,
   per-channel `AgentCredential` — **structurally the only code path available**, since M3 removed
   every read of the old env var from all three client modules — but failed with a real Google error:
   `invalid_grant`. `dry-run.ts status` showed: `"YouTube upload failed ambiguously — the request may
   have already reached YouTube before this error surfaced... invalid_grant"`.
5. **Independently confirmed the token itself is the problem, not this project's code**: posted the
   founder's exact plaintext refresh token directly to `https://oauth2.googleapis.com/token` via a
   raw `curl` call (client_id/secret from `.env.local`, no project code involved at all). Got back:
   `{"error": "invalid_grant", "error_description": "Token has been expired or revoked."}` — the
   identical error, confirmed at the source, outside any code this task touched.
6. Ran a real Performance Analytics poll tick (`scripts/dry-run.ts poll`) against every completed run
   with a published video on the founder's channel, still with the env var unset. Every attempt
   (`fetchVideoStatsViaProvider`) hit the identical real `invalid_grant` error via the identical real
   code path — the same expired credential, the same real cause, consistent behavior across both
   call sites M3 touched.
7. Because the failure occurs at the OAuth **token-refresh** step itself
   (`OAuth2Client.refreshTokenNoCache`, confirmed from the real stack trace — before any request
   reaches `videos.insert`), **no video was actually uploaded to YouTube** as a side effect of this
   test.
8. Reverted `.env.local` (`YOUTUBE_REFRESH_TOKEN` restored to its real value) and the budget ceiling
   (back to $2.00, confirmed via a direct Postgres read returning `"2"`) immediately after.

**What this proves**: the new `AgentCredential` path is genuinely what gets reached for a real call —
not a claim taken on faith from reading the code, but demonstrated by a real Google API response that
could only have been produced by the new path being exercised (the old path doesn't exist in the code
anymore to produce a *different* wrong answer). **What this does not prove**: that a real publish or
stats poll actually *succeeds* end-to-end — that's blocked on a fresh, valid credential, which is the
same real human action M2 is already blocked on.

## Files Created/Modified

- Created:
  - `studio/scripts/migrate-founder-youtube-credential.ts`
  - `studio/src/manage-channels/youtube-oauth-connect.ts`
  - `studio/src/models/credential-crypto.ts`
  - `studio/src/models/credential-crypto.test.ts`
  - `studio/src/models/repositories/agent-credential.repository.ts`
  - `studio/src/models/migrations/20260919181003_sprint3_agent_credentials/`
  - `studio/src/types/agent-credential.types.ts`
  - `docs/execution/sprint3/reports/task5.md`
- Modified:
  - `studio/src/models/schema.prisma` — `AgentCredential` model, `Channel.agentCredential` back-relation
  - `studio/src/config/env.ts` — `CREDENTIAL_ENCRYPTION_KEY`
  - `studio/.env.example` — matching placeholder + generation command
  - `studio/src/auth/types.ts` — `OAuthStateTokenPayload`
  - `studio/src/auth/jwt.ts` — `signOAuthStateToken`/`verifyOAuthStateToken`
  - `studio/src/api/routers/channels.ts` — `getYoutubeConnectUrl`, `disconnectYoutube`
  - `studio/src/api/server.ts` — `/oauth2callback` route + auth-hook exemption
  - `studio/src/agents/publishing/types.ts` — `UploadParams.channelId`
  - `studio/src/agents/publishing/youtube-client.ts` — async per-channel `getOAuthClient`
  - `studio/src/agents/publishing/youtube-client.test.ts` — mocked `agent-credential.repository`, new no-credential test
  - `studio/src/agents/publishing/index.ts` — `setThumbnail`'s `channelId` param
  - `studio/src/agents/performance-analytics/youtube-stats-client.ts` — async per-channel `getOAuthClient`
  - `studio/src/agents/performance-analytics/youtube-analytics-client.ts` — async per-channel `getOAuthClient`
  - `studio/src/agents/performance-analytics/index.ts` — `channelId` threaded through
  - `studio/src/run-pipeline/state-machine.ts` — `channelId` passed at both call sites
  - `studio/src/types/index.ts` — `agent-credential.types` export
  - `docs/execution/sprint3/SCHEMA.md`, `BUSINESS_LOGIC.md`, `STATUS.md`
  - `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md` — two new founder-action items (§1)
  - `docs/design_doc/MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md` — §1's item closed, with caveat

## Schema Changes Applied

One real migration, `20260919181003_sprint3_agent_credentials` — `agent_credentials` table (`channelId`
FK with both a field-level and a compound-with-`platform` unique constraint, a hand-added
`platform` `CHECK` constraint applied via this project's established
apply-then-fix-checksum pattern, confirmed via `prisma migrate status` reporting "Database schema is
up to date!"). See `sprint3/SCHEMA.md`.

## Test Results

```
npx tsc --noEmit -p .   -> clean
npm run lint             -> clean
npx vitest run           -> 18 test files passed (18), 109 tests passed (109)
npm run build            -> clean
```

Plus the full M1/M2/M3 real, live verification described above.

## Deviations from Spec

- **`YOUTUBE_REDIRECT_URI` was not moved to a real deployed URL** — no real deployment target exists
  yet; kept at the working dev default. Flagged explicitly as a founder-action item for whenever a
  real deployed callback URL is known (`KNOWN_ISSUES_AND_BLOCKERS.md` §1), per the task's own
  instruction.
- **M2's own Verify step ("a real, live OAuth connect for a real second test channel... stores a real,
  working credential") is not fully closed** — the connect-URL generation and Google-side app/scope
  identification are verified live and correct; the actual consent completion (typing a real Google
  account's credentials) is something this agent must not do, confirmed as a genuine live blocker
  rather than skipped for convenience.
- **M3's own Verify step ("a real publish and a real stats poll... both succeed") is not met** — not
  because of a bug in this task, but because of a real, independently-confirmed external fact (the
  founder's existing refresh token is expired/revoked at Google's end) discovered *by* this task's own
  live verification. Stated plainly per this task's own explicit instruction not to assert this
  criterion without the real test — the real test was run, and it genuinely could not succeed for a
  reason outside this task's control.
- **A real, unplanned aside during verification**: the first pipeline run attempt used an invalid
  voice key (`woman-warm`, not a real entry in `media/registry.ts`'s `TTS_VOICES`) — a real input
  mistake on this agent's part while constructing the verification run, not a Task 5 finding. Caught
  immediately via the real OpenAI `400` error, and the run was simply redone with a valid key
  (`nova`); the failed run (`8c1ae3f7-...`) was left as-is in the DB (a genuine, harmless artifact of
  real testing, same as every other `needs_attention` run already in this environment from prior
  sessions).

## Sign-Off

- Task Objective: **Substantially met, with one real founder-action item honestly carried forward.**
  M1 (encryption at rest) is fully proven live. M2 (real connect flow) is built and proven correct as
  far as this agent can verify without entering a real human's Google credentials. M3 (env-var
  retirement) is code-complete and structurally verified to have no fallback path; its own
  live-succeeds regression check surfaced a real, external blocker rather than a code defect, and that
  finding — not a guess — is what's reported here.
- Schema Impact: One real migration (`agent_credentials`). See `sprint3/SCHEMA.md`.
- Business Logic: `sprint3/BUSINESS_LOGIC.md` updated with the full M1/M2/M3 design and the complete,
  honest verification narrative, including the real external finding.
- Tests: Passing (109/109), plus the real, live M1/M2/M3 verification described above.
- Ready for Integration: Yes, for the code itself. Not fully closed end-to-end until the founder
  completes one real Google consent — tracked explicitly in `KNOWN_ISSUES_AND_BLOCKERS.md` §1, not
  silently left for someone else to rediscover.
