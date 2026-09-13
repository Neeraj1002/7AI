import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().optional().default(''),
  OPENAI_API_KEY: z.string().optional().default(''),
  TELEGRAM_BOT_TOKEN: z.string().optional().default(''),
  TELEGRAM_FOUNDER_CHAT_ID: z.string().optional().default(''),
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
  // Week 4 Task 1 (studio/src/stock-footage/) — real stock-footage search/download.
  PEXELS_API_KEY: z.string().optional().default(''),
  // Testing-only: when '1', studio/src/stock-footage/ uses a stub instead of a
  // real Pexels call — no PEXELS_API_KEY has existed in any session so far.
  // Same pattern as MEDIA_STUB.
  STOCK_FOOTAGE_STUB: z.string().optional().default(''),
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
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

export const env = parsed.data;
