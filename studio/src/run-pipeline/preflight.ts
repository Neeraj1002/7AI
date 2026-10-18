import { probeLLMProvider } from '../llm';
import { assertSupportedVoice, probeMedia } from '../media';
import { pickAudioBedTracks, type MoodTag } from '../audio-bed';
import { MOOD_TAGS } from '../audio-bed/types';
import { getStageErrorContext, recoverableFailureKind } from './retry-with-backoff';
import { estimateRunCost } from './cost-estimate';
import { YOUTUBE_RECONNECT_MESSAGE } from '../manage-channels/youtube-auth-health';
import type { VideoKind } from '../formats/manifest';

// Sprint 5 Task 8 (R2): one check, run at the start of a run and before each paid stage, that finds
// the settings and accounts a stage depends on while nothing has been spent yet. A failed check
// stops the stage with a plain message that names the setting to change; the run waits in Needs
// attention (a Retry that passes the check does not count against the manual retry limit).
//
// Pure apart from the injected `deps`, so each check is tested without a network or a database.

export type PreflightStage = 'intake' | 'video_generation' | 'publishing';

export type PreflightCheck = 'voice' | 'provider' | 'music' | 'youtube' | 'budget';

export type PreflightIssue = {
  check: PreflightCheck;
  // The setting the person changes (or the account they fix) to clear it.
  setting: string;
  message: string;
};

export type ProviderName = 'anthropic' | 'openai';

export type PreflightDeps = {
  // Throws when the provider would refuse a paid call. The error context carries recoveryKind.
  probeProvider: (provider: ProviderName) => Promise<void>;
  // The music tracks of a mood; throws a plain error when none is usable (missing file, no licence).
  musicTracks: (mood: MoodTag) => Array<{ filePath: string; label: string }>;
  // What the run has already spent, from the ledger.
  spentUsd: () => Promise<number>;
};

export type PreflightInput = {
  stage: PreflightStage;
  voice: string | null | undefined;
  videoKind: VideoKind;
  targetSeconds: number;
  secondsPerStill?: number | null;
  audioLayer: string | null | undefined;
  maxCostUsd?: number;
  // Whether the run publishes to YouTube at the end (every run does today).
  publishes: boolean;
  youtube: { connected: boolean; needsReconnect: boolean };
  // Providers this stage will call.
  providers: ProviderName[];
};

const PROVIDER_LABEL: Record<ProviderName, string> = { anthropic: 'Anthropic', openai: 'OpenAI' };

// Providers each stage calls, used by the caller to build PreflightInput.providers.
export const STAGE_PROVIDERS: Record<PreflightStage, ProviderName[]> = {
  intake: ['anthropic'],
  video_generation: ['openai', 'anthropic'],
  publishing: [],
};

const PROBE_OK_TTL_MS = 10 * 60 * 1000;
const probeOkAt = new Map<ProviderName, number>();

export function resetProbeCache(): void {
  probeOkAt.clear();
}

export const defaultPreflightDeps: Omit<PreflightDeps, 'spentUsd'> = {
  probeProvider: async (provider) => {
    const cached = probeOkAt.get(provider);
    if (cached && Date.now() - cached < PROBE_OK_TTL_MS) return;
    if (provider === 'anthropic') await probeLLMProvider();
    else await probeMedia();
    probeOkAt.set(provider, Date.now());
  },
  musicTracks: (mood) => pickAudioBedTracks(mood),
};

function describeProviderProblem(provider: ProviderName, error: unknown): PreflightIssue | null {
  const kind = recoverableFailureKind(error);
  const context = getStageErrorContext(error);
  const providerMessage = typeof context?.providerErrorMessage === 'string' ? context.providerErrorMessage : error instanceof Error ? error.message : String(error);
  const label = PROVIDER_LABEL[provider];
  if (kind === 'provider_capacity') {
    return {
      check: 'provider',
      setting: `${label} account limit`,
      message: `${label} will not take new work right now: ${providerMessage} Nothing was spent. Add credit or raise the limit, or wait until it returns, then tap Retry.`,
    };
  }
  if (kind === 'provider_auth') {
    return {
      check: 'provider',
      setting: `${label} API key`,
      message: `${label} rejected our API key: ${providerMessage} Nothing was spent. Fix the key, then tap Retry.`,
    };
  }
  // A busy provider or a network blip is not a reason to stop a run before it starts: the stage's
  // own retries handle it.
  return null;
}

export async function runPreflight(input: PreflightInput, deps: PreflightDeps): Promise<PreflightIssue[]> {
  const issues: PreflightIssue[] = [];

  // 1. Voice against its speech model.
  if (input.stage !== 'publishing') {
    try {
      assertSupportedVoice(input.voice);
    } catch (error) {
      issues.push({ check: 'voice', setting: 'Voice', message: `${(error as Error).message} Nothing was spent.` });
    }
  }

  // 2. Provider availability and quota.
  for (const provider of input.providers) {
    try {
      await deps.probeProvider(provider);
    } catch (error) {
      const issue = describeProviderProblem(provider, error);
      if (issue) issues.push(issue);
    }
  }

  // 3. Music: the chosen mood has licensed, present tracks. The bed loops with a crossfade, so a
  //    short track is not an error; a missing or unlicensed one is.
  if (input.stage === 'video_generation' && input.audioLayer && input.audioLayer !== 'none') {
    if (!(MOOD_TAGS as readonly string[]).includes(input.audioLayer)) {
      issues.push({ check: 'music', setting: 'Music', message: `Music mood '${input.audioLayer}' does not exist. Pick one of: ${MOOD_TAGS.join(', ')}.` });
    } else {
      try {
        deps.musicTracks(input.audioLayer as MoodTag);
      } catch (error) {
        issues.push({ check: 'music', setting: 'Music', message: `${(error as Error).message} Pick another music mood or add the track.` });
      }
    }
  }

  // 4. YouTube connection when the run publishes.
  if (input.publishes && (input.stage === 'publishing' || input.stage === 'intake')) {
    if (!input.youtube.connected) {
      issues.push({ check: 'youtube', setting: 'YouTube connection', message: 'This channel is not connected to YouTube. Connect it in Channel settings, then tap Retry.' });
    } else if (input.youtube.needsReconnect) {
      issues.push({ check: 'youtube', setting: 'YouTube connection', message: YOUTUBE_RECONNECT_MESSAGE });
    }
  }

  // 5. The estimate against the spend limit. Only a long video has a limit.
  if (input.videoKind === 'long' && input.maxCostUsd !== undefined && input.stage !== 'publishing') {
    const estimate = estimateRunCost({ videoKind: 'long', targetSeconds: input.targetSeconds, secondsPerStill: input.secondsPerStill });
    const spent = await deps.spentUsd();
    const stillToSpend = input.stage === 'video_generation' ? estimate.breakdown.stillsUsd + estimate.breakdown.narrationUsd + estimate.breakdown.transcriptionUsd : estimate.estimateUsd;
    if (spent + stillToSpend > input.maxCostUsd) {
      issues.push({
        check: 'budget',
        setting: 'Spend limit',
        message: `This video has used $${spent.toFixed(2)} and the next step is estimated at $${stillToSpend.toFixed(2)}, which is over its $${input.maxCostUsd.toFixed(2)} limit. Raise the limit and tap Retry. Nothing new was spent.`,
      });
    }
  }

  return issues;
}

export function describePreflightIssues(issues: PreflightIssue[]): string {
  return `Stopped before spending anything: ${issues.map((i) => i.message).join(' ')}`;
}
