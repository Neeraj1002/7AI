import { z } from 'zod';

// This project's own Publishing request/response types — never the
// underlying provider's. Mirrors studio/src/media/types.ts's shape.

export const PublishingMetadataSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(1),
  tags: z.array(z.string()).min(1),
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

export type UploadParams = {
  videoPath: string;
  metadata: PublishingMetadata;
  privacyStatus: PrivacyStatus;
};

export type UploadResult = {
  youtubeVideoId: string;
  privacyStatus: PrivacyStatus;
};
