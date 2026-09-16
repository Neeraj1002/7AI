import { z } from 'zod';

// This project's own Publishing request/response types — never the
// underlying provider's. Mirrors studio/src/media/types.ts's shape.

export const PublishingMetadataSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(1),
  tags: z.array(z.string()).min(1),
  // Sprint 2 Task 5 (H1) — where through the video (0 = first frame, 1 =
  // last) to grab the real custom-cover-frame thumbnail from. A sibling
  // output of the same metadata-generation call, same "extend the existing
  // cheap-tier call" principle Week 5 Task 4's C3 and Sprint 2 Task 4's G3
  // both established, since this call already reasons about the script's
  // content and is well-placed to judge which moment makes the strongest
  // cover (a hook beat, a clear visual — not mid-blink/mid-transition).
  coverFrameTimestampRatio: z.number().min(0).max(1),
});
export type PublishingMetadata = z.infer<typeof PublishingMetadataSchema>;

// Week 5 Task 5 (D2), founder direction 2026-09-14: privacy status is a real,
// per-run choice made at Gate 2 (mirroring Gate 1's approve/edit/reject
// choice), not a source-level constant someone flips and flips back. This
// replaces the old hardcoded `PRIVACY_STATUS = 'private'` from
// docs/execution/week4/BUSINESS_LOGIC.md Section 2 — the safe default stays
// private, it just stops being the only option.
export const PrivacyStatusSchema = z.enum(['private', 'unlisted', 'public']);
export type PrivacyStatus = z.infer<typeof PrivacyStatusSchema>;

export const DEFAULT_PRIVACY_STATUS: PrivacyStatus = 'private';

// Sprint 2 Task 2 (E4, folding in MVP_PART3_CONTENT_QUALITY_AND_GROWTH_LOOP.md
// §1's disclosure item): the real YouTube Data API v3 field is
// `status.containsSyntheticMedia` (a boolean), verified against Google's own
// VideoStatus API reference for this task. Not optional — every upload must
// state one way or the other; the caller (state-machine.ts) derives it
// directly from `plan.visualSource === 'ai-stills'`, never left to default.
export type UploadParams = {
  videoPath: string;
  metadata: PublishingMetadata;
  privacyStatus: PrivacyStatus;
  containsSyntheticMedia: boolean;
};

export type UploadResult = {
  youtubeVideoId: string;
  privacyStatus: PrivacyStatus;
  // Echoed back the same way privacyStatus is — a real audit trail of what
  // was actually sent, not just what was intended.
  containsSyntheticMedia: boolean;
};
