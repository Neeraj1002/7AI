import type { ChannelProfileData } from './schema';
import { DEFAULT_TTS_VOICE } from '../media';
import { findFormat, type VideoKind } from '../formats/manifest';
import { LONG_DEFAULT_SEC, SHORT_DEFAULT_SEC, SHORT_MAX_SEC } from '../formats/video-kind';

// Sprint 4 Task 1 (R3): the one shared resolver every later Sprint 4 task
// reads. Pure and DB-free (same posture as media/registry.ts resolveVoice):
// callers load the channel, profile version and run once and pass them in.
// Precedence per field: run override -> profile -> platform default. It cannot throw: every field has a fallback.
//
// A channel with no profile (profile: null) resolves to no script guide and
// today's platform defaults (the old Channel.styleGuide / defaultVoice
// fallback is retired; the profile owns both).

export type ResolvedChannelConfig = {
  scriptGuide: string | null;
  // Sprint 4 Task 6: the chosen format's structural hint, null when no valid format.
  formatScriptStructure: string | null;
  // Sprint 4 Task 9 (R1): run override, else the chosen format's kind, else 'short'.
  videoKind: VideoKind;
  // Short: platform default 45, never above 60. Long: platform default 600.
  targetSeconds: number;
  // Sprint 4 Task 9 (R1b): the formats this channel offers, in order; [] when none.
  offeredFormatKeys: string[];
  bannedOpeners: string[];
  bannedEndings: string[];
  // Platform default 'brief-plus-common': today's script prompt already lets
  // the model use general knowledge alongside the brief.
  factPolicy: 'brief-only' | 'brief-plus-common';
  visualDefaultSource: 'stock-footage' | 'ai-stills' | null;
  visualStylePrompt: string | null;
  visualNegativePrompt: string | null;
  visualSecondsPerStill: number | null; // Task 3 R10; null = Task 8 platform default
  audioDefaultVoice: string; // always concrete, like resolveVoice
  audioDefaultMoodTag: string | null;
  titleGuidance: string | null;
  // Sprint 6 Task 3: the optional line describing the story tests' cold reader; null means the platform's neutral reader.
  readerPersona: string | null;
  descriptionTemplate: string | null;
  hashtagsBase: string[];
  editorCredit: boolean;
  // R18 (Task 5): platform defaults matter here, since unset is a real upload gap.
  selfDeclaredMadeForKids: boolean; // platform default false, never left unset
  categoryId: string | null;
  defaultLanguage: string | null;
};

export function resolveChannelConfig(params: {
  profile: ChannelProfileData | null; // the run's (or channel's active) profile version data
  runOverrideVoice?: string | null; // PipelineRun.creationOptions.voice
  runOverrideVisualSource?: string | null; // creationOptions.visualSource
  runOverrideAudioLayer?: string | null; // creationOptions.audioLayer
  runOverrideTargetSeconds?: number | null; // creationOptions.targetDurationSec
  runOverrideVideoKind?: VideoKind | null; // creationOptions.videoKind
  formatKey?: string | null; // creationOptions.formatKey; unknown keys are ignored
}): ResolvedChannelConfig {
  const p = params.profile ?? {};
  const found = findFormat(params.formatKey);
  const videoKind: VideoKind = params.runOverrideVideoKind ?? found?.videoKind ?? 'short';
  // A format of the other kind contributes nothing (runs.create rejects that mix).
  const format = found && found.videoKind === videoKind ? found : undefined;
  // The profile's script.targetSeconds is a Shorts setting (15-60 s).
  const profileSeconds = videoKind === 'short' ? p.script?.targetSeconds : undefined;
  const rawSeconds =
    params.runOverrideTargetSeconds ??
    format?.targetSeconds ??
    profileSeconds ??
    (videoKind === 'long' ? LONG_DEFAULT_SEC : SHORT_DEFAULT_SEC);
  return {
    scriptGuide: p.script?.guide ?? null,
    formatScriptStructure: format?.scriptStructure ?? null,
    videoKind,
    targetSeconds: videoKind === 'short' ? Math.min(rawSeconds, SHORT_MAX_SEC) : rawSeconds,
    offeredFormatKeys: p.offeredFormatKeys ?? [],
    bannedOpeners: p.script?.bannedOpeners ?? [],
    bannedEndings: p.script?.bannedEndings ?? [],
    factPolicy: p.script?.factPolicy ?? 'brief-plus-common',
    visualDefaultSource:
      (params.runOverrideVisualSource as ResolvedChannelConfig['visualDefaultSource'] | null | undefined) ??
      p.visual?.defaultSource ??
      null,
    visualStylePrompt: p.visual?.stylePrompt ?? null,
    visualNegativePrompt: p.visual?.negativePrompt ?? null,
    visualSecondsPerStill: p.visual?.secondsPerStill ?? null,
    audioDefaultVoice:
      params.runOverrideVoice ?? p.audio?.defaultVoice ?? DEFAULT_TTS_VOICE,
    audioDefaultMoodTag: params.runOverrideAudioLayer ?? p.audio?.defaultMoodTag ?? null,
    titleGuidance: p.packaging?.titleGuidance ?? null,
    readerPersona: p.storyTests?.readerPersona?.trim() || null,
    descriptionTemplate: p.packaging?.descriptionTemplate ?? null,
    hashtagsBase: p.packaging?.hashtagsBase ?? [],
    editorCredit: p.packaging?.editorCredit ?? false,
    selfDeclaredMadeForKids: p.packaging?.selfDeclaredMadeForKids ?? false,
    categoryId: p.packaging?.categoryId ?? null,
    defaultLanguage: p.packaging?.defaultLanguage ?? null,
  };
}
