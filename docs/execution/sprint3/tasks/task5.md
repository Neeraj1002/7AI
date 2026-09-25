# Sprint 3 Task 5: Per-Channel YouTube OAuth — `AgentCredential` + Real Connect Flow

**Read `docs/execution/templates/TASK_TEMPLATE.md` in full before starting.**

**Objective**: Move YouTube OAuth credentials off the single `YOUTUBE_REFRESH_TOKEN` env var and
onto real, encrypted, per-channel storage, with a real in-app connect flow replacing the current
one-time CLI script — this is the single biggest piece of Sprint 3, per
`MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md`'s own framing ("still the biggest single piece of
work"), and the thing that actually makes "each tester connects their own YouTube channel" possible.
**Duration**: 8-12 hours
**Depends On**: Task 1 (session auth — the connect flow needs to know which user/channel is
connecting). Independent of Tasks 2-4.
**Owning Component**: Shared Schema, `agents/publishing/`, `agents/performance-analytics/`, API
layer.
**Success Criteria**: (1) A real encrypt→store→read→decrypt round trip confirms the raw refresh token
is never present in the database. (2) A real, live OAuth connect for a real second test channel
stores a real, working credential against that specific channel. (3) A real publish and a real stats
poll for the founder's original channel both succeed using its migrated `AgentCredential` row with
`YOUTUBE_REFRESH_TOKEN` unset — proving the new path is actually what's used, not a silent fallback.

## Task Requirement

`docs/execution/week1/SCHEMA.md`'s own original note, reconfirmed in `week4/SCHEMA.md`:
"`AgentCredential` is a Week 2+ task once a second channel makes env-var-per-channel unworkable —
still one channel, so still not yet." Sprint 3 is exactly that trigger. `MVP_PART2` Section 1:
"`YOUTUBE_REFRESH_TOKEN` is a single env var today, meaning every run publishes to *your* YouTube
channel. Needs OAuth tokens to move from env vars to encrypted per-Channel storage in the DB, with a
real OAuth connect flow per user... scoped to the minimum (`youtube.upload`/`youtube.readonly`, same
as now, no broader ask), with a clear disconnect path."

### M1 — `AgentCredential` table, encrypted at rest
**Where**: three separate files each independently read `env.YOUTUBE_CLIENT_ID` /
`YOUTUBE_CLIENT_SECRET` / `YOUTUBE_REFRESH_TOKEN` and each build their own near-identical
`OAuth2Client`, confirmed by reading all three: `agents/publishing/youtube-client.ts`'s
`getOAuthClient()`, `agents/performance-analytics/youtube-stats-client.ts`'s `getOAuthClient()`
(its own comment explicitly says it "duplicates a small OAuth2Client constructor rather than
importing from `studio/src/agents/publishing/`" — intentional, per Design Principle 5, agents don't
share hidden state — so this task keeps that same "three call sites, one shared lookup helper, no
cross-agent import" shape), and `agents/performance-analytics/youtube-analytics-client.ts`'s
`getOAuthClient()`.

**Schema**: `AgentCredential` (`AGENT_FLEET_DESIGN.md` §6.2's own original naming) —
`id`, `channelId` (FK), `platform` (`VarChar(20)`, matches `Channel.platform`),
`refreshTokenEncrypted` (`Text` — base64 of ciphertext + IV + auth tag), `encryptionKeyVersion`
(`Int`, default 1 — so a future key rotation doesn't require re-consenting every channel at once),
`createdAt`/`updatedAt`. `@@unique([channelId, platform])` — one credential per channel per
platform, matching `Channel`'s own `[platform, externalChannelId]` uniqueness shape.

**Fix**: AES-256-GCM via Node's built-in `crypto` module (no new dependency) — a new
`agents/publishing/credential-crypto.ts` (or a shared `models/credential-crypto.ts`, since Task 5's
Performance Analytics client also needs it — put it where both can reach it without an agent-to-agent
import) exporting only `encryptRefreshToken`/`decryptRefreshToken`, keyed off a new required env var
`CREDENTIAL_ENCRYPTION_KEY` (32 random bytes, base64 — generation instructions in the report, same
"tell the founder exactly what to generate and where it goes" treatment `.env.example` already gives
every other credential). `models/repositories/agent-credential.repository.ts` — `findByChannel`,
`upsertForChannel` (encrypts on write, matching `insertChannel`'s existing repository-owns-the-DB-
shape convention), `deleteForChannel` (Fix for M2's disconnect path).

**Verify**: a real encrypt→store→read→decrypt round trip on a realistic (test) refresh-token-shaped
string — confirm via a **direct raw column read** (not through the repository's own decrypt path)
that the stored value is genuinely ciphertext, not the plaintext token re-encoded.

### M2 — Real per-channel OAuth connect flow (replacing the CLI script)
**Where**: `scripts/youtube-oauth.ts` is the only OAuth flow that exists today — confirmed by
reading it in full: a one-time, terminal-run script that calls `client.generateAuthUrl({ scope:
['youtube.upload', 'youtube.readonly'], access_type: 'offline', prompt: 'consent' })`, prints the
URL for the founder to open manually, runs a local `http.createServer` to catch the redirect, and
prints the resulting refresh token to the terminal for hand-pasting into `.env.local`. Not reusable
per-channel (no channel target at all) and not app-triggerable (a founder-only terminal workflow).

**Fix**: `GET /channels/:id/youtube/connect` (session-authenticated, Task 1 — and ownership-checked
per Task 2's `ownerUserId`/`owner`-role rule, since connecting a credential is at least as sensitive
as resolving a gate) builds the **exact same** `generateAuthUrl` call the script already uses (same
two scopes — `youtube.upload`, `youtube.readonly`, no broader ask, per the design doc's explicit
instruction) but returns the URL for the app to redirect the browser to, with the target `channelId`
encoded into OAuth's `state` parameter (so the callback knows which channel this consent belongs to
without relying on session/cookie continuity across the Google redirect, which a mobile app's
in-app browser doesn't reliably preserve).

`GET /oauth2callback` — exchanges the code (same `client.getToken(code)` the script already does),
then calls M1's `upsertForChannel(channelId, refreshToken)` instead of printing to a terminal. A
`DELETE /channels/:id/youtube/connection` mutation calls `deleteForChannel` — the design doc's
explicit "clear disconnect path in the app" requirement, which did not exist in any form before this
task.

`YOUTUBE_REDIRECT_URI` moves from the script's dev-only `http://localhost:3000/oauth2callback`
default to the real deployed API's own callback route — **flag explicitly in the report** that the
founder must also update the registered redirect URI in the Google Cloud Console's OAuth client
settings, the same "external console step, hand this off" posture Week 1 Task 7 and Sprint 3 Task
4/L2 both already use for founder-only steps this task's code can't perform itself.

**Verify**: a real, live OAuth connect for a real second test channel (not the founder's original
one) — the full browser redirect round trip against Google's real consent screen, a real refresh
token stored encrypted against that exact channel's `AgentCredential` row, confirmed by a direct DB
read that the plaintext token is never present in it (M1's own check, re-run here against a real
live-obtained token rather than a synthetic one).

### M3 — Migrate all three YouTube client modules off env vars, onto `AgentCredential`
**Where**: the three `getOAuthClient()` functions named in M1.

**Fix**: each gains a `channelId` parameter, looks up that channel's `AgentCredential` via M1's
repository, decrypts, and builds the `OAuth2Client` from the real per-channel refresh token.
`YOUTUBE_CLIENT_ID`/`YOUTUBE_CLIENT_SECRET` stay env vars — they identify the OAuth **application**,
shared across every channel, not a per-user credential; only `YOUTUBE_REFRESH_TOKEN` moves.
Every call site threading a real `channelId` through already has one available (`runPublishingStage`,
Performance Analytics' poll loop, the retention-curve fetch all already operate within a known
channel's context) — none of them currently pass one to these functions, since there was only ever
one implicit channel to assume.

The founder's own existing `YOUTUBE_REFRESH_TOKEN` value is migrated once into a real
`AgentCredential` row for their channel via a small one-off script
(`scripts/migrate-founder-youtube-credential.ts`, mirroring `scripts/set-channel-default-voice.ts`'s
shape) — run once, by the founder, so their channel keeps working without re-consenting through the
new browser flow.

**Verify**: a real publish and a real stats poll, both against the founder's original channel, with
`YOUTUBE_REFRESH_TOKEN` **temporarily unset locally** — proving the new `AgentCredential` path is
genuinely what's being used, not a silent env-var fallback still doing the real work. This is the
task's single most important regression check: every other Sprint 1/2 verification of Publishing and
Performance Analytics assumed the env var; this is the first time that assumption is retired.

## Schema Impact

### Tables Created
- `agent_credentials` — `channelId` (FK, unique with `platform`), `platform`,
  `refreshTokenEncrypted`, `encryptionKeyVersion`, timestamps.

### Migration File
A real Prisma migration. The founder's-channel data migration (M3) is a separate, explicitly-run
script, not part of the schema migration itself — state both in the report.

## Business Logic / State Transition

### What this task implements
No new `PipelineRun`/`PipelineStage` states. `runPublishingStage` and Performance Analytics' poll
function each gain one new lookup (the channel's `AgentCredential`) ahead of their existing
YouTube-calling logic — every existing transition and failure-classification path (`mapGoogleError`,
`classifyAnalyticsError`) is unchanged; only where the credential itself comes from changes.

### Preconditions
A channel attempting a real (non-stub) publish or stats poll must have a real `AgentCredential` row
— a channel created without one (Task 6/O covers surfacing this state to the UI) fails the same way
`getOAuthClient()` already fails today for missing env vars, just scoped per-channel now instead of
globally.

### Postconditions
`uploadVideoViaProvider`/`fetchVideoStats`/`fetchRetentionCurve` always resolve their `OAuth2Client`
from a specific channel's own credential — never from a shared, ambient env-var value once this task
lands (the env vars stay only for the OAuth *app* identity, not a channel's actual token).

### Failure Modes & Handling
A channel with no `AgentCredential` row fails with a clear, specific `NonTransientStageError`
("this channel has no connected YouTube account — connect it via [flow]") — never a generic auth
error that reads like a code bug rather than a real "you haven't connected this channel yet" state.

### Reference
`week4/SCHEMA.md`'s original `AgentCredential` deferral note — this task is that deferred work,
picked up on schedule once a second channel makes it necessary, exactly as that note anticipated.

## Testing
```bash
npm run build && npm run lint && npm run typecheck && npm test
```
Plus M1/M2/M3's real, live verification above — this task's bar is a real second channel connected
through a real browser OAuth round trip, and the founder's original channel proven to work with the
env var removed, not mocked Google API responses alone.

## Documentation reconciliation
- `docs/execution/sprint3/SCHEMA.md`, `BUSINESS_LOGIC.md`, `STATUS.md`.
- `docs/execution/KNOWN_ISSUES_AND_BLOCKERS.md`: note the real Google Cloud Console redirect-URI
  update as a founder-action item once a real deployed callback URL is known.
- `docs/design_doc/MVP_PART2_MULTI_USER_AND_FLEXIBLE_CREATION.md`: note Section 1's per-user YouTube
  credential item as picked up by this task.

## Report Template
`execution/sprint3/reports/task5.md`, standard shape. State plainly whether the founder's channel was
actually proven to work with `YOUTUBE_REFRESH_TOKEN` unset — this is the task's core claim and must
not be asserted without the real test described in M3's Verify.
