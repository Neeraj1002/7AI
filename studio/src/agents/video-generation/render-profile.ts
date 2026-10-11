import { QUALITY_SPEC } from './quality-spec';

// Sprint 4 Task 9 (R6): the output profile for each video kind. Short is exactly the values the
// Shorts render has always used (QUALITY_SPEC.video); generateVideo still reads QUALITY_SPEC
// directly, so the Shorts command does not change.
export type RenderProfile = {
  width: number;
  height: number;
  fps: number;
  burnCaptions: boolean;
  // YouTube's recommended 1080p30 bitrate ceiling; undefined = no cap (Shorts).
  maxrateKbps?: number;
  bufsizeKbps?: number;
};

export const RENDER_PROFILES: Record<'short' | 'long', RenderProfile> = {
  short: { width: QUALITY_SPEC.video.width, height: QUALITY_SPEC.video.height, fps: QUALITY_SPEC.video.fps, burnCaptions: true },
  long: { width: 1920, height: 1080, fps: 30, burnCaptions: false, maxrateKbps: 8000, bufsizeKbps: 16000 },
};

export function renderProfileFor(videoKind: 'short' | 'long'): RenderProfile {
  return RENDER_PROFILES[videoKind];
}
