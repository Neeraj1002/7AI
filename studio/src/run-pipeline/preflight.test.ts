import { describe, it, expect, vi } from 'vitest';
import { runPreflight, describePreflightIssues, type PreflightDeps, type PreflightInput } from './preflight';
import { NonTransientStageError, TransientStageError } from './retry-with-backoff';

const deps = (over: Partial<PreflightDeps> = {}): PreflightDeps => ({
  probeProvider: vi.fn().mockResolvedValue(undefined),
  musicTracks: vi.fn().mockReturnValue([{ filePath: 'a.mp3', label: 'A' }]),
  spentUsd: vi.fn().mockResolvedValue(0),
  ...over,
});

const input = (over: Partial<PreflightInput> = {}): PreflightInput => ({
  stage: 'video_generation',
  voice: 'coral',
  videoKind: 'long',
  targetSeconds: 120,
  secondsPerStill: 5,
  audioLayer: 'inspirational',
  maxCostUsd: 1,
  publishes: true,
  youtube: { connected: true, needsReconnect: false },
  providers: ['openai', 'anthropic'],
  ...over,
});

describe('preflight (Sprint 5 Task 8 R2)', () => {
  it('passes a healthy run', async () => {
    expect(await runPreflight(input(), deps())).toEqual([]);
  });

  it('refuses an unknown voice before spend, naming the setting', async () => {
    const issues = await runPreflight(input({ voice: 'robot' }), deps());
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ check: 'voice', setting: 'Voice' });
    expect(issues[0].message).toMatch(/not supported.*Nothing was spent/);
  });

  it('accepts Ballad (its own model) and Coral', async () => {
    expect(await runPreflight(input({ voice: 'ballad' }), deps())).toEqual([]);
    expect(await runPreflight(input({ voice: 'coral' }), deps())).toEqual([]);
  });

  it('finds an exhausted provider workspace limit before the first paid call, with the provider message', async () => {
    const limit = new NonTransientStageError('capacity', undefined, {
      recoveryKind: 'provider_capacity',
      providerErrorMessage: 'You have reached your specified workspace API usage limits. You will regain access on 2026-11-01.',
    });
    const probe = vi.fn(async (p: string) => { if (p === 'anthropic') throw limit; });
    const issues = await runPreflight(input(), deps({ probeProvider: probe }));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ check: 'provider', setting: 'Anthropic account limit' });
    expect(issues[0].message).toContain('2026-11-01');
    expect(probe).toHaveBeenCalledWith('openai');
  });

  it('reports a rejected key', async () => {
    const auth = new NonTransientStageError('bad key', undefined, { recoveryKind: 'provider_auth', providerErrorMessage: 'invalid x-api-key' });
    const issues = await runPreflight(input(), deps({ probeProvider: vi.fn(async (p: string) => { if (p === 'openai') throw auth; }) }));
    expect(issues[0]).toMatchObject({ check: 'provider', setting: 'OpenAI API key' });
  });

  it('does not stop a run for a busy provider or a network blip', async () => {
    const busy = new TransientStageError('overloaded', undefined, { recoveryKind: 'rate_limit_exhausted' });
    const net = new TransientStageError('ECONNRESET');
    const probe = vi.fn(async (p: string) => { throw p === 'openai' ? busy : net; });
    expect(await runPreflight(input(), deps({ probeProvider: probe }))).toEqual([]);
  });

  it('blocks when the music mood has no usable track', async () => {
    const music = vi.fn(() => { throw new NonTransientStageError("No audio-bed track found for mood 'inspirational' in the manifest"); });
    const issues = await runPreflight(input(), deps({ musicTracks: music }));
    expect(issues[0]).toMatchObject({ check: 'music', setting: 'Music' });
    expect(issues[0].message).toContain('No audio-bed track');
  });

  it('blocks a mood that does not exist and ignores music for other stages', async () => {
    expect((await runPreflight(input({ audioLayer: 'polka' }), deps()))[0].check).toBe('music');
    const music = vi.fn();
    expect(await runPreflight(input({ stage: 'intake', providers: [] }), deps({ musicTracks: music }))).toEqual([]);
    expect(music).not.toHaveBeenCalled();
  });

  it('blocks publishing when YouTube is not connected or needs a reconnect', async () => {
    const pub = input({ stage: 'publishing', providers: [] });
    expect((await runPreflight({ ...pub, youtube: { connected: false, needsReconnect: false } }, deps()))[0]).toMatchObject({ check: 'youtube' });
    const expired = await runPreflight({ ...pub, youtube: { connected: true, needsReconnect: true } }, deps());
    expect(expired[0].message).toMatch(/expired/);
  });

  it('blocks when the next step would pass the spend limit, counting what is already spent', async () => {
    const issues = await runPreflight(input({ maxCostUsd: 0.2 }), deps({ spentUsd: vi.fn().mockResolvedValue(0.15) }));
    expect(issues[0]).toMatchObject({ check: 'budget', setting: 'Spend limit' });
    expect(issues[0].message).toMatch(/\$0\.15.*\$0\.20 limit/);
    expect(await runPreflight(input({ maxCostUsd: 1 }), deps({ spentUsd: vi.fn().mockResolvedValue(0.15) }))).toEqual([]);
  });

  it('skips the budget check for a Short (no per-video limit)', async () => {
    expect(await runPreflight(input({ videoKind: 'short', maxCostUsd: undefined }), deps())).toEqual([]);
  });

  it('says nothing was spent in the combined message', async () => {
    const issues = await runPreflight(input({ voice: 'robot' }), deps());
    expect(describePreflightIssues(issues)).toMatch(/^Stopped before spending anything:/);
  });
});
