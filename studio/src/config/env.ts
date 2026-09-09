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
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

export const env = parsed.data;
