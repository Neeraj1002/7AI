import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  OPENAI_API_KEY: z.string().optional().default(''),
  NODE_ENV: z.string().optional().default('development'),
  // Testing-only: when '1', the intake stage uses a slow no-op stub instead of a
  // real Anthropic call. Exists solely to drive the Task 4 kill-mid-stage/restart
  // resumability dry run (scripts/dry-run.ts) without needing a live API key.
  INTAKE_STAGE_STUB: z.string().optional().default(''),
  // Testing-only: when '1', studio/src/media/ uses a stub instead of real OpenAI
  // TTS/transcription calls — no OPENAI_API_KEY has been available in any
  // session so far. Same pattern as INTAKE_STAGE_STUB.
  MEDIA_STUB: z.string().optional().default(''),
  // Absolute paths to the ffmpeg/ffprobe binaries. Falls back to plain
  // 'ffmpeg'/'ffprobe' (relying on PATH) if unset — set explicitly here
  // because a freshly-installed winget package doesn't update PATH for
  // already-running shells.
  FFMPEG_PATH: z.string().optional().default('ffmpeg'),
  FFPROBE_PATH: z.string().optional().default('ffprobe'),
  // Frontend track Task 1 — the single shared token every studio/src/api/
  // request is checked against (SCHEMA.md: no session table, a lock on the
  // door, per Design Principle 10). Empty by default so the orchestrator
  // still boots without it; src/api/server.ts itself refuses to start with
  // an empty token rather than silently accepting every request.
  API_AUTH_TOKEN: z.string().optional().default(''),
  API_PORT: z.coerce.number().optional().default(4000),
  // Sprint 3 Task 1 (J2) — signs both the short-lived magic-link JWT and the
  // longer-lived session JWT. Deliberately no insecure default and no
  // ephemeral-per-process fallback (that would silently invalidate every
  // session on a restart, and this dev process restarts often) — if unset,
  // /auth/request-link and /auth/verify respond with a clear 503 rather than
  // signing with a guessable secret; the API server itself still starts
  // fine on API_AUTH_TOKEN alone (the ops/script fallback path).
  JWT_SECRET: z.string().min(32).optional(),
  // Sprint 3 Task 1 (J2) — the origin used to build the clickable
  // /auth/verify link. Defaults to localhost at API_PORT, matching this
  // project's existing "dev-only, single-operator" posture (same one the
  // permissive CORS registration in api/server.ts already states) — set a
  // real public origin once this is actually deployed somewhere testers can
  // reach.
  PUBLIC_API_BASE_URL: z.string().optional(),
  // Sprint 3 Task 5 (M1) — 32 raw bytes, base64-encoded, the AES-256-GCM key
  // encrypting every AgentCredential.refreshTokenEncrypted at rest. No
  // insecure default, same posture as JWT_SECRET — a real per-channel OAuth
  // refresh token is exactly the kind of secret this project's own design
  // doc calls out as needing "real security handling... encrypted at rest."
  // Generate with:
  //   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  // Required for real (non-stub) OAuth connect/publish/stats-poll paths —
  // models/credential-crypto.ts throws a clear error if unset rather than
  // falling back to a guessable key.
  CREDENTIAL_ENCRYPTION_KEY: z.string().optional(),
  // Week 4 Task 1 (studio/src/stock-footage/) — real stock-footage search/download.
  PEXELS_API_KEY: z.string().optional().default(''),
  // Testing-only: when '1', studio/src/stock-footage/ uses a stub instead of a
  // real Pexels call — no PEXELS_API_KEY has existed in any session so far.
  // Same pattern as MEDIA_STUB.
  STOCK_FOOTAGE_STUB: z.string().optional().default(''),
  // Sprint 2 Task 2 (E1) — studio/src/ai-visuals/. Same pattern as
  // MEDIA_STUB/STOCK_FOOTAGE_STUB: when '1', uses a deterministic local
  // stub instead of a real OpenAI image-generation call. Reuses
  // OPENAI_API_KEY (same as media/), no separate credential.
  AI_VISUALS_STUB: z.string().optional().default(''),
  // Week 4 Task 2/3 — YouTube Data API v3 (upload + statistics). Stopgap env-var
  // credentials per docs/execution/week1/SCHEMA.md Section 2 (still one channel).
  YOUTUBE_CLIENT_ID: z.string().optional().default(''),
  YOUTUBE_CLIENT_SECRET: z.string().optional().default(''),
  YOUTUBE_REDIRECT_URI: z.string().optional().default('http://localhost:3000/oauth2callback'),
  YOUTUBE_REFRESH_TOKEN: z.string().optional().default(''),
  // Testing-only: when '1', Publishing's upload and Performance Analytics'
  // stats polling both use a stub instead of a real YouTube Data API v3 call —
  // no YOUTUBE_REFRESH_TOKEN has existed in any session so far (Week 1 Task 7
  // OAuth still open). One flag, not two, since both are blocked by the exact
  // same missing credential. Same pattern as MEDIA_STUB.
  YOUTUBE_STUB: z.string().optional().default(''),
  // Sprint 2 Task 4 (G1/G2) — a SEPARATE flag from YOUTUBE_STUB above:
  // unlike Data API stats (which already work with the real credentials),
  // the YouTube Analytics API is blocked by two real, distinct founder
  // actions (KNOWN_ISSUES_AND_BLOCKERS.md §1) — enabling the API itself in
  // Google Cloud Console, and re-authorizing with the yt-analytics.readonly
  // scope. When '1', retention-curve capture uses a stub shaped like the
  // real Analytics API's documented response instead of attempting the
  // real call (which fails today, loudly and specifically — see
  // youtube-analytics-client.ts).
  YOUTUBE_ANALYTICS_STUB: z.string().optional().default(''),
  // Performance Analytics' periodic poll cadence (Section 8.3 "batch over
  // real-time"). Defaults to 6 hours; a dry-run/test invocation calls the
  // poll function directly rather than waiting on this interval.
  ANALYTICS_POLL_INTERVAL_MS: z.coerce.number().optional().default(6 * 60 * 60 * 1000),
  // Testing-only: when > 0, runPublishingStage sleeps this long after
  // checkpointing a successful upload (recordStageProgress) but before
  // completing the stage — a deliberate window to kill the process in and
  // verify resume doesn't re-upload. Zero (default) in every real run; only
  // ever set by a live Week 4 Task 4 kill/resume test.
  PUBLISHING_TEST_KILL_DELAY_MS: z.coerce.number().optional().default(0),
  // B2 fix (KNOWN_ISSUES_AND_BLOCKERS.md §2, "resume() sweeps every stale
  // running run") — resumeOnStartup() only auto-resumes a 'running'
  // PipelineRun whose latest stage was touched more recently than this
  // window; anything older is moved to needs_attention instead of being
  // re-executed automatically. Default (30 minutes) chosen from real data,
  // not guessed: the longest real video_generation attempt observed across
  // Weeks 3-5 (real TTS + real Pexels download) was ~113s; 30 minutes is
  // ~16x that, comfortable headroom for a slow network or retry backoff
  // without leaving a genuinely abandoned run sitting silently for hours.
  RESUME_STALE_WINDOW_MS: z.coerce.number().optional().default(30 * 60 * 1000),
  // Week 5 Task 3 — a "you haven't answered in a while" nudge, independent
  // of a restart. Deliberately much longer than RESUME_STALE_WINDOW_MS: an
  // automated stage stuck for 30 minutes is suspicious, but a human approval
  // legitimately can (and should be allowed to) take hours — 4 hours is a
  // reasonable "check your phone" nudge point without being spammy for a
  // founder who just hasn't gotten to it yet.
  GATE_REMINDER_THRESHOLD_MS: z.coerce.number().optional().default(4 * 60 * 60 * 1000),
  // How often the reminder check itself runs — independent of the threshold
  // above (how long a gate must have been open before it's eligible for a
  // nudge). 15 minutes keeps the nudge reasonably prompt after crossing the
  // threshold without a dedicated always-on timer.
  GATE_REMINDER_CHECK_INTERVAL_MS: z.coerce.number().optional().default(15 * 60 * 1000),
  // Sprint 2 Task 6 (I1) — how long must elapse since
  // Tenant.lastFounderDigestSentAt before another digest is due. 24h matches
  // the design doc's own "one end-of-day summary" framing.
  FOUNDER_DIGEST_INTERVAL_MS: z.coerce.number().optional().default(24 * 60 * 60 * 1000),
  // How often the checker itself runs — independent of the interval above,
  // same two-knob shape as GATE_REMINDER_CHECK_INTERVAL_MS vs.
  // GATE_REMINDER_THRESHOLD_MS. 30 minutes is frequent enough that the
  // digest fires reasonably close to the 24h mark without a dedicated timer.
  FOUNDER_DIGEST_CHECK_INTERVAL_MS: z.coerce.number().optional().default(30 * 60 * 1000),
  // Sprint 3 Task 7 (O1) — optional. Expo's push API works without an
  // access token; setting one adds enhanced push-security (per-app request
  // signing) once the founder sets up an Expo access token for this
  // project. Not required for real push delivery to already work.
  EXPO_ACCESS_TOKEN: z.string().optional(),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

export const env = parsed.data;
