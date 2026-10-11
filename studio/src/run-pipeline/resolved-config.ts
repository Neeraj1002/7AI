import { resolveChannelConfig, type ResolvedChannelConfig } from '../channel-profile';
import { findProfileVersionById } from '../models/repositories/channel-profile-version.repository';
import type { Channel, PipelineRun } from '../types';

// Sprint 4 Task 2: loads the profile the run was created against (its own
// snapshotted profileVersionId, never the channel current active one) and
// resolves the full config for it. A run with no snapshot resolves from
// legacy channel fields and platform defaults.
export async function loadResolvedConfig(
  run: Pick<PipelineRun, 'profileVersionId' | 'creationOptions'>,
  channel: Pick<Channel, 'styleGuide' | 'defaultVoice'>,
): Promise<ResolvedChannelConfig> {
  const version = run.profileVersionId ? await findProfileVersionById(run.profileVersionId) : null;
  return resolveChannelConfig({
    profile: version?.data ?? null,
    legacyStyleGuide: channel.styleGuide,
    legacyDefaultVoice: channel.defaultVoice,
    runOverrideVoice: run.creationOptions?.voice,
    runOverrideVisualSource: run.creationOptions?.visualSource,
    runOverrideAudioLayer: run.creationOptions?.audioLayer,
    runOverrideTargetSeconds: run.creationOptions?.targetDurationSec,
    runOverrideVideoKind: run.creationOptions?.videoKind,
    formatKey: run.creationOptions?.formatKey,
  });
}
