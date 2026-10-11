import { execFile } from 'node:child_process';
import { env } from '../config/env';
import { isR2Configured } from '../storage/r2-client';

// Admin Sprint 1 (R10) - what admin.system.info reports about the running server.
// Only a commit hash, a boot time and BOOLEAN flags are ever returned: no env value
// and no list of env key names.

const BOOTED_AT = new Date();
const GIT_TIMEOUT_MS = 2000;

export type SystemFlags = {
  mediaStub: boolean;
  stockFootageStub: boolean;
  aiVisualsStub: boolean;
  r2Configured: boolean;
  openaiConfigured: boolean;
  youtubeOauthConfigured: boolean;
};

// The whitelist: each flag is a boolean derived from env presence or truthiness
// (stub flags are '1' exactly as the pipeline reads them). Add a flag by adding a
// line here; nothing else in env can reach a response.
export const SYSTEM_FLAGS: { [K in keyof SystemFlags]: () => boolean } = {
  mediaStub: () => env.MEDIA_STUB === '1',
  stockFootageStub: () => env.STOCK_FOOTAGE_STUB === '1',
  aiVisualsStub: () => env.AI_VISUALS_STUB === '1',
  // true only if every R2 variable the storage code needs is non-empty
  r2Configured: () => isR2Configured(),
  openaiConfigured: () => Boolean(env.OPENAI_API_KEY),
  youtubeOauthConfigured: () => Boolean(env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET),
};

export function readFlags(): SystemFlags {
  return Object.fromEntries(Object.entries(SYSTEM_FLAGS).map(([k, f]) => [k, f()])) as SystemFlags;
}

export type GitRunner = () => Promise<string>;

const runGitShortHead: GitRunner = () =>
  new Promise((resolve, reject) => {
    execFile('git', ['rev-parse', '--short', 'HEAD'], { timeout: GIT_TIMEOUT_MS, windowsHide: true }, (error, stdout) =>
      error ? reject(error) : resolve(stdout),
    );
  });

let cachedCommit: { value: string | null } | null = null;

// GIT_COMMIT if the deploy sets it; otherwise `git rev-parse --short HEAD` once, with a
// 2 second timeout, cached for the life of the process; null if neither works. Never throws.
export async function resolveCommit(runGit: GitRunner = runGitShortHead): Promise<string | null> {
  if (cachedCommit) return cachedCommit.value;
  const fromEnv = process.env.GIT_COMMIT?.trim();
  if (fromEnv) {
    cachedCommit = { value: fromEnv.slice(0, 40) };
    return cachedCommit.value;
  }
  let value: string | null;
  try {
    const out = (await runGit()).trim();
    value = /^[0-9a-f]{4,40}$/i.test(out) ? out : null;
  } catch {
    value = null;
  }
  cachedCommit = { value };
  return value;
}

export function resetCommitCacheForTests(): void {
  cachedCommit = null;
}

export async function getSystemInfo(runGit?: GitRunner) {
  return {
    commit: await resolveCommit(runGit),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    bootedAt: BOOTED_AT.toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    flags: readFlags(),
  };
}
