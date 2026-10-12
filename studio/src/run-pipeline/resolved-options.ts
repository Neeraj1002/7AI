import { resolveChannelConfig, type ChannelProfileData } from '../channel-profile';
import { TTS_VOICES } from '../media';
import { findFormat, type VideoKind } from '../formats/manifest';

// Sprint 4 Task 12 (R1): what a run actually used for the settings the app shows on its tiles, and
// where each came from. Built once when the run is created, from the same resolver the pipeline
// reads, and stored in the run's creationOptions JSON (no migration). A run created before this
// has no such field; the app falls back to its own text.

export type OptionSource = 'run' | 'format' | 'profile' | 'channel' | 'default';

export type ResolvedOptions = {
  voice: { key: string; label: string; from: OptionSource };
  visualSource: { value: string; label: string; from: OptionSource };
  music: { label: string; from: OptionSource };
  targetSeconds: { value: number; from: OptionSource };
  videoKind: VideoKind;
  formatKey: string | null;
};

// Labels for the visual-source keys options.list returns (it returns the keys only).
const VISUAL_SOURCE_LABELS: Record<string, string> = { 'stock-footage': 'Stock footage', 'ai-stills': 'AI images' };

// What the user picked on the brief screen, before the resolver filled in any default.
export type RunPicks = {
  voice?: string | null;
  visualSource?: string | null;
  audioLayer?: string | null;
  targetDurationSec?: number | null;
  videoKind?: VideoKind | null;
  formatKey?: string | null;
};

export function buildResolvedOptions(params: {
  picks: RunPicks;
  profile: ChannelProfileData | null;
  legacyStyleGuide: string | null;
  legacyDefaultVoice: string | null;
}): ResolvedOptions {
  const { picks, profile } = params;
  const p = profile ?? {};
  const config = resolveChannelConfig({
    profile,
    legacyStyleGuide: params.legacyStyleGuide,
    legacyDefaultVoice: params.legacyDefaultVoice,
    runOverrideVoice: picks.voice,
    runOverrideVisualSource: picks.visualSource,
    runOverrideAudioLayer: picks.audioLayer,
    runOverrideTargetSeconds: picks.targetDurationSec,
    runOverrideVideoKind: picks.videoKind,
    formatKey: picks.formatKey,
  });
  const found = findFormat(picks.formatKey);
  const formatApplies = found !== undefined && found.videoKind === config.videoKind;

  const voiceFrom: OptionSource = picks.voice
    ? 'run'
    : p.audio?.defaultVoice
      ? 'profile'
      : params.legacyDefaultVoice
        ? 'channel'
        : 'default';

  // A long video is AI stills only (runs.create refuses stock footage for it).
  const visualValue = config.videoKind === 'long' ? 'ai-stills' : (config.visualDefaultSource ?? 'auto');
  const visualFrom: OptionSource =
    config.videoKind === 'long' ? (picks.visualSource === 'ai-stills' ? 'run' : 'default')
    : picks.visualSource ? 'run'
    : p.visual?.defaultSource ? 'profile'
    : 'default';

  const musicFrom: OptionSource = picks.audioLayer ? 'run' : p.audio?.defaultMoodTag ? 'profile' : 'default';

  const profileSeconds = config.videoKind === 'short' ? p.script?.targetSeconds : undefined;
  const secondsFrom: OptionSource = picks.targetDurationSec
    ? 'run'
    : formatApplies
      ? 'format'
      : profileSeconds
        ? 'profile'
        : 'default';

  return {
    voice: {
      key: config.audioDefaultVoice,
      label: TTS_VOICES[config.audioDefaultVoice as keyof typeof TTS_VOICES]?.label ?? config.audioDefaultVoice,
      from: voiceFrom,
    },
    visualSource: { value: visualValue, label: VISUAL_SOURCE_LABELS[visualValue] ?? 'Auto', from: visualFrom },
    music: { label: config.audioDefaultMoodTag ?? 'Auto', from: musicFrom },
    targetSeconds: { value: config.targetSeconds, from: secondsFrom },
    videoKind: config.videoKind,
    formatKey: found ? found.key : null,
  };
}
