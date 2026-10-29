import { DISCLAIMER_ASSET_VERSION } from './asset-spec';

// Sprint 6 Task 2 (P5): the per-run disclaimer choice as stored in PipelineRun.creationOptions.disclaimer.
// `enabled` is the only thing a person can change; the asset version is the platform asset it resolved to.
export type DisclaimerReason = 'ai-visuals' | 'imagined' | 'factual' | 'unknown';
export type DisclaimerChoice = { enabled: boolean; assetVersion: string; defaultReason: DisclaimerReason };

// The default is derived from the run itself: no channel setting, no per-channel default. On when the visuals are
// AI-generated (every Long) or the brief allows imagined passages; Off only for a purely factual brief on
// non-AI visuals; On when it cannot tell. Reads the same resolved visual source that drives the YouTube AI flag.
export function deriveDisclaimerDefault(params: { briefText: string; visualSource: string | null | undefined }): { enabled: boolean; reason: DisclaimerReason } {
  if (params.visualSource === 'ai-stills') return { enabled: true, reason: 'ai-visuals' };
  if (/\bIMAGINED:\s*\S/i.test(params.briefText)) return { enabled: true, reason: 'imagined' };
  if (params.visualSource === 'stock-footage' && /\bDOCUMENTED:\s*\S/i.test(params.briefText)) return { enabled: false, reason: 'factual' };
  return { enabled: true, reason: 'unknown' };
}

export function buildDisclaimerChoice(params: { briefText: string; visualSource: string | null | undefined; override?: boolean }): DisclaimerChoice {
  const d = deriveDisclaimerDefault(params);
  return { enabled: params.override ?? d.enabled, assetVersion: DISCLAIMER_ASSET_VERSION, defaultReason: d.reason };
}

// Runs made before this shipped have no field and render exactly as before: Off.
export function disclaimerEnabled(creationOptions: { disclaimer?: { enabled: boolean } } | null | undefined): boolean {
  return creationOptions?.disclaimer?.enabled === true;
}
