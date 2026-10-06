import type { ChannelProfileData } from './schema';
import { DEFAULT_TTS_VOICE } from '../media';

// Sprint 4 Task 1 (R3): the one shared resolver every later Sprint 4 task
// reads. Pure and DB-free (same posture as media/registry.ts resolveVoice):
// callers load the channel, profile version and run once and pass them in.
// Precedence per field: run override -> profile -> legacy Channel field ->
// platform default. It cannot throw: every field has a fallback.
//
// A channel with no profile (profile: null) resolves exactly as before this
// task existed: legacy styleGuide / defaultVoice, today's platform defaults.

export type ResolvedChannelConfig = {
  scriptGuide: string | null;
  targetSeconds: number; // platform default 45
  bannedOpeners: string[];
  bannedEndings: string[];
  // Platform default 'brief-plus-common': today's script prompt already lets
  // the model use general knowledge alongside the brief.
  factPolicy: 'brief-only' | 'brief-plus-common';
  visualDefaultSource: 'stock-footage' | 'ai-stills' | null;
  visualStylePrompt: string | null;
  visualNegativePrompt: string | null;
  audioDefaultVoice: string; // always concrete, like resolveVoice
  audioDefaultMoodTag: string | null;
  titleGuidance: string | null;
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
  legacyStyleGuide: string | null; // Channel.styleGuide
  legacyDefaultVoice: string | null; // Channel.defaultVoice
  runOverrideVoice?: string | null; // PipelineRun.creationOptions.voice
  runOverrideVisualSource?: string | null; // creationOptions.visualSource
  runOverrideAudioLayer?: string | null; // creationOptions.audioLayer
  runOverrideTargetSeconds?: number | null; // creationOptions.targetDurationSec
}): ResolvedChannelConfig {
  const p = params.profile ?? {};
  return {
    scriptGuide: p.script?.guide ?? params.legacyStyleGuide ?? null,
    targetSeconds: params.runOverrideTargetSeconds ?? p.script?.targetSeconds ?? 45,
    bannedOpeners: p.script?.bannedOpeners ?? [],
    bannedEndings: p.script?.bannedEndings ?? [],
    factPolicy: p.script?.factPolicy ?? 'brief-plus-common',
    visualDefaultSource:
      (params.runOverrideVisualSource as ResolvedChannelConfig['visualDefaultSource'] | null | undefined) ??
      p.visual?.defaultSource ??
      null,
    visualStylePrompt: p.visual?.stylePrompt ?? null,
    visualNegativePrompt: p.visual?.negativePrompt ?? null,
    audioDefaultVoice:
      params.runOverrideVoice ?? p.audio?.defaultVoice ?? params.legacyDefaultVoice ?? DEFAULT_TTS_VOICE,
    audioDefaultMoodTag: params.runOverrideAudioLayer ?? p.audio?.defaultMoodTag ?? null,
    titleGuidance: p.packaging?.titleGuidance ?? null,
    descriptionTemplate: p.packaging?.descriptionTemplate ?? null,
    hashtagsBase: p.packaging?.hashtagsBase ?? [],
    editorCredit: p.packaging?.editorCredit ?? false,
    selfDeclaredMadeForKids: p.packaging?.selfDeclaredMadeForKids ?? false,
    categoryId: p.packaging?.categoryId ?? null,
    defaultLanguage: p.packaging?.defaultLanguage ?? null,
  };
}
