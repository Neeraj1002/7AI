import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { env } from '../config/env';
import { getSystemInfo, readFlags, resetCommitCacheForTests, resolveCommit } from './system-info';

const R2_VARS = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_ENDPOINT'] as const;

describe('admin system info', () => {
  const saved = {
    openai: env.OPENAI_API_KEY,
    r2: Object.fromEntries(R2_VARS.map((k) => [k, env[k]])) as Record<(typeof R2_VARS)[number], string>,
    gitCommit: process.env.GIT_COMMIT,
  };

  beforeEach(() => {
    resetCommitCacheForTests();
    delete process.env.GIT_COMMIT;
  });

  afterEach(() => {
    env.OPENAI_API_KEY = saved.openai;
    for (const k of R2_VARS) env[k] = saved.r2[k];
    if (saved.gitCommit === undefined) delete process.env.GIT_COMMIT;
    else process.env.GIT_COMMIT = saved.gitCommit;
    resetCommitCacheForTests();
  });

  it('never leaks a secret value and every flag is a boolean', async () => {
    env.OPENAI_API_KEY = 'sk-test-123';
    env.R2_SECRET_ACCESS_KEY = 'fake-r2-secret-xyz';
    env.R2_ACCOUNT_ID = 'fake-account';
    env.R2_ACCESS_KEY_ID = 'fake-access';
    env.R2_BUCKET = 'fake-bucket';
    env.R2_ENDPOINT = 'https://fake-endpoint.example.test';
    const info = await getSystemInfo(async () => 'abc1234\n');
    const text = JSON.stringify(info);
    for (const secret of ['sk-test-123', 'fake-r2-secret-xyz', 'fake-access', 'fake-bucket', 'fake-endpoint', 'fake-account']) {
      expect(text).not.toContain(secret);
    }
    expect(Object.values(info.flags).every((v) => typeof v === 'boolean')).toBe(true);
    expect(Object.keys(info.flags).sort()).toEqual(
      ['aiVisualsStub', 'mediaStub', 'openaiConfigured', 'r2Configured', 'stockFootageStub', 'youtubeOauthConfigured'],
    );
    expect(info.flags.openaiConfigured).toBe(true);
    expect(info.commit).toBe('abc1234');
    expect(typeof info.uptimeSeconds).toBe('number');
    expect(typeof info.bootedAt).toBe('string');
  });

  it('r2Configured flips when one R2 variable is cleared', () => {
    for (const k of R2_VARS) env[k] = `fake-${k}`;
    expect(readFlags().r2Configured).toBe(true);
    env.R2_BUCKET = '';
    expect(readFlags().r2Configured).toBe(false);
  });

  it('commit is null when git is unavailable, and never throws', async () => {
    expect(await resolveCommit(async () => Promise.reject(new Error('git not found')))).toBeNull();
    resetCommitCacheForTests();
    expect(await resolveCommit(async () => 'not a hash at all')).toBeNull();
  });

  it('prefers GIT_COMMIT from the deploy and caches the first answer', async () => {
    process.env.GIT_COMMIT = 'deadbee';
    expect(await resolveCommit(async () => 'ffffff')).toBe('deadbee');
    delete process.env.GIT_COMMIT;
    expect(await resolveCommit(async () => 'ffffff')).toBe('deadbee');
  });

  it('reads the real short hash through git when no runner is injected', async () => {
    const commit = await resolveCommit();
    // null only when git is missing from PATH; a hash otherwise
    expect(commit === null || /^[0-9a-f]{4,40}$/i.test(commit)).toBe(true);
  });
});
